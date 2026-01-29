# Job Scheduling API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
All endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your_token>
```

---

## Endpoints

### 1. Create One-Time Job

**POST** `/jobs/one-time`

Creates a job that executes once at the specified time.

#### Request Body

```json
{
  "jobName": "Send Welcome Email",
  "taskType": "sendEmail",
  "scheduleTime": "2026-01-29T10:00:00.000Z",
  "description": "Send a welcome email to new user",
  "payload": {
    "userId": "user_12345",
    "emailType": "welcome",
    "recipientEmail": "user@example.com"
  },
  "priority": 3,
  "maxRetries": 5,
  "retryDelay": 120000,
  "tags": ["email", "onboarding"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobName` | string | ✅ | Human-readable job name (3-200 chars) |
| `taskType` | string | ✅ | Handler/task identifier |
| `scheduleTime` | ISO Date | ✅ | When to execute (must be in future) |
| `description` | string | ❌ | Job description (max 1000 chars) |
| `payload` | object | ❌ | Data passed to job handler |
| `priority` | number | ❌ | 1 (highest) to 10 (lowest), default: 5 |
| `maxRetries` | number | ❌ | Retry attempts on failure (0-10), default: 3 |
| `retryDelay` | number | ❌ | Delay between retries in ms, default: 60000 |
| `tags` | string[] | ❌ | Tags for categorization |
| `timezone` | string | ❌ | Timezone for scheduling, default: UTC |

#### Success Response (201 Created)

```json
{
  "success": true,
  "message": "One-time job created successfully",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "data": {
    "job": {
      "jobId": "job_1738078800000_abc123xyz",
      "jobName": "Send Welcome Email",
      "jobType": "ONE_TIME",
      "taskType": "sendEmail",
      "scheduleTime": "2026-01-29T10:00:00.000Z",
      "status": "SCHEDULED",
      "priority": 3,
      "maxRetries": 5,
      "createdAt": "2026-01-28T15:00:00.000Z"
    }
  }
}
```

#### Validation Error Response (422)

```json
{
  "success": false,
  "message": "Validation failed",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "errors": [
    {
      "field": "scheduleTime",
      "message": "Schedule time must be in the future"
    },
    {
      "field": "jobName",
      "message": "Job name must be at least 3 characters"
    }
  ]
}
```

---

### 2. Create Recurring Job

**POST** `/jobs/recurring`

Creates a job that executes repeatedly based on a cron expression or interval.

#### Request Body (with Cron Expression)

```json
{
  "jobName": "Daily Report Generator",
  "taskType": "generateReport",
  "cronExpression": "0 9 * * *",
  "description": "Generate and send daily sales report",
  "payload": {
    "reportType": "daily_sales",
    "recipients": ["manager@example.com"]
  },
  "priority": 2,
  "maxRetries": 3,
  "tags": ["reports", "daily"]
}
```

#### Request Body (with Interval)

```json
{
  "jobName": "Health Check Ping",
  "taskType": "healthCheck",
  "interval": 300000,
  "description": "Ping external services every 5 minutes",
  "payload": {
    "services": ["api.service.com", "db.service.com"]
  },
  "startTime": "2026-01-28T16:00:00.000Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobName` | string | ✅ | Human-readable job name |
| `taskType` | string | ✅ | Handler/task identifier |
| `cronExpression` | string | ✅* | Cron schedule (if no interval) |
| `interval` | number | ✅* | Interval in ms (if no cron) |
| `startTime` | ISO Date | ❌ | When to start recurring, default: now |
| `endTime` | ISO Date | ❌ | When to stop recurring |
| `description` | string | ❌ | Job description |
| `payload` | object | ❌ | Data passed to job handler |
| `priority` | number | ❌ | 1-10, default: 5 |
| `maxRetries` | number | ❌ | Retry attempts (0-10), default: 3 |
| `tags` | string[] | ❌ | Tags for categorization |

*Either `cronExpression` OR `interval` is required, not both.

#### Common Cron Expressions

| Expression | Description |
|------------|-------------|
| `* * * * *` | Every minute |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 0 1 * *` | First day of every month |
| `0 0 * * 0` | Every Sunday at midnight |

#### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Recurring job created successfully",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "data": {
    "job": {
      "jobId": "job_1738078800000_def456uvw",
      "jobName": "Daily Report Generator",
      "jobType": "RECURRING",
      "taskType": "generateReport",
      "cronExpression": "0 9 * * *",
      "nextRunAt": "2026-01-29T09:00:00.000Z",
      "status": "SCHEDULED",
      "priority": 2,
      "maxRetries": 3,
      "createdAt": "2026-01-28T15:00:00.000Z"
    }
  }
}
```

---

### 3. Get All Jobs

**GET** `/jobs`

Retrieves all jobs with pagination and filtering.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10) |
| `status` | string | Filter by status |
| `jobType` | string | Filter by type (ONE_TIME, RECURRING) |
| `taskType` | string | Filter by task type |

#### Example Request
```
GET /api/jobs?page=1&limit=10&status=SCHEDULED&jobType=RECURRING
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Jobs retrieved successfully",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "data": {
    "jobs": [
      {
        "_id": "65b8c3...",
        "jobId": "job_1738078800000_abc123xyz",
        "jobName": "Daily Report",
        "jobType": "RECURRING",
        "status": "SCHEDULED",
        "nextRunAt": "2026-01-29T09:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 47,
      "itemsPerPage": 10
    }
  }
}
```

---

### 4. Get Job by ID

**GET** `/jobs/:jobId`

Retrieves a single job by its jobId.

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Job retrieved successfully",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "data": {
    "job": {
      "_id": "65b8c3...",
      "jobId": "job_1738078800000_abc123xyz",
      "jobName": "Send Welcome Email",
      "jobType": "ONE_TIME",
      "taskType": "sendEmail",
      "scheduleTime": "2026-01-29T10:00:00.000Z",
      "status": "SCHEDULED",
      "priority": 3,
      "retryCount": 0,
      "maxRetries": 5,
      "payload": {
        "userId": "user_12345"
      },
      "createdAt": "2026-01-28T15:00:00.000Z",
      "updatedAt": "2026-01-28T15:00:00.000Z"
    }
  }
}
```

---

### 5. Cancel Job

**PATCH** `/jobs/:jobId/cancel`

Cancels a pending or scheduled job.

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "data": {
    "job": {
      "jobId": "job_1738078800000_abc123xyz",
      "status": "CANCELLED"
    }
  }
}
```

---

### 6. Pause Recurring Job

**PATCH** `/jobs/:jobId/pause`

Pauses a recurring job temporarily.

---

### 7. Resume Paused Job

**PATCH** `/jobs/:jobId/resume`

Resumes a paused job.

---

### 8. Delete Job

**DELETE** `/jobs/:jobId`

Soft deletes a job (marks as inactive).

---

## Error Codes

| Status | Description |
|--------|-------------|
| 200 | Success |
| 201 | Resource created |
| 400 | Bad request |
| 401 | Unauthorized |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 422 | Validation error |
| 500 | Server error |

---

## Testing with cURL

### Create One-Time Job
```bash
curl -X POST http://localhost:5000/api/jobs/one-time \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_token" \
  -d '{
    "jobName": "Test Email Job",
    "taskType": "sendEmail",
    "scheduleTime": "2026-01-29T10:00:00.000Z",
    "payload": { "to": "user@example.com" }
  }'
```

### Create Recurring Job
```bash
curl -X POST http://localhost:5000/api/jobs/recurring \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_token" \
  -d '{
    "jobName": "Hourly Cleanup",
    "taskType": "cleanup",
    "cronExpression": "0 * * * *"
  }'
```

### Get All Jobs
```bash
curl http://localhost:5000/api/jobs \
  -H "Authorization: Bearer test_token"
```
