const mongoose = require('mongoose');

module.exports = function scoreModel(tiktokUsername) {
    let userComment = mongoose.Schema({
        id: { type: String, required: true, unique: true },
        profileImgUrl: { type: String, required: true },
        comments: { type: Array },
        score: { type: Number, required: true }
    }, { collection: tiktokUsername });
    
    let Score = mongoose.model('Score', userComment);
    return Score;
}
