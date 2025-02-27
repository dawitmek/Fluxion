const { request } = require('express');
let express = require('express');
let passport = require('passport');
const startTikTok = require('../../tiktok');
let User = require('../../models/user');
let ensureAuthenticated = require('../../auth/auth').ensureAuthenticated;
let router = express.Router();

router.use('/app', require('./app.js'));

router.get('/', function (req, res) {
    res.render('./home/');
})

router.get('/home', function (req, res) {
    res.redirect('./home/index');
})

router.get('/try-now', ensureAuthenticated, function (req, res) {
    res.render('./home/try-now')
})

router.get('/docs', function (req, res) {
    res.render('./info/about');
})



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
    successRedirect: "/try-now",
    failureRedirect: "/login",
    failureFlash: true
}));

router.post("/signup", async function (req, res, next) {
    let username = req.body.username,
        email = req.body.email,
        password = req.body.password;

    let user = await User.findOne({ email: email });

    if (!user || user == null) {
        let newUser = new User({
            username: username,
            password: password,
            email: email
        });
    }

    if (user) {
        req.flash('error', "There's already an account with that email");
        return res.redirect('/signup');
    }

    newUser.save(next);
},
    passport.authenticate('login', {
        successRedirect: "/",
        failureRedirect: "/login",
        failureFlash: true
    }));

router.post('/start', function (req, res) {
    startTikTok(req.body.username)
    req.started = true;
    res.get("/api")
    res.redirect('/app');
})


router.get('/features', function (req, res) {
    res.render('./info/features');
})

module.exports = router;