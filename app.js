let express = require('express'),
    path = require('path'),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    passport = require('passport'),
    session = require('express-session'),
    flash = require('connect-flash');

let setUpPassport = require('./setuppassport.js');

let app = express()



mongoose.connect(process.env.DATABASECONNECTION);
setUpPassport();

app.set('port', process.env.PORT || 3000)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs')

app.use(bodyParser.urlencoded({extended:true}));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}))



app.use(passport.initialize());
app.use(passport.session());
app.use(flash());


app.use(express.static(path.join(__dirname, 'static')));
app.use("/", require("./routes/web/"));
app.use("/api", require("./routes/api"));


app.listen(app.get('port'), function () {
    console.log("server listening on port http://localhost:" + app.get('port'));
})