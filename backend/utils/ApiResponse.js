/**
 * Standardized API Response Utility
 * 
 * Provides consistent response format across all API endpoints.
 * This ensures frontend can reliably parse all responses.
 */

class ApiResponse {
    /**
     * Success response
     * @param {Object} res - Express response object
     * @param {number} statusCode - HTTP status code
     * @param {string} message - Success message
     * @param {Object} data - Response data
     */
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

    /**
     * Created response (201)
     */
    static created(res, message = 'Resource created successfully', data = null) {
        return this.success(res, 201, message, data);
    }

    /**
     * Error response
     * @param {Object} res - Express response object
     * @param {number} statusCode - HTTP status code
     * @param {string} message - Error message
     * @param {Array} errors - Validation errors array
     */
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

    /**
     * Bad Request (400)
     */
    static badRequest(res, message = 'Bad request', errors = null) {
        return this.error(res, 400, message, errors);
    }

    /**
     * Unauthorized (401)
     */
    static unauthorized(res, message = 'Unauthorized access') {
        return this.error(res, 401, message);
    }

    /**
     * Not Found (404)
     */
    static notFound(res, message = 'Resource not found') {
        return this.error(res, 404, message);
    }

    /**
     * Validation Error (422)
     */
    static validationError(res, errors) {
        return this.error(res, 422, 'Validation failed', errors);
    }

    /**
     * Server Error (500)
     */
    static serverError(res, message = 'Internal server error') {
        return this.error(res, 500, message);
    }
}

module.exports = ApiResponse;
