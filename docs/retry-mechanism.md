# Retry Mechanism Documentation

## Overview

The CHRONOS retry system provides robust failure handling with:
- **Multiple backoff strategies** (exponential, linear, fixed, fibonacci)
- **Jitter** to prevent thundering herd
- **Error classification** to skip non-retryable errors
- **Detailed logging** of each retry attempt

---

## Retry Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      JOB EXECUTION                               │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    SUCCESS    │──────────────────▶ COMPLETED ✓
                    └───────┬───────┘
                            │
                            │ FAILURE
                            ▼
              ┌─────────────────────────────┐
              │   Is this error retryable?  │
              │  (not validation, auth etc) │
              └──────────────┬──────────────┘
                             │
                   ┌─────────┴─────────┐
                   ▼                   ▼
                  YES                  NO
                   │                   │
                   ▼                   └──────────────▶ FAILED ✗
         ┌─────────────────────┐                      (immediately)
         │  Retries remaining? │
         │  (count < maxRetries)│
         └──────────┬──────────┘
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
         YES                  NO ─────────────────────▶ FAILED ✗
          │                                            (exhausted)
          ▼
   ┌────────────────────┐
   │  Calculate Delay   │
   │  (backoff + jitter)│
   └─────────┬──────────┘
             │
             ▼
   ┌────────────────────┐
   │  Schedule Retry    │
   │  status: SCHEDULED │
   │  nextRunAt: now+d  │
   └─────────┬──────────┘
             │
             ▼
         WAITING...
             │
             │ (scheduler picks up)
             │
             └─────────────▶ Back to JOB EXECUTION
```

---

## Backoff Strategies

### 1. Exponential (Default)

```
Delay = baseDelay × 2^attempt

Example (base = 1 min):
  Attempt 1: 1 min
  Attempt 2: 2 min
  Attempt 3: 4 min
  Attempt 4: 8 min
  Attempt 5: 16 min
```

**Best for:** Network errors, API rate limits, external service outages

### 2. Linear

```
Delay = baseDelay × (attempt + 1)

Example (base = 1 min):
  Attempt 1: 1 min
  Attempt 2: 2 min
  Attempt 3: 3 min
  Attempt 4: 4 min
```

**Best for:** Resource contention, database locks

### 3. Fixed

```
Delay = baseDelay (constant)

Example (base = 1 min):
  Attempt 1: 1 min
  Attempt 2: 1 min
  Attempt 3: 1 min
```

**Best for:** Simple retry scenarios, predictable recovery

### 4. Fibonacci

```
Delay = baseDelay × fibonacci(attempt)

Example (base = 1 min):
  Attempt 1: 1 min
  Attempt 2: 1 min
  Attempt 3: 2 min
  Attempt 4: 3 min
  Attempt 5: 5 min
```

**Best for:** Gradual backoff, balancing quick recovery with not overwhelming

---

## Jitter

Jitter adds randomness to prevent the **thundering herd problem**:

```
Without jitter:
  100 failed jobs all retry at exactly T+60s
  → Server gets 100 simultaneous requests
  → Server overloads, all fail again
  → Vicious cycle

With jitter (±20%):
  100 failed jobs retry between T+48s and T+72s
  → Requests spread over 24 seconds
  → Server handles load gracefully
```

---

## Non-Retryable Errors

Some errors should NOT be retried:

| Error Type | Why Not Retry? |
|------------|----------------|
| `ValidationError` | Data won't become valid on retry |
| `NotFoundError` | Resource still won't exist |
| `UnauthorizedError` | Credentials still invalid |
| `ForbiddenError` | Permissions unchanged |
| `SyntaxError` | Code bug, won't fix itself |

The system automatically detects these and fails immediately.

---

## Configuration Options

```javascript
const worker = new WorkerServiceWithRetry({
  // Retry settings
  maxRetries: 3,           // Default: 3 attempts
  baseRetryDelay: 60000,   // Default: 1 minute
  maxRetryDelay: 3600000,  // Default: 1 hour (cap)
  retryStrategy: 'exponential',
  jitterEnabled: true,     // Default: true
  jitterFactor: 0.2        // Default: ±20%
});
```

Per-job override:
```javascript
await Job.create({
  jobName: "Critical Task",
  maxRetries: 5,           // Override default
  retryDelay: 30000,       // 30 second base
  useExponentialBackoff: true
});
```

---

## Execution Log Example

Each retry attempt is logged separately:

```
Job: send-welcome-email (job_abc123)

┌────────────┬─────────┬──────────┬──────────────────────────────┐
│ Attempt    │ Status  │ Duration │ Notes                        │
├────────────┼─────────┼──────────┼──────────────────────────────┤
│ Initial    │ FAILED  │ 1,234ms  │ SMTP timeout                 │
│ Retry #1   │ FAILED  │ 856ms    │ SMTP connection refused      │
│ Retry #2   │ SUCCESS │ 2,103ms  │ Email delivered              │
└────────────┴─────────┴──────────┴──────────────────────────────┘
```

---

## Why This Approach is Scalable and Safe

### 1. **Database-Driven Scheduling**

Retries are scheduled by updating `nextRunAt` in MongoDB:
- No in-memory timers that could be lost
- Survives worker restarts
- Multiple workers can process retries

```javascript
// Failed job gets this update:
{
  status: 'SCHEDULED',
  nextRunAt: new Date(Date.now() + retryDelay),
  retryCount: retryCount + 1
}
```

### 2. **Atomic Operations**

Jobs are claimed atomically:
```javascript
await Job.findOneAndUpdate(
  { 
    status: 'SCHEDULED', 
    nextRunAt: { $lte: now },
    lockedBy: null 
  },
  { 
    status: 'QUEUED', 
    lockedBy: this.workerId 
  }
);
```
Only ONE worker can claim a retrying job.

### 3. **Distributed-Friendly**

- No shared state between workers
- Any worker can pick up a retry
- Lock timeout handles crashed workers

### 4. **Bounded Retries**

`maxRetries` prevents infinite loops:
```javascript
if (retryCount >= maxRetries) {
  status = 'FAILED';  // Stop retrying
}
```

### 5. **Backoff Prevents Overload**

Exponential backoff + jitter:
- Doesn't hammer failing services
- Allows time for recovery
- Distributes retry load

---

## Monitoring Retry Performance

```javascript
const stats = worker.getStats();

console.log({
  totalRetries: stats.totalRetries,         // How many retries occurred
  successfulRetries: stats.successfulRetries, // Retries that eventually succeeded
  retrySuccessRate: stats.retrySuccessRate   // % of retries that worked
});
```

---

## Running the Demo

```bash
cd backend
npm install
node demo/retry-demo.js
```

This will:
1. Create jobs with different failure behaviors
2. Show retry attempts in real-time
3. Display final status and execution logs
