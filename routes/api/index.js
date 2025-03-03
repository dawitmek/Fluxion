let express = require("express");

let router = express.Router();

router.use("/api", require("./app"));

router.use('/', require('./app'));

module.exports = router;
