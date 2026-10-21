// Sidekick rich blocks. The agent emits fenced ```sidekick-<kind> JSON blocks in its Markdown
// (server/demo.ts, or a live agent following the Appriss guidance in src/agent/tools/browser.ts)
// and the panel renders them as the cards from the Sidekick design.
import { createContext, useContext, type ReactNode } from "react";
import type { Analysis, Priority, WeeklyBar } from "../../shared/appriss/data";

export interface SidekickApi {
  send: (text: string) => void;
  openAnalysis: (a: Analysis) => void;
  busy: boolean;
}
export const SidekickCtx = createContext<SidekickApi>({ send: () => undefined, openAnalysis: () => undefined, busy: false });
export const useSidekick = () => useContext(SidekickCtx);

// ------------------------------------------------------------------ icons

export function Sparkle({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`sk-sparkle ${className}`} aria-hidden>
      <defs>
        <linearGradient id="skg" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#E5487F" />
          <stop offset="1" stopColor="#7B5CF0" />
        </linearGradient>
      </defs>
      <path fill="url(#skg)" d="M30 6 C32 22 38 28 54 30 C38 32 32 38 30 54 C28 38 22 32 6 30 C22 28 28 22 30 6 Z" />
      <path fill="url(#skg)" d="M50 4 L52 10 L58 12 L52 14 L50 20 L48 14 L42 12 L48 10 Z" />
    </svg>
  );
}

const paths: Record<string, string> = {
  search: "M11 4a7 7 0 1 0 4.4 12.4l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
  chat: "M4 5h16v11H8l-4 3.5zM6 7v7.6L7.3 14H18V7z",
  x: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z",
  menu: "M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z",
  back: "M15.4 5 8.4 12l7 7-1.4 1.4L5.6 12l8.4-8.4z",
  send: "M3 20.5 21 12 3 3.5V10l12 2-12 2z",
  stop: "M7 7h10v10H7z",
  book: "M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zm2 2v11a1 1 0 0 0 1 1h7V7a1 1 0 0 0-1-1zm12 1h1v13h-1z",
  inbox: "M4 4h16v16H4zm2 2v7h3.5a2.5 2.5 0 0 0 5 0H18V6zm0 9v3h12v-3h-2a4.5 4.5 0 0 1-8 0z",
  aop: "M12 3 21 8l-9 5-9-5zm-9 9 9 5 9-5v2l-9 5-9-5z",
  check: "M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z",
  thumbUp: "M2 10h4v11H2zm6 11h9.5a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 18.9 10H14l.8-4.2A2 2 0 0 0 12.9 3.5L8 9z",
  thumbDown: "M2 3h4v11H2zm6-0h9.5a2 2 0 0 1 2 1.6l1.4 7A2 2 0 0 1 18.9 14H14l.8 4.2a2 2 0 0 1-1.9 2.3L8 15z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z",
  doc: "M6 3h8l4 4v14H6zm7 1.5V8h3.5zM8 11h8v1.5H8zm0 3h8v1.5H8z",
  bubble: "M5 5h14v10H9l-4 3z",
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="sk-icon">
      <path d={paths[name] ?? paths.check} fill="currentColor" />
    </svg>
  );
}

/** **bold** only; the widget text fields are short. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((t, i) => (t.startsWith("**") ? <b key={i}>{t.slice(2, -2)}</b> : <span key={i}>{t}</span>))}
    </>
  );
}

export function PriorityPill({ p }: { p: Priority }) {
  return <span className={`sk-pill prio-${p.toLowerCase()}`}>{p}</span>;
}

// ------------------------------------------------------------------ blocks

function Weekly({ v }: { v: { title: string; bars: WeeklyBar[]; avg: number; unit?: string } }) {
  const W = 560, H = 190, padX = 26, top = 30, base = 150;
  const max = Math.max(...v.bars.map((b) => b.value), v.avg) * 1.08;
  const y = (n: number) => base - (n / max) * (base - top);
  const step = (W - padX * 2) / v.bars.length;
  const fmt = (n: number) => `$${n.toFixed(1)}${v.unit ?? ""}`;
  return (
    <div className="sk-chart" data-testid="sk-weekly">
      <div className="sk-chart-title">{v.title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={v.title}>
        <line x1={padX} x2={W - padX} y1={y(v.avg)} y2={y(v.avg)} stroke="#8C93AD" strokeDasharray="4 4" strokeWidth="1" />
        <text x={padX + 2} y={y(v.avg) - 5} textAnchor="start" className="sk-chart-avg">3-wk avg {fmt(v.avg)}</text>
        <line x1={padX} x2={W - padX} y1={base} y2={base} stroke="#D7DBE7" />
        {v.bars.map((b, i) => {
          const last = i === v.bars.length - 1;
          const cx = padX + step * i + step / 2;
          return (
            <g key={b.label}>
              <rect x={cx - 17} y={y(b.value)} width={34} height={base - y(b.value)} rx={2} fill={last ? "#E0436B" : "#6E7A99"} />
              <text x={cx} y={y(b.value) - 6} textAnchor="middle" className="sk-chart-val">{fmt(b.value)}</text>
              <text x={cx} y={base + 16} textAnchor="middle" className="sk-chart-x">{b.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Stats({ v }: { v: Array<{ value: string; label: string; tone?: string }> }) {
  return (
    <div className="sk-stats" data-testid="sk-stats">
      {v.map((s) => (
        <div key={s.label} className="sk-stat">
          <div className={`sk-stat-v ${s.tone ?? ""}`}>{s.value}</div>
          <div className="sk-stat-l">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Actions({ v }: { v: Array<{ label: string; prompt?: string; primary?: boolean; icon?: string }> }) {
  const { send, busy } = useSidekick();
  return (
    <div className="sk-actions" data-testid="sk-actions">
      {v.map((a) => (
        <button key={a.label} className={`sk-act ${a.primary ? "primary" : ""}`} disabled={busy} onClick={() => a.prompt && send(a.prompt)} data-testid={`sk-action-${a.label.toLowerCase().replace(/\W+/g, "-")}`}>
          {a.icon && <Icon name={a.icon} size={13} />}
          {a.label}
        </button>
      ))}
    </div>
  );
}

function Priorities({ v }: { v: Array<{ level: "red" | "orange" | "yellow"; title: string; text: string }> }) {
  return (
    <ol className="sk-prios">
      {v.map((p, i) => (
        <li key={i}>
          <span className={`sk-dot ${p.level}`} aria-label={`${p.level} priority`} />
          <b>{p.title}</b> <Inline text={p.text} />
        </li>
      ))}
    </ol>
  );
}

function AnalysisCard({ a }: { a: Analysis }) {
  const { openAnalysis } = useSidekick();
  const counts = (["HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => [p, a.findings.filter((f) => f.priority === p).length] as const);
  return (
    <button className="sk-analysis-card" onClick={() => openAnalysis(a)} data-testid="sk-analysis-card">
      <div className="sk-ac-head">
        <Sparkle size={14} /> <span>Sidekick Analysis Results</span>
      </div>
      <div className="sk-ac-title">
        <PriorityPill p={a.priority} /> {a.title}
      </div>
      <div className="sk-ac-counts">
        {counts.map(([p, n]) => (
          <span key={p}>
            <PriorityPill p={p} /> {n}
          </span>
        ))}
      </div>
      <span className="sk-ac-open">View full analysis →</span>
    </button>
  );
}

export function Block({ kind, body }: { kind: string; body: string }) {
  let v: any;
  try {
    v = JSON.parse(body);
  } catch {
    return <pre className="sk-pre">{body}</pre>;
  }
  switch (kind) {
    case "weekly":
      return <Weekly v={v} />;
    case "stats":
      return <Stats v={v} />;
    case "actions":
      return <Actions v={v} />;
    case "priorities":
      return <Priorities v={v} />;
    case "analysis":
      return <AnalysisCard a={v} />;
    case "footnote":
      return <p className="sk-footnote">{String(v)}</p>;
    default:
      return null;
  }
}

/** Splits agent Markdown into text and sidekick-* blocks; an unclosed block while streaming is held back. */
export function segments(text: string): Array<{ md: string } | { kind: string; body: string } | { pending: true }> {
  const out: Array<{ md: string } | { kind: string; body: string } | { pending: true }> = [];
  const re = /```sidekick-(\w+)\s*\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ md: text.slice(last, m.index) });
    out.push({ kind: m[1], body: m[2].trim() });
    last = re.lastIndex;
  }
  const rest = text.slice(last);
  const open = rest.indexOf("```sidekick-");
  if (open >= 0) {
    if (open > 0) out.push({ md: rest.slice(0, open) });
    out.push({ pending: true });
  } else if (rest) out.push({ md: rest });
  return out;
}

// ------------------------------------------------------------------ Analysis Results view

export function AnalysisView({ a, onBack, onContinue }: { a: Analysis; onBack: () => void; onContinue: () => void }) {
  return (
    <div className="sk-analysis" data-testid="sk-analysis-view">
      <div className="sk-analysis-head">
        <button className="sk-icon-btn" aria-label="Back to chat" onClick={onBack} data-testid="sk-analysis-back">
          <Icon name="back" />
        </button>
        <Sparkle size={18} />
        <span className="sk-analysis-name">Sidekick Analysis Results</span>
      </div>
      <div className="sk-analysis-body">
        <div className="sk-an-title">
          <PriorityPill p={a.priority} /> <span>{a.title}</span>
        </div>
        <div className="sk-an-prompt">"{a.prompt}"</div>
        <div className="sk-an-time">{a.createdAt}</div>
        <h4>Summary</h4>
        <p className="sk-an-text">{a.summary}</p>
        <h4>Findings</h4>
        <ol className="sk-an-findings">
          {a.findings.map((f, i) => (
            <li key={i}>
              <div className="sk-an-ftitle">
                <PriorityPill p={f.priority} /> <b>{f.title}</b>
              </div>
              <p>{f.body}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="sk-analysis-foot">
        <button className="sk-act" onClick={() => window.print()} data-testid="sk-export-pdf">
          <Icon name="doc" size={13} /> Export to PDF
        </button>
        <button className="sk-act primary" onClick={onContinue} data-testid="sk-continue-chat">
          <Icon name="bubble" size={13} /> Continue in chat
        </button>
        <span className="sk-muted small">Results are available for 7 days</span>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`sk-card ${className}`}>{children}</div>;
}
