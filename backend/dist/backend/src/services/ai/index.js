"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCommentary = exports.evaluateGoal = void 0;
/**
 * GymCast AI oracle service — public surface.
 *
 * - `evaluateGoal`: the GenAI core. Judges the final challenge photo against the
 *   success criteria via an OpenAI vision model with Structured Outputs, with an
 *   optional self-hosted Vultr GPU ensemble for a cross-checked second opinion.
 * - `generateCommentary`: cheap, funny play-by-play lines for the live ticker.
 *
 * All calls are server-side only; secrets never reach the client, and base64
 * image payloads are never logged.
 */
var evaluate_1 = require("./evaluate");
Object.defineProperty(exports, "evaluateGoal", { enumerable: true, get: function () { return evaluate_1.evaluateGoal; } });
var commentary_1 = require("./commentary");
Object.defineProperty(exports, "generateCommentary", { enumerable: true, get: function () { return commentary_1.generateCommentary; } });
