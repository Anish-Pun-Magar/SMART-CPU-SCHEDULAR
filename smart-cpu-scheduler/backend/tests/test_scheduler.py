import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.scheduler import SchedulingInputError, compare, schedule

client = TestClient(app)


def test_fcfs_metrics_and_idle_time():
    result = schedule([{"pid": "P1", "arrival_time": 2, "burst_time": 3},
                       {"pid": "P2", "arrival_time": 4, "burst_time": 2}], "FCFS")
    assert result["segments"] == [{"pid": "IDLE", "start": 0, "end": 2},
                                  {"pid": "P1", "start": 2, "end": 5},
                                  {"pid": "P2", "start": 5, "end": 7}]
    assert result["processes"][0] == {"pid": "P1", "arrival_time": 2, "burst_time": 3,
        "completion_time": 5, "turnaround_time": 3, "waiting_time": 0, "response_time": 0}
    assert result["cpu_utilization"] == pytest.approx(71.43, abs=0.01)
    assert result["context_switches"] == 1


def test_sjf_is_non_preemptive_and_shortest_ready_first():
    items = [{"pid": "P1", "arrival_time": 0, "burst_time": 6},
             {"pid": "P2", "arrival_time": 1, "burst_time": 2},
             {"pid": "P3", "arrival_time": 1, "burst_time": 1}]
    result = schedule(items, "SJF")
    assert [s["pid"] for s in result["segments"]] == ["P1", "P3", "P2"]
    assert result["processes"][1]["response_time"] == 6


def test_round_robin_arrival_order_at_slice_boundary():
    items = [{"pid": "P1", "arrival_time": 0, "burst_time": 4},
             {"pid": "P2", "arrival_time": 2, "burst_time": 2}]
    result = schedule(items, "RR", 2)
    assert [(s["pid"], s["start"], s["end"]) for s in result["segments"]] == [
        ("P1", 0, 2), ("P2", 2, 4), ("P1", 4, 6)]
    assert [p["completion_time"] for p in result["processes"]] == [6, 4]


def test_ties_keep_input_order_and_zero_wait_for_first():
    items = [{"pid": "A", "arrival_time": 0, "burst_time": 2},
             {"pid": "B", "arrival_time": 0, "burst_time": 2}]
    result = schedule(items, "FCFS")
    assert [s["pid"] for s in result["segments"]] == ["A", "B"]
    assert result["context_switches"] == 1


@pytest.mark.parametrize("items", [[], [{"pid": "A", "arrival_time": -1, "burst_time": 2}],
                                    [{"pid": "A", "arrival_time": 0, "burst_time": 0}],
                                    [{"pid": "A", "arrival_time": 0, "burst_time": 1},
                                     {"pid": "A", "arrival_time": 0, "burst_time": 2}]])
def test_invalid_workload_rejected(items):
    with pytest.raises(SchedulingInputError):
        schedule(items, "FCFS")


def test_compare_uses_same_workload_and_quantum():
    items = [{"pid": "P1", "arrival_time": 0, "burst_time": 4},
             {"pid": "P2", "arrival_time": 1, "burst_time": 2}]
    result = compare(items, 2)
    assert set(result) == {"FCFS", "SJF", "RR"}
    assert all(len(data["processes"]) == 2 for data in result.values())


def test_api_rejects_bad_algorithm_and_serves_health():
    assert client.get("/api/health").json() == {"status": "ok"}
    response = client.post("/api/schedule", json={"processes": [{"pid": "P1", "arrival_time": 0,
                                "burst_time": 2}], "algorithm": "MAGIC"})
    assert response.status_code == 422


def test_api_comparison_contract():
    response = client.post("/api/compare", json={"processes": [{"pid": "P1", "arrival_time": 0,
                                "burst_time": 2}], "quantum": 1})
    assert response.status_code == 200
    assert set(response.json()) == {"FCFS", "SJF", "RR"}
