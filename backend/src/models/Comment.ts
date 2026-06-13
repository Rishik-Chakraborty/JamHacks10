/**
 * Comment / reaction mongoose model. Stored in the `comments` collection.
 */
import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { Comment, ReactionType } from '../contract';

const commentSchema = new Schema(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
    wallet: { type: String, required: true },
    type: { type: String, enum: ['comment', 'fire', 'skull', 'muscle'], required: true },
    body: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'comments' },
);

commentSchema.index({ challengeId: 1, createdAt: -1 });

export type CommentDoc = InferSchemaType<typeof commentSchema>;
export const CommentModel = model('Comment', commentSchema);

/** Serialize a Mongo doc to the wire `Comment` DTO. */
export function commentToDTO(doc: HydratedDocument<CommentDoc>): Comment {
  return {
    id: doc._id.toString(),
    challengeId: doc.challengeId.toString(),
    wallet: doc.wallet,
    type: doc.type as ReactionType,
    body: doc.body ?? undefined,
    createdAt: (doc.get('createdAt') as Date).toISOString(),
  };
}
