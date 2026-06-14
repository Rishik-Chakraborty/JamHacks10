"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * GymCast backend bootstrap: Express REST + Socket.io + MongoDB Change Streams.
 *
 * Wiring lives here (owned by Foundation). Routers, middleware bodies, realtime
 * watchers, and services are filled in by their respective agents.
 */
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const socket_io_1 = require("socket.io");
const env_1 = require("./config/env");
const db_1 = require("./config/db");
const routes_1 = require("./routes");
const error_1 = require("./middleware/error");
const realtime_1 = require("./realtime");
const scheduler_1 = require("./services/scheduler");
const ai_1 = require("./services/ai");
const contract_1 = require("./contract");
async function main() {
    await (0, db_1.connectDb)();
    // Pre-load (or auto-train) XGBoost calibration model to avoid cold-start on first eval
    (0, ai_1.warmupXGBoost)().catch(() => { });
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: env_1.env.corsOrigins, credentials: true }));
    // base64 progress photos/videos can be tens of MB — allow a generous JSON body.
    app.use(express_1.default.json({ limit: '60mb' }));
    app.use((0, express_rate_limit_1.default)({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok', service: 'gymcast-backend', solana: env_1.env.solanaEnabled, ai: env_1.env.aiEnabled });
    });
    (0, routes_1.mountRoutes)(app);
    app.use(error_1.notFound);
    app.use(error_1.errorHandler);
    const server = http_1.default.createServer(app);
    const io = new socket_io_1.Server(server, { cors: { origin: env_1.env.corsOrigins } });
    (0, realtime_1.setIo)(io);
    io.on('connection', (socket) => {
        socket.on(contract_1.SOCKET_EVENTS.JOIN, (challengeId) => socket.join(`challenge:${challengeId}`));
        socket.on(contract_1.SOCKET_EVENTS.LEAVE, (challengeId) => socket.leave(`challenge:${challengeId}`));
    });
    await (0, realtime_1.initRealtime)(io);
    (0, scheduler_1.startScheduler)();
    server.listen(env_1.env.PORT, () => {
        console.log(`🚀 GymCast backend on http://localhost:${env_1.env.PORT}`);
    });
}
main().catch((err) => {
    console.error('Fatal boot error:', err);
    process.exit(1);
});
