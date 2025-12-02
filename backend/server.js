// backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/user');
const Room = require('./models/room');
const Message = require('./models/message');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');



const userSockets = {}; // { socket.id: { username, room } }
const usernameToSocket = {}; // { username: socket.id }

const app = express();

// Trust Proxy (Required for Render/Heroku)
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth', limiter);

// CORS Configuration
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:3000'];
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            // In development, you might want to allow localhost
            if (process.env.NODE_ENV !== 'production') {
                return callback(null, true);
            }
            var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json());

// Basic test route
app.get('/', (req, res) => {
    res.send('Backend is running');
});

//  Authentication Route 
app.post('/api/auth/login', [
    body('username').trim().escape(),
    body('password').trim().escape()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ msg: 'Please enter all fields' });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const payload = {
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    user: {
                        id: user.id,
                        username: user.username,
                        role: user.role
                    }
                });
            }
        );
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});




// Middleware to check if user is admin (for HTTP routes)
const isAdmin = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }
        req.user = decoded.user;
        next();
    } catch (e) {
        res.status(400).json({ msg: 'Token is not valid' });
    }
};

//  Admin Register Route 
app.post('/api/auth/register', [
    isAdmin,
    body('username').trim().escape(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 chars').trim().escape()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
        let user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        user = new User({
            username,
            password,
            role: 'user' // Default to user
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        res.json({ msg: `User ${username} created successfully` });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

//  List all rooms (for /listrooms command) 
app.get('/api/rooms', async (req, res) => {
    const rooms = await Room.find({}, 'name');
    res.json(rooms.map(r => r.name));
});

//  TEMPORARY: One-time admin setup (DELETE after first use!)
app.get('/api/init-admin', async (req, res) => {
    try {
        const adminExists = await User.findOne({ username: 'admin' });
        if (adminExists) {
            return res.json({ msg: 'Admin already exists!' });
        }

        const hashedPassword = await bcrypt.hash('admin123', 10);
        await User.create({
            username: 'admin',
            password: hashedPassword,
            role: 'admin'
        });

        res.json({ msg: 'Admin user created successfully! Now LOGIN with admin/admin123' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error creating admin', error: err.message });
    }
});

//  MongoDB connection 
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

//  Socket.io setup 
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// JWT token Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error'));
        socket.user = decoded.user; // Attach user info to socket
        next();
    });
});

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    //  Logout 
    socket.on('logout', () => {
        if (userSockets[socket.id]) {
            const { room, username } = userSockets[socket.id];
            if (room) {
                socket.to(room).emit('room-users', getUsersInRoom(room).filter(u => u !== username));
            }
            delete usernameToSocket[username];
            delete userSockets[socket.id];
        }
    });

    //  Join room with access control, user mapping, and history 
    socket.on('join-room', async ({ room, username }) => {
        const roomDoc = await Room.findOne({ name: room });
        if (!roomDoc) {
            socket.emit('join-room-error', { msg: 'Room does not exist.' });
            return;
        }
        if (!roomDoc.allowedUsers.includes(username)) {
            socket.emit('join-room-error', { msg: 'You are not allowed to join this room.' });
            return;
        }
        // Leave previous room if any
        if (userSockets[socket.id]?.room) {
            socket.leave(userSockets[socket.id].room);
        }
        socket.join(room);
        userSockets[socket.id] = { username, room };
        usernameToSocket[username] = socket.id;
        socket.emit('join-room-success', { room });

        // Fetch last 20 messages for the room, sorted oldest to newest
        const history = await Message.find({ room }).sort({ timestamp: 1 }).limit(20);
        socket.emit('room-history', history);

        io.to(room).emit('room-users', getUsersInRoom(room));
    });

    //  Leave room 
    socket.on('leave-room', ({ room, username }) => {
        if (userSockets[socket.id] && userSockets[socket.id].room === room) {
            socket.leave(room);
            delete userSockets[socket.id].room; // Remove room from userSockets
            io.to(room).emit('room-users', getUsersInRoom(room).filter(u => u !== username));
        }
    });

    //  Room message 
    socket.on('room-message', async (data) => {
        // data: { room, msg, user }
        if (userSockets[socket.id]?.room === data.room) {
            await Message.create({
                from: data.user,
                room: data.room,
                text: data.msg
            });
            io.to(data.room).emit('room-message', data);
        }
    });

    //  Direct message (DM) 
    socket.on('dm', async (data) => {
        // data: { to, from, msg }
        const targetSocketId = usernameToSocket[data.to];
        if (targetSocketId) {
            await Message.create({
                from: data.from,
                to: data.to,
                text: data.msg
            });
            io.to(targetSocketId).emit('dm', data);
            socket.emit('dm', data); // echo to sender
        } else {
            socket.emit('dm-error', { msg: `User ${data.to} is not online.` });
        }
    });

    //  DM history 
    socket.on('get-dm-history', async ({ user1, user2 }) => {
        const history = await Message.find({
            $or: [
                { from: user1, to: user2 },
                { from: user2, to: user1 }
            ]
        }).sort({ timestamp: 1 }).limit(20);
        socket.emit('dm-history', history);
    });

    //  List users in room 
    socket.on('get-users', ({ room }) => {
        socket.emit('users-list', getUsersInRoom(room));
    });

    //  Helper: get users in a room 
    function getUsersInRoom(room) {
        return Object.values(userSockets)
            .filter(u => u.room === room)
            .map(u => u.username);
    }

    //  Handling  disconnect
    socket.on('disconnect', () => {
        const user = userSockets[socket.id];
        if (user && user.room) {
            socket.to(user.room).emit('room-users', getUsersInRoom(user.room).filter(u => u !== user.username));
            delete usernameToSocket[user.username];
        }
        delete userSockets[socket.id];
        console.log('User disconnected:', socket.id);
    });

    //  Example(trial): Listen to test event
    socket.on('test', (msg) => {
        console.log('Test event received:', msg);
        socket.emit('test-reply', 'Hello from backend!');
    });
});

//  Starting server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
