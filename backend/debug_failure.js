
const mongoose = require('mongoose');
require('dotenv').config();
const Job = require('./models/Job');

const checkFailure = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const job = await Job.findOne({}).sort({ updatedAt: -1 }); // Get most recently updated
        console.log(`ERROR: ${job.lastError}`);
    } catch (e) { console.log(e) } finally { await mongoose.disconnect(); }
};
checkFailure();
