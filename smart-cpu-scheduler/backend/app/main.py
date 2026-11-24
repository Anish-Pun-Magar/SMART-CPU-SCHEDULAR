"""FastAPI routes for the Smart CPU Scheduler Simulator."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .scheduler import SchedulingInputError, compare, schedule

app = FastAPI(title="Smart CPU Scheduler Simulator", version="1.0.0",
              description="Simulate FCFS, non-preemptive SJF, and Round Robin CPU scheduling.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


class ProcessInput(BaseModel):
    pid: str = Field(min_length=1, max_length=20, strict=True)
    arrival_time: int = Field(ge=0, strict=True)
    burst_time: int = Field(gt=0, strict=True)


class ScheduleRequest(BaseModel):
    processes: list[ProcessInput] = Field(min_length=1, max_length=50)
    algorithm: str = "FCFS"
    quantum: int | None = None


class CompareRequest(BaseModel):
    processes: list[ProcessInput] = Field(min_length=1, max_length=50)
    quantum: int = Field(default=2, gt=0, strict=True)


def records(items: list[ProcessInput]) -> list[dict]:
    return [p.model_dump() for p in items]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/schedule")
def run_schedule(request: ScheduleRequest) -> dict:
    try:
        return schedule(records(request.processes), request.algorithm.upper(), request.quantum)
    except SchedulingInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/compare")
def run_comparison(request: CompareRequest) -> dict:
    try:
        return compare(records(request.processes), request.quantum)
    except SchedulingInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
