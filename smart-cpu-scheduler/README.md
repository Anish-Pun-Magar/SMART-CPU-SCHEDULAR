# Schedulab — Smart CPU Scheduler Simulator (v2.0)

An interactive learning lab for comparing **five CPU scheduling algorithms**:

| Key | Algorithm | Type |
|---|---|---|
| `FCFS` | First Come, First Served | non-preemptive |
| `SJF` | Shortest Job First | non-preemptive |
| `SRTF` | Shortest Remaining Time First (preemptive SJF) | preemptive |
| `PRIORITY` | Priority scheduling (lower number = higher priority) | non-preemptive |
| `RR` | Round Robin with a configurable quantum | preemptive |

React + Vite frontend, Python + FastAPI backend. The algorithms are short, readable functions with unit tests for the edge cases students tend to miss.

## What's new in v2.0
- **SRTF** and **Priority** scheduling (new `priority` column per process).
- **Timeline replay**: play, pause and scrub through the Gantt chart one time unit at a time, with a live "running P2 at t = 5" readout.
- **Smarter Compare all**: bar chart per metric (waiting, turnaround, response, context switches) with the **best** algorithm highlighted, plus a mini Gantt chart for every algorithm.
- **Bug fixes**: Round Robin without a quantum now returns a clear 422 error instead of a server crash; typing in a process ID no longer loses keyboard focus; the reserved ID `IDLE` is rejected; API validation messages are readable.
- **Config**: API URL (`VITE_API_URL`) and CORS origins (`CORS_ORIGINS`) are configurable; added `vite.config.js`.
- New preset **"Textbook SRTF mix"** and a much larger test suite.

## Requirements
- Python 3.10+
- Node.js 18+ and npm

## Run locally
Open two terminals in the project folder (the one containing `backend/` and `frontend/`).

**Terminal 1 — API**
```
cd backend
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# macOS/Linux:         source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```
API: `http://localhost:8000` · interactive docs: `http://localhost:8000/docs`

**Terminal 2 — web app**
```
cd frontend
npm install
npm run dev
```
Open the URL Vite prints (usually `http://localhost:5173`).

Optional: copy `frontend/.env.example` to `frontend/.env` to change the API address. To allow another website origin on the backend, set `CORS_ORIGINS="https://my-site.com,http://localhost:5173"`.

## Run the backend tests
```
cd backend
python -m pytest -q
```
Covers calculations, idle time, tie-breaking, SJF/SRTF/Priority behaviour, Round Robin boundary ordering, validation, comparison, and the HTTP contract.

## Architecture
```
frontend/src/main.jsx     UI, input checks, API calls, Gantt chart + replay, comparison charts
frontend/src/style.css    Responsive visual design
backend/app/main.py       FastAPI request/response models and routes
backend/app/scheduler.py  Validation, the five scheduling policies, and metrics
backend/tests/            Unit tests and API tests
docs/CODE_GUIDE.md        Code walkthrough, demo script, and likely Q&A
```

## API
- `GET /api/health` → `{"status":"ok"}`
- `GET /api/algorithms` → `{"algorithms":["FCFS","SJF","SRTF","PRIORITY","RR"]}`
- `POST /api/schedule`
```
{
  "processes": [
    {"pid": "P1", "arrival_time": 0, "burst_time": 5, "priority": 2},
    {"pid": "P2", "arrival_time": 1, "burst_time": 3, "priority": 1}
  ],
  "algorithm": "SRTF",
  "quantum": 2
}
```
`priority` is optional (default 1; lower number = more important). `quantum` is required for `RR` and ignored otherwise.
- `POST /api/compare` — `{"processes":[...],"quantum":2}` returns an object keyed by all five algorithm names, each computed on the identical workload.

**Result fields:** `processes` (CT, TAT, WT, RT per process), `segments` (`{pid,start,end}`; `IDLE` when no process is ready), `averages`, `total_time`, `busy_time`, `throughput`, `cpu_utilization`, `context_switches` (direct switches from one process to a different one; initial dispatch and resuming after idle are not counted).

Invalid requests return HTTP 422 with a readable `detail`. Limits: 50 processes, unique IDs (not `IDLE`), integer arrival ≥ 0, burst > 0, priority ≥ 0, quantum > 0.

## Algorithm notes
- **FCFS** runs ready processes in arrival order; a future arrival creates an explicit idle interval.
- **SJF** picks the ready process with the shortest burst when the CPU frees up; a running job is never interrupted.
- **SRTF** re-decides at every arrival: the process with the least remaining time runs. Ties keep the current process (no pointless switch), then earliest arrival.
- **Priority** picks the ready process with the lowest priority number; non-preemptive. Ties: arrival, then input order. Can starve low-priority work (aging is not modelled).
- **Round Robin** gives the head of the queue up to one quantum. Arrivals during or exactly at the end of a slice join the queue *before* the unfinished process is requeued.
- **Metrics:** CT = finish time; TAT = CT − arrival; WT = TAT − burst; RT = first CPU start − arrival. Throughput = processes ÷ total time.

## Scope
One CPU, integer time units, no I/O bursts, no multiprocessor support, and context switches cost no extra time.

## Team split (suggested)
1. **Scheduling engine** — `scheduler.py` and algorithm tests.
2. **API & validation** — `main.py`, request models, API tests.
3. **Frontend interaction** — workload editor, presets, error states.
4. **Visualization** — Gantt chart, replay, comparison charts, README/demo.
