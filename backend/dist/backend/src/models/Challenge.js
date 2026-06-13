"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChallengeModel = void 0;
exports.challengeToDTO = challengeToDTO;
/**
 * Challenge mongoose model — the core fitness goal + mirrored on-chain market
 * state. Stored in the `challenges` collection.
 */
const mongoose_1 = require("mongoose");
const challengeSchema = new mongoose_1.Schema({
    creatorWallet: { type: String, required: true, index: true },
    title: { type: String, required: true },
    goalText: { type: String, required: true },
    successCriteria: { type: String, required: true },
    metricType: { type: String, enum: ['weight', 'bench', 'visual'], required: true },
    startDate: { type: Date, required: true },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ['active', 'resolved'], default: 'active' },
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
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'challenges' });
// Fast listing/filtering of open markets nearing their deadline.
challengeSchema.index({ status: 1, deadline: 1 });
exports.ChallengeModel = (0, mongoose_1.model)('Challenge', challengeSchema);
/** Serialize a Mongo doc to the wire `Challenge` DTO. */
function challengeToDTO(doc) {
    const lastPostAt = doc.lastPostAt ? doc.lastPostAt.toISOString() : undefined;
    return {
        id: doc._id.toString(),
        creatorWallet: doc.creatorWallet,
        title: doc.title,
        goalText: doc.goalText,
        successCriteria: doc.successCriteria,
        metricType: doc.metricType,
        startDate: doc.startDate.toISOString(),
        deadline: doc.deadline.toISOString(),
        status: doc.status,
        marketPda: doc.marketPda ?? undefined,
        vaultPda: doc.vaultPda ?? undefined,
        programId: doc.programId ?? undefined,
        outcome: (doc.outcome ?? null),
        yesPoolLamports: doc.yesPoolLamports,
        noPoolLamports: doc.noPoolLamports,
        impliedYes: doc.impliedYes,
        hypeScore: doc.hypeScore,
        streak: doc.streak,
        misses: doc.misses,
        lastPostAt,
        createdAt: doc.get('createdAt').toISOString(),
    };
}
