/**
 * Job Executor
 * 
 * Responsible for executing individual jobs:
 * 1. Runs the job's task handler
 * 2. Updates job status (COMPLETED/FAILED)
 * 3. Handles recurring job rescheduling
 * 4. Creates execution logs
 * 5. Manages retry logic
 */

const Job = require('../models/Job');
const JobExecutionLog = require('../models/JobExecutionLog');
const os = require('os');

class JobExecutor {
    /**
     * Create a new JobExecutor
     * @param {Object} options - Configuration
     * @param {string} options.workerId - Unique worker identifier
     * @param {Object} options.taskHandlers - Map of taskType -> handler function
     * @param {number} options.defaultTimeout - Default job timeout in ms
     */
    constructor(options = {}) {
        this.workerId = options.workerId || `executor_${process.pid}_${Date.now()}`;
        this.taskHandlers = options.taskHandlers || {};
        this.defaultTimeout = options.defaultTimeout || 300000; // 5 minutes
        this.hostname = os.hostname();
    }

    /**
     * Register a task handler
     * 
     * @param {string} taskType - Task type identifier
     * @param {Function} handler - Async function to execute
     */
    registerHandler(taskType, handler) {
        this.taskHandlers[taskType] = handler;
        console.log(`[JobExecutor] Registered handler for: ${taskType}`);
    }

    /**
     * Execute a job
     * 
     * @param {Object} job - Job document from MongoDB
     * @returns {Promise<Object>} - Execution result
     */
    async execute(job) {
        const startTime = Date.now();

        // Create execution log entry
        const executionLog = await JobExecutionLog.createForJob(job, this.workerId, this.hostname);

        try {
            // Mark job as RUNNING
            await Job.updateOne(
                { _id: job._id },
                {
                    $set: {
                        status: 'RUNNING',
                        lockedBy: this.workerId,
                        lockedAt: new Date()
                    }
                }
            );

            // Get the handler for this task type
            const handler = this.taskHandlers[job.taskType];

            if (!handler) {
                throw new Error(`No handler registered for task type: ${job.taskType}`);
            }

            console.log(`[JobExecutor] Executing job: ${job.jobId} (${job.taskType})`);

            // Execute the handler with timeout
            const result = await this.executeWithTimeout(
                () => handler(job.payload, job),
                job.lockTimeout || this.defaultTimeout
            );

            // Calculate duration
            const duration = Date.now() - startTime;

            // Complete the execution log
            await executionLog.complete(result);

            // Handle job completion
            await this.handleCompletion(job, result, duration);

            console.log(`[JobExecutor] Job ${job.jobId} completed in ${duration}ms`);

            return {
                success: true,
                jobId: job.jobId,
                result,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            // Log the failure
            await executionLog.fail(error, this.classifyError(error));

            // Handle job failure
            await this.handleFailure(job, error);

            console.error(`[JobExecutor] Job ${job.jobId} failed:`, error.message);

            return {
                success: false,
                jobId: job.jobId,
                error: error.message,
                duration
            };
        }
    }

    /**
     * Execute a function with a timeout
     * 
     * @param {Function} fn - Function to execute
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<any>} - Function result
     */
    async executeWithTimeout(fn, timeout) {
        return Promise.race([
            fn(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Job execution timed out')), timeout)
            )
        ]);
    }

    /**
     * Handle successful job completion
     * 
     * For one-time jobs: Mark as COMPLETED
     * For recurring jobs: Calculate next run time and reschedule
     * 
     * @param {Object} job - The completed job
     * @param {any} result - Execution result
     * @param {number} duration - Execution time in ms
     */
    async handleCompletion(job, result, duration) {
        const updateData = {
            lastRunAt: new Date(),
            executionDuration: duration,
            result,
            lockedBy: null,
            lockedAt: null,
            lastError: null,
            lastErrorStack: null
        };

        if (job.jobType === 'ONE_TIME') {
            // One-time job: Mark as completed
            updateData.status = 'COMPLETED';
            updateData.retryCount = 0;
        } else if (job.jobType === 'RECURRING') {
            // Recurring job: Calculate next run and reschedule
            const nextRunAt = this.calculateNextRun(job);

            if (nextRunAt && (!job.endTime || nextRunAt < job.endTime)) {
                updateData.status = 'SCHEDULED';
                updateData.nextRunAt = nextRunAt;
                updateData.retryCount = 0;
            } else {
                // No more runs scheduled (end time passed or no valid next run)
                updateData.status = 'COMPLETED';
            }
        }

        await Job.updateOne({ _id: job._id }, { $set: updateData });
    }

    /**
     * Handle job failure
     * 
     * If retries remaining: Reschedule for retry
     * If no retries left: Mark as FAILED
     * 
     * @param {Object} job - The failed job
     * @param {Error} error - The error that occurred
     */
    async handleFailure(job, error) {
        const newRetryCount = (job.retryCount || 0) + 1;
        const canRetry = newRetryCount < job.maxRetries;

        const updateData = {
            lastRunAt: new Date(),
            lastError: error.message,
            lastErrorStack: error.stack,
            lockedBy: null,
            lockedAt: null,
            retryCount: newRetryCount
        };

        if (canRetry) {
            // Calculate retry delay (with exponential backoff if enabled)
            let retryDelay = job.retryDelay || 60000;
            if (job.useExponentialBackoff) {
                retryDelay = retryDelay * Math.pow(2, job.retryCount);
            }

            const nextRetryAt = new Date(Date.now() + retryDelay);

            updateData.status = 'SCHEDULED';
            updateData.nextRunAt = nextRetryAt;
            updateData.nextRetryAt = nextRetryAt;

            console.log(`[JobExecutor] Job ${job.jobId} scheduled for retry at ${nextRetryAt}`);
        } else {
            // No more retries
            updateData.status = 'FAILED';
            console.log(`[JobExecutor] Job ${job.jobId} marked as FAILED (max retries exceeded)`);
        }

        await Job.updateOne({ _id: job._id }, { $set: updateData });
    }

    /**
     * Calculate the next run time for a recurring job
     * 
     * @param {Object} job - The job document
     * @returns {Date|null} - Next run time or null
     */
    calculateNextRun(job) {
        const now = new Date();

        if (job.interval) {
            // Interval-based: Add interval to current time
            return new Date(now.getTime() + job.interval);
        }

        if (job.cronExpression) {
            // Cron-based: Parse cron and get next occurrence
            // In production, use a library like 'cron-parser'
            // For now, we'll use a simple implementation
            return this.getNextCronRun(job.cronExpression, now);
        }

        return null;
    }

    /**
     * Get next cron run time (simplified implementation)
     * 
     * For production, use 'cron-parser' library for accurate parsing.
     * This is a basic implementation for common patterns.
     * 
     * @param {string} cronExpression - Cron expression
     * @param {Date} from - Calculate from this time
     * @returns {Date} - Next run time
     */
    getNextCronRun(cronExpression, from) {
        // Simple implementation: Just add 1 hour for now
        // TODO: Replace with proper cron-parser in production
        // Example: const parser = require('cron-parser');
        //          const interval = parser.parseExpression(cronExpression);
        //          return interval.next().toDate();

        const parts = cronExpression.split(' ');
        const minute = parts[0];
        const hour = parts[1];

        const next = new Date(from);

        // If minute is specified (not *)
        if (minute !== '*' && !minute.includes('/')) {
            next.setMinutes(parseInt(minute, 10));
            next.setSeconds(0);
            next.setMilliseconds(0);
        }

        // If hour is specified (not *)
        if (hour !== '*' && !hour.includes('/')) {
            next.setHours(parseInt(hour, 10));
        }

        // Ensure next is in the future
        if (next <= from) {
            // Add 1 day for daily jobs, 1 hour for hourly, etc.
            if (minute.includes('/')) {
                const interval = parseInt(minute.split('/')[1], 10);
                next.setMinutes(from.getMinutes() + interval);
            } else if (hour === '*') {
                next.setHours(next.getHours() + 1);
            } else {
                next.setDate(next.getDate() + 1);
            }
        }

        return next;
    }

    /**
     * Classify an error for analytics
     * 
     * @param {Error} error - The error
     * @returns {string} - Error classification
     */
    classifyError(error) {
        const message = error.message.toLowerCase();

        if (message.includes('timeout')) return 'TIMEOUT';
        if (message.includes('network') || message.includes('econnrefused')) return 'NETWORK_ERROR';
        if (message.includes('validation')) return 'VALIDATION_ERROR';
        if (message.includes('not found')) return 'NOT_FOUND';
        if (message.includes('handler')) return 'HANDLER_ERROR';

        return 'UNKNOWN_ERROR';
    }
}

module.exports = JobExecutor;
