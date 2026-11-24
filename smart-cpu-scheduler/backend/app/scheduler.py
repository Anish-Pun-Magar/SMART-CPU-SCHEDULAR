"""Clear, deterministic implementations of three classic CPU schedulers."""

from collections import deque
from typing import Any


class SchedulingInputError(ValueError):
    """Raised when a workload cannot be scheduled safely."""


def validate_workload(
    processes: list[dict[str, Any]], quantum: int | None = None
) -> None:
    if not isinstance(processes, list) or not processes:
        raise SchedulingInputError("Provide at least one process.")
    if len(processes) > 50:
        raise SchedulingInputError("A workload can contain at most 50 processes.")
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
        if pid in seen:
            raise SchedulingInputError(f"Process ID '{pid}' is duplicated.")
        seen.add(pid)
        for field in ("arrival_time", "burst_time"):
            value = process.get(field)
            if isinstance(value, bool) or not isinstance(value, int):
                raise SchedulingInputError(
                    f"{pid}: {field.replace('_', ' ')} must be an integer."
                )
            if field == "arrival_time" and value < 0:
                raise SchedulingInputError(f"{pid}: arrival time cannot be negative.")
            if field == "burst_time" and value <= 0:
                raise SchedulingInputError(
                    f"{pid}: burst time must be greater than zero."
                )
    if quantum is not None and (
        isinstance(quantum, bool) or not isinstance(quantum, int) or quantum <= 0
    ):
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
                "completion_time": ct,
                "turnaround_time": tat,
                "waiting_time": wt,
                "response_time": values["first_start"] - process["arrival_time"],
            }
        )
    total_time = max((s["end"] for s in segments), default=0)
    busy_time = sum(p["burst_time"] for p in processes)
    switches = sum(
        1
        for i in range(1, len(segments))
        if segments[i - 1]["pid"] not in ("IDLE", segments[i]["pid"])
        and segments[i]["pid"] != "IDLE"
    )
    count = len(rows)
    return {
        "processes": rows,
        "segments": segments,
        "averages": {
            "completion_time": round(
                sum(r["completion_time"] for r in rows) / count, 2
            ),
            "turnaround_time": round(
                sum(r["turnaround_time"] for r in rows) / count, 2
            ),
            "waiting_time": round(sum(r["waiting_time"] for r in rows) / count, 2),
            "response_time": round(sum(r["response_time"] for r in rows) / count, 2),
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
    validate_workload(processes, quantum if algorithm == "RR" else None)
    if algorithm not in {"FCFS", "SJF", "RR"}:
        raise SchedulingInputError("Algorithm must be FCFS, SJF, or RR.")
    # Copy and sort by arrival, with input order resolving equal arrival times.
    jobs = [dict(p, pid=p["pid"].strip(), index=i) for i, p in enumerate(processes)]
    jobs.sort(key=lambda p: (p["arrival_time"], p["index"]))
    remaining = {p["pid"]: p["burst_time"] for p in jobs}
    stats = {p["pid"]: {"first_start": -1, "completion_time": 0} for p in jobs}
    segments: list[dict[str, Any]] = []

    def run(pid: str, start: int, duration: int) -> int:
        end = start + duration
        if stats[pid]["first_start"] < 0:
            stats[pid]["first_start"] = start
        if segments and segments[-1]["pid"] == pid and segments[-1]["end"] == start:
            segments[-1]["end"] = end
        else:
            segments.append({"pid": pid, "start": start, "end": end})
        remaining[pid] -= duration
        if remaining[pid] == 0:
            stats[pid]["completion_time"] = end
        return end

    time = 0
    if algorithm in {"FCFS", "SJF"}:
        pending = jobs.copy()
        while pending:
            ready = [p for p in pending if p["arrival_time"] <= time]
            if not ready:
                next_time = pending[0]["arrival_time"]
                if next_time > time:
                    segments.append({"pid": "IDLE", "start": time, "end": next_time})
                time = next_time
                ready = [p for p in pending if p["arrival_time"] <= time]
            chosen = min(
                ready,
                key=(
                    (lambda p: (p["burst_time"], p["arrival_time"], p["index"]))
                    if algorithm == "SJF"
                    else (lambda p: (p["arrival_time"], p["index"]))
                ),
            )
            time = run(chosen["pid"], time, chosen["burst_time"])
            pending.remove(chosen)
    else:
        queue: deque[dict[str, Any]] = deque()
        next_index = 0
        while next_index < len(jobs) or queue:
            if not queue:
                arrival = jobs[next_index]["arrival_time"]
                if time < arrival:
                    segments.append({"pid": "IDLE", "start": time, "end": arrival})
                    time = arrival
                while (
                    next_index < len(jobs) and jobs[next_index]["arrival_time"] <= time
                ):
                    queue.append(jobs[next_index])
                    next_index += 1
            current = queue.popleft()
            duration = min(quantum, remaining[current["pid"]])
            start = time
            time = run(current["pid"], time, duration)
            # New arrivals during this slice enter before the preempted process is requeued.
            while next_index < len(jobs) and jobs[next_index]["arrival_time"] <= time:
                queue.append(jobs[next_index])
                next_index += 1
            if remaining[current["pid"]] > 0:
                queue.append(current)
    return _pack(segments, stats, processes)


def compare(processes: list[dict[str, Any]], quantum: int) -> dict[str, Any]:
    validate_workload(processes, quantum)
    return {
        name: schedule(processes, name, quantum if name == "RR" else None)
        for name in ("FCFS", "SJF", "RR")
    }
