"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
exports.asyncHandler = asyncHandler;
/** Validate `req.body` against a schema; replaces body with the parsed value. */
function validateBody(schema) {
    return (req, _res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success)
            return next(result.error);
        req.body = result.data;
        next();
    };
}
/** Wrap an async handler so thrown/rejected errors reach the error middleware. */
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
