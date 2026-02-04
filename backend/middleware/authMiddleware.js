const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const JWT_SECRET = process.env.JWT_SECRET || 'chronos_secret_key_2024';

const authenticate = async (req, res, next) => {
    try {
        // Check for authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw AppError.unauthorized('No authorization token provided');
        }

        // Extract token
        const token = authHeader.split(' ')[1];

        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Find user
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            throw AppError.unauthorized('User not found or inactive');
        }

        // Attach user to request
        req.user = {
            _id: user._id,
            username: user.username
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return next(AppError.unauthorized('Invalid token'));
        }
        if (error.name === 'TokenExpiredError') {
            return next(AppError.unauthorized('Token has expired'));
        }
        next(error);
    }
};

const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    return authenticate(req, res, next);
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(AppError.unauthorized('Authentication required'));
        }

        if (!roles.includes(req.user.role)) {
            return next(AppError.forbidden('You do not have permission to perform this action'));
        }

        next();
    };
};

module.exports = {
    authenticate,
    optionalAuth,
    authorize
};
