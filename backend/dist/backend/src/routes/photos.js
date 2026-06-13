"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.challengePhotosRouter = exports.photosRouter = void 0;
/**
 * Photos router.
 *  POST /api/photos                     — create (inline base64 if small, GridFS if large)
 *  GET  /api/photos/:id/image           — stream raw image bytes
 *  GET  /api/challenges/:id/photos       — list by challenge (mounted from challenges path)
 */
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const zod_1 = require("zod");
const Photo_1 = require("../models/Photo");
const Challenge_1 = require("../models/Challenge");
const Metric_1 = require("../models/Metric");
const db_1 = require("../config/db");
const validate_1 = require("../middleware/validate");
const error_1 = require("../middleware/error");
exports.photosRouter = (0, express_1.Router)();
/** Mounted under /api/challenges for the per-challenge photo list route. */
exports.challengePhotosRouter = (0, express_1.Router)({ mergeParams: true });
/** Inline base64 threshold: store decoded payloads under 1MB inline, else GridFS. */
const INLINE_LIMIT_BYTES = 1024 * 1024;
const createPhotoSchema = zod_1.z.object({
    challengeId: zod_1.z.string().min(1),
    capturedAt: zod_1.z.string().datetime(),
    imageData: zod_1.z.string().min(1),
    mimeType: zod_1.z.string().min(1),
    metricValue: zod_1.z.number().optional(),
    isFinal: zod_1.z.boolean().optional(),
});
/** Strip an optional `data:...;base64,` prefix and decode to a Buffer. */
function decodeBase64Image(imageData) {
    const comma = imageData.indexOf(',');
    const b64 = imageData.startsWith('data:') && comma !== -1 ? imageData.slice(comma + 1) : imageData;
    return Buffer.from(b64, 'base64');
}
function assertObjectId(id, label) {
    if (!mongoose_1.Types.ObjectId.isValid(id))
        throw new error_1.HttpError(400, `Invalid ${label} id`);
    return new mongoose_1.Types.ObjectId(id);
}
// POST /api/photos
exports.photosRouter.post('/', (0, validate_1.validateBody)(createPhotoSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    const challengeId = assertObjectId(body.challengeId, 'challenge');
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Challenge not found');
    const decoded = decodeBase64Image(body.imageData);
    const isLarge = decoded.byteLength >= INLINE_LIMIT_BYTES;
    let gridFsId;
    if (isLarge) {
        const bucket = (0, db_1.getBucket)();
        gridFsId = await new Promise((resolve, reject) => {
            const upload = bucket.openUploadStream(`${body.challengeId}-${Date.now()}`, {
                contentType: body.mimeType,
            });
            upload.on('error', reject);
            upload.on('finish', () => resolve(upload.id));
            upload.end(decoded);
        });
    }
    const doc = await Photo_1.PhotoModel.create({
        challengeId,
        capturedAt: new Date(body.capturedAt),
        imageData: isLarge ? undefined : body.imageData,
        gridFsId,
        mimeType: body.mimeType,
        metricValue: body.metricValue,
        isFinal: body.isFinal ?? false,
    });
    // Posting bumps momentum + records the most recent post time.
    const update = {
        $set: { lastPostAt: new Date() },
        $inc: { streak: 1, hypeScore: 1 },
    };
    await Challenge_1.ChallengeModel.updateOne({ _id: challengeId }, update);
    // Any photo carrying a metric value appends a time-series progress point
    // (the final photo's metric also feeds the Hype Meter / resolution view).
    if (typeof body.metricValue === 'number') {
        await Metric_1.MetricModel.create({
            challengeId,
            ts: new Date(body.capturedAt),
            metricType: challenge.metricType,
            value: body.metricValue,
        });
    }
    res.status(201).json((0, Photo_1.photoToDTO)(doc));
}));
// GET /api/photos/:id/image — stream bytes (inline base64 or GridFS).
exports.photosRouter.get('/:id/image', (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id, 'photo');
    const photo = await Photo_1.PhotoModel.findById(_id);
    if (!photo)
        throw new error_1.HttpError(404, 'Photo not found');
    res.setHeader('Content-Type', photo.mimeType || 'application/octet-stream');
    if (photo.gridFsId) {
        const bucket = (0, db_1.getBucket)();
        const stream = bucket.openDownloadStream(photo.gridFsId);
        stream.on('error', () => {
            if (!res.headersSent)
                res.status(404).json({ error: 'Image bytes not found' });
        });
        stream.pipe(res);
        return;
    }
    if (photo.imageData) {
        res.send(decodeBase64Image(photo.imageData));
        return;
    }
    throw new error_1.HttpError(404, 'Photo has no image data');
}));
// GET /api/challenges/:id/photos — list by challenge.
exports.challengePhotosRouter.get('/:id/photos', (0, validate_1.asyncHandler)(async (req, res) => {
    const challengeId = assertObjectId(req.params.id, 'challenge');
    const docs = await Photo_1.PhotoModel.find({ challengeId }).sort({ createdAt: 1 });
    res.json(docs.map(Photo_1.photoToDTO));
}));
