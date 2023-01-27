const { log } = require('console');
let express = require('express'),
    path = require('path'),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    passport = require('passport'),
    session = require('express-session'),
    flash = require('connect-flash');


let setUpPassport = require('./setuppassport.js');

let app = express(),
    server = require('http').createServer(app),
    io = require('socket.io')(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
    console.log('connected at: ');
    console.log(socket.id);
})

mongoose.connect(`mongodb+srv://admin:<${process.env.DATABASECONNECTION}@cluster2023.s4mntee.mongodb.net/?retryWrites=true&w=majority`);

setUpPassport();

app.set('port', process.env.PORT || 3000)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs')

app.use(bodyParser.urlencoded({ extended: true }));
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

server.listen(3001, () => {
    console.log("server running");
})
