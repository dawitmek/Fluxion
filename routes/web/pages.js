let express = require('express');

let router = express.Router();

let ensureAuthenticated = require('../../auth/auth').ensureAuthenticated;

router.get('/', function (req, res) {
    console.log(req.params);
    res.render('./pages/info/features', {user: req.body});
})

router.get('/leaderboard', function (req, res) {
    res.render('./pages/leaderboard');
})

router.post('/add', function (req, res) {

})

router.get('/:postId', function (req, res, next) {
   
})

router.get("/edit/:postId", function (req, res) {
    
});

router.post("/update", function (req, res) {

});

module.exports = router;
