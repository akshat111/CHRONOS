/**
 * Distributed Lock Manager
 * 
 * Provides distributed locking using MongoDB's atomic operations.
 * Prevents multiple scheduler/worker instances from processing the same job.
 * 
 * HOW IT WORKS:
 * 1. Uses MongoDB's findOneAndUpdate with atomic conditions
 * 2. Only one process can acquire a lock at a time
 * 3. Locks have TTL (time-to-live) for automatic expiration
 * 4. Stale locks are automatically released
 */

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
    /**
     * Create a new LockManager instance
     * @param {Object} options - Configuration options
     * @param {string} options.workerId - Unique identifier for this worker/process
     * @param {number} options.defaultTTL - Default lock TTL in milliseconds (default: 30 seconds)
     */
    constructor(options = {}) {
        this.workerId = options.workerId || `worker_${process.pid}_${Date.now()}`;
        this.defaultTTL = options.defaultTTL || 30000; // 30 seconds
        this.activeLocks = new Map(); // Track locks held by this instance
    }

    /**
     * Attempt to acquire a lock
     * 
     * Uses MongoDB's findOneAndUpdate with upsert for atomic lock acquisition.
     * The query conditions ensure only ONE process can succeed:
     * - Lock doesn't exist, OR
     * - Lock exists but is expired, OR
     * - Lock exists and is held by the same worker (renewal)
     * 
     * @param {string} lockId - Unique identifier for the lock
     * @param {number} ttl - Lock TTL in milliseconds (optional)
     * @returns {Promise<boolean>} - Whether the lock was acquired
     */
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

    /**
     * Release a lock
     * 
     * Only releases the lock if it's held by this worker.
     * 
     * @param {string} lockId - Lock to release
     * @returns {Promise<boolean>} - Whether the lock was released
     */
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

    /**
     * Renew/extend a lock's TTL
     * 
     * Used to keep a lock alive during long-running operations.
     * 
     * @param {string} lockId - Lock to renew
     * @param {number} ttl - New TTL in milliseconds
     * @returns {Promise<boolean>} - Whether the lock was renewed
     */
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

    /**
     * Acquire a lock with automatic renewal
     * 
     * Starts a background interval to periodically renew the lock.
     * Useful for long-running scheduled tasks.
     * 
     * @param {string} lockId - Lock to acquire
     * @param {number} ttl - Lock TTL in milliseconds
     * @param {number} renewInterval - How often to renew (default: TTL/2)
     * @returns {Promise<boolean>} - Whether the lock was acquired
     */
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

    /**
     * Check if a lock is currently held by this worker
     * 
     * @param {string} lockId - Lock to check
     * @returns {Promise<boolean>} - Whether we hold the lock
     */
    async isHeldByMe(lockId) {
        const lock = await Lock.findOne({ lockId, holder: this.workerId });
        return lock !== null && lock.expiresAt > new Date();
    }

    /**
     * Release all locks held by this worker
     * 
     * Call this during graceful shutdown.
     */
    async releaseAll() {
        const lockIds = Array.from(this.activeLocks.keys());

        for (const lockId of lockIds) {
            await this.release(lockId);
        }

        console.log(`Released ${lockIds.length} locks held by ${this.workerId}`);
    }

    /**
     * Execute a function while holding a lock
     * 
     * Acquires the lock, executes the function, then releases the lock.
     * Automatically handles errors and ensures lock is released.
     * 
     * @param {string} lockId - Lock to acquire
     * @param {Function} fn - Function to execute
     * @param {number} ttl - Lock TTL
     * @returns {Promise<Object>} - { success: boolean, result: any, error: Error }
     */
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
