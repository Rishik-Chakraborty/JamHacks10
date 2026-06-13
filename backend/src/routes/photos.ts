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
  challengeId: z.string().min(1),
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
    const challengeId = assertObjectId(body.challengeId, 'challenge');

    const challenge = await ChallengeModel.findById(challengeId);
    if (!challenge) throw new HttpError(404, 'Challenge not found');

    const decoded = decodeBase64Image(body.imageData);
    const isLarge = decoded.byteLength >= INLINE_LIMIT_BYTES;

    let gridFsId: Types.ObjectId | undefined;
    if (isLarge) {
      const bucket = getBucket();
      gridFsId = await new Promise<Types.ObjectId>((resolve, reject) => {
        const upload = bucket.openUploadStream(`${body.challengeId}-${Date.now()}`, {
          contentType: body.mimeType,
        });
        upload.on('error', reject);
        upload.on('finish', () => resolve(upload.id as Types.ObjectId));
        upload.end(decoded);
      });
    }

    const doc = await PhotoModel.create({
      challengeId,
      capturedAt: new Date(body.capturedAt),
      imageData: isLarge ? undefined : body.imageData,
      gridFsId,
      mimeType: body.mimeType,
      frames: body.frames && body.frames.length > 0 ? body.frames : undefined,
      metricValue: body.metricValue,
      caption: body.caption,
      isFinal: body.isFinal ?? false,
    });

    // Posting bumps momentum + records the most recent post time.
    const update: Record<string, unknown> = {
      $set: { lastPostAt: new Date() },
      $inc: { streak: 1, hypeScore: 1 },
    };
    await ChallengeModel.updateOne({ _id: challengeId }, update);

    // Any photo carrying a metric value appends a time-series progress point
    // (the final photo's metric also feeds the Hype Meter / resolution view).
    if (typeof body.metricValue === 'number') {
      await MetricModel.create({
        challengeId,
        ts: new Date(body.capturedAt),
        unit: challenge.metricUnit ?? undefined,
        value: body.metricValue,
      });
    }

    res.status(201).json(photoToDTO(doc));

    // Posting final proof kicks off the AI Trusted Oracle review (best-effort,
    // async — never blocks the upload). Sets the line to under_review + verdict.
    if (body.isFinal) {
      void reviewChallenge(body.challengeId).catch((e) =>
        console.warn('[photos] oracle review trigger failed:', e),
      );
    }
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
