"use strict";
/**
 * GymCast — shared contract (single source of truth).
 *
 * Cross-package domain types, the REST API surface, and socket.io event names.
 * Frontend (`frontend/src/types`) and backend (`backend/src/...`) both import from here.
 * Keep this in sync on both sides of any wire change.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_ROUTES = exports.SOCKET_EVENTS = exports.MIN_CONFIDENCE = exports.LAMPORTS_PER_SOL = exports.SIDE_NO = exports.SIDE_YES = exports.OUTCOME_NO = exports.OUTCOME_YES = exports.OUTCOME_UNSET = void 0;
/** On-chain outcome encoding used by the Anchor program (u8). */
exports.OUTCOME_UNSET = 0;
exports.OUTCOME_YES = 1;
exports.OUTCOME_NO = 2;
/** On-chain bet side encoding (u8). */
exports.SIDE_YES = 0;
exports.SIDE_NO = 1;
/** Lamports per SOL. */
exports.LAMPORTS_PER_SOL = 1_000_000_000;
/** AI verdict confidence below this routes to manual override before resolve. */
exports.MIN_CONFIDENCE = 0.6;
/* ----------------------------------------------------------------------------
 * Socket.io contract
 * ------------------------------------------------------------------------- */
exports.SOCKET_EVENTS = {
    /** Global rolling activity ticker (bets + photo posts). */
    TICKER: 'ticker:event',
    /** Per-challenge Hype Meter + odds update. Room = challenge id. */
    HYPE: 'hype:update',
    /** Client joins a challenge room to receive HYPE updates. */
    JOIN: 'challenge:join',
    LEAVE: 'challenge:leave',
};
/* ----------------------------------------------------------------------------
 * REST route map (documentation of the surface area)
 * ------------------------------------------------------------------------- */
exports.API_ROUTES = {
    health: 'GET /api/health',
    // users
    createUser: 'POST /api/users',
    getUser: 'GET /api/users/:wallet',
    // challenges
    listChallenges: 'GET /api/challenges',
    createChallenge: 'POST /api/challenges',
    getChallenge: 'GET /api/challenges/:id', // → ChallengeDetail
    attachMarket: 'POST /api/challenges/:id/market',
    resolveChallenge: 'POST /api/challenges/:id/resolve',
    challengeOdds: 'GET /api/challenges/:id/odds',
    // photos
    listPhotos: 'GET /api/challenges/:id/photos',
    createPhoto: 'POST /api/photos',
    getPhotoImage: 'GET /api/photos/:id/image', // serves GridFS bytes
    // bets
    listBets: 'GET /api/challenges/:id/bets',
    createBet: 'POST /api/bets',
    // comments
    listComments: 'GET /api/challenges/:id/comments',
    createComment: 'POST /api/comments',
};
