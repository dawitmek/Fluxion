// Complete app.js with Socket.IO integration and Flash Message fixes

const { log } = require('console');
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const session = require('express-session');
const flash = require('connect-flash');
const http = require('http');
const socketIO = require('socket.io');

// Import passport setup
const setUpPassport = require('./setuppassport.js');

// Create the Express app
const app = express();

// Create HTTP server by wrapping the Express app
// CRITICAL: This allows Socket.IO and Express to share the same server
const server = http.createServer(app);

// Configure Express app
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Basic middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// ===== CRITICAL: SESSION SETUP =====

// Create a single session middleware that will be shared
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'tiktokappsecretsession',
    resave: true, // Must be true to ensure flash messages persist
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Only use secure in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    name: 'tiktok.sid' // Set a custom name to avoid conflicts
});

// Apply session middleware to Express
app.use(sessionMiddleware);

// Initialize Socket.IO AFTER session setup but BEFORE passport/flash
const io = socketIO(server, { 
    cors: { origin: '*' } 
});

// CRITICAL: Share session between Socket.IO and Express
io.use((socket, next) => {
    // This wraps Socket.IO connections with the Express session middleware
    sessionMiddleware(socket.request, {}, next);
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    // console.log('Socket connected:', socket.id);
    
    // Log session info for debugging
    const sessionID = socket.request.session?.id || 'no session';
    // console.log(`Socket ${socket.id} connected with session ${sessionID}`);
    
    // Handle session verification requests (for testing)
    socket.on('check-session', () => {
        socket.emit('session-data', {
            socketId: socket.id,
            sessionId: socket.request.session?.id || 'none',
            timestamp: socket.request.session?.socketTest || 'none', 
            isAuthenticated: socket.request.session?.passport?.user ? true : false
        });
    });
    
    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
    });
});

// ===== AUTHENTICATION SETUP =====

// Initialize Passport AFTER session but BEFORE flash
app.use(passport.initialize());
app.use(passport.session());

// Set up Passport
setUpPassport();

// Initialize Flash - MUST come after session and passport
app.use(flash());

// ===== FLASH BACKUP MIDDLEWARE =====

// Flash backup middleware - creates backup of flash messages before consumption
app.use((req, res, next) => {
    // Create a backup of flash data before it gets consumed
    if (req.session && req.session.flash) {
        // Deep clone the flash data to avoid reference issues
        req.session._flashBackup = JSON.parse(JSON.stringify(req.session.flash));
        
        // Save session to preserve the backup
        if (typeof req.session.save === 'function') {
            req.session.save();
        }
    }
    
    next();
});

// Add middleware to make flash messages available to templates
app.use((req, res, next) => {
    // Override render to include flash messages
    const originalRender = res.render;
    
    res.render = function(view, options, callback) {
        // Initialize options if not provided
        options = options || {};
        
        // Add URL to template variables
        options.URL = options.URL || req.originalUrl;
        
        // Add user to template variables
        options.currentUser = options.currentUser || req.user;
        
        // Get flash messages right before rendering
        options.flashMessages = {
            error: req.flash('error'),
            info: req.flash('info'),
            success: req.flash('success'),
            warning: req.flash('warning')
        };
        
        // For backward compatibility
        options.error = options.error || (options.flashMessages.error.length > 0 ? 
            options.flashMessages.error[0] : null);
        options.info = options.info || (options.flashMessages.info.length > 0 ? 
            options.flashMessages.info[0] : null);
        
        // Log flash messages if any exist
        if (options.flashMessages.error.length || 
            options.flashMessages.info.length || 
            options.flashMessages.success.length || 
            options.flashMessages.warning.length) {
            console.log(`Rendering ${view} with flash messages:`, {
                error: options.flashMessages.error,
                info: options.flashMessages.info,
                success: options.flashMessages.success,
                warning: options.flashMessages.warning
            });
        }
        
        // Call the original render method
        return originalRender.call(this, view, options, callback);
    };
    
    next();
});

// ===== DATABASE CONNECTION =====

// Connect to MongoDB
mongoose.connect(process.env.MongoClient || 'mongodb://localhost/tiktok-app')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, 'static')));

// ===== APPLICATION ROUTES =====
app.use("/", require("./routes/web/"));
app.use("/api", require("./routes/api"));

// ===== ERROR HANDLING =====

// Handle 404 errors
app.use((req, res, next) => {
    res.status(404).render('error', { 
        title: 'Page Not Found',
        message: 'The page you requested could not be found.'
    });
});

// Handle all other errors
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).render('error', { 
        title: 'Server Error',
        message: 'Something went wrong on our end. Please try again later.'
    });
});

// ===== START SERVER =====

// IMPORTANT: Only use the server variable for listening!
server.listen(app.get('port'), () => {
    console.log(`Server running on http://localhost:${app.get('port')}`);

});

// Export for potential testing or external use
module.exports = { app, server, io };