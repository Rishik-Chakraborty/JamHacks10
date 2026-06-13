/**
 * Challenge mongoose model — the core fitness goal + mirrored on-chain market
 * state. Stored in the `challenges` collection.
 */
import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { Challenge, ChallengeStatus, Outcome, OracleVerdict } from '../contract';

const challengeSchema = new Schema(
  {
    /** The influencer / subject of the line. */
    creatorWallet: { type: String, required: true, index: true },
    /** Who proposed the line (the challenger). */
    challengerWallet: { type: String, index: true },
    title: { type: String, required: true },
    goalText: { type: String, required: true },
    successCriteria: { type: String, required: true },
    /** Optional unit for the numeric progress metric (e.g. "kg", "reps"). */
    metricUnit: { type: String },
    /** Pre-made template id; absent = AI-approved custom goal. */
    templateId: { type: String },
    startDate: { type: Date, required: true },
    deadline: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending_accept', 'active', 'under_review', 'disputed', 'resolved', 'refunded'],
      default: 'pending_accept',
    },
    /** Influencer must accept before this; else the line refunds. */
    acceptDeadline: { type: Date },
    /** Bets lock at this time (deadline − BET_LOCK_HOURS). */
    betLockAt: { type: Date },
    /** Fee split (basis points) applied at resolution. */
    creatorFeeBps: { type: Number },
    platformFeeBps: { type: Number },

    /** Trusted-oracle verdict + proposed outcome + dispute window (resolution pipeline). */
    verdict: { type: Schema.Types.Mixed },
    proposedOutcome: { type: String, enum: ['yes', 'no', null], default: null },
    disputeWindowEndsAt: { type: Date },

    // On-chain references (populated after initialize_market)
    marketPda: { type: String },
    vaultPda: { type: String },
    programId: { type: String },

    outcome: { type: String, enum: ['yes', 'no', null], default: null },

    // Pool state mirrored from chain for fast odds display
    yesPoolLamports: { type: Number, default: 0 },
    noPoolLamports: { type: Number, default: 0 },
    impliedYes: { type: Number, default: 0.5 },

    // Social / momentum
    hypeScore: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    misses: { type: Number, default: 0 },
    lastPostAt: { type: Date },
    /** Wallets that liked this line. */
    likes: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'challenges' },
);

// Fast listing/filtering of open markets nearing their deadline.
challengeSchema.index({ status: 1, deadline: 1 });

export type ChallengeDoc = InferSchemaType<typeof challengeSchema>;
export const ChallengeModel = model('Challenge', challengeSchema);

/** Serialize a Mongo doc to the wire `Challenge` DTO. */
export function challengeToDTO(doc: HydratedDocument<ChallengeDoc>): Challenge {
  const lastPostAt = doc.lastPostAt ? doc.lastPostAt.toISOString() : undefined;
  return {
    id: doc._id.toString(),
    creatorWallet: doc.creatorWallet,
    challengerWallet: doc.challengerWallet ?? undefined,
    title: doc.title,
    goalText: doc.goalText,
    successCriteria: doc.successCriteria,
    metricUnit: doc.metricUnit ?? undefined,
    templateId: doc.templateId ?? undefined,
    startDate: doc.startDate.toISOString(),
    deadline: doc.deadline.toISOString(),
    status: doc.status as ChallengeStatus,
    acceptDeadline: doc.acceptDeadline ? doc.acceptDeadline.toISOString() : undefined,
    betLockAt: doc.betLockAt ? doc.betLockAt.toISOString() : undefined,
    creatorFeeBps: doc.creatorFeeBps ?? undefined,
    platformFeeBps: doc.platformFeeBps ?? undefined,
    verdict: (doc.verdict as OracleVerdict | undefined) ?? undefined,
    proposedOutcome: (doc.proposedOutcome ?? null) as Outcome,
    disputeWindowEndsAt: doc.disputeWindowEndsAt ? doc.disputeWindowEndsAt.toISOString() : undefined,
    marketPda: doc.marketPda ?? undefined,
    vaultPda: doc.vaultPda ?? undefined,
    programId: doc.programId ?? undefined,
    outcome: (doc.outcome ?? null) as Outcome,
    yesPoolLamports: doc.yesPoolLamports,
    noPoolLamports: doc.noPoolLamports,
    impliedYes: doc.impliedYes,
    hypeScore: doc.hypeScore,
    streak: doc.streak,
    misses: doc.misses,
    lastPostAt,
    likeCount: (doc.likes ?? []).length,
    createdAt: (doc.get('createdAt') as Date).toISOString(),
  };
}
