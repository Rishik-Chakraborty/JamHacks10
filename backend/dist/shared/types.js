"use strict";
/**
 * GymCast — shared contract (single source of truth).
 *
 * Cross-package domain types, the REST API surface, and socket.io event names.
 * Frontend (`frontend/src/types`) and backend (`backend/src/...`) both import from here.
 * Keep this in sync on both sides of any wire change.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_ROUTES = exports.SOCKET_EVENTS = exports.CHALLENGE_TEMPLATES = exports.CREATOR_PROGRAM_FOLLOWER_THRESHOLD = exports.DEFAULT_PLATFORM_FEE_BPS = exports.DEFAULT_CREATOR_FEE_BPS = exports.PROOF_GRACE_HOURS = exports.DISPUTE_WINDOW_HOURS = exports.ACCEPT_WINDOW_HOURS = exports.MIN_CONFIDENCE = exports.LAMPORTS_PER_SOL = exports.SIDE_NO = exports.SIDE_YES = exports.OUTCOME_NO = exports.OUTCOME_YES = exports.OUTCOME_UNSET = void 0;
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
/** Influencer must accept a line within this many hours, else it refunds. */
exports.ACCEPT_WINDOW_HOURS = 48;
/** After the oracle verdict, disputes are open for this many hours before auto-finalize. */
exports.DISPUTE_WINDOW_HOURS = 24;
/** Influencer must post final proof within this many hours after the deadline, else refund (no-show). */
exports.PROOF_GRACE_HOURS = 24;
/** Default fee split (basis points). 500 = 5% creator, 250 = 2.5% platform. */
exports.DEFAULT_CREATOR_FEE_BPS = 500;
exports.DEFAULT_PLATFORM_FEE_BPS = 250;
/** Follower count at/above this unlocks the creator program (earns the pool cut). */
exports.CREATOR_PROGRAM_FOLLOWER_THRESHOLD = 10;
exports.CHALLENGE_TEMPLATES = [
    // --- Calisthenics holds & skills: high dazzle, near-binary to judge --------
    {
        id: 'handstand',
        label: 'Freestanding handstand hold',
        unit: 'sec',
        valuePrompt: 'Hold duration (seconds)',
        titleTemplate: 'Freestanding handstand for {value}s',
        goalTemplate: 'Balance a freestanding handstand for {value} seconds before the deadline.',
        criteriaTemplate: 'A single continuous video shows a freestanding handstand — both feet clearly away from any wall or support — held for at least {value} seconds, with a visible running timer or stopwatch in frame.',
    },
    {
        id: 'muscleup',
        label: 'Strict bar muscle-ups',
        unit: 'reps',
        valuePrompt: 'Number of reps',
        titleTemplate: '{value} strict bar muscle-up(s)',
        goalTemplate: 'Perform {value} strict bar muscle-up(s) before the deadline.',
        criteriaTemplate: 'A single continuous video shows {value} strict bar muscle-up rep(s): each starting from a dead hang and finishing with the arms locked out and the torso above the bar, with no kipping or leg swing.',
    },
    {
        id: 'pullups',
        label: 'Consecutive pull-ups',
        unit: 'reps',
        valuePrompt: 'Number of reps',
        titleTemplate: '{value} consecutive pull-ups',
        goalTemplate: 'Do {value} strict pull-ups in one unbroken set before the deadline.',
        criteriaTemplate: 'A single continuous video shows {value} consecutive pull-ups, each starting from a dead hang (arms straight) and ending with the chin clearly above the bar, with no drop from the bar between reps.',
    },
    {
        id: 'pushups',
        label: 'Consecutive push-ups',
        unit: 'reps',
        valuePrompt: 'Number of reps',
        titleTemplate: '{value} consecutive push-ups',
        goalTemplate: 'Do {value} push-ups in one unbroken set before the deadline.',
        criteriaTemplate: 'A single continuous video shows {value} consecutive push-ups, each lowering until the chest is near the floor (elbows ~90°) and pressing back to locked-out arms, without resting on the floor between reps.',
    },
    {
        id: 'pistol',
        label: 'Pistol squats (one leg)',
        unit: 'reps',
        valuePrompt: 'Number of reps',
        titleTemplate: '{value} pistol squats',
        goalTemplate: 'Do {value} consecutive one-leg pistol squats before the deadline.',
        criteriaTemplate: 'A single continuous video shows {value} consecutive pistol squats on one leg: descending to full depth with the free leg held off the floor and standing back up, without the free leg or hands touching down between reps.',
    },
    {
        id: 'lsit',
        label: 'L-sit hold',
        unit: 'sec',
        valuePrompt: 'Hold duration (seconds)',
        titleTemplate: 'L-sit for {value}s',
        goalTemplate: 'Hold an L-sit for {value} seconds before the deadline.',
        criteriaTemplate: 'A single continuous video shows an L-sit — hips off the ground with both legs straight and held parallel to the floor — for at least {value} seconds, with a visible timer in frame.',
    },
    {
        id: 'frontlever',
        label: 'Front lever hold',
        unit: 'sec',
        valuePrompt: 'Hold duration (seconds)',
        titleTemplate: 'Front lever for {value}s',
        goalTemplate: 'Hold a front lever for {value} seconds before the deadline.',
        criteriaTemplate: 'A single continuous video shows a front lever — body horizontal, straight, and roughly parallel to the ground while hanging from a bar — held for at least {value} seconds, with a visible timer in frame.',
    },
    {
        id: 'humanflag',
        label: 'Human flag hold',
        unit: 'sec',
        valuePrompt: 'Hold duration (seconds)',
        titleTemplate: 'Human flag for {value}s',
        goalTemplate: 'Hold a human flag for {value} seconds before the deadline.',
        criteriaTemplate: 'A single continuous video shows a human flag — body horizontal off a vertical pole with both arms locked out — held for at least {value} seconds, with a visible timer in frame.',
    },
    {
        id: 'plank',
        label: 'Plank hold',
        unit: 'sec',
        valuePrompt: 'Duration (seconds)',
        titleTemplate: 'Hold a {value}-second plank',
        goalTemplate: 'Hold a forearm plank for {value} seconds straight before the deadline.',
        criteriaTemplate: 'A single continuous video shows a forearm plank held with a straight body line for at least {value} seconds, with a visible running timer or stopwatch in frame.',
    },
    // --- Physique reveals: max dazzle; judged from the final photo -------------
    {
        id: 'sixpack',
        label: 'Reveal a visible six-pack',
        titleTemplate: 'Reveal a visible six-pack',
        goalTemplate: 'Get visible six-pack abs by the deadline.',
        criteriaTemplate: 'The final photo shows the bare midsection standing relaxed (NOT flexed or crunched) under even front lighting, with all six abdominal segments individually distinguishable.',
    },
    {
        id: 'bicepvein',
        label: 'Pop a visible bicep vein',
        titleTemplate: 'Pop a visible bicep vein',
        goalTemplate: 'Develop a clearly visible bicep vein when flexed by the deadline.',
        criteriaTemplate: 'The final photo shows the upper arm flexed, with a distinct raised vein (the cephalic vein) clearly visible running along the front of the bicep in good lighting.',
    },
    {
        id: 'serratus',
        label: 'Show serratus definition',
        titleTemplate: 'Show off serratus "shark gills"',
        goalTemplate: 'Reveal defined serratus muscles ("shark gills") by the deadline.',
        criteriaTemplate: 'The final photo shows the side of the torso with the serratus muscles individually defined and visible as finger-like striations along the ribcage under even lighting.',
    },
];
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
    checkUsername: 'GET /api/users/check-username?u=', // ?wallet= excludes self
    searchUsers: 'GET /api/users/search?q=',
    getUser: 'GET /api/users/:wallet',
    getPositions: 'GET /api/users/:wallet/positions',
    getProfile: 'GET /api/users/:wallet/profile',
    toggleFollow: 'POST /api/users/:wallet/follow', // body { follower }
    listFollowing: 'GET /api/users/:wallet/following',
    // social feed + discovery
    feed: 'GET /api/feed', // ?wallet= → follow-weighted ranking
    rankedLines: 'GET /api/lines', // ?wallet= → suggestion-ranked open lines
    toggleLike: 'POST /api/photos/:id/like',
    likeLine: 'POST /api/challenges/:id/like', // body { wallet }
    // challenges
    listChallenges: 'GET /api/challenges',
    createChallenge: 'POST /api/challenges',
    getChallenge: 'GET /api/challenges/:id', // → ChallengeDetail
    acceptLine: 'POST /api/challenges/:id/accept',
    declineLine: 'POST /api/challenges/:id/decline',
    attachMarket: 'POST /api/challenges/:id/market',
    resolveChallenge: 'POST /api/challenges/:id/resolve', // advance resolution (review → finalize)
    disputeLine: 'POST /api/challenges/:id/dispute',
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
