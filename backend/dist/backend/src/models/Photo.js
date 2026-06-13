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
    challengeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
    capturedAt: { type: Date, required: true },
    /** Inline base64 data URL for small images. */
    imageData: { type: String },
    /** GridFS file id for large images. */
    gridFsId: { type: mongoose_1.Schema.Types.ObjectId },
    mimeType: { type: String, required: true },
    metricValue: { type: Number },
    isFinal: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'photos' });
photoSchema.index({ challengeId: 1, createdAt: -1 });
exports.PhotoModel = (0, mongoose_1.model)('Photo', photoSchema);
/** Serialize a Mongo doc to the wire `Photo` DTO. */
function photoToDTO(doc) {
    const gridFsId = doc.gridFsId;
    return {
        id: doc._id.toString(),
        challengeId: doc.challengeId.toString(),
        capturedAt: doc.capturedAt.toISOString(),
        imageData: doc.imageData ?? undefined,
        gridFsId: gridFsId ? gridFsId.toString() : undefined,
        mimeType: doc.mimeType,
        metricValue: doc.metricValue ?? undefined,
        isFinal: doc.isFinal,
        createdAt: doc.get('createdAt').toISOString(),
    };
}
