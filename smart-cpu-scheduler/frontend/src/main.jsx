import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Cpu,
  GitCompareArrows,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import "./style.css";

// Backend address. Override with VITE_API_URL in frontend/.env (see .env.example).
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_PROCESSES = 50;

// ---------------------------------------------------------------- data
const ALGOS = [
  { key: "FCFS", name: "First Come, First Served", desc: "In arrival order" },
  { key: "SJF", name: "Shortest Job First", desc: "Shortest burst · non-preemptive" },
  { key: "SRTF", name: "Shortest Remaining Time", desc: "Preemptive SJF" },
  { key: "PRIORITY", name: "Priority Scheduling", desc: "Lowest number first · non-preemptive" },
  { key: "RR", name: "Round Robin", desc: "Cycles through the queue" },
];
const algoName = Object.fromEntries(ALGOS.map((a) => [a.key, a.name]));

const presets = {
  "Balanced mix": [
    { pid: "P1", arrival_time: 0, burst_time: 5, priority: 2 },
    { pid: "P2", arrival_time: 1, burst_time: 3, priority: 1 },
    { pid: "P3", arrival_time: 2, burst_time: 7, priority: 3 },
    { pid: "P4", arrival_time: 4, burst_time: 2, priority: 2 },
  ],
  "Staggered arrivals": [
    { pid: "P1", arrival_time: 0, burst_time: 4, priority: 2 },
    { pid: "P2", arrival_time: 5, burst_time: 3, priority: 1 },
    { pid: "P3", arrival_time: 9, burst_time: 2, priority: 3 },
  ],
  "Short & long jobs": [
    { pid: "P1", arrival_time: 0, burst_time: 8, priority: 3 },
    { pid: "P2", arrival_time: 1, burst_time: 2, priority: 2 },
    { pid: "P3", arrival_time: 2, burst_time: 1, priority: 1 },
    { pid: "P4", arrival_time: 3, burst_time: 4, priority: 2 },
  ],
  "Textbook SRTF mix": [
    { pid: "P1", arrival_time: 0, burst_time: 8, priority: 3 },
    { pid: "P2", arrival_time: 1, burst_time: 4, priority: 1 },
    { pid: "P3", arrival_time: 2, burst_time: 9, priority: 4 },
    { pid: "P4", arrival_time: 3, burst_time: 5, priority: 2 },
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

// Every row gets a stable _id so React keeps the same <input> while you type an ID.
let nextRowId = 1;
const withId = (p) => ({ ...p, _id: nextRowId++ });
const withIds = (rows) => rows.map(withId);

const compareMetrics = [
  { key: "waiting_time", label: "Avg. waiting time", get: (d) => d.averages.waiting_time },
  { key: "turnaround_time", label: "Avg. turnaround", get: (d) => d.averages.turnaround_time },
  { key: "response_time", label: "Avg. response time", get: (d) => d.averages.response_time },
  { key: "context_switches", label: "Context switches", get: (d) => d.context_switches },
];

// Turn the API's error payload into one readable sentence.
function describeError(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d) => `${(d.loc || []).slice(-1)[0] ?? "input"}: ${d.msg}`)
      .join("; ");
  }
  return "Please check your inputs and try again.";
}

// ---------------------------------------------------------------- Gantt chart
// `upTo` lets the replay feature reveal the schedule one time unit at a time.
function Gantt({ segments, total, colorsById, upTo = null, compact = false }) {
  const limit = upTo === null ? total : upTo;
  const span = Math.max(total, 1);
  const minWidth = compact ? 420 : Math.max(470, Math.min(920, span * 42));
  const ticks = [...new Set([0, ...segments.map((s) => s.end)])].filter(
    (t) => t <= limit,
  );
  return (
    <div className="gantt-scroll">
      <div className={`gantt ${compact ? "compact" : ""}`} style={{ minWidth }}>
        {segments.map((s, i) => {
          const end = Math.min(s.end, limit);
          if (end <= s.start) return null;
          const idle = s.pid === "IDLE";
          return (
            <div
              key={i}
              className={`gantt-segment ${idle ? "idle" : ""}`}
              style={{
                width: `${((end - s.start) / span) * 100}%`,
                background: idle ? "#f0f1f5" : colorsById[s.pid] || "#888",
              }}
              title={`${s.pid}: ${s.start}–${s.end}`}
            >
              <span>{s.pid}</span>
              {!compact && end - s.start >= 3 && <small>{end - s.start}t</small>}
            </div>
          );
        })}
      </div>
      <div className="ticks" style={{ minWidth }}>
        {ticks.map((t) => (
          <span key={t} style={{ left: `${(t / span) * 100}%` }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- comparison
function CompareView({ comparison, quantum, colorsById }) {
  const [metricKey, setMetricKey] = useState("waiting_time");
  const metric = compareMetrics.find((m) => m.key === metricKey);
  const entries = Object.entries(comparison);
  const values = entries.map(([, d]) => metric.get(d));
  const best = Math.min(...values);
  const max = Math.max(...values);
  const allEqual = best === max;
  const winners = entries
    .filter(([, d]) => metric.get(d) === best)
    .map(([k]) => k);

  return (
    <div className="card compare-card">
      <div className="panel-heading">
        <div>
          <h3>Same workload, five strategies</h3>
          <p>
            Every algorithm ran on identical processes (Round Robin quantum ={" "}
            {quantum}). Lower is better.
          </p>
        </div>
        <GitCompareArrows size={18} className="panel-icon" />
      </div>

      <div className="metric-tabs" role="tablist">
        {compareMetrics.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={m.key === metricKey}
            className={`metric-tab ${m.key === metricKey ? "active" : ""}`}
            onClick={() => setMetricKey(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="bar-chart">
        {entries.map(([name, data]) => {
          const value = metric.get(data);
          const isBest = !allEqual && value === best;
          return (
            <div className="bar-row" key={name}>
              <span className="bar-name">{name}</span>
              <div className="bar-track">
                <div
                  className={`bar-fill ${isBest ? "best" : ""}`}
                  style={{ width: `${max ? Math.max((value / max) * 100, 2) : 2}%` }}
                />
              </div>
              <b className="bar-value">{fmt(value)}</b>
              <span className="bar-badge">{isBest ? "BEST" : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="winner-line">
        {allEqual
          ? "All five algorithms tie on this metric for this workload."
          : `Best ${metric.label.toLowerCase()}: ${winners.join(", ")} (${fmt(best)}).`}
      </div>

      <div className="algo-compare-list">
        {entries.map(([name, data]) => (
          <div className="compare-item" key={name}>
            <div className="compare-title">
              <strong>{algoName[name]}</strong>
              <span>{name}</span>
            </div>
            <Gantt
              segments={data.segments}
              total={data.total_time}
              colorsById={colorsById}
              compact
            />
            <div className="mini-stats">
              <span>
                WT <b>{fmt(data.averages.waiting_time)}</b>
              </span>
              <span>
                TAT <b>{fmt(data.averages.turnaround_time)}</b>
              </span>
              <span>
                RT <b>{fmt(data.averages.response_time)}</b>
              </span>
              <span>
                Switches <b>{data.context_switches}</b>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="compare-note">
        CPU utilization and throughput are identical across algorithms here, because
        each one finishes the same work in the same total time. What changes is{" "}
        <em>who waits</em>: SRTF/SJF minimise average waiting, Round Robin gives
        the best response for short jobs, and Priority favours important
        processes (at the risk of starving low-priority ones).
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- app
function App() {
  const [processes, setProcesses] = useState(() => withIds(presets["Balanced mix"]));
  const [algo, setAlgo] = useState("FCFS");
  const [quantum, setQuantum] = useState(2);
  const [result, setResult] = useState(null);
  const [ranAlgo, setRanAlgo] = useState("FCFS");
  const [comparison, setComparison] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("Balanced mix");
  const [playhead, setPlayhead] = useState(null); // null = show the whole timeline
  const [playing, setPlaying] = useState(false);

  const resetOutput = () => {
    setResult(null);
    setComparison(null);
    setPlayhead(null);
    setPlaying(false);
  };

  // Replay: advance one time unit every half second.
  useEffect(() => {
    if (!playing || !result) return undefined;
    const id = setInterval(
      () => setPlayhead((h) => Math.min((h ?? 0) + 1, result.total_time)),
      500,
    );
    return () => clearInterval(id);
  }, [playing, result]);
  useEffect(() => {
    if (playing && result && playhead !== null && playhead >= result.total_time)
      setPlaying(false);
  }, [playhead, playing, result]);

  const update = (i, key, value) => {
    setProcesses((rows) =>
      rows.map((p, n) =>
        n === i
          ? { ...p, [key]: key === "pid" ? value : value === "" ? "" : Number(value) }
          : p,
      ),
    );
    setPreset("Custom");
    resetOutput();
  };
  const loadPreset = (name) => {
    if (!presets[name]) return;
    setPreset(name);
    setProcesses(withIds(presets[name]));
    resetOutput();
    setError("");
  };
  const add = () => {
    if (processes.length >= MAX_PROCESSES) {
      setError(`A workload can contain at most ${MAX_PROCESSES} processes.`);
      return;
    }
    let n = 1;
    while (processes.some((p) => p.pid === `P${n}`)) n++;
    setProcesses([
      ...processes,
      withId({ pid: `P${n}`, arrival_time: 0, burst_time: 4, priority: 1 }),
    ]);
    setPreset("Custom");
    resetOutput();
    setError("");
  };
  const remove = (i) => {
    setProcesses(processes.filter((_, n) => n !== i));
    setPreset("Custom");
    resetOutput();
  };
  const clear = () => {
    setProcesses([]);
    resetOutput();
    setPreset("Custom");
    setError("");
  };

  const isNat = (v) => Number.isInteger(v) && v >= 0;
  const validate = () => {
    if (!processes.length) return "Add at least one process.";
    if (processes.length > MAX_PROCESSES)
      return `A workload can contain at most ${MAX_PROCESSES} processes.`;
    const ids = processes.map((p) => p.pid.trim());
    if (ids.some((x) => !x)) return "Every process needs an ID.";
    if (ids.includes("IDLE")) return "'IDLE' is reserved. Choose another ID.";
    if (new Set(ids).size !== ids.length) return "Process IDs must be unique.";
    if (processes.some((p) => !isNat(p.arrival_time)))
      return "Arrival times must be whole numbers from 0 or higher.";
    if (processes.some((p) => !Number.isInteger(p.burst_time) || p.burst_time <= 0))
      return "Burst times must be positive whole numbers.";
    if (processes.some((p) => !isNat(p.priority)))
      return "Priorities must be whole numbers from 0 or higher.";
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
    // Send only the fields the API knows about (no internal _id).
    const payload = processes.map(({ pid, arrival_time, burst_time, priority }) => ({
      pid: pid.trim(),
      arrival_time,
      burst_time,
      priority,
    }));
    try {
      const response = await fetch(
        `${API_URL}/api/${compareAll ? "compare" : "schedule"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            compareAll
              ? { processes: payload, quantum: Number(quantum) }
              : { processes: payload, algorithm: algo, quantum: Number(quantum) },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(describeError(data.detail));
      setPlayhead(null);
      setPlaying(false);
      if (compareAll) {
        setComparison(data);
        setResult(null);
      } else {
        setResult(data);
        setRanAlgo(algo);
        setComparison(null);
      }
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? `Could not reach the API. Start the backend at ${API_URL}.`
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  };

  const startReplay = () => {
    setPlayhead(0);
    setPlaying(true);
  };
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
    } else if (playhead === null || playhead >= result.total_time) {
      startReplay();
    } else {
      setPlaying(true);
    }
  };

  const colorsById = useMemo(
    () =>
      Object.fromEntries(
        processes.map((p, i) => [p.pid.trim(), colors[i % colors.length]]),
      ),
    [processes],
  );

  const now = result ? (playhead === null ? result.total_time : playhead) : 0;
  const runningNow = result
    ? result.segments.find((s) => s.start <= now && now < s.end)
    : null;

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
          <span className="version">v2.0</span>
        </div>
        <a
          className="github"
          href="https://github.com/Anish-Pun-Magar/SMART-CPU-SCHEDULAR"
          target="_blank"
          rel="noreferrer"
        >
          GitHub <ArrowRight size={14} />
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
          <br className="desktop-break" /> Build a workload, choose an algorithm, and
          watch it run.
        </p>
        <div className="hero-tags">
          <span>
            <i className="tag-dot violet" /> FCFS
          </span>
          <span>
            <i className="tag-dot orange" /> SJF
          </span>
          <span>
            <i className="tag-dot blue" /> SRTF
          </span>
          <span>
            <i className="tag-dot rose" /> Priority
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
                {Object.keys(presets).map((name) => (
                  <option key={name}>{name}</option>
                ))}
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
                  <th title="Lower number = higher priority. Used by Priority scheduling.">
                    PRIORITY <span>PR</span>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p, i) => (
                  <tr key={p._id}>
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
                        onChange={(e) => update(i, "arrival_time", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        aria-label={`${p.pid} burst time`}
                        value={p.burst_time}
                        onChange={(e) => update(i, "burst_time", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`${p.pid} priority`}
                        value={p.priority}
                        onChange={(e) => update(i, "priority", e.target.value)}
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
              <div className="empty-small">No processes yet. Add one to begin.</div>
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
          <div className="hint-line">
            Priority: lower number = more important (used only by Priority scheduling).
          </div>
          <div className="divider" />
          <div className="section-kicker algorithm-label">02 / ALGORITHM</div>
          <div className="algorithm-options">
            {ALGOS.map(({ key, name, desc }) => (
              <button
                key={key}
                className={`algorithm-option ${algo === key ? "selected" : ""}`}
                onClick={() => {
                  setAlgo(key);
                  setResult(null);
                  setPlayhead(null);
                  setPlaying(false);
                }}
              >
                <span className={`radio ${algo === key ? "checked" : ""}`}>
                  {algo === key && <span />}
                </span>
                <span className="algorithm-copy">
                  <strong>{name}</strong>
                  <small>{desc}</small>
                </span>
                <span className={`algo-code code-${key.toLowerCase()}`}>{key}</span>
              </button>
            ))}
          </div>
          <div className="quantum-row">
            <label htmlFor="quantum">
              Time quantum <small>(Round Robin &amp; Compare all)</small>
            </label>
            <div className="quantum-input">
              <input
                id="quantum"
                type="number"
                min="1"
                step="1"
                value={quantum}
                onChange={(e) => {
                  setQuantum(e.target.value);
                  resetOutput();
                }}
              />
              <span>units</span>
            </div>
          </div>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <div className="run-actions">
            <button className="run-button" disabled={busy} onClick={() => run(false)}>
              <Play size={15} fill="currentColor" /> {busy ? "Running…" : "Run simulation"}
            </button>
            <button className="compare-button" disabled={busy} onClick={() => run(true)}>
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
                <span /> {ranAlgo} · COMPLETE
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
                <br className="desktop-break" /> will appear here after you run a
                simulation.
              </p>
              <button className="blank-cta" onClick={() => run(false)}>
                Run {algo === "RR" ? "Round Robin" : algo} <ArrowRight size={15} />
              </button>
            </div>
          ) : null}

          {result && (
            <>
              <div className="card timeline-card">
                <div className="panel-heading">
                  <div>
                    <h3>Execution timeline · {algoName[ranAlgo]}</h3>
                    <p>Each block shows which process uses the CPU and when.</p>
                  </div>
                  <span className="time-unit">TIME UNITS</span>
                </div>
                <Gantt
                  segments={result.segments}
                  total={result.total_time}
                  colorsById={colorsById}
                  upTo={playhead}
                />
                <div className="replay-bar">
                  <button className="replay-btn" onClick={togglePlay}>
                    {playing ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
                    {playing
                      ? "Pause"
                      : playhead === null || playhead >= result.total_time
                        ? "Replay"
                        : "Resume"}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max={result.total_time}
                    value={now}
                    aria-label="Scrub through the timeline"
                    onChange={(e) => {
                      setPlaying(false);
                      setPlayhead(Number(e.target.value));
                    }}
                  />
                  <span className="now-running">
                    t = {now}
                    {runningNow &&
                      ` · ${runningNow.pid === "IDLE" ? "CPU idle" : `running ${runningNow.pid}`}`}
                  </span>
                </div>
                <div className="legend">
                  {processes.map((p, i) => (
                    <span key={p._id}>
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
                        {ranAlgo === "PRIORITY" && <th>PR</th>}
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
                              style={{ background: colorsById[p.pid] || colors[i % colors.length] }}
                            />
                            {p.pid}
                          </td>
                          {ranAlgo === "PRIORITY" && <td>{p.priority}</td>}
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
                  <span>CT completion · TAT turnaround · WT waiting · RT response</span>
                  <span>
                    Throughput <b>{result.throughput}</b> / unit
                  </span>
                </div>
              </div>
            </>
          )}

          {comparison && (
            <CompareView
              comparison={comparison}
              quantum={quantum}
              colorsById={colorsById}
            />
          )}

          <div className="concept-note">
            <span className="note-icon">i</span>
            <p>
              <strong>How to read these results</strong>
              <br />
              Turnaround = completion − arrival. Waiting = turnaround − burst. Response
              = first CPU start − arrival.
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
