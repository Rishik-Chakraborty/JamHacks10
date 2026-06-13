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
    createdAt: (doc.get('createdAt') as Date).toISOString(),
  };
}
