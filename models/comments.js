const mongoose = require('mongoose');
let userComment = mongoose.Schema({
    id: { type: String, required: true, unique: true },
    profileImgUrl: { type: String, required: true },
    comments: { type: Array },
    score: { type: Number, required: true }
});

module.exports = function (tiktokUser) {
    if (tiktokUser) {
        return mongoose.model('Score', userComment, tiktokUser);
    } else
        return mongoose.model('Score', userComment);

}