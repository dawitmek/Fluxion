// routes/api/app.js 

let express = require("express");
let Score = require("../../models/comments");
const { streamEvents, getTikTokClient } = require('../../tiktok');
const { io } = require('../../app');

let router = express.Router();

// Store active SSE connections and their known message IDs
const activeConnections = new Map();

router.get("/", function (req, res) {
    res.json("This is a json status code for the app api");
});

router.get("/chat/:userName", checkStreamUp, async function (req, res) {
    console.log('received in the api/chat/:username');

    Score(req.params.userName).find({}).then((data) => {
        let usrInfo = [];

        data.forEach(user => {
            let usrObj = {
                user: user.id,
                message: null,
                time: null,
                timestamp: null
            }
            let usrComments = Array.from(user.comments)
            usrComments.forEach(elem => {
                usrObj.message = elem.comment;
                const date = new Date(elem.date);
                usrObj.time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                usrObj.timestamp = date.getTime();
            });
            usrInfo.push(usrObj);
        });

        // Sort by timestamp ascending (oldest first)
        usrInfo.sort((a, b) => a.timestamp - b.timestamp);

        // Limit to the most recent 20 messages
        if (usrInfo.length > 20) {
            usrInfo = usrInfo.slice(usrInfo.length - 20);
        }

        res.json(usrInfo);
    }).catch((err) => {
        console.error("Error fetching data: ", err);
        res.status(500).json({ error: "Internal Server Error" });
    });
});

console.log("Current Stream Events: ", streamEvents._events);
// Listen for stream state changes and notify clients
const streamStateHandler = (data) => {
    console.log("Current Stream State: ", data);
    // Only send updates for the specific username this client is connected to

    try {
        // res.write(`data: ${JSON.stringify({
        //     type: 'stream_state',
        //     state: data.state,
        //     message: getStateMessage(data)
        // })}\n\n`);


    } catch (error) {
        console.error("Error sending stream state update:", error);
    }
};

// Subscribe to stream state events
streamEvents.on('streamState', streamStateHandler);

streamEvents.on('streamEnd', data => {
    console.log('From API -  LIVE ENDED: Stream connection closed');

});


// io.on('streamEnd', data => {
//     console.log("From API socket data", data);

// })

console.log(io);


// SSE endpoint using message tracking
router.get("/chat/:userName/stream", async function (req, res) {
    const userName = req.params.userName;
    console.log(`SSE connection established for user: ${userName}`);

    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connection', message: 'Connected to chat stream' })}\n\n`);

    // Create a unique ID for this connection
    const connectionId = Date.now().toString();

    // Get initial messages and store their IDs
    let knownMessageIds = new Set();
    try {
        const initialData = await Score(userName).find({});
        initialData.forEach(user => {
            Array.from(user.comments).forEach(comment => {
                // Create a unique ID for each message (user ID + comment date)
                const messageId = `${user.id}-${new Date(comment.date).getTime()}`;
                knownMessageIds.add(messageId);
                console.log(knownMessageIds);

            });
        });
    } catch (error) {
        console.error("Error fetching initial messages:", error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Error retrieving initial data' })}\n\n`);
    }

    // Store the connection info
    activeConnections.set(connectionId, {
        res,
        userName,
        knownMessageIds
    });

    // Listen for stream state changes and notify clients
    const streamStateHandler = (data) => {
        console.log("Current Stream State: ", data);
        // Only send updates for the specific username this client is connected to
        if (data.username === userName) {
            try {
                res.write(`data: ${JSON.stringify({
                    type: 'stream_state',
                    state: data.state,
                    message: getStateMessage(data)
                })}\n\n`);
            } catch (error) {
                console.error("Error sending stream state update:", error);
            }
        }
    };

    // Subscribe to stream state events
    streamEvents.on('streamState', streamStateHandler);

    // Setup interval to check for new messages
    const intervalId = setInterval(async () => {
        try {
            const connection = activeConnections.get(connectionId);
            if (!connection) {
                clearInterval(intervalId);
                return;
            }

            // Get new messages by comparing with known message IDs
            const newMessages = await checkForNewMessages(userName, connection.knownMessageIds);

            // Send new messages if any
            if (newMessages && newMessages.length > 0) {
                res.write(`data: ${JSON.stringify({
                    type: 'chat_update',
                    messages: newMessages.map(msg => ({
                        user: msg.user,
                        message: msg.message,
                        time: msg.time,
                        timestamp: msg.timestamp
                    }))
                })}\n\n`);

                // Update known message IDs
                newMessages.forEach(msg => {
                    connection.knownMessageIds.add(msg.id);
                });
            } else {
                // Send heartbeat to keep connection alive
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date() })}\n\n`);
            }
        } catch (error) {
            console.error(`Error in SSE stream for ${userName}:`, error);
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Error retrieving updates' })}\n\n`);
        }
    }, 3000); // Check for new messages every 3 seconds

    // Handle client disconnect
    req.on('close', () => {
        console.log(`SSE connection closed for user: ${userName}`);
        clearInterval(intervalId);
        activeConnections.delete(connectionId);

        // Remove the stream state event listener
        streamEvents.removeListener('streamState', streamStateHandler);
    });
});

async function checkStreamUp(req, res, next) {
    console.log("Current tiktok client:", getTikTokClient());
    next();
}

// Function to get message for different stream states
function getStateMessage(data) {
    switch (data.state) {
        case 'connected':
            return `Connected to ${data.username}'s live stream`;
        case 'disconnected':
            return `Temporarily disconnected from ${data.username}'s stream. Reconnecting...`;
        case 'ended':
            return `${data.username}'s live stream has ended`;
        case 'error':
            return `Error in ${data.username}'s stream: ${data.error || 'Unknown error'}`;
        default:
            return `Stream state changed to: ${data.state}`;
    }
}

// Function to get new messages by comparing with known message IDs
async function checkForNewMessages(userName, knownMessageIds) {
    try {
        const data = await Score(userName).find({});
        let newMessages = [];

        data.forEach(user => {
            Array.from(user.comments).forEach(comment => {
                // Create a unique ID for this message
                const date = new Date(comment.date);
                const timestamp = date.getTime();
                const messageId = `${user.id}-${timestamp}`;

                // If we haven't seen this message before, it's new
                if (!knownMessageIds.has(messageId)) {
                    newMessages.push({
                        id: messageId,
                        user: user.id,
                        message: comment.comment,
                        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        timestamp: timestamp
                    });
                }
            });
        });

        // Sort by timestamp ascending (oldest first)
        newMessages.sort((a, b) => a.timestamp - b.timestamp);

        return newMessages;
    } catch (error) {
        console.error("Error checking for new messages:", error);
        throw error;
    }
}


// Enhanced flash messages API endpoint with debugging
router.get("/flash-messages", function (req, res) {
    // console.log('Flash messages endpoint called');
    // console.log('Session ID:', req.session?.id);
    // console.log('Session created at:', req.session?.created ? new Date(req.session.created) : 'unknown');
    // console.log('Flash function exists:', typeof req.flash === 'function');

    // // Debug session data
    // if (req.session) {
    //     console.log('Session data keys:', Object.keys(req.session));
    //     console.log('Flash data in session:', req.session.flash);
    // } else {
    //     console.log('No session object found on request!');
    // }

    const flashMessages = [];

    // Read flash messages from the session (using connect-flash)
    if (typeof req.flash === 'function') {
        // Process each type of flash message
        const types = ['success', 'info', 'warning', 'error'];

        types.forEach(type => {
            // console.log(`Checking for ${type} messages`);
            const messages = req.flash(type);
            // console.log(`Found ${messages?.length || 0} ${type} messages`);

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


module.exports = router;