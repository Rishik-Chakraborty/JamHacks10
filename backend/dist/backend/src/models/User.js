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
    avatar: { type: String },
    bio: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'users' });
exports.UserModel = (0, mongoose_1.model)('User', userSchema);
/** Serialize a Mongo doc to the wire `User` DTO. */
function userToDTO(doc) {
    return {
        id: doc._id.toString(),
        wallet: doc.wallet,
        username: doc.username,
        avatar: doc.avatar ?? undefined,
        bio: doc.bio ?? undefined,
        createdAt: doc.get('createdAt').toISOString(),
    };
}
