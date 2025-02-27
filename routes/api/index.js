let express = require("express");

let router = express.Router();

router.use("/users", require("./users"));
router.use("/api", require("./app"));

router.use('/', require('./app'));

module.exports = router;
