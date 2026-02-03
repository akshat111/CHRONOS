const express = require('express');
const router = express.Router();
const {
    getJobLogs,
    getJobLogsSummary,
    getRecentLogs
} = require('../controllers/loggingController');

router.get('/recent', getRecentLogs);
router.get('/jobs/:id/logs', getJobLogs);
router.get('/jobs/:id/logs/summary', getJobLogsSummary);

module.exports = router;
