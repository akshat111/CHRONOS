/**
 * CHRONOS - Job Scheduling System
 * 
 * Main server entry point.
 * Configures Express app, middleware, routes, and starts the server.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const connectDB = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const loggingRoutes = require('./routes/loggingRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');
const WorkerService = require('./services/WorkerService');
const handlers = require('./handlers/taskHandlers');

// Initialize Express app
const app = express();

// ═══════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════

// Security headers
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',')
    : ['http://localhost:3000'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Request logging
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ═══════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════

// Simple health check (basic, for load balancers)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);

// Monitoring and logging routes
app.use('/api/system', monitoringRoutes);
app.use('/api/logs', loggingRoutes);
app.use('/api', loggingRoutes); // Also mount at /api for /api/jobs/:id/logs

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ═══════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Start server
        const server = app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗██╗  ██╗██████╗  ██████╗ ███╗   ██╗ ██████╗ ███████╗ ║
║  ██╔════╝██║  ██║██╔══██╗██╔═══██╗████╗  ██║██╔═══██╗██╔════╝ ║
║  ██║     ███████║██████╔╝██║   ██║██╔██╗ ██║██║   ██║███████╗ ║
║  ██║     ██╔══██║██╔══██╗██║   ██║██║╚██╗██║██║   ██║╚════██║ ║
║  ╚██████╗██║  ██║██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝███████║ ║
║   ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝ ║
║                                                               ║
║               Job Scheduling System v1.0.0                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

🚀 Server running on port ${PORT}
📁 Environment: ${process.env.NODE_ENV || 'development'}
📅 Started at: ${new Date().toISOString()}
      `);
        });

        // Initialize and start Worker (Job Scheduler) - Only in non-serverless environments
        // Vercel serverless functions can't run background processes
        if (process.env.DISABLE_WORKER !== 'true') {
            const taskHandlers = {
                ...handlers,
                notification: handlers.sendNotification,
                backup: handlers.dbMaintenance // Mapping backup to dbMaintenance
            };

            const worker = new WorkerService({
                workerId: `worker_${process.pid}`,
                pollInterval: 5000,
                handlers: taskHandlers
            });

            await worker.start();

            // Graceful shutdown
            const shutdown = async () => {
                console.log('Shutting down...');
                await worker.stop();
                server.close(() => {
                    console.log('Server closed');
                    process.exit(0);
                });
            };

            process.on('SIGTERM', shutdown);
            process.on('SIGINT', shutdown);
        } else {
            console.log('⚠️  Worker disabled (serverless mode)');
            console.log('💡 Jobs will not execute automatically. Use manual triggers or external cron.');
        }

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app; // For testing
