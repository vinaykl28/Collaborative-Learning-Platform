const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 4000;

// Database setup
const db = new sqlite3.Database('./database.db');

// Create tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS chat_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_code TEXT UNIQUE,
            group_name TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(created_by) REFERENCES users(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS group_members (
            group_id INTEGER,
            user_id INTEGER,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, user_id),
            FOREIGN KEY(group_id) REFERENCES chat_groups(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// Authentication middleware
const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// Routes

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auth routes
app.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    try {
        db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], async (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (row) return res.status(400).json({ error: 'User already exists' });
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            db.run(
                'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                [username, email, hashedPassword],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Failed to create user' });
                    req.session.userId = this.lastID;
                    res.json({ success: true, redirect: '/dashboard' });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        req.session.userId = user.id;
        res.json({ success: true, redirect: '/dashboard' });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'Could not log out' });
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Dashboard routes
app.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/get-username', requireLogin, (req, res) => {
    db.get('SELECT username FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ username: user.username });
    });
});

app.get('/get-user-groups', requireLogin, (req, res) => {
    db.all(`
        SELECT g.id, g.group_name, g.group_code 
        FROM chat_groups g
        JOIN group_members m ON g.id = m.group_id
        WHERE m.user_id = ?
    `, [req.session.userId], (err, groups) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(groups || []);
    });
});

// Group routes
app.post('/create-group', requireLogin, (req, res) => {
    const { groupName } = req.body;
    const groupCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    db.run(
        'INSERT INTO chat_groups (group_code, group_name, created_by) VALUES (?, ?, ?)',
        [groupCode, groupName, req.session.userId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to create group' });
            
            // Auto-join creator to the group
            db.run(
                'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
                [this.lastID, req.session.userId],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Failed to join group' });
                    res.json({ success: true, groupCode, groupId: this.lastID });
                }
            );
        }
    );
});

app.post('/join-group', requireLogin, (req, res) => {
    const { groupCode } = req.body;
    
    db.get('SELECT id FROM chat_groups WHERE group_code = ?', [groupCode], (err, group) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!group) return res.status(404).json({ error: 'Group not found' });
        
        db.run(
            'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)',
            [group.id, req.session.userId],
            function(err) {
                if (err) return res.status(500).json({ error: 'Failed to join group' });
                res.json({ success: true, groupId: group.id });
            }
        );
    });
});

// Whiteboard route
app.get('/whiteboard', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'whiteboard.html'));
});

// Socket.io for real-time communication
io.on('connection', (socket) => {
    console.log('New user connected');
    
    // Group chat functionality
    socket.on('join-group', (groupId) => {
        socket.join(`group-${groupId}`);
        console.log(`User joined group ${groupId}`);
    });
    
    socket.on('group-message', (data) => {
        io.to(`group-${data.groupId}`).emit('group-message', {
            userId: data.userId,
            username: data.username,
            message: data.message,
            timestamp: new Date().toISOString()
        });
    });
    
    // Whiteboard functionality
    socket.on('drawing', (data) => {
        socket.broadcast.emit('drawing', data);
    });
    
    socket.on('clear', () => {
        io.emit('clear');
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Error handling
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is in use, trying ${PORT + 1}...`);
        server.listen(PORT + 1);
    } else {
        console.error('Server error:', error);
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`Whiteboard: http://localhost:${PORT}/whiteboard`);
});