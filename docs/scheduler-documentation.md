# Scheduler Service Documentation

## Overview

The CHRONOS Scheduler Service is responsible for:
1. Polling MongoDB for jobs that are due for execution
2. Picking jobs atomically to prevent duplicate execution
3. Executing jobs through registered task handlers
4. Managing job lifecycle (completion, failure, retry)
5. Rescheduling recurring jobs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Scheduler Service                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  Poll Loop   │───▶│  Job Picker  │───▶│   Job Executor   │  │
│  │ (setInterval)│    │  (Atomic)    │    │  (w/ Handlers)   │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                   │                      │            │
│         │                   ▼                      ▼            │
│         │            ┌──────────────┐      ┌──────────────┐    │
│         │            │ Lock Manager │      │Execution Log │    │
│         │            │(Distributed) │      │  (MongoDB)   │    │
│         │            └──────────────┘      └──────────────┘    │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Stale Job Recovery (every 60s)              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Scheduler (`Scheduler.js`)
The main orchestrator that:
- Runs the poll loop at configurable intervals
- Manages concurrency (max parallel jobs)
- Emits events for monitoring
- Handles graceful shutdown

### 2. Job Picker (`JobPicker.js`)
Finds and claims due jobs:
- Uses atomic `findOneAndUpdate` to claim jobs
- Prevents duplicate execution
- Handles stale lock recovery

### 3. Job Executor (`JobExecutor.js`)
Executes claimed jobs:
- Runs task handlers with timeout
- Updates job status on completion/failure
- Calculates next run for recurring jobs
- Manages retry logic with exponential backoff

### 4. Lock Manager (`LockManager.js`)
Distributed locking using MongoDB:
- Prevents multiple workers from claiming same job
- Automatic lock expiration (TTL)
- Lock renewal for long-running jobs

---

## How Duplicate Execution is Prevented

### The Problem
In a distributed system with multiple workers, we need to ensure:
- Each job is picked by exactly ONE worker
- A job is never executed twice simultaneously
- Crashed workers don't leave jobs stuck

### The Solution: Atomic Claim Operation

```javascript
// JobPicker.pickOne() uses findOneAndUpdate atomically

const job = await Job.findOneAndUpdate(
  {
    // CONDITION 1: Job must be in SCHEDULED status
    status: 'SCHEDULED',
    
    // CONDITION 2: Job must be due (time has passed)
    nextRunAt: { $lte: now },
    
    // CONDITION 3: Job must be active
    isActive: true,
    
    // CONDITION 4: Not locked by another worker (or lock expired)
    $or: [
      { lockedBy: null },           // Never locked
      { lockedAt: null },           // Lock cleared
      { lockedAt: { $lt: staleThreshold } }  // Lock expired
    ]
  },
  {
    // ATOMIC UPDATE: Claim the job
    $set: {
      status: 'QUEUED',
      lockedBy: this.workerId,
      lockedAt: now
    }
  },
  {
    new: true,  // Return updated document
    sort: { priority: 1, nextRunAt: 1 }  // Get highest priority first
  }
);
```

### Why This Works

1. **Atomic Operation**: MongoDB's `findOneAndUpdate` is atomic. The query and update happen as a single operation - no other process can modify the document between finding and updating.

2. **Condition Check**: The query conditions ensure only unlocked, due jobs are matched. Once a job is claimed (status = 'QUEUED', lockedBy = worker), other workers' queries won't match it.

3. **Result Guarantee**: 
   - If we get a job back → We own it
   - If we get null → Either no due jobs, or another worker claimed first

### Visual Example

```
Time T0: Job "job_123" is due
         status: SCHEDULED, lockedBy: null

Worker A                    Worker B
────────                    ────────
findOneAndUpdate({          findOneAndUpdate({
  status: SCHEDULED,          status: SCHEDULED,
  lockedBy: null              lockedBy: null
})                          })
    │                           │
    ▼                           ▼
MongoDB processes           Waits for A's lock
A's request first
    │
    ▼
Updates job:
  status: QUEUED
  lockedBy: worker_A
    │
    ▼
Returns job to A            Query runs, but
                            status is now QUEUED
                            → No match!
                            → Returns null to B

Result: Only Worker A gets the job!
```

### Additional Safeguards

1. **Lock Timeout**: If a worker crashes mid-execution, its lock expires after 5 minutes. The stale job recovery process then reclaims such jobs.

2. **Status Transitions**: Jobs move through statuses atomically:
   ```
   SCHEDULED → QUEUED → RUNNING → COMPLETED
                            └──→ FAILED (may retry → SCHEDULED)
   ```

3. **Worker ID Verification**: Before processing, workers verify they still own the lock.

---

## Usage

### Starting the Worker

```bash
# In the backend directory
node worker.js

# With custom configuration
POLL_INTERVAL=3000 CONCURRENCY=10 node worker.js
```

### Registering Custom Handlers

```javascript
const { Scheduler } = require('./scheduler');

const scheduler = new Scheduler({
  pollInterval: 5000,
  concurrency: 5
});

// Register a handler for 'sendEmail' task type
scheduler.registerHandler('sendEmail', async (payload, job) => {
  // payload = job.payload from the job document
  // job = full job document
  
  await sendEmail(payload.to, payload.subject, payload.body);
  
  return { sent: true, timestamp: new Date() };
});

// Start processing
await scheduler.start();
```

### Monitoring via Events

```javascript
scheduler.on('job:start', ({ jobId, taskType }) => {
  console.log(`Starting: ${jobId}`);
});

scheduler.on('job:complete', ({ jobId, result, duration }) => {
  console.log(`Completed: ${jobId} in ${duration}ms`);
});

scheduler.on('job:failed', ({ jobId, error }) => {
  console.error(`Failed: ${jobId} - ${error}`);
});
```

---

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `pollInterval` | 5000ms | How often to check for due jobs |
| `concurrency` | 5 | Max jobs to process in parallel |
| `lockTimeout` | 300000ms (5min) | Lock expiration time |
| `taskHandlers` | {} | Initial handlers to register |

---

## Job Lifecycle Flow

```
                    ┌──────────────┐
                    │   PENDING    │
                    └──────┬───────┘
                           │ (on create)
                           ▼
                    ┌──────────────┐
            ┌──────▶│  SCHEDULED   │◀──────────────┐
            │       └──────┬───────┘               │
            │              │ (scheduler picks)     │
            │              ▼                       │
            │       ┌──────────────┐               │
            │       │    QUEUED    │               │
            │       └──────┬───────┘               │
            │              │ (worker starts)       │
            │              ▼                       │
            │       ┌──────────────┐               │
            │       │   RUNNING    │               │
            │       └──────┬───────┘               │
            │              │                       │
            │    ┌─────────┴─────────┐             │
            │    ▼                   ▼             │
     ┌──────────────┐         ┌──────────────┐     │
     │  COMPLETED   │         │    FAILED    │     │
     └──────────────┘         └──────┬───────┘     │
            │                        │             │
            │                        ▼             │
            │                  Can retry?          │
            │                  ┌─────┴─────┐       │
            │                  │           │       │
            │                 Yes         No       │
            │                  │           │       │
            │                  └─────┬─────┘       │
            │                        │             │
            │                        └─────────────┘
            │                        (reschedule)
            │
            ▼
    (For RECURRING jobs)
            │
            └─────────────────────────────────────┐
                                                  │
                                                  ▼
                                          Calculate next run
                                                  │
                                                  ▼
                                           Update nextRunAt
                                                  │
                                                  └──▶ Back to SCHEDULED
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `scheduler/Scheduler.js` | Main orchestrator |
| `scheduler/JobPicker.js` | Atomic job claiming |
| `scheduler/JobExecutor.js` | Job execution & lifecycle |
| `scheduler/LockManager.js` | Distributed locking |
| `handlers/taskHandlers.js` | Example task handlers |
| `worker.js` | Standalone worker process |
