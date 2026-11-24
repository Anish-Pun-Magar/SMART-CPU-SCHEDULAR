# Schedulab — Smart CPU Scheduler Simulator

A small full-stack learning project for comparing **FCFS**, **non-preemptive SJF**, and **Round Robin** CPU scheduling. It uses a React + Vite frontend and a Python + FastAPI backend. The algorithms are implemented as short, readable functions, with unit tests for the edge cases students tend to miss.

## What it includes

- Editable process IDs, arrival times, and positive burst times, with three example workloads.
- FCFS, non-preemptive Shortest Job First, and Round Robin with a configurable positive integer quantum.
- Per-process completion (CT), turnaround (TAT), waiting (WT), and response (RT) times.
- Average CT/TAT/WT/RT, throughput, CPU utilization, context switches, and an execution timeline with time markers.
- One-click comparison that runs the identical process list through all three policies.
- Input checks in both the browser and API; clear errors for duplicate IDs, invalid values, unsupported algorithms, and oversized workloads.
- Responsive layout for desktop and mobile.

## Requirements

- Python 3.10 or newer (FastAPI uses Pydantic 2).
- Node.js 18 or newer and npm.

## Run locally

Open two terminals from the project folder.

**Terminal 1 — API**

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux instead: source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API listens on `http://localhost:8000`. Its interactive API reference is at `http://localhost:8000/docs`.

**Terminal 2 — web app**

```bash
cd frontend
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`). Leave both processes running while using the app.

## Run the backend tests

From `backend/`, activate the virtual environment, then run:

```bash
python -m pytest -q
```

The tests cover calculations, CPU idle time, equal-arrival ordering, non-preemptive SJF, Round Robin boundary ordering, invalid inputs, comparison, and the HTTP API contract.

## Architecture

```text
frontend/src/main.jsx     UI, input checks, API calls, Gantt chart, metrics
frontend/src/style.css    Responsive visual design
backend/app/main.py       FastAPI request/response models and routes
backend/app/scheduler.py  Validation, scheduling policies, and metrics
backend/tests/            Unit tests and API tests
```

The frontend owns editable state and presentation. It sends JSON to the API, which validates each request and invokes the pure scheduling functions. The API returns a shared result shape for all policies, so the same timeline and metric components work for each algorithm.

## API contract

### `GET /api/health`

Response: `{"status":"ok"}`.

### `POST /api/schedule`

Request:

```json
{
  "processes": [
    {"pid": "P1", "arrival_time": 0, "burst_time": 5},
    {"pid": "P2", "arrival_time": 1, "burst_time": 3}
  ],
  "algorithm": "RR",
  "quantum": 2
}
```

`algorithm` is `FCFS`, `SJF`, or `RR`; `quantum` is required and positive for RR. For FCFS/SJF, quantum is ignored.

### `POST /api/compare`

Request: `{"processes":[...],"quantum":2}`. Returns an object keyed by `FCFS`, `SJF`, and `RR`; every result uses the exact same workload.

### Result fields

- `processes`: source values plus `completion_time`, `turnaround_time`, `waiting_time`, and `response_time` for each process.
- `segments`: ordered `{pid, start, end}` CPU slices. `pid` is `IDLE` when no process has arrived.
- `averages`: average CT, TAT, WT, and RT (rounded to 2 decimal places).
- `total_time`: end of the final segment; `busy_time`: sum of burst times.
- `throughput`: completed processes per elapsed time unit, rounded to 4 decimals.
- `cpu_utilization`: busy time / total time × 100, rounded to 2 decimals.
- `context_switches`: transitions from one process directly to a different process. Initial dispatch, idle-to-process dispatch, and a process resuming after an idle interval are not counted.

Invalid API requests return HTTP 422 with a human-readable `detail` message. The workload limit is 50 processes; IDs must be unique, arrival/burst/quantum values must be integers, arrivals must be nonnegative, and bursts/quantum must be positive.

## Algorithm notes

- **FCFS** is non-preemptive. Ready processes run in arrival order; input order breaks equal-arrival ties. A future arrival creates an explicit idle interval.
- **SJF** is non-preemptive. Each time the CPU becomes free, it chooses the ready process with the shortest burst. Arrival time and then input order break ties. A running job is never interrupted by a shorter arrival.
- **Round Robin** gives the head of the ready queue at most one quantum. Arrivals during a slice join the queue before the unfinished process is put back at the tail. Arrivals exactly at the slice end are also enqueued before that requeue. The input order breaks simultaneous-arrival ties.
- **Metrics:** CT is the finish time; TAT = CT − arrival; WT = TAT − burst; RT = first CPU start − arrival. Throughput divides process count by elapsed time from time zero, so an initial idle interval is included in utilization and throughput.

## Example test

For P1 `(arrival=0, burst=4)` and P2 `(arrival=2, burst=2)`, RR with quantum 2 produces P1 `[0,2)`, P2 `[2,4)`, P1 `[4,6)`. Completion times are P1=6 and P2=4. This demonstrates the boundary rule: P2 joins the ready queue before P1 is requeued.

## Suggested four-person group division

1. **Scheduling engine:** implement or explain FCFS, SJF, and RR; own `scheduler.py` and algorithm tests.
2. **API and validation:** own request models, routes, validation behavior, and API tests.
3. **Frontend interaction:** own workload editor, presets, algorithm selection, and API error states.
4. **Visualization and integration:** own Gantt chart, metrics/comparison presentation, responsive checks, and README/demo coordination.

Agree on the request and response fields first, then integrate through small commits. Each member should be able to explain their part and the edge cases they tested.

## Scope choices

This simulator models one CPU and integer time units. It does not model I/O bursts, priorities, multiprocessors, or operating-system overhead. Context switches are counted as direct process-to-process transitions and are not assigned extra time. These limits keep the project achievable while still demonstrating the core scheduling tradeoffs.
