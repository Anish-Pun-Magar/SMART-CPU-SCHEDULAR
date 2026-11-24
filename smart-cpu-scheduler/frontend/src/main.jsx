import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Cpu,
  GitCompareArrows,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import "./style.css";

const presets = {
  "Balanced mix": [
    { pid: "P1", arrival_time: 0, burst_time: 5 },
    { pid: "P2", arrival_time: 1, burst_time: 3 },
    { pid: "P3", arrival_time: 2, burst_time: 7 },
    { pid: "P4", arrival_time: 4, burst_time: 2 },
  ],
  "Staggered arrivals": [
    { pid: "P1", arrival_time: 0, burst_time: 4 },
    { pid: "P2", arrival_time: 5, burst_time: 3 },
    { pid: "P3", arrival_time: 9, burst_time: 2 },
  ],
  "Short & long jobs": [
    { pid: "P1", arrival_time: 0, burst_time: 8 },
    { pid: "P2", arrival_time: 1, burst_time: 2 },
    { pid: "P3", arrival_time: 2, burst_time: 1 },
    { pid: "P4", arrival_time: 3, burst_time: 4 },
  ],
};
const colors = [
  "#6558d3",
  "#e88753",
  "#33a88a",
  "#d05a83",
  "#4e87cc",
  "#b38a38",
  "#8661ae",
  "#3c9db1",
];
const fmt = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(2));

function App() {
  const [processes, setProcesses] = useState(presets["Balanced mix"]);
  const [algo, setAlgo] = useState("FCFS");
  const [quantum, setQuantum] = useState(2);
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("Balanced mix");
  const update = (i, key, value) => {
    setProcesses((rows) =>
      rows.map((p, n) =>
        n === i
          ? {
              ...p,
              [key]: key === "pid" ? value : value === "" ? "" : Number(value),
            }
          : p,
      ),
    );
    setPreset("Custom");
    setResult(null);
    setComparison(null);
  };
  const loadPreset = (name) => {
    setPreset(name);
    setProcesses(presets[name].map((p) => ({ ...p })));
    setResult(null);
    setComparison(null);
    setError("");
  };
  const validate = () => {
    if (!processes.length) return "Add at least one process.";
    if (processes.length > 50)
      return "A workload can contain at most 50 processes.";
    const ids = processes.map((p) => p.pid.trim());
    if (ids.some((x) => !x)) return "Every process needs an ID.";
    if (new Set(ids).size !== ids.length) return "Process IDs must be unique.";
    if (
      processes.some(
        (p) => !Number.isInteger(p.arrival_time) || p.arrival_time < 0,
      )
    )
      return "Arrival times must be whole numbers from 0 or higher.";
    if (
      processes.some(
        (p) => !Number.isInteger(p.burst_time) || p.burst_time <= 0,
      )
    )
      return "Burst times must be positive whole numbers.";
    if (!Number.isInteger(Number(quantum)) || Number(quantum) <= 0)
      return "Round Robin quantum must be a positive whole number.";
    return "";
  };
  const run = async (compareAll) => {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `http://localhost:8000/api/${compareAll ? "compare" : "schedule"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            compareAll
              ? { processes, quantum: Number(quantum) }
              : { processes, algorithm: algo, quantum: Number(quantum) },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Please check your inputs and try again.",
        );
      if (compareAll) {
        setComparison(data);
        setResult(null);
      } else {
        setResult(data);
        setComparison(null);
      }
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "Could not reach the API. Start the backend at localhost:8000."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  };
  const maxTime = result?.total_time || 1;
  const add = () => {
    if (processes.length >= 50) {
      setError("A workload can contain at most 50 processes.");
      return;
    }
    let n = 1;
    while (processes.some((p) => p.pid === `P${n}`)) n++;
    setProcesses([
      ...processes,
      { pid: `P${n}`, arrival_time: 0, burst_time: 4 },
    ]);
    setPreset("Custom");
    setResult(null);
    setComparison(null);
    setError("");
  };
  const remove = (i) => {
    setProcesses(processes.filter((_, n) => n !== i));
    setPreset("Custom");
    setResult(null);
    setComparison(null);
  };
  const clear = () => {
    setProcesses([]);
    setResult(null);
    setComparison(null);
    setPreset("Custom");
    setError("");
  };
  const colorsById = useMemo(
    () =>
      Object.fromEntries(
        processes.map((p, i) => [p.pid.trim(), colors[i % colors.length]]),
      ),
    [processes],
  );
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brandmark">
            <Cpu size={19} />
          </span>
          <span>
            schedu<span className="brand-accent">lab</span>
          </span>
        </a>
        <div className="topmeta">
          <span className="live-dot" /> CPU SCHEDULING LAB{" "}
          <span className="version">v1.0</span>
        </div>
        <a
          className="github"
          href="https://en.wikipedia.org/wiki/Scheduling_(computing)"
          target="_blank"
          rel="noreferrer"
        >
          How it works <ArrowRight size={14} />
        </a>
      </header>
      <section className="hero">
        <div className="eyebrow">
          <span className="eyebrow-icon">
            <Activity size={14} />
          </span>{" "}
          OPERATING SYSTEMS · INTERACTIVE LAB
        </div>
        <h1>
          Make every CPU
          <br />
          <span>cycle count.</span>
        </h1>
        <p>
          Explore how scheduling decisions shape performance.
          <br className="desktop-break" /> Build a workload, choose an
          algorithm, and see what happens.
        </p>
        <div className="hero-tags">
          <span>
            <i className="tag-dot violet" /> FCFS
          </span>
          <span>
            <i className="tag-dot orange" /> Non-preemptive SJF
          </span>
          <span>
            <i className="tag-dot green" /> Round Robin
          </span>
        </div>
      </section>
      <section className="workspace">
        <aside className="card input-card">
          <div className="card-heading">
            <div>
              <div className="section-kicker">01 / SETUP</div>
              <h2>Your workload</h2>
            </div>
            <span className="count-pill">
              {processes.length} <span>processes</span>
            </span>
          </div>
          <div className="preset-row">
            <label htmlFor="preset">START WITH A PRESET</label>
            <div className="select-wrap">
              <select
                id="preset"
                value={preset in presets ? preset : "Custom"}
                onChange={(e) => loadPreset(e.target.value)}
              >
                <option>Balanced mix</option>
                <option>Staggered arrivals</option>
                <option>Short &amp; long jobs</option>
                <option>Custom</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PROCESS</th>
                  <th>
                    ARRIVAL <span>AT</span>
                  </th>
                  <th>
                    BURST <span>BT</span>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p, i) => (
                  <tr key={`${i}-${p.pid}`}>
                    <td>
                      <span
                        className="process-dot"
                        style={{ background: colors[i % colors.length] }}
                      />
                      <input
                        className="pid-input"
                        aria-label={`Process ${i + 1} ID`}
                        value={p.pid}
                        maxLength="20"
                        onChange={(e) => update(i, "pid", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`${p.pid} arrival time`}
                        value={p.arrival_time}
                        onChange={(e) =>
                          update(i, "arrival_time", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        aria-label={`${p.pid} burst time`}
                        value={p.burst_time}
                        onChange={(e) =>
                          update(i, "burst_time", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="icon-btn delete"
                        onClick={() => remove(i)}
                        aria-label={`Remove ${p.pid}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!processes.length && (
              <div className="empty-small">
                No processes yet. Add one to begin.
              </div>
            )}
          </div>
          <div className="table-actions">
            <button className="text-button" onClick={add}>
              <Plus size={15} /> Add process
            </button>
            <button className="text-button muted" onClick={clear}>
              <RotateCcw size={14} /> Clear all
            </button>
          </div>
          <div className="divider" />
          <div className="section-kicker algorithm-label">02 / ALGORITHM</div>
          <div className="algorithm-options">
            {[
              ["FCFS", "First Come, First Served", "In arrival order"],
              ["SJF", "Shortest Job First", "Non-preemptive"],
              ["RR", "Round Robin", "Cycles through the queue"],
            ].map(([key, name, desc]) => (
              <button
                key={key}
                className={`algorithm-option ${algo === key ? "selected" : ""}`}
                onClick={() => {
                  setAlgo(key);
                  setResult(null);
                }}
              >
                <span className={`radio ${algo === key ? "checked" : ""}`}>
                  {algo === key && <span />}
                </span>
                <span className="algorithm-copy">
                  <strong>{name}</strong>
                  <small>{desc}</small>
                </span>
                <span className={`algo-code code-${key.toLowerCase()}`}>
                  {key}
                </span>
              </button>
            ))}
          </div>
          {algo === "RR" && (
            <div className="quantum-row">
              <label htmlFor="quantum">Time quantum</label>
              <div className="quantum-input">
                <input
                  id="quantum"
                  type="number"
                  min="1"
                  step="1"
                  value={quantum}
                  onChange={(e) => {
                    setQuantum(e.target.value);
                    setResult(null);
                    setComparison(null);
                  }}
                />
                <span>time units</span>
              </div>
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <div className="run-actions">
            <button
              className="run-button"
              disabled={busy}
              onClick={() => run(false)}
            >
              <Play size={15} fill="currentColor" />{" "}
              {busy ? "Running…" : "Run simulation"}
            </button>
            <button
              className="compare-button"
              disabled={busy}
              onClick={() => run(true)}
            >
              <GitCompareArrows size={16} /> Compare all
            </button>
          </div>
          <div className="privacy-note">
            <Check size={13} /> Runs locally on your machine
          </div>
        </aside>
        <section className="results-column">
          <div className="results-heading">
            <div>
              <div className="section-kicker">03 / RESULTS</div>
              <h2>Simulation results</h2>
            </div>
            {result && (
              <span className="completed">
                <span /> COMPLETE
              </span>
            )}
          </div>
          {!result && !comparison ? (
            <div className="card blank-state">
              <div className="blank-art">
                <div className="art-axis">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="art-block b1" />
                <div className="art-block b2" />
                <div className="art-block b3" />
                <div className="art-block b4" />
                <div className="art-cursor">?</div>
              </div>
              <h3>Ready when you are</h3>
              <p>
                Your schedule timeline and performance metrics
                <br className="desktop-break" /> will appear here after you run
                a simulation.
              </p>
              <button className="blank-cta" onClick={() => run(false)}>
                Run{" "}
                {algo === "SJF"
                  ? "SJF"
                  : algo === "RR"
                    ? "Round Robin"
                    : "FCFS"}{" "}
                <ArrowRight size={15} />
              </button>
            </div>
          ) : null}
          {result && (
            <>
              <div className="card timeline-card">
                <div className="panel-heading">
                  <div>
                    <h3>Execution timeline</h3>
                    <p>Each block shows which process uses the CPU and when.</p>
                  </div>
                  <span className="time-unit">TIME UNITS</span>
                </div>
                <div className="gantt-scroll">
                  <div
                    className="gantt"
                    style={{
                      minWidth: Math.max(470, Math.min(920, maxTime * 42)),
                    }}
                  >
                    {result.segments.map((s, i) => (
                      <div
                        key={i}
                        className={`gantt-segment ${s.pid === "IDLE" ? "idle" : ""}`}
                        style={{
                          width: `${((s.end - s.start) / maxTime) * 100}%`,
                          background:
                            s.pid === "IDLE"
                              ? "#f0f1f5"
                              : colorsById[s.pid] || "#888",
                        }}
                        title={`${s.pid}: ${s.start}–${s.end}`}
                      >
                        <span>{s.pid === "IDLE" ? "IDLE" : s.pid}</span>
                        {s.end - s.start >= 3 && (
                          <small>{s.end - s.start}t</small>
                        )}
                      </div>
                    ))}
                  </div>
                  <div
                    className="ticks"
                    style={{
                      minWidth: Math.max(470, Math.min(920, maxTime * 42)),
                    }}
                  >
                    {[
                      ...new Set([0, ...result.segments.map((s) => s.end)]),
                    ].map((t) => (
                      <span key={t} style={{ left: `${(t / maxTime) * 100}%` }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="legend">
                  {processes.map((p, i) => (
                    <span key={i}>
                      <i style={{ background: colors[i % colors.length] }} />
                      {p.pid || `P${i + 1}`}
                    </span>
                  ))}
                  {result.segments.some((s) => s.pid === "IDLE") && (
                    <span>
                      <i className="idle-swatch" />
                      Idle
                    </span>
                  )}
                </div>
              </div>
              <div className="metrics-grid">
                <Metric
                  label="AVG. COMPLETION TIME"
                  value={fmt(result.averages.completion_time)}
                  unit="units"
                  accent="blue"
                />
                <Metric
                  label="AVG. TURNAROUND"
                  value={fmt(result.averages.turnaround_time)}
                  unit="units"
                  accent="orange"
                />
                <Metric
                  label="AVG. WAITING TIME"
                  value={fmt(result.averages.waiting_time)}
                  unit="units"
                  accent="violet"
                />
                <Metric
                  label="AVG. RESPONSE TIME"
                  value={fmt(result.averages.response_time)}
                  unit="units"
                  accent="green"
                />
                <Metric
                  label="CPU UTILIZATION"
                  value={fmt(result.cpu_utilization)}
                  unit="%"
                  accent="green"
                />
                <Metric
                  label="CONTEXT SWITCHES"
                  value={result.context_switches}
                  unit="switches"
                  accent="blue"
                />
                <Metric
                  label="THROUGHPUT"
                  value={result.throughput}
                  unit="per unit"
                  accent="orange"
                />
              </div>
              <div className="card table-result">
                <div className="panel-heading">
                  <div>
                    <h3>Process breakdown</h3>
                    <p>Completion and response metrics for each process.</p>
                  </div>
                  <BarChart3 size={19} className="panel-icon" />
                </div>
                <div className="result-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>PROCESS</th>
                        <th>CT</th>
                        <th>TAT</th>
                        <th>WT</th>
                        <th>RT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.processes.map((p, i) => (
                        <tr key={p.pid}>
                          <td>
                            <span
                              className="process-dot"
                              style={{ background: colors[i % colors.length] }}
                            />
                            {p.pid}
                          </td>
                          <td>{p.completion_time}</td>
                          <td>{p.turnaround_time}</td>
                          <td>{p.waiting_time}</td>
                          <td>{p.response_time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-foot">
                  <span>
                    CT completion · TAT turnaround · WT waiting · RT response
                  </span>
                  <span>
                    Throughput <b>{result.throughput}</b> / unit
                  </span>
                </div>
              </div>
            </>
          )}
          {comparison && (
            <div className="card compare-card">
              <div className="panel-heading">
                <div>
                  <h3>Same workload, three strategies</h3>
                  <p>
                    All algorithms ran on the same processes and quantum (
                    {quantum}).
                  </p>
                </div>
                <GitCompareArrows size={18} className="panel-icon" />
              </div>
              <div className="compare-grid">
                {Object.entries(comparison).map(([name, data]) => (
                  <div className="compare-item" key={name}>
                    <div className="compare-title">
                      <strong>
                        {name === "SJF"
                          ? "Non-preemptive SJF"
                          : name === "RR"
                            ? "Round Robin"
                            : "FCFS"}
                      </strong>
                      <span>{name}</span>
                    </div>
                    <div className="compare-stat">
                      <span>Avg. waiting</span>
                      <b>
                        {fmt(data.averages.waiting_time)} <small>units</small>
                      </b>
                    </div>
                    <div className="compare-stat">
                      <span>Avg. turnaround</span>
                      <b>
                        {fmt(data.averages.turnaround_time)}{" "}
                        <small>units</small>
                      </b>
                    </div>
                    <div className="compare-stat">
                      <span>CPU utilization</span>
                      <b>
                        {fmt(data.cpu_utilization)}
                        <small>%</small>
                      </b>
                    </div>
                    <div className="compare-stat">
                      <span>Throughput</span>
                      <b>
                        {data.throughput}
                        <small> / unit</small>
                      </b>
                    </div>
                  </div>
                ))}
              </div>
              <div className="compare-note">
                Lower average waiting time can help interactive workloads;
                results depend on arrival and burst patterns.
              </div>
            </div>
          )}
          <div className="concept-note">
            <span className="note-icon">i</span>
            <p>
              <strong>How to read these results</strong>
              <br />
              Turnaround = completion − arrival. Waiting = turnaround − burst.
              Response = first CPU start − arrival.
            </p>
          </div>
        </section>
      </section>
      <footer>
        <span>
          Schedulab <i>·</i> A CPU scheduling learning lab
        </span>
        <span>Built for learning, one time slice at a time.</span>
      </footer>
    </main>
  );
}
function Metric({ label, value, unit, accent }) {
  return (
    <div className="card metric-card">
      <span className="metric-label">{label}</span>
      <div className="metric-value">
        <span className={`metric-dot ${accent}`} />
        <strong>{value}</strong>
        <small>{unit}</small>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
