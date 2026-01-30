/**
 * Job Routes
 * 
 * Defines all job-related API endpoints.
 */

const express = require('express');
const router = express.Router();

const {
    createOneTimeJob,
    createRecurringJob,
    getAllJobs,
    getJobById,
    updateJob,
    cancelJob,
    pauseJob,
    resumeJob,
    deleteJob
} = require('../controllers/jobController');

const asyncHandler = require('../middleware/asyncHandler');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');

// Note: Authentication disabled for development/testing
// Uncomment the line below to enable auth:
// const { authenticate } = require('../middleware/authMiddleware');
// router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════
// JOB CREATION ROUTES
// ═══════════════════════════════════════════════════════════════════════

/**
 * @route   POST /api/jobs
 * @desc    Create a job (auto-detects type based on jobType field)
 * @access  Public (for testing)
 */
router.post('/', asyncHandler(async (req, res, next) => {
    const { jobType } = req.body;

    if (jobType === 'RECURRING') {
        return createRecurringJob(req, res, next);
    } else {
        return createOneTimeJob(req, res, next);
    }
}));

/**
 * @route   POST /api/jobs/one-time
 * @desc    Create a one-time job
 * @access  Public (for testing)
 */
router.post('/one-time', asyncHandler(createOneTimeJob));

/**
 * @route   POST /api/jobs/recurring
 * @desc    Create a recurring job
 * @access  Public (for testing)
 */
router.post('/recurring', asyncHandler(createRecurringJob));

// ═══════════════════════════════════════════════════════════════════════
// JOB RETRIEVAL ROUTES
// ═══════════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/jobs
 * @desc    Get all jobs with pagination and filtering
 * @access  Public (for testing)
 * @cache   15 seconds (improves production performance)
 */
router.get('/', cacheMiddleware(15, (req) => {
    const { status, jobType, page = 1, limit = 50 } = req.query;
    return `jobs:${status || 'all'}:${jobType || 'all'}:${page}:${limit}`;
}), asyncHandler(getAllJobs));

/**
 * @route   GET /api/jobs/:jobId
 * @desc    Get single job by jobId
 * @access  Public (for testing)
 */
router.get('/:jobId', asyncHandler(getJobById));

/**
 * @route   PUT /api/jobs/:jobId
 * @desc    Update a job
 * @access  Public (for testing)
 */
router.put('/:jobId', asyncHandler(updateJob));

// ═══════════════════════════════════════════════════════════════════════
// JOB LIFECYCLE ROUTES
// ═══════════════════════════════════════════════════════════════════════

/**
 * @route   POST /api/jobs/:jobId/cancel
 * @desc    Cancel a pending/scheduled job
 * @access  Public (for testing)
 */
router.post('/:jobId/cancel', asyncHandler(cancelJob));

/**
 * @route   PATCH /api/jobs/:jobId/cancel
 * @desc    Cancel a pending/scheduled job (alias)
 * @access  Public (for testing)
 */
router.patch('/:jobId/cancel', asyncHandler(cancelJob));

/**
 * @route   POST /api/jobs/:jobId/pause
 * @desc    Pause a recurring job
 * @access  Public (for testing)
 */
router.post('/:jobId/pause', asyncHandler(pauseJob));

/**
 * @route   PATCH /api/jobs/:jobId/pause
 * @desc    Pause a recurring job (alias)
 * @access  Public (for testing)
 */
router.patch('/:jobId/pause', asyncHandler(pauseJob));
router.put('/:jobId/pause', asyncHandler(pauseJob));

/**
 * @route   POST /api/jobs/:jobId/resume
 * @desc    Resume a paused job
 * @access  Public (for testing)
 */
router.post('/:jobId/resume', asyncHandler(resumeJob));

/**
 * @route   PATCH /api/jobs/:jobId/resume
 * @desc    Resume a paused job (alias)
 * @access  Public (for testing)
 */
router.patch('/:jobId/resume', asyncHandler(resumeJob));
router.put('/:jobId/resume', asyncHandler(resumeJob));

/**
 * @route   DELETE /api/jobs/:jobId
 * @desc    Delete a job (soft delete)
 * @access  Public (for testing)
 */
router.delete('/:jobId', asyncHandler(deleteJob));

module.exports = router;
