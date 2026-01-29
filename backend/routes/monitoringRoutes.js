/**
 * Monitoring Routes
 * 
 * Routes for system health and statistics.
 */

const express = require('express');
const router = express.Router();
const {
    getSystemHealth,
    getSystemStats,
    getLiveStats,
    getWorkerStats
} = require('../controllers/monitoringController');

/**
 * @route   GET /system/health
 * @desc    Get system health status
 * @access  Public (or protected based on your security needs)
 */
router.get('/health', getSystemHealth);

/**
 * @route   GET /system/stats
 * @desc    Get job and execution statistics
 * @access  Public
 * @query   period - Time period (1h, 6h, 24h, 7d, 30d)
 */
router.get('/stats', getSystemStats);

/**
 * @route   GET /system/stats/live
 * @desc    Get real-time statistics (lightweight)
 * @access  Public
 */
router.get('/stats/live', getLiveStats);

/**
 * @route   GET /system/workers
 * @desc    Get worker statistics
 * @access  Public
 */
router.get('/workers', getWorkerStats);

module.exports = router;
