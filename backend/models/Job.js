const mongoose = require('mongoose');
const Counter = require('./Counter');

/**
 * Job Schema
 * 
 * This model represents a scheduled job in the system.
 * It supports both one-time and recurring jobs with comprehensive
 * tracking of execution state and retry logic.
 */
const jobSchema = new mongoose.Schema(
  {
    // ═══════════════════════════════════════════════════════════════
    // IDENTIFICATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Unique identifier for the job
     * Why: Provides a human-readable ID separate from MongoDB's _id
     * Used for: API responses, logging, external references
     */
    jobId: {
      type: String,
      unique: true,
      index: true
    },

    /**
     * Human-readable name for the job
     * Why: Makes it easy to identify jobs in dashboards and logs
     * Example: "Daily User Report", "Welcome Email"
     */
    jobName: {
      type: String,
      required: [true, 'Job name is required'],
      trim: true,
      maxlength: [200, 'Job name cannot exceed 200 characters']
    },

    /**
     * Description of what this job does
     * Why: Documentation for developers and operators
     */
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },

    // ═══════════════════════════════════════════════════════════════
    // JOB TYPE & SCHEDULING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Type of job: one-time or recurring
     * Why: Determines how scheduling logic handles the job
     * - ONE_TIME: Executes once at scheduleTime, then marked complete
     * - RECURRING: Executes repeatedly based on cronExpression/interval
     */
    jobType: {
      type: String,
      required: true,
      enum: {
        values: ['ONE_TIME', 'RECURRING'],
        message: 'Job type must be either ONE_TIME or RECURRING'
      },
      index: true
    },

    /**
     * Scheduled execution time (for ONE_TIME jobs)
     * Why: Specifies exactly when a one-time job should run
     * The scheduler queries jobs where scheduleTime <= now
     */
    scheduleTime: {
      type: Date,
      required: function () {
        return this.jobType === 'ONE_TIME';
      },
      index: true
    },

    /**
     * Cron expression (for RECURRING jobs)
     * Why: Standard format for defining recurring schedules
     * Examples: 
     *   "0 9 * * *" = Every day at 9 AM
     *   "0 0 * * 0" = Every Sunday at midnight
     *   "0/15 * * * *" = Every 15 minutes
     */
    cronExpression: {

      type: String,
      validate: {
        validator: function (v) {
          if (this.jobType !== 'RECURRING') return true;
          // Basic cron validation (5 or 6 fields)
          const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
          return !v || cronRegex.test(v) || v.split(' ').length >= 5;
        },
        message: 'Invalid cron expression format'
      }
    },

    /**
     * Interval in milliseconds (alternative to cron for RECURRING jobs)
     * Why: Simpler way to define "run every X minutes/hours"
     * Example: 3600000 = 1 hour
     */
    interval: {
      type: Number,
      min: [1000, 'Interval must be at least 1 second (1000ms)']
    },

    /**
     * Next scheduled run time
     * Why: Pre-calculated field for efficient querying
     * The scheduler queries: nextRunAt <= now AND status = 'SCHEDULED'
     * Updated after each execution for recurring jobs
     */
    nextRunAt: {
      type: Date,
      index: true
    },

    /**
     * Last execution time
     * Why: Track when the job was last run
     * Useful for debugging and monitoring
     */
    lastRunAt: {
      type: Date
    },

    /**
     * Timezone for scheduling
     * Why: Ensures jobs run at correct local time
     * Example: "Asia/Kolkata", "America/New_York"
     */
    timezone: {
      type: String,
      default: 'UTC'
    },

    // ═══════════════════════════════════════════════════════════════
    // JOB STATUS & EXECUTION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Current status of the job
     * Why: Track job through its lifecycle for proper state management
     * 
     * PENDING    → Job created but not yet ready to run
     * SCHEDULED  → Job is waiting for its scheduled time
     * QUEUED     → Job has been picked up by scheduler, in queue
     * RUNNING    → Worker is currently executing the job
     * COMPLETED  → Job finished successfully
     * FAILED     → Job failed (may be retried)
     * PAUSED     → Job temporarily disabled
     * CANCELLED  → Job manually cancelled
     */
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'SCHEDULED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED', 'WAITING', 'BLOCKED'],
      default: 'PENDING',
      index: true
    },

    /**
     * ID of the job this job depends on
     * Why: Sequential execution (Job B runs after Job A)
     */
    dependsOnJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      default: null,
      index: true
    },

    /**
     * Timestamp when the job was paused
     * Why: Audit trail and duration calculation
     */
    pausedAt: {
      type: Date
    },

    /**
     * Job payload/data to be processed
     * Why: Contains the actual data needed for job execution
     * Example: { userId: "123", emailType: "welcome" }
     */
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    /**
     * Job handler/task type identifier
     * Why: Tells workers which function/handler to execute
     * Example: "sendEmail", "generateReport", "cleanupData"
     */
    taskType: {
      type: String,
      required: [true, 'Task type is required'],
      index: true
    },

    /**
     * Priority level (1 = highest, 10 = lowest)
     * Why: Allows important jobs to be processed first
     * Workers can pick higher priority jobs before lower ones
     */
    priority: {
      type: Number,
      default: 5,
      min: 1,
      max: 10,
      index: true
    },

    // ═══════════════════════════════════════════════════════════════
    // RETRY CONFIGURATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Current retry count
     * Why: Track how many times we've attempted this job
     * Incremented on each failure
     */
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * Maximum retry attempts allowed
     * Why: Prevent infinite retry loops
     * Job marked as FAILED permanently when retryCount >= maxRetries
     */
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 10
    },

    /**
     * Delay between retries in milliseconds
     * Why: Give external services time to recover
     * Can implement exponential backoff by calculating: retryDelay * (2 ^ retryCount)
     */
    retryDelay: {
      type: Number,
      default: 60000, // 1 minute
      min: 1000
    },

    /**
     * Whether to use exponential backoff for retries
     * Why: Exponential backoff is more efficient for transient failures
     */
    useExponentialBackoff: {
      type: Boolean,
      default: true
    },

    /**
     * Timestamp for next retry
     * Why: Schedule when the retry should happen
     */
    nextRetryAt: {
      type: Date
    },

    // ═══════════════════════════════════════════════════════════════
    // ERROR TRACKING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Last error message
     * Why: Quick access to why the job failed
     * Detailed logs are in JobExecutionLog
     */
    lastError: {
      type: String
    },

    /**
     * Stack trace of last error
     * Why: Debugging information for developers
     */
    lastErrorStack: {
      type: String
    },

    // ═══════════════════════════════════════════════════════════════
    // LOCKING & CONCURRENCY
    // ═══════════════════════════════════════════════════════════════

    /**
     * ID of the worker/scheduler that locked this job
     * Why: Prevents duplicate execution by multiple workers
     * Only the worker with matching lockedBy can process the job
     */
    lockedBy: {
      type: String,
      default: null
    },

    /**
     * Timestamp when the job was locked
     * Why: Detect stale locks (worker crashed without releasing)
     * If lockedAt is too old, consider the lock expired
     */
    lockedAt: {
      type: Date,
      default: null
    },

    /**
     * Lock expiry time in milliseconds
     * Why: Auto-release locks for crashed workers
     * If (now - lockedAt) > lockTimeout, lock is considered expired
     */
    lockTimeout: {
      type: Number,
      default: 300000 // 5 minutes
    },

    // ═══════════════════════════════════════════════════════════════
    // JOB RESULT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Result data from the last execution
     * Why: Store output from job for reference
     * Example: { emailsSent: 150, failedCount: 2 }
     */
    result: {
      type: mongoose.Schema.Types.Mixed
    },

    /**
     * Time taken for last execution in milliseconds
     * Why: Performance monitoring and optimization
     */
    executionDuration: {
      type: Number
    },

    // ═══════════════════════════════════════════════════════════════
    // METADATA
    // ═══════════════════════════════════════════════════════════════

    /**
     * User/system that created this job
     * Why: Audit trail and access control
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    /**
     * Tags for categorization
     * Why: Filter and search jobs by category
     * Example: ["email", "marketing", "daily"]
     */
    tags: [{
      type: String,
      trim: true
    }],

    /**
     * Whether the job is active
     * Why: Soft delete - keeps history without actually deleting
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    /**
     * Expiration time for auto-deletion
     * Why: Cleanup old completed/cancelled jobs
     */
    expireAt: {
      type: Date,
      index: { expireAfterSeconds: 0 } // MongoDB TTL Index
    }
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ═══════════════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compound index for scheduler queries
 * Why: The scheduler frequently queries for due jobs that are ready to run
 * Query pattern: status = 'SCHEDULED' AND nextRunAt <= now AND isActive = true
 */
jobSchema.index({ status: 1, nextRunAt: 1, isActive: 1 });

/**
 * Compound index for retry queries
 * Why: Find failed jobs that need to be retried
 * Query pattern: status = 'FAILED' AND nextRetryAt <= now AND retryCount < maxRetries
 */
jobSchema.index({ status: 1, nextRetryAt: 1, retryCount: 1 });

/**
 * Index for finding locked jobs (stale lock detection)
 * Why: Release locks from crashed workers
 */
jobSchema.index({ lockedBy: 1, lockedAt: 1 });

/**
 * Index for searching by tags
 * Why: Efficiently find jobs by category
 */
jobSchema.index({ tags: 1 });

/**
 * Text index for searching job names and descriptions
 * Why: Enable full-text search on jobs
 */
jobSchema.index({ jobName: 'text', description: 'text' });

/**
 * Compound index for history/analytics queries
 * Why: Efficiently count jobs by status within a time range (e.g. Dashboard stats)
 */
jobSchema.index({ isActive: 1, status: 1, updatedAt: -1 });

// ═══════════════════════════════════════════════════════════════════════
// VIRTUALS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if the job can be retried
 */
jobSchema.virtual('canRetry').get(function () {
  return this.retryCount < this.maxRetries;
});

/**
 * Calculate the next retry delay (with exponential backoff)
 */
jobSchema.virtual('nextRetryDelay').get(function () {
  if (!this.useExponentialBackoff) {
    return this.retryDelay;
  }
  return this.retryDelay * Math.pow(2, this.retryCount);
});

/**
 * Check if the lock has expired
 */
jobSchema.virtual('isLockExpired').get(function () {
  if (!this.lockedAt) return true;
  return Date.now() - this.lockedAt.getTime() > this.lockTimeout;
});

// ═══════════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Acquire a lock on this job
 * @param {string} workerId - ID of the worker acquiring the lock
 * @returns {boolean} - Whether the lock was acquired
 */
jobSchema.methods.acquireLock = async function (workerId) {
  const result = await this.constructor.findOneAndUpdate(
    {
      _id: this._id,
      $or: [
        { lockedBy: null },
        { lockedAt: { $lt: new Date(Date.now() - this.lockTimeout) } }
      ]
    },
    {
      lockedBy: workerId,
      lockedAt: new Date()
    },
    { new: true }
  );
  return result !== null;
};

/**
 * Release the lock on this job
 * @param {string} workerId - ID of the worker releasing the lock
 */
jobSchema.methods.releaseLock = async function (workerId) {
  if (this.lockedBy === workerId) {
    this.lockedBy = null;
    this.lockedAt = null;
    await this.save();
  }
};

/**
 * Mark the job as started
 */
jobSchema.methods.markAsRunning = async function (workerId) {
  this.status = 'RUNNING';
  this.lockedBy = workerId;
  this.lockedAt = new Date();
  await this.save();
};

/**
 * Mark the job as completed
 * @param {Object} result - Result data from execution
 * @param {number} duration - Execution time in milliseconds
 */
jobSchema.methods.markAsCompleted = async function (result, duration) {
  this.status = 'COMPLETED';
  this.result = result;
  this.executionDuration = duration;
  this.lastRunAt = new Date();
  this.lockedBy = null;
  this.lockedAt = null;
  this.lastError = null;
  this.lastErrorStack = null;
  // Auto-delete after 5 days
  this.expireAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  await this.save();

  // Release dependent jobs
  await mongoose.model('Job').updateMany(
    { dependsOnJobId: this._id, status: 'WAITING' },
    {
      $set: {
        status: 'SCHEDULED',
        nextRunAt: new Date()  // Run immediately
      }
    }
  );
};

/**
 * Mark the job as failed and schedule retry if possible
 * @param {Error} error - The error that occurred
 */
jobSchema.methods.markAsFailed = async function (error) {
  this.retryCount += 1;
  this.lastError = error.message;
  this.lastErrorStack = error.stack;
  this.lastRunAt = new Date();
  this.lockedBy = null;
  this.lockedAt = null;

  if (this.canRetry) {
    this.status = 'SCHEDULED';
    this.nextRetryAt = new Date(Date.now() + this.nextRetryDelay);
    this.nextRunAt = this.nextRetryAt;
  } else {
    this.status = 'FAILED';
  }

  await this.save();

  // Block dependent jobs if this job failed permanently
  if (this.status === 'FAILED') {
    await mongoose.model('Job').updateMany(
      { dependsOnJobId: this._id, status: 'WAITING' },
      { $set: { status: 'BLOCKED' } }
    );
  }
};

/**
 * Pause the job
 */
jobSchema.methods.pause = async function () {
  this.status = 'PAUSED';
  this.pausedAt = new Date();
  await this.save();
};

/**
 * Resume a paused job
 */
jobSchema.methods.resume = async function () {
  this.status = 'SCHEDULED';
  this.pausedAt = null;
  await this.save();
};

// ═══════════════════════════════════════════════════════════════════════
// STATIC METHODS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find all jobs due for execution
 * @returns {Array} - Jobs that should be executed
 */
jobSchema.statics.findDueJobs = function (limit = 100) {
  return this.find({
    status: 'SCHEDULED',
    nextRunAt: { $lte: new Date() },
    isActive: true,
    $or: [
      { lockedBy: null },
      { lockedAt: { $lt: new Date(Date.now() - 300000) } } // Lock expired (5 min)
    ]
  })
    .sort({ priority: 1, nextRunAt: 1 })
    .limit(limit);
};

/**
 * Find all jobs that need retry
 * @returns {Array} - Failed jobs eligible for retry
 */
jobSchema.statics.findRetryableJobs = function (limit = 50) {
  return this.find({
    status: 'SCHEDULED',
    nextRetryAt: { $lte: new Date() },
    isActive: true,
    $expr: { $lt: ['$retryCount', '$maxRetries'] }
  })
    .sort({ priority: 1, nextRetryAt: 1 })
    .limit(limit);
};

/**
 * Release all stale locks
 * @param {number} lockTimeout - Lock timeout in milliseconds
 * @returns {Object} - Update result
 */
jobSchema.statics.releaseStaleLocks = function (lockTimeout = 300000) {
  return this.updateMany(
    {
      lockedBy: { $ne: null },
      lockedAt: { $lt: new Date(Date.now() - lockTimeout) }
    },
    {
      $set: { lockedBy: null, lockedAt: null }
    }
  );
};

// ═══════════════════════════════════════════════════════════════════════
// PRE-SAVE MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════

jobSchema.pre('save', async function (next) {
  // Generate sequential jobId for new documents
  if (this.isNew && !this.jobId) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        { _id: 'jobId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.jobId = counter.seq.toString();
    } catch (error) {
      return next(error);
    }
  }

  // Set initial nextRunAt based on job type
  if (this.isNew && !this.nextRunAt) {
    if (this.jobType === 'ONE_TIME' && this.scheduleTime) {
      this.nextRunAt = this.scheduleTime;
      this.status = 'SCHEDULED';
    } else if (this.jobType === 'RECURRING') {
      // For recurring jobs, calculate first run from cron/interval
      // This would typically use a library like 'cron-parser'
      this.status = 'SCHEDULED';
      if (!this.nextRunAt) {
        this.nextRunAt = new Date(); // Run immediately if not set
      }
    }
  }
  next();
});

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;
