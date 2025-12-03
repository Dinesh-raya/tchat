import React, { useLayoutEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { io } from 'socket.io-client';
import 'xterm/css/xterm.css';


const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const Terminal = () => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const socketRef = useRef(null);

    const state = useRef({
        loggedIn: false,
        username: '',
        currentRoom: '',
        inDM: false,
        dmUser: '',
        token: null,
    });





    useLayoutEffect(() => {
        if (!terminalRef.current) return;

        xtermRef.current = new XTerm({
            cursorBlink: true,
            fontFamily: 'monospace',
            fontSize: 16,
            theme: {
                background: '#1e1e1e',
                foreground: '#00ff00'
            }
        });
        fitAddonRef.current = new FitAddon();
        xtermRef.current.loadAddon(fitAddonRef.current);

        const container = terminalRef.current;
        xtermRef.current.open(container);
        fitAddonRef.current.fit();
        xtermRef.current.focus();

        let inputBuffer = '';

        const getPrompt = () => {
            if (state.current.inDM) {
                return `[DM:${state.current.dmUser}] > `;
            } else if (state.current.currentRoom) {
                return `[${state.current.currentRoom}] > `;
            } else if (state.current.loggedIn) {
                return `[${state.current.username}] > `;
            }
            return '> ';
        };
        const writePrompt = () => {
            xtermRef.current.write(getPrompt());
        };

        writePrompt();

        function handleCommand(cmd) {
            const [command, ...args] = cmd.split(' ');
            let isAsyncCommand = false;

            switch (command) {
                case '/help':
                    xtermRef.current.write(
                        'Available commands:\r\n' +
                        '/help - Show this help\r\n' +
                        '/login <username> <password> - Login\r\n' +
                        '/listrooms - List available rooms\r\n' +
                        '/join <room> - Join a room\r\n' +
                        '/users - List users in current room\r\n' +
                        '/dm <username> - Start direct message\r\n' +
                        '/exit - Exit DM or leave room\r\n' +

                        '/logout - Logout\r\n' +
                        '/adduser <username> <password> <securitykey> - (Admin) Create new user\r\n' +
                        '/changepass <oldpass> <newpass> <securitykey> - Change your password\r\n' +
                        '/giveaccess <username> <roomname> - (Admin) Grant room access\r\n' +
                        '/quit - Quit the app\r\n'
                    );
                    break;
                case '/login':
                    isAsyncCommand = true;
                    if (state.current.loggedIn) {
                        xtermRef.current.write('Already logged in.\r\n');
                        writePrompt();
                    } else if (args.length < 2) {
                        xtermRef.current.write('Usage: /login <username> <password>\r\n');
                        writePrompt();
                    } else {
                        const username = args[0];
                        const password = args[1];
                        fetch(`${backendUrl}/api/auth/login`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ username, password }),
                        })
                            .then(res => res.json().then(data => ({ status: res.status, body: data })))
                            .then(({ status, body }) => {
                                if (status === 200 && body.token) {
                                    state.current.loggedIn = true;
                                    state.current.username = body.user.username;
                                    state.current.token = body.token;
                                    xtermRef.current.write(`Logged in as ${body.user.username}\r\n`);
                                    // Create socket connection with JWT
                                    socketRef.current = io(backendUrl, {
                                        auth: { token: body.token }
                                    });
                                    setupSocketListeners();
                                } else {
                                    xtermRef.current.write(`Login failed: ${body.msg || 'Invalid credentials'}\r\n`);
                                }
                                writePrompt();
                            })
                            .catch(err => {
                                console.error('Login API error:', err);
                                console.error('Backend URL:', backendUrl);
                                xtermRef.current.write(`Login error: ${err.message || 'Check console'}\r\n`);
                                writePrompt();
                            });
                    }
                    break;
                case '/listrooms':
                    isAsyncCommand = true;
                    fetch(`${backendUrl}/api/rooms`)
                        .then(res => res.json())
                        .then(rooms => {
                            xtermRef.current.write('Available rooms: ' + rooms.join(', ') + '\r\n');
                            writePrompt();
                        })
                        .catch(err => {
                            xtermRef.current.write('Could not fetch rooms.\r\n');
                            writePrompt();
                        });
                    break;
                case '/join':
                    if (!state.current.loggedIn) {
                        xtermRef.current.write('Please login first.\r\n');
                    } else if (args.length < 1) {
                        xtermRef.current.write('Usage: /join <room>\r\n');
                    } else {
                        socketRef.current.emit('join-room', { room: args[0], username: state.current.username });
                    }
                    break;
                case '/users':
                    if (!state.current.loggedIn || !state.current.currentRoom) {
                        xtermRef.current.write('Join a room first.\r\n');
                    } else {
                        socketRef.current.emit('get-users', { room: state.current.currentRoom });
                    }
                    break;
                case '/dm':
                    if (!state.current.loggedIn) {
                        xtermRef.current.write('Please login first.\r\n');
                    } else if (args.length < 1) {
                        xtermRef.current.write('Usage: /dm <username>\r\n');
                    } else {
                        const targetUser = args[0];
                        state.current.inDM = true;
                        state.current.dmUser = targetUser;
                        xtermRef.current.write(`[DM with ${targetUser} started]\r\n`);
                        socketRef.current.emit('get-dm-history', {
                            user1: state.current.username,
                            user2: targetUser
                        });
                    }
                    break;
                case '/exit':
                    if (state.current.inDM) {
                        state.current.inDM = false;
                        state.current.dmUser = '';
                        xtermRef.current.write('Exited DM.\r\n');
                    } else if (state.current.currentRoom) {
                        socketRef.current.emit('leave-room', {
                            room: state.current.currentRoom,
                            username: state.current.username
                        });
                        state.current.currentRoom = '';
                        xtermRef.current.write('Left the room.\r\n');
                    } else {
                        xtermRef.current.write('Nothing to exit.\r\n');
                    }
                    break;


                case '/adduser':
                    isAsyncCommand = true;
                    if (!state.current.loggedIn) {
                        xtermRef.current.write('Please login first.\r\n');
                        writePrompt();
                    } else if (args.length < 3) {
                        xtermRef.current.write('Usage: /adduser <username> <password> <securitykey>\r\n');
                        writePrompt();
                    } else {
                        const newUsername = args[0];
                        const newPassword = args[1];
                        const newSecurityKey = args[2];
                        fetch(`${backendUrl}/api/auth/register`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-auth-token': state.current.token
                            },
                            body: JSON.stringify({ username: newUsername, password: newPassword, securityKey: newSecurityKey }),
                        })
                            .then(res => res.json().then(data => ({ status: res.status, body: data })))
                            .then(({ status, body }) => {
                                if (status === 200) {
                                    xtermRef.current.write(`Success: ${body.msg}\r\n`);
                                } else {
                                    xtermRef.current.write(`Error: ${body.msg || (body.errors && body.errors[0].msg) || 'Failed to create user'}\r\n`);
                                }
                                writePrompt();
                            })
                            .catch(err => {
                                xtermRef.current.write('Network error.\r\n');
                                writePrompt();
                            });
                    }
                    break;
                case '/changepass':
                    isAsyncCommand = true;
                    if (!state.current.loggedIn) {
                        xtermRef.current.write('Please login first.\r\n');
                        writePrompt();
                    } else if (args.length < 3) {
                        xtermRef.current.write('Usage: /changepass <oldpassword> <newpassword> <securitykey>\r\n');
                        writePrompt();
                    } else {
                        const oldPassword = args[0];
                        const newPassword = args[1];
                        const securityKey = args[2];
                        fetch(`${backendUrl}/api/auth/change-password`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-auth-token': state.current.token
                            },
                            body: JSON.stringify({ oldPassword, newPassword, securityKey }),
                        })
                            .then(res => res.json().then(data => ({ status: res.status, body: data })))
                            .then(({ status, body }) => {
                                if (status === 200) {
                                    xtermRef.current.write(`${body.msg}\r\n`);
                                    // Auto logout after password change
                                    socketRef.current.emit('logout');
                                    state.current.loggedIn = false;
                                    state.current.username = '';
                                    state.current.currentRoom = '';
                                    state.current.inDM = false;
                                    state.current.dmUser = '';
                                    state.current.token = null;
                                } else {
                                    xtermRef.current.write(`Error: ${body.msg || (body.errors && body.errors[0].msg) || 'Failed to change password'}\r\n`);
                                }
                                writePrompt();
                            })
                            .catch(err => {
                                xtermRef.current.write('Network error.\r\n');
                                writePrompt();
                            });
                    }
                    break;
                case '/giveaccess':
                    isAsyncCommand = true;
                    if (!state.current.loggedIn) {
                        xtermRef.current.write('Please login first.\r\n');
                        writePrompt();
                    } else if (args.length < 2) {
                        xtermRef.current.write('Usage: /giveaccess <username> <roomname>\r\n');
                        writePrompt();
                    } else {
                        const targetUsername = args[0];
                        const targetRoomName = args[1];
                        fetch(`${backendUrl}/api/admin/grant-room-access`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-auth-token': state.current.token
                            },
                            body: JSON.stringify({ username: targetUsername, roomName: targetRoomName }),
                        })
                            .then(res => res.json().then(data => ({ status: res.status, body: data })))
                            .then(({ status, body }) => {
                                if (status === 200) {
                                    xtermRef.current.write(`Success: ${body.msg}\r\n`);
                                } else {
                                    xtermRef.current.write(`Error: ${body.msg || 'Failed to grant access'}\r\n`);
                                }
                                writePrompt();
                            })
                            .catch(err => {
                                xtermRef.current.write('Network error.\r\n');
                                writePrompt();
                            });
                    }
                    break;
                case '/logout':
                    if (!state.current.loggedIn) {
                        xtermRef.current.write('Not logged in.\r\n');
                    } else {
                        socketRef.current.emit('logout');
                        state.current.loggedIn = false;
                        state.current.username = '';
                        state.current.currentRoom = '';
                        state.current.inDM = false;
                        state.current.dmUser = '';
                        state.current.token = null;
                        xtermRef.current.write('Logged out.\r\n');
                    }
                    break;
                case '/quit':
                    xtermRef.current.write('Thank you for using Terminal Chat! (mock quit)\r\n');
                    break;
                default:
                    xtermRef.current.write(`Unknown command: ${command}\r\nType /help for list of commands.\r\n`);
            }
            if (!isAsyncCommand) {
                writePrompt();
            }
        }

        function handleMessage(msg) {
            if (!state.current.loggedIn) {
                xtermRef.current.write('Please login to send messages.\r\n');
                return;
            }
            if (state.current.inDM) {
                xtermRef.current.write(`[DM to ${state.current.dmUser}]: ${msg}\r\n`);
            } else if (state.current.currentRoom) {
                xtermRef.current.write(`[${state.current.currentRoom}] ${state.current.username || 'You'}: ${msg}\r\n`);
            } else {
                xtermRef.current.write('Join a room or start a DM to send messages.\r\n');
            }
        }

        function setupSocketListeners() {
            const socket = socketRef.current;
            if (!socket) return;

            // Remove existing listeners to prevent duplicates
            socket.off('connect');
            socket.off('disconnect');
            socket.off('connect_error');
            socket.off('room-message');
            socket.off('dm');
            socket.off('room-user-disconnect');
            socket.off('dm-user-disconnect');
            socket.off('join-room-success');
            socket.off('join-room-error');
            socket.off('users-list');
            socket.off('room-users');
            socket.off('room-history');
            socket.off('dm-history');

            // Room join events
            socket.on('join-room-success', ({ room }) => {
                state.current.currentRoom = room;
                state.current.inDM = false;
                state.current.dmUser = '';
                xtermRef.current.write(`Joined room: ${room}\r\n`);
                socket.emit('get-users', { room });
                writePrompt();
            });
            socket.on('join-room-error', ({ msg }) => {
                xtermRef.current.write(`Join room failed: ${msg}\r\n`);
                writePrompt();
            });

            // Users list
            socket.on('users-list', (users) => {
                xtermRef.current.write(`Users in room: ${users.join(', ')}\r\n`);
                writePrompt();
            });

            // Real-time user list updates
            socket.on('room-users', (users) => {
                xtermRef.current.write(`\r\n[Updated] Users in room: ${users.join(', ')}\r\n`);
                writePrompt();
            });

            // Room history
            socket.on('room-history', (messages) => {
                // On reconnect, we might get history again. 
                // Ideally we shouldn't duplicate messages. 
                // For now, let's just print them. The user will see history again.
                // This is a known side-effect of simple re-join. 
                // To fix this properly, we'd need to track last message ID.
                // For this task, we'll accept it or maybe clear screen? No, don't clear.
                // Let's just print.
                messages.forEach(msg => {
                    xtermRef.current.write(`[${msg.room}] ${msg.from}: ${msg.text}\r\n`);
                });
                writePrompt();
            });

            // DM history
            socket.on('dm-history', (messages) => {
                messages.forEach(msg => {
                    const direction = msg.from === state.current.username ? 'to' : 'from';
                    const other = direction === 'to' ? msg.to : msg.from;
                    xtermRef.current.write(`[DM ${direction} ${other}]: ${msg.text}\r\n`);
                });
                writePrompt();
            });
        }

        xtermRef.current.onKey(({ key, domEvent }) => {
            if (domEvent.key === 'Enter') {
                const promptText = getPrompt();
                const totalLength = promptText.length + inputBuffer.length;
                xtermRef.current.write('\r' + ' '.repeat(totalLength) + '\r');

                const trimmedInput = inputBuffer.trim();
                inputBuffer = '';

                if (trimmedInput.length > 0) {
                    if (trimmedInput.startsWith('/')) {
                        handleCommand(trimmedInput);
                    } else {
                        handleMessage(trimmedInput);
                        if (state.current.loggedIn && socketRef.current) {
                            if (state.current.inDM) {
                                socketRef.current.emit('dm', {
                                    to: state.current.dmUser,
                                    msg: trimmedInput,
                                    from: state.current.username
                                }, (response) => {
                                    if (response && response.status !== 'ok') {
                                        xtermRef.current.write(`\r\nError sending DM: ${response.msg}\r\n`);
                                        writePrompt();
                                    }
                                });
                            } else if (state.current.currentRoom) {
                                socketRef.current.emit('room-message', {
                                    room: state.current.currentRoom,
                                    msg: trimmedInput,
                                    user: state.current.username
                                }, (response) => {
                                    if (response && response.status !== 'ok') {
                                        xtermRef.current.write(`\r\nError sending message: ${response.msg}\r\n`);
                                        writePrompt();
                                    }
                                });
                            }
                        }
                        writePrompt();
                    }
                } else {
                    writePrompt();
                }
            } else if (domEvent.key === 'Backspace') {
                if (inputBuffer.length > 0) {
                    inputBuffer = inputBuffer.slice(0, -1);
                    xtermRef.current.write('\b \b');
                }
            } else if (
                domEvent.key.length === 1 &&
                !domEvent.ctrlKey &&
                !domEvent.metaKey
            ) {
                inputBuffer += key;
                xtermRef.current.write(key);
            }
        });

        const handleClick = () => xtermRef.current.focus();
        container.addEventListener('click', handleClick);

        const handleResize = () => fitAddonRef.current.fit();
        window.addEventListener('resize', handleResize);

        return () => {
            xtermRef.current?.dispose();
            if (container) container.removeEventListener('click', handleClick);
            window.removeEventListener('resize', handleResize);
            if (socketRef.current) {
                socketRef.current.off('connect');
                socketRef.current.off('disconnect');
                socketRef.current.off('connect_error');
                socketRef.current.off('room-message');
                socketRef.current.off('dm');
                socketRef.current.off('room-user-disconnect');
                socketRef.current.off('dm-user-disconnect');
                socketRef.current.off('join-room-success');
                socketRef.current.off('join-room-error');
                socketRef.current.off('users-list');
                socketRef.current.off('room-users');
                socketRef.current.off('room-history');
                socketRef.current.off('dm-history');
            }
        };
    }, []);

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#1e1e1e' }}>
            <div
                ref={terminalRef}
                style={{
                    width: '100vw',
                    height: '100vh',
                    background: '#1e1e1e'
                }}
                tabIndex={0}
            />
        </div>
    );
};

export default Terminal;
