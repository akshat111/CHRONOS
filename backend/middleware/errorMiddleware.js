/**
 * Global Error Handling Middleware
 * 
 * Catches all errors and returns consistent JSON responses.
 * Handles both operational errors (expected) and programming errors (unexpected).
 */

const ApiResponse = require('../utils/ApiResponse');

/**
 * Handle MongoDB CastError (invalid ObjectId)
 */
const handleCastError = (err) => {
    return {
        statusCode: 400,
        message: `Invalid ${err.path}: ${err.value}`
    };
};

/**
 * Handle MongoDB Duplicate Key Error
 */
const handleDuplicateKeyError = (err) => {
    const field = Object.keys(err.keyValue)[0];
    return {
        statusCode: 409,
        message: `Duplicate value for field: ${field}. Please use a different value.`
    };
};

/**
 * Handle Mongoose Validation Error
 */
const handleValidationError = (err) => {
    const errors = Object.values(err.errors).map(el => ({
        field: el.path,
        message: el.message
    }));
    return {
        statusCode: 422,
        message: 'Validation failed',
        errors
    };
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
    // Log error for debugging
    console.error('Error:', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method
    });

    // Default error values
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';
    let errors = err.errors || null;

    // Handle specific error types
    if (err.name === 'CastError') {
        const handled = handleCastError(err);
        statusCode = handled.statusCode;
        message = handled.message;
    }

    if (err.code === 11000) {
        const handled = handleDuplicateKeyError(err);
        statusCode = handled.statusCode;
        message = handled.message;
    }

    if (err.name === 'ValidationError') {
        const handled = handleValidationError(err);
        statusCode = handled.statusCode;
        message = handled.message;
        errors = handled.errors;
    }

    // Hide internal error details in production
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        message = 'Something went wrong. Please try again later.';
    }

    return ApiResponse.error(res, statusCode, message, errors);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
    return ApiResponse.notFound(res, `Route ${req.originalUrl} not found`);
};

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors automatically
 * 
 * Usage: router.get('/route', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler
};
