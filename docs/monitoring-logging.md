# Monitoring & Logging API Documentation

## Overview

The CHRONOS monitoring system provides:
- **System health checks** for infrastructure monitoring
- **Job statistics** for operational dashboards
- **Execution logs** for debugging and auditing

---

## API Endpoints

### System Health

#### `GET /api/system/health`

Check system health status. Returns status of all critical components.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-28T15:30:00.000Z",
  "uptime": 3600000,
  "responseTime": 45,
  "components": {
    "database": {
      "status": "healthy",
      "state": "connected",
      "latency": 12
    },
    "scheduler": {
      "status": "healthy",
      "recentExecutions": 42,
      "pendingJobs": 15
    },
    "system": {
      "status": "healthy",
      "memory": {
        "total": 8589934592,
        "free": 4294967296,
        "usagePercent": "50.00%"
      },
      "cpu": {
        "cores": 4,
        "loadAverage": [1.2, 1.5, 1.3]
      }
    },
    "process": {
      "status": "healthy",
      "pid": 12345,
      "memory": {
        "heapUsed": 50000000,
        "heapTotal": 100000000
      }
    }
  }
}
```

Use this endpoint for:
- Load balancer health checks
- Kubernetes liveness/readiness probes
- Monitoring system alerts

---

### System Statistics

#### `GET /api/system/stats`

Get job and execution statistics.

**Query Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| `period` | `24h` | Time period: `1h`, `6h`, `24h`, `7d`, `30d` |

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "24h",
    "periodStart": "2026-01-27T15:30:00.000Z",
    
    "jobs": {
      "total": 150,
      "byStatus": {
        "PENDING": 5,
        "SCHEDULED": 45,
        "QUEUED": 2,
        "RUNNING": 3,
        "COMPLETED": 85,
        "FAILED": 10
      },
      "byType": {
        "ONE_TIME": 100,
        "RECURRING": 50
      },
      "active": 50,
      "failed": 10
    },
    
    "executions": {
      "total": 230,
      "success": 200,
      "failed": 25,
      "timeout": 5,
      "retries": 15,
      "successRate": "86.96%",
      "avgDuration": 1250,
      "maxDuration": 15000
    },
    
    "executionsByTaskType": [
      {
        "taskType": "sendEmail",
        "count": 100,
        "successCount": 95,
        "successRate": "95.00%",
        "avgDuration": 800
      }
    ],
    
    "hourlyTrend": [
      { "_id": "2026-01-28 14:00", "total": 15, "success": 14, "failed": 1 },
      { "_id": "2026-01-28 15:00", "total": 18, "success": 17, "failed": 1 }
    ]
  }
}
```

---

#### `GET /api/system/stats/live`

Lightweight real-time statistics for frequent polling.

**Response:**
```json
{
  "timestamp": "2026-01-28T15:30:00.000Z",
  "running": 3,
  "scheduled": 45,
  "executions": {
    "last5min": 8,
    "failedLast5min": 1
  }
}
```

---

#### `GET /api/system/workers`

Get information about active workers.

**Response:**
```json
{
  "success": true,
  "data": {
    "workers": [
      {
        "workerId": "worker_host1_12345_abc",
        "host": "host1.example.com",
        "executions": 150,
        "successRate": "95.33%",
        "avgDuration": 1200,
        "lastSeen": "2026-01-28T15:29:00.000Z",
        "activeJobs": 2
      }
    ],
    "totalWorkers": 3,
    "activeWorkers": 2
  }
}
```

---

### Execution Logs

#### `GET /api/jobs/:id/logs`

Get execution logs for a specific job.

**Query Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `20` | Max logs to return (max 100) |
| `offset` | `0` | Pagination offset |
| `status` | - | Filter: `SUCCESS`, `FAILED`, `TIMEOUT` |
| `fromDate` | - | ISO date string |
| `toDate` | - | ISO date string |

**Response:**
```json
{
  "success": true,
  "data": {
    "job": {
      "id": "job_abc123",
      "name": "Send Welcome Email",
      "taskType": "sendEmail",
      "status": "COMPLETED"
    },
    "logs": [
      {
        "id": "log_xyz789",
        "status": "SUCCESS",
        "duration": 1234,
        "attempt": 0,
        "isRetry": false,
        "executedAt": "2026-01-28T15:00:00.000Z",
        "completedAt": "2026-01-28T15:00:01.234Z",
        "workerId": "worker_host1_12345",
        "result": { "sent": true, "recipient": "user@example.com" },
        "error": null
      },
      {
        "id": "log_xyz788",
        "status": "FAILED",
        "duration": 856,
        "attempt": 0,
        "isRetry": false,
        "executedAt": "2026-01-28T14:00:00.000Z",
        "error": {
          "message": "SMTP connection timeout",
          "code": "TIMEOUT"
        }
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 20,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

---

#### `GET /api/jobs/:id/logs/summary`

Get execution summary for a job.

**Response:**
```json
{
  "success": true,
  "data": {
    "job": {
      "id": "job_abc123",
      "name": "Send Welcome Email",
      "taskType": "sendEmail",
      "currentStatus": "SCHEDULED"
    },
    "summary": {
      "totalExecutions": 10,
      "successCount": 8,
      "failedCount": 1,
      "timeoutCount": 1,
      "retryCount": 2,
      "successRate": "80.00%",
      "avgDuration": 1100,
      "maxDuration": 2500,
      "minDuration": 800,
      "firstExecution": "2026-01-20T10:00:00.000Z",
      "lastExecution": "2026-01-28T15:00:00.000Z"
    }
  }
}
```

---

#### `GET /api/logs/recent`

Get recent execution logs across all jobs.

**Query Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `50` | Max logs (max 100) |
| `status` | - | Filter by status |
| `taskType` | - | Filter by task type |

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log_abc",
        "jobId": "job_123",
        "jobName": "Daily Report",
        "taskType": "generateReport",
        "status": "SUCCESS",
        "duration": 2500,
        "attempt": 0,
        "executedAt": "2026-01-28T15:00:00.000Z",
        "workerId": "worker_host1_12345"
      }
    ],
    "count": 1
  }
}
```

---

## Monitoring Approach

### 1. Health Checks

```
┌─────────────────────────────────────────────────────────────┐
│                     HEALTH CHECK                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Load Balancer / K8s ──────▶ GET /api/system/health        │
│                                      │                      │
│                                      ▼                      │
│                              ┌──────────────┐               │
│                              │   Healthy?   │               │
│                              └──────┬───────┘               │
│                                     │                       │
│                        ┌────────────┴────────────┐          │
│                        ▼                         ▼          │
│                   HTTP 200                   HTTP 503       │
│                   (Keep in pool)             (Remove)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- Check database connectivity and latency
- Check scheduler activity (recent executions)
- Check system resources (memory, CPU)
- Returns 503 if any critical component unhealthy

### 2. Statistics Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│                    MONITORING DASHBOARD                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐ │
│  │ Jobs Summary  │   │  Executions   │   │   Workers     │ │
│  ├───────────────┤   ├───────────────┤   ├───────────────┤ │
│  │ Running: 3    │   │ Last 24h: 230 │   │ Active: 3     │ │
│  │ Scheduled: 45 │   │ Success: 86%  │   │ Total: 5      │ │
│  │ Failed: 10    │   │ Avg: 1.2s     │   │               │ │
│  └───────────────┘   └───────────────┘   └───────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    Hourly Trend                         │ │
│  │  ████████████████  Success                              │ │
│  │  ██                Failed                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **GET /api/system/stats** - Full statistics (poll every 60s)
- **GET /api/system/stats/live** - Real-time counts (poll every 5s)
- **GET /api/system/workers** - Worker status (poll every 30s)

### 3. Debugging with Logs

When a job fails:
1. Get job details: `GET /api/jobs/:id`
2. Get execution history: `GET /api/jobs/:id/logs`
3. Check for patterns: `GET /api/jobs/:id/logs/summary`

```
Timeline for job_123:
─────────────────────────────────────────────────────────────
14:00  ✗ FAILED   (attempt 0)  → SMTP timeout
14:01  ✗ FAILED   (retry 1)    → SMTP connection refused
14:03  ✗ FAILED   (retry 2)    → SMTP connection refused
14:07  ✓ SUCCESS  (retry 3)    → Email sent
─────────────────────────────────────────────────────────────
```

---

## Integration Examples

### Prometheus Metrics

```javascript
// Custom endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  const stats = await fetchStats();
  res.type('text/plain').send(`
# HELP jobs_total Total number of jobs
# TYPE jobs_total gauge
jobs_total ${stats.jobs.total}

# HELP jobs_running Currently running jobs
# TYPE jobs_running gauge
jobs_running ${stats.jobs.byStatus.RUNNING}

# HELP executions_success_rate Success rate of executions
# TYPE executions_success_rate gauge
executions_success_rate ${parseFloat(stats.executions.successRate)}
  `);
});
```

### Grafana Dashboard

Use the `/api/system/stats` endpoint with period parameter:
- Panel 1: Job counts by status (gauge)
- Panel 2: Success rate (single stat)
- Panel 3: Hourly trend (graph)
- Panel 4: Worker activity (table)

### Alerting

```yaml
# Example alert rules
alerts:
  - name: HighFailureRate
    query: /api/system/stats
    condition: executions.successRate < 80%
    severity: warning

  - name: NoRecentExecutions
    query: /api/system/stats/live
    condition: executions.last5min == 0 && scheduled > 0
    severity: critical

  - name: DatabaseUnhealthy
    query: /api/system/health
    condition: components.database.status != "healthy"
    severity: critical
```
