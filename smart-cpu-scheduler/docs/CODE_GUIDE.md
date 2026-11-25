# Code guide, demo script and Q&A

## 1. Data flow
```
React UI  --POST JSON-->  FastAPI (main.py)  -->  scheduler.py  -->  JSON  -->  Gantt chart + metrics
```

## 2. scheduler.py in five steps
1. `validate_workload()` rejects bad input (empty list, duplicates, negative arrival, zero burst, `IDLE` as ID …).
2. `schedule()` sorts processes by arrival (input order breaks ties) and keeps `remaining` time per process plus a list of `segments` (the Gantt data).
3. The helper `run(pid, start, duration)` gives the CPU to a process, records a segment, merges back-to-back slices, and stores the completion time when `remaining` hits 0.
4. One branch per policy:
   - **FCFS / SJF / PRIORITY**: build the list of *ready* processes, choose one with `min(key)`, run it to completion. If nothing is ready, add an `IDLE` segment and jump to the next arrival. Only the sort key differs: arrival / burst / priority.
   - **SRTF**: pick the ready process with the least remaining time, but only run until the *next arrival*, then decide again. That is what makes it preemptive.
   - **RR**: a `deque` is the ready queue; run `min(quantum, remaining)`; enqueue new arrivals, *then* put the unfinished process at the back.
5. `_pack()` turns segments into CT, TAT, WT, RT, averages, utilization, throughput and context switches.

## 3. Verification
The scheduler was cross-checked against an independent tick-by-tick simulator on 3,000 random workloads for all five algorithms (completion times identical). Hand-checked textbook example: SRTF on (0,8) (1,4) (2,9) (3,5) gives average waiting time **6.5**.

## 4. Live demo script (about 3 minutes)
1. Preset **"Short & long jobs"** → run **FCFS**: P1 (8 units) blocks the short jobs → average waiting 5.75.
2. Run **SJF**: 5.5. Run **SRTF**: **2.25**. Press **Replay** and narrate the preemption when P2 and P3 arrive.
3. Run **Round Robin** (quantum 2): response time drops to 1.75, but there are 7 context switches.
4. Click **Compare all**, switch the tabs: waiting → SRTF wins; response → SRTF/RR; switches → FCFS/SJF/Priority.
5. Preset **"Textbook SRTF mix"** → Compare: FCFS 8.75, SJF 7.75, SRTF 6.5, Priority 7.75, RR 12.75 waiting. Round Robin has the worst average wait but the best response (2.0) and 12 context switches.

## 5. Likely questions
- **Why is SRTF better on waiting time but not always practical?** It needs to know burst times in advance and can starve long jobs.
- **Why is CPU utilization the same for every algorithm?** All of them finish the same work in the same total time; only the order changes.
- **What is a context switch here?** The CPU going straight from one process to a different one. Switch time is modelled as zero.
- **Why does Round Robin wait longer than FCFS?** Every process is repeatedly interrupted, so long jobs finish later; the benefit is fast first response.
- **What is starvation and how would you fix it in Priority?** Low-priority jobs may never run; *aging* (slowly raising priority while waiting) fixes it. Not implemented.
- **What would you add next?** I/O bursts, multi-level feedback queue, multiple CPUs, aging.
