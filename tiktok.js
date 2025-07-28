const { WebcastPushConnection } = require('tiktok-live-connector');
const mongoose = require('mongoose');
const EventEmitter = require('events');
const User = require('./models/user');

// Create an event emitter to broadcast stream state changes
const streamEvents = new EventEmitter();

let ScoreFile = require('./models/comments.js');

// TikTok client instance container
let tiktokClientInstance = null;

function startTikTok(username) {
    let tiktokUsername = username;
    let isActive = false;
    let activityTimeout = null;
    let reconnectInterval = null;

    // ********************************  DATABASE *******************************************

    let Score = ScoreFile(tiktokUsername);

    async function checkUserAndUpdate(id, comment, date) {
        try {
            let newComment = { comment: comment, date: date };

            let findAndUpdate = await Score.findOneAndUpdate({
                id: id
            }, {
                $inc: { score: 1 },
                $push: { comments: newComment }
            });

            if (findAndUpdate) {
                return true;
            } else
                return false;
        } catch (err) {
            console.error('Checking user error: ', err)
            return false;
        }
    }

    async function logComment(id, profileImgUrl, comment, date) {
        try {
            await Score.create({
                id: id,
                profileImgUrl: profileImgUrl,
                comments: [{
                    comment: comment,
                    date: date
                }],
                score: 1
            })
        } catch (err) {
            console.error('Adding comment error: ', err)
        }
    }

    // Function to verify if a stream is active
    function checkStreamActivity() {
        // If we haven't received any activity since connection, 
        // the stream might be ended already
        if (!isActive) {
            console.log('No stream activity detected, stream appears to be ended');

            // Emit stream end event
            streamEvents.emit('streamState', {
                username: tiktokUsername,
                state: 'ended'
            });

            // Disconnect since there's no active stream
            if (tiktok_client && typeof tiktok_client.disconnect === 'function') {
                tiktok_client.disconnect();
            }
        }
    }

    // **************************  TIKTOK  *************************************************

    let tiktok_client = new WebcastPushConnection(tiktokUsername);
    
    // Store the instance in the module-level variable
    tiktokClientInstance = tiktok_client;

    try {
        tiktok_client.connect().then(state => {
            console.log(`Connected to Room ID: ${state.roomId}`);

            // Emit connected event
            streamEvents.emit('streamState', {
                username: tiktokUsername,
                state: 'connected',
                roomId: state.roomId
            });

            // Check the roomInfo to see if it contains valid data
            if (!state.roomInfo || Object.keys(state.roomInfo).length === 0 ||
                (state.roomInfo.prompts && state.roomInfo.prompts === '')) {
                console.log('Connected to room, but roomInfo indicates stream may be ended');

                // Set a timeout to check for activity
                activityTimeout = setTimeout(checkStreamActivity, 5000);
            } else {
                // Mark as active if roomInfo appears valid
                isActive = true;
            }

        }).catch(err => {
            console.error('Error connecting to room: ', err);

            // Emit error event
            streamEvents.emit('streamState', {
                username: tiktokUsername,
                state: 'error',
                error: err.message || 'Connection error'
            });

            // Set an interval to attempt reconnection
            reconnectInterval = setInterval(() => {
                tiktok_client.connect().then(state => {
                    console.log(`Reconnected to Room ID: ${state.roomId}`);

                    // Emit reconnected event
                    streamEvents.emit('streamState', {
                        username: tiktokUsername,
                        state: 'reconnected',
                        roomId: state.roomId
                    });

                    // Clear the interval once reconnected
                    clearInterval(reconnectInterval);
                }).catch(err => {
                    console.error('Reconnection attempt failed: ', err);
                });
            }, 5000); // Attempt reconnection every 5 seconds

        })
    } catch (error) {
        console.error('Can\'t connect to room', error);

        // Emit error event
        streamEvents.emit('streamState', {
            username: tiktokUsername,
            state: 'error',
            error: error.message || 'Connection failed'
        });
    }

    // Any event indicates activity
    const markActivity = () => {
        isActive = true;
        if (activityTimeout) {
            clearTimeout(activityTimeout);
            activityTimeout = null;
        }
    };

    tiktok_client.on('chat', (data => {
        try {
            markActivity();
            comment(data.uniqueId, data.profilePictureUrl, data.comment, new Date(Date.now()).toLocaleString());
        } catch (error) {
            console.error('Chatting error: ', error);
        }
    }));

    // Track other event types as activity too
    tiktok_client.on('gift', () => markActivity());
    tiktok_client.on('like', () => markActivity());
    tiktok_client.on('follow', () => markActivity());
    tiktok_client.on('share', () => markActivity());

    tiktok_client.on('disconnected', () => {
        console.log('Connection lost, reconnecting...');
        console.log("Get state: ", tiktok_client.getState());

        // Reset activity flag when disconnected
        isActive = false;

        tiktok_client.getRoomInfo().then(info => {
            console.log("Room info: ", info);

            // Check if roomInfo indicates an ended stream
            if (!info || Object.keys(info).length === 0 ||
                (info.prompts && info.prompts === '')) {
                // This likely means the stream has ended
                streamEvents.emit('streamState', {
                    username: tiktokUsername,
                    state: 'ended'
                });
                return; // Don't reconnect
            }

            // Emit disconnected event
            streamEvents.emit('streamState', {
                username: tiktokUsername,
                state: 'disconnected'
            });

            setTimeout(() => {
                tiktok_client.connect();

                // Set a new activity timeout after reconnection
                activityTimeout = setTimeout(checkStreamActivity, 5000);
            }, 2000);
        }).catch(err => {
            console.error('Error getting room info:', err);

            // If we can't get room info, assume stream ended
            streamEvents.emit('streamState', {
                username: tiktokUsername,
                state: 'ended'
            });
        });
    });

    reconnectInterval = setInterval(() => {
        if (!tiktok_client.getState().isConnected) {
            console.log("Connection appears down, clearing interval");
            clearInterval(reconnectInterval);
            return;
        }

        tiktok_client.getRoomInfo().then(info => {
            // Check if roomInfo indicates an ended stream
            if (!info || Object.keys(info).length === 0 ||
                (info.prompts && info.prompts === '')) {
                console.log('Room info indicates stream has ended');

                // Emit stream end event
                streamEvents.emit('streamState', {
                    username: tiktokUsername,
                    state: 'ended'
                });

                // Disconnect since there's no active stream
                tiktok_client.disconnect();
                clearInterval(reconnectInterval);
            }
        }).catch(err => {
            console.error('Error getting room info:', err);
        });
    }, 10000); // Check every 10 seconds instead of 2

    tiktok_client.on('streamEnd', () => {
        console.log('LIVE ENDED: Stream connection closed');

        // Emit stream end event - this will trigger flash messages
        streamEvents.emit('streamState', {
            username: tiktokUsername,
            state: 'ended',
            message: "Stream has ended."
        });

        tiktok_client.disconnect();

        // Clear the reconnect interval
        clearInterval(reconnectInterval);
    });

    tiktok_client.on('chat', data => {
        streamEvents.emit('chat', {
            username: tiktokUsername,
            state: 'chat',
            roomId: data.roomId
        });
    })

    tiktok_client.on('error', err => {
        console.error('Tiktok error: ', err);

        // Emit error event
        streamEvents.emit('streamState', {
            username: tiktokUsername,
            state: 'error',
            error: err.message || 'Stream error'
        });
    });

    async function comment(id, pictureUrl, comment, date) {
        // Returns true if user is found
        if (!(await checkUserAndUpdate(id, comment, date))) {
            // Added a comment
            await logComment(id, pictureUrl, comment, date); // creates query on user
        }
    }

    return {
        client: tiktok_client,
        disconnect: () => {
            // Clear intervals and timeouts
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
            }
            if (activityTimeout) {
                clearTimeout(activityTimeout);
            }
            tiktok_client.disconnect();
        }
    };
}

// Export the function and the event emitter
module.exports = startTikTok;
module.exports.streamEvents = streamEvents;

// Export the TikTok client instance getter
module.exports.getTikTokClient = () => tiktokClientInstance;