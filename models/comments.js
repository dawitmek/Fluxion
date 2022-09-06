const mongoose = require('mongoose');
let userComment = mongoose.Schema({
    id: { type: String, required: true, unique: true },
    profileImgUrl: { type: String, required: true },
    comments: { type: Array },
    score: { type: Number, required: true }
});

module.exports = function (tiktokUser) {
    return mongoose.model('Score', userComment, tiktokUser);
}