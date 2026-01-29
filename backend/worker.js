/**
 * Worker Entry Point
 * 
 * Standalone worker process for executing scheduled jobs.
 * 
 * USAGE:
 *   node worker.js
 *   
 * ENVIRONMENT:
 *   MONGODB_URI     - MongoDB connection string
 *   POLL_INTERVAL   - Polling interval in ms (default: 5000)
 *   CONCURRENCY     - Max parallel jobs (default: 5)
 *   WORKER_ID       - Optional worker identifier
 * 
 * This process can run independently from the API server
 * and can be scaled horizontally by running multiple instances.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const WorkerService = require('./services/WorkerService');
const handlers = require('./handlers/taskHandlers');

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

const config = {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chronos_scheduler',
    pollInterval: parseInt(process.env.POLL_INTERVAL, 10) || 5000,
    concurrency: parseInt(process.env.CONCURRENCY, 10) || 5,
    jobTimeout: parseInt(process.env.JOB_TIMEOUT, 10) || 300000
};

// ═══════════════════════════════════════════════════════════════════════
// WORKER SETUP
// ═══════════════════════════════════════════════════════════════════════

const worker = new WorkerService({
    pollInterval: config.pollInterval,
    concurrency: config.concurrency,
    jobTimeout: config.jobTimeout,
    handlers // Register all handlers
});

// ═══════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════

worker.on('started', ({ workerId }) => {
    console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║   ██████╗██╗  ██╗██████╗  ██████╗ ███╗   ██╗ ██████╗ ███████╗          ║
║  ██╔════╝██║  ██║██╔══██╗██╔═══██╗████╗  ██║██╔═══██╗██╔════╝          ║
║  ██║     ███████║██████╔╝██║   ██║██╔██╗ ██║██║   ██║███████╗          ║
║  ██║     ██╔══██║██╔══██╗██║   ██║██║╚██╗██║██║   ██║╚════██║          ║
║  ╚██████╗██║  ██║██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝███████║          ║
║   ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝          ║
║                                                                        ║
║                         W O R K E R                                    ║
║                                                                        ║
╠════════════════════════════════════════════════════════════════════════╣
║  Worker ID     : ${workerId.padEnd(53)}║
║  Poll Interval : ${(config.pollInterval + 'ms').padEnd(53)}║
║  Concurrency   : ${String(config.concurrency).padEnd(53)}║
║  Job Timeout   : ${(config.jobTimeout + 'ms').padEnd(53)}║
║  Started       : ${new Date().toISOString().padEnd(53)}║
╠════════════════════════════════════════════════════════════════════════╣
║  Registered Handlers:                                                  ║`);

    const handlerNames = Object.keys(handlers);
    for (let i = 0; i < handlerNames.length; i += 3) {
        const row = handlerNames.slice(i, i + 3).map(h => h.padEnd(18)).join('');
        console.log(`║    ${row.padEnd(68)}║`);
    }

    console.log(`╚════════════════════════════════════════════════════════════════════════╝
  `);
});

worker.on('stopped', ({ stats }) => {
    console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                     WORKER SHUTDOWN COMPLETE                           ║
╠════════════════════════════════════════════════════════════════════════╣
║  Jobs Processed : ${String(stats.jobsProcessed).padEnd(53)}║
║  Succeeded      : ${String(stats.jobsSucceeded).padEnd(53)}║
║  Failed         : ${String(stats.jobsFailed).padEnd(53)}║
║  Success Rate   : ${stats.successRate.padEnd(53)}║
║  Avg Duration   : ${(stats.avgExecutionTime + 'ms').padEnd(53)}║
╚════════════════════════════════════════════════════════════════════════╝
  `);
});

worker.on('job:start', ({ jobId, taskType }) => {
    // Logged by handler
});

worker.on('job:complete', ({ jobId, duration }) => {
    // Logged by handler
});

worker.on('job:failed', ({ jobId, error }) => {
    // Logged by handler
});

worker.on('error', (error) => {
    console.error('[Worker] Error:', error.message);
});

// ═══════════════════════════════════════════════════════════════════════
// STATISTICS REPORTER
// ═══════════════════════════════════════════════════════════════════════

const printStats = () => {
    const stats = worker.getStats();
    if (stats.jobsProcessed > 0 || stats.activeJobs > 0) {
        console.log(`\n[Stats] Processed: ${stats.jobsProcessed} | Active: ${stats.activeJobs} | Success: ${stats.successRate}`);
    }
};

// ═══════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════

async function main() {
    try {
        // Connect to MongoDB
        console.log('[Worker] Connecting to MongoDB...');
        await mongoose.connect(config.mongoUri);
        console.log('[Worker] Connected to MongoDB');

        // Start the worker
        await worker.start();

        // Print stats every 60 seconds
        setInterval(printStats, 60000);

    } catch (error) {
        console.error('[Worker] Failed to start:', error);
        process.exit(1);
    }
}

// Run
main();
