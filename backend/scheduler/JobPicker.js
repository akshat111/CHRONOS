
const Job = require('../models/Job');

class JobPicker {

    constructor(options = {}) {
        this.workerId = options.workerId || `picker_${process.pid}_${Date.now()}`;
        this.lockTimeout = options.lockTimeout || 300000; // 5 minutes
        this.batchSize = options.batchSize || 10;
    }

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
