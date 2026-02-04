const User = require('../models/User');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../middleware/asyncHandler');

const signup = asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
        return ApiResponse.badRequest(res, 'Username and password are required');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
        return ApiResponse.badRequest(res, 'Username already exists');
    }

    // Create new user
    const user = await User.create({
        username: username.toLowerCase(),
        password
    });

    // Generate token
    const token = user.generateToken();

    return ApiResponse.success(res, 201, 'Account created successfully', {
        user: {
            id: user._id,
            username: user.username
        },
        token
    });
});

const login = asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
        return ApiResponse.badRequest(res, 'Username and password are required');
    }

    // Find user and include password
    const user = await User.findOne({
        username: username.toLowerCase(),
        isActive: true
    }).select('+password');

    if (!user) {
        return ApiResponse.unauthorized(res, 'Invalid username or password');
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        return ApiResponse.unauthorized(res, 'Invalid username or password');
    }

    // Generate token
    const token = user.generateToken();

    return ApiResponse.success(res, 200, 'Login successful', {
        user: {
            id: user._id,
            username: user.username
        },
        token
    });
});

const getMe = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
        return ApiResponse.notFound(res, 'User not found');
    }

    return ApiResponse.success(res, 200, 'User info retrieved', {
        id: user._id,
        username: user.username
    });
});

module.exports = {
    signup,
    login,
    getMe
};
