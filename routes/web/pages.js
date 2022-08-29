let express = require('express');

let router = express.Router();

const scoreModel = require('../../models/comments');

let ensureAuthenticated = require('../../auth/auth').ensureAuthenticated;

router.use(ensureAuthenticated);

let Score = scoreModel();

router.get('/', function (req, res) {
    res.render('./info/features', { user: req.body });
})

router.get('/:username/:userID/leaderboard', function (req, res) {
    let documents = Score.find();
    console.log(documents);
    res.render('./features/leaderboard');
})

router.get('/online-game', function (req, res) {
    res.render('./features/online-game');
})

router.get('/online-game', function (req, res) {
    res.render('./features/online-game');
})

module.exports = router;
