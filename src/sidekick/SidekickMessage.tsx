// One Sidekick turn: navy user bubble, or a grey assistant card with a live activity line,
// approval cards, Markdown + sidekick-* blocks, SDK tables/charts and feedback thumbs.
import { lazy, Suspense, useEffect, useState } from "react";
import type { Analysis } from "../../shared/appriss/data";
import { getBrand } from "../brand/brand.config";
import { decideApproval } from "../chat/session";
import type { Approval, Step, UIMessage } from "../chat/types";
import { DataTable } from "../render/DataTable";
import { Block, Icon, segments, Sparkle, useSidekick } from "./widgets";

const Markdown = lazy(() => import("../render/Markdown"));
const VegaChart = lazy(() => import("../render/VegaChart"));

const working = (m: UIMessage) => ["submitting", "thinking", "streaming"].includes(m.status);

const TOOL_LABELS: Record<string, string> = {
  lp_transactions_analyst: "Querying LP transactions · Cortex Analyst",
  lpms_cases_analyst: "Querying LPMS cases · Cortex Analyst",
  aop_findings_analyst: "Reading AOP findings · Cortex Analyst",
  lp_policy_search: "Searching LP policy documents · Cortex Search",
  aop_task_runner: "Running AOP · Snowflake Task",
  send_teams_message: "Sending a Teams message",
};
const FIELD: Record<string, string> = {
  "composer-name": "Search name",
  "composer-store": "Store No",
  "composer-type": "Transaction includes",
  "composer-max": "Ticket amount less than",
  "composer-range": "Trading day within",
  "composer-run": "Run search",
  "results-table": "Results",
  "workitem-submit": "Create work item",
};
const PAGE: Record<string, string> = {
  "/apps/portal/composer": "Opening Search Composer",
  "/apps/portal/workitems": "Opening Work Items",
};

/** Friendlier activity labels for the Appriss portal and the LP tools. */
export function stepLabel(s: Step): string {
  const tool = Object.keys(TOOL_LABELS).find((k) => s.label.includes(k));
  return tool ? TOOL_LABELS[tool] : friendlyLabel(s.label);
}

/** Browser-tool labels ("Filling composer-store = 341") in portal terms. */
export function friendlyLabel(label: string): string {
  let l = label;
  const nav = l.match(/^Navigating to (\S+)/);
  if (nav) return PAGE[nav[1]] ?? (nav[1].includes("/results") ? "Opening Results" : nav[1].includes("/workitems/new") ? "Drafting a work item" : `Opening ${nav[1].replace("/apps/portal", "portal")}`);
  for (const [id, name] of Object.entries(FIELD)) l = l.replace(id, name);
  return l
    .replace(/^Filtering (.*?) = /, "Setting $1 = ")
    .replace(/^Reading table /, "Reading ")
    .replace(/(Trading day within = )(\d+)/, (_, a, d) => a + (d === "30" ? "Last month" : d === "14" ? "Last 2 weeks" : `Last ${d} days`))
    .replace(/(Transaction includes = )(\w+)/, (_, a, t) => a + t[0].toUpperCase() + t.slice(1));
}

const isNoise = (s: Step) => (s.kind === "status" || s.kind === "reconnect") && s.state !== "error";

function useTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [active]);
}

function LiveLine({ m }: { m: UIMessage }) {
  useTick(true);
  const cur = [...m.steps].reverse().find((s) => s.state === "running") ?? m.steps.at(-1);
  const secs = Math.max(0, Math.round((Date.now() - m.started) / 1000));
  const label = cur ? stepLabel(cur) : m.status === "streaming" ? "Writing" : "Thinking";
  return (
    <div className="sk-live" aria-live="polite" data-testid="sk-live">
      <Sparkle size={14} className="spin" />
      <span>{m.status === "streaming" && !cur?.state.includes("running") ? "Writing" : label}</span>
      <span className="sk-muted">· {secs}s</span>
    </div>
  );
}

function Activity({ m }: { m: UIMessage }) {
  const steps = m.steps.filter((s) => !isNoise(s));
  if (!steps.length && !m.thinking) return null;
  return (
    <details className="sk-activity" data-testid="sk-activity">
      <summary>
        Activity · {steps.length} step{steps.length === 1 ? "" : "s"}
      </summary>
      {m.thinking && <p className="sk-thinking">{m.thinking}</p>}
      <ol>
        {steps.map((s) => (
          <li key={s.id} className={`st-${s.state}`}>
            <span className="sk-step-dot" />
            {stepLabel(s)}
            {s.sql && <pre className="sk-sql">{s.sql}</pre>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function ApprovalCard({ a, convId, msgId }: { a: Approval; convId: string; msgId: string }) {
  let to = "";
  let body = a.preview ?? "";
  try {
    const j = JSON.parse(a.preview ?? "");
    to = j.to ?? "";
    body = j.message ?? body;
  } catch {
    /* plain preview */
  }
  const title = a.title.startsWith("send_teams_message") ? `Send a Teams message${to ? ` to ${to}` : ""}?` : a.title.replace(/^Confirm: /, "") + "?";
  return (
    <div className={`sk-approval ${a.state}`} role="group" aria-label="Approval required" data-testid="sk-approval">
      <div className="sk-approval-k">{a.state === "pending" ? "Sidekick suggests. You decide." : a.decision && /deny/i.test(a.decision) ? "Declined" : "Approved"}</div>
      <div className="sk-approval-t">{title}</div>
      {body && !a.title.startsWith("Confirm") && <div className="sk-approval-p">{body}</div>}
      {a.state === "pending" && (
        <div className="sk-actions">
          {a.options.map((o) => {
            const deny = /deny|reject/i.test(o);
            return (
              <button key={o} className={`sk-act ${deny ? "" : "primary"}`} onClick={() => decideApproval(convId, msgId, a, o)} data-testid={`sk-approval-${deny ? "deny" : "allow"}`}>
                {deny ? "Not now" : "Approve"}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Feedback() {
  const [v, setV] = useState<"up" | "down" | null>(null);
  return (
    <div className="sk-thumbs">
      <button aria-label="Helpful" className={v === "up" ? "on" : ""} onClick={() => setV(v === "up" ? null : "up")}>
        <Icon name="thumbUp" size={13} />
      </button>
      <button aria-label="Not helpful" className={v === "down" ? "on" : ""} onClick={() => setV(v === "down" ? null : "down")}>
        <Icon name="thumbDown" size={13} />
      </button>
    </div>
  );
}

const autoOpened = new Set<string>();

export function SidekickMessage({ m, convId, initials }: { m: UIMessage; convId: string; initials: string }) {
  const { openAnalysis } = useSidekick();
  const busy = working(m);
  const segs = m.role === "assistant" ? segments(m.text) : [];
  const analysis = segs.find((s): s is { kind: string; body: string } => "kind" in s && s.kind === "analysis");

  // The Analysis Results view opens on its own when a fresh analysis lands, like Sidekick does.
  useEffect(() => {
    if (!analysis || busy || autoOpened.has(m.id) || !m.ended || Date.now() - m.ended > 8000) return;
    autoOpened.add(m.id);
    try {
      openAnalysis(JSON.parse(analysis.body) as Analysis);
    } catch {
      /* malformed block */
    }
  }, [analysis?.body, busy, m.id, m.ended, openAnalysis]);

  if (m.role === "user") {
    return (
      <div className="sk-row user" data-testid="msg-user">
        <div className="sk-bubble">{m.text}</div>
        <div className="sk-avatar user" aria-hidden>
          {initials ? initials : <Icon name="person" size={14} />}
        </div>
      </div>
    );
  }

  return (
    <div className="sk-row assistant" data-testid="msg-assistant" data-status={m.status}>
      <div className="sk-avatar" aria-hidden>
        <Sparkle size={14} />
      </div>
      <div className="sk-msg">
        {busy && <LiveLine m={m} />}
        {!busy && <Activity m={m} />}
        {m.approvals.map((a) => <ApprovalCard key={a.id} a={a} convId={convId} msgId={m.id} />)}
        {segs.map((s, i) =>
          "md" in s ? (
            s.md.trim() ? (
              <Suspense key={i} fallback={<div className="md plain">{s.md}</div>}>
                <Markdown text={s.md} />
              </Suspense>
            ) : null
          ) : "pending" in s ? (
            <div key={i} className="sk-pending">Preparing…</div>
          ) : (
            <Block key={i} kind={s.kind} body={s.body} />
          ),
        )}
        {m.tables.map((t) => <DataTable key={t.id} columns={t.columns} rows={t.rows} title="Result" />)}
        {m.charts.map((c) => (
          <Suspense key={c.id} fallback={<div className="sk-pending">Loading chart…</div>}>
            <VegaChart spec={c.spec} brand={getBrand()} dark={false} />
          </Suspense>
        ))}
        {m.status === "error" && <div className="sk-error" role="alert">{m.error}</div>}
        {m.status === "cancelled" && <div className="sk-muted">Stopped.</div>}
        {!busy && m.text && <Feedback />}
      </div>
    </div>
  );
}
