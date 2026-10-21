// Scripted Sidekick agent for recordings and offline demos (DEMO_MODE=true). It emits the same
// event stream the Cortex Agent API does (thinking, tool_use / tool_result with SQL, text deltas,
// client-side browser tools, permission prompts), so the UI path is identical to a live agent.
// Swap to the real agent by setting SNOWFLAKE_* and AGENT_* in .env (DEMO_MODE=false).
import { ProxyEvent, type ChatRequest } from "../shared/protocol";
import * as D from "../shared/appriss/data";
import { emit, finish, type Run } from "./runs";

interface Thread {
  scenario: string;
  step: number;
  mid: number;
  text: string;
  data: Record<string, any>;
}

interface Ctx {
  /** Client tool results from the previous hop, keyed by tool name (last wins). */
  results: Record<string, { ok: boolean; json: any }>;
  /** permission_decision items from the previous hop. */
  decisions: Record<string, string>;
}

const g = globalThis as unknown as { __sidekickThreads?: Map<string, Thread> };
const threads: Map<string, Thread> = (g.__sidekickThreads ??= new Map());
const PACE = Number(process.env.DEMO_PACE || 1);
const CANCELLED = Symbol("cancelled");

class IO {
  private n = 0;
  constructor(private run: Run) {}

  private alive() {
    if (this.run.status !== "running") throw CANCELLED;
  }
  async sleep(ms: number) {
    this.alive();
    await new Promise((r) => setTimeout(r, ms * PACE));
    this.alive();
  }
  status(message: string) {
    emit(this.run, "response.status", { status: "executing", message });
  }
  async think(text: string) {
    const words = text.split(/(?<= )/);
    for (let i = 0; i < words.length; i += 5) {
      emit(this.run, "response.thinking.delta", { text: words.slice(i, i + 5).join("") });
      await this.sleep(35);
    }
    emit(this.run, "response.thinking", { text });
  }
  /** A server-side tool (Cortex Analyst, Cortex Search, task runner) with its result. */
  async tool(name: string, type: string, input: Record<string, unknown>, json: Record<string, unknown>, ms = 1100) {
    const id = `toolu_demo_${this.run.id.slice(0, 8)}_${++this.n}`;
    emit(this.run, "response.tool_use", { tool_use_id: id, name, type, input });
    await this.sleep(ms);
    emit(this.run, "response.tool_result", { tool_use_id: id, name, status: "success", content: [{ type: "json", json }] });
    await this.sleep(150);
  }
  /** Client-side browser tools: the UI executes them and sends tool_result on the next turn. */
  clientTools(calls: Array<{ name: string; input: Record<string, unknown> }>) {
    for (const c of calls) emit(this.run, "response.tool_use", { tool_use_id: `toolu_demo_${this.run.id.slice(0, 8)}_${++this.n}`, name: c.name, type: "generic", input: c.input, client_side_execute: true });
  }
  /** A tool that needs the user's permission (approval card); the decision comes back next turn. */
  permission(name: string, input: Record<string, unknown>) {
    const id = `toolu_demo_${this.run.id.slice(0, 8)}_${++this.n}`;
    emit(this.run, "response.tool_use", { tool_use_id: id, name, type: "generic", input, permission: { options: ["Allow this action", "Deny"] } });
    return id;
  }
  toolResult(id: string, name: string, json: Record<string, unknown>, ok = true) {
    emit(this.run, "response.tool_result", { tool_use_id: id, name, status: ok ? "success" : "error", content: [{ type: "json", json }] });
  }
  /** Streams Markdown; fenced sidekick-* blocks go out whole so the card renders in one frame. */
  async say(md: string) {
    const parts = md.split(/(```sidekick-[\s\S]*?```)/);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("```sidekick-")) {
        emit(this.run, "response.text.delta", { text: part });
        await this.sleep(120);
        continue;
      }
      const words = part.split(/(?<=[ \n])/);
      for (let i = 0; i < words.length; i += 4) {
        emit(this.run, "response.text.delta", { text: words.slice(i, i + 4).join("") });
        await this.sleep(28);
      }
    }
  }
}

const block = (kind: string, value: unknown) => "\n```sidekick-" + kind + "\n" + JSON.stringify(value) + "\n```\n";

// ------------------------------------------------------------------ routing

function pick(text: string): string {
  const t = text.toLowerCase();
  if (/(top )?trends?|analy[sz]e|pull out|insights? from/.test(t)) return "analysis";
  if (/\b(compose|build|create|make|new)\b.*\bsearch\b/.test(t)) return "compose";
  if (/shrink/.test(t)) return "shrink";
  if (/visit|talk to/.test(t)) return "visit";
  if (/\b(create|file|draft)\b.*\bwork item\b(?!s)/.test(t)) return "workitem";
  if (/\b(open|show)\b.*\bwork items\b/.test(t)) return "openWorkitems";
  if (/notify|message priya|send .*priya|tell priya/.test(t)) return "notify";
  if (/open .*(as a search|as search|in explorer)|open as search/.test(t)) return "openSearch";
  if (/dismiss/.test(t)) return "dismiss";
  if (/\brun\b.*(aop|monitor|watch|sentinel|drivers|now)/.test(t)) return "aopRun";
  if (/footwear|markdown|override/.test(t)) return "footwear";
  if (/refund/.test(t)) return "refunds";
  if (/associate/.test(t)) return "memory";
  return "fallback";
}

export async function runDemo(run: Run, req: ChatRequest): Promise<void> {
  const threadId = req.threadId ?? `demo-${crypto.randomUUID()}`;
  run.threadId = threadId;
  run.agent = "SIDEKICK_DEMO";
  emit(run, ProxyEvent.Run, { runId: run.id, threadId, agent: run.agent });
  const th: Thread = threads.get(threadId) ?? { scenario: "fallback", step: 0, mid: 1, text: "", data: {} };
  threads.set(threadId, th);
  const text = req.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n").trim();
  const ctx: Ctx = { results: {}, decisions: {} };
  for (const c of req.content) {
    if (c.type === "tool_result") ctx.results[c.tool_result.name] = { ok: c.tool_result.status !== "error", json: (c.tool_result.content.find((x) => x.type === "json") as any)?.json };
    if (c.type === "permission_decision") ctx.decisions[c.permission_decision.tool_use_id] = c.permission_decision.decision;
  }
  if (text) Object.assign(th, { scenario: pick(text), step: 0, text });
  emit(run, "metadata", { metadata: { role: "assistant", message_id: String(++th.mid) } });
  const io = new IO(run);
  try {
    await io.sleep(350);
    await (SCENARIOS[th.scenario] ?? SCENARIOS.fallback)(io, th, ctx);
    if (run.status === "running") finish(run, "completed");
  } catch (e) {
    if (e === CANCELLED) return;
    emit(run, ProxyEvent.Error, { message: (e as Error)?.message ?? String(e) });
    finish(run, "error");
  }
}

type Scenario = (io: IO, th: Thread, ctx: Ctx) => Promise<void>;

// ------------------------------------------------------------------ SQL shown in the activity panel

const SQL = {
  cases: `SELECT case_no, case_type, employee_name, case_status\nFROM APPRISS_LP.LPMS.CASES\nWHERE store_no = 341 AND case_status IN ('OPEN', 'PENDING')\nORDER BY opened_at DESC\nLIMIT 50;`,
  voids: `SELECT cashier_no, COUNT(*) AS line_void_events, SUM(void_amount) AS voided_amount,\n       COUNT(*) / AVG(COUNT(*)) OVER () AS vs_store_avg\nFROM APPRISS_LP.EXPLORER.TRANSACTION_LINES\nWHERE store_no = 341 AND line_action = 'VOID'\n  AND trading_day >= DATEADD(day, -30, CURRENT_DATE())\nGROUP BY cashier_no\nORDER BY line_void_events DESC;`,
  profile: (p: D.SearchParams) => `SELECT cashier_no, COUNT(DISTINCT transaction_id) AS unique_transactions,\n       SUM(ticket_amount) AS sum_ticket_amount,\n       SUM(ticket_amount) / NULLIF(COUNT(DISTINCT transaction_id), 0) AS avg_ticket\nFROM APPRISS_LP.EXPLORER.TRANSACTIONS\nWHERE store_no = ${p.store} AND has_${p.type === "any" ? "any_action" : p.type} AND ticket_amount < ${p.max}\n  AND trading_day >= DATEADD(day, -${p.days}, CURRENT_DATE())\nGROUP BY cashier_no\nORDER BY unique_transactions DESC;`,
  finding: (id: string) => `SELECT finding_id, aop_name, severity, summary, evidence, created_at\nFROM APPRISS_LP.SIDEKICK.AOP_FINDINGS\nWHERE finding_id = '${id}' AND user_role = 'LP_ANALYST';`,
  weekly: `SELECT DATE_TRUNC('week', trading_day) AS week, SUM(markdown_amount) AS override_markdowns,\n       COUNT(*) AS transactions\nFROM APPRISS_LP.EXPLORER.MARKDOWNS\nWHERE department = 'FOOTWEAR' AND reason_code = 'MANAGER_OVERRIDE'\n  AND trading_day >= DATEADD(week, -4, DATE_TRUNC('week', CURRENT_DATE()))\nGROUP BY 1 ORDER BY 1;`,
  refunds: `SELECT store_name, cashier, refunds_7d, refunds_baseline_8wk, refund_amount_7d, work_item_id\nFROM APPRISS_LP.SIDEKICK.AOP_FINDINGS_REFUND_SPIKES\nWHERE run_date = CURRENT_DATE() ORDER BY refunds_7d DESC;`,
  shrink: `SELECT store_name, store_manager, shrink_pct, top_driver, sent_at\nFROM APPRISS_LP.SIDEKICK.SHRINK_REPORT_DELIVERIES\nWHERE aop_name = 'WEEKLY_SHRINK_DRIVERS' ORDER BY shrink_pct DESC;`,
};

// ------------------------------------------------------------------ scenarios

function parseSearch(text: string): D.SearchParams {
  const t = text.toLowerCase();
  const store = Number(t.match(/store\s*(?:no\.?\s*)?#?(\d{2,4})/)?.[1] ?? 341);
  const max = Number(t.match(/\$\s?([\d,]+)/)?.[1]?.replace(/,/g, "") ?? 200);
  const type: D.SearchParams["type"] = /void/.test(t) ? "void" : /refund/.test(t) ? "refund" : /override/.test(t) ? "override" : "any";
  const days = /2 weeks|two weeks|14 days/.test(t) ? 14 : /\bweek\b|7 days/.test(t) ? 7 : /3 months|quarter|90 days/.test(t) ? 90 : 30;
  const p: D.SearchParams = { store, type, max, days };
  return { ...p, name: D.defaultSearchName(p) };
}

function searchFromUrl(url: string | undefined): D.SearchParams | undefined {
  if (!url || !url.includes("/results")) return undefined;
  const q = new URL(url, "http://x").searchParams;
  if (q.get("preset")) return undefined;
  const type = (q.get("type") ?? "void") as D.SearchParams["type"];
  const p: D.SearchParams = { store: Number(q.get("store")) || 341, type, max: Number(q.get("max")) || 200, days: Number(q.get("days")) || 30 };
  return { ...p, name: q.get("name") || D.defaultSearchName(p) };
}

const SCENARIOS: Record<string, Scenario> = {
  async visit(io) {
    await io.think("The user is visiting Store 341 today and wants talking points for the store manager. I'll pull open and pending LPMS cases for the store and the cashier-level void pattern from the last 30 days, then rank what to raise.");
    await io.tool("lpms_cases_analyst", "cortex_analyst_text_to_sql", { query: "Open and pending cases at store 341" }, { sql: SQL.cases, rows: 50 });
    await io.tool("lp_transactions_analyst", "cortex_analyst_text_to_sql", { query: "Line void events by cashier at store 341, last 30 days" }, { sql: SQL.voids, rows: 83 });
    const open = D.STORE_341_CASES.filter((c) => c.status === "Open" && c.type === "External");
    const pending = D.STORE_341_CASES.filter((c) => c.status === "Pending");
    const table = (rows: D.CaseRow[]) => `| Case No. | Type | Employee |\n|---|---|---|\n${rows.map((c) => `| [${c.caseNo}](/apps/portal/workitems) | ${c.type} | ${c.employee} |`).join("\n")}\n`;
    await io.say(`Here's a briefing for your visit to **Store 341**.\n\n**Open cases (external):**\n\n${table(open)}\n**Pending cases (selected):**\n\n${table(pending)}\n> There are **50 cases** returned (capped at 50). There are **88 total cases** on record for this store, some may need attention. Review the full case list in LPMS for a complete picture.\n\n### Summary for your manager meeting\n`);
    await io.say(
      block("priorities", [
        { level: "red", title: "Priority:", text: "Discuss Cashier **1644200** and the high line void pattern: 55 events, $574.62 voided, 4.5x the store average. Ask the manager if they are aware and what steps are being taken." },
        { level: "orange", title: "Internal case PIX341-2005-1", text: "is open. Worth reviewing with the manager given it's an internal matter." },
        { level: "yellow", title: "Multiple open external cases:", text: "confirm progress and whether any require escalation." },
        { level: "yellow", title: "Large number of pending cases:", text: "discuss whether resources are available to resolve them." },
      ]) + "\nWould you like me to pull more details on any specific item, or take any actions before your visit?",
    );
  },

  async compose(io, th, ctx) {
    const p: D.SearchParams = th.data.search ?? (th.data.search = parseSearch(th.text));
    if (th.step === 0) {
      await io.think(`Compose a new Explorer search: store ${p.store}, transactions that include a ${p.type}, ticket amount under $${p.max}, trading day within the last ${p.days} days. I'll open the Search Composer and set each filter.`);
      io.status("Opening Search Composer");
      th.step = 1;
      return io.clientTools([{ name: "browser_navigate", input: { url: "/apps/portal/composer" } }]);
    }
    if (th.step === 1) {
      th.step = 2;
      return io.clientTools([
        { name: "browser_fill", input: { testid: "composer-name", value: p.name } },
        { name: "browser_fill", input: { testid: "composer-store", value: String(p.store) } },
        { name: "browser_select", input: { testid: "composer-type", value: p.type } },
        { name: "browser_fill", input: { testid: "composer-max", value: String(p.max) } },
        { name: "browser_select", input: { testid: "composer-range", value: String(p.days) } },
      ]);
    }
    if (th.step === 2) {
      th.step = 3;
      return io.clientTools([{ name: "browser_click", input: { testid: "composer-run" } }]);
    }
    const rows = D.searchResults(p);
    const tx = rows.reduce((s, r) => s + r.transactions, 0);
    const ran = ctx.results.browser_click?.ok !== false;
    await io.say(
      `I've updated the search with the following changes:\n\n- **Search name:** ${p.name}\n- **Store No:** ${p.store}\n- **Transaction includes:** ${p.type === "any" ? "Any transaction" : p.type === "override" ? "Manager override" : p.type[0].toUpperCase() + p.type.slice(1)}\n- **Ticket amount:** less than ${D.money(p.max)}\n- **Trading day within:** ${p.days === 30 ? "the last month" : `the last ${p.days} days`}\n\n` +
        (ran ? `The search returned **${rows.length} cashiers** across **${D.num(tx)} transactions** and is open in Results. Want me to pull out the top trends?` : "The search is set up in the Composer. Select **Run search** when you're ready."),
    );
  },

  async analysis(io, th, ctx) {
    if (th.step === 0) {
      await io.think("The user wants the top trends from the search on screen. I'll read the current Results page and table first.");
      th.step = 1;
      return io.clientTools([{ name: "browser_get_page", input: {} }, { name: "browser_get_table", input: { testid: "results-table" } }]);
    }
    const p = searchFromUrl(ctx.results.browser_get_page?.json?.url) ?? D.STORE_341_VOIDS;
    const rows = ctx.results.browser_get_table?.json?.rowCount ?? D.searchResults(p).length;
    await io.think(`${rows} rows, one per cashier. Profile volume, ticket amount and average ticket per cashier, look for zero-value activity, outlier volume and under-ringing, then rank findings HIGH / MEDIUM / LOW.`);
    await io.tool("lp_transactions_analyst", "cortex_analyst_text_to_sql", { query: `Cashier-level ticket profile for ${p.name}` }, { sql: SQL.profile(p), rows });
    io.status("Ranking findings");
    await io.sleep(700);
    const a = D.analyze(p, th.text || "Pull out top trends from this data");
    await io.say(`I analyzed the **${a.recordCount} records** in **${p.name}** and ranked **${a.findings.length} findings**. The full write-up is open in Sidekick Analysis Results.\n` + block("analysis", a));
  },

  async footwear(io) {
    const f = D.footwearFinding();
    io.status("Opening finding from Markdown Category Monitor");
    await io.tool("aop_findings_analyst", "cortex_analyst_text_to_sql", { query: "Latest Markdown Category Monitor finding for Footwear" }, { sql: SQL.finding(f.id), rows: 1 });
    await io.tool("lp_transactions_analyst", "cortex_analyst_text_to_sql", { query: "Weekly manager-override markdowns in Footwear, last 4 weeks" }, { sql: SQL.weekly, rows: 4 });
    await io.tool("lp_policy_search", "cortex_search", { query: "manager override markdown limit per cashier per week" }, { results: [{ doc: "Markdown Policy 2026.pdf", section: "4.2" }] }, 800);
    await io.say(
      `**${f.title}**\n\nLast week (${f.week}), Footwear had **${D.money(f.lastWeek)}** in manager-override markdowns across **${D.num(f.lastTx)}** transactions. That is **${f.pct}% above** the prior 3-week average of **${D.money(f.priorAvg)}** (${f.priorTx} transactions).\n` +
        block("weekly", { title: "Footwear manager-override markdowns, by week ($K)", bars: f.bars, avg: f.avg, unit: "K" }) +
        block("stats", [
          { value: `+${f.pct}%`, label: "vs prior 3-week avg", tone: "danger" },
          { value: D.money(f.extra, false), label: "extra markdown $" },
          { value: `${f.concentration}%`, label: "of it from 3 stores" },
        ]) +
        `\n| Store | Increase | Top cashier |\n|---|---|---|\n${f.stores.map((s) => `| [${s.store}](/apps/portal/stores/${s.storeNo}) | +${D.money(s.increase)} | ${s.top} |`).join("\n")}\n\n` +
        `One cashier, **@Marcus Hale** at Store 2047, applied 212 of the overrides. Policy caps overrides at 25 per cashier per week ([Markdown Policy 2026.pdf](/apps/portal/docs/markdown-policy)).\n` +
        block("footnote", "Assumptions: Sunday-Saturday weeks, all Footwear stores, manager-override reason codes only. Clearance and promo markdowns are excluded. Found by the Markdown Category Monitor AOP at 2:14 AM.") +
        block("actions", [
          { label: "Open as search", prompt: "Open the Footwear manager-override markdowns finding as a search", primary: true, icon: "search" },
          { label: "Create work item", prompt: "Create a work item for Marcus Hale at Store 2047 from this finding", icon: "plus" },
          { label: `Notify ${D.MANAGER.first}`, prompt: `Notify ${D.MANAGER.first} about the Footwear manager-override markdowns finding`, icon: "chat" },
          { label: "Dismiss", prompt: "Dismiss the Footwear finding", icon: "x" },
        ]),
    );
  },

  async openSearch(io, th) {
    const f = D.footwearFinding();
    if (th.step === 0) {
      th.step = 1;
      io.status("Opening the finding in Explorer");
      return io.clientTools([{ name: "browser_navigate", input: { url: "/apps/portal/results?preset=footwear-overrides" } }]);
    }
    await io.say(`Opened **Footwear Manager-Override Markdowns, Week of ${f.week}** in Results with the same filters the AOP used: Department = Footwear, reason code = manager override, clearance and promo excluded. **11 stores** are above their 3-week average, led by Store 2047 Charlotte SouthPark.` + block("actions", [{ label: "Create work item", prompt: "Create a work item for Marcus Hale at Store 2047 from this finding", primary: true, icon: "plus" }, { label: `Notify ${D.MANAGER.first}`, prompt: `Notify ${D.MANAGER.first} about the Footwear manager-override markdowns finding`, icon: "chat" }]));
  },

  async workitem(io, th, ctx) {
    if (th.step === 0) {
      await io.think("Draft a work item from the Footwear finding for Marcus Hale at Store 2047, prefilled with the evidence. Creating it is a write action, so the user approves the submit.");
      th.step = 1;
      return io.clientTools([{ name: "browser_navigate", input: { url: "/apps/portal/workitems/new?finding=footwear-overrides" } }]);
    }
    if (th.step === 1) {
      th.step = 2;
      return io.clientTools([{ name: "browser_click", input: { testid: "workitem-submit" } }]);
    }
    const r = ctx.results.browser_click;
    if (!r?.ok) return io.say("No problem, I didn't create anything. The draft is still open in Work Items if you want to edit it first.");
    const id = String(r.json?.url ?? "").match(/created=(WI-\d+)/)?.[1] ?? "WI-24121";
    await io.say(`Created work item **${id}** for **Marcus Hale** at **Store 2047 Charlotte SouthPark**: priority High, assigned to you. It links back to this finding and cites Markdown Policy 2026.pdf, section 4.2.` + block("actions", [{ label: `Notify ${D.MANAGER.first}`, prompt: `Notify ${D.MANAGER.first} about the Footwear manager-override markdowns finding`, primary: true, icon: "chat" }]));
  },

  async openWorkitems(io, th) {
    if (th.step === 0) {
      th.step = 1;
      return io.clientTools([{ name: "browser_navigate", input: { url: "/apps/portal/workitems" } }]);
    }
    await io.say(`Your Work Items are open. The four **Refund Spike Watch** items (${D.REFUND_CASHIERS.map((c) => c.workItem).join(", ")}) are at the top, all priority High and assigned to you.`);
  },

  async notify(io, th, ctx) {
    if (th.step === 0) {
      await io.think(`Send ${D.MANAGER.first} ${D.MANAGER.last} (${D.MANAGER.role}) a short note with the finding and a link. Sending a message needs the user's approval.`);
      th.step = 1;
      th.data.tool = io.permission("send_teams_message", { to: `${D.MANAGER.first} ${D.MANAGER.last} (${D.MANAGER.role})`, message: `Heads up: Footwear manager-override markdowns are up 30% week over week ($12,360 extra). 61% comes from 3 stores; Marcus Hale at Store 2047 applied 212 overrides vs the 25/week cap. Finding and evidence are in Sidekick.` });
      return;
    }
    const decision = ctx.decisions[th.data.tool] ?? "";
    if (/deny/i.test(decision)) return io.say("Okay, nothing was sent.");
    io.toolResult(th.data.tool, "send_teams_message", { ok: true, delivered: true });
    await io.say(`Sent to **${D.MANAGER.first} ${D.MANAGER.last}** (${D.MANAGER.role}) in Teams with a link to this finding. I'll let you know when she responds.`);
  },

  async dismiss(io) {
    await io.say("Dismissed. I'll stop surfacing this finding unless the increase grows by another 10% or a new store crosses the policy cap. You can find it under **Inbox › Dismissed**.");
  },

  async refunds(io) {
    await io.tool("aop_findings_analyst", "cortex_analyst_text_to_sql", { query: "Today's Refund Spike Watch results" }, { sql: SQL.refunds, rows: 4 });
    const total = D.REFUND_CASHIERS.reduce((s, c) => s + c.refunds, 0);
    await io.say(
      `**Refund Spike Watch** flagged **4 cashiers** at 6:00 AM. Each logged at least 3x their 8-week refund baseline in the last 7 days, so the AOP opened a work item for each.\n` +
        block("stats", [
          { value: String(total), label: "refunds in 7 days", tone: "danger" },
          { value: `${(total / D.REFUND_CASHIERS.reduce((s, c) => s + c.baseline, 0)).toFixed(1)}x`, label: "vs 8-week baseline" },
          { value: D.money(D.REFUND_CASHIERS.reduce((s, c) => s + c.amount, 0), false), label: "refunded" },
        ]) +
        `\n| Store | Cashier | Refunds (7d) | Baseline | Work item |\n|---|---|---|---|---|\n${D.REFUND_CASHIERS.map((c) => `| ${c.store} | ${c.cashier} | ${c.refunds} | ${c.baseline} | [${c.workItem}](/apps/portal/workitems) |`).join("\n")}\n\nStore 2047 also shows up in the Footwear markdown finding, so it is worth reviewing both together.` +
        block("actions", [{ label: "Open work items", prompt: "Open my refund spike work items", primary: true, icon: "search" }, { label: `Notify ${D.MANAGER.first}`, prompt: `Notify ${D.MANAGER.first} about the refund spike cashiers`, icon: "chat" }]),
    );
  },

  async shrink(io) {
    await io.tool("aop_findings_analyst", "cortex_analyst_text_to_sql", { query: "Weekly Shrink Drivers deliveries" }, { sql: SQL.shrink, rows: 5 });
    await io.say(
      `Your **Weekly Shrink Drivers** AOP sent a one-page report to **5 store managers** on ${D.dayLabel(D.lastMonday())} at 8:00 AM. Nothing needs your action.\n\n| Store | Manager | Shrink % | Top driver |\n|---|---|---|---|\n${D.SHRINK_REPORTS.map((r) => `| ${r.store} | ${r.manager} | ${r.shrink.toFixed(2)}% | ${r.driver} |`).join("\n")}\n\nStore 2047's top driver matches today's Footwear finding, so its manager will hear about it twice this week.` +
        block("actions", [{ label: "Walk me through the Footwear finding", prompt: "Walk me through the manager-override markdowns finding in Footwear", primary: true, icon: "search" }]),
    );
  },

  async aopRun(io, th) {
    const t = th.text.toLowerCase();
    const aop = D.aops().find((a) => t.includes(a.name.toLowerCase().split(" ")[0])) ?? D.aops()[0];
    const task = `APPRISS_LP.SIDEKICK.${aop.name.toUpperCase().replace(/\W+/g, "_")}`;
    io.status(`Triggering AOP: ${aop.name}`);
    await io.tool("aop_task_runner", "generic", { task }, { sql: `EXECUTE TASK ${task};\n-- scheduled: CREATE TASK ${task} WAREHOUSE = SIDEKICK_WH\n--   SCHEDULE = 'USING CRON ${aop.cron} America/New_York' AS CALL ...;`, state: "SUCCEEDED" }, 1400);
    await io.tool("lp_transactions_analyst", "cortex_analyst_text_to_sql", { query: "Weekly manager-override markdowns by category, last 4 weeks" }, { sql: SQL.weekly.replace("department = 'FOOTWEAR' AND ", ""), rows: 48 }, 1200);
    await io.tool("lp_policy_search", "cortex_search", { query: "manager override markdown thresholds" }, { results: [{ doc: "Markdown Policy 2026.pdf", section: "4.2" }] }, 700);
    io.status("Writing findings to the Inbox");
    await io.sleep(600);
    await io.say(
      `**${aop.name}** finished in 14 seconds. This was an on-demand run of the same Snowflake task that runs on its schedule (**${aop.schedule}**, cron \`${aop.cron}\`).\n\n- Scanned 4 weeks of manager-override markdowns across 12 categories\n- 1 category above threshold: **Footwear, +30%**, unchanged since the 2:14 AM run\n- No new findings in Apparel, Accessories or Home\n\nYour Inbox is up to date. Findings are only suggestions; nothing was created or changed.` +
        block("actions", [{ label: "Walk me through it", prompt: "Walk me through the manager-override markdowns finding in Footwear", primary: true, icon: "search" }]),
    );
  },

  async memory(io) {
    await io.say("Got it. From now on I'll say **associate** instead of cashier, for everyone in your organization. Admins can change this under **Admin › Sidekick › Business context**.");
  },

  async fallback(io) {
    await io.say(
      "I'm running on the **scripted demo agent**, so today I can walk through:\n\n- **While you were away:** the Footwear markdown finding, refund spikes and shrink reports\n- **Search Composer:** *Compose a search for all transactions less than $200 in the last month that included a void at store 341*\n- **Analyze Results:** *Pull out top trends from this data*\n- **Store visits:** *I'm visiting store 341 today. What should I talk to the store manager about?*\n- **AOPs:** *Run the Markdown Category Monitor now*\n\nConnect a Cortex Agent in `.env` to answer anything else live.",
    );
  },
};
