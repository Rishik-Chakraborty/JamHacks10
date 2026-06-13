/**
 * Frontend copy of the GymCast shared contract.
 *
 * The canonical source is `shared/types.ts`. The Next.js (Turbopack) bundler
 * cannot resolve a re-export of a file OUTSIDE the frontend project root, so we
 * keep a local copy here (same pattern as `src/idl/gymcast.json`). Keep this in
 * sync with `shared/types.ts` on any wire-shape change — the backend imports the
 * canonical file directly via tsx.
 */

/* ----------------------------------------------------------------------------
 * Enums / unions
 * ------------------------------------------------------------------------- */

export type MetricType = 'weight' | 'bench' | 'visual';
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
  metricType: MetricType;
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
  mimeType: string;
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
  metricType: MetricType;
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
  metricType: MetricType;
  deadline: string; // ISO
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
  mimeType: string;
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
