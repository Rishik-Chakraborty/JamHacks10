"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetModel = void 0;
exports.betToDTO = betToDTO;
/**
 * Bet mongoose model — an on-chain bet mirrored into Mongo, idempotent on the
 * tx signature. Stored in the `bets` collection.
 */
const mongoose_1 = require("mongoose");
const betSchema = new mongoose_1.Schema({
    challengeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Challenge', required: true },
    bettorWallet: { type: String, required: true },
    side: { type: String, enum: ['yes', 'no'], required: true },
    amountLamports: { type: Number, required: true },
    /** Unique idempotency key for chain mirroring. */
    txSig: { type: String, required: true, unique: true },
    positionPda: { type: String, required: true },
    claimed: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'bets' });
betSchema.index({ challengeId: 1, createdAt: -1 });
exports.BetModel = (0, mongoose_1.model)('Bet', betSchema);
/** Serialize a Mongo doc to the wire `Bet` DTO. */
function betToDTO(doc) {
    return {
        id: doc._id.toString(),
        challengeId: doc.challengeId.toString(),
        bettorWallet: doc.bettorWallet,
        side: doc.side,
        amountLamports: doc.amountLamports,
        txSig: doc.txSig,
        positionPda: doc.positionPda,
        claimed: doc.claimed,
        createdAt: doc.get('createdAt').toISOString(),
    };
}
