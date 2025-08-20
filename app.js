
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

const setUpPassport = require('./setuppassport.js');

const app = express();

const server = http.createServer(app);

app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());


const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'tiktokappsecretsession',
    resave: true,     saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',         httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000     },
    name: 'tiktok.sid' });

app.use(sessionMiddleware);

const io = socketIO(server, { 
    cors: { origin: '*' } 
});

io.use((socket, next) => {
        sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
        
        const sessionID = socket.request.session?.id || 'no session';
        
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


app.use(passport.initialize());
app.use(passport.session());

setUpPassport();

app.use(flash());


app.use((req, res, next) => {
        if (req.session && req.session.flash) {
                req.session._flashBackup = JSON.parse(JSON.stringify(req.session.flash));
        
                if (typeof req.session.save === 'function') {
            req.session.save();
        }
    }
    
    next();
});

app.use((req, res, next) => {
        const originalRender = res.render;
    
    res.render = function(view, options, callback) {
                options = options || {};
        
                options.URL = options.URL || req.originalUrl;
        
                options.currentUser = options.currentUser || req.user;
        
                options.flashMessages = {
            error: req.flash('error'),
            info: req.flash('info'),
            success: req.flash('success'),
            warning: req.flash('warning')
        };
        
                options.error = options.error || (options.flashMessages.error.length > 0 ? 
            options.flashMessages.error[0] : null);
        options.info = options.info || (options.flashMessages.info.length > 0 ? 
            options.flashMessages.info[0] : null);
        
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
        
                return originalRender.call(this, view, options, callback);
    };
    
    next();
});


mongoose.connect(process.env.MongoClient)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use(express.static(path.join(__dirname, 'static')));

app.use("/", require("./routes/web/"));
app.use("/api", require("./routes/api"));


app.use((req, res, next) => {
    res.status(404).render('error', { 
        title: 'Page Not Found',
        message: 'The page you requested could not be found.'
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).render('error', { 
        title: 'Server Error',
        message: 'Something went wrong on our end. Please try again later.'
    });
});


server.listen(app.get('port'), () => {
    console.log(`Server running on http://localhost:${app.get('port')}`);

});

module.exports = {app, server, io};
