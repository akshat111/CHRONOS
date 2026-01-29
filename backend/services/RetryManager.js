/**
 * Retry Manager
 * 
 * Centralized retry logic for job execution with:
 * - Multiple backoff strategies
 * - Configurable retry policies
 * - Retry attempt logging
 * - Circuit breaker pattern support
 * 
 * RETRY STRATEGIES:
 * 
 * 1. FIXED: Same delay every time
 *    [1min] → [1min] → [1min] → FAILED
 * 
 * 2. EXPONENTIAL: Delay doubles each time
 *    [1min] → [2min] → [4min] → [8min] → FAILED
 * 
 * 3. LINEAR: Delay increases by fixed amount
 *    [1min] → [2min] → [3min] → [4min] → FAILED
 * 
 * 4. FIBONACCI: Delay follows fibonacci sequence
 *    [1min] → [1min] → [2min] → [3min] → [5min] → FAILED
 */

const JobExecutionLog = require('../models/JobExecutionLog');

// Retry strategy constants
const RETRY_STRATEGY = {
    FIXED: 'fixed',
    EXPONENTIAL: 'exponential',
    LINEAR: 'linear',
    FIBONACCI: 'fibonacci'
};

// Default configuration
const DEFAULT_CONFIG = {
    maxRetries: 3,
    baseDelay: 60000, // 1 minute
    maxDelay: 3600000, // 1 hour (cap)
    strategy: RETRY_STRATEGY.EXPONENTIAL,
    jitterEnabled: true, // Add randomness to prevent thundering herd
    jitterFactor: 0.2 // ±20% randomness
};

class RetryManager {
    /**
     * Create a new RetryManager
     * 
     * @param {Object} config - Retry configuration
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Calculate the delay before next retry
     * 
     * @param {number} attemptNumber - Current retry attempt (0-indexed)
     * @param {Object} jobConfig - Job-specific retry config
     * @returns {number} - Delay in milliseconds
     */
    calculateDelay(attemptNumber, jobConfig = {}) {
        const baseDelay = jobConfig.retryDelay || this.config.baseDelay;
        const strategy = jobConfig.retryStrategy || this.config.strategy;
        const maxDelay = jobConfig.maxRetryDelay || this.config.maxDelay;

        let delay;

        switch (strategy) {
            case RETRY_STRATEGY.FIXED:
                delay = baseDelay;
                break;

            case RETRY_STRATEGY.EXPONENTIAL:
                // 2^attempt * baseDelay: 1x, 2x, 4x, 8x, 16x...
                delay = baseDelay * Math.pow(2, attemptNumber);
                break;

            case RETRY_STRATEGY.LINEAR:
                // (attempt + 1) * baseDelay: 1x, 2x, 3x, 4x...
                delay = baseDelay * (attemptNumber + 1);
                break;

            case RETRY_STRATEGY.FIBONACCI:
                delay = baseDelay * this.fibonacci(attemptNumber + 1);
                break;

            default:
                delay = baseDelay * Math.pow(2, attemptNumber);
        }

        // Apply maximum cap
        delay = Math.min(delay, maxDelay);

        // Apply jitter to prevent thundering herd problem
        if (this.config.jitterEnabled) {
            delay = this.addJitter(delay);
        }

        return Math.round(delay);
    }

    /**
     * Fibonacci number calculator
     */
    fibonacci(n) {
        if (n <= 1) return 1;
        let a = 1, b = 1;
        for (let i = 2; i <= n; i++) {
            [a, b] = [b, a + b];
        }
        return b;
    }

    /**
     * Add jitter (randomness) to delay
     * Prevents "thundering herd" when many retries happen at same time
     */
    addJitter(delay) {
        const jitterRange = delay * this.config.jitterFactor;
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        return Math.max(0, delay + jitter);
    }

    /**
     * Check if a job can be retried
     * 
     * @param {Object} job - Job document
     * @returns {boolean} - Whether retry is possible
     */
    canRetry(job) {
        const maxRetries = job.maxRetries ?? this.config.maxRetries;
        const currentAttempt = job.retryCount || 0;
        return currentAttempt < maxRetries;
    }

    /**
     * Get remaining retry attempts
     * 
     * @param {Object} job - Job document
     * @returns {number} - Remaining attempts
     */
    getRemainingRetries(job) {
        const maxRetries = job.maxRetries ?? this.config.maxRetries;
        const currentAttempt = job.retryCount || 0;
        return Math.max(0, maxRetries - currentAttempt);
    }

    /**
     * Determine if an error is retryable
     * 
     * Some errors should not be retried (e.g., validation errors)
     * 
     * @param {Error} error - The error that occurred
     * @returns {boolean} - Whether to retry
     */
    isRetryableError(error) {
        const message = error.message.toLowerCase();

        // Non-retryable errors
        const nonRetryable = [
            'validation',
            'invalid',
            'not found',
            'unauthorized',
            'forbidden',
            'no handler',
            'syntax error'
        ];

        for (const keyword of nonRetryable) {
            if (message.includes(keyword)) {
                return false;
            }
        }

        // All other errors are retryable
        return true;
    }

    /**
     * Process a job failure and schedule retry if applicable
     * 
     * @param {Object} job - Job document
     * @param {Error} error - The error that occurred
     * @param {Object} Job - Mongoose Job model
     * @returns {Object} - Retry decision and details
     */
    async handleFailure(job, error, Job) {
        const currentAttempt = (job.retryCount || 0) + 1;
        const maxRetries = job.maxRetries ?? this.config.maxRetries;
        const canRetry = currentAttempt < maxRetries && this.isRetryableError(error);

        const result = {
            shouldRetry: canRetry,
            attemptNumber: currentAttempt,
            maxRetries,
            remainingRetries: maxRetries - currentAttempt,
            error: error.message,
            isRetryableError: this.isRetryableError(error)
        };

        const updateData = {
            lastRunAt: new Date(),
            lastError: error.message,
            lastErrorStack: error.stack,
            lockedBy: null,
            lockedAt: null,
            retryCount: currentAttempt
        };

        if (canRetry) {
            // Calculate delay for next retry
            const delay = this.calculateDelay(currentAttempt - 1, job);
            const nextRetryAt = new Date(Date.now() + delay);

            updateData.status = 'SCHEDULED';
            updateData.nextRunAt = nextRetryAt;
            updateData.nextRetryAt = nextRetryAt;

            result.nextRetryAt = nextRetryAt;
            result.retryDelay = delay;

            console.log(`[RetryManager] Scheduling retry #${currentAttempt} for ${job.jobId}`);
            console.log(`  → Delay: ${this.formatDuration(delay)}`);
            console.log(`  → Next attempt at: ${nextRetryAt.toISOString()}`);
            console.log(`  → Remaining retries: ${result.remainingRetries}`);

        } else {
            // No more retries - mark as FAILED
            updateData.status = 'FAILED';

            if (!this.isRetryableError(error)) {
                console.log(`[RetryManager] Non-retryable error for ${job.jobId}: ${error.message}`);
            } else {
                console.log(`[RetryManager] Max retries exceeded for ${job.jobId}`);
            }
            console.log(`  → Job marked as FAILED after ${currentAttempt} attempt(s)`);
        }

        // Update job in database
        await Job.updateOne({ _id: job._id }, { $set: updateData });

        return result;
    }

    /**
     * Log a retry attempt to JobExecutionLog
     * 
     * @param {Object} params - Log parameters
     */
    async logRetryAttempt(params) {
        const {
            job,
            workerId,
            workerHost,
            error,
            duration,
            attemptNumber,
            willRetry,
            nextRetryAt
        } = params;

        try {
            const log = new JobExecutionLog({
                job: job._id,
                jobId: job.jobId,
                jobName: job.jobName,
                taskType: job.taskType,
                scheduledTime: job.nextRunAt || job.scheduleTime,
                executionStartTime: new Date(Date.now() - duration),
                executionEndTime: new Date(),
                duration,
                status: 'FAILED',
                retryAttempt: attemptNumber,
                isRetry: attemptNumber > 0,
                workerId,
                workerHost,
                payload: job.payload,
                errorMessage: error.message,
                errorStack: error.stack,
                errorCode: this.classifyError(error),
                metadata: {
                    willRetry,
                    nextRetryAt: nextRetryAt?.toISOString(),
                    remainingRetries: this.getRemainingRetries({ ...job, retryCount: attemptNumber })
                }
            });

            await log.save();

            console.log(`[RetryManager] Logged retry attempt #${attemptNumber} for ${job.jobId}`);

        } catch (logError) {
            console.error('[RetryManager] Failed to log retry attempt:', logError.message);
        }
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
        if (message.includes('rate limit')) return 'RATE_LIMIT';
        if (message.includes('permission') || message.includes('forbidden')) return 'PERMISSION_ERROR';

        return 'UNKNOWN_ERROR';
    }

    /**
     * Format duration for logging
     */
    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
        return `${(ms / 3600000).toFixed(1)}h`;
    }

    /**
     * Get retry configuration summary
     */
    getConfig() {
        return {
            ...this.config,
            strategyDescription: this.getStrategyDescription()
        };
    }

    /**
     * Get human-readable strategy description
     */
    getStrategyDescription() {
        const { strategy, baseDelay, maxRetries } = this.config;
        const baseSeconds = baseDelay / 1000;

        const examples = [];
        for (let i = 0; i < Math.min(maxRetries, 5); i++) {
            const delay = this.calculateDelay(i, {}) / 1000;
            examples.push(`${delay.toFixed(0)}s`);
        }

        return `${strategy.toUpperCase()}: ${examples.join(' → ')} → FAILED`;
    }
}

// Export
module.exports = {
    RetryManager,
    RETRY_STRATEGY
};
