/**
 * Follow edge — `follower` follows `following` (both wallet addresses).
 * The social graph that powers follower counts, the creator program, and the
 * line-suggestion algorithm. Stored in the `follows` collection.
 */
import { Schema, model, type InferSchemaType } from 'mongoose';

const followSchema = new Schema(
  {
    follower: { type: String, required: true, index: true },
    following: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'follows' },
);

// One edge per (follower, following) pair; also the fast "do I follow X" lookup.
followSchema.index({ follower: 1, following: 1 }, { unique: true });

export type FollowDoc = InferSchemaType<typeof followSchema>;
export const FollowModel = model('Follow', followSchema);

/** Follower / following counts for a wallet. */
export async function followCounts(wallet: string): Promise<{ followerCount: number; followingCount: number }> {
  const [followerCount, followingCount] = await Promise.all([
    FollowModel.countDocuments({ following: wallet }),
    FollowModel.countDocuments({ follower: wallet }),
  ]);
  return { followerCount, followingCount };
}

/** Whether `follower` currently follows `following`. */
export async function isFollowing(follower: string, following: string): Promise<boolean> {
  if (!follower || follower === following) return false;
  return (await FollowModel.exists({ follower, following })) !== null;
}
