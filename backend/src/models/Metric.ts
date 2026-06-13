/**
 * Metric time-series point — recharts progress + Hype Meter input.
 * Stored in the `metrics` collection (queried as a time series by challenge).
 */
import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { MetricPoint, MetricType } from '../contract';

const metricSchema = new Schema(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true },
    ts: { type: Date, required: true },
    metricType: { type: String, enum: ['weight', 'bench', 'visual'], required: true },
    value: { type: Number, required: true },
  },
  { collection: 'metrics' },
);

// Time-series access pattern: points for a challenge ordered by timestamp.
metricSchema.index({ challengeId: 1, ts: 1 });

export type MetricDoc = InferSchemaType<typeof metricSchema>;
export const MetricModel = model('Metric', metricSchema);

/** Serialize a Mongo doc to the wire `MetricPoint` DTO. */
export function metricToDTO(doc: HydratedDocument<MetricDoc>): MetricPoint {
  return {
    challengeId: doc.challengeId.toString(),
    ts: doc.ts.toISOString(),
    metricType: doc.metricType as MetricType,
    value: doc.value,
  };
}
