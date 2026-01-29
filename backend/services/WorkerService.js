/**
 * Worker Service
 * 
 * A robust worker service that:
 * 1. Picks jobs from the queue
 * 2. Executes them through registered handlers
 * 3. Logs execution results to JobExecutionLog
 * 4. Handles errors gracefully
 * 5. Supports graceful shutdown
 * 
 * This is a more complete implementation with detailed logging
 * and execution tracking.
 */

const EventEmitter = require('events');
const Job = require('../models/Job');
const JobExecutionLog = require('../models/JobExecutionLog');
const os = require('os');

class WorkerService extends EventEmitter {
    /**
     * Create a new WorkerService
     * 
     * @param {Object} options - Configuration
     * @param {string} options.workerId - Unique worker identifier
     * @param {number} options.pollInterval - Polling interval in ms
     * @param {number} options.concurrency - Max parallel jobs
     * @param {number} options.jobTimeout - Default job timeout in ms
     * @param {Object} options.handlers - Initial task handlers
     */
    constructor(options = {}) {
        super();

        // Worker identity
        this.workerId = options.workerId || `worker_${os.hostname()}_${process.pid}_${Date.now().toString(36)}`;
        this.hostname = os.hostname();

        // Configuration
        this.pollInterval = options.pollInterval || 5000;
        this.concurrency = options.concurrency || 5;
        this.jobTimeout = options.jobTimeout || 300000; // 5 minutes
        this.lockTimeout = options.lockTimeout || 300000;

        // Task handlers registry
        this.handlers = new Map();
        if (options.handlers) {
            Object.entries(options.handlers).forEach(([type, handler]) => {
                this.handlers.set(type, handler);
            });
        }

        // State
        this.isRunning = false;
        this.isPaused = false;
        this.activeJobs = new Map();
        this.pollTimer = null;

        // Statistics
        this.stats = {
            startedAt: null,
            jobsProcessed: 0,
            jobsSucceeded: 0,
            jobsFailed: 0,
            totalExecutionTime: 0,
            lastJobAt: null
        };

        console.log(`[WorkerService] Initialized: ${this.workerId}`);
    }

    /**
     * Register a task handler
     * 
     * @param {string} taskType - Task type identifier
     * @param {Function} handler - Async handler function (payload, job) => result
     * @returns {this} - For chaining
     */
    registerHandler(taskType, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Handler must be a function');
        }
        this.handlers.set(taskType, handler);
        console.log(`[WorkerService] Registered handler: ${taskType}`);
        return this;
    }

    /**
     * Unregister a task handler
     * 
     * @param {string} taskType - Task type to remove
     */
    unregisterHandler(taskType) {
        this.handlers.delete(taskType);
    }

    /**
     * Start the worker
     */
    async start() {
        if (this.isRunning) {
            console.log('[WorkerService] Already running');
            return;
        }

        this.isRunning = true;
        this.isPaused = false;
        this.stats.startedAt = new Date();

        console.log(`[WorkerService] Starting with ${this.handlers.size} handlers...`);
        console.log(`[WorkerService] Handlers: ${Array.from(this.handlers.keys()).join(', ')}`);

        // Start polling
        await this.poll();
        this.pollTimer = setInterval(() => this.poll(), this.pollInterval);

        // Setup shutdown handlers
        this.setupShutdownHandlers();

        this.emit('started', { workerId: this.workerId });
        console.log(`[WorkerService] Started. Polling every ${this.pollInterval}ms`);
    }

    /**
     * Stop the worker gracefully
     * 
     * @param {boolean} waitForJobs - Wait for active jobs to complete
     */
    async stop(waitForJobs = true) {
        if (!this.isRunning) return;

        console.log('[WorkerService] Stopping...');
        this.isRunning = false;

        // Stop polling
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        // Wait for active jobs
        if (waitForJobs && this.activeJobs.size > 0) {
            console.log(`[WorkerService] Waiting for ${this.activeJobs.size} jobs to complete...`);

            try {
                await Promise.race([
                    Promise.all(Array.from(this.activeJobs.values())),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Shutdown timeout')), 30000)
                    )
                ]);
            } catch (error) {
                console.log('[WorkerService] Shutdown timeout reached');
            }
        }

        // Release any held jobs
        await this.releaseAllJobs();

        this.emit('stopped', { stats: this.getStats() });
        console.log('[WorkerService] Stopped');
    }

    /**
     * Pause job processing
     */
    pause() {
        this.isPaused = true;
        console.log('[WorkerService] Paused');
        this.emit('paused');
    }

    /**
     * Resume job processing
     */
    resume() {
        this.isPaused = false;
        console.log('[WorkerService] Resumed');
        this.emit('resumed');
    }

    /**
     * Poll for due jobs
     */
    async poll() {
        if (!this.isRunning || this.isPaused) return;

        try {
            // Calculate available slots
            const availableSlots = this.concurrency - this.activeJobs.size;
            if (availableSlots <= 0) return;

            // Pick jobs
            const jobs = await this.pickJobs(availableSlots);

            // Process each job
            for (const job of jobs) {
                this.processJob(job);
            }
        } catch (error) {
            console.error('[WorkerService] Poll error:', error);
            this.emit('error', error);
        }
    }

    /**
     * Pick jobs from the queue atomically
     * 
     * @param {number} limit - Max jobs to pick
     * @returns {Array} - Claimed jobs
     */
    async pickJobs(limit) {
        const now = new Date();
        const staleThreshold = new Date(now.getTime() - this.lockTimeout);
        const jobs = [];

        for (let i = 0; i < limit; i++) {
            const job = await Job.findOneAndUpdate(
                {
                    status: 'SCHEDULED',
                    nextRunAt: { $lte: now },
                    isActive: true,
                    $or: [
                        { lockedBy: null },
                        { lockedAt: null },
                        { lockedAt: { $lt: staleThreshold } }
                    ]
                },
                {
                    $set: {
                        status: 'QUEUED',
                        lockedBy: this.workerId,
                        lockedAt: now
                    }
                },
                {
                    new: true,
                    sort: { priority: 1, nextRunAt: 1 }
                }
            );

            if (!job) break;
            jobs.push(job);
        }

        if (jobs.length > 0) {
            console.log(`[WorkerService] Picked ${jobs.length} job(s)`);
        }

        return jobs;
    }

    /**
     * Process a single job
     * 
     * @param {Object} job - Job document
     */
    async processJob(job) {
        const jobPromise = this.executeJob(job).finally(() => {
            this.activeJobs.delete(job.jobId);
        });

        this.activeJobs.set(job.jobId, jobPromise);
    }

    /**
     * Execute a job with full lifecycle management
     * 
     * @param {Object} job - Job document
     * @returns {Object} - Execution result
     */
    async executeJob(job) {
        const startTime = Date.now();
        let executionLog = null;

        try {
            // Create execution log entry
            executionLog = new JobExecutionLog({
                job: job._id,
                jobId: job.jobId,
                jobName: job.jobName,
                taskType: job.taskType,
                scheduledTime: job.nextRunAt || job.scheduleTime,
                executionStartTime: new Date(),
                retryAttempt: job.retryCount || 0,
                isRetry: (job.retryCount || 0) > 0,
                workerId: this.workerId,
                workerHost: this.hostname,
                payload: job.payload,
                status: 'RUNNING'
            });
            await executionLog.save();

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

            console.log(`[WorkerService] ▶ Executing: ${job.jobId} (${job.taskType})`);
            this.emit('job:start', { jobId: job.jobId, taskType: job.taskType });

            // Get handler
            const handler = this.handlers.get(job.taskType);
            if (!handler) {
                throw new Error(`No handler registered for task type: ${job.taskType}`);
            }

            // Execute with timeout
            const result = await this.executeWithTimeout(
                async () => handler(job.payload || {}, job),
                job.lockTimeout || this.jobTimeout
            );

            // Calculate duration
            const duration = Date.now() - startTime;

            // Log success
            await this.logSuccess(executionLog, result, duration);

            // Handle completion
            await this.handleJobSuccess(job, result, duration);

            console.log(`[WorkerService] ✓ Completed: ${job.jobId} (${duration}ms)`);
            this.emit('job:complete', { jobId: job.jobId, result, duration });

            // Update stats
            this.updateStats(true, duration);

            return { success: true, jobId: job.jobId, result, duration };

        } catch (error) {
            const duration = Date.now() - startTime;

            console.error(`[WorkerService] ✗ Failed: ${job.jobId} - ${error.message}`);

            // Log failure
            if (executionLog) {
                await this.logFailure(executionLog, error, duration);
            }

            // Handle failure
            await this.handleJobFailure(job, error);

            this.emit('job:failed', { jobId: job.jobId, error: error.message, duration });

            // Update stats
            this.updateStats(false, duration);

            return { success: false, jobId: job.jobId, error: error.message, duration };
        }
    }

    /**
     * Execute a function with timeout
     * 
     * @param {Function} fn - Function to execute
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<any>} - Result
     */
    executeWithTimeout(fn, timeout) {
        return Promise.race([
            fn(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Job execution timed out')), timeout)
            )
        ]);
    }

    /**
     * Log successful execution
     */
    async logSuccess(executionLog, result, duration) {
        executionLog.status = 'SUCCESS';
        executionLog.executionEndTime = new Date();
        executionLog.duration = duration;
        executionLog.result = result;
        executionLog.memoryUsage = process.memoryUsage().heapUsed;
        await executionLog.save();
    }

    /**
     * Log failed execution
     */
    async logFailure(executionLog, error, duration) {
        executionLog.status = error.message.includes('timeout') ? 'TIMEOUT' : 'FAILED';
        executionLog.executionEndTime = new Date();
        executionLog.duration = duration;
        executionLog.errorMessage = error.message;
        executionLog.errorStack = error.stack;
        executionLog.errorCode = this.classifyError(error);
        executionLog.memoryUsage = process.memoryUsage().heapUsed;
        await executionLog.save();
    }

    /**
     * Handle successful job completion
     */
    async handleJobSuccess(job, result, duration) {
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
            updateData.status = 'COMPLETED';
            updateData.retryCount = 0;
        } else if (job.jobType === 'RECURRING') {
            const nextRunAt = this.calculateNextRun(job);

            if (nextRunAt && (!job.endTime || nextRunAt < new Date(job.endTime))) {
                updateData.status = 'SCHEDULED';
                updateData.nextRunAt = nextRunAt;
                updateData.retryCount = 0;
            } else {
                updateData.status = 'COMPLETED';
            }
        }

        await Job.updateOne({ _id: job._id }, { $set: updateData });
    }

    /**
     * Handle job failure
     */
    async handleJobFailure(job, error) {
        const newRetryCount = (job.retryCount || 0) + 1;
        const canRetry = newRetryCount < (job.maxRetries || 3);

        const updateData = {
            lastRunAt: new Date(),
            lastError: error.message,
            lastErrorStack: error.stack,
            lockedBy: null,
            lockedAt: null,
            retryCount: newRetryCount
        };

        if (canRetry) {
            // Calculate retry delay with exponential backoff
            let retryDelay = job.retryDelay || 60000;
            if (job.useExponentialBackoff !== false) {
                retryDelay = retryDelay * Math.pow(2, job.retryCount || 0);
            }

            const nextRetryAt = new Date(Date.now() + retryDelay);

            updateData.status = 'SCHEDULED';
            updateData.nextRunAt = nextRetryAt;
            updateData.nextRetryAt = nextRetryAt;

            console.log(`[WorkerService] Retry scheduled for ${job.jobId} at ${nextRetryAt.toISOString()}`);
        } else {
            updateData.status = 'FAILED';
            console.log(`[WorkerService] Job ${job.jobId} marked as FAILED (max retries exceeded)`);
        }

        await Job.updateOne({ _id: job._id }, { $set: updateData });
    }

    /**
     * Calculate next run time for recurring jobs
     */
    calculateNextRun(job) {
        const now = new Date();

        if (job.interval) {
            return new Date(now.getTime() + job.interval);
        }

        if (job.cronExpression) {
            // Simple next run calculation
            // In production, use cron-parser library
            return new Date(now.getTime() + 3600000); // Default to 1 hour
        }

        return null;
    }

    /**
     * Classify error for analytics
     */
    classifyError(error) {
        const message = error.message.toLowerCase();

        if (message.includes('timeout')) return 'TIMEOUT';
        if (message.includes('network') || message.includes('econnrefused')) return 'NETWORK_ERROR';
        if (message.includes('validation')) return 'VALIDATION_ERROR';
        if (message.includes('not found')) return 'NOT_FOUND';
        if (message.includes('handler')) return 'HANDLER_ERROR';
        if (message.includes('memory')) return 'MEMORY_ERROR';

        return 'UNKNOWN_ERROR';
    }

    /**
     * Release all jobs held by this worker
     */
    async releaseAllJobs() {
        const result = await Job.updateMany(
            { lockedBy: this.workerId },
            {
                $set: {
                    status: 'SCHEDULED',
                    lockedBy: null,
                    lockedAt: null
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`[WorkerService] Released ${result.modifiedCount} jobs`);
        }
    }

    /**
     * Update statistics
     */
    updateStats(success, duration) {
        this.stats.jobsProcessed++;
        if (success) {
            this.stats.jobsSucceeded++;
        } else {
            this.stats.jobsFailed++;
        }
        this.stats.totalExecutionTime += duration;
        this.stats.lastJobAt = new Date();
    }

    /**
     * Get worker statistics
     */
    getStats() {
        const now = Date.now();
        return {
            ...this.stats,
            workerId: this.workerId,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            activeJobs: this.activeJobs.size,
            registeredHandlers: Array.from(this.handlers.keys()),
            uptime: this.stats.startedAt ? now - this.stats.startedAt.getTime() : 0,
            avgExecutionTime: this.stats.jobsProcessed > 0
                ? Math.round(this.stats.totalExecutionTime / this.stats.jobsProcessed)
                : 0,
            successRate: this.stats.jobsProcessed > 0
                ? ((this.stats.jobsSucceeded / this.stats.jobsProcessed) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupShutdownHandlers() {
        const shutdown = async (signal) => {
            console.log(`\n[WorkerService] Received ${signal}. Starting graceful shutdown...`);
            await this.stop(true);
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
}

module.exports = WorkerService;
