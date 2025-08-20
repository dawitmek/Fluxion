// routes/web/home.js
const { request } = require('express');
let express = require('express');
let passport = require('passport');
const startTikTok = require('../../tiktok');
let User = require('../../models/user');
let { ensureAuthenticated, userPresent } = require('../../auth/auth');
const { WebcastPushConnection } = require('tiktok-live-connector');
let router = express.Router();

// Include app.js routes
router.use('/app', require('./app.js'));

// Home route
router.get('/', function (req, res) {
    res.render('./home/');
});

// Redirect /home to /home/index
router.get('/home', function (req, res) {
    res.redirect('./home/index');
});

// Protected route for entering TikTok username (no userPresent middleware to prevent redirect loop)
router.get('/try-now', ensureAuthenticated, function (req, res) {
    // Check if we have flash messages backed up from auth redirect
    if (req.session && req.session._flashBackup) {
        console.log('Flash backup found for try-now page:', req.session._flashBackup);

        let restoredMessages = {
            error: [],
            info: [],
            success: [],
            warning: []
        };

        // Restore flash messages from backup
        Object.keys(req.session._flashBackup).forEach(type => {
            if (restoredMessages[type]) {
                const messages = req.session._flashBackup[type];
                if (Array.isArray(messages)) {
                    restoredMessages[type] = messages;
                } else if (messages) {
                    restoredMessages[type] = [messages];
                }
            }
        });

        console.log('Restored flash messages from backup:', restoredMessages);

        res.render('./home/try-now', {
            flashMessages: restoredMessages,
            error: restoredMessages.error.length > 0 ? restoredMessages.error[0] : null,
            info: restoredMessages.info.length > 0 ? restoredMessages.info[0] : null,
            URL: req.originalUrl,
            currentUser: req.user || null
        });

        // Clear backup after use
        delete req.session._flashBackup;
        req.session.save();

        return;
    }

    // Standard rendering with fresh flash messages
    res.render('./home/try-now', {
        flashMessages: {
            error: req.flash('error'),
            info: req.flash('info'),
            success: req.flash('success'),
            warning: req.flash('warning')
        }
    });
});

// Documentation route
router.get('/docs', function (req, res) {
    res.render('./info/about');
});

// Login page with flash message backup system
router.get('/login', function (req, res) {
    // Check for backed up flash messages
    if (req.session && req.session._flashBackup) {
        let restoredMessages = {
            error: [],
            info: [],
            success: [],
            warning: []
        };

        // Process backup messages by type
        Object.keys(req.session._flashBackup).forEach(type => {
            if (restoredMessages[type]) {
                const messages = req.session._flashBackup[type];
                if (Array.isArray(messages)) {
                    restoredMessages[type] = messages;
                } else if (messages) {
                    restoredMessages[type] = [messages];
                }
            }
        });

        res.render('./account/login', {
            flashMessages: restoredMessages,
            error: restoredMessages.error.length > 0 ? restoredMessages.error[0] : null,
            info: restoredMessages.info.length > 0 ? restoredMessages.info[0] : null,
            URL: req.originalUrl,
            query: req.query,
            currentUser: req.user || null
        });

        // Clear backup after use
        delete req.session._flashBackup;
        req.session.save();

        return;
    }

    // Standard flash message handling
    const flashMessages = {
        error: req.flash('error'),
        info: req.flash('info'),
        success: req.flash('success'),
        warning: req.flash('warning')
    };

    res.render('./account/login', {
        flashMessages: flashMessages,
        error: flashMessages.error.length > 0 ? flashMessages.error[0] : null,
        info: flashMessages.info.length > 0 ? flashMessages.info[0] : null,
        URL: req.originalUrl,
        query: req.query,
        currentUser: req.user || null
    });
});

// Logout route
router.get("/logout", function (req, res, next) {
    req.logout((err) => {
        if (!err) {
            req.flash('success', 'You have been successfully logged out.');
            req.session.save(() => {
                res.redirect("/");
            });
        } else {
            req.flash('error', 'There was an error logging out.');
            console.error('Error logging out:', err);

            req.session.save(() => {
                res.redirect("/");
            });
        }
    });
});

// Signup page route
router.get('/signup', function (req, res) {
    res.render('./account/signup');
});

// Login form submission
router.post("/login", passport.authenticate("login", {
    successRedirect: "/start",
    failureRedirect: "/login",
    failureFlash: true
}));

// Signup form submission
router.post("/signup", async function (req, res, next) {
    let username = req.body.username,
        email = req.body.email,
        password = req.body.password;

    try {
        // Check if user already exists
        let user = await User.findOne({ email: email });

        if (user) {
            req.flash('error', "There's already an account with that email");
            return req.session.save(() => {
                res.redirect('/signup');
            });
        }

        // Create new user
        let newUser = new User({
            username: username,
            password: password,
            email: email
        });

        await newUser.save();

        // Auto-login after successful signup
        passport.authenticate('login', {
            successRedirect: "/",
            failureRedirect: "/login",
            failureFlash: true
        })(req, res, next);

    } catch (err) {
        console.error('Error in signup:', err);
        req.flash('error', "Error creating account: " + err.message);
        return req.session.save(() => {
            res.redirect('/signup');
        });
    }
});

// Start route - verify stream is live before proceeding
router.get('/start', checkIfLive, async function (req, res) {
    res.locals.tiktokName = req.tiktokName;
    startTikTok(req.tiktokName);
    req.started = true;
    res.redirect('/app/dashboard');
});

// Start form submission route - process TikTok username from try-now form
router.post('/start', checkIfLive, async function (req, res) {
    if (req.body == null || req.body.username == null) {
        req.flash('error', 'Please provide a valid TikTok username');
        return req.session.save(() => {
            res.redirect('/try-now');
        });
    } else {
        try {
            // Verify the stream is currently live
            const streamStatus = await checkTikTokStreamStatus(req.body.username);

            if (!streamStatus.isLive) {
                req.flash('error', `@${req.body.username} is not currently live streaming on TikTok: ${streamStatus.reason}`);
                return req.session.save(() => {
                    res.redirect('/try-now');
                });
            }

            res.locals.tiktokName = req.body.username;

            // Save TikTok username to user's account
            let updated = await User.findOneAndUpdate({ _id: req.user._id }, {
                $set: {
                    tiktokName: req.body.username
                }
            });

            // Start TikTok connection
            startTikTok(req.body.username);
            req.tiktokName = req.body.username;
            req.started = true;

            req.flash('success', `Successfully connected to @${req.body.username}'s live stream`);
            req.session.save(() => {
                res.redirect('/app/dashboard');
            });
        } catch (error) {
            console.error('Error checking stream status:', error);
            req.flash('error', `Unable to connect to @${req.body.username}'s TikTok stream: ${error.message || 'Unknown error'}`);
            return req.session.save(() => {
                res.redirect('/try-now');
            });
        }
    }
});

/**
 * Middleware to check if the user's TikTok stream is active
 */
async function checkIfLive(req, res, next) {
    if (req.tiktokName == null && (req.body == null || req.body.username == null)) {
        console.log('tiktokName is null, retrieving from database');
        try {
            let user = await User.findById(req.user.id);

            if (!user || user.tiktokName == null) {
                req.flash('info', 'Please enter your TikTok username to start.');
                return req.session.save(() => {
                    res.redirect('/try-now');
                });
            } else {
                try {
                    const streamStatus = await checkTikTokStreamStatus(user.tiktokName);

                    if (!streamStatus.isLive) {
                        req.flash('error', `@${user.tiktokName} is not currently live streaming on TikTok: ${streamStatus.reason}`);
                        return req.session.save(() => {
                            res.redirect('/try-now');
                        });
                    }

                    req.tiktokName = user.tiktokName;
                    next();
                } catch (error) {
                    console.error('Error checking stream status:', error);
                    req.flash('error', `Unable to connect to @${user.tiktokName}'s TikTok stream: ${error.message || 'Unknown error'}`);
                    return req.session.save(() => {
                        res.redirect('/try-now');
                    });
                }
            }
        } catch (error) {
            console.error('Error finding user:', error);
            req.flash('error', 'An error occurred while retrieving your user information');
            return req.session.save(() => {
                res.redirect('/login');
            });
        }
    } else {
        // If tiktokName is already set, verify the stream is still active
        try {
            const streamStatus = await checkTikTokStreamStatus(req.tiktokName || req.body.username);

            if (!streamStatus.isLive) {
                req.flash('error', `@${req.tiktokName || req.body.username} is not currently live streaming on TikTok: ${streamStatus.reason}`);
                return req.session.save(() => {
                    res.redirect('/try-now');
                });
            }

            next();
        } catch (error) {
            console.error('Error checking stream status:', error);
            switch (error.message) {
                case "Connection failed":
                    req.flash('error', `Unable to connect to @${req.tiktokName || req.body.username}'s TikTok stream: User does not exist or Connection failed.`);
                    return req.session.save(() => {
                        res.redirect('/try-now');
                    });
                    break;

                default:
                    req.flash('error', `Unable to connect to @${req.tiktokName || req.body.username}'s TikTok stream: ${error.message || 'Unknown error'}`);
                    return req.session.save(() => {
                        res.redirect('/try-now');
                    });
                    break;
            }

        }
    }
}

/**
 * Helper function to check if a TikTok stream is active
 * Works for both high-activity and low/no-activity streams
 */
async function checkTikTokStreamStatus(username) {
    return new Promise((resolve, reject) => {
        const tiktok = new WebcastPushConnection(username);
        let resolved = false;

        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                tiktok.disconnect();
                reject(new Error('Connection timed out'));
            }
        }, 10000);

        tiktok.connect()
            .then(state => {
                clearTimeout(timeout);

                // Check if connection is properly established
                if (!state.isConnected || !state.upgradedToWebsocket) {
                    tiktok.disconnect();
                    if (!resolved) {
                        resolved = true;
                        resolve({
                            isLive: false,
                            reason: 'Connection to TikTok websocket failed'
                        });
                    }
                    return;
                }

                // Check if roomId is valid
                if (!state.roomId) {
                    tiktok.disconnect();
                    if (!resolved) {
                        resolved = true;
                        resolve({
                            isLive: false,
                            reason: 'No room ID found - stream may not exist'
                        });
                    }
                    return;
                }

                // Get detailed room info to verify stream status
                tiktok.getRoomInfo()
                    .then(roomInfo => {
                        tiktok.disconnect();

                        // Empty room info indicates no active stream
                        if (roomInfo &&
                            Object.keys(roomInfo).length === 1 &&
                            'prompts' in roomInfo &&
                            roomInfo.prompts === '') {

                            console.log(`Stream for ${username} is not live: empty room info detected`);

                            if (!resolved) {
                                resolved = true;
                                resolve({
                                    isLive: false,
                                    reason: 'This user is not currently streaming'
                                });
                            }
                            return;
                        }

                        // Check key indicators for live stream
                        const isLive = Boolean(
                            roomInfo &&
                            Object.keys(roomInfo).length > 1 &&
                            roomInfo.stream_id
                        );

                        console.log(`Final determination for ${username}: ${isLive ? 'LIVE' : 'NOT LIVE'}`);

                        if (!resolved) {
                            resolved = true;

                            if (isLive) {
                                resolve({ isLive: true, reason: 'Stream is active' });
                            } else {
                                // Provide specific reason based on findings
                                let reason = 'Stream is not active';

                                if (!roomInfo || Object.keys(roomInfo).length <= 1) {
                                    reason = 'No stream information available';
                                } else if (!roomInfo.title || roomInfo.title.length === 0) {
                                    reason = 'Stream has no title - not currently active';
                                } else if (!roomInfo.stream_id) {
                                    reason = 'No stream ID found - stream not active';
                                }

                                resolve({ isLive: false, reason });
                            }
                        }
                    })
                    .catch(err => {
                        console.error(`Error getting room info for ${username}:`, err);
                        tiktok.disconnect();

                        if (!resolved) {
                            resolved = true;
                            resolve({
                                isLive: false,
                                reason: `Error getting stream details: ${err.message || 'Unknown error'}`
                            });
                        }
                    });
            })
            .catch(err => {
                clearTimeout(timeout);
                console.error(`Error connecting to ${username}'s TikTok room:`, err);

                // Categorize connection errors
                let errorReason = 'Connection failed';

                if (err.message && err.message.includes('not found')) {
                    errorReason = 'User not found or stream does not exist';
                } else if (err.message && err.message.includes('ended')) {
                    errorReason = 'Stream has ended';
                }

                if (!resolved) {
                    resolved = true;
                    reject(new Error(errorReason));
                }
            });
    });
}

module.exports = router;