
const EventEmitter = require('events');
const Job = require('../models/Job');
const JobExecutionLog = require('../models/JobExecutionLog');
const { RetryManager, RETRY_STRATEGY } = require('./RetryManager');
const os = require('os');

class WorkerServiceWithRetry extends EventEmitter {
    constructor(options = {}) {
        super();

        // Worker identity
        this.workerId = options.workerId || `worker_${os.hostname()}_${process.pid}_${Date.now().toString(36)}`;
        this.hostname = os.hostname();

        // Configuration
        this.pollInterval = options.pollInterval || 5000;
        this.concurrency = options.concurrency || 5;
        this.jobTimeout = options.jobTimeout || 300000;
        this.lockTimeout = options.lockTimeout || 300000;

        // Initialize RetryManager with configuration
        this.retryManager = new RetryManager({
            maxRetries: options.maxRetries || 3,
            baseDelay: options.baseRetryDelay || 60000,
            maxDelay: options.maxRetryDelay || 3600000,
            strategy: options.retryStrategy || RETRY_STRATEGY.EXPONENTIAL,
            jitterEnabled: options.jitterEnabled !== false
        });

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
            totalRetries: 0,
            successfulRetries: 0,
            totalExecutionTime: 0,
            lastJobAt: null
        };

        console.log(`[Worker] Initialized: ${this.workerId}`);
        console.log(`[Worker] Retry config: ${this.retryManager.getConfig().strategyDescription}`);
    }

    // Register a task handler
    registerHandler(taskType, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Handler must be a function');
        }
        this.handlers.set(taskType, handler);
        console.log(`[Worker] Registered handler: ${taskType}`);
        return this;
    }

    // Start the worker
    async start() {
        if (this.isRunning) {
            console.log('[Worker] Already running');
            return;
        }

        this.isRunning = true;
        this.stats.startedAt = new Date();

        // Start polling
        await this.poll();
        this.pollTimer = setInterval(() => this.poll(), this.pollInterval);

        // Shutdown handlers
        this.setupShutdownHandlers();

        this.emit('started', { workerId: this.workerId });
        console.log(`[Worker] Started. Polling every ${this.pollInterval}ms`);
    }

    // Stop the worker
    async stop(waitForJobs = true) {
        if (!this.isRunning) return;

        console.log('[Worker] Stopping...');
        this.isRunning = false;

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        if (waitForJobs && this.activeJobs.size > 0) {
            console.log(`[Worker] Waiting for ${this.activeJobs.size} jobs...`);
            await Promise.race([
                Promise.all(Array.from(this.activeJobs.values())),
                new Promise(r => setTimeout(r, 30000))
            ]);
        }

        await this.releaseAllJobs();
        this.emit('stopped', { stats: this.getStats() });
        console.log('[Worker] Stopped');
    }

    // Poll for due jobs
    async poll() {
        if (!this.isRunning || this.isPaused) return;

        try {
            const slots = this.concurrency - this.activeJobs.size;
            if (slots <= 0) return;

            const jobs = await this.pickJobs(slots);
            for (const job of jobs) {
                this.processJob(job);
            }
        } catch (error) {
            console.error('[Worker] Poll error:', error);
            this.emit('error', error);
        }
    }

    // Pick jobs atomically
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
            console.log(`[Worker] Picked ${jobs.length} job(s)`);
        }

        return jobs;
    }

    // Process a job
    async processJob(job) {
        const jobPromise = this.executeJob(job).finally(() => {
            this.activeJobs.delete(job.jobId);
        });
        this.activeJobs.set(job.jobId, jobPromise);
    }

    async executeJob(job) {
        const startTime = Date.now();
        const isRetry = (job.retryCount || 0) > 0;
        const attemptNumber = (job.retryCount || 0) + 1;

        // Log retry attempt info
        if (isRetry) {
            console.log(`\n[Worker] ♻️  RETRY ATTEMPT #${attemptNumber} for ${job.jobId}`);
            console.log(`   Previous error: ${job.lastError || 'Unknown'}`);
            console.log(`   Remaining retries: ${this.retryManager.getRemainingRetries(job)}`);
        }

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
                isRetry,
                workerId: this.workerId,
                workerHost: this.hostname,
                payload: job.payload,
                metadata: {
                    attemptNumber,
                    maxRetries: job.maxRetries || 3
                }
            });
            await executionLog.save();

            // Mark as RUNNING
            await Job.updateOne(
                { _id: job._id },
                { $set: { status: 'RUNNING', lockedBy: this.workerId, lockedAt: new Date() } }
            );

            console.log(`[Worker] ▶ Executing: ${job.jobId} (${job.taskType}) - Attempt ${attemptNumber}`);
            this.emit('job:start', { jobId: job.jobId, taskType: job.taskType, attempt: attemptNumber });

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

            const duration = Date.now() - startTime;

            // Log success
            await this.logSuccess(executionLog, result, duration);

            // Handle completion
            await this.handleJobSuccess(job, result, duration);

            // Update stats
            this.stats.jobsProcessed++;
            this.stats.jobsSucceeded++;
            if (isRetry) this.stats.successfulRetries++;
            this.stats.totalExecutionTime += duration;
            this.stats.lastJobAt = new Date();

            console.log(`[Worker] ✓ Completed: ${job.jobId} (${duration}ms)${isRetry ? ' [RETRY SUCCESS]' : ''}`);
            this.emit('job:complete', { jobId: job.jobId, result, duration, attempt: attemptNumber });

            return { success: true, jobId: job.jobId, result, duration };

        } catch (error) {
            const duration = Date.now() - startTime;

            // Use RetryManager to handle failure
            const retryResult = await this.retryManager.handleFailure(job, error, Job);

            // Log the failure with retry info
            if (executionLog) {
                executionLog.status = 'FAILED';
                executionLog.executionEndTime = new Date();
                executionLog.duration = duration;
                executionLog.errorMessage = error.message;
                executionLog.errorStack = error.stack;
                executionLog.errorCode = this.retryManager.classifyError(error);
                executionLog.metadata = {
                    ...executionLog.metadata,
                    willRetry: retryResult.shouldRetry,
                    nextRetryAt: retryResult.nextRetryAt?.toISOString(),
                    remainingRetries: retryResult.remainingRetries,
                    retryDelay: retryResult.retryDelay
                };
                await executionLog.save();
            }

            // Update stats
            this.stats.jobsProcessed++;
            this.stats.jobsFailed++;
            if (retryResult.shouldRetry) this.stats.totalRetries++;
            this.stats.totalExecutionTime += duration;
            this.stats.lastJobAt = new Date();

            // Emit appropriate event
            if (retryResult.shouldRetry) {
                console.log(`[Worker] ⚠ Failed: ${job.jobId} - Will retry in ${this.retryManager.formatDuration(retryResult.retryDelay)}`);
                this.emit('job:retry', {
                    jobId: job.jobId,
                    error: error.message,
                    attempt: attemptNumber,
                    nextRetryAt: retryResult.nextRetryAt,
                    remainingRetries: retryResult.remainingRetries
                });
            } else {
                console.log(`[Worker] ✗ FAILED PERMANENTLY: ${job.jobId} - ${error.message}`);
                this.emit('job:failed', {
                    jobId: job.jobId,
                    error: error.message,
                    attempt: attemptNumber,
                    reason: retryResult.isRetryableError ? 'Max retries exceeded' : 'Non-retryable error'
                });
            }

            return { success: false, jobId: job.jobId, error: error.message, duration, retryScheduled: retryResult.shouldRetry };
        }
    }

    // Execute with timeout
    executeWithTimeout(fn, timeout) {
        return Promise.race([
            fn(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Job execution timed out')), timeout)
            )
        ]);
    }

    // Log success
    async logSuccess(log, result, duration) {
        log.status = 'SUCCESS';
        log.executionEndTime = new Date();
        log.duration = duration;
        log.result = result;
        log.memoryUsage = process.memoryUsage().heapUsed;
        await log.save();
    }

    // Handle successful job
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

    // Calculate next run for recurring jobs
    calculateNextRun(job) {
        if (job.interval) {
            return new Date(Date.now() + job.interval);
        }
        if (job.cronExpression) {
            return new Date(Date.now() + 3600000); // Default 1h (use cron-parser in production)
        }
        return null;
    }

    // Release all jobs
    async releaseAllJobs() {
        const result = await Job.updateMany(
            { lockedBy: this.workerId },
            { $set: { status: 'SCHEDULED', lockedBy: null, lockedAt: null } }
        );
        if (result.modifiedCount > 0) {
            console.log(`[Worker] Released ${result.modifiedCount} jobs`);
        }
    }

    // Get statistics
    getStats() {
        return {
            ...this.stats,
            workerId: this.workerId,
            isRunning: this.isRunning,
            activeJobs: this.activeJobs.size,
            retryConfig: this.retryManager.getConfig(),
            uptime: this.stats.startedAt ? Date.now() - this.stats.startedAt.getTime() : 0,
            avgExecutionTime: this.stats.jobsProcessed > 0
                ? Math.round(this.stats.totalExecutionTime / this.stats.jobsProcessed)
                : 0,
            successRate: this.stats.jobsProcessed > 0
                ? ((this.stats.jobsSucceeded / this.stats.jobsProcessed) * 100).toFixed(2) + '%'
                : '0%',
            retrySuccessRate: this.stats.totalRetries > 0
                ? ((this.stats.successfulRetries / this.stats.totalRetries) * 100).toFixed(2) + '%'
                : 'N/A'
        };
    }

    // Shutdown handlers
    setupShutdownHandlers() {
        const shutdown = async (signal) => {
            console.log(`\n[Worker] Received ${signal}. Graceful shutdown...`);
            await this.stop(true);
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
}

module.exports = WorkerServiceWithRetry;
