const simulateWork = (minMs, maxMs) => {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
};

const maybeThrow = (failureRate, errorMessage) => {
    if (Math.random() < failureRate) {
        throw new Error(errorMessage);
    }
};

const sendEmail = async (payload, job) => {
    console.log(`\n  📧 [sendEmail] Starting email job...`);
    console.log(`     To: ${payload.recipientEmail || payload.to || 'unknown'}`);
    console.log(`     Type: ${payload.emailType || 'general'}`);
    console.log(`     Subject: ${payload.subject || 'No subject'}`);

    // Validate payload
    if (!payload.recipientEmail && !payload.to) {
        throw new Error('Validation Error: recipientEmail is required');
    }

    // Simulate email preparation (100-300ms)
    console.log(`     → Preparing email template...`);
    await simulateWork(100, 300);

    // Simulate SMTP connection (200-500ms)
    console.log(`     → Connecting to SMTP server...`);
    await simulateWork(200, 500);
    maybeThrow(0.05, 'SMTP connection refused'); // 5% failure rate

    // Simulate sending (300-800ms)
    console.log(`     → Sending email...`);
    await simulateWork(300, 800);
    maybeThrow(0.03, 'Email delivery failed: mailbox full'); // 3% failure rate

    console.log(`     ✓ Email sent successfully!`);

    return {
        sent: true,
        recipient: payload.recipientEmail || payload.to,
        emailType: payload.emailType || 'general',
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sentAt: new Date().toISOString()
    };
};

const sendBulkEmail = async (payload, job) => {
    const recipients = payload.recipients || [];
    console.log(`\n  📧 [sendBulkEmail] Sending to ${recipients.length} recipients...`);

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
        await simulateWork(50, 150);

        if (Math.random() < 0.02) { // 2% per-email failure
            failed++;
            console.log(`     ✗ Failed: ${recipient}`);
        } else {
            sent++;
        }
    }

    console.log(`     ✓ Completed: ${sent} sent, ${failed} failed`);

    return {
        totalRecipients: recipients.length,
        sent,
        failed,
        successRate: ((sent / recipients.length) * 100).toFixed(1) + '%',
        completedAt: new Date().toISOString()
    };
};

const generateReport = async (payload, job) => {
    console.log(`\n  📊 [generateReport] Generating ${payload.reportType || 'default'} report...`);

    // Simulate data fetching (500-1500ms)
    console.log(`     → Fetching data from database...`);
    await simulateWork(500, 1500);
    maybeThrow(0.02, 'Database connection timeout'); // 2% failure

    const rowCount = Math.floor(Math.random() * 5000) + 500;
    console.log(`     → Processing ${rowCount} rows...`);
    await simulateWork(300, 800);

    // Simulate report generation (400-1000ms)
    console.log(`     → Generating report file...`);
    await simulateWork(400, 1000);

    // Simulate upload (200-600ms)
    console.log(`     → Uploading to storage...`);
    await simulateWork(200, 600);
    maybeThrow(0.02, 'Storage upload failed'); // 2% failure

    const fileUrl = `https://reports.chronos.dev/${Date.now()}-${payload.reportType || 'report'}.pdf`;
    console.log(`     ✓ Report generated: ${fileUrl}`);

    return {
        reportType: payload.reportType || 'default',
        rowCount,
        fileSizeKb: Math.floor(Math.random() * 500) + 50,
        fileUrl,
        generatedAt: new Date().toISOString()
    };
};

const cleanup = async (payload, job) => {
    const target = payload.target || 'temp_files';
    console.log(`\n  🧹 [cleanup] Cleaning up ${target}...`);

    // Simulate scanning (200-500ms)
    console.log(`     → Scanning for files older than ${payload.ageHours || 24} hours...`);
    await simulateWork(200, 500);

    const filesToDelete = Math.floor(Math.random() * 150) + 10;
    console.log(`     → Found ${filesToDelete} files to delete`);

    // Simulate deletion (300-700ms)
    console.log(`     → Deleting files...`);
    await simulateWork(300, 700);

    const freedMb = Math.floor(Math.random() * 500) + 50;
    console.log(`     ✓ Cleanup complete! Freed ${freedMb}MB`);

    return {
        target,
        filesDeleted: filesToDelete,
        freedMb,
        completedAt: new Date().toISOString()
    };
};

const dbMaintenance = async (payload, job) => {
    console.log(`\n  🔧 [dbMaintenance] Running database maintenance...`);

    const tasks = [
        { name: 'Vacuum tables', time: [300, 600] },
        { name: 'Update statistics', time: [200, 400] },
        { name: 'Rebuild indexes', time: [400, 800] },
        { name: 'Clear query cache', time: [100, 200] }
    ];

    const results = {};

    for (const task of tasks) {
        console.log(`     → ${task.name}...`);
        await simulateWork(task.time[0], task.time[1]);
        results[task.name] = 'completed';
    }

    console.log(`     ✓ Maintenance complete!`);

    return {
        tasks: results,
        completedAt: new Date().toISOString()
    };
};

const healthCheck = async (payload, job) => {
    const services = payload.services || ['api', 'database', 'cache'];
    console.log(`\n  🏥 [healthCheck] Checking ${services.length} services...`);

    const results = {};

    for (const service of services) {
        console.log(`     → Pinging ${service}...`);
        await simulateWork(100, 300);

        const status = Math.random() > 0.05 ? 'healthy' : 'degraded';
        const latency = Math.floor(Math.random() * 100) + 10;

        results[service] = { status, latencyMs: latency };
        console.log(`       ${status === 'healthy' ? '✓' : '⚠'} ${service}: ${status} (${latency}ms)`);
    }

    const allHealthy = Object.values(results).every(r => r.status === 'healthy');
    console.log(`     ${allHealthy ? '✓' : '⚠'} Overall: ${allHealthy ? 'All services healthy' : 'Some services degraded'}`);

    return {
        services: results,
        allHealthy,
        checkedAt: new Date().toISOString()
    };
};

const sendWebhook = async (payload, job) => {
    console.log(`\n  🔗 [sendWebhook] Sending webhook...`);
    console.log(`     URL: ${payload.url || 'Not specified'}`);

    if (!payload.url) {
        throw new Error('Validation Error: webhook URL is required');
    }

    // Simulate HTTP request (200-600ms)
    console.log(`     → Establishing connection...`);
    await simulateWork(100, 200);

    console.log(`     → Sending payload...`);
    await simulateWork(200, 400);
    maybeThrow(0.05, 'Webhook endpoint returned 503'); // 5% failure

    const responseCode = 200;
    console.log(`     ✓ Webhook delivered (HTTP ${responseCode})`);

    return {
        url: payload.url,
        httpStatus: responseCode,
        responseTime: Math.floor(Math.random() * 300) + 100,
        sentAt: new Date().toISOString()
    };
};

const dataSync = async (payload, job) => {
    console.log(`\n  🔄 [dataSync] Starting data sync...`);
    console.log(`     Source: ${payload.source || 'primary'}`);
    console.log(`     Destination: ${payload.destination || 'replica'}`);

    // Simulate connection (200-400ms)
    console.log(`     → Connecting to systems...`);
    await simulateWork(200, 400);

    // Simulate data fetch (500-1500ms)
    console.log(`     → Fetching changed records...`);
    await simulateWork(500, 1500);

    const recordsFound = Math.floor(Math.random() * 1000) + 50;
    console.log(`     → Found ${recordsFound} records to sync`);

    // Simulate sync (300-800ms)
    console.log(`     → Syncing records...`);
    await simulateWork(300, 800);
    maybeThrow(0.03, 'Sync failed: destination write error'); // 3% failure

    console.log(`     ✓ Sync completed!`);

    return {
        source: payload.source || 'primary',
        destination: payload.destination || 'replica',
        recordsSynced: recordsFound,
        syncDuration: Math.floor(Math.random() * 2000) + 500,
        completedAt: new Date().toISOString()
    };
};

const sendNotification = async (payload, job) => {
    console.log(`\n  🔔 [sendNotification] Sending push notification...`);
    console.log(`     User: ${payload.userId || 'unknown'}`);
    console.log(`     Title: ${payload.title || 'Notification'}`);

    // Simulate FCM/APNS call (150-400ms)
    console.log(`     → Sending to push service...`);
    await simulateWork(150, 400);
    maybeThrow(0.02, 'Push service unavailable'); // 2% failure

    console.log(`     ✓ Notification delivered!`);

    return {
        userId: payload.userId,
        notificationId: `notif_${Date.now()}`,
        delivered: true,
        sentAt: new Date().toISOString()
    };
};

const echo = async (payload, job) => {
    console.log(`\n  🔊 [echo] Echoing payload...`);
    await simulateWork(100, 200);

    return {
        echo: payload,
        jobId: job.jobId,
        timestamp: new Date().toISOString()
    };
};

const delay = async (payload, job) => {
    const delayMs = payload.delayMs || 5000;
    console.log(`\n  ⏱️ [delay] Waiting for ${delayMs}ms...`);

    await new Promise(resolve => setTimeout(resolve, delayMs));

    console.log(`     ✓ Delay completed!`);
    return {
        delayMs,
        completedAt: new Date().toISOString()
    };
};
const alwaysFail = async (payload, job) => {
    console.log(`\n  💥 [alwaysFail] This job will fail...`);
    await simulateWork(100, 300);
    throw new Error('Intentional failure for testing');
};

const randomOutcome = async (payload, job) => {
    const successRate = payload.successRate || 0.5;
    console.log(`\n  🎲 [randomOutcome] Success rate: ${successRate * 100}%`);

    await simulateWork(200, 500);

    if (Math.random() > successRate) {
        throw new Error('Random failure occurred');
    }

    return {
        outcome: 'success',
        roll: Math.random().toFixed(4),
        completedAt: new Date().toISOString()
    };
};

module.exports = {
    // Email
    sendEmail,
    sendBulkEmail,

    // Reports
    generateReport,

    // Maintenance
    cleanup,
    dbMaintenance,

    // Monitoring
    healthCheck,

    // Integration
    sendWebhook,
    dataSync,

    // Notifications
    sendNotification,

    // Testing
    echo,
    delay,
    alwaysFail,
    randomOutcome
};
