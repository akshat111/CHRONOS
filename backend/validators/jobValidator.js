
const isValidCronExpression = (cron) => {
    if (!cron || typeof cron !== 'string') return false;

    const parts = cron.trim().split(/\s+/);

    // Standard cron has 5 parts, extended has 6
    if (parts.length < 5 || parts.length > 6) return false;

    // Basic validation - each part should be a valid cron field
    const patterns = [
        /^(\*|([0-5]?[0-9])([-,/][0-5]?[0-9])*)$/, // minute (0-59)
        /^(\*|([01]?[0-9]|2[0-3])([-,/]([01]?[0-9]|2[0-3]))*)$/, // hour (0-23)
        /^(\*|([1-9]|[12][0-9]|3[01])([-,/]([1-9]|[12][0-9]|3[01]))*)$/, // day (1-31)
        /^(\*|([1-9]|1[0-2])([-,/]([1-9]|1[0-2]))*)$/, // month (1-12)
        /^(\*|[0-6]([-,/][0-6])*)$/ // day of week (0-6)
    ];

    for (let i = 0; i < 5; i++) {
        // Allow wildcards and step values
        if (parts[i] === '*' || parts[i].includes('/') || parts[i].includes('-') || parts[i].includes(',')) {
            continue;
        }
        if (!patterns[i].test(parts[i])) {
            return false;
        }
    }

    return true;
};

const validateOneTimeJob = (data) => {
    const errors = [];
    const sanitizedData = {};

    // Required: jobName
    if (!data.jobName || typeof data.jobName !== 'string') {
        errors.push({ field: 'jobName', message: 'Job name is required and must be a string' });
    } else if (data.jobName.trim().length < 3) {
        errors.push({ field: 'jobName', message: 'Job name must be at least 3 characters' });
    } else if (data.jobName.length > 200) {
        errors.push({ field: 'jobName', message: 'Job name cannot exceed 200 characters' });
    } else {
        sanitizedData.jobName = data.jobName.trim();
    }

    // Required: taskType
    if (!data.taskType || typeof data.taskType !== 'string') {
        errors.push({ field: 'taskType', message: 'Task type is required and must be a string' });
    } else {
        sanitizedData.taskType = data.taskType.trim();
    }

    // Required: scheduleTime
    if (!data.scheduleTime) {
        errors.push({ field: 'scheduleTime', message: 'Schedule time is required for one-time jobs' });
    } else {
        const scheduleDate = new Date(data.scheduleTime);
        if (isNaN(scheduleDate.getTime())) {
            errors.push({ field: 'scheduleTime', message: 'Invalid date format for scheduleTime' });
        } else if (scheduleDate <= new Date()) {
            errors.push({ field: 'scheduleTime', message: 'Schedule time must be in the future' });
        } else {
            sanitizedData.scheduleTime = scheduleDate;
        }
    }

    // Optional: description
    if (data.description) {
        if (typeof data.description !== 'string') {
            errors.push({ field: 'description', message: 'Description must be a string' });
        } else if (data.description.length > 1000) {
            errors.push({ field: 'description', message: 'Description cannot exceed 1000 characters' });
        } else {
            sanitizedData.description = data.description.trim();
        }
    }

    // Optional: payload
    if (data.payload !== undefined) {
        if (typeof data.payload !== 'object') {
            errors.push({ field: 'payload', message: 'Payload must be an object' });
        } else {
            sanitizedData.payload = data.payload;
        }
    }

    // Optional: priority (1-10)
    if (data.priority !== undefined) {
        const priority = parseInt(data.priority, 10);
        if (isNaN(priority) || priority < 1 || priority > 10) {
            errors.push({ field: 'priority', message: 'Priority must be a number between 1 and 10' });
        } else {
            sanitizedData.priority = priority;
        }
    }

    // Optional: maxRetries (0-10)
    if (data.maxRetries !== undefined) {
        const maxRetries = parseInt(data.maxRetries, 10);
        if (isNaN(maxRetries) || maxRetries < 0 || maxRetries > 10) {
            errors.push({ field: 'maxRetries', message: 'Max retries must be a number between 0 and 10' });
        } else {
            sanitizedData.maxRetries = maxRetries;
        }
    }

    // Optional: retryDelay (in milliseconds, min 1000)
    if (data.retryDelay !== undefined) {
        const retryDelay = parseInt(data.retryDelay, 10);
        if (isNaN(retryDelay) || retryDelay < 1000) {
            errors.push({ field: 'retryDelay', message: 'Retry delay must be at least 1000ms (1 second)' });
        } else {
            sanitizedData.retryDelay = retryDelay;
        }
    }

    // Optional: tags
    if (data.tags !== undefined) {
        if (!Array.isArray(data.tags)) {
            errors.push({ field: 'tags', message: 'Tags must be an array of strings' });
        } else if (!data.tags.every(tag => typeof tag === 'string')) {
            errors.push({ field: 'tags', message: 'All tags must be strings' });
        } else {
            sanitizedData.tags = data.tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
        }
    }

    // Optional: timezone
    if (data.timezone) {
        sanitizedData.timezone = data.timezone;
    }

    // Optional: dependsOnJobId
    if (data.dependsOnJobId) {
        if (typeof data.dependsOnJobId !== 'string') {
            errors.push({ field: 'dependsOnJobId', message: 'Dependency Job ID must be a string' });
        } else {
            sanitizedData.dependsOnJobId = data.dependsOnJobId;
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        sanitizedData
    };
};

const validateRecurringJob = (data) => {
    const errors = [];
    const sanitizedData = {};

    // Required: jobName
    if (!data.jobName || typeof data.jobName !== 'string') {
        errors.push({ field: 'jobName', message: 'Job name is required and must be a string' });
    } else if (data.jobName.trim().length < 3) {
        errors.push({ field: 'jobName', message: 'Job name must be at least 3 characters' });
    } else if (data.jobName.length > 200) {
        errors.push({ field: 'jobName', message: 'Job name cannot exceed 200 characters' });
    } else {
        sanitizedData.jobName = data.jobName.trim();
    }

    // Required: taskType
    if (!data.taskType || typeof data.taskType !== 'string') {
        errors.push({ field: 'taskType', message: 'Task type is required and must be a string' });
    } else {
        sanitizedData.taskType = data.taskType.trim();
    }

    // Required: Either cronExpression OR interval (not both)
    const hasCron = data.cronExpression && data.cronExpression.trim().length > 0;
    const hasInterval = data.interval !== undefined && data.interval !== null;

    if (!hasCron && !hasInterval) {
        errors.push({
            field: 'schedule',
            message: 'Either cronExpression or interval is required for recurring jobs'
        });
    } else if (hasCron && hasInterval) {
        errors.push({
            field: 'schedule',
            message: 'Provide either cronExpression OR interval, not both'
        });
    } else if (hasCron) {
        if (!isValidCronExpression(data.cronExpression)) {
            errors.push({
                field: 'cronExpression',
                message: 'Invalid cron expression format. Example: "0 9 * * *" (every day at 9 AM)'
            });
        } else {
            sanitizedData.cronExpression = data.cronExpression.trim();
        }
    } else if (hasInterval) {
        const interval = parseInt(data.interval, 10);
        if (isNaN(interval) || interval < 1000) {
            errors.push({
                field: 'interval',
                message: 'Interval must be at least 1000ms (1 second)'
            });
        } else if (interval > 2592000000) { // 30 days max
            errors.push({
                field: 'interval',
                message: 'Interval cannot exceed 30 days (2592000000ms)'
            });
        } else {
            sanitizedData.interval = interval;
        }
    }

    // Optional: startTime (when to start the recurring job)
    if (data.startTime) {
        const startDate = new Date(data.startTime);
        if (isNaN(startDate.getTime())) {
            errors.push({ field: 'startTime', message: 'Invalid date format for startTime' });
        } else {
            sanitizedData.nextRunAt = startDate;
        }
    }

    // Optional: endTime (when to stop the recurring job)
    if (data.endTime) {
        const endDate = new Date(data.endTime);
        if (isNaN(endDate.getTime())) {
            errors.push({ field: 'endTime', message: 'Invalid date format for endTime' });
        } else if (sanitizedData.nextRunAt && endDate <= sanitizedData.nextRunAt) {
            errors.push({ field: 'endTime', message: 'End time must be after start time' });
        } else {
            sanitizedData.endTime = endDate;
        }
    }

    // Optional: description
    if (data.description) {
        if (typeof data.description !== 'string') {
            errors.push({ field: 'description', message: 'Description must be a string' });
        } else if (data.description.length > 1000) {
            errors.push({ field: 'description', message: 'Description cannot exceed 1000 characters' });
        } else {
            sanitizedData.description = data.description.trim();
        }
    }

    // Optional: payload
    if (data.payload !== undefined) {
        if (typeof data.payload !== 'object') {
            errors.push({ field: 'payload', message: 'Payload must be an object' });
        } else {
            sanitizedData.payload = data.payload;
        }
    }

    // Optional: priority (1-10)
    if (data.priority !== undefined) {
        const priority = parseInt(data.priority, 10);
        if (isNaN(priority) || priority < 1 || priority > 10) {
            errors.push({ field: 'priority', message: 'Priority must be a number between 1 and 10' });
        } else {
            sanitizedData.priority = priority;
        }
    }

    // Optional: maxRetries (0-10)
    if (data.maxRetries !== undefined) {
        const maxRetries = parseInt(data.maxRetries, 10);
        if (isNaN(maxRetries) || maxRetries < 0 || maxRetries > 10) {
            errors.push({ field: 'maxRetries', message: 'Max retries must be a number between 0 and 10' });
        } else {
            sanitizedData.maxRetries = maxRetries;
        }
    }

    // Optional: retryDelay
    if (data.retryDelay !== undefined) {
        const retryDelay = parseInt(data.retryDelay, 10);
        if (isNaN(retryDelay) || retryDelay < 1000) {
            errors.push({ field: 'retryDelay', message: 'Retry delay must be at least 1000ms (1 second)' });
        } else {
            sanitizedData.retryDelay = retryDelay;
        }
    }

    // Optional: tags
    if (data.tags !== undefined) {
        if (!Array.isArray(data.tags)) {
            errors.push({ field: 'tags', message: 'Tags must be an array of strings' });
        } else if (!data.tags.every(tag => typeof tag === 'string')) {
            errors.push({ field: 'tags', message: 'All tags must be strings' });
        } else {
            sanitizedData.tags = data.tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
        }
    }

    // Optional: timezone
    if (data.timezone) {
        sanitizedData.timezone = data.timezone;
    }

    // Optional: dependsOnJobId
    if (data.dependsOnJobId) {
        if (typeof data.dependsOnJobId !== 'string') {
            errors.push({ field: 'dependsOnJobId', message: 'Dependency Job ID must be a string' });
        } else {
            sanitizedData.dependsOnJobId = data.dependsOnJobId;
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        sanitizedData
    };
};

module.exports = {
    validateOneTimeJob,
    validateRecurringJob,
    isValidCronExpression
};
