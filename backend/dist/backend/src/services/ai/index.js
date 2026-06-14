"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAccuracy = exports.generateSyntheticData = exports.trainAndSave = exports.retrainModel = exports.warmupXGBoost = exports.runXGBoostInference = exports.generateCommentary = exports.reviewGoal = exports.evaluateGoal = void 0;
/**
 * GymCast AI oracle service — public surface.
 *
 * - `evaluateGoal`: Gemini 2.5 Flash vision + XGBoost confidence calibration.
 *   The GenAI core that judges the final challenge photo and resolves markets.
 * - `generateCommentary`: GPT-4o ticker lines for the live activity feed.
 * - `reviewGoal`: GPT-4o goal-criteria reviewer (gates custom challenge creation).
 * - `runXGBoostInference` / `warmupXGBoost` / `retrainModel`: XGBoost calibrator.
 *
 * All calls are server-side only; secrets never reach the client.
 */
var evaluate_1 = require("./evaluate");
Object.defineProperty(exports, "evaluateGoal", { enumerable: true, get: function () { return evaluate_1.evaluateGoal; } });
var reviewGoal_1 = require("./reviewGoal");
Object.defineProperty(exports, "reviewGoal", { enumerable: true, get: function () { return reviewGoal_1.reviewGoal; } });
var commentary_1 = require("./commentary");
Object.defineProperty(exports, "generateCommentary", { enumerable: true, get: function () { return commentary_1.generateCommentary; } });
var xgboost_inference_1 = require("./xgboost-inference");
Object.defineProperty(exports, "runXGBoostInference", { enumerable: true, get: function () { return xgboost_inference_1.runXGBoostInference; } });
Object.defineProperty(exports, "warmupXGBoost", { enumerable: true, get: function () { return xgboost_inference_1.warmupXGBoost; } });
Object.defineProperty(exports, "retrainModel", { enumerable: true, get: function () { return xgboost_inference_1.retrainModel; } });
var xgboost_trainer_1 = require("./xgboost-trainer");
Object.defineProperty(exports, "trainAndSave", { enumerable: true, get: function () { return xgboost_trainer_1.trainAndSave; } });
Object.defineProperty(exports, "generateSyntheticData", { enumerable: true, get: function () { return xgboost_trainer_1.generateSyntheticData; } });
Object.defineProperty(exports, "computeAccuracy", { enumerable: true, get: function () { return xgboost_trainer_1.computeAccuracy; } });
