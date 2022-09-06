let express = require('express');

let router = express.Router();

const scoreModel = require('../../models/comments');

let ensureAuthenticated = require('../../auth/auth').ensureAuthenticated;

let startTikTok = require('../../tiktok.js');

let mongoose = require('mongoose');

router.use(ensureAuthenticated);

let Score = scoreModel();

router.get('/', function (req, res) {
    res.redirect('/app/dashboard');
})

router.get('/dashboard', function (req, res) {
    res.render('./home/dashboard');
})

router.get('/:username/:userID/leaderboard', function (req, res) {
    let documents = Score.find({ id: req.params.username})
    console.log(documents);
    res.render('./features/leaderboard');
})

router.get('/online-game', function (req, res) {
    res.render('./features/online-game');
})

router.post('/dashboard', function (req, res) {
    startTikTok(req.body.username)
    res.render('home/app', { userResponse: req.body })
})



module.exports = router;
