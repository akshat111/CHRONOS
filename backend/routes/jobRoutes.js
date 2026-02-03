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


const { authenticate } = require('../middleware/authMiddleware');
router.use(authenticate);

router.post('/', asyncHandler(async (req, res, next) => {
    const { jobType } = req.body;

    if (jobType === 'RECURRING') {
        return createRecurringJob(req, res, next);
    } else {
        return createOneTimeJob(req, res, next);
    }
}));

router.post('/one-time', asyncHandler(createOneTimeJob));

router.post('/recurring', asyncHandler(createRecurringJob));

router.get('/', cacheMiddleware(15, (req) => {
    const { status, jobType, page = 1, limit = 50 } = req.query;
    return `jobs:${status || 'all'}:${jobType || 'all'}:${page}:${limit}`;
}), asyncHandler(getAllJobs));

router.get('/:jobId', asyncHandler(getJobById));
router.put('/:jobId', asyncHandler(updateJob));
router.post('/:jobId/cancel', asyncHandler(cancelJob));
router.patch('/:jobId/cancel', asyncHandler(cancelJob));
router.post('/:jobId/pause', asyncHandler(pauseJob));
router.patch('/:jobId/pause', asyncHandler(pauseJob));
router.put('/:jobId/pause', asyncHandler(pauseJob));
router.post('/:jobId/resume', asyncHandler(resumeJob));
router.patch('/:jobId/resume', asyncHandler(resumeJob));
router.put('/:jobId/resume', asyncHandler(resumeJob));
router.delete('/:jobId', asyncHandler(deleteJob));

module.exports = router;
