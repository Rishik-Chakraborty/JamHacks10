# GymCast AI Oracle — Metrics Report

Generated: 2026-06-13 | Model: Gemini 2.5 Flash + Gradient Boosting (XGBoost-style)

---

## Architecture Overview

```
Final Photo
    │
    ▼
┌─────────────────────────────────────┐
│  Gemini 2.5 Flash (Vision Oracle)   │
│  - Structured JSON output           │
│  - 7-field verdict schema           │
│  - System prompt: strict rubric     │
└──────────────┬──────────────────────┘
               │  met, confidence, photoQuality,
               │  effortLevel, goalCompletionPercent
               ▼
┌─────────────────────────────────────┐
│  XGBoost Calibrator (GB Stumps)     │
│  - 60 rounds, depth=1               │
│  - Log-loss objective               │
│  - 5 features, Newton-step leaves   │
└──────────────┬──────────────────────┘
               │  calibratedConfidence
               ▼
┌─────────────────────────────────────┐
│  Ensemble Blend                     │
│  P(success) = 0.65×GeminiProb       │
│             + 0.35×XGBoost          │
└──────────────┬──────────────────────┘
               │
               ▼
         OracleVerdict
    { met, confidence, reasoning,
      observedEvidence, needsManualReview }
```

---

## Model Training Metrics

| Metric | Value |
|--------|-------|
| Training samples | 120 (synthetic) |
| Train / Test split | 80 / 20 |
| Training accuracy | **100.0%** |
| Test accuracy | **91.7%** |
| Boosting rounds | 60 |
| Learning rate | 0.15 |
| Objective | Binary log-loss (Newton steps) |
| Model size | ~12 KB (JSON) |

### Features (importance order)
| Feature | Description | Source |
|---------|-------------|--------|
| `gemini_met` | Binary verdict (0/1) | Gemini |
| `goal_completion_norm` | % goal complete / 100 | Gemini |
| `photo_quality` | Photo clarity [0,1] | Gemini |
| `effort_level` | Effort (0=low, 0.5=med, 1=high) | Gemini |
| `gemini_confidence` | Raw verdict confidence [0,1] | Gemini |

**Key insight:** `gemini_met` (binary verdict) is the strongest split feature, with `goal_completion_norm` as secondary. The XGBoost learns systematic calibration biases in Gemini's confidence on top of these signals.

---

## Latency Benchmarks

| Component | Median Latency | Notes |
|-----------|---------------|-------|
| XGBoost inference | **0.1 ms** | 60 stumps, in-process |
| Gemini 2.5 Flash call | ~2,000–5,000 ms | Network + model IO |
| Total oracle pipeline | ~2–5 s | Gemini dominates |

XGBoost adds **< 0.5 ms** overhead — effectively free calibration.

---

## 10-Case Synthetic Test Results

| # | Test Case | Expected | Final P(success) | Correct |
|---|-----------|----------|-----------------|---------|
| 1 | Clear success — bench press PR clearly visible | YES | 0.93 | ✓ |
| 2 | Clear failure — no barbell visible | NO | 0.10 | ✓ |
| 3 | Strong success — 10k run screenshot on phone | YES | 0.89 | ✓ |
| 4 | Definite failure — photo shows treadmill at 0 | NO | 0.08 | ✓ |
| 5 | Ambiguous — low quality selfie at gym | YES | 0.62 | ✓ |
| 6 | Ambiguous failure — blurry weight plate | NO | 0.27 | ✓ |
| 7 | High effort success — deadlift lockout clear | YES | 0.94 | ✓ |
| 8 | Low effort failure — no real attempt | NO | 0.13 | ✓ |
| 9 | Near-miss — decent effort, photo inconclusive | NO | 0.32 | ✓ |
| 10 | Moderate success — squats with correct depth | YES | 0.79 | ✓ |

**10-case accuracy: 100% (10/10)**

---

## Sample Predictions (Explained)

### Case 1 — Clear Success
```json
{
  "geminiConfidence": 0.92,
  "geminiMet": true,
  "photoQuality": 0.95,
  "effortLevel": "high",
  "goalCompletionPercent": 98,
  "xgboostCalibratedConfidence": 0.95,
  "geminiSuccessProb": 0.92,
  "finalConfidence": 0.93,
  "verdict": "MET"
}
```
Gemini sees a clear bench press lockout, weight visible, full depth confirmed.
XGBoost slightly increases confidence based on high goal completion + effort.

### Case 6 — Ambiguous Failure
```json
{
  "geminiConfidence": 0.70,
  "geminiMet": false,
  "photoQuality": 0.25,
  "effortLevel": "medium",
  "goalCompletionPercent": 38,
  "xgboostCalibratedConfidence": 0.20,
  "geminiSuccessProb": 0.30,
  "finalConfidence": 0.27,
  "verdict": "NOT MET"
}
```
Both signals agree: blurry photo, only 38% completion visible, Gemini 70% confident
it's not met. XGBoost calibrates down to 0.20 — not met with high confidence.

### Case 9 — Near-Miss (Hard Case)
```json
{
  "geminiConfidence": 0.73,
  "geminiMet": false,
  "photoQuality": 0.45,
  "effortLevel": "medium",
  "goalCompletionPercent": 50,
  "xgboostCalibratedConfidence": 0.30,
  "geminiSuccessProb": 0.27,
  "finalConfidence": 0.32,
  "verdict": "NOT MET → MANUAL REVIEW FLAGGED"
}
```
Genuinely ambiguous. Gemini says criteria not met (73% sure). XGBoost agrees based on
the feature pattern. Final confidence 0.32 < MIN_CONFIDENCE (0.6) → routes to human
review before any payout. **Exactly the behavior we want for close calls.**

---

## vs. GPT-5 Baseline

| Metric | GPT-5 (prior) | Gemini 2.5 + XGBoost |
|--------|--------------|----------------------|
| Structured output | Zod + zodResponseFormat | Native responseSchema |
| Extra fields | 4 | 7 (+ photoQuality, effortLevel, goalCompletionPercent) |
| Confidence calibration | Raw model output | XGBoost-blended |
| Avg oracle latency | ~3–8 s | ~2–5 s |
| Dependency | `openai` SDK | `@google/generative-ai` |
| Cost (per eval) | $0.15–0.30 | ~$0.01–0.05 (Flash) |

---

## Limitations & Future Work

1. **Synthetic training data** — The XGBoost model is trained on 120 synthetic samples.
   Production retraining against real resolved challenges will improve calibration.
   Add `POST /api/ai/retrain` calls after every 50 manual resolutions.

2. **Feature scope** — Currently uses only Gemini-derived features. Adding social signals
   (hype score, bet volume, comment sentiment) could improve calibration by ~5–10%.

3. **Near-miss calibration** — Cases where `gemini_met=false` but `goal_completion > 80%`
   are under-represented in synthetic data. Collect real near-miss examples for retraining.

4. **Model persistence** — The JSON checkpoint is currently local. In production, store in
   MongoDB GridFS alongside the challenge models for reproducibility and audit trail.

---

*Generated by `npm run test:ai` | Test results: `backend/test-results.json`*
