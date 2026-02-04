
const EventEmitter = require('events');
const { LockManager } = require('./LockManager');
const JobPicker = require('./JobPicker');
const JobExecutor = require('./JobExecutor');

class Scheduler extends EventEmitter {

    constructor(options = {}) {
        super();

        this.pollInterval = options.pollInterval || 5000; // 5 seconds
        this.concurrency = options.concurrency || 5;
        this.lockTimeout = options.lockTimeout || 300000; // 5 minutes

        // Generate unique worker ID
        this.workerId = `scheduler_${process.pid}_${Date.now().toString(36)}`;

        // Initialize components
        this.lockManager = new LockManager({
            workerId: this.workerId,
            defaultTTL: this.lockTimeout
        });

        this.jobPicker = new JobPicker({
            workerId: this.workerId,
            lockTimeout: this.lockTimeout,
            batchSize: this.concurrency
        });

        this.executor = new JobExecutor({
            workerId: this.workerId,
            taskHandlers: options.taskHandlers || {},
            defaultTimeout: this.lockTimeout
        });

        // State
        this.isRunning = false;
        this.activeJobs = new Map();
        this.pollTimer = null;
        this.staleRecoveryTimer = null;

        // Stats
        this.stats = {
            jobsProcessed: 0,
            jobsSucceeded: 0,
            jobsFailed: 0,
            startedAt: null
        };

        console.log(`[Scheduler] Initialized with workerId: ${this.workerId}`);
    }

    registerHandler(taskType, handler) {
        this.executor.registerHandler(taskType, handler);
        return this; // Allow chaining
    }

    async start() {
        if (this.isRunning) {
            console.log('[Scheduler] Already running');
            return;
        }

        console.log('[Scheduler] Starting...');
        this.isRunning = true;
        this.stats.startedAt = new Date();
        // Start polling for jobs
        this.poll();
        this.pollTimer = setInterval(() => this.poll(), this.pollInterval);

        // Start stale job recovery (every minute)
        this.staleRecoveryTimer = setInterval(() => {
            this.jobPicker.recoverStaleJobs();
        }, 60000);

        // Handle graceful shutdown
        this.setupShutdownHandlers();

        this.emit('started', { workerId: this.workerId });
        console.log(`[Scheduler] Started. Polling every ${this.pollInterval}ms`);
    }

    async stop() {
        if (!this.isRunning) {
            console.log('[Scheduler] Not running');
            return;
        }

        console.log('[Scheduler] Stopping...');
        this.isRunning = false;

        // Stop polling
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        if (this.staleRecoveryTimer) {
            clearInterval(this.staleRecoveryTimer);
            this.staleRecoveryTimer = null;
        }

        // Wait for active jobs to complete (with timeout)
        if (this.activeJobs.size > 0) {
            console.log(`[Scheduler] Waiting for ${this.activeJobs.size} active jobs to complete...`);

            const timeout = setTimeout(() => {
                console.log('[Scheduler] Shutdown timeout reached. Releasing held jobs.');
            }, 30000);

            await Promise.allSettled(Array.from(this.activeJobs.values()));
            clearTimeout(timeout);
        }

        // Release all locks and jobs
        await this.lockManager.releaseAll();
        await this.jobPicker.releaseAll();

        this.emit('stopped', { stats: this.stats });
        console.log('[Scheduler] Stopped');
    }

    async poll() {
        if (!this.isRunning) return;

        try {
            // Calculate how many jobs we can pick
            const availableSlots = this.concurrency - this.activeJobs.size;

            if (availableSlots <= 0) {
                // All slots are full
                return;
            }

            // Pick jobs
            const jobs = await this.jobPicker.pickMany(availableSlots);

            if (jobs.length > 0) {
                console.log(`[Scheduler] Picked ${jobs.length} jobs for processing`);
            }

            // Process each job
            for (const job of jobs) {
                this.processJob(job);
            }

        } catch (error) {
            console.error('[Scheduler] Error in poll loop:', error);
            this.emit('error', error);
        }
    }

    async processJob(job) {
        // Track active job
        const jobPromise = (async () => {
            try {
                this.emit('job:start', { jobId: job.jobId, taskType: job.taskType });

                const result = await this.executor.execute(job);

                this.stats.jobsProcessed++;

                if (result.success) {
                    this.stats.jobsSucceeded++;
                    this.emit('job:complete', {
                        jobId: job.jobId,
                        result: result.result,
                        duration: result.duration
                    });
                } else {
                    this.stats.jobsFailed++;
                    this.emit('job:failed', {
                        jobId: job.jobId,
                        error: result.error,
                        duration: result.duration
                    });
                }

                return result;

            } catch (error) {
                this.stats.jobsFailed++;
                this.emit('job:error', { jobId: job.jobId, error: error.message });
                throw error;

            } finally {
                this.activeJobs.delete(job.jobId);
            }
        })();

        this.activeJobs.set(job.jobId, jobPromise);
    }

    setupShutdownHandlers() {
        const shutdown = async (signal) => {
            console.log(`[Scheduler] Received ${signal}. Starting graceful shutdown...`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            activeJobs: this.activeJobs.size,
            workerId: this.workerId,
            uptime: this.stats.startedAt
                ? Date.now() - this.stats.startedAt.getTime()
                : 0
        };
    }
}

module.exports = Scheduler;
