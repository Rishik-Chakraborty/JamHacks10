"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
exports.userToDTO = userToDTO;
/**
 * User mongoose model. Identified by Solana wallet (unique).
 * Stored in the `users` collection.
 */
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    wallet: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    // username uniqueness enforced case-insensitively via the collation index below.
    avatar: { type: String },
    bio: { type: String },
    /** Opted into creator mode (set when they accept their first line). */
    isCreator: { type: Boolean, default: false },
    /** Reputation: count of accepted lines the influencer no-showed. */
    noShows: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'users' });
// Case-insensitive unique usernames: "Alice" and "alice" collide. The same
// collation must be passed on lookups (see routes/users.ts) for it to be used.
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
exports.UserModel = (0, mongoose_1.model)('User', userSchema);
/** Serialize a Mongo doc to the wire `User` DTO. */
function userToDTO(doc) {
    return {
        id: doc._id.toString(),
        wallet: doc.wallet,
        username: doc.username,
        avatar: doc.avatar ?? undefined,
        bio: doc.bio ?? undefined,
        isCreator: doc.isCreator ?? false,
        noShows: doc.noShows ?? 0,
        createdAt: doc.get('createdAt').toISOString(),
    };
}
