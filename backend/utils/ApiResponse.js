class ApiResponse {
    static success(res, statusCode = 200, message = 'Success', data = null) {
        const response = {
            success: true,
            message,
            timestamp: new Date().toISOString()
        };

        if (data !== null) {
            response.data = data;
        }

        return res.status(statusCode).json(response);
    }

    static created(res, message = 'Resource created successfully', data = null) {
        return this.success(res, 201, message, data);
    }

    static error(res, statusCode = 500, message = 'An error occurred', errors = null) {
        const response = {
            success: false,
            message,
            timestamp: new Date().toISOString()
        };

        if (errors) {
            response.errors = errors;
        }

        return res.status(statusCode).json(response);
    }

    static badRequest(res, message = 'Bad request', errors = null) {
        return this.error(res, 400, message, errors);
    }

    static unauthorized(res, message = 'Unauthorized access') {
        return this.error(res, 401, message);
    }

    static notFound(res, message = 'Resource not found') {
        return this.error(res, 404, message);
    }

    static validationError(res, errors) {
        return this.error(res, 422, 'Validation failed', errors);
    }

    static serverError(res, message = 'Internal server error') {
        return this.error(res, 500, message);
    }
}

module.exports = ApiResponse;
