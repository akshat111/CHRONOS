/**
 * Job Picker
 * 
 * Responsible for finding and claiming jobs that are due for execution.
 * Uses atomic MongoDB operations to prevent duplicate job pickup.
 * 
 * KEY CONCEPTS:
 * 1. Atomic Claim: Uses findOneAndUpdate to atomically claim a job
 * 2. Lock Window: Jobs are locked for a specified duration
 * 3. Stale Lock Recovery: Reclaims jobs with expired locks
 */

const Job = require('../models/Job');

class JobPicker {
    /**
     * Create a new JobPicker
     * @param {Object} options - Configuration
     * @param {string} options.workerId - Unique worker identifier
     * @param {number} options.lockTimeout - Lock duration in ms (default: 5 minutes)
     * @param {number} options.batchSize - Max jobs to pick at once (default: 10)
     */
    constructor(options = {}) {
        this.workerId = options.workerId || `picker_${process.pid}_${Date.now()}`;
        this.lockTimeout = options.lockTimeout || 300000; // 5 minutes
        this.batchSize = options.batchSize || 10;
    }

    /**
     * Pick a single due job atomically
     * 
     * HOW DUPLICATE EXECUTION IS PREVENTED:
     * 
     * 1. We use findOneAndUpdate with specific conditions:
     *    - status must be 'SCHEDULED'
     *    - nextRunAt must be <= current time
     *    - Either no lock exists, OR the lock is expired
     * 
     * 2. In the SAME atomic operation, we:
     *    - Set status to 'QUEUED'
     *    - Set lockedBy to our worker ID
     *    - Set lockedAt to current time
     * 
     * 3. Since MongoDB's findOneAndUpdate is atomic:
     *    - Only ONE worker can successfully match and update
     *    - Other workers will get null (no match)
     *    - This guarantees exactly-once pickup
     * 
     * @returns {Promise<Object|null>} - The claimed job or null
     */
    async pickOne() {
        const now = new Date();
        const staleThreshold = new Date(now.getTime() - this.lockTimeout);

        try {
            // Atomic find-and-claim operation
            const job = await Job.findOneAndUpdate(
                {
                    // Job must be scheduled
                    status: 'SCHEDULED',
                    // Job must be due
                    nextRunAt: { $lte: now },
                    // Job must be active
                    isActive: true,
                    // Either not locked, or lock is stale
                    $or: [
                        { lockedBy: null },
                        { lockedAt: null },
                        { lockedAt: { $lt: staleThreshold } }
                    ]
                },
                {
                    // Claim the job
                    $set: {
                        status: 'QUEUED',
                        lockedBy: this.workerId,
                        lockedAt: now
                    }
                },
                {
                    // Return the updated document
                    new: true,
                    // Sort by priority (lower = higher priority) then by due time
                    sort: { priority: 1, nextRunAt: 1 }
                }
            );

            if (job) {
                console.log(`[JobPicker] Picked job: ${job.jobId} (type: ${job.taskType})`);
            }

            return job;
        } catch (error) {
            console.error('[JobPicker] Error picking job:', error);
            throw error;
        }
    }

    /**
     * Pick multiple due jobs atomically
     * 
     * For efficiency in high-throughput scenarios.
     * Each job is claimed individually to ensure atomicity.
     * 
     * @param {number} count - Maximum jobs to pick
     * @returns {Promise<Array>} - Array of claimed jobs
     */
    async pickMany(count = null) {
        const limit = count || this.batchSize;
        const jobs = [];

        for (let i = 0; i < limit; i++) {
            const job = await this.pickOne();
            if (!job) break; // No more due jobs
            jobs.push(job);
        }

        return jobs;
    }

    /**
     * Count jobs that are due for execution
     * 
     * @returns {Promise<number>} - Number of due jobs
     */
    async countDueJobs() {
        const now = new Date();
        const staleThreshold = new Date(now.getTime() - this.lockTimeout);

        return Job.countDocuments({
            status: 'SCHEDULED',
            nextRunAt: { $lte: now },
            isActive: true,
            $or: [
                { lockedBy: null },
                { lockedAt: null },
                { lockedAt: { $lt: staleThreshold } }
            ]
        });
    }

    /**
     * Release a job (put it back to SCHEDULED)
     * 
     * Used when a worker can't process a job or shuts down gracefully.
     * 
     * @param {Object} job - The job to release
     * @returns {Promise<boolean>} - Whether the job was released
     */
    async release(job) {
        try {
            const result = await Job.updateOne(
                {
                    _id: job._id,
                    lockedBy: this.workerId
                },
                {
                    $set: {
                        status: 'SCHEDULED',
                        lockedBy: null,
                        lockedAt: null
                    }
                }
            );

            return result.modifiedCount > 0;
        } catch (error) {
            console.error(`[JobPicker] Error releasing job ${job.jobId}:`, error);
            return false;
        }
    }

    /**
     * Release all jobs held by this worker
     * 
     * Call during graceful shutdown.
     * 
     * @returns {Promise<number>} - Number of jobs released
     */
    async releaseAll() {
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

        console.log(`[JobPicker] Released ${result.modifiedCount} jobs`);
        return result.modifiedCount;
    }

    /**
     * Recover stale jobs globally
     * 
     * Finds jobs that were locked but never completed (worker crashed).
     * Resets them to SCHEDULED so they can be picked again.
     * 
     * Run this periodically (e.g., every minute).
     * 
     * @param {number} staleThreshold - Age in ms to consider stale
     * @returns {Promise<number>} - Number of jobs recovered
     */
    async recoverStaleJobs(staleThreshold = null) {
        const threshold = staleThreshold || this.lockTimeout;
        const cutoff = new Date(Date.now() - threshold);

        const result = await Job.updateMany(
            {
                status: { $in: ['QUEUED', 'RUNNING'] },
                lockedAt: { $lt: cutoff },
                lockedBy: { $ne: null }
            },
            {
                $set: {
                    status: 'SCHEDULED',
                    lockedBy: null,
                    lockedAt: null
                },
                $inc: {
                    retryCount: 1
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`[JobPicker] Recovered ${result.modifiedCount} stale jobs`);
        }

        return result.modifiedCount;
    }
}

module.exports = JobPicker;
