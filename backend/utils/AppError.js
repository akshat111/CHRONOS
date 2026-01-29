/**
 * Custom Application Error Class
 * 
 * Extends the built-in Error class to include:
 * - HTTP status code
 * - Operational flag (distinguishes programming errors from operational errors)
 * - Validation errors array
 */

class AppError extends Error {
    constructor(message, statusCode = 500, errors = null) {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // Operational errors are expected (user input, etc.)
        this.errors = errors;

        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Create a Bad Request error (400)
     */
    static badRequest(message, errors = null) {
        return new AppError(message, 400, errors);
    }

    /**
     * Create an Unauthorized error (401)
     */
    static unauthorized(message = 'Unauthorized access') {
        return new AppError(message, 401);
    }

    /**
     * Create a Forbidden error (403)
     */
    static forbidden(message = 'Access forbidden') {
        return new AppError(message, 403);
    }

    /**
     * Create a Not Found error (404)
     */
    static notFound(message = 'Resource not found') {
        return new AppError(message, 404);
    }

    /**
     * Create a Validation error (422)
     */
    static validationError(errors) {
        return new AppError('Validation failed', 422, errors);
    }

    /**
     * Create a Conflict error (409)
     */
    static conflict(message = 'Resource already exists') {
        return new AppError(message, 409);
    }
}

module.exports = AppError;
