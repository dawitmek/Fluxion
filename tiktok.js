const { WebcastPushConnection } = require('tiktok-live-connector');
const mongoose = require('mongoose');

let ScoreFile = require('./models/comments.js')

module.exports = function startTikTok(username) {
    let tiktokUsername = username;

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
                console.log('found and/or updated');
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
            console.log('created comment');

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

    // **************************  TIKTOK  *************************************************

    // let tiktok_connect = async function () {
    //     return new WebcastPushConnection(tiktokUsername);
    // }

    // let tiktok_client = ;
    let tiktok_client = new WebcastPushConnection(tiktokUsername);

    console.log("TikTok CLient: ", tiktok_client._events);
    
    try {
        tiktok_client.connect().then(state => {
            console.log(`Connected to ${state.roomId}`);
        })
    } catch (error) {
        console.error('Can\'t connect to room', error);
    }


    tiktok_client.on('chat', (data => {
        console.log(data.uniqueId);
        try {
            comment(data.uniqueId, data.profilePictureUrl, data.comment, new Date(Date.now()).toLocaleString());
        } catch (error) {
            console.error('Chatting error: ', error);
        }
    }))

    tiktok_client.on('disconnected', () => {
        setTimeout(() => {
            tiktok_client.connect();
        }, 2000);
    })

    tiktok_client.on('streamEnd', () => {
        console.log('Stream and Database connection closed');
    })

    tiktok_client.on('error', err => {
        console.error('Tiktok error: ', err);
    })


    async function comment(id, pictureUrl, comment, date) {
        // Returns true if user is found
        if (!(await checkUserAndUpdate(id, comment, date))) {
            // Added a comment
            await logComment(id, pictureUrl, comment, date); // creates query on user
        }
    }

    // ******************************************************************************



}

// Username of someone who is currently live
