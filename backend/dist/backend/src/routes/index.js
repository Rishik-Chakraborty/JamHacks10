"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountRoutes = mountRoutes;
const users_1 = require("./users");
const challenges_1 = require("./challenges");
const photos_1 = require("./photos");
const bets_1 = require("./bets");
const comments_1 = require("./comments");
function mountRoutes(app) {
    app.use('/api/users', users_1.usersRouter);
    // Per-challenge sub-resource list routes (GET /api/challenges/:id/{photos,bets,comments}).
    // Mounted before the main challenges router so their specific paths match first;
    // Express falls through to the next handler when a path/method doesn't match.
    app.use('/api/challenges', photos_1.challengePhotosRouter);
    app.use('/api/challenges', bets_1.challengeBetsRouter);
    app.use('/api/challenges', comments_1.challengeCommentsRouter);
    app.use('/api/challenges', challenges_1.challengesRouter);
    app.use('/api/photos', photos_1.photosRouter);
    app.use('/api/bets', bets_1.betsRouter);
    app.use('/api/comments', comments_1.commentsRouter);
}
