"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhotoModel = void 0;
exports.photoToDTO = photoToDTO;
/**
 * Photo mongoose model. Small images stored inline as base64 data URLs;
 * larger images stored in GridFS and referenced by `gridFsId`.
 * Stored in the `photos` collection.
 */
const mongoose_1 = require("mongoose");
const photoSchema = new mongoose_1.Schema({
    /** Wallet that posted this. */
    authorWallet: { type: String, index: true },
    /** Set when attached to a line (progress / final proof); absent for standalone posts. */
    challengeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Challenge', index: true },
    capturedAt: { type: Date, required: true },
    /** Inline base64 data URL for small images. */
    imageData: { type: String },
    /** GridFS file id for large images. */
    gridFsId: { type: mongoose_1.Schema.Types.ObjectId },
    mimeType: { type: String, required: true },
    /** For videos: still frames (base64 JPEG data URLs) the AI oracle judges. */
    frames: { type: [String], default: undefined },
    metricValue: { type: Number },
    caption: { type: String },
    /** Wallets that have liked this post. */
    likes: { type: [String], default: [] },
    isFinal: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'photos' });
photoSchema.index({ challengeId: 1, createdAt: -1 });
exports.PhotoModel = (0, mongoose_1.model)('Photo', photoSchema);
/** Serialize a Mongo doc to the wire `Photo` DTO. */
function photoToDTO(doc) {
    const gridFsId = doc.gridFsId;
    return {
        id: doc._id.toString(),
        authorWallet: doc.authorWallet ?? undefined,
        challengeId: doc.challengeId ? doc.challengeId.toString() : undefined,
        capturedAt: doc.capturedAt.toISOString(),
        imageData: doc.imageData ?? undefined,
        gridFsId: gridFsId ? gridFsId.toString() : undefined,
        mimeType: doc.mimeType,
        frames: doc.frames && doc.frames.length > 0 ? doc.frames : undefined,
        metricValue: doc.metricValue ?? undefined,
        caption: doc.caption ?? undefined,
        isFinal: doc.isFinal,
        createdAt: doc.get('createdAt').toISOString(),
    };
}
