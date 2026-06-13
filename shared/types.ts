/**
 * GymCast — shared contract (single source of truth).
 *
 * Cross-package domain types, the REST API surface, and socket.io event names.
 * Frontend (`frontend/src/types`) and backend (`backend/src/...`) both import from here.
 * Keep this in sync on both sides of any wire change.
 */

/* ----------------------------------------------------------------------------
 * Enums / unions
 * ------------------------------------------------------------------------- */

export type ChallengeStatus = 'active' | 'resolved';
/** null = unresolved, 'yes' = goal met, 'no' = goal not met */
export type Outcome = 'yes' | 'no' | null;
export type BetSide = 'yes' | 'no';
export type ReactionType = 'comment' | 'fire' | 'skull' | 'muscle';

/** On-chain outcome encoding used by the Anchor program (u8). */
export const OUTCOME_UNSET = 0;
export const OUTCOME_YES = 1;
export const OUTCOME_NO = 2;

/** On-chain bet side encoding (u8). */
export const SIDE_YES = 0;
export const SIDE_NO = 1;

/** Lamports per SOL. */
export const LAMPORTS_PER_SOL = 1_000_000_000;

/** AI verdict confidence below this routes to manual override before resolve. */
export const MIN_CONFIDENCE = 0.6;

/* ----------------------------------------------------------------------------
 * Domain documents (as returned by the API — `_id` serialized to string `id`)
 * ------------------------------------------------------------------------- */

export interface User {
  id: string;
  wallet: string;
  username: string;
  avatar?: string;
  bio?: string;
  createdAt: string; // ISO
}

export interface Challenge {
  id: string;
  creatorWallet: string;
  title: string;
  goalText: string;
  /** Precise, checkable success criteria fed to the AI oracle at resolution. */
  successCriteria: string;
  /** Optional unit for the numeric progress metric (e.g. "kg", "reps", "%"). */
  metricUnit?: string;
  /** Id of the pre-made template this was built from; absent = AI-approved custom goal. */
  templateId?: string;
  startDate: string; // ISO
  deadline: string; // ISO
  status: ChallengeStatus;

  // On-chain references (populated after initialize_market)
  marketPda?: string;
  vaultPda?: string;
  programId?: string;

  outcome: Outcome;

  // Pool state mirrored from chain for fast odds display
  yesPoolLamports: number;
  noPoolLamports: number;
  /** Implied probability of YES in [0,1]; derived from pools. */
  impliedYes: number;

  // Social / momentum
  hypeScore: number;
  streak: number;
  misses: number;
  lastPostAt?: string; // ISO

  createdAt: string; // ISO
}

export interface Photo {
  id: string;
  challengeId: string;
  capturedAt: string; // ISO (client-timestamped)
  /** Either inline base64 data URL (small) or a GridFS id reference (large). */
  imageData?: string;
  gridFsId?: string;
  /** image/* or video/* — drives <img> vs <video> rendering and AI handling. */
  mimeType: string;
  /**
   * For a video, representative still frames (base64 JPEG data URLs) extracted
   * client-side at upload. The AI oracle judges THESE frames since it can't watch
   * raw video. Empty/absent for images.
   */
  frames?: string[];
  metricValue?: number;
  /** Instagram-style caption for the progress post. */
  caption?: string;
  /** The final photo is the one the AI oracle evaluates at the deadline. */
  isFinal: boolean;
  createdAt: string; // ISO
}

/** Time-series metric point (recharts progress + Hype Meter input). */
export interface MetricPoint {
  challengeId: string;
  ts: string; // ISO
  /** Optional unit label carried from the challenge (e.g. "kg"). */
  unit?: string;
  value: number;
}

export interface Bet {
  id: string;
  challengeId: string;
  bettorWallet: string;
  side: BetSide;
  amountLamports: number;
  txSig: string; // unique — idempotency key for chain mirroring
  positionPda: string;
  claimed: boolean;
  createdAt: string; // ISO
}

export interface Comment {
  id: string;
  challengeId: string;
  wallet: string;
  type: ReactionType;
  body?: string;
  createdAt: string; // ISO
}

/* ----------------------------------------------------------------------------
 * Odds engine (parimutuel) — see backend/src/services/odds.ts
 * ------------------------------------------------------------------------- */

export interface Odds {
  yesPoolLamports: number;
  noPoolLamports: number;
  totalLamports: number;
  /** Implied probabilities in [0,1]. */
  impliedYes: number;
  impliedNo: number;
  /** Gross payout multiplier per winning lamport (before fee). null if that side is empty. */
  yesMultiplier: number | null;
  noMultiplier: number | null;
  /** False until both sides have stake. */
  hasMarket: boolean;
}

/* ----------------------------------------------------------------------------
 * AI oracle verdict — see backend/src/services/ai
 * ------------------------------------------------------------------------- */

export interface OracleVerdict {
  met: boolean;
  confidence: number; // 0..1
  reasoning: string;
  observedEvidence: string[];
  /** True when confidence < MIN_CONFIDENCE or ensemble disagreed → needs human. */
  needsManualReview: boolean;
}

/* ----------------------------------------------------------------------------
 * REST API request/response shapes
 * Base path: `${NEXT_PUBLIC_API_URL}` (e.g. http://localhost:5000/api)
 * ------------------------------------------------------------------------- */

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface CreateUserBody {
  wallet: string;
  username: string;
  avatar?: string;
  bio?: string;
}

export interface CreateChallengeBody {
  creatorWallet: string;
  title: string;
  goalText: string;
  successCriteria: string;
  /** Optional unit for the numeric progress metric (e.g. "kg"). */
  metricUnit?: string;
  /** Set when built from a pre-made template (skips AI review). Absent = custom goal → AI-reviewed. */
  templateId?: string;
  deadline: string; // ISO
}

/**
 * AI review of a custom goal — gates whether a non-template challenge may be
 * created. Returned (as an error payload) when a custom goal is rejected, and
 * used server-side to normalize the criteria of an approved one.
 */
export interface GoalReview {
  approved: boolean;
  /** Human-readable explanation; on rejection, what to fix. */
  feedback: string;
  /** A tightened, more objective version of the success criteria (when approved). */
  improvedCriteria?: string;
}

/** Attach on-chain market info after the creator signs initialize_market. */
export interface AttachMarketBody {
  marketPda: string;
  vaultPda: string;
  programId: string;
}

export interface CreatePhotoBody {
  challengeId: string;
  capturedAt: string; // ISO
  /** base64 data URL; backend decides inline vs GridFS by size. */
  imageData: string;
  /** image/* or video/*. */
  mimeType: string;
  /** For videos: still frames (base64 JPEG data URLs) the AI oracle will judge. */
  frames?: string[];
  metricValue?: number;
  caption?: string;
  isFinal?: boolean;
}

/** Mirror a confirmed on-chain bet into MongoDB (idempotent on txSig). */
export interface CreateBetBody {
  challengeId: string;
  bettorWallet: string;
  side: BetSide;
  amountLamports: number;
  txSig: string;
  positionPda: string;
}

export interface CreateCommentBody {
  challengeId: string;
  wallet: string;
  type: ReactionType;
  body?: string;
}

/** Resolution request (oracle). Triggers AI eval then on-chain resolve_market. */
export interface ResolveChallengeBody {
  /** Optional manual override of the AI verdict (admin panel). */
  manualOutcome?: BetSide;
}

export interface ResolveChallengeResponse {
  verdict: OracleVerdict;
  /** null when verdict needs manual review and no override was supplied. */
  resolvedOutcome: Outcome;
  resolveTxSig?: string;
}

export interface ChallengeDetail extends Challenge {
  odds: Odds;
  photos: Photo[];
  metrics: MetricPoint[];
  recentBets: Bet[];
  comments: Comment[];
}

/** A bettor's position: their bet joined with the market it was placed on. */
export interface PortfolioPosition {
  bet: Bet;
  challenge: Challenge;
}

/** An Instagram-style progress post for the social feed. */
export interface FeedPost {
  photo: Photo;
  challenge: Challenge;
  creator: User | null;
  likeCount: number;
  /** Whether the requesting wallet (if provided) has liked this post. */
  likedByMe: boolean;
  /** Comments live on the parent challenge thread. */
  commentCount: number;
}

/** A creator's public profile: their lines and their post grid. */
export interface Profile {
  wallet: string;
  user: User | null;
  challenges: Challenge[];
  posts: FeedPost[];
}

/** Result of toggling a like on a photo. */
export interface LikeResult {
  photoId: string;
  likeCount: number;
  liked: boolean;
}

/* ----------------------------------------------------------------------------
 * Pre-made challenge templates (the create-page dropdown)
 *
 * Picking a template auto-fills an objective, AI-verifiable goal so most users
 * never write free-text criteria. `{value}` is replaced by the number the user
 * enters; the deadline is appended by the form. Templates are pre-approved — only
 * the "custom" path (templateId absent) is sent to the AI reviewer.
 * ------------------------------------------------------------------------- */

export interface ChallengeTemplate {
  /** Stable id stored on the challenge (templateId). */
  id: string;
  /** Dropdown label. */
  label: string;
  /** Unit for the numeric metric/progress chart (e.g. "kg", "reps", "km"). */
  unit?: string;
  /** Label for the numeric input the user fills (omit for no numeric value). */
  valuePrompt?: string;
  /** Title with a single `{value}` placeholder, e.g. "Deadlift {value} kg". */
  titleTemplate: string;
  /** Plain-language pitch with `{value}`. */
  goalTemplate: string;
  /** Objective, photo/video-checkable success criteria with `{value}`. */
  criteriaTemplate: string;
}

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'deadlift',
    label: 'Deadlift a target weight',
    unit: 'kg',
    valuePrompt: 'Target weight (kg)',
    titleTemplate: 'Deadlift {value} kg',
    goalTemplate: 'Pull a {value} kg deadlift for a clean single rep before the deadline.',
    criteriaTemplate:
      'A video shows one full deadlift rep — bar lifted from the floor to lockout (hips and knees extended) — with plates whose visible markings sum to {value} kg (including the bar).',
  },
  {
    id: 'bench',
    label: 'Bench press a target weight',
    unit: 'kg',
    valuePrompt: 'Target weight (kg)',
    titleTemplate: 'Bench press {value} kg',
    goalTemplate: 'Bench press {value} kg for a full rep before the deadline.',
    criteriaTemplate:
      'A video shows one full bench-press rep (bar lowered to the chest then pressed to locked-out arms) with plates whose visible markings sum to {value} kg including the bar.',
  },
  {
    id: 'squat',
    label: 'Squat a target weight',
    unit: 'kg',
    valuePrompt: 'Target weight (kg)',
    titleTemplate: 'Squat {value} kg',
    goalTemplate: 'Squat {value} kg to at least parallel for one rep before the deadline.',
    criteriaTemplate:
      'A video shows one full back-squat rep descending to at least parallel (hip crease below the top of the knee) and standing back up, with plates summing to {value} kg including the bar.',
  },
  {
    id: 'pullups',
    label: 'Consecutive pull-ups',
    unit: 'reps',
    valuePrompt: 'Number of reps',
    titleTemplate: '{value} consecutive pull-ups',
    goalTemplate: 'Do {value} strict pull-ups in one unbroken set before the deadline.',
    criteriaTemplate:
      'A single continuous video shows {value} consecutive pull-ups, each starting from a dead hang (arms straight) and ending with the chin clearly above the bar, with no drop from the bar between reps.',
  },
  {
    id: 'pushups',
    label: 'Consecutive push-ups',
    unit: 'reps',
    valuePrompt: 'Number of reps',
    titleTemplate: '{value} consecutive push-ups',
    goalTemplate: 'Do {value} push-ups in one unbroken set before the deadline.',
    criteriaTemplate:
      'A single continuous video shows {value} consecutive push-ups, each lowering until the chest is near the floor (elbows ~90°) and pressing back to locked-out arms, without resting on the floor between reps.',
  },
  {
    id: 'run',
    label: 'Run a distance',
    unit: 'km',
    valuePrompt: 'Distance (km)',
    titleTemplate: 'Run {value} km',
    goalTemplate: 'Run {value} km in a single continuous effort before the deadline.',
    criteriaTemplate:
      'A photo of a fitness-app/watch summary shows a single run of at least {value} km, with the distance figure clearly legible.',
  },
  {
    id: 'bodyweight',
    label: 'Reach a bodyweight',
    unit: 'kg',
    valuePrompt: 'Target bodyweight (kg)',
    titleTemplate: 'Reach {value} kg bodyweight',
    goalTemplate: 'Get my bodyweight to {value} kg by the deadline.',
    criteriaTemplate:
      'A photo shows a scale display reading {value} kg (or lower, for a cut / higher, for a bulk — your call in the goal), with the number clearly legible.',
  },
  {
    id: 'plank',
    label: 'Hold a plank',
    unit: 'sec',
    valuePrompt: 'Duration (seconds)',
    titleTemplate: 'Hold a {value}-second plank',
    goalTemplate: 'Hold a forearm plank for {value} seconds straight before the deadline.',
    criteriaTemplate:
      'A single continuous video shows a forearm plank held with a straight body line for at least {value} seconds, with a visible running timer or stopwatch in frame.',
  },
];

/* ----------------------------------------------------------------------------
 * Socket.io contract
 * ------------------------------------------------------------------------- */

export const SOCKET_EVENTS = {
  /** Global rolling activity ticker (bets + photo posts). */
  TICKER: 'ticker:event',
  /** Per-challenge Hype Meter + odds update. Room = challenge id. */
  HYPE: 'hype:update',
  /** Client joins a challenge room to receive HYPE updates. */
  JOIN: 'challenge:join',
  LEAVE: 'challenge:leave',
} as const;

export type TickerEventKind = 'bet' | 'photo' | 'resolve' | 'commentary';

export interface TickerEvent {
  kind: TickerEventKind;
  challengeId: string;
  challengeTitle?: string;
  wallet?: string;
  side?: BetSide;
  amountLamports?: number;
  /** Optional AI-generated commentary line. */
  message?: string;
  at: string; // ISO
}

export interface HypeUpdate {
  challengeId: string;
  hypeScore: number;
  streak: number;
  misses: number;
  odds: Odds;
}

/* ----------------------------------------------------------------------------
 * REST route map (documentation of the surface area)
 * ------------------------------------------------------------------------- */
export const API_ROUTES = {
  health: 'GET /api/health',
  // users
  createUser: 'POST /api/users',
  searchUsers: 'GET /api/users/search?q=',
  getUser: 'GET /api/users/:wallet',
  getPositions: 'GET /api/users/:wallet/positions',
  getProfile: 'GET /api/users/:wallet/profile',
  // social feed
  feed: 'GET /api/feed',
  toggleLike: 'POST /api/photos/:id/like',
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
} as const;
