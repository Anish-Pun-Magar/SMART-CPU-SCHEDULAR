"""Clear, deterministic implementations of five classic CPU schedulers.

Supported algorithms
--------------------
FCFS      First Come, First Served (non-preemptive)
SJF       Shortest Job First        (non-preemptive)
SRTF      Shortest Remaining Time First (preemptive SJF)
PRIORITY  Priority scheduling       (non-preemptive, lower number = higher priority)
RR        Round Robin               (preemptive, fixed time quantum)
"""

from collections import deque
from typing import Any

ALGORITHMS = ("FCFS", "SJF", "SRTF", "PRIORITY", "RR")
MAX_PROCESSES = 50
DEFAULT_PRIORITY = 1


class SchedulingInputError(ValueError):
    """Raised when a workload cannot be scheduled safely."""


def _is_int(value: Any) -> bool:
    """True for real integers (bool is a subclass of int in Python, so exclude it)."""
    return isinstance(value, int) and not isinstance(value, bool)


def validate_workload(
    processes: list[dict[str, Any]], quantum: int | None = None
) -> None:
    if not isinstance(processes, list) or not processes:
        raise SchedulingInputError("Provide at least one process.")
    if len(processes) > MAX_PROCESSES:
        raise SchedulingInputError(
            f"A workload can contain at most {MAX_PROCESSES} processes."
        )
    seen: set[str] = set()
    for index, process in enumerate(processes):
        if not isinstance(process, dict):
            raise SchedulingInputError(f"Process {index + 1} must be an object.")
        pid = process.get("pid")
        if not isinstance(pid, str) or not pid.strip() or len(pid.strip()) > 20:
            raise SchedulingInputError(
                f"Process {index + 1} needs a 1–20 character ID."
            )
        pid = pid.strip()
        if pid == "IDLE":
            raise SchedulingInputError("'IDLE' is reserved and cannot be a process ID.")
        if pid in seen:
            raise SchedulingInputError(f"Process ID '{pid}' is duplicated.")
        seen.add(pid)
        for field in ("arrival_time", "burst_time"):
            value = process.get(field)
            if not _is_int(value):
                raise SchedulingInputError(
                    f"{pid}: {field.replace('_', ' ')} must be an integer."
                )
            if field == "arrival_time" and value < 0:
                raise SchedulingInputError(f"{pid}: arrival time cannot be negative.")
            if field == "burst_time" and value <= 0:
                raise SchedulingInputError(
                    f"{pid}: burst time must be greater than zero."
                )
        # Priority is optional; only the PRIORITY algorithm uses it.
        priority = process.get("priority", DEFAULT_PRIORITY)
        if not _is_int(priority) or priority < 0:
            raise SchedulingInputError(
                f"{pid}: priority must be an integer of 0 or higher."
            )
    if quantum is not None and (not _is_int(quantum) or quantum <= 0):
        raise SchedulingInputError("Round Robin quantum must be a positive integer.")


def _pack(
    segments: list[dict[str, Any]],
    stats: dict[str, dict[str, int]],
    processes: list[dict[str, Any]],
) -> dict[str, Any]:
    rows = []
    for process in processes:
        pid = process["pid"].strip()
        values = stats[pid]
        ct = values["completion_time"]
        tat = ct - process["arrival_time"]
        wt = tat - process["burst_time"]
        rows.append(
            {
                "pid": pid,
                "arrival_time": process["arrival_time"],
                "burst_time": process["burst_time"],
                "priority": process.get("priority", DEFAULT_PRIORITY),
                "completion_time": ct,
                "turnaround_time": tat,
                "waiting_time": wt,
                "response_time": values["first_start"] - process["arrival_time"],
            }
        )
    total_time = max((s["end"] for s in segments), default=0)
    busy_time = sum(p["burst_time"] for p in processes)
    # A context switch = the CPU goes straight from one process to a different one.
    switches = sum(
        1
        for i in range(1, len(segments))
        if segments[i - 1]["pid"] not in ("IDLE", segments[i]["pid"])
        and segments[i]["pid"] != "IDLE"
    )
    count = len(rows)

    def avg(key: str) -> float:
        return round(sum(r[key] for r in rows) / count, 2)

    return {
        "processes": rows,
        "segments": segments,
        "averages": {
            "completion_time": avg("completion_time"),
            "turnaround_time": avg("turnaround_time"),
            "waiting_time": avg("waiting_time"),
            "response_time": avg("response_time"),
        },
        "total_time": total_time,
        "busy_time": busy_time,
        "throughput": round(count / total_time, 4) if total_time else 0,
        "cpu_utilization": round(busy_time / total_time * 100, 2) if total_time else 0,
        "context_switches": switches,
    }


def schedule(
    processes: list[dict[str, Any]], algorithm: str, quantum: int | None = None
) -> dict[str, Any]:
    if algorithm not in ALGORITHMS:
        raise SchedulingInputError(
            "Algorithm must be one of: " + ", ".join(ALGORITHMS) + "."
        )
    if algorithm == "RR" and quantum is None:
        raise SchedulingInputError("Round Robin needs a time quantum.")
    validate_workload(processes, quantum if algorithm == "RR" else None)

    # Work on copies, sorted by arrival; input order resolves equal arrival times.
    jobs = [
        dict(
            p,
            pid=p["pid"].strip(),
            index=i,
            priority=p.get("priority", DEFAULT_PRIORITY),
        )
        for i, p in enumerate(processes)
    ]
    jobs.sort(key=lambda p: (p["arrival_time"], p["index"]))
    remaining = {p["pid"]: p["burst_time"] for p in jobs}
    stats = {p["pid"]: {"first_start": -1, "completion_time": 0} for p in jobs}
    segments: list[dict[str, Any]] = []

    def run(pid: str, start: int, duration: int) -> int:
        """Give `pid` the CPU for `duration` units starting at `start`."""
        end = start + duration
        if stats[pid]["first_start"] < 0:
            stats[pid]["first_start"] = start
        if segments and segments[-1]["pid"] == pid and segments[-1]["end"] == start:
            segments[-1]["end"] = end  # merge back-to-back slices of one process
        else:
            segments.append({"pid": pid, "start": start, "end": end})
        remaining[pid] -= duration
        if remaining[pid] == 0:
            stats[pid]["completion_time"] = end
        return end

    def idle_until(time: int, next_time: int) -> int:
        if next_time > time:
            segments.append({"pid": "IDLE", "start": time, "end": next_time})
        return next_time

    time = 0

    if algorithm in {"FCFS", "SJF", "PRIORITY"}:
        # Non-preemptive: pick one ready process and run it to completion.
        keys = {
            "FCFS": lambda p: (p["arrival_time"], p["index"]),
            "SJF": lambda p: (p["burst_time"], p["arrival_time"], p["index"]),
            "PRIORITY": lambda p: (p["priority"], p["arrival_time"], p["index"]),
        }
        pending = jobs.copy()
        while pending:
            ready = [p for p in pending if p["arrival_time"] <= time]
            if not ready:
                time = idle_until(time, pending[0]["arrival_time"])
                ready = [p for p in pending if p["arrival_time"] <= time]
            chosen = min(ready, key=keys[algorithm])
            time = run(chosen["pid"], time, chosen["burst_time"])
            pending.remove(chosen)

    elif algorithm == "SRTF":
        # Preemptive: whenever a process arrives, re-pick the shortest remaining job.
        last_pid = None
        while any(r > 0 for r in remaining.values()):
            unfinished = [p for p in jobs if remaining[p["pid"]] > 0]
            ready = [p for p in unfinished if p["arrival_time"] <= time]
            if not ready:
                time = idle_until(time, min(p["arrival_time"] for p in unfinished))
                continue
            # Tie-break: keep running the current process, then earliest arrival.
            chosen = min(
                ready,
                key=lambda p: (
                    remaining[p["pid"]],
                    0 if p["pid"] == last_pid else 1,
                    p["arrival_time"],
                    p["index"],
                ),
            )
            future = [p["arrival_time"] for p in unfinished if p["arrival_time"] > time]
            duration = remaining[chosen["pid"]]
            if future:
                duration = min(duration, min(future) - time)
            time = run(chosen["pid"], time, duration)
            last_pid = chosen["pid"]

    else:  # Round Robin
        queue: deque[dict[str, Any]] = deque()
        next_index = 0
        while next_index < len(jobs) or queue:
            if not queue:
                time = idle_until(time, jobs[next_index]["arrival_time"])
                while (
                    next_index < len(jobs) and jobs[next_index]["arrival_time"] <= time
                ):
                    queue.append(jobs[next_index])
                    next_index += 1
            current = queue.popleft()
            duration = min(quantum, remaining[current["pid"]])
            time = run(current["pid"], time, duration)
            # Arrivals during (or exactly at the end of) this slice join the queue
            # BEFORE the preempted process goes back to the tail.
            while next_index < len(jobs) and jobs[next_index]["arrival_time"] <= time:
                queue.append(jobs[next_index])
                next_index += 1
            if remaining[current["pid"]] > 0:
                queue.append(current)

    return _pack(segments, stats, processes)


def compare(processes: list[dict[str, Any]], quantum: int) -> dict[str, Any]:
    """Run the identical workload through every algorithm."""
    validate_workload(processes, quantum)
    return {
        name: schedule(processes, name, quantum if name == "RR" else None)
        for name in ALGORITHMS
    }
