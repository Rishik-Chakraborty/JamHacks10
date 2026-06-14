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
const resolve_1 = require("../services/resolve");
const validate_1 = require("../middleware/validate");
const error_1 = require("../middleware/error");
exports.photosRouter = (0, express_1.Router)();
/** Mounted under /api/challenges for the per-challenge photo list route. */
exports.challengePhotosRouter = (0, express_1.Router)({ mergeParams: true });
/** Inline base64 threshold: store decoded payloads under 1MB inline, else GridFS. */
const INLINE_LIMIT_BYTES = 1024 * 1024;
const createPhotoSchema = zod_1.z.object({
    authorWallet: zod_1.z.string().min(1),
    challengeId: zod_1.z.string().min(1).optional(),
    capturedAt: zod_1.z.string().datetime(),
    imageData: zod_1.z.string().min(1),
    mimeType: zod_1.z.string().min(1),
    frames: zod_1.z.array(zod_1.z.string().min(1)).max(8).optional(),
    metricValue: zod_1.z.number().optional(),
    caption: zod_1.z.string().max(280).optional(),
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
    // A post may be standalone (no challengeId) or attached to a line (progress
    // / final proof). Only the line's influencer may post to it.
    let challengeObjId;
    let challenge = null;
    if (body.challengeId) {
        challengeObjId = assertObjectId(body.challengeId, 'challenge');
        challenge = await Challenge_1.ChallengeModel.findById(challengeObjId);
        if (!challenge)
            throw new error_1.HttpError(404, 'Line not found');
        if (challenge.creatorWallet !== body.authorWallet) {
            throw new error_1.HttpError(403, 'Only the influencer can post to this line');
        }
    }
    const decoded = decodeBase64Image(body.imageData);
    const isLarge = decoded.byteLength >= INLINE_LIMIT_BYTES;
    let gridFsId;
    if (isLarge) {
        const bucket = (0, db_1.getBucket)();
        gridFsId = await new Promise((resolve, reject) => {
            const upload = bucket.openUploadStream(`${body.authorWallet}-${Date.now()}`, {
                contentType: body.mimeType,
            });
            upload.on('error', reject);
            upload.on('finish', () => resolve(upload.id));
            upload.end(decoded);
        });
    }
    const doc = await Photo_1.PhotoModel.create({
        authorWallet: body.authorWallet,
        challengeId: challengeObjId,
        capturedAt: new Date(body.capturedAt),
        imageData: isLarge ? undefined : body.imageData,
        gridFsId,
        mimeType: body.mimeType,
        frames: body.frames && body.frames.length > 0 ? body.frames : undefined,
        metricValue: body.metricValue,
        caption: body.caption,
        isFinal: body.isFinal ?? false,
    });
    // Line-attached posts bump the line's momentum + (optionally) its metric series.
    if (challenge && challengeObjId) {
        await Challenge_1.ChallengeModel.updateOne({ _id: challengeObjId }, { $set: { lastPostAt: new Date() }, $inc: { streak: 1, hypeScore: 1 } });
        if (typeof body.metricValue === 'number') {
            await Metric_1.MetricModel.create({
                challengeId: challengeObjId,
                ts: new Date(body.capturedAt),
                unit: challenge.metricUnit ?? undefined,
                value: body.metricValue,
            });
        }
    }
    res.status(201).json((0, Photo_1.photoToDTO)(doc));
    // The FINAL post for a line kicks off the AI Trusted Oracle review (async).
    if (body.challengeId && body.isFinal) {
        void (0, resolve_1.reviewChallenge)(body.challengeId).catch((e) => console.warn('[photos] oracle review trigger failed:', e));
    }
}));
// DELETE /api/photos/:id — remove a post you authored (and its GridFS bytes).
const deletePhotoSchema = zod_1.z.object({ wallet: zod_1.z.string().min(1) });
exports.photosRouter.delete('/:id', (0, validate_1.validateBody)(deletePhotoSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id, 'photo');
    const { wallet } = req.body;
    const photo = await Photo_1.PhotoModel.findById(_id);
    if (!photo)
        throw new error_1.HttpError(404, 'Photo not found');
    // Only the post's author may delete it.
    if (photo.authorWallet !== wallet) {
        throw new error_1.HttpError(403, 'You can only delete your own posts');
    }
    // A final-proof photo is the evidence the AI oracle judges and the no-show
    // sweep checks — deleting it would strand resolution / mis-fire a refund.
    if (photo.isFinal && photo.challengeId) {
        throw new error_1.HttpError(409, "You can't delete the final proof of a line.");
    }
    // Drop the GridFS bytes first so we don't orphan them. Tolerate already-missing
    // bytes (e.g. a prior half-delete) so a post can never become undeletable.
    if (photo.gridFsId) {
        try {
            await (0, db_1.getBucket)().delete(photo.gridFsId);
        }
        catch (err) {
            if (!/file not found/i.test(err.message))
                throw err;
        }
    }
    await photo.deleteOne();
    res.json({ id: _id.toString() });
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
