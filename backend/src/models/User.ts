/**
 * User mongoose model. Identified by Solana wallet (unique).
 * Stored in the `users` collection.
 */
import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { User } from '../contract';

const userSchema = new Schema(
  {
    wallet: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    avatar: { type: String },
    bio: { type: String },
    /** Opted into creator mode (set when they accept their first line). */
    isCreator: { type: Boolean, default: false },
    /** Reputation: count of accepted lines the influencer no-showed. */
    noShows: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'users' },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);

/** Serialize a Mongo doc to the wire `User` DTO. */
export function userToDTO(doc: HydratedDocument<UserDoc>): User {
  return {
    id: doc._id.toString(),
    wallet: doc.wallet,
    username: doc.username,
    avatar: doc.avatar ?? undefined,
    bio: doc.bio ?? undefined,
    isCreator: doc.isCreator ?? false,
    noShows: doc.noShows ?? 0,
    createdAt: (doc.get('createdAt') as Date).toISOString(),
  };
}
