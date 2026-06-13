/**
 * GymCast backend bootstrap: Express REST + Socket.io + MongoDB Change Streams.
 *
 * Wiring lives here (owned by Foundation). Routers, middleware bodies, realtime
 * watchers, and services are filled in by their respective agents.
 */
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketServer } from 'socket.io';

import { env } from './config/env';
import { connectDb } from './config/db';
import { mountRoutes } from './routes';
import { errorHandler, notFound } from './middleware/error';
import { initRealtime, setIo } from './realtime';
import { SOCKET_EVENTS } from './contract';

async function main() {
  await connectDb();

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  // base64 progress photos can be several MB — allow a generous JSON body.
  app.use(express.json({ limit: '15mb' }));
  app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'gymcast-backend', solana: env.solanaEnabled, ai: env.aiEnabled });
  });

  mountRoutes(app);

  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  const io = new SocketServer(server, { cors: { origin: env.corsOrigins } });
  setIo(io);

  io.on('connection', (socket) => {
    socket.on(SOCKET_EVENTS.JOIN, (challengeId: string) => socket.join(`challenge:${challengeId}`));
    socket.on(SOCKET_EVENTS.LEAVE, (challengeId: string) => socket.leave(`challenge:${challengeId}`));
  });

  await initRealtime(io);

  server.listen(env.PORT, () => {
    console.log(`🚀 GymCast backend on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
