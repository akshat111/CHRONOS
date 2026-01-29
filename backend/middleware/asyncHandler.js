/**
 * Async Handler Middleware
 * 
 * Wraps async route handlers to catch errors and pass them to Express error handler.
 * This eliminates the need for try-catch blocks in every async route.
 */

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
