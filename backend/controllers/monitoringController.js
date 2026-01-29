/**
 * Monitoring Controller
 * 
 * Provides system health and statistics endpoints.
 * Used for monitoring dashboards and alerting systems.
 */

const mongoose = require('mongoose');
const Job = require('../models/Job');
const JobExecutionLog = require('../models/JobExecutionLog');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../middleware/asyncHandler');
const os = require('os');

// Track when the API server started
const serverStartTime = new Date();

/**
 * GET /system/health
 * 
 * Check system health status.
 * Returns status of all critical components.
 */
const getSystemHealth = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - serverStartTime.getTime(),
        components: {}
    };

    // Check MongoDB connection
    try {
        const dbState = mongoose.connection.readyState;
        const dbStateMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        health.components.database = {
            status: dbState === 1 ? 'healthy' : 'unhealthy',
            state: dbStateMap[dbState],
            latency: null
        };

        // Test database latency
        if (dbState === 1) {
            const dbStart = Date.now();
            await mongoose.connection.db.admin().ping();
            health.components.database.latency = Date.now() - dbStart;
        }
    } catch (error) {
        health.components.database = {
            status: 'unhealthy',
            error: error.message
        };
        health.status = 'unhealthy';
    }

    // Check scheduler (count recent executions)
    try {
        const recentExecs = await JobExecutionLog.countDocuments({
            executionStartTime: { $gte: new Date(Date.now() - 300000) } // Last 5 min
        });

        const scheduledJobs = await Job.countDocuments({ status: 'SCHEDULED', isActive: true });

        health.components.scheduler = {
            status: 'healthy',
            recentExecutions: recentExecs,
            pendingJobs: scheduledJobs
        };
    } catch (error) {
        health.components.scheduler = {
            status: 'unknown',
            error: error.message
        };
    }

    // System resources
    health.components.system = {
        status: 'healthy',
        memory: {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem(),
            usagePercent: (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2) + '%'
        },
        cpu: {
            cores: os.cpus().length,
            loadAverage: os.loadavg()
        },
        hostname: os.hostname(),
        platform: os.platform(),
        nodeVersion: process.version
    };

    // Process info
    const memUsage = process.memoryUsage();
    health.components.process = {
        status: 'healthy',
        pid: process.pid,
        memory: {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss
        },
        uptime: process.uptime()
    };

    // Calculate overall response time
    health.responseTime = Date.now() - startTime;

    // Determine overall status
    const unhealthyComponents = Object.values(health.components)
        .filter(c => c.status === 'unhealthy');

    if (unhealthyComponents.length > 0) {
        health.status = 'unhealthy';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
});

/**
 * GET /system/stats
 * 
 * Get job statistics.
 * Returns counts of jobs by status and execution metrics.
 */
const getSystemStats = asyncHandler(async (req, res) => {
    const { period = '24h' } = req.query;

    // Calculate time range
    const periodMap = {
        '1h': 3600000,
        '6h': 21600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000
    };
    const periodMs = periodMap[period] || periodMap['24h'];
    const fromTime = new Date(Date.now() - periodMs);

    // Execute queries sequentially for stability until aggregation syntax is verified
    // 1. Job counts by status
    const jobCounts = await Job.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // 2. Completed jobs
    const completedInPeriod = await Job.countDocuments({
        isActive: true,
        status: 'COMPLETED',
        updatedAt: { $gte: fromTime }
    });

    // 3. Failed jobs
    const failedInPeriod = await Job.countDocuments({
        isActive: true,
        status: 'FAILED',
        updatedAt: { $gte: fromTime }
    });

    // 4. Job counts by type
    const typeCounts = await Job.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$jobType', count: { $sum: 1 } } }
    ]);

    // 5. Execution stats (Wrap in try-catch as this complex aggregation might be key failure)
    let execStats = [];
    try {
        execStats = await JobExecutionLog.aggregate([
            { $match: { executionStartTime: { $gte: fromTime } } },
            {
                $group: {
                    _id: null,
                    totalExecutions: { $sum: 1 },
                    successCount: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } },
                    failedCount: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
                    timeoutCount: { $sum: { $cond: [{ $eq: ['$status', 'TIMEOUT'] }, 1, 0] } },
                    retryCount: { $sum: { $cond: ['$isRetry', 1, 0] } },
                    avgDuration: { $avg: '$duration' },
                    maxDuration: { $max: '$duration' },
                    minDuration: { $min: '$duration' },
                    totalDuration: { $sum: '$duration' }
                }
            }
        ]);
    } catch (err) {
        console.error('Error in execStats aggregation:', err);
    }

    // 6. Execution by task type
    let execByType = [];
    try {
        execByType = await JobExecutionLog.aggregate([
            { $match: { executionStartTime: { $gte: fromTime } } },
            {
                $group: {
                    _id: '$taskType',
                    count: { $sum: 1 },
                    successCount: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } },
                    avgDuration: { $avg: '$duration' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
    } catch (err) {
        console.error('Error in execByType aggregation:', err);
    }

    // 7. Hourly trend
    let hourlyTrend = [];
    try {
        hourlyTrend = await JobExecutionLog.aggregate([
            { $match: { executionStartTime: { $gte: fromTime } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$executionStartTime' } },
                    total: { $sum: 1 },
                    success: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } },
                    failed: { $sum: { $cond: [{ $in: ['$status', ['FAILED', 'TIMEOUT']] }, 1, 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);
    } catch (err) {
        console.error('Error in hourlyTrend aggregation:', err);
    }

    return ApiResponse.success(res, 200, 'System statistics retrieved successfully', {
        period,
        periodStart: fromTime.toISOString(),
        timestamp: new Date().toISOString(),

        jobs: {
            total: totalJobs,
            byStatus: statusCounts,
            byType: typeCounts.reduce((acc, { _id, count }) => {
                acc[_id] = count;
                return acc;
            }, {}),
            active: statusCounts.SCHEDULED + statusCounts.QUEUED + statusCounts.RUNNING,
            pending: statusCounts.PENDING + statusCounts.SCHEDULED,
            completed: completedInPeriod,
            failed: failedInPeriod
        },

        executions: {
            total: execData.totalExecutions,
            success: execData.successCount,
            failed: execData.failedCount,
            timeout: execData.timeoutCount,
            retries: execData.retryCount,
            successRate: execData.totalExecutions > 0
                ? ((execData.successCount / execData.totalExecutions) * 100).toFixed(2) + '%'
                : '0%',
            avgDuration: Math.round(execData.avgDuration || 0),
            maxDuration: execData.maxDuration || 0,
            minDuration: execData.minDuration || 0,
            totalDuration: execData.totalDuration || 0
        },

        executionsByTaskType: execByType.map(t => ({
            taskType: t._id,
            count: t.count,
            successCount: t.successCount,
            successRate: ((t.successCount / t.count) * 100).toFixed(2) + '%',
            avgDuration: Math.round(t.avgDuration)
        })),

        hourlyTrend
    });
});

/**
 * GET /system/stats/live
 * 
 * Get real-time statistics.
 * Lighter endpoint for frequent polling.
 */
const getLiveStats = asyncHandler(async (req, res) => {
    const now = new Date();
    const fiveMinAgo = new Date(now - 300000);

    // Quick counts
    const [running, scheduled, recentExecs, recentFails] = await Promise.all([
        Job.countDocuments({ status: 'RUNNING', isActive: true }),
        Job.countDocuments({ status: 'SCHEDULED', isActive: true }),
        JobExecutionLog.countDocuments({
            executionStartTime: { $gte: fiveMinAgo }
        }),
        JobExecutionLog.countDocuments({
            executionStartTime: { $gte: fiveMinAgo },
            status: { $in: ['FAILED', 'TIMEOUT'] }
        })
    ]);

    res.status(200).json({
        timestamp: now.toISOString(),
        running,
        scheduled,
        executions: {
            last5min: recentExecs,
            failedLast5min: recentFails
        }
    });
});

/**
 * GET /system/workers
 * 
 * Get information about active workers.
 */
const getWorkerStats = asyncHandler(async (req, res) => {
    // Find unique workers from recent executions
    const workers = await JobExecutionLog.aggregate([
        {
            $match: {
                executionStartTime: { $gte: new Date(Date.now() - 3600000) } // Last hour
            }
        },
        {
            $group: {
                _id: '$workerId',
                workerHost: { $first: '$workerHost' },
                executionCount: { $sum: 1 },
                successCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
                },
                lastSeen: { $max: '$executionStartTime' },
                avgDuration: { $avg: '$duration' }
            }
        },
        { $sort: { lastSeen: -1 } }
    ]);

    // Find currently locked jobs (indicates active workers)
    const lockedJobs = await Job.aggregate([
        {
            $match: {
                lockedBy: { $ne: null },
                status: { $in: ['QUEUED', 'RUNNING'] }
            }
        },
        {
            $group: {
                _id: '$lockedBy',
                activeJobs: { $sum: 1 },
                jobs: { $push: '$jobId' }
            }
        }
    ]);

    // Merge data
    const workerMap = new Map();

    workers.forEach(w => {
        workerMap.set(w._id, {
            workerId: w._id,
            host: w.workerHost,
            executions: w.executionCount,
            successRate: ((w.successCount / w.executionCount) * 100).toFixed(2) + '%',
            avgDuration: Math.round(w.avgDuration),
            lastSeen: w.lastSeen,
            activeJobs: 0
        });
    });

    lockedJobs.forEach(l => {
        if (workerMap.has(l._id)) {
            workerMap.get(l._id).activeJobs = l.activeJobs;
        } else {
            workerMap.set(l._id, {
                workerId: l._id,
                activeJobs: l.activeJobs,
                executions: 0,
                lastSeen: new Date()
            });
        }
    });

    return ApiResponse.success(res, 200, 'Worker statistics retrieved successfully', {
        workers: Array.from(workerMap.values()),
        totalWorkers: workerMap.size,
        activeWorkers: lockedJobs.length
    });
});

module.exports = {
    getSystemHealth,
    getSystemStats,
    getLiveStats,
    getWorkerStats
};
