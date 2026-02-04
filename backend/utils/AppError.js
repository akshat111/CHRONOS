class AppError extends Error {
    constructor(message, statusCode = 500, errors = null) {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;
        this.errors = errors;

        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(message, errors = null) {
        return new AppError(message, 400, errors);
    }

    static unauthorized(message = 'Unauthorized access') {
        return new AppError(message, 401);
    }

    static forbidden(message = 'Access forbidden') {
        return new AppError(message, 403);
    }

    static notFound(message = 'Resource not found') {
        return new AppError(message, 404);
    }

    static validationError(errors) {
        return new AppError('Validation failed', 422, errors);
    }

    static conflict(message = 'Resource already exists') {
        return new AppError(message, 409);
    }
}

module.exports = AppError;
