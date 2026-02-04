require('dotenv').config();

const mongoose = require('mongoose');
const Job = require('../models/Job');
const JobExecutionLog = require('../models/JobExecutionLog');
const WorkerServiceWithRetry = require('../services/WorkerServiceWithRetry');
const { RETRY_STRATEGY } = require('../services/RetryManager');

// Configuration
const config = {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chronos_scheduler'
};

// Custom handlers for testing
const testHandlers = {
    // Always fails - for testing retry exhaustion
    alwaysFail: async (payload, job) => {
        console.log(`\n  💥 [alwaysFail] This job always fails`);
        await new Promise(r => setTimeout(r, 200));
        throw new Error('Intentional failure for testing');
    },

    // Fails N times then succeeds
    failNTimes: async (payload, job) => {
        const failCount = payload.failCount || 2;
        const attempt = (job.retryCount || 0) + 1;

        console.log(`\n  🎯 [failNTimes] Attempt ${attempt}/${failCount + 1}`);
        await new Promise(r => setTimeout(r, 200));

        if (attempt <= failCount) {
            throw new Error(`Failure ${attempt}/${failCount} (will succeed on attempt ${failCount + 1})`);
        }

        console.log(`  ✓ Success on attempt ${attempt}!`);
        return { successOnAttempt: attempt };
    },

    // Random failure rate
    randomFail: async (payload, job) => {
        const failRate = payload.failRate || 0.7;
        console.log(`\n  🎲 [randomFail] Failure rate: ${failRate * 100}%`);
        await new Promise(r => setTimeout(r, 200));

        if (Math.random() < failRate) {
            throw new Error(`Random failure (${failRate * 100}% chance)`);
        }

        return { succeeded: true };
    },

    // Succeeds immediately
    alwaysSucceed: async (payload, job) => {
        console.log(`\n  ✓ [alwaysSucceed] This job always succeeds`);
        await new Promise(r => setTimeout(r, 100));
        return { success: true };
    }
};

// Create worker with retry configuration
const worker = new WorkerServiceWithRetry({
    pollInterval: 1000, // Poll every 1 second for demo
    concurrency: 1, // Process one at a time for clarity
    handlers: testHandlers,

    // Retry configuration
    maxRetries: 3,
    baseRetryDelay: 3000, // 3 second base (short for demo)
    maxRetryDelay: 60000,
    retryStrategy: RETRY_STRATEGY.EXPONENTIAL
});

// Event handlers for visualization
worker.on('started', () => {
    console.log('\n🚀 Worker started with retry support\n');
});

worker.on('job:retry', ({ jobId, error, attempt, nextRetryAt, remainingRetries }) => {
    const delay = Math.round((nextRetryAt - new Date()) / 1000);
    console.log(`\n  ♻️  Retry scheduled: ${jobId}`);
    console.log(`     Attempt ${attempt} failed: ${error}`);
    console.log(`     Next retry in: ${delay}s`);
    console.log(`     Remaining retries: ${remainingRetries}`);
});

worker.on('job:failed', ({ jobId, error, attempt, reason }) => {
    console.log(`\n  ❌ PERMANENT FAILURE: ${jobId}`);
    console.log(`     After ${attempt} attempts`);
    console.log(`     Reason: ${reason}`);
    console.log(`     Last error: ${error}`);
});

async function createTestJobs() {
    console.log('📝 Creating test jobs...\n');

    // Clear previous test jobs
    await Job.deleteMany({ jobName: /^\[RETRY-TEST\]/ });

    const jobs = [
        {
            jobName: '[RETRY-TEST] Fail 2 times then succeed',
            taskType: 'failNTimes',
            jobType: 'ONE_TIME',
            scheduleTime: new Date(),
            nextRunAt: new Date(),
            status: 'SCHEDULED',
            payload: { failCount: 2 },
            maxRetries: 5,
            priority: 1
        },
        {
            jobName: '[RETRY-TEST] Always fail (exhaust retries)',
            taskType: 'alwaysFail',
            jobType: 'ONE_TIME',
            scheduleTime: new Date(Date.now() + 2000), // Start 2s later
            nextRunAt: new Date(Date.now() + 2000),
            status: 'SCHEDULED',
            payload: {},
            maxRetries: 2, // Only 2 retries
            priority: 2
        },
        {
            jobName: '[RETRY-TEST] Always succeed',
            taskType: 'alwaysSucceed',
            jobType: 'ONE_TIME',
            scheduleTime: new Date(Date.now() + 4000),
            nextRunAt: new Date(Date.now() + 4000),
            status: 'SCHEDULED',
            payload: {},
            maxRetries: 3,
            priority: 3
        }
    ];

    for (const jobData of jobs) {
        const job = await Job.create(jobData);
        console.log(`  ✓ ${job.jobName}`);
        console.log(`    MaxRetries: ${job.maxRetries}, TaskType: ${job.taskType}`);
    }

    console.log(`\n  Total: ${jobs.length} test jobs created\n`);
}

async function displayRetryLogs() {
    console.log('\n📋 Execution Log (showing retry attempts):\n');

    const logs = await JobExecutionLog.find({ jobName: /^\[RETRY-TEST\]/ })
        .sort({ executionStartTime: 1 })
        .lean();

    if (logs.length === 0) {
        console.log('  No logs found.\n');
        return;
    }

    let currentJob = '';

    for (const log of logs) {
        if (log.jobName !== currentJob) {
            currentJob = log.jobName;
            console.log(`\n  📌 ${currentJob}`);
            console.log('  ' + '─'.repeat(60));
        }

        const status = log.status === 'SUCCESS' ? '✓' : '✗';
        const attempt = log.isRetry ? `Retry #${log.retryAttempt}` : 'Initial';
        const duration = log.duration ? `${log.duration}ms` : 'N/A';
        const willRetry = log.metadata?.willRetry ? '→ Scheduled for retry' : '';

        console.log(`    ${status} ${attempt.padEnd(12)} | ${log.status.padEnd(7)} | ${duration.padEnd(8)} ${willRetry}`);

        if (log.errorMessage) {
            console.log(`      Error: ${log.errorMessage.substring(0, 50)}`);
        }
    }

    console.log('\n');
}

async function displayJobFinalStatus() {
    console.log('\n📊 Final Job Status:\n');

    const jobs = await Job.find({ jobName: /^\[RETRY-TEST\]/ })
        .sort({ priority: 1 })
        .lean();

    for (const job of jobs) {
        const status = job.status === 'COMPLETED' ? '✅' : '❌';
        console.log(`  ${status} ${job.jobName}`);
        console.log(`     Status: ${job.status}`);
        console.log(`     Retry count: ${job.retryCount || 0} / ${job.maxRetries}`);
        if (job.lastError) {
            console.log(`     Last error: ${job.lastError.substring(0, 40)}...`);
        }
        console.log('');
    }
}


async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                    RETRY MECHANISM DEMO                                ║
╠════════════════════════════════════════════════════════════════════════╣
║  This demo shows:                                                      ║
║  • Jobs that fail and get retried automatically                        ║
║  • Exponential backoff between retries                                 ║
║  • Separate logging for each retry attempt                             ║
║  • Jobs eventually succeeding or hitting max retries                   ║
╚════════════════════════════════════════════════════════════════════════╝
  `);

    try {
        // Connect
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(config.mongoUri);
        console.log('✓ Connected\n');

        // Create jobs
        await createTestJobs();

        // Start worker
        console.log('━'.repeat(76));
        await worker.start();

        // Wait for processing (including retries)
        console.log('\n⏳ Running for 30 seconds to allow retries...\n');
        await new Promise(r => setTimeout(r, 30000));

        // Stop
        console.log('\n' + '━'.repeat(76));
        await worker.stop();

        // Show results
        await displayRetryLogs();
        await displayJobFinalStatus();

        // Final stats
        const stats = worker.getStats();
        console.log('📈 Worker Statistics:');
        console.log(`   Jobs Processed: ${stats.jobsProcessed}`);
        console.log(`   Succeeded: ${stats.jobsSucceeded}`);
        console.log(`   Failed: ${stats.jobsFailed}`);
        console.log(`   Total Retries: ${stats.totalRetries}`);
        console.log(`   Retry Success Rate: ${stats.retrySuccessRate}`);

        console.log('\n✅ Demo completed!\n');

    } catch (error) {
        console.error('❌ Demo failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

main();
