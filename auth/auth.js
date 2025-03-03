let User = require('../models/user');

/**
 * Middleware to ensure a user is authenticated before accessing a route
 */
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        next();
    } else {        
        // Use 'error' type instead of 'info' to match your template styling
        req.flash('error', 'You must be logged in to see this page');
        
        // Save the session before redirecting to ensure flash persists
        req.session.save(err => {
            if (err) console.error('Error saving session:', err);
            res.redirect('/login');
        });
    }
}

/**
 * Middleware to ensure the user has a TikTok username set
 */
async function userPresent(req, res, next) {
    // Skip if not authenticated
    if (!req.isAuthenticated()) {
        return next();
    }
    
    try {
        if (req.tiktokName != null) {
            next();
        } else {
            let user = await User.findById(req.user._id);
            
            if (user && user.tiktokName != null) {
                req.tiktokName = user.tiktokName;
                next();
            } else {
                // Also use 'error' type here for consistency
                req.flash('error', 'You must enter your TikTok username to see this page');
                req.session.save(() => {
                    res.redirect('/try-now');
                });
            }
        }
    } catch (err) {
        console.error('Error in userPresent middleware:', err);
        req.flash('error', 'An error occurred while checking your user information');
        req.session.save(() => {
            res.redirect('/');
        });
    }
}


module.exports = { 
    ensureAuthenticated, 
    userPresent 
};