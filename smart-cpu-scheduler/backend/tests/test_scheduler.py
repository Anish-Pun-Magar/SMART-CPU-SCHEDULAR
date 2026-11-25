import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.scheduler import ALGORITHMS, SchedulingInputError, compare, schedule

client = TestClient(app)


def job(pid, arrival, burst, priority=1):
    return {"pid": pid, "arrival_time": arrival, "burst_time": burst, "priority": priority}


def gantt(result):
    return [(s["pid"], s["start"], s["end"]) for s in result["segments"]]


# ---------- FCFS ----------
def test_fcfs_metrics_and_idle_time():
    result = schedule([job("P1", 2, 3), job("P2", 4, 2)], "FCFS")
    assert gantt(result) == [("IDLE", 0, 2), ("P1", 2, 5), ("P2", 5, 7)]
    assert result["processes"][0] == {
        "pid": "P1", "arrival_time": 2, "burst_time": 3, "priority": 1,
        "completion_time": 5, "turnaround_time": 3, "waiting_time": 0, "response_time": 0,
    }
    assert result["cpu_utilization"] == pytest.approx(71.43, abs=0.01)
    assert result["context_switches"] == 1


def test_ties_keep_input_order():
    result = schedule([job("A", 0, 2), job("B", 0, 2)], "FCFS")
    assert [s["pid"] for s in result["segments"]] == ["A", "B"]
    assert result["context_switches"] == 1


# ---------- SJF ----------
def test_sjf_is_non_preemptive_and_shortest_ready_first():
    result = schedule([job("P1", 0, 6), job("P2", 1, 2), job("P3", 1, 1)], "SJF")
    assert [s["pid"] for s in result["segments"]] == ["P1", "P3", "P2"]
    assert result["processes"][1]["response_time"] == 6


# ---------- SRTF (preemptive SJF) ----------
def test_srtf_classic_textbook_example():
    items = [job("P1", 0, 8), job("P2", 1, 4), job("P3", 2, 9), job("P4", 3, 5)]
    result = schedule(items, "SRTF")
    assert gantt(result) == [
        ("P1", 0, 1), ("P2", 1, 5), ("P4", 5, 10), ("P1", 10, 17), ("P3", 17, 26),
    ]
    assert [p["waiting_time"] for p in result["processes"]] == [9, 0, 15, 2]
    assert result["averages"]["waiting_time"] == 6.5
    assert result["context_switches"] == 4


def test_srtf_beats_or_ties_sjf_on_average_waiting_time():
    items = [job("P1", 0, 8), job("P2", 1, 4), job("P3", 2, 9), job("P4", 3, 5)]
    assert (
        schedule(items, "SRTF")["averages"]["waiting_time"]
        <= schedule(items, "SJF")["averages"]["waiting_time"]
    )


def test_srtf_does_not_switch_on_equal_remaining_time():
    # P2 arrives when P1 has exactly 2 left (same as P2's burst) -> P1 keeps the CPU.
    result = schedule([job("P1", 0, 4), job("P2", 2, 2)], "SRTF")
    assert gantt(result) == [("P1", 0, 4), ("P2", 4, 6)]


def test_srtf_idle_gap():
    result = schedule([job("P1", 3, 2)], "SRTF")
    assert gantt(result) == [("IDLE", 0, 3), ("P1", 3, 5)]


# ---------- Priority ----------
def test_priority_non_preemptive_lower_number_wins():
    items = [job("P1", 0, 4, 3), job("P2", 1, 3, 1), job("P3", 2, 1, 2)]
    result = schedule(items, "PRIORITY")
    # P1 is already running and is never interrupted; then P2 (prio 1), then P3 (prio 2).
    assert gantt(result) == [("P1", 0, 4), ("P2", 4, 7), ("P3", 7, 8)]


def test_priority_ties_fall_back_to_arrival_order():
    result = schedule([job("A", 0, 1, 5), job("B", 0, 1, 2), job("C", 0, 1, 2)], "PRIORITY")
    assert [s["pid"] for s in result["segments"]] == ["B", "C", "A"]


def test_priority_defaults_when_omitted():
    items = [{"pid": "A", "arrival_time": 0, "burst_time": 2}]
    assert schedule(items, "PRIORITY")["processes"][0]["priority"] == 1


# ---------- Round Robin ----------
def test_round_robin_arrival_order_at_slice_boundary():
    result = schedule([job("P1", 0, 4), job("P2", 2, 2)], "RR", 2)
    assert gantt(result) == [("P1", 0, 2), ("P2", 2, 4), ("P1", 4, 6)]
    assert [p["completion_time"] for p in result["processes"]] == [6, 4]


def test_round_robin_requires_quantum():
    with pytest.raises(SchedulingInputError):
        schedule([job("P1", 0, 2)], "RR")
    with pytest.raises(SchedulingInputError):
        schedule([job("P1", 0, 2)], "RR", 0)


def test_round_robin_quantum_larger_than_bursts_behaves_like_fcfs():
    items = [job("P1", 0, 3), job("P2", 1, 2), job("P3", 2, 4)]
    assert gantt(schedule(items, "RR", 100)) == gantt(schedule(items, "FCFS"))


# ---------- Validation ----------
@pytest.mark.parametrize(
    "items",
    [
        [],
        [job("A", -1, 2)],
        [job("A", 0, 0)],
        [job("A", 0, 1), job("A", 0, 2)],
        [job("IDLE", 0, 2)],
        [job("A", 0, 2, -1)],
        [{"pid": "A", "arrival_time": 0.5, "burst_time": 2}],
        [{"pid": "A", "arrival_time": True, "burst_time": 2}],
    ],
)
def test_invalid_workload_rejected(items):
    with pytest.raises(SchedulingInputError):
        schedule(items, "FCFS")


def test_unknown_algorithm_rejected():
    with pytest.raises(SchedulingInputError):
        schedule([job("A", 0, 1)], "MAGIC")


# ---------- Compare & API ----------
def test_compare_runs_every_algorithm_on_same_workload():
    result = compare([job("P1", 0, 4), job("P2", 1, 2)], 2)
    assert set(result) == set(ALGORITHMS)
    assert all(len(data["processes"]) == 2 for data in result.values())


def test_every_algorithm_conserves_work():
    items = [job("P1", 0, 5, 2), job("P2", 1, 3, 1), job("P3", 8, 2, 3)]
    for name, data in compare(items, 2).items():
        busy = sum(s["end"] - s["start"] for s in data["segments"] if s["pid"] != "IDLE")
        assert busy == 10, name
        assert data["busy_time"] == 10, name


def test_api_health_and_algorithms():
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/algorithms").json()["algorithms"] == list(ALGORITHMS)


def test_api_rejects_bad_algorithm():
    response = client.post(
        "/api/schedule",
        json={"processes": [{"pid": "P1", "arrival_time": 0, "burst_time": 2}], "algorithm": "MAGIC"},
    )
    assert response.status_code == 422


def test_api_round_robin_without_quantum_is_422_not_500():
    response = client.post(
        "/api/schedule",
        json={"processes": [{"pid": "P1", "arrival_time": 0, "burst_time": 2}], "algorithm": "RR"},
    )
    assert response.status_code == 422


def test_api_srtf_and_priority_accept_requests():
    body = {"processes": [{"pid": "P1", "arrival_time": 0, "burst_time": 2, "priority": 3}]}
    for name in ("SRTF", "PRIORITY"):
        assert client.post("/api/schedule", json={**body, "algorithm": name}).status_code == 200


def test_api_comparison_contract():
    response = client.post(
        "/api/compare",
        json={"processes": [{"pid": "P1", "arrival_time": 0, "burst_time": 2}], "quantum": 1},
    )
    assert response.status_code == 200
    assert set(response.json()) == set(ALGORITHMS)
