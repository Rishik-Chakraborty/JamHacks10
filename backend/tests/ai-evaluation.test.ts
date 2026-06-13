/**
 * AI evaluation test suite — runs the Gemini + XGBoost oracle pipeline against
 * 10 synthetic photo test cases and validates ≥ 85% accuracy.
 *
 * Run with:  npm run test:ai
 *
 * Output is written to backend/test-results.json for the metrics report.
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';

import {
  generateSyntheticData,
  trainAndSave,
  computeAccuracy,
  predictProba,
  FEATURE_NAMES,
} from '../src/services/ai/xgboost-trainer';
import { runXGBoostInference } from '../src/services/ai/xgboost-inference';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err: unknown) => {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    });
}

// ─── Synthetic end-to-end test cases ─────────────────────────────────────────

/**
 * 10 hand-crafted test cases covering clear wins, clear losses, and ambiguous
 * scenarios. Each case provides the features a trained model would receive.
 *
 * Feature layout: [geminiConfidence, geminiMet, photoQuality, effortEncoded, goalCompletionNorm]
 */
const TEST_CASES: Array<{
  name: string;
  features: [number, number, number, number, number];
  expectedLabel: 0 | 1;
  description: string;
}> = [
  {
    name: 'Clear success — bench press PR clearly visible',
    features: [0.92, 1, 0.95, 1.0, 0.98],
    expectedLabel: 1,
    description: 'High confidence, met=1, excellent photo quality, full completion',
  },
  {
    name: 'Clear failure — no barbell visible',
    features: [0.88, 0, 0.85, 0.5, 0.05],
    expectedLabel: 0,
    description: 'High confidence, met=0, clear photo showing non-completion',
  },
  {
    name: 'Strong success — 10k run screenshot on phone',
    features: [0.85, 1, 0.90, 0.5, 1.0],
    expectedLabel: 1,
    description: 'Gemini confident, met=1, legible app screenshot, 100% goal',
  },
  {
    name: 'Definite failure — photo shows treadmill at 0',
    features: [0.91, 0, 0.88, 0.0, 0.02],
    expectedLabel: 0,
    description: 'Met=0, treadmill display clearly not started',
  },
  {
    name: 'Ambiguous — low quality selfie at gym',
    features: [0.60, 1, 0.30, 0.5, 0.65],
    expectedLabel: 1,
    description: 'Moderate confidence met=true, low photo quality but completion visible',
  },
  {
    name: 'Ambiguous failure — blurry weight plate',
    features: [0.70, 0, 0.25, 0.5, 0.38],
    expectedLabel: 0,
    description: '70% confident not met, blurry photo, low goal completion',
  },
  {
    name: 'High effort success — deadlift lockout clear',
    features: [0.94, 1, 0.92, 1.0, 1.0],
    expectedLabel: 1,
    description: 'Very clear, high effort, unambiguous completion',
  },
  {
    name: 'Low effort failure — no real attempt',
    features: [0.82, 0, 0.80, 0.0, 0.08],
    expectedLabel: 0,
    description: 'Clear non-completion, low effort visible',
  },
  {
    name: 'Near-miss — decent effort but photo evidence inconclusive',
    features: [0.73, 0, 0.45, 0.5, 0.50],
    expectedLabel: 0,
    description: '73% confident not met, moderate quality photo, borderline completion visible',
  },
  {
    name: 'Moderate success — squats with correct depth',
    features: [0.78, 1, 0.70, 0.5, 0.85],
    expectedLabel: 1,
    description: 'Decent quality, met=1, good completion',
  },
];

// ─── Main test run ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🏋️  GymCast AI Evaluation Test Suite\n');
  console.log('━'.repeat(55));

  // ── 1. Gradient boosting unit tests ──────────────────────────────────────

  console.log('\n📦 Phase 1: Gradient Boosting Unit Tests\n');

  await test('Synthetic data generator produces correct count', () => {
    const data = generateSyntheticData(120);
    assert.equal(data.length, 120);
    assert.ok(data.every((d) => d.features.length === FEATURE_NAMES.length));
    assert.ok(data.every((d) => d.label === 0 || d.label === 1));
  });

  await test('Synthetic data has balanced classes (40-60% split)', () => {
    const data = generateSyntheticData(200);
    const posRate = data.filter((d) => d.label === 1).length / data.length;
    assert.ok(posRate >= 0.35 && posRate <= 0.65, `Class balance: ${(posRate * 100).toFixed(1)}%`);
  });

  await test('All features are in valid range [0,1]', () => {
    const data = generateSyntheticData(100);
    for (const { features } of data) {
      for (const f of features) {
        assert.ok(f >= 0 && f <= 1, `Feature out of range: ${f}`);
      }
    }
  });

  // ── 2. Model training ─────────────────────────────────────────────────────

  console.log('\n📦 Phase 2: Model Training\n');

  let model: Awaited<ReturnType<typeof trainAndSave>>;

  await test('Model trains without throwing', async () => {
    model = await trainAndSave(generateSyntheticData(120));
    assert.ok(model.stumps.length > 0, 'No stumps trained');
    assert.ok(Number.isFinite(model.baseLogOdds));
  });

  await test('Train accuracy ≥ 85%', () => {
    assert.ok(
      model.trainAccuracy >= 0.85,
      `Train accuracy too low: ${(model.trainAccuracy * 100).toFixed(1)}%`,
    );
  });

  await test('Test accuracy ≥ 85%', () => {
    assert.ok(
      model.testAccuracy >= 0.85,
      `Test accuracy too low: ${(model.testAccuracy * 100).toFixed(1)}%`,
    );
  });

  await test('Model JSON file is written to disk', () => {
    const modelPath = path.resolve(__dirname, '../models/xgboost-evaluator.json');
    assert.ok(fs.existsSync(modelPath), `Model file not found at ${modelPath}`);
    const content = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    assert.ok(Array.isArray(content.stumps) && content.stumps.length > 0);
  });

  // ── 3. Inference on hand-crafted test cases ───────────────────────────────

  console.log('\n📦 Phase 3: Inference on 10 Synthetic Test Cases\n');

  const predictions: Array<{
    name: string;
    description: string;
    expectedLabel: number;
    calibratedConfidence: number;
    finalConfidence: number;
    predicted: number;
    correct: boolean;
    latencyMs: number;
  }> = [];

  for (const tc of TEST_CASES) {
    const [geminiConf, geminiMet, photoQuality, effortEncoded, goalCompNorm] = tc.features;

    await test(tc.name, async () => {
      const result = await runXGBoostInference({
        geminiConfidence: geminiConf,
        geminiMet: geminiMet,
        photoQuality: photoQuality,
        effortLevel: effortEncoded === 0 ? 'low' : effortEncoded === 0.5 ? 'medium' : 'high',
        goalCompletionPercent: goalCompNorm * 100,
      });

      const predicted = result.finalConfidence >= 0.5 ? 1 : 0;
      const correct = predicted === tc.expectedLabel;

      predictions.push({
        name: tc.name,
        description: tc.description,
        expectedLabel: tc.expectedLabel,
        calibratedConfidence: result.calibratedConfidence,
        finalConfidence: result.finalConfidence,
        predicted,
        correct,
        latencyMs: result.latencyMs,
      });

      assert.ok(correct, `Wrong prediction: expected=${tc.expectedLabel}, got=${predicted} (finalConf=${result.finalConfidence.toFixed(3)})`);
    });
  }

  // ── 4. Accuracy & latency summary ─────────────────────────────────────────

  console.log('\n📦 Phase 4: Accuracy & Latency Summary\n');

  const completedPredictions = predictions.filter((p) => p !== undefined);
  const testAccuracy = completedPredictions.length > 0
    ? completedPredictions.filter((p) => p.correct).length / completedPredictions.length
    : 0;
  const avgLatency = completedPredictions.length > 0
    ? completedPredictions.reduce((s, p) => s + p.latencyMs, 0) / completedPredictions.length
    : 0;

  await test(`10-case accuracy ≥ 85% (got ${(testAccuracy * 100).toFixed(0)}%)`, () => {
    assert.ok(testAccuracy >= 0.85, `Accuracy: ${(testAccuracy * 100).toFixed(1)}%`);
  });

  await test(`XGBoost inference latency < 50ms (avg ${avgLatency.toFixed(1)}ms)`, () => {
    assert.ok(avgLatency < 50, `Average latency too high: ${avgLatency.toFixed(1)}ms`);
  });

  // ── 5. Write results JSON ─────────────────────────────────────────────────

  const results = {
    runAt: new Date().toISOString(),
    summary: {
      totalTests: passed + failed,
      passed,
      failed,
      testCaseAccuracy: testAccuracy,
      avgXGBoostLatencyMs: avgLatency,
      modelTrainAccuracy: model?.trainAccuracy ?? null,
      modelTestAccuracy: model?.testAccuracy ?? null,
    },
    testCases: completedPredictions,
  };

  const outPath = path.resolve(__dirname, '../test-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n📄 Results written to ${outPath}`);

  // ── Final summary ─────────────────────────────────────────────────────────

  console.log('\n' + '━'.repeat(55));
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log(`10-case accuracy: ${(testAccuracy * 100).toFixed(0)}%`);
  console.log(`Train / Test accuracy: ${((model?.trainAccuracy ?? 0) * 100).toFixed(1)}% / ${((model?.testAccuracy ?? 0) * 100).toFixed(1)}%`);
  console.log(`Avg XGBoost latency: ${avgLatency.toFixed(1)}ms\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
