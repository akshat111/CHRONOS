const mongoose = require('mongoose');

/**
 * Database Configuration
 * 
 * Handles MongoDB connection with proper error handling,
 * connection pooling, and reconnection logic.
 */

const connectDB = async () => {
    try {
        // MongoDB connection options for production-ready setup
        const options = {
            // Connection pool size - adjust based on expected load
            maxPoolSize: 10,

            // Server selection timeout (how long to wait for a server)
            serverSelectionTimeoutMS: 5000,

            // Socket timeout (how long to wait for a response)
            socketTimeoutMS: 45000,

            // Buffering - disable if you want immediate errors instead of buffering
            bufferCommands: true,

            // Heartbeat frequency to check server health
            heartbeatFrequencyMS: 10000
        };

        const conn = await mongoose.connect(
            process.env.MONGODB_URI || 'mongodb://localhost:27017/chronos_scheduler',
            options
        );

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📦 Database: ${conn.connection.name}`);

        // Connection event handlers
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('📴 MongoDB connection closed due to app termination');
            process.exit(0);
        });

        return conn;
    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
