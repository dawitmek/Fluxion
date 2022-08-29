let express = require('express');

let router = express.Router();


let ensureAuthenticated = require('../../auth/auth').ensureAuthenticated;

router.get('/', function (req, res) {
    res.render('./info/features', {user: req.body});
})

router.get('/:username/:userID/leaderboard', function (req, res) {
    Score.findOne({id: req.params.userID})

    res.render('./features/leaderboard');
})

router.get('/online-game', function (req, res) {
    res.render('./features/online-game');
})

router.get('/online-game', function (req, res) {
    res.render('./features/online-game');
})




module.exports = router;
