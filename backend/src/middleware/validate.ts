/**
 * Zod validation helpers. Wrap async route handlers and validate body/params.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';

/** Validate `req.body` against a schema; replaces body with the parsed value. */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

/** Wrap an async handler so thrown/rejected errors reach the error middleware. */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
