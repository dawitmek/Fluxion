let express = require("express");

let router = express.Router();

router.get("/", function (req, res) {
    console.log("This is the app api 33333");

    res.json("This is a json status code for the app api");
})

module.exports = router;
