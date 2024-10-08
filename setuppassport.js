let passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy;

let User = require('././models/user');

module.exports = function () {
    passport.serializeUser((user, done) => {
        done(null, user._id);
    });

    passport.deserializeUser((id, done) => {
        let user = User.findById(id);
        if (user) {
            done(null, user)
        }
    })
}

passport.use("login", new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async function (email, password, done) {
    try {
        
       let user =  await User.findOne({ email: email });

        if (!user || user == null) {
            return done(null, false, { message: "No user has that Email!" });
        }
        
        if (user) {
            user.checkPassword(password, function (err, isMatch) {
                if (err) { return done(err); }
                if (isMatch) {
                    return done(null, user);
                } else {
                    return done(null, false, { message: "Invalid password" });
                }
            });
        }
    } catch (err) {
        if (err) { return done(err); }
        
    }
}));