let express = require("express");

let router = express.Router();

router.use(function (req, res, next) {
    res.locals.currentUser = req.user;
    res.locals.tiktokName = req.tiktokName;
    res.locals.error = req.flash('error');
    res.locals.info = req.flash('info');
    res.locals.URL = req.url
    next();
})

router.use("/", require("./home"));
router.use("/api", require("../api"));
router.use((req, res, next) => {
    res.status(404).send("Error finding page.")
})

module.exports = router;