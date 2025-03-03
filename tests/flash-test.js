// flash-test.js - A minimal Express app to test flash messages
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

// Create minimal Express app
const app = express();

// Setup minimal session
app.use(session({
    secret: 'diagnosticsecret',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Setup flash after session
app.use(flash());

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Display flash messages
app.get('/flash-test', (req, res) => {
    // Get flash messages from session
    const messages = {
        error: req.flash('error'),
        info: req.flash('info'),
        success: req.flash('success')
    };

    console.log('Flash messages when rendering page:', messages);
    console.log('Session ID:', req.session.id);
    console.log('Session:', req.session);

    // Render the page with flash messages
    res.render('flash-test', {
        messages,
        sessionId: req.session.id,
        cookieExpires: req.session.cookie._expires ?
            (new Date(req.session.cookie._expires) - new Date()) + ' ms' : 'Not set',
        sessionData: req.session
    });
});

// Set a flash message and redirect
app.get('/flash-test/set/:type/:message', (req, res) => {
    const type = req.params.type;
    const message = req.params.message;

    console.log(`Setting ${type} flash message: ${message}`);
    console.log('Session before flash:', req.session);

    req.flash(type, message);

    console.log('Session after flash:', req.session);

    // Save session explicitly before redirect
    req.session.save(err => {
        if (err) {
            console.error('Error saving session:', err);
        }

        console.log('Session saved, redirecting');
        res.redirect('/flash-test');
    });
});

// ===== DIAGNOSTIC ROUTES =====

// Test route for session persistence
app.get('/session-test', (req, res) => {
    // Create a unique timestamp if one doesn't exist
    if (!req.session.timestamp) {
        req.session.timestamp = Date.now();
        req.session.visits = 1;
    } else {
        req.session.visits++;
    }

    // Set a test flash message
    req.flash('info', `Session test message: ${new Date().toLocaleTimeString()}`);

    res.json({
        sessionId: req.session.id,
        timestamp: req.session.timestamp,
        visits: req.session.visits,
        age: Math.floor((Date.now() - req.session.timestamp) / 1000) + ' seconds',
        message: 'Flash message set. Visit /session-test-result to view it.'
    });
});

// Route to view the flash message
app.get('/session-test-result', (req, res) => {
    const flashMessages = {
        error: req.flash('error'),
        info: req.flash('info'),
        success: req.flash('success')
    };

    res.json({
        sessionId: req.session.id,
        timestamp: req.session.timestamp,
        visits: req.session.visits,
        age: req.session.timestamp ?
            Math.floor((Date.now() - req.session.timestamp) / 1000) + ' seconds' :
            'No timestamp found',
        flash: flashMessages,
        message: 'If you see the flash message from /session-test, sessions are working correctly.'
    });
});

// Socket.IO session test page
app.get('/socket-test', (req, res) => {
    // Set a timestamp in the session
    req.session.socketTest = Date.now();

    // Save the session explicitly before rendering the page
    req.session.save(() => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Socket.IO Session Test</title>
                <script src="/socket.io/socket.io.js"></script>
            </head>
            <body>
                <h1>Socket.IO Session Test</h1>
                <p>Session ID: ${req.session.id}</p>
                <p>Test Timestamp: ${req.session.socketTest}</p>
                <div id="status">Connecting to socket...</div>
                <div id="message"></div>
                
                <script>
                    const socket = io();
                    const statusDiv = document.getElementById('status');
                    const messageDiv = document.getElementById('message');
                    
                    socket.on('connect', () => {
                        statusDiv.textContent = 'Socket connected: ' + socket.id;
                        
                        // Ask server to verify session
                        socket.emit('check-session');
                    });
                    
                    socket.on('session-data', (data) => {
                        messageDiv.innerHTML = '<p>Session verified:</p><pre>' + 
                            JSON.stringify(data, null, 2) + '</pre>';
                            
                        if (data.timestamp == ${req.session.socketTest}) {
                            messageDiv.innerHTML += '<p style="color: green">SUCCESS! Socket and Express are sharing the same session.</p>';
                        } else {
                            messageDiv.innerHTML += '<p style="color: red">ERROR: Socket and Express have different sessions.</p>';
                        }
                    });
                    
                    socket.on('disconnect', () => {
                        statusDiv.textContent = 'Socket disconnected';
                    });
                </script>
            </body>
            </html>
        `);
    });
});

// Direct flash test route
app.get('/flash-direct-test', (req, res) => {
    // Set multiple flash messages of different types
    req.flash('error', 'Test error message');
    req.flash('info', 'Test info message');
    req.flash('success', 'Test success message');

    // Log the flash state
    console.log('Flash messages set in /flash-direct-test:', req.session.flash);
    console.log('Flash backup in session:', req.session._flashBackup);

    // Save session and redirect to home
    req.session.save(err => {
        if (err) console.error('Session save error:', err);
        res.redirect('/');
    });
});

// Test route for flash messages
app.get('/flash-test/:type/:message', (req, res) => {
    const type = req.params.type;
    const message = req.params.message || 'Test message';

    if (['error', 'info', 'success', 'warning'].includes(type)) {
        console.log(`Setting flash message: ${type} - ${message}`);
        req.flash(type, message);

        // Log flash state
        console.log('Flash in session before save:', req.session.flash);
        console.log('Flash backup in session:', req.session._flashBackup);

        // Add tracking ID to follow this specific session through redirect
        const trackingId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        req.session.trackingId = trackingId;
        console.log(`Setting tracking ID for redirect: ${trackingId}`);

        // Explicitly save session before redirecting
        req.session.save(err => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).send('Session save error');
            }

            console.log(`Session ${req.session.id} saved with tracking ID ${trackingId}, redirecting to /`);
            res.redirect('/');
        });
    } else {
        res.status(400).send('Invalid flash type. Use: error, info, success, or warning');
    }
});

// Verify flash backup
app.get('/check-flash-backup', (req, res) => {
    res.json({
        hasFlashBackup: !!req.session._flashBackup,
        flashBackup: req.session._flashBackup || 'No backup found',
        sessionId: req.session.id,
        flash: req.session.flash || 'No flash in session'
    });
});

// Special route to manually clear flash backup (for debugging)
app.get('/clear-flash-backup', (req, res) => {
    const hadBackup = !!req.session._flashBackup;
    delete req.session._flashBackup;
    req.session.save();

    res.json({
        message: hadBackup ? 'Flash backup cleared' : 'No flash backup was present',
        sessionId: req.session.id
    });
});
// Get flash messages from the session
// Update your flash-messages API endpoint (in routes/api.js)

// Enhanced flash messages API endpoint with debugging
router.get("/flash-messages", function (req, res) {
    console.log('Flash messages API endpoint called');
    console.log('Session ID:', req.session?.id);
    console.log('Flash in session:', req.session.flash);

    const flashMessages = [];

    // Get flash messages directly from the session if req.flash is not working
    let sessionFlash = req.session.flash || {};

    // Read flash messages using req.flash() if available
    if (typeof req.flash === 'function') {
        console.log('Using req.flash() function');
        // Process each type of flash message
        const types = ['success', 'info', 'warning', 'error'];

        types.forEach(type => {
            console.log(`Checking for ${type} messages`);
            const messages = req.flash(type);
            console.log(`Found ${messages?.length || 0} ${type} messages:`, messages);

            if (messages && messages.length > 0) {
                messages.forEach(message => {
                    flashMessages.push({
                        type,
                        message,
                        id: Date.now() + Math.random().toString(36).substr(2, 9)
                    });
                });
            }
        });
    } else {
        console.error('req.flash is not a function!');

        // Fall back to directly getting flash from session
        console.log('Falling back to direct session access');
        Object.keys(sessionFlash).forEach(type => {
            const messages = Array.isArray(sessionFlash[type]) ?
                sessionFlash[type] : [sessionFlash[type]];

            messages.forEach(message => {
                if (message) {
                    flashMessages.push({
                        type,
                        message,
                        id: Date.now() + Math.random().toString(36).substr(2, 9)
                    });

                    // Remove from session after reading
                    if (Array.isArray(sessionFlash[type])) {
                        sessionFlash[type] = sessionFlash[type]
                            .filter(msg => msg !== message);
                    } else {
                        delete sessionFlash[type];
                    }
                }
            });
        });

        // Save session after clearing read messages
        req.session.flash = sessionFlash;
        req.session.save();
    }

    console.log('Returning flash messages:', flashMessages);

    // Return the flash messages as JSON
    res.json({
        messages: flashMessages
    });
});

// Enhanced flash messages API endpoint with debugging
router.get("/flash-messages", function (req, res) {
    console.log('Flash messages endpoint called');
    console.log('Session ID:', req.session?.id);
    console.log('Session created at:', req.session?.created ? new Date(req.session.created) : 'unknown');
    console.log('Flash function exists:', typeof req.flash === 'function');

    // Debug session data
    if (req.session) {
        console.log('Session data keys:', Object.keys(req.session));
        console.log('Flash data in session:', req.session.flash);
    } else {
        console.log('No session object found on request!');
    }

    const flashMessages = [];

    // Read flash messages from the session (using connect-flash)
    if (typeof req.flash === 'function') {
        // Process each type of flash message
        const types = ['success', 'info', 'warning', 'error'];

        types.forEach(type => {
            console.log(`Checking for ${type} messages`);
            const messages = req.flash(type);
            console.log(`Found ${messages?.length || 0} ${type} messages`);

            if (messages && messages.length > 0) {
                messages.forEach(message => {
                    flashMessages.push({
                        type,
                        message,
                        id: Date.now() + Math.random().toString(36).substr(2, 9)
                    });
                });
            }
        });
    } else {
        console.error('req.flash is not a function!');
    }

    // Return the flash messages as JSON
    res.json({
        debug: {
            sessionExists: !!req.session,
            flashFunctionExists: typeof req.flash === 'function',
            sessionId: req.session?.id || 'none',
            sessionAge: req.session?.created ? Math.floor((Date.now() - req.session.created) / 1000) + ' seconds' : 'unknown'
        },
        messages: flashMessages
    });
});

// Add a test endpoint to directly set flash messages
router.get("/set-flash/:type/:message", function (req, res) {
    const type = req.params.type;
    const message = req.params.message || `Test message at ${new Date().toLocaleTimeString()}`;

    if (['success', 'info', 'warning', 'error'].includes(type)) {
        if (typeof req.flash === 'function') {
            console.log(`Setting flash message: ${type} - ${message}`);
            req.flash(type, message);

            res.json({
                success: true,
                message: `Flash message set: ${type} - ${message}`,
                sessionId: req.session?.id || 'unknown'
            });
        } else {
            console.error('req.flash is not a function');
            res.status(500).json({
                success: false,
                error: 'req.flash is not a function',
                sessionId: req.session?.id || 'unknown'
            });
        }
    } else {
        res.status(400).json({
            success: false,
            error: 'Invalid flash type. Use success, info, warning, or error'
        });
    }
});

// Start server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Flash diagnostic server running at http://localhost:${PORT}/flash-test`);
    console.log(`Diagnostic routes:
        - /session-test: Test session persistence
        - /session-test-result: View flash messages
        - /socket-test: Test Socket.IO session integration
        - /flash-direct-test: Set multiple flash messages and redirect to home
        - /flash-test/type/message: Set custom flash message and redirect
        - /check-flash-backup: Verify flash backup status
        - /clear-flash-backup: Manually clear flash backup`);
});