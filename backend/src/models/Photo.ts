/**
 * Photo mongoose model. Small images stored inline as base64 data URLs;
 * larger images stored in GridFS and referenced by `gridFsId`.
 * Stored in the `photos` collection.
 */
import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { Photo } from '../contract';

const photoSchema = new Schema(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
    capturedAt: { type: Date, required: true },
    /** Inline base64 data URL for small images. */
    imageData: { type: String },
    /** GridFS file id for large images. */
    gridFsId: { type: Schema.Types.ObjectId },
    mimeType: { type: String, required: true },
    metricValue: { type: Number },
    isFinal: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'photos' },
);

photoSchema.index({ challengeId: 1, createdAt: -1 });

export type PhotoDoc = InferSchemaType<typeof photoSchema>;
export const PhotoModel = model('Photo', photoSchema);

/** Serialize a Mongo doc to the wire `Photo` DTO. */
export function photoToDTO(doc: HydratedDocument<PhotoDoc>): Photo {
  const gridFsId = doc.gridFsId as Types.ObjectId | undefined | null;
  return {
    id: doc._id.toString(),
    challengeId: doc.challengeId.toString(),
    capturedAt: doc.capturedAt.toISOString(),
    imageData: doc.imageData ?? undefined,
    gridFsId: gridFsId ? gridFsId.toString() : undefined,
    mimeType: doc.mimeType,
    metricValue: doc.metricValue ?? undefined,
    isFinal: doc.isFinal,
    createdAt: (doc.get('createdAt') as Date).toISOString(),
  };
}
