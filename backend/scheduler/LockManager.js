
const mongoose = require('mongoose');

// Lock document schema (stored in MongoDB)
const lockSchema = new mongoose.Schema({
    // Unique identifier for the lock (e.g., "scheduler:main" or "job:job_123")
    lockId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // ID of the process/worker holding the lock
    holder: {
        type: String,
        required: true
    },

    // When the lock was acquired
    acquiredAt: {
        type: Date,
        required: true,
        default: Date.now
    },

    // When the lock expires (TTL)
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 } // MongoDB TTL index
    },

    // Additional metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
});

const Lock = mongoose.model('Lock', lockSchema);

class LockManager {

    constructor(options = {}) {
        this.workerId = options.workerId || `worker_${process.pid}_${Date.now()}`;
        this.defaultTTL = options.defaultTTL || 30000; // 30 seconds
        this.activeLocks = new Map(); // Track locks held by this instance
    }

    async acquire(lockId, ttl = null) {
        const lockTTL = ttl || this.defaultTTL;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + lockTTL);

        try {
            // Atomic upsert: only succeeds if lock is available
            const result = await Lock.findOneAndUpdate(
                {
                    lockId,
                    $or: [
                        // Lock doesn't exist (will be created via upsert)
                        { lockId: { $exists: false } },
                        // Lock is expired
                        { expiresAt: { $lt: now } },
                        // Lock is held by this worker (renewal)
                        { holder: this.workerId }
                    ]
                },
                {
                    $set: {
                        lockId,
                        holder: this.workerId,
                        acquiredAt: now,
                        expiresAt,
                        metadata: { renewCount: 0 }
                    }
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );

            // Check if we actually got the lock
            if (result && result.holder === this.workerId) {
                this.activeLocks.set(lockId, {
                    acquiredAt: now,
                    expiresAt,
                    renewInterval: null
                });
                return true;
            }

            return false;
        } catch (error) {
            // Duplicate key error means another process got the lock
            if (error.code === 11000) {
                return false;
            }
            throw error;
        }
    }

    async release(lockId) {
        try {
            const result = await Lock.deleteOne({
                lockId,
                holder: this.workerId
            });

            // Clean up local tracking
            const lockInfo = this.activeLocks.get(lockId);
            if (lockInfo && lockInfo.renewInterval) {
                clearInterval(lockInfo.renewInterval);
            }
            this.activeLocks.delete(lockId);

            return result.deletedCount > 0;
        } catch (error) {
            console.error(`Error releasing lock ${lockId}:`, error);
            return false;
        }
    }

    async renew(lockId, ttl = null) {
        const lockTTL = ttl || this.defaultTTL;
        const expiresAt = new Date(Date.now() + lockTTL);

        try {
            const result = await Lock.findOneAndUpdate(
                {
                    lockId,
                    holder: this.workerId
                },
                {
                    $set: { expiresAt },
                    $inc: { 'metadata.renewCount': 1 }
                },
                { new: true }
            );

            if (result) {
                const lockInfo = this.activeLocks.get(lockId);
                if (lockInfo) {
                    lockInfo.expiresAt = expiresAt;
                }
                return true;
            }

            return false;
        } catch (error) {
            console.error(`Error renewing lock ${lockId}:`, error);
            return false;
        }
    }

    async acquireWithRenewal(lockId, ttl = null, renewInterval = null) {
        const lockTTL = ttl || this.defaultTTL;
        const interval = renewInterval || Math.floor(lockTTL / 2);

        const acquired = await this.acquire(lockId, lockTTL);
        if (!acquired) return false;

        // Start renewal interval
        const renewIntervalId = setInterval(async () => {
            const renewed = await this.renew(lockId, lockTTL);
            if (!renewed) {
                // Lock was lost, stop renewal
                clearInterval(renewIntervalId);
                this.activeLocks.delete(lockId);
            }
        }, interval);

        // Update local tracking
        const lockInfo = this.activeLocks.get(lockId);
        if (lockInfo) {
            lockInfo.renewInterval = renewIntervalId;
        }

        return true;
    }

    async isHeldByMe(lockId) {
        const lock = await Lock.findOne({ lockId, holder: this.workerId });
        return lock !== null && lock.expiresAt > new Date();
    }

    async releaseAll() {
        const lockIds = Array.from(this.activeLocks.keys());

        for (const lockId of lockIds) {
            await this.release(lockId);
        }

        console.log(`Released ${lockIds.length} locks held by ${this.workerId}`);
    }

    async withLock(lockId, fn, ttl = null) {
        const acquired = await this.acquire(lockId, ttl);

        if (!acquired) {
            return { success: false, result: null, error: new Error('Could not acquire lock') };
        }

        try {
            const result = await fn();
            return { success: true, result, error: null };
        } catch (error) {
            return { success: false, result: null, error };
        } finally {
            await this.release(lockId);
        }
    }
}

module.exports = { LockManager, Lock };
