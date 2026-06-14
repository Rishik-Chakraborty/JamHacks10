/**
 * Photos router.
 *  POST /api/photos                     — create (inline base64 if small, GridFS if large)
 *  GET  /api/photos/:id/image           — stream raw image bytes
 *  GET  /api/challenges/:id/photos       — list by challenge (mounted from challenges path)
 */
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import type { CreatePhotoBody } from '../contract';
import { PhotoModel, photoToDTO } from '../models/Photo';
import { ChallengeModel } from '../models/Challenge';
import { MetricModel } from '../models/Metric';
import { getBucket } from '../config/db';
import { reviewChallenge } from '../services/resolve';
import { validateBody, asyncHandler } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const photosRouter = Router();
/** Mounted under /api/challenges for the per-challenge photo list route. */
export const challengePhotosRouter = Router({ mergeParams: true });

/** Inline base64 threshold: store decoded payloads under 1MB inline, else GridFS. */
const INLINE_LIMIT_BYTES = 1024 * 1024;

const createPhotoSchema: z.ZodType<CreatePhotoBody> = z.object({
  authorWallet: z.string().min(1),
  challengeId: z.string().min(1).optional(),
  capturedAt: z.string().datetime(),
  imageData: z.string().min(1),
  mimeType: z.string().min(1),
  frames: z.array(z.string().min(1)).max(8).optional(),
  metricValue: z.number().optional(),
  caption: z.string().max(280).optional(),
  isFinal: z.boolean().optional(),
});

/** Strip an optional `data:...;base64,` prefix and decode to a Buffer. */
function decodeBase64Image(imageData: string): Buffer {
  const comma = imageData.indexOf(',');
  const b64 = imageData.startsWith('data:') && comma !== -1 ? imageData.slice(comma + 1) : imageData;
  return Buffer.from(b64, 'base64');
}

function assertObjectId(id: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, `Invalid ${label} id`);
  return new Types.ObjectId(id);
}

// POST /api/photos
photosRouter.post(
  '/',
  validateBody(createPhotoSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CreatePhotoBody;

    // A post may be standalone (no challengeId) or attached to a line (progress
    // / final proof). Only the line's influencer may post to it.
    let challengeObjId: Types.ObjectId | undefined;
    let challenge = null;
    if (body.challengeId) {
      challengeObjId = assertObjectId(body.challengeId, 'challenge');
      challenge = await ChallengeModel.findById(challengeObjId);
      if (!challenge) throw new HttpError(404, 'Line not found');
      if (challenge.creatorWallet !== body.authorWallet) {
        throw new HttpError(403, 'Only the influencer can post to this line');
      }
    }

    const decoded = decodeBase64Image(body.imageData);
    const isLarge = decoded.byteLength >= INLINE_LIMIT_BYTES;

    let gridFsId: Types.ObjectId | undefined;
    if (isLarge) {
      const bucket = getBucket();
      gridFsId = await new Promise<Types.ObjectId>((resolve, reject) => {
        const upload = bucket.openUploadStream(`${body.authorWallet}-${Date.now()}`, {
          contentType: body.mimeType,
        });
        upload.on('error', reject);
        upload.on('finish', () => resolve(upload.id as Types.ObjectId));
        upload.end(decoded);
      });
    }

    const doc = await PhotoModel.create({
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
      await ChallengeModel.updateOne(
        { _id: challengeObjId },
        { $set: { lastPostAt: new Date() }, $inc: { streak: 1, hypeScore: 1 } },
      );
      if (typeof body.metricValue === 'number') {
        await MetricModel.create({
          challengeId: challengeObjId,
          ts: new Date(body.capturedAt),
          unit: challenge.metricUnit ?? undefined,
          value: body.metricValue,
        });
      }
    }

    res.status(201).json(photoToDTO(doc));

    // The FINAL post for a line kicks off the AI Trusted Oracle review (async).
    if (body.challengeId && body.isFinal) {
      void reviewChallenge(body.challengeId).catch((e) =>
        console.warn('[photos] oracle review trigger failed:', e),
      );
    }
  }),
);

// DELETE /api/photos/:id — remove a post you authored (and its GridFS bytes).
const deletePhotoSchema = z.object({ wallet: z.string().min(1) });
photosRouter.delete(
  '/:id',
  validateBody(deletePhotoSchema),
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id, 'photo');
    const { wallet } = req.body as z.infer<typeof deletePhotoSchema>;

    const photo = await PhotoModel.findById(_id);
    if (!photo) throw new HttpError(404, 'Photo not found');
    // Only the post's author may delete it.
    if (photo.authorWallet !== wallet) {
      throw new HttpError(403, 'You can only delete your own posts');
    }
    // A final-proof photo is the evidence the AI oracle judges and the no-show
    // sweep checks — deleting it while the line is still live would strand
    // resolution / mis-fire a refund. Once the line has gone inactive (settled or
    // refunded) neither the oracle nor the sweep touches it again, so it's safe to
    // remove. A missing/orphaned line is also safe (nothing left to strand).
    if (photo.isFinal && photo.challengeId) {
      const challenge = await ChallengeModel.findById(photo.challengeId).select('status');
      const inactive =
        !challenge || challenge.status === 'resolved' || challenge.status === 'refunded';
      if (!inactive) {
        throw new HttpError(409, "You can't delete the final proof of an active line.");
      }
    }

    // Drop the GridFS bytes first so we don't orphan them. Tolerate already-missing
    // bytes (e.g. a prior half-delete) so a post can never become undeletable.
    if (photo.gridFsId) {
      try {
        await getBucket().delete(photo.gridFsId as Types.ObjectId);
      } catch (err) {
        if (!/file not found/i.test((err as Error).message)) throw err;
      }
    }
    await photo.deleteOne();

    res.json({ id: _id.toString() });
  }),
);

// GET /api/photos/:id/image — stream bytes (inline base64 or GridFS).
photosRouter.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id, 'photo');
    const photo = await PhotoModel.findById(_id);
    if (!photo) throw new HttpError(404, 'Photo not found');

    res.setHeader('Content-Type', photo.mimeType || 'application/octet-stream');

    if (photo.gridFsId) {
      const bucket = getBucket();
      const stream = bucket.openDownloadStream(photo.gridFsId as Types.ObjectId);
      stream.on('error', () => {
        if (!res.headersSent) res.status(404).json({ error: 'Image bytes not found' });
      });
      stream.pipe(res);
      return;
    }

    if (photo.imageData) {
      res.send(decodeBase64Image(photo.imageData));
      return;
    }

    throw new HttpError(404, 'Photo has no image data');
  }),
);

// GET /api/challenges/:id/photos — list by challenge.
challengePhotosRouter.get(
  '/:id/photos',
  asyncHandler(async (req, res) => {
    const challengeId = assertObjectId(req.params.id, 'challenge');
    const docs = await PhotoModel.find({ challengeId }).sort({ createdAt: 1 });
    res.json(docs.map(photoToDTO));
  }),
);
