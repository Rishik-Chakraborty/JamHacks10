/**
 * Route barrel — mounts every API router under /api.
 * Called from index.ts after core middleware.
 */
import type { Express } from 'express';
import { usersRouter } from './users';
import { challengesRouter } from './challenges';
import { photosRouter, challengePhotosRouter } from './photos';
import { betsRouter, challengeBetsRouter } from './bets';
import { commentsRouter, challengeCommentsRouter } from './comments';

export function mountRoutes(app: Express): void {
  app.use('/api/users', usersRouter);

  // Per-challenge sub-resource list routes (GET /api/challenges/:id/{photos,bets,comments}).
  // Mounted before the main challenges router so their specific paths match first;
  // Express falls through to the next handler when a path/method doesn't match.
  app.use('/api/challenges', challengePhotosRouter);
  app.use('/api/challenges', challengeBetsRouter);
  app.use('/api/challenges', challengeCommentsRouter);
  app.use('/api/challenges', challengesRouter);

  app.use('/api/photos', photosRouter);
  app.use('/api/bets', betsRouter);
  app.use('/api/comments', commentsRouter);
}
