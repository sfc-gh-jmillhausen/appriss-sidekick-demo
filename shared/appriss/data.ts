// Appriss Retail demo data shared by the portal simulator (src/apps/portal), the Sidekick
// panel (src/sidekick) and the scripted demo agent (server/demo.ts), so every number in a
// chat answer matches the grid on screen. Deterministic: same output on every load.
// Shared-code rules: no import.meta.env, no asset imports, extensionless relative imports.

export const PERSONA = { first: "Jordan", last: "Reyes", role: "LP analyst", district: "Southeast District" };
export const MANAGER = { first: "Priya", last: "Shah", role: "District LP manager" };

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const money = (n: number, cents = true) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
export const num = (n: number) => n.toLocaleString("en-US");

// ------------------------------------------------------------------ dates

const DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** The last four complete Sunday-to-Saturday weeks before `now`, oldest first. */
export function recentWeeks(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastSat = new Date(today.getTime() - ((today.getDay() + 1) % 7 || 7) * DAY);
  return [3, 2, 1, 0].map((k) => {
    const start = new Date(lastSat.getTime() - (6 + k * 7) * DAY);
    const end = new Date(start.getTime() + 6 * DAY);
    return { start, end, label: `Wk of ${short(start)}`, range: `${short(start)}-${end.getMonth() === start.getMonth() ? end.getDate() : short(end)}` };
  });
}

export function lastMonday(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = (today.getDay() + 6) % 7 || 7;
  return new Date(today.getTime() - back * DAY);
}

export const dayLabel = (d: Date) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}, ${short(d)}`;

// ------------------------------------------------------------------ Explorer searches

export interface SearchParams {
  store: number;
  type: "void" | "refund" | "override" | "any";
  max: number;
  days: number;
  name?: string;
}

export interface CashierRow {
  storeNo: number;
  cashierNo: number;
  transactions: number;
  sumTicket: number;
}

const ZERO_CASHIERS = [1641051, 1641337, 1641296, 1641427, 1641297, 1641170, 1641120, 1641219, 1641047, 1641116, 1641264, 1641067, 1641645, 1641131, 1641052, 1641093, 1641010, 1641001];
const SHOWN_FIRST = [1641142, 1641299, 1641028, 1641317, 1641110, 1641049, 1641230, 1641045, 1641341, 1644230, 1641053, 1641171];

/** Cashier-level results for a composed search. Store 341 voids carry the anchors from the
 *  Sidekick demo (cashier 1644200, the $0.00 cohort); other stores are seeded by store number. */
export function searchResults(p: SearchParams): CashierRow[] {
  const r = prng(p.store * 7919 + p.max + p.days + p.type.length);
  const rows: CashierRow[] = [];
  const used = new Set<number>();
  const add = (cashierNo: number, transactions: number, sumTicket: number) => {
    used.add(cashierNo);
    rows.push({ storeNo: p.store, cashierNo, transactions, sumTicket: Math.round(sumTicket * 100) / 100 });
  };
  const anchors = p.store === 341 && p.type === "void";
  const ids = anchors ? [...SHOWN_FIRST] : [];
  while (ids.length < (anchors ? 61 : 48)) {
    const id = 1641000 + Math.floor(r() * 700) + (p.store === 341 ? 0 : p.store * 10);
    if (!ids.includes(id) && !ZERO_CASHIERS.includes(id) && id !== 1644200 && id !== 1641078 && id !== 1641168 && id !== 1641061) ids.push(id);
  }
  // 722 transactions spread over the long tail (store 341), each under the amount cap.
  const budget = anchors ? 722 : 900;
  const raw = ids.map(() => 1 + r() ** 1.5 * 26);
  const scale = budget / raw.reduce((s, x) => s + x, 0);
  const counts = raw.map((x) => Math.max(1, Math.round(x * scale)));
  const big = counts.indexOf(Math.max(...counts));
  counts[big] += budget - counts.reduce((s, x) => s + x, 0);
  ids.forEach((id, i) => {
    const avg = 7.5 + r() * 34;
    add(id, counts[i], Math.min(counts[i] * avg, counts[i] * (p.max - 1)));
  });
  if (anchors) {
    add(1644200, 1215, 4389.3);
    const zeroCounts = [3, 3, 1, 2, 6, 3, 2, 3, 4, 2, 2, 2, 3, 2, 2, 3, 2, 2]; // 47 transactions
    ZERO_CASHIERS.forEach((id, i) => add(id, zeroCounts[i], 0));
    add(1641078, 25, 57.51);
    add(1641168, 40, 175.38);
    add(1641061, 38, 255.36);
  }
  // Interleave so the grid reads like an unsorted Explorer export (anchors are not on top).
  if (!anchors) return rows;
  const head = rows.slice(0, SHOWN_FIRST.length);
  const rest = rows.slice(SHOWN_FIRST.length);
  const shuffled = rest.map((x, i) => ({ x, k: prng(x.cashierNo + i)() })).sort((a, b) => a.k - b.k).map((o) => o.x);
  return [...head.slice(0, 2), shuffled.find((x) => x.cashierNo === 1641296)!, ...head.slice(2), ...shuffled.filter((x) => x.cashierNo !== 1641296)];
}

export function defaultSearchName(p: SearchParams): string {
  const t = { void: "Voids", refund: "Refunds", override: "Overrides", any: "Transactions" }[p.type];
  return `Store ${p.store} ${t} Under ${money(p.max, false)}`;
}

export const STORE_341_VOIDS: SearchParams = { store: 341, type: "void", max: 200, days: 30, name: "Store 341 Voids Under $200" };

// ------------------------------------------------------------------ analysis ("Pull out top trends")

export type Priority = "HIGH" | "MEDIUM" | "LOW";
export interface AnalysisFinding {
  priority: Priority;
  title: string;
  body: string;
}
export interface Analysis {
  title: string;
  priority: Priority;
  prompt: string;
  createdAt: string;
  summary: string;
  findings: AnalysisFinding[];
  recordCount: number;
}

const ids = (xs: CashierRow[]) => xs.map((x) => x.cashierNo).join(", ");

export function analyze(p: SearchParams, prompt = "Pull out top trends from this data", now = new Date()): Analysis {
  const rows = searchResults(p);
  const name = p.name || defaultSearchName(p);
  const totalTx = rows.reduce((s, x) => s + x.transactions, 0);
  const totalAmt = rows.reduce((s, x) => s + x.sumTicket, 0);
  const avg = (x: CashierRow) => (x.transactions ? x.sumTicket / x.transactions : 0);
  const zero = rows.filter((x) => x.sumTicket === 0);
  const zeroTx = zero.reduce((s, x) => s + x.transactions, 0);
  const byTx = [...rows].sort((a, b) => b.transactions - a.transactions);
  const top = byTx[0];
  const second = byTx[1];
  const active = rows.filter((x) => x.transactions >= 10 && x !== top);
  const lowAvg = [...active].sort((a, b) => avg(a) - avg(b));
  const byAmt = [...rows].sort((a, b) => b.sumTicket - a.sumTicket);
  const top5Share = byAmt.slice(0, 5).reduce((s, x) => s + x.sumTicket, 0) / totalAmt;
  const sub5 = rows.filter((x) => x.transactions >= 5 && avg(x) > 0 && avg(x) < 5);
  const tail = rows.filter((x) => x.transactions <= 3 && x.sumTicket > 0);
  const mid = rows.filter((x) => x !== top && x.sumTicket > 0);
  const midAvg = mid.reduce((s, x) => s + x.sumTicket, 0) / mid.reduce((s, x) => s + x.transactions, 0);
  const findings: AnalysisFinding[] = [];

  if (zero.length) {
    const six = zero.filter((x) => x.transactions >= 4);
    findings.push({
      priority: "HIGH",
      title: `${zero.length} Cashiers with $0.00 Total Ticket Amount Across Active Transactions`,
      body: `Cashiers ${ids(zero)} collectively logged ${zeroTx} transactions with a combined Sum Ticket Amount of $0.00. ${six.length ? `Notable sub-cases: ${six.map((x) => `cashier ${x.cashierNo} processed ${x.transactions} transactions`).join(" and ")}, all at $0.00. ` : ""}Zero-value transactions at this volume are a strong indicator of voided sales, sweethearting, or system manipulation. Immediate review of underlying transaction records is recommended.`,
    });
  }
  findings.push({
    priority: "HIGH",
    title: `Dominant Cashier ${top.cashierNo} Processes ${num(top.transactions)} Transactions — Outlier Volume Warrants Scrutiny`,
    body: `Cashier ${top.cashierNo} accounts for ${num(top.transactions)} unique transactions and ${money(top.sumTicket)} in Sum Ticket Amount, representing approximately ${Math.round((top.transactions / totalTx) * 100)}% of all transactions in the dataset (${num(top.transactions)} of ${num(totalTx)}). Their average ticket value is just ${money(avg(top))}, which is low and consistent with high-volume, low-value processing. This could indicate a self-checkout supervisor override account, a shared or generic cashier ID, or a test or system account. The combination of extreme volume and low average ticket is a high-priority anomaly requiring identity and role verification.`,
  });
  const lo = lowAvg[0];
  findings.push({
    priority: "HIGH",
    title: `Cashier ${lo.cashierNo}: Very Low Average Ticket Value of ${money(avg(lo))} Across ${lo.transactions} Transactions`,
    body: `Cashier ${lo.cashierNo} processed ${lo.transactions} transactions but generated only ${money(lo.sumTicket)} in Sum Ticket Amount, yielding an average ticket of ${money(avg(lo))}, the lowest among cashiers with 10 or more transactions. This is significantly below the store's mid-tier average of ${money(midAvg)} and may indicate items being intentionally under-rung, selective scanning, or a pattern of partial transaction completion. Cross-reference individual transaction records for this cashier.`,
  });
  findings.push({
    priority: "MEDIUM",
    title: `Cashier ${second.cashierNo}: High Transaction Count (${second.transactions}) with Disproportionately Low Average Ticket of ${money(avg(second))}`,
    body: `Cashier ${second.cashierNo} is the second-highest volume cashier (excluding ${top.cashierNo}) with ${second.transactions} transactions and ${money(second.sumTicket)} total, averaging ${money(avg(second))} per transaction. While not as extreme as ${lo.cashierNo}, this average is low for ${second.transactions} transactions and the cashier warrants monitoring. Compare against peer cashiers of similar volume such as ${byTx[2].cashierNo} (${byTx[2].transactions} transactions, ${money(avg(byTx[2]))} avg) to assess whether a systematic under-ringing pattern exists.`,
  });
  findings.push({
    priority: "MEDIUM",
    title: `Top 5 Cashiers Drive ${Math.round(top5Share * 100)}% of Total Ticket Amount`,
    body: `Cashiers ${ids(byAmt.slice(0, 5))} account for ${money(byAmt.slice(0, 5).reduce((s, x) => s + x.sumTicket, 0))} of the ${money(totalAmt)} total. Revenue concentration this high in a void-filtered dataset suggests a small group of cashiers handles most voided activity; confirm shift coverage and whether these IDs share a register or supervisor.`,
  });
  if (sub5.length) {
    findings.push({
      priority: "MEDIUM",
      title: `${sub5.length} Cashiers Average Under $5.00 per Voided Transaction`,
      body: `Cashiers ${ids(sub5)} each logged 5 or more transactions with an average ticket below $5.00. Low-value voids repeated across a shift are a common pattern for line-void abuse. Pull line-level void detail for these cashiers before the next store visit.`,
    });
  }
  findings.push({
    priority: "LOW",
    title: `Long Tail: ${tail.length} Cashiers with 3 or Fewer Transactions`,
    body: `${tail.length} cashiers appear with three or fewer voided transactions in the period. Individually these are low risk and consistent with normal error correction; no action is needed unless they recur in next month's search.`,
  });
  findings.push({
    priority: "LOW",
    title: `Store-Level Average Ticket of ${money(totalAmt / totalTx)} Across ${num(totalTx)} Transactions`,
    body: `Across all ${rows.length} cashiers the store averages ${money(totalAmt / totalTx)} per voided transaction under the ${money(p.max, false)} cap. Use this as the baseline when comparing Store ${p.store} with peer stores in the district.`,
  });

  const stamp = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return {
    title: `${name} analysis`,
    priority: "HIGH",
    prompt,
    createdAt: stamp,
    recordCount: rows.length,
    summary: `All ${rows.length} records relate to a single store (Store ${p.store}) across ${rows.length} distinct cashiers. The dataset reveals a heavily skewed transaction volume distribution: one cashier (${top.cashierNo}) dominates with ${num(top.transactions)} transactions and ${money(top.sumTicket)} in ticket amount, while ${zero.length} cashiers recorded $0.00 in total ticket amount despite logging between 1 and 6 transactions each. Several mid-volume cashiers show abnormally low average ticket values, and a small cohort of cashiers drives the majority of store revenue. These patterns warrant immediate cashier-level audit, particularly around zero-value and ultra-low-value transaction activity.`,
    findings,
  };
}

// ------------------------------------------------------------------ cases (LPMS) for store visits

export interface CaseRow {
  caseNo: string;
  type: "External" | "Internal";
  employee: string;
  status: "Open" | "Pending";
  opened: string;
}

export const STORE_341_CASES: CaseRow[] = [
  { caseNo: "ETX341-2005-2", type: "External", employee: "White, Chris", status: "Open", opened: "Sep 02" },
  { caseNo: "ETX341-2006-3", type: "External", employee: "Johnson, Charles", status: "Open", opened: "Sep 14" },
  { caseNo: "ETX341-2006-7", type: "External", employee: "Nguyen, Tara", status: "Open", opened: "Sep 29" },
  { caseNo: "PIX341-2005-1", type: "Internal", employee: "Restricted", status: "Open", opened: "Oct 03" },
  { caseNo: "ETX341-2005-8", type: "External", employee: "Reece, Angie", status: "Pending", opened: "Aug 21" },
  { caseNo: "ETX341-2005-9", type: "External", employee: "Yams, Hurrules", status: "Pending", opened: "Aug 23" },
  { caseNo: "ETX341-2005-16", type: "External", employee: "Renard, Bailey", status: "Pending", opened: "Aug 30" },
  { caseNo: "ETX341-2005-17", type: "External", employee: "Giglio, Robert", status: "Pending", opened: "Sep 01" },
];

// ------------------------------------------------------------------ proactive findings (AOP output)

export interface WeeklyBar {
  label: string;
  value: number;
}
export interface FindingStore {
  store: string;
  storeNo: number;
  increase: number;
  top: string;
}

export function footwearFinding(now = new Date()) {
  const w = recentWeeks(now);
  const bars: WeeklyBar[] = [40.1, 42.3, 41.2, 53.6].map((v, i) => ({ label: w[i].label, value: v }));
  return {
    id: "footwear-overrides",
    title: "Footwear: manager-override markdowns +30%",
    week: w[3].range,
    bars,
    avg: 41.2,
    lastWeek: 53560,
    lastTx: 1284,
    priorAvg: 41200,
    priorTx: 988,
    pct: 30,
    extra: 12360,
    concentration: 61,
    stores: [
      { store: "2047 Charlotte SouthPark", storeNo: 2047, increase: 5120, top: "Marcus Hale (212 overrides)" },
      { store: "1123 Atlanta Perimeter", storeNo: 1123, increase: 1450, top: "Partner No 51902" },
      { store: "3310 Orlando Millenia", storeNo: 3310, increase: 970, top: "Partner No 38815" },
    ] as FindingStore[],
  };
}

export const REFUND_CASHIERS = [
  { store: "2047 Charlotte SouthPark", cashier: "Dana Whitfield", refunds: 18, baseline: 4.2, amount: 1932.4, workItem: "WI-24117" },
  { store: "0588 Raleigh Crabtree", cashier: "Partner No 44120", refunds: 14, baseline: 3.1, amount: 1288.15, workItem: "WI-24118" },
  { store: "1460 Nashville Green Hills", cashier: "Tyler Brooks", refunds: 11, baseline: 2.4, amount: 1046.9, workItem: "WI-24119" },
  { store: "3310 Orlando Millenia", cashier: "Partner No 38815", refunds: 9, baseline: 2.0, amount: 811.6, workItem: "WI-24120" },
];

export const SHRINK_REPORTS = [
  { store: "2047 Charlotte SouthPark", manager: "Alicia Moore", shrink: 2.41, driver: "Manager-override markdowns" },
  { store: "0588 Raleigh Crabtree", manager: "Ben Ortiz", shrink: 1.98, driver: "Refunds without receipt" },
  { store: "1123 Atlanta Perimeter", manager: "Keisha Grant", shrink: 1.87, driver: "Gift card activations" },
  { store: "1460 Nashville Green Hills", manager: "Sam Patel", shrink: 1.62, driver: "Post-void rate" },
  { store: "3310 Orlando Millenia", manager: "Laura Chen", shrink: 1.55, driver: "Cash short at close" },
];

export type InboxBadge = "needs-review" | "work-items" | "fyi" | "resolved" | "dismissed";
export interface InboxItem {
  id: string;
  title: string;
  source: string;
  when: string;
  badge: InboxBadge;
  badgeText: string;
  prompt: string;
  fresh: boolean;
}

export function inbox(now = new Date()): InboxItem[] {
  const mon = dayLabel(lastMonday(now));
  return [
    { id: "footwear-overrides", title: "Manager-override markdowns up 30% in Footwear", source: "Markdown Category Monitor", when: "Today, 2:14 AM", badge: "needs-review", badgeText: "Needs review", prompt: "Walk me through the manager-override markdowns finding in Footwear", fresh: true },
    { id: "refund-spikes", title: "4 cashiers flagged for refund spikes", source: "Refund Spike Watch", when: "Today, 6:00 AM", badge: "work-items", badgeText: "4 work items", prompt: "Show me the 4 cashiers flagged for refund spikes", fresh: true },
    { id: "shrink-reports", title: "Shrink reports sent to 5 store managers", source: "Weekly Shrink Drivers", when: `${mon}, 8:00 AM`, badge: "fyi", badgeText: "FYI", prompt: "Summarize the shrink reports that went to the 5 store managers", fresh: true },
    { id: "gift-cards-812", title: "Gift card activations spike at Store 812", source: "Gift Card Velocity", when: "Last week", badge: "resolved", badgeText: "Resolved", prompt: "What happened with the gift card activation spike at Store 812?", fresh: false },
    { id: "voids-341", title: "Post-void rate normalizing at Store 341", source: "Void Pattern Sentinel", when: "Last week", badge: "dismissed", badgeText: "Dismissed", prompt: "Is the post-void rate at Store 341 back to normal?", fresh: false },
  ];
}

export interface Aop {
  id: string;
  name: string;
  description: string;
  schedule: string;
  cron: string;
  lastRun: string;
  lastResult: string;
  enabled: boolean;
}

export function aops(now = new Date()): Aop[] {
  const mon = dayLabel(lastMonday(now));
  return [
    { id: "markdown-monitor", name: "Markdown Category Monitor", description: "Compares manager-override markdowns by category against a 3-week baseline and the per-cashier policy cap.", schedule: "Nightly, 2:00 AM", cron: "0 2 * * *", lastRun: "Today, 2:14 AM", lastResult: "1 finding · needs review", enabled: true },
    { id: "refund-watch", name: "Refund Spike Watch", description: "Flags cashiers whose refund count is 3x their 8-week baseline and opens a work item for each.", schedule: "Daily, 6:00 AM", cron: "0 6 * * *", lastRun: "Today, 6:00 AM", lastResult: "4 work items created", enabled: true },
    { id: "shrink-drivers", name: "Weekly Shrink Drivers", description: "Ranks the top shrink driver per store and sends a one-page report to each store manager.", schedule: "Mondays, 8:00 AM", cron: "0 8 * * 1", lastRun: `${mon}, 8:00 AM`, lastResult: "5 reports sent", enabled: true },
    { id: "void-sentinel", name: "Void Pattern Sentinel", description: "Looks for post-void and line-void clusters by cashier and register.", schedule: "Nightly, 1:30 AM", cron: "30 1 * * *", lastRun: "Today, 1:42 AM", lastResult: "No findings", enabled: true },
  ];
}

// ------------------------------------------------------------------ prompt library (from the Sidekick deck)

export const PROMPT_LIBRARY: { category: string; prompt: string; hint: string }[] = [
  { category: "Search Composer", prompt: "Compose a search for all transactions less than $200 in the last month that included a void at store 341", hint: "Builds a new search with store, tender, and date filters applied" },
  { category: "Run Searches", prompt: 'Run "Employee Transactions By Store" Quick Link with trading day within 2 weeks', hint: "Runs a quick link in the background with parameterized filters updated" },
  { category: "Store & Cashier", prompt: "Who are the cashiers that have open work items at store 341?", hint: "Lists all cashiers associated with a store & summarize issues" },
  { category: "Work Items & Investigations", prompt: "I'm visiting store 341 today. What should I talk to the store manager about?", hint: "Summarizes open issues and risk signals for a specific store, across all products" },
  { category: "Transactions", prompt: "What is odd about the items in transactions 2602190000000003187 and 2602180000000009656?", hint: "Analyzes and compares two transactions side by side" },
  { category: "Engage", prompt: "Tell me about consumer 56582641's behavior", hint: "Surfaces a summary and analysis of purchase and return behavior" },
  { category: "Incidents & Audits", prompt: "What active incidents are there and what should my next steps be?", hint: "Surfaces all active incidents with contextual next steps in priority order" },
  { category: "Analyze Results", prompt: "Pull out top trends from this data", hint: "Compiles a detailed analysis of anomalies and risks, with recommended next steps" },
  { category: "Admin-Level Memory", prompt: "We always refer to cashier as associate", hint: "Sets an admin-level terminology preference across all future sessions" },
];
