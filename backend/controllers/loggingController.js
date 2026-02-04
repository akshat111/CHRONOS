const JobExecutionLog = require('../models/JobExecutionLog');
const Job = require('../models/Job');
const ApiResponse = require('../utils/ApiResponse');
const AppError = require('../utils/AppError');
const asyncHandler = require('../middleware/asyncHandler');

const getJobLogs = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        limit = 20,
        offset = 0,
        status,
        fromDate,
        toDate
    } = req.query;

    // Find the job first
    const job = await Job.findOne({
        $or: [
            { jobId: id },
            { _id: id }
        ]
    });

    if (!job) {
        throw new AppError('Job not found', 404);
    }

    // Build query
    const query = { jobId: job.jobId };

    if (status) {
        query.status = status.toUpperCase();
    }

    if (fromDate || toDate) {
        query.executionStartTime = {};
        if (fromDate) query.executionStartTime.$gte = new Date(fromDate);
        if (toDate) query.executionStartTime.$lte = new Date(toDate);
    }

    // Fetch logs
    const [logs, total] = await Promise.all([
        JobExecutionLog.find(query)
            .sort({ executionStartTime: -1 })
            .skip(parseInt(offset))
            .limit(Math.min(parseInt(limit), 100))
            .lean(),
        JobExecutionLog.countDocuments(query)
    ]);

    // Format logs for response
    const formattedLogs = logs.map(log => ({
        id: log._id,
        executionId: log.executionId,
        status: log.status,
        duration: log.duration,
        attempt: log.retryAttempt,
        isRetry: log.isRetry,
        executedAt: log.executionStartTime,
        completedAt: log.executionEndTime,
        workerId: log.workerId,
        workerHost: log.workerHost,
        error: log.errorMessage ? {
            message: log.errorMessage,
            code: log.errorCode
        } : null,
        result: log.result,
        metadata: log.metadata
    }));

    return ApiResponse.success(res, 200, 'Execution logs retrieved successfully', {
        job: {
            id: job.jobId,
            name: job.jobName,
            taskType: job.taskType,
            status: job.status
        },
        logs: formattedLogs,
        pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + logs.length < total
        }
    });
});

const getJobLogsSummary = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Find the job
    const job = await Job.findOne({
        $or: [{ jobId: id }, { _id: id }]
    });

    if (!job) {
        throw new AppError('Job not found', 404);
    }

    // Aggregate stats
    const stats = await JobExecutionLog.aggregate([
        { $match: { jobId: job.jobId } },
        {
            $group: {
                _id: null,
                totalExecutions: { $sum: 1 },
                successCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
                },
                failedCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
                },
                timeoutCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'TIMEOUT'] }, 1, 0] }
                },
                retryCount: {
                    $sum: { $cond: ['$isRetry', 1, 0] }
                },
                avgDuration: { $avg: '$duration' },
                maxDuration: { $max: '$duration' },
                minDuration: { $min: '$duration' },
                firstExecution: { $min: '$executionStartTime' },
                lastExecution: { $max: '$executionStartTime' }
            }
        }
    ]);

    const summary = stats[0] || {
        totalExecutions: 0,
        successCount: 0,
        failedCount: 0,
        timeoutCount: 0,
        retryCount: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: 0,
        firstExecution: null,
        lastExecution: null
    };

    // Calculate success rate
    summary.successRate = summary.totalExecutions > 0
        ? ((summary.successCount / summary.totalExecutions) * 100).toFixed(2) + '%'
        : '0%';

    // Format durations
    summary.avgDuration = Math.round(summary.avgDuration || 0);
    summary.maxDuration = summary.maxDuration || 0;
    summary.minDuration = summary.minDuration || 0;

    return ApiResponse.success(res, 200, 'Log summary retrieved successfully', {
        job: {
            id: job.jobId,
            name: job.jobName,
            taskType: job.taskType,
            currentStatus: job.status
        },
        summary
    });
});

const getRecentLogs = asyncHandler(async (req, res) => {
    const {
        limit = 50,
        status,
        taskType
    } = req.query;

    const query = {};
    if (status) query.status = status.toUpperCase();
    if (taskType) query.taskType = taskType;

    const logs = await JobExecutionLog.find(query)
        .sort({ executionStartTime: -1 })
        .limit(Math.min(parseInt(limit), 100))
        .lean();

    const formattedLogs = logs.map(log => ({
        id: log._id,
        jobId: log.jobId,
        jobName: log.jobName,
        taskType: log.taskType,
        status: log.status,
        duration: log.duration,
        attempt: log.retryAttempt,
        executedAt: log.executionStartTime,
        error: log.errorMessage,
        workerId: log.workerId
    }));

    return ApiResponse.success(res, 200, 'Recent logs retrieved successfully', {
        logs: formattedLogs,
        count: formattedLogs.length
    });
});

module.exports = {
    getJobLogs,
    getJobLogsSummary,
    getRecentLogs
};
