# TCA - Complete Setup Guide

## Project Rebuild Complete ✅

The project has been successfully rebuilt with the following setup:

### ✅ Completed Steps

1. **Environment Setup**
   - Created `.env.example` templates for both backend and frontend
   - Created `.gitignore` to protect sensitive files
   - Created initial `.env` files for local development

2. **Dependencies Installed**
   - Backend: All dependencies installed via Yarn
   - Frontend: All dependencies installed via Yarn

### ⚠️ Next Steps Required

#### Step 1: Set Up MongoDB Atlas (Cloud Database)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up or log in
3. Create a free cluster
4. In the cluster, create a database user:
   - Go to Security → Database Access
   - Add a new database user
   - Username: `testuser`
   - Password: `testpass123` (or your own)
   - Check "Add these users to any cluster in this project"
5. Get your connection string:
   - Go to Clusters → Connect
   - Choose "Connect your application"
   - Copy the MongoDB+SRV connection string
   - Replace `<password>` with your database user password

#### Step 2: Update Backend `.env`

Edit `/workspaces/TCA/backend/.env` and update:

```
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/tca_db?retryWrites=true&w=majority
JWT_SECRET=your_jwt_secret_key_here_min_32_chars
PORT=5000
CLOUDINARY_CLOUD_NAME=optional_for_image_uploads
CLOUDINARY_API_KEY=optional_for_image_uploads
CLOUDINARY_API_SECRET=optional_for_image_uploads
```

(Image uploads are optional for basic testing)

#### Step 3: Seed the Database

Once MongoDB is connected:

```bash
cd /workspaces/TCA/backend
node seed.js
node seedRooms.js
```

This creates test users and chat rooms:
- **Users**: `abc` (pass1), `xyz` (pass2)
- **Rooms**: `gen` (users: abc, xyz), `gen2` (users: xyz, mno)

#### Step 4: Start Backend Server

```bash
cd /workspaces/TCA/backend
yarn start
```

Expected output:
```
MongoDB connected
Server running on port 5000
```

#### Step 5: Start Frontend (in new terminal)

```bash
cd /workspaces/TCA/frontend
yarn start
```

The React app will open at `http://localhost:3000`

### 📝 Testing the Application

1. Open `http://localhost:3000` in your browser
2. Use terminal commands:
   - `/login abc pass1` - Login as user "abc"
   - `/listrooms` - See available rooms
   - `/join gen` - Join the "gen" room
   - `/dm xyz` - Direct message user "xyz"
   - `/help` - See all available commands

### 🔐 Security Notes

- `.env` files are in `.gitignore` and won't be committed
- Never push actual credentials to GitHub
- Use `.env.example` as a template for your team
- For production, use platform-specific environment variables (Render, Vercel, etc.)

### 📚 Available Commands

```
/help                      - Show help
/login <user> <pass>       - Login
/listrooms                 - List rooms
/join <room>               - Join a room
/users                     - List users in current room
/dm <username>             - Start DM
/exit                      - Exit DM or leave room
/image                     - Upload image
/logout                    - Logout
/quit                      - Quit app
```

### 🐛 Troubleshooting

**MongoDB connection error**: 
- Verify MongoDB URI in `.env` is correct
- Check MongoDB cluster IP allowlist includes your IP

**Port already in use**:
- Change `PORT=5000` in backend `.env`
- Update `REACT_APP_BACKEND_URL` in frontend `.env`

**CORS errors**:
- Ensure frontend and backend URLs match
- Backend allows CORS for frontend origin

### 📦 Project Structure

```
TCA/
├── backend/
│   ├── .env              (local - not committed)
│   ├── .env.example      (template - committed)
│   ├── server.js         (main server)
│   ├── seed.js           (create test users)
│   ├── seedRooms.js      (create test rooms)
│   ├── models/           (database schemas)
│   └── package.json
├── frontend/
│   ├── .env              (local - not committed)
│   ├── .env.example      (template - committed)
│   ├── src/
│   │   ├── App.js
│   │   ├── components/
│   │   │   └── Terminal.jsx
│   │   └── socket.js
│   └── package.json
├── .gitignore            (protect secrets)
└── README.md
```
