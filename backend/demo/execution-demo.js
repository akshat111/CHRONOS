require('dotenv').config();

const mongoose = require('mongoose');
const Job = require('../models/Job');
const JobExecutionLog = require('../models/JobExecutionLog');
const WorkerService = require('../services/WorkerService');
const handlers = require('../handlers/taskHandlers');

// Configuration
const config = {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chronos_scheduler'
};

// Create worker
const worker = new WorkerService({
    pollInterval: 2000, // Check every 2 seconds for demo
    concurrency: 3,
    handlers
});


async function createSampleJobs() {
    console.log('\n📝 Creating sample jobs...\n');

    // Clear existing test jobs
    await Job.deleteMany({ jobName: /^\[DEMO\]/ });

    const jobs = [
        {
            jobName: '[DEMO] Send Welcome Email',
            taskType: 'sendEmail',
            jobType: 'ONE_TIME',
            scheduleTime: new Date(), // Run immediately
            nextRunAt: new Date(),
            status: 'SCHEDULED',
            payload: {
                recipientEmail: 'user@example.com',
                emailType: 'welcome',
                subject: 'Welcome to CHRONOS!'
            },
            priority: 1
        },
        {
            jobName: '[DEMO] Generate Report',
            taskType: 'generateReport',
            jobType: 'ONE_TIME',
            scheduleTime: new Date(),
            nextRunAt: new Date(),
            status: 'SCHEDULED',
            payload: {
                reportType: 'daily_summary',
                format: 'pdf'
            },
            priority: 2
        },
        {
            jobName: '[DEMO] Health Check',
            taskType: 'healthCheck',
            jobType: 'ONE_TIME',
            scheduleTime: new Date(),
            nextRunAt: new Date(),
            status: 'SCHEDULED',
            payload: {
                services: ['api', 'database', 'cache', 'queue']
            },
            priority: 3
        },
        {
            jobName: '[DEMO] Cleanup Task',
            taskType: 'cleanup',
            jobType: 'ONE_TIME',
            scheduleTime: new Date(),
            nextRunAt: new Date(),
            status: 'SCHEDULED',
            payload: {
                target: 'temp_files',
                ageHours: 24
            },
            priority: 4
        },
        {
            jobName: '[DEMO] Test Retry',
            taskType: 'randomOutcome',
            jobType: 'ONE_TIME',
            scheduleTime: new Date(),
            nextRunAt: new Date(),
            status: 'SCHEDULED',
            payload: {
                successRate: 0.5 // 50% chance of failure
            },
            priority: 5,
            maxRetries: 3
        }
    ];

    for (const jobData of jobs) {
        const job = await Job.create(jobData);
        console.log(`  ✓ Created: ${job.jobName} (${job.jobId})`);
    }

    console.log(`\n  Total: ${jobs.length} jobs created\n`);
    return jobs.length;
}

async function displayLogs() {
    console.log('\n📋 Recent Execution Logs:\n');

    const logs = await JobExecutionLog.find({})
        .sort({ executionStartTime: -1 })
        .limit(10)
        .lean();

    if (logs.length === 0) {
        console.log('  No execution logs found.\n');
        return;
    }

    console.log('  ┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('  │ Job ID                  │ Status  │ Duration │ Task Type      │ Time       │');
    console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');

    for (const log of logs) {
        const jobId = log.jobId.substring(0, 20).padEnd(22);
        const status = (log.status || '').padEnd(7);
        const duration = ((log.duration || 0) + 'ms').padEnd(9);
        const taskType = (log.taskType || '').substring(0, 13).padEnd(14);
        const time = new Date(log.executionStartTime).toLocaleTimeString();

        const statusIcon = log.status === 'SUCCESS' ? '✓' : '✗';
        console.log(`  │ ${statusIcon} ${jobId}│ ${status}│ ${duration}│ ${taskType}│ ${time} │`);
    }

    console.log('  └─────────────────────────────────────────────────────────────────────────────┘\n');
}

async function displayJobStatus() {
    console.log('\n📊 Job Status Summary:\n');

    const statuses = await Job.aggregate([
        { $match: { jobName: /^\[DEMO\]/ } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    const statusEmoji = {
        PENDING: '⏳',
        SCHEDULED: '📅',
        QUEUED: '📤',
        RUNNING: '🔄',
        COMPLETED: '✅',
        FAILED: '❌',
        PAUSED: '⏸️',
        CANCELLED: '🚫'
    };

    console.log('  ┌────────────────────────────────┐');
    for (const s of statuses) {
        const emoji = statusEmoji[s._id] || '❓';
        console.log(`  │ ${emoji} ${s._id.padEnd(12)} : ${String(s.count).padEnd(3)}        │`);
    }
    console.log('  └────────────────────────────────┘\n');
}

async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                     CHRONOS EXECUTION DEMO                             ║
╚════════════════════════════════════════════════════════════════════════╝
  `);

    try {
        // Step 1: Connect to MongoDB
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(config.mongoUri);
        console.log('✓ Connected to MongoDB\n');

        // Step 2: Create sample jobs
        const jobCount = await createSampleJobs();

        // Step 3: Start worker
        console.log('🚀 Starting worker...\n');
        console.log('━'.repeat(76));

        await worker.start();

        // Step 4: Wait for jobs to complete
        console.log('\n⏳ Waiting for jobs to complete (15 seconds)...\n');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Step 5: Stop worker
        console.log('\n━'.repeat(76));
        console.log('\n🛑 Stopping worker...');
        await worker.stop();

        // Step 6: Display results
        await displayJobStatus();
        await displayLogs();

        // Step 7: Show final stats
        const stats = worker.getStats();
        console.log('📈 Final Worker Statistics:');
        console.log(`   Jobs Processed: ${stats.jobsProcessed}`);
        console.log(`   Succeeded: ${stats.jobsSucceeded}`);
        console.log(`   Failed: ${stats.jobsFailed}`);
        console.log(`   Success Rate: ${stats.successRate}`);
        console.log(`   Avg Duration: ${stats.avgExecutionTime}ms`);

        console.log('\n✅ Demo completed!\n');

    } catch (error) {
        console.error('❌ Demo failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

// Run the demo
main();
