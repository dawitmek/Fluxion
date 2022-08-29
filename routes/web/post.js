let express = require('express');

let router = express.Router();

let ensureAuthenticated = require('../../auth/auth').ensureAuthenticated;

let Post = require('../../models/posts')

router.use(ensureAuthenticated);

router.get('/', function (req, res) {
    Post.find({ userId: req.user._id }).exec(function (err, posts) {
        if (err) { console.log(err); }

        res.render('post/posts', { posts: posts })
    })
})

router.get('/add', function (req, res) {
    res.render('././post/addpost')
})

router.post('/add', function (req, res) {

    let newPost = new Post({
        title: req.body.title,
        content: req.body.content,
        userId: req.user._id

    })

    newPost.save(function (err, post) {
        if (err) { console.log(err); }
        res.redirect('/posts')
    })
})

router.get('/:postId', function (req, res, next) {
    Post.findById(req.params.postId).exec(function (err, post) {
        res.render('post/detailpost', { post: post })
    })
})

router.get("/edit/:postId", function (req, res) {
    Post.findById(req.params.postId).exec(function (err, post) {
        res.render("post/editpost", { post: post });
    });
});

router.post("/update", async function (req, res) {
    const post = await Post.findById(req.body.postid);

    post.title = req.body.title;
    post.content = req.body.content;

    try {
        await post.save();
        res.redirect("/posts/" + req.body.postid);
    } catch (err) {
        console.error("error happened");
        res.status(500).send(err);
    }

});

module.exports = router;
