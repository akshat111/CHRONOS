const express = require('express');
const router = express.Router();
const {
    getSystemHealth,
    getSystemStats,
    getLiveStats,
    getWorkerStats
} = require('../controllers/monitoringController');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');

router.get('/health', getSystemHealth);
router.get('/stats', cacheMiddleware(30, (req) => `stats:${req.query.period || '24h'}`), getSystemStats);
router.get('/stats/live', getLiveStats);
router.get('/workers', getWorkerStats);

module.exports = router;
