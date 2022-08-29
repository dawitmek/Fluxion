const { request } = require('express');
let express = require('express');
let passport = require('passport');
const Post = require('../../models/posts');

let User = require('../../models/user');

let startTikTok = require('../../tiktok.js');

let ensureAuthenticated = require('../../auth/auth').ensureAuthenticated;


let router = express.Router();

router.get('/', function (req, res) {
    res.render('./home/');
})

router.get('/home', function (req, res) {
    res.redirect('./home/index');
})

router.get('/try-now', ensureAuthenticated, function (req, res) {
    res.render('./home/try-now')
})

router.get('/about', function (req, res) {
    res.render('./info/about');
})

router.use('/app', require('./pages.js'));
router.use("/posts", require("./post"));


router.get('/login', function (req, res) {
    res.render('./account/login');
})

router.get("/logout", function (req, res, next) {
    req.logout((err) => {
        if (!err) {
            res.redirect("/");
        } else {
            req.flash('error', 'There was an error logging out.')
        }
    });
})

router.get('/signup', function (req, res) {
    res.render('./account/signup');
})

router.post("/login", passport.authenticate("login", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true
}));

router.post("/signup", function (req, res, next) {
    let username = req.body.username,
        email = req.body.email,
        password = req.body.password;

    User.findOne({ email: email }, function (err, user) {
        if (err) { return next(err); }
        if (user) {
            req.flash('error', "There's already an account with that email");
            return res.redirect('/signup');
        }

        let newUser = new User({
            username: username,
            password: password,
            email: email
        });

        newUser.save(next);
    });
},
    passport.authenticate('login', {
        successRedirect: "/",
        failureRedirect: "/login",
        failureFlash: true
    }));

router.post('/app', ensureAuthenticated, function (req, res) {
    console.log(req.body.username);
    startTikTok(req.body.username)
    res.render('home/app', { userResponse: req.body })
})

router.get('/app', ensureAuthenticated, function (req, res) {
    res.render('home/app');
})

module.exports = router;