/**
 * Bet mongoose model — an on-chain bet mirrored into Mongo, idempotent on the
 * tx signature. Stored in the `bets` collection.
 */
import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { Bet, BetSide } from '../contract';

const betSchema = new Schema(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true },
    bettorWallet: { type: String, required: true },
    side: { type: String, enum: ['yes', 'no'], required: true },
    amountLamports: { type: Number, required: true },
    /** Unique idempotency key for chain mirroring. */
    txSig: { type: String, required: true, unique: true },
    positionPda: { type: String, required: true },
    claimed: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'bets' },
);

betSchema.index({ challengeId: 1, createdAt: -1 });

export type BetDoc = InferSchemaType<typeof betSchema>;
export const BetModel = model('Bet', betSchema);

/** Serialize a Mongo doc to the wire `Bet` DTO. */
export function betToDTO(doc: HydratedDocument<BetDoc>): Bet {
  return {
    id: doc._id.toString(),
    challengeId: doc.challengeId.toString(),
    bettorWallet: doc.bettorWallet,
    side: doc.side as BetSide,
    amountLamports: doc.amountLamports,
    txSig: doc.txSig,
    positionPda: doc.positionPda,
    claimed: doc.claimed,
    createdAt: (doc.get('createdAt') as Date).toISOString(),
  };
}
