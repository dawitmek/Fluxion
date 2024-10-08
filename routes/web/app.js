let express = require('express');

let router = express.Router();

const userData = require('../../models/comments');

let ensureAuthenticated = require('../../auth/auth').ensureAuthenticated;

let startTikTok = require('../../tiktok.js');

let mongoose = require('mongoose');

router.use(ensureAuthenticated);

let Score = userData();

router.get('/', function (req, res) {
    res.redirect('/app/dashboard');
})

router.get('/dashboard', function (req, res) {
    res.render('./home/dashboard');
})

router.get('/:username/:userID/leaderboard', async function (req, res) {
    
    try {
        let documents = await Score.find({ id: req.params.username})
    } catch (error) {
        console.log(error);
    }
    res.render('./features/leaderboard');
})

router.get('/online-game', function (req, res) {
    res.render('./features/online-game');
})




module.exports = router;
