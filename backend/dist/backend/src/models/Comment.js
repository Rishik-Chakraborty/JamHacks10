"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentModel = void 0;
exports.commentToDTO = commentToDTO;
/**
 * Comment / reaction mongoose model. Stored in the `comments` collection.
 */
const mongoose_1 = require("mongoose");
const commentSchema = new mongoose_1.Schema({
    challengeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
    wallet: { type: String, required: true },
    type: { type: String, enum: ['comment', 'fire', 'skull', 'muscle'], required: true },
    body: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'comments' });
commentSchema.index({ challengeId: 1, createdAt: -1 });
exports.CommentModel = (0, mongoose_1.model)('Comment', commentSchema);
/** Serialize a Mongo doc to the wire `Comment` DTO. */
function commentToDTO(doc) {
    return {
        id: doc._id.toString(),
        challengeId: doc.challengeId.toString(),
        wallet: doc.wallet,
        type: doc.type,
        body: doc.body ?? undefined,
        createdAt: doc.get('createdAt').toISOString(),
    };
}
