"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricModel = void 0;
exports.metricToDTO = metricToDTO;
/**
 * Metric time-series point — recharts progress + Hype Meter input.
 * Stored in the `metrics` collection (queried as a time series by challenge).
 */
const mongoose_1 = require("mongoose");
const metricSchema = new mongoose_1.Schema({
    challengeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Challenge', required: true },
    ts: { type: Date, required: true },
    /** Optional unit label carried from the challenge (e.g. "kg"). */
    unit: { type: String },
    value: { type: Number, required: true },
}, { collection: 'metrics' });
// Time-series access pattern: points for a challenge ordered by timestamp.
metricSchema.index({ challengeId: 1, ts: 1 });
exports.MetricModel = (0, mongoose_1.model)('Metric', metricSchema);
/** Serialize a Mongo doc to the wire `MetricPoint` DTO. */
function metricToDTO(doc) {
    return {
        challengeId: doc.challengeId.toString(),
        ts: doc.ts.toISOString(),
        unit: doc.unit ?? undefined,
        value: doc.value,
    };
}
