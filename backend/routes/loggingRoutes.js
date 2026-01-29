/**
 * Logging Routes
 * 
 * Routes for job execution logs.
 */

const express = require('express');
const router = express.Router();
const {
    getJobLogs,
    getJobLogsSummary,
    getRecentLogs
} = require('../controllers/loggingController');

/**
 * @route   GET /logs/recent
 * @desc    Get recent execution logs across all jobs
 * @access  Public
 * @query   limit - Max logs to return (default: 50)
 * @query   status - Filter by status (SUCCESS, FAILED, TIMEOUT)
 * @query   taskType - Filter by task type
 */
router.get('/recent', getRecentLogs);

/**
 * @route   GET /jobs/:id/logs
 * @desc    Get execution logs for a specific job
 * @access  Public
 * @query   limit - Max logs to return (default: 20)
 * @query   offset - Pagination offset
 * @query   status - Filter by status
 * @query   fromDate - Logs after this date
 * @query   toDate - Logs before this date
 */
router.get('/jobs/:id/logs', getJobLogs);

/**
 * @route   GET /jobs/:id/logs/summary
 * @desc    Get execution summary for a job
 * @access  Public
 */
router.get('/jobs/:id/logs/summary', getJobLogsSummary);

module.exports = router;
