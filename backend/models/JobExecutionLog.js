const mongoose = require('mongoose');
const jobExecutionLogSchema = new mongoose.Schema(
    {
        job: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Job',
            required: true,
            index: true
        },
        jobId: {
            type: String,
            required: true,
            index: true
        },
        jobName: {
            type: String,
            required: true
        },
        taskType: {
            type: String,
            required: true,
            index: true
        },
        scheduledTime: {
            type: Date,
            required: true
        },
        executionStartTime: {
            type: Date,
            required: true,
            default: Date.now
        },
        executionEndTime: {
            type: Date
        },
        duration: {
            type: Number,
            min: 0
        },
        status: {
            type: String,
            required: true,
            enum: ['SUCCESS', 'FAILED', 'TIMEOUT', 'SKIPPED', 'RUNNING'],
            index: true
        },
        retryAttempt: {
            type: Number,
            required: true,
            default: 0,
            min: 0
        },
        isRetry: {
            type: Boolean,
            default: false
        },
        errorMessage: {
            type: String
        },
        errorStack: {
            type: String
        },
        errorCode: {
            type: String,
            index: true
        },
        workerId: {
            type: String,
            required: true,
            index: true
        },
        workerHost: {
            type: String
        },
        payload: {
            type: mongoose.Schema.Types.Mixed
        },
        result: {
            type: mongoose.Schema.Types.Mixed
        },
        memoryUsage: {
            type: Number
        },
        cpuTime: {
            type: Number
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        logs: [{
            level: {
                type: String,
                enum: ['debug', 'info', 'warn', 'error']
            },
            message: String,
            timestamp: Date,
            data: mongoose.Schema.Types.Mixed
        }],
        environment: {
            type: String,
            default: 'production'
        }
    },
    {
        timestamps: true, // Adds createdAt and updatedAt
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);
jobExecutionLogSchema.index({ job: 1, executionStartTime: -1 });
jobExecutionLogSchema.index({ status: 1, executionStartTime: -1 });

jobExecutionLogSchema.index({ executionStartTime: -1 });

/**
 * Compound index for worker performance analysis
 * Why: Find all executions by a specific worker
 */
jobExecutionLogSchema.index({ workerId: 1, status: 1, executionStartTime: -1 });

/**
 * Compound index for error analysis
 * Why: Find jobs by error type for debugging patterns
 */
jobExecutionLogSchema.index({ errorCode: 1, executionStartTime: -1 });

/**
 * TTL index for automatic cleanup
 * Why: Automatically delete logs older than 30 days to manage storage
 * Adjust expireAfterSeconds based on retention requirements
 */
jobExecutionLogSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days
);

// ═══════════════════════════════════════════════════════════════════════
// VIRTUALS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate queue delay (time between scheduled and actual start)
 */
jobExecutionLogSchema.virtual('queueDelay').get(function () {
    if (!this.scheduledTime || !this.executionStartTime) return null;
    return this.executionStartTime.getTime() - this.scheduledTime.getTime();
});

/**
 * Check if execution was successful
 */
jobExecutionLogSchema.virtual('isSuccess').get(function () {
    return this.status === 'SUCCESS';
});

/**
 * Check if execution failed
 */
jobExecutionLogSchema.virtual('isFailed').get(function () {
    return this.status === 'FAILED' || this.status === 'TIMEOUT';
});

// ═══════════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Mark execution as completed successfully
 * @param {Object} result - Result data from execution
 */
jobExecutionLogSchema.methods.complete = async function (result) {
    this.status = 'SUCCESS';
    this.executionEndTime = new Date();
    this.duration = this.executionEndTime - this.executionStartTime;
    this.result = result;
    await this.save();
};

/**
 * Mark execution as failed
 * @param {Error} error - The error that occurred
 * @param {string} errorCode - Optional error code for categorization
 */
jobExecutionLogSchema.methods.fail = async function (error, errorCode = null) {
    this.status = 'FAILED';
    this.executionEndTime = new Date();
    this.duration = this.executionEndTime - this.executionStartTime;
    this.errorMessage = error.message;
    this.errorStack = error.stack;
    this.errorCode = errorCode || 'UNKNOWN_ERROR';
    await this.save();
};

/**
 * Add a log entry
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Log message
 * @param {Object} data - Optional additional data
 */
jobExecutionLogSchema.methods.addLog = function (level, message, data = null) {
    this.logs.push({
        level,
        message,
        timestamp: new Date(),
        data
    });
};

// ═══════════════════════════════════════════════════════════════════════
// STATIC METHODS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a new execution log entry
 * @param {Object} job - The job being executed
 * @param {string} workerId - ID of the worker
 * @param {string} workerHost - Hostname of worker
 * @returns {Document} - New execution log document
 */
jobExecutionLogSchema.statics.createForJob = function (job, workerId, workerHost = null) {
    return new this({
        job: job._id,
        jobId: job.jobId,
        jobName: job.jobName,
        taskType: job.taskType,
        scheduledTime: job.nextRunAt || job.scheduleTime,
        retryAttempt: job.retryCount,
        isRetry: job.retryCount > 0,
        workerId: workerId,
        workerHost: workerHost,
        payload: job.payload
    });
};

/**
 * Get execution history for a job
 * @param {ObjectId} jobId - Job's MongoDB _id
 * @param {number} limit - Max records to return
 * @returns {Array} - Execution logs sorted by time descending
 */
jobExecutionLogSchema.statics.getJobHistory = function (jobId, limit = 50) {
    return this.find({ job: jobId })
        .sort({ executionStartTime: -1 })
        .limit(limit)
        .lean();
};

/**
 * Get execution statistics for a job
 * @param {ObjectId} jobId - Job's MongoDB _id
 * @returns {Object} - Statistics object
 */
jobExecutionLogSchema.statics.getJobStats = async function (jobId) {
    const stats = await this.aggregate([
        { $match: { job: new mongoose.Types.ObjectId(jobId) } },
        {
            $group: {
                _id: null,
                totalExecutions: { $sum: 1 },
                successCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
                },
                failureCount: {
                    $sum: { $cond: [{ $in: ['$status', ['FAILED', 'TIMEOUT']] }, 1, 0] }
                },
                avgDuration: { $avg: '$duration' },
                minDuration: { $min: '$duration' },
                maxDuration: { $max: '$duration' },
                totalRetries: { $sum: { $cond: ['$isRetry', 1, 0] } }
            }
        }
    ]);

    if (stats.length === 0) {
        return {
            totalExecutions: 0,
            successCount: 0,
            failureCount: 0,
            successRate: 0,
            avgDuration: 0,
            minDuration: 0,
            maxDuration: 0,
            totalRetries: 0
        };
    }

    const result = stats[0];
    result.successRate = result.totalExecutions > 0
        ? (result.successCount / result.totalExecutions * 100).toFixed(2)
        : 0;

    return result;
};

/**
 * Get recent failures across all jobs
 * @param {number} hours - Look back period in hours
 * @param {number} limit - Max records to return
 * @returns {Array} - Recent failure logs
 */
jobExecutionLogSchema.statics.getRecentFailures = function (hours = 24, limit = 100) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.find({
        status: { $in: ['FAILED', 'TIMEOUT'] },
        executionStartTime: { $gte: since }
    })
        .sort({ executionStartTime: -1 })
        .limit(limit)
        .populate('job', 'jobId jobName taskType')
        .lean();
};

/**
 * Get worker performance statistics
 * @param {string} workerId - Worker ID
 * @param {number} hours - Look back period in hours
 * @returns {Object} - Worker statistics
 */
jobExecutionLogSchema.statics.getWorkerStats = async function (workerId, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stats = await this.aggregate([
        {
            $match: {
                workerId: workerId,
                executionStartTime: { $gte: since }
            }
        },
        {
            $group: {
                _id: null,
                totalJobs: { $sum: 1 },
                successCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
                },
                failureCount: {
                    $sum: { $cond: [{ $in: ['$status', ['FAILED', 'TIMEOUT']] }, 1, 0] }
                },
                avgDuration: { $avg: '$duration' },
                avgQueueDelay: { $avg: { $subtract: ['$executionStartTime', '$scheduledTime'] } }
            }
        }
    ]);

    return stats[0] || {
        totalJobs: 0,
        successCount: 0,
        failureCount: 0,
        avgDuration: 0,
        avgQueueDelay: 0
    };
};

// ═══════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate duration before saving if not already set
 */
jobExecutionLogSchema.pre('save', function (next) {
    if (this.executionEndTime && !this.duration) {
        this.duration = this.executionEndTime - this.executionStartTime;
    }
    next();
});

const JobExecutionLog = mongoose.model('JobExecutionLog', jobExecutionLogSchema);

module.exports = JobExecutionLog;
