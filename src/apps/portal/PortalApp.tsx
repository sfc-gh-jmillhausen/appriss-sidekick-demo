// Appriss Retail Portal simulator at /apps/portal/*: Explorer, Search Composer, Results,
// Work Items and policy docs. Rendered inline beside the Sidekick panel (same document,
// in-memory router) and driven by the agent through the browser_* client-side tools.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { defaultSearchName, footwearFinding, money, num, PERSONA, REFUND_CASHIERS, searchResults, type SearchParams } from "../../../shared/appriss/data";
import { announce, startAgentBridge } from "../storeops/agentBridge";

const BASE = "/apps/portal";
const strip = (url: string) => url.replace(/^\/apps\/portal/, "") || "/";

// ------------------------------------------------------------------ work items (in-memory)

export interface WorkItem {
  id: string;
  title: string;
  store: string;
  subject: string;
  assignee: string;
  priority: "High" | "Medium" | "Low";
  status: "New" | "In progress" | "Closed";
  source: string;
  created: string;
}

const workItems: WorkItem[] = [
  ...REFUND_CASHIERS.map((c) => ({ id: c.workItem, title: `Refund spike: ${c.refunds} refunds vs ${c.baseline} baseline`, store: c.store, subject: c.cashier, assignee: `${PERSONA.first} ${PERSONA.last}`, priority: "High" as const, status: "New" as const, source: "Refund Spike Watch (AOP)", created: "Today, 6:00 AM" })),
  { id: "WI-24071", title: "Cash short at close, 3 consecutive days", store: "3310 Orlando Millenia", subject: "Register 4", assignee: "Laura Chen", priority: "Medium", status: "In progress", source: "Manual", created: "Oct 14" },
  { id: "WI-23988", title: "Gift card activation velocity", store: "0812 Tampa Westshore", subject: "Partner No 60231", assignee: `${PERSONA.first} ${PERSONA.last}`, priority: "Low", status: "Closed", source: "Gift Card Velocity (AOP)", created: "Oct 09" },
];
let nextWi = 24121;
const wiSubs = new Set<() => void>();
function useWorkItems() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    wiSubs.add(f);
    return () => void wiSubs.delete(f);
  }, []);
  return workItems;
}

// ------------------------------------------------------------------ chrome

function AppGrid() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      {[3, 9, 15].flatMap((y) => [3, 9, 15].map((x) => <rect key={`${x}-${y}`} x={x - 1.6} y={y - 1.6} width="3.2" height="3.2" rx="0.8" fill="currentColor" />))}
    </svg>
  );
}

function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="ap-top">
      <button className="ap-grid" aria-label="Apps" data-testid="portal-apps">
        <AppGrid />
      </button>
      <Link to="/" className="ap-logo" data-testid="portal-home" aria-label="Appriss Retail portal home">
        <img src="/brand/appriss/logo.svg" alt="Appriss Retail" height={30} />
      </Link>
      <div className="ap-top-actions">{children}</div>
      <span className="ap-spacer" />
      <nav className="ap-nav" aria-label="Portal">
        <Link to="/" data-testid="nav-explorer">Explorer</Link>
        <Link to="/workitems" data-testid="nav-workitems">Work Items</Link>
      </nav>
      <div className="ap-user" title={`${PERSONA.first} ${PERSONA.last} · ${PERSONA.role}`}>
        {PERSONA.first[0]}
        {PERSONA.last[0]}
      </div>
    </header>
  );
}

function Crumbs({ items }: { items: string[] }) {
  return (
    <div className="ap-crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={c}>
          {i > 0 && <span className="ap-crumb-sep">›</span>}
          {c}
        </span>
      ))}
    </div>
  );
}

function Info() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className="ap-info" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <rect x="7.2" y="7" width="1.6" height="4.6" rx="0.8" fill="#fff" />
      <circle cx="8" cy="4.7" r="1" fill="#fff" />
    </svg>
  );
}

// ------------------------------------------------------------------ pages

const params = (q: URLSearchParams): SearchParams => {
  const type = (q.get("type") ?? "void") as SearchParams["type"];
  const p: SearchParams = { store: Number(q.get("store") ?? 341) || 341, type: ["void", "refund", "override", "any"].includes(type) ? type : "void", max: Number(q.get("max") ?? 200) || 200, days: Number(q.get("days") ?? 30) || 30 };
  return { ...p, name: q.get("name") || defaultSearchName(p) };
};
const toQuery = (p: SearchParams) => new URLSearchParams({ store: String(p.store), type: p.type, max: String(p.max), days: String(p.days), name: p.name ?? defaultSearchName(p) }).toString();

function Home() {
  useEffect(() => announce("Appriss Retail · Explorer"), []);
  const items = useWorkItems();
  const open = items.filter((w) => w.status !== "Closed" && w.assignee.startsWith(PERSONA.first)).length;
  const saved = [
    { name: "Store 341 Voids Under $200", q: toQuery({ store: 341, type: "void", max: 200, days: 30, name: "Store 341 Voids Under $200" }), updated: "Today" },
    { name: "Footwear manager-override markdowns", q: "preset=footwear-overrides", updated: "Today, 2:14 AM" },
    { name: "Employee Transactions By Store", q: toQuery({ store: 2047, type: "any", max: 500, days: 14, name: "Employee Transactions By Store" }), updated: "Oct 12" },
    { name: "Store 588 Refunds Under $100", q: toQuery({ store: 588, type: "refund", max: 100, days: 30, name: "Store 588 Refunds Under $100" }), updated: "Oct 08" },
  ];
  return (
    <>
      <TopBar>
        <Link className="ap-pill" to="/composer" data-testid="open-composer">+ New search</Link>
      </TopBar>
      <main className="ap-main">
        <Crumbs items={["Portal", "Store", "Explorer"]} />
        <h1 className="ap-h1">Explorer</h1>
        <div className="ap-cards">
          <div className="ap-card kpi"><div className="ap-kpi">{open}</div><div className="ap-muted">Open work items assigned to you</div></div>
          <div className="ap-card kpi"><div className="ap-kpi">3</div><div className="ap-muted">AOP jobs ran overnight</div></div>
          <div className="ap-card kpi"><div className="ap-kpi">88</div><div className="ap-muted">Cases on record at Store 341</div></div>
        </div>
        <h2 className="ap-h2">Saved searches</h2>
        <table className="ap-table" data-testid="saved-searches">
          <thead><tr><th>Name</th><th>Last updated</th></tr></thead>
          <tbody>
            {saved.map((s) => (
              <tr key={s.name}>
                <td><Link to={`/results?${s.q}`} data-testid={`saved-${s.name.toLowerCase().replace(/\W+/g, "-")}`}>{s.name}</Link></td>
                <td className="ap-muted">{s.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}

function Composer() {
  const [q] = useSearchParams();
  const nav = useNavigate();
  const init = q.toString() ? params(q) : { store: 0, type: "any" as const, max: 0, days: 7, name: "" };
  const [f, setF] = useState({ name: q.get("name") ?? "", store: init.store ? String(init.store) : "", type: init.type as string, max: init.max ? String(init.max) : "", days: String(init.days) });
  useEffect(() => announce("Appriss Retail · Search Composer"), []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const run = () => {
    const p: SearchParams = { store: Number(f.store) || 341, type: (f.type as SearchParams["type"]) || "any", max: Number(f.max) || 200, days: Number(f.days) || 30 };
    nav(`/results?${toQuery({ ...p, name: f.name.trim() || defaultSearchName(p) })}`);
  };
  return (
    <>
      <TopBar>
        <Link className="ap-pill" to="/" data-testid="back-explorer">← Explorer</Link>
      </TopBar>
      <main className="ap-main">
        <Crumbs items={["Portal", "Store", "Explorer", "Composer"]} />
        <h1 className="ap-h1">Search Composer</h1>
        <form className="ap-form" onSubmit={(e) => (e.preventDefault(), run())}>
          <label className="ap-field wide">
            <span>Search name</span>
            <input data-testid="composer-name" value={f.name} onChange={set("name")} placeholder="Untitled search" />
          </label>
          <label className="ap-field">
            <span>Store No</span>
            <input data-testid="composer-store" value={f.store} onChange={set("store")} placeholder="Any store" inputMode="numeric" />
          </label>
          <label className="ap-field">
            <span>Transaction includes</span>
            <select data-testid="composer-type" value={f.type} onChange={set("type")}>
              <option value="any">Any transaction</option>
              <option value="void">Void</option>
              <option value="refund">Refund</option>
              <option value="override">Manager override</option>
            </select>
          </label>
          <label className="ap-field">
            <span>Ticket amount less than</span>
            <input data-testid="composer-max" value={f.max} onChange={set("max")} placeholder="$" inputMode="decimal" />
          </label>
          <label className="ap-field">
            <span>Trading day within</span>
            <select data-testid="composer-range" value={f.days} onChange={set("days")}>
              <option value="7">Last 7 days</option>
              <option value="14">Last 2 weeks</option>
              <option value="30">Last month</option>
              <option value="90">Last 3 months</option>
            </select>
          </label>
          <div className="ap-field wide">
            <span>Group by</span>
            <div className="ap-chips"><span className="ap-chip on">Store No</span><span className="ap-chip on">Cashier No</span><span className="ap-chip">Register</span><span className="ap-chip">Tender</span></div>
          </div>
          <div className="ap-form-actions">
            <button type="submit" className="ap-btn primary" data-testid="composer-run">Run search</button>
          </div>
        </form>
      </main>
    </>
  );
}

type SortKey = "storeNo" | "cashierNo" | "transactions" | "sumTicket";

function Results() {
  const [q] = useSearchParams();
  return q.get("preset") === "footwear-overrides" ? <FootwearResults /> : <CashierResults />;
}

function CashierResults() {
  const [q] = useSearchParams();
  const nav = useNavigate();
  const p = params(q);
  useEffect(() => announce(`Appriss Retail · Results · ${p.name}`), [q.toString()]);
  const rows = useMemo(() => searchResults(p), [q.toString()]);
  const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 } | null>(null);
  const sorted = sort ? [...rows].sort((a, b) => (a[sort.k] - b[sort.k]) * sort.d) : rows;
  const th = (k: SortKey, label: string) => (
    <th className="num" onClick={() => setSort((s) => ({ k, d: s?.k === k && s.d === -1 ? 1 : -1 }))} aria-sort={sort?.k === k ? (sort.d === 1 ? "ascending" : "descending") : "none"}>
      {label}
      {sort?.k === k ? (sort.d === 1 ? " ▲" : " ▼") : ""}
    </th>
  );
  return (
    <>
      <TopBar>
        <button className="ap-pill" onClick={() => nav(`/composer?${toQuery(p)}`)} data-testid="results-composer">← Composer</button>
        <button className="ap-pill" data-testid="results-save">Save</button>
      </TopBar>
      <main className="ap-main">
        <Crumbs items={["Portal", "Store", "Explorer", "Composer"]} />
        <h1 className="ap-h1">Results</h1>
        <div className="ap-subtitle" data-testid="results-title">
          {p.name} <Info />
        </div>
        <div className="ap-filters" data-testid="results-filters">
          <span className="ap-chip on">Store No = {p.store}</span>
          <span className="ap-chip on">Includes {p.type === "any" ? "any transaction" : p.type === "override" ? "manager override" : p.type}</span>
          <span className="ap-chip on">Ticket amount &lt; {money(p.max, false)}</span>
          <span className="ap-chip on">{p.days === 30 ? "Last month" : `Last ${p.days} days`}</span>
          <span className="ap-muted small">{num(rows.length)} rows · {num(rows.reduce((s, x) => s + x.transactions, 0))} transactions</span>
        </div>
        <div className="ap-grid-wrap">
          <table className="ap-table results" data-testid="results-table">
            <thead>
              <tr>{th("storeNo", "Store No")}{th("cashierNo", "Cashier No")}{th("transactions", "Unique Transactions")}{th("sumTicket", "Sum of Ticket Amount")}</tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.cashierNo} data-testid={`row-${r.cashierNo}`}>
                  <td className="num">{r.storeNo}</td>
                  <td className="num">{r.cashierNo}</td>
                  <td className="num">{num(r.transactions)}</td>
                  <td className="num">{money(r.sumTicket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function FootwearResults() {
  const f = footwearFinding();
  useEffect(() => announce("Appriss Retail · Results · Footwear manager-override markdowns"), []);
  const rows = useMemo(() => {
    const extra = [
      ["0588 Raleigh Crabtree", 610, "Partner No 44120"], ["1460 Nashville Green Hills", 540, "Partner No 70218"], ["0812 Tampa Westshore", 480, "Partner No 60231"],
      ["2210 Charleston King St", 410, "Partner No 22764"], ["1777 Birmingham Summit", 365, "Partner No 31190"], ["0904 Savannah Oglethorpe", 290, "Partner No 18822"],
      ["3025 Jacksonville Town Ctr", 255, "Partner No 50417"], ["1188 Greenville Haywood", 210, "Partner No 47203"],
    ] as const;
    return [...f.stores.map((s) => ({ store: s.store, increase: s.increase, top: s.top })), ...extra.map(([store, increase, top]) => ({ store, increase, top }))].map((r, i) => ({ ...r, overrides: Math.round(r.increase / 24 + 40 + (i % 3) * 7) + (i === 0 ? 120 : 0), lastWeek: Math.round(r.increase * 2.1 + 1800 + i * 37) }));
  }, []);
  return (
    <>
      <TopBar>
        <Link className="ap-pill" to="/" data-testid="results-explorer">← Explorer</Link>
        <button className="ap-pill" data-testid="results-save">Save</button>
      </TopBar>
      <main className="ap-main">
        <Crumbs items={["Portal", "Store", "Explorer", "Composer"]} />
        <h1 className="ap-h1">Results</h1>
        <div className="ap-subtitle" data-testid="results-title">Footwear Manager-Override Markdowns, Week of {f.week} <Info /></div>
        <div className="ap-filters">
          <span className="ap-chip on">Department = Footwear</span>
          <span className="ap-chip on">Reason code = Manager override</span>
          <span className="ap-chip on">Week {f.week}</span>
          <span className="ap-chip">Excludes clearance and promo</span>
          <span className="ap-muted small">Opened from Sidekick finding</span>
        </div>
        <div className="ap-grid-wrap">
          <table className="ap-table results" data-testid="results-table">
            <thead><tr><th>Store</th><th className="num">Override Markdown $</th><th className="num">Increase vs 3-wk avg</th><th className="num">Overrides</th><th>Top cashier</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.store} data-testid={`row-${r.store.split(" ")[0]}`}>
                  <td><Link to={`/stores/${Number(r.store.split(" ")[0])}`}>{r.store}</Link></td>
                  <td className="num">{money(r.lastWeek)}</td>
                  <td className="num">+{money(r.increase)}</td>
                  <td className="num">{r.overrides}</td>
                  <td>{r.top}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function Store() {
  const { storeNo } = useParams();
  const s = footwearFinding().stores.find((x) => String(x.storeNo) === storeNo);
  const name = s?.store ?? `Store ${storeNo}`;
  useEffect(() => announce(`Appriss Retail · ${name}`), [storeNo]);
  return (
    <>
      <TopBar>
        <Link className="ap-pill" to="/results?preset=footwear-overrides">← Results</Link>
      </TopBar>
      <main className="ap-main">
        <Crumbs items={["Portal", "Store", name]} />
        <h1 className="ap-h1">{name}</h1>
        <div className="ap-cards">
          <div className="ap-card kpi"><div className="ap-kpi">{s ? `+${money(s.increase, false)}` : "n/a"}</div><div className="ap-muted">Footwear override markdowns vs 3-wk avg</div></div>
          <div className="ap-card kpi"><div className="ap-kpi">{storeNo === "2047" ? "212" : "38"}</div><div className="ap-muted">Overrides by top cashier last week</div></div>
          <div className="ap-card kpi"><div className="ap-kpi">25</div><div className="ap-muted">Policy cap per cashier per week</div></div>
        </div>
        <p className="ap-muted">Top cashier: {s?.top ?? "n/a"}. Store manager and district LP manager receive the weekly shrink report.</p>
      </main>
    </>
  );
}

function WorkItems() {
  const items = useWorkItems();
  const [q] = useSearchParams();
  const created = q.get("created");
  useEffect(() => announce("Appriss Retail · Work Items"), [created]);
  return (
    <>
      <TopBar>
        <Link className="ap-pill" to="/workitems/new" data-testid="workitem-new">+ New work item</Link>
      </TopBar>
      <main className="ap-main">
        <Crumbs items={["Portal", "Work Items"]} />
        <h1 className="ap-h1">Work Items</h1>
        {created && <div className="ap-banner" data-testid="workitem-created">Work item {created} created and assigned to {PERSONA.first} {PERSONA.last}.</div>}
        <div className="ap-grid-wrap">
          <table className="ap-table" data-testid="workitems-table">
            <thead><tr><th>ID</th><th>Title</th><th>Store</th><th>Subject</th><th>Priority</th><th>Status</th><th>Source</th><th>Created</th></tr></thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id} data-testid={`wi-${w.id}`} className={w.id === created ? "ap-new" : ""}>
                  <td className="ap-mono">{w.id}</td>
                  <td>{w.title}</td>
                  <td>{w.store}</td>
                  <td>{w.subject}</td>
                  <td><span className={`ap-prio ${w.priority.toLowerCase()}`}>{w.priority}</span></td>
                  <td>{w.status}</td>
                  <td className="ap-muted">{w.source}</td>
                  <td className="ap-muted">{w.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function NewWorkItem() {
  const [q] = useSearchParams();
  const nav = useNavigate();
  const fromFinding = q.get("finding") === "footwear-overrides";
  const [f, setF] = useState(
    fromFinding
      ? { title: "Manager-override markdowns over policy cap (212 vs 25/week)", store: "2047 Charlotte SouthPark", subject: "Marcus Hale", priority: "High", notes: "Opened from Sidekick finding: Footwear manager-override markdowns +30%. Evidence: Markdown Policy 2026.pdf, section 4.2." }
      : { title: "", store: "", subject: "", priority: "Medium", notes: "" },
  );
  useEffect(() => announce("Appriss Retail · New Work Item"), []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = () => {
    const id = `WI-${nextWi++}`;
    workItems.unshift({ id, title: f.title || "Untitled work item", store: f.store, subject: f.subject, assignee: `${PERSONA.first} ${PERSONA.last}`, priority: f.priority as WorkItem["priority"], status: "New", source: fromFinding ? "Sidekick finding" : "Manual", created: "Just now" });
    wiSubs.forEach((s) => s());
    nav(`/workitems?created=${id}`);
  };
  return (
    <>
      <TopBar>
        <Link className="ap-pill" to="/workitems">← Work Items</Link>
      </TopBar>
      <main className="ap-main">
        <Crumbs items={["Portal", "Work Items", "New"]} />
        <h1 className="ap-h1">New work item</h1>
        <form className="ap-form" onSubmit={(e) => (e.preventDefault(), submit())}>
          <label className="ap-field wide"><span>Title</span><input data-testid="workitem-title" value={f.title} onChange={set("title")} /></label>
          <label className="ap-field"><span>Store</span><input data-testid="workitem-store" value={f.store} onChange={set("store")} /></label>
          <label className="ap-field"><span>Subject</span><input data-testid="workitem-subject" value={f.subject} onChange={set("subject")} /></label>
          <label className="ap-field">
            <span>Priority</span>
            <select data-testid="workitem-priority" value={f.priority} onChange={set("priority")}>
              <option>High</option><option>Medium</option><option>Low</option>
            </select>
          </label>
          <label className="ap-field"><span>Assignee</span><input value={`${PERSONA.first} ${PERSONA.last}`} readOnly /></label>
          <label className="ap-field wide"><span>Notes</span><textarea data-testid="workitem-notes" rows={3} value={f.notes} onChange={set("notes")} /></label>
          <div className="ap-form-actions">
            <button type="submit" className="ap-btn primary" data-testid="workitem-submit" data-agent-confirm="true" aria-label="Create work item">Create work item</button>
          </div>
        </form>
      </main>
    </>
  );
}

function PolicyDoc() {
  useEffect(() => announce("Appriss Retail · Markdown Policy 2026.pdf"), []);
  return (
    <>
      <TopBar>
        <Link className="ap-pill" to="/results?preset=footwear-overrides">← Results</Link>
      </TopBar>
      <main className="ap-main">
        <Crumbs items={["Portal", "Documentation", "Markdown Policy 2026.pdf"]} />
        <h1 className="ap-h1">Markdown Policy 2026</h1>
        <div className="ap-doc">
          <p className="ap-muted">LP Policy Manual 2026 · Section 4 · Uploaded Sep 30 · In use by Sidekick</p>
          <h3>4.1 Markdown types</h3>
          <p>Markdowns fall into three categories: clearance (merchandising-led), promotional (tied to the promo calendar) and manager override (store-level, reason-coded).</p>
          <h3>4.2 Manager-override limits</h3>
          <p className="ap-hl" data-testid="policy-cap">Manager-override markdowns are capped at <b>25 per cashier per week</b>. Overrides beyond the cap require district LP manager approval and are reviewed in the weekly shrink walk.</p>
          <h3>4.3 Exclusions</h3>
          <p>Clearance and promotional markdowns are excluded from override monitoring. Hub stores 500 and 501 process returns for all of Region 4 and are excluded from store-level comparisons.</p>
        </div>
      </main>
    </>
  );
}

// ------------------------------------------------------------------ shell

function Bridge({ rootRef }: { rootRef: RefObject<HTMLDivElement | null> }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const locRef = useRef(loc);
  locRef.current = loc;
  useEffect(
    () =>
      startAgentBridge({
        navigate: (url) => navigate(strip(url)),
        history: (dir) => (dir === "back" ? navigate(-1) : navigate(1)),
        inline: rootRef.current ? { root: rootRef.current, url: () => BASE + (locRef.current.pathname === "/" ? "" : locRef.current.pathname) + locRef.current.search } : undefined,
      }),
    [navigate, rootRef],
  );
  return null;
}

export function InlinePortal({ initialUrl }: { initialUrl: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const u = new URL(initialUrl, location.origin);
  return (
    <div ref={rootRef} className="ap" data-testid="browser-frame">
      <MemoryRouter initialEntries={[strip(u.pathname) + u.search]}>
        <Bridge rootRef={rootRef} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/composer" element={<Composer />} />
          <Route path="/results" element={<Results />} />
          <Route path="/stores/:storeNo" element={<Store />} />
          <Route path="/workitems" element={<WorkItems />} />
          <Route path="/workitems/new" element={<NewWorkItem />} />
          <Route path="/docs/markdown-policy" element={<PolicyDoc />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </MemoryRouter>
    </div>
  );
}
