import { useMemo, useState, type JSX } from "react";
import type { OperationsDashboard, Priority, RiskBand, WorkOrder } from "@asterion/contracts";
import { loadLiveSnapshot } from "./api.js";
import { demoDashboard } from "./demo.js";
import "./styles.css";

type Mode = "demo" | "live";

const priorityLabel: Record<Priority, string> = { critical: "Critical", high: "High", normal: "Normal", low: "Low" };
const riskLabel: Record<RiskBand, string> = { overdue: "Overdue", at_risk: "At risk", on_track: "On track" };

function formatDue(value: string): string {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function WorkOrderRow({ order }: { order: WorkOrder }): JSX.Element {
  return (
    <article className="work-order">
      <div className="work-order__signal"><span className={"priority-dot priority-dot--" + order.priority} /></div>
      <div className="work-order__main">
        <div className="eyebrow">{priorityLabel[order.priority]} · {order.status.replace("_", " ")}</div>
        <h3>{order.title}</h3>
        <p>{order.requiredSkills.length ? order.requiredSkills.join(" · ") : "No specialist skill required"} <span>·</span> {order.estimatedMinutes} min</p>
      </div>
      <div className="work-order__due">
        <span className={"badge badge--" + order.risk}>{riskLabel[order.risk]}</span>
        <time dateTime={order.dueAt}>{formatDue(order.dueAt)}</time>
      </div>
    </article>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone?: "danger" | "warning" | "accent" }): JSX.Element {
  return <div className={"metric " + (tone ? "metric--" + tone : "")}><strong>{value}</strong><span>{label}</span></div>;
}

export default function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>("demo");
  const [dashboard, setDashboard] = useState<OperationsDashboard>(demoDashboard);
  const [baseUrl, setBaseUrl] = useState(import.meta.env.VITE_ASTERION_API_URL || "http://localhost:4020");
  const [organizationId, setOrganizationId] = useState("");
  const [apiKey, setApiKey] = useState("dev-owner-key");
  const [connection, setConnection] = useState<string>("Demo data is active. Connect your API when ready.");
  const criticalQueue = useMemo(() => dashboard.recentWorkOrders.filter((item) => item.risk !== "on_track"), [dashboard]);

  async function connect(): Promise<void> {
    if (!organizationId.trim()) {
      setConnection("Enter an organization ID to load the live command center.");
      return;
    }
    setConnection("Loading live operations data…");
    try {
      const snapshot = await loadLiveSnapshot({ baseUrl, organizationId, apiKey });
      setDashboard(snapshot.dashboard);
      setMode("live");
      setConnection("Live data loaded. Access is evaluated by the API role model.");
    } catch (error) {
      setConnection(error instanceof Error ? error.message : "Unable to connect to the API.");
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand__mark">A</span><span>Asterion</span></div>
        <div className="site-selector"><span className="site-selector__dot" /><span>North Plant</span><span className="chevron">⌄</span></div>
        <nav aria-label="Primary navigation">
          <a className="nav-item nav-item--active" href="#command-center"><span>◫</span> Command center</a>
          <a className="nav-item" href="#work"><span>▣</span> Work orders <em>{dashboard.totals.open}</em></a>
          <a className="nav-item" href="#assets"><span>◇</span> Assets</a>
          <a className="nav-item" href="#plans"><span>◌</span> Preventive plans</a>
          <a className="nav-item" href="#team"><span>◒</span> Team capacity</a>
        </nav>
        <div className="sidebar__footer"><span className="status-dot" /> Planning cycle healthy <small>{mode === "live" ? "Live" : "Demo workspace"}</small></div>
      </aside>

      <section className="content" id="command-center">
        <header className="topbar">
          <div><p className="overline">Operations intelligence</p><h1>Command center</h1></div>
          <div className="topbar__actions"><span className={"live-pill " + (mode === "live" ? "live-pill--live" : "")}>{mode === "live" ? "● Live" : "◌ Demo"}</span><button className="primary-button" type="button">+ New work order</button></div>
        </header>

        <section className="notice" aria-label="Priority operational alert"><div className="notice__icon">!</div><div><strong>{dashboard.totals.overdue} orders need an immediate decision</strong><p>Review overdue work and capacity conflicts before the next production window.</p></div><a href="#work">Review queue →</a></section>

        <section className="metrics" aria-label="Operational summary">
          <Metric value={dashboard.totals.open} label="Open work" tone="accent" />
          <Metric value={dashboard.totals.inProgress} label="In progress" />
          <Metric value={dashboard.totals.atRisk} label="At risk" tone="warning" />
          <Metric value={dashboard.totals.overdue} label="Overdue" tone="danger" />
          <Metric value={dashboard.totals.completedThisWeek} label="Closed this week" />
        </section>

        <section className="grid grid--top">
          <div className="panel panel--queue" id="work">
            <div className="panel__heading"><div><p className="overline">Decision queue</p><h2>Work needing attention</h2></div><button className="quiet-button" type="button">View all <span>→</span></button></div>
            <div className="queue">{criticalQueue.length ? criticalQueue.map((order) => <WorkOrderRow key={order.id} order={order} />) : <p className="empty">No work orders are currently at risk.</p>}</div>
          </div>
          <div className="panel panel--priority">
            <div className="panel__heading"><div><p className="overline">Open work</p><h2>Priority mix</h2></div><span className="muted">{dashboard.totals.unassigned} unassigned</span></div>
            <div className="priority-chart">
              {(Object.entries(dashboard.byPriority) as Array<[Priority, number]>).map(([priority, count]) => <div className="priority-row" key={priority}><span className={"priority-dot priority-dot--" + priority} /><span>{priorityLabel[priority]}</span><div className="priority-row__track"><i style={{ width: (dashboard.totals.open ? (count / dashboard.totals.open) * 100 : 0) + "%" }} /></div><strong>{count}</strong></div>)}
            </div>
            <div className="priority-note"><span>Dispatch principle</span><strong>Safety and production-critical work stay ahead of utilization targets.</strong></div>
          </div>
        </section>

        <section className="grid grid--bottom">
          <div className="panel" id="team">
            <div className="panel__heading"><div><p className="overline">Today</p><h2>Team capacity</h2></div><button className="quiet-button" type="button">Schedule <span>→</span></button></div>
            <div className="capacity-list">{dashboard.capacity.map(({ technician, assignedMinutes, utilizationPercent }) => <div className="capacity-row" key={technician.id}><div className="avatar">{technician.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div className="capacity-row__identity"><strong>{technician.name}</strong><span>{technician.skills.slice(0, 2).join(" · ")}</span></div><div className="capacity-row__load"><div><span>{assignedMinutes}m assigned</span><strong className={utilizationPercent > 100 ? "over-capacity" : ""}>{utilizationPercent}%</strong></div><div className="capacity-bar"><i className={utilizationPercent > 100 ? "capacity-bar__over" : ""} style={{ width: Math.min(utilizationPercent, 100) + "%" }} /></div></div></div>)}</div>
          </div>
          <form className="panel connection-panel" onSubmit={(event) => { event.preventDefault(); void connect(); }}>
            <p className="overline">Integrate safely</p><h2>Connect your command center</h2><p className="connection-panel__copy">The UI stays useful in demo mode. Use a role-scoped API key to replace it with your organization’s operational state.</p>
            <label>API base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" /></label>
            <label>Organization ID<input value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} placeholder="UUID from organization creation" /></label>
            <label>API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" /></label>
            <button className="secondary-button" type="submit">Load live dashboard</button>
            <output className="connection-status">{connection}</output>
          </form>
        </section>
      </section>
    </main>
  );
}
