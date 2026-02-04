const mongoose = require('mongoose');
const Counter = require('./Counter');

const jobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      unique: true,
      index: true
    },

    jobName: {
      type: String,
      required: [true, 'Job name is required'],
      trim: true,
      maxlength: [200, 'Job name cannot exceed 200 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    jobType: {
      type: String,
      required: true,
      enum: {
        values: ['ONE_TIME', 'RECURRING'],
        message: 'Job type must be either ONE_TIME or RECURRING'
      },
      index: true
    },

    scheduleTime: {
      type: Date,
      required: function () {
        return this.jobType === 'ONE_TIME';
      },
      index: true
    },
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

    interval: {
      type: Number,
      min: [1000, 'Interval must be at least 1 second (1000ms)']
    },

    nextRunAt: {
      type: Date,
      index: true
    },

    lastRunAt: {
      type: Date
    },

    timezone: {
      type: String,
      default: 'UTC'
    },

    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'SCHEDULED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED', 'WAITING', 'BLOCKED'],
      default: 'PENDING',
      index: true
    },

    dependsOnJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      default: null,
      index: true
    },

    pausedAt: {
      type: Date
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    taskType: {
      type: String,
      required: [true, 'Task type is required'],
      index: true
    },
    priority: {
      type: Number,
      default: 5,
      min: 1,
      max: 10,
      index: true
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 10
    },

    retryDelay: {
      type: Number,
      default: 60000, // 1 minute
      min: 1000
    },

    useExponentialBackoff: {
      type: Boolean,
      default: true
    },
    nextRetryAt: {
      type: Date
    },

    lastError: {
      type: String
    },

    lastErrorStack: {
      type: String
    },

    lockedBy: {
      type: String,
      default: null
    },

    lockedAt: {
      type: Date,
      default: null
    },

    lockTimeout: {
      type: Number,
      default: 300000 // 5 minutes
    },
    result: {
      type: mongoose.Schema.Types.Mixed
    },

    executionDuration: {
      type: Number
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    tags: [{
      type: String,
      trim: true
    }],

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

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

jobSchema.index({ status: 1, nextRunAt: 1, isActive: 1 });


jobSchema.index({ status: 1, nextRetryAt: 1, retryCount: 1 });
jobSchema.index({ lockedBy: 1, lockedAt: 1 });
jobSchema.index({ tags: 1 });
jobSchema.index({ jobName: 'text', description: 'text' });
jobSchema.index({ isActive: 1, status: 1, updatedAt: -1 });
jobSchema.virtual('canRetry').get(function () {
  return this.retryCount < this.maxRetries;
});
jobSchema.virtual('nextRetryDelay').get(function () {
  if (!this.useExponentialBackoff) {
    return this.retryDelay;
  }
  return this.retryDelay * Math.pow(2, this.retryCount);
});
jobSchema.virtual('isLockExpired').get(function () {
  if (!this.lockedAt) return true;
  return Date.now() - this.lockedAt.getTime() > this.lockTimeout;
});
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
jobSchema.methods.releaseLock = async function (workerId) {
  if (this.lockedBy === workerId) {
    this.lockedBy = null;
    this.lockedAt = null;
    await this.save();
  }
};
jobSchema.methods.markAsRunning = async function (workerId) {
  this.status = 'RUNNING';
  this.lockedBy = workerId;
  this.lockedAt = new Date();
  await this.save();
};
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
jobSchema.methods.pause = async function () {
  this.status = 'PAUSED';
  this.pausedAt = new Date();
  await this.save();
};
jobSchema.methods.resume = async function () {
  this.status = 'SCHEDULED';
  this.pausedAt = null;
  await this.save();
};
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
