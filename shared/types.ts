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

export type ChallengeStatus =
  | 'pending_accept' // challenger proposed it; awaiting the influencer's acceptance
  | 'active' // accepted; open for betting
  | 'under_review' // final proof posted; oracle verdict in, dispute window open
  | 'disputed' // someone contested the verdict → held for manual resolution
  | 'resolved' // settled YES/NO
  | 'refunded'; // influencer declined / no-showed → stakes returned
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

/** Influencer must accept a line within this many hours, else it refunds. */
export const ACCEPT_WINDOW_HOURS = 48;
/** After the oracle verdict, disputes are open for this many hours before auto-finalize. */
export const DISPUTE_WINDOW_HOURS = 24;
/** Influencer must post final proof within this many hours after the deadline, else refund (no-show). */
export const PROOF_GRACE_HOURS = 24;
/** Default fee split (basis points). 500 = 5% creator, 250 = 2.5% platform. */
export const DEFAULT_CREATOR_FEE_BPS = 500;
export const DEFAULT_PLATFORM_FEE_BPS = 250;

/* ----------------------------------------------------------------------------
 * Domain documents (as returned by the API — `_id` serialized to string `id`)
 * ------------------------------------------------------------------------- */

export interface User {
  id: string;
  wallet: string;
  username: string;
  avatar?: string;
  bio?: string;
  /** Opted into creator mode — can accept lines challenging them. */
  isCreator?: boolean;
  /** Social graph counts (populated on profile/user fetches). */
  followerCount?: number;
  followingCount?: number;
  /** True once followerCount ≥ CREATOR_PROGRAM_FOLLOWER_THRESHOLD — earns the pool cut. */
  creatorProgram?: boolean;
  /** Reputation: number of accepted lines the influencer no-showed (didn't post final proof). */
  noShows?: number;
  createdAt: string; // ISO
}

/** Follower count at/above this unlocks the creator program (earns the pool cut). */
export const CREATOR_PROGRAM_FOLLOWER_THRESHOLD = 10;

/** Result of toggling a follow on a user. */
export interface FollowResult {
  /** The wallet being followed/unfollowed. */
  wallet: string;
  following: boolean;
  followerCount: number;
}

export interface Challenge {
  id: string;
  /** The influencer / subject of the line — posts proof, appears on the card. */
  creatorWallet: string;
  /** Who proposed (challenged) this line. Absent on legacy self-created challenges. */
  challengerWallet?: string;
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

  /** Influencer must accept before this time, else the line refunds. */
  acceptDeadline?: string; // ISO
  /** Bets close at this time — equal to the deadline (betting stays open until then). */
  betLockAt?: string; // ISO
  /** Fee split applied at resolution (basis points of the pool). */
  creatorFeeBps?: number;
  platformFeeBps?: number;

  /** Trusted-oracle verdict on the final proof (set when entering under_review). */
  verdict?: OracleVerdict;
  /** Outcome the oracle proposes; null when it needs manual review. */
  proposedOutcome?: Outcome;
  /** Disputes accepted until this time; after it the line auto-finalizes. */
  disputeWindowEndsAt?: string; // ISO

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
  /** Number of wallets that liked this line. */
  likeCount?: number;
  /** Whether the requesting viewer liked it (populated on viewer-aware endpoints). */
  likedByMe?: boolean;

  createdAt: string; // ISO
}

export interface Photo {
  id: string;
  /** Wallet that posted this. */
  authorWallet?: string;
  /** Set when the post is attached to a line (progress / final proof); absent for standalone posts. */
  challengeId?: string;
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

/** Realized payout split at resolution (mirrors the on-chain claim math). */
export interface Settlement {
  outcome: BetSide;
  totalPoolLamports: number;
  winningPoolLamports: number;
  losingPoolLamports: number;
  /** The influencer's creator-program cut, taken from the losing pool. */
  creatorPayoutLamports: number;
  platformPayoutLamports: number;
  /** Remaining losing pool, split proportionally among the winners. */
  distributableLamports: number;
  /** True when one-sided / no winners → all stakes refunded, no fees. */
  refunded: boolean;
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

/** Result of GET /api/users/check-username — drives live username validation. */
export interface UsernameCheck {
  available: boolean;
  /** Why it's unavailable (taken or malformed); absent when available. */
  reason?: string;
}

/**
 * Create a line: a challenger proposes a goal for an influencer and seeds the
 * first bet. The line opens as `pending_accept` until the influencer accepts.
 */
export interface CreateChallengeBody {
  /** Who is proposing the line. */
  challengerWallet: string;
  /** Who is being challenged (becomes the line's creatorWallet / subject). */
  influencerWallet: string;
  title: string;
  goalText: string;
  successCriteria: string;
  /** Optional unit for the numeric progress metric (e.g. "kg"). */
  metricUnit?: string;
  /** Set when built from a pre-made template (skips AI review). Absent = custom goal → AI-reviewed. */
  templateId?: string;
  deadline: string; // ISO
  /** The challenger's conviction — which side they seed. */
  seedSide: BetSide;
  /** The challenger's seed stake (lamports). */
  seedAmountLamports: number;
}

/** Influencer accepts a line challenging them (caller must be the influencer). */
export interface AcceptLineBody {
  influencerWallet: string;
}

/** Influencer declines a line (refunds the challenger's seed). */
export interface DeclineLineBody {
  influencerWallet: string;
}

/** Contest the oracle verdict during the dispute window. */
export interface DisputeLineBody {
  wallet: string;
  reason?: string;
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
  /** Author of the post. */
  authorWallet: string;
  /** Optional — attach the post to a line (progress / final proof). Omit for a standalone post. */
  challengeId?: string;
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
  /** Realized payout split — present once the line is resolved. */
  settlement?: Settlement;
}

/** A bettor's position: their bet joined with the market it was placed on. */
export interface PortfolioPosition {
  bet: Bet;
  challenge: Challenge;
  /** Realized payout for this bet once resolved (stake back + winnings, or refund). */
  payoutLamports?: number;
  won?: boolean;
  refunded?: boolean;
}

/** An Instagram-style post for the social feed (standalone, or attached to a line). */
export interface FeedPost {
  photo: Photo;
  /** The attached line, if this post is progress/final proof for one; null for standalone posts. */
  challenge: Challenge | null;
  /** The post's author. */
  creator: User | null;
  likeCount: number;
  /** Whether the requesting wallet (if provided) has liked this post. */
  likedByMe: boolean;
  /** Comments live on the attached line's thread (0 for standalone posts). */
  commentCount: number;
}

/** A creator's public profile: their lines and their post grid. */
export interface Profile {
  wallet: string;
  user: User | null;
  challenges: Challenge[];
  posts: FeedPost[];
  /** Whether the requesting viewer follows this wallet. */
  isFollowedByViewer?: boolean;
  /** Total creator-program earnings as the influencer across resolved lines (lamports). */
  creatorEarningsLamports?: number;
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
  // --- Calisthenics holds & skills: high dazzle, near-binary to judge --------
  {
    id: 'handstand',
    label: 'Freestanding handstand hold',
    unit: 'sec',
    valuePrompt: 'Hold duration (seconds)',
    titleTemplate: 'Freestanding handstand for {value}s',
    goalTemplate: 'Balance a freestanding handstand for {value} seconds before the deadline.',
    criteriaTemplate:
      'A single continuous video shows a freestanding handstand — both feet clearly away from any wall or support — held for at least {value} seconds, with a visible running timer or stopwatch in frame.',
  },
  {
    id: 'muscleup',
    label: 'Strict bar muscle-ups',
    unit: 'reps',
    valuePrompt: 'Number of reps',
    titleTemplate: '{value} strict bar muscle-up(s)',
    goalTemplate: 'Perform {value} strict bar muscle-up(s) before the deadline.',
    criteriaTemplate:
      'A single continuous video shows {value} strict bar muscle-up rep(s): each starting from a dead hang and finishing with the arms locked out and the torso above the bar, with no kipping or leg swing.',
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
    id: 'pistol',
    label: 'Pistol squats (one leg)',
    unit: 'reps',
    valuePrompt: 'Number of reps',
    titleTemplate: '{value} pistol squats',
    goalTemplate: 'Do {value} consecutive one-leg pistol squats before the deadline.',
    criteriaTemplate:
      'A single continuous video shows {value} consecutive pistol squats on one leg: descending to full depth with the free leg held off the floor and standing back up, without the free leg or hands touching down between reps.',
  },
  {
    id: 'lsit',
    label: 'L-sit hold',
    unit: 'sec',
    valuePrompt: 'Hold duration (seconds)',
    titleTemplate: 'L-sit for {value}s',
    goalTemplate: 'Hold an L-sit for {value} seconds before the deadline.',
    criteriaTemplate:
      'A single continuous video shows an L-sit — hips off the ground with both legs straight and held parallel to the floor — for at least {value} seconds, with a visible timer in frame.',
  },
  {
    id: 'frontlever',
    label: 'Front lever hold',
    unit: 'sec',
    valuePrompt: 'Hold duration (seconds)',
    titleTemplate: 'Front lever for {value}s',
    goalTemplate: 'Hold a front lever for {value} seconds before the deadline.',
    criteriaTemplate:
      'A single continuous video shows a front lever — body horizontal, straight, and roughly parallel to the ground while hanging from a bar — held for at least {value} seconds, with a visible timer in frame.',
  },
  {
    id: 'humanflag',
    label: 'Human flag hold',
    unit: 'sec',
    valuePrompt: 'Hold duration (seconds)',
    titleTemplate: 'Human flag for {value}s',
    goalTemplate: 'Hold a human flag for {value} seconds before the deadline.',
    criteriaTemplate:
      'A single continuous video shows a human flag — body horizontal off a vertical pole with both arms locked out — held for at least {value} seconds, with a visible timer in frame.',
  },
  {
    id: 'plank',
    label: 'Plank hold',
    unit: 'sec',
    valuePrompt: 'Duration (seconds)',
    titleTemplate: 'Hold a {value}-second plank',
    goalTemplate: 'Hold a forearm plank for {value} seconds straight before the deadline.',
    criteriaTemplate:
      'A single continuous video shows a forearm plank held with a straight body line for at least {value} seconds, with a visible running timer or stopwatch in frame.',
  },
  // --- Physique reveals: max dazzle; judged from the final photo -------------
  {
    id: 'sixpack',
    label: 'Reveal a visible six-pack',
    titleTemplate: 'Reveal a visible six-pack',
    goalTemplate: 'Get visible six-pack abs by the deadline.',
    criteriaTemplate:
      'The final photo shows the bare midsection standing relaxed (NOT flexed or crunched) under even front lighting, with all six abdominal segments individually distinguishable.',
  },
  {
    id: 'bicepvein',
    label: 'Pop a visible bicep vein',
    titleTemplate: 'Pop a visible bicep vein',
    goalTemplate: 'Develop a clearly visible bicep vein when flexed by the deadline.',
    criteriaTemplate:
      'The final photo shows the upper arm flexed, with a distinct raised vein (the cephalic vein) clearly visible running along the front of the bicep in good lighting.',
  },
  {
    id: 'serratus',
    label: 'Show serratus definition',
    titleTemplate: 'Show off serratus "shark gills"',
    goalTemplate: 'Reveal defined serratus muscles ("shark gills") by the deadline.',
    criteriaTemplate:
      'The final photo shows the side of the torso with the serratus muscles individually defined and visible as finger-like striations along the ribcage under even lighting.',
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
} as const;
