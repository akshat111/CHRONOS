/**
 * Models Index
 * 
 * Central export point for all Mongoose models.
 * Import models from here for consistent access across the application.
 * 
 * Usage:
 *   const { Job, JobExecutionLog } = require('./models');
 */

const Job = require('./Job');
const JobExecutionLog = require('./JobExecutionLog');

module.exports = {
    Job,
    JobExecutionLog
};
