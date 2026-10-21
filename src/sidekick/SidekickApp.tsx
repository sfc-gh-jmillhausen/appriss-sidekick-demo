// Appriss Retail layout: the Sidekick panel docked on the left (Chat / Inbox / AOPs, Analysis
// Results view, Prompt Library) and the Appriss Retail portal on the right, which the agent
// drives through the browser_* client-side tools. Reuses the chat session/store from src/chat.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PublicConfig, UserContentItem } from "../../shared/protocol";
import { aops, inbox, PERSONA, PROMPT_LIBRARY, type Analysis, type InboxItem } from "../../shared/appriss/data";
import { getBrand } from "../brand/brand.config";
import { applyTheme } from "../brand/theme";
import { browserHost, useBrowser } from "../browser/host";
import { emptyAssistant, isBusy, resumeConversation, sendTurn, stopTurn } from "../chat/session";
import { createConversation, deleteConversation, setActive, updateConversation, useStore } from "../chat/store";
import type { UIMessage } from "../chat/types";
import { friendlyLabel, SidekickMessage } from "./SidekickMessage";
import { AnalysisView, Icon, SidekickCtx, Sparkle } from "./widgets";
import "./sidekick.css";

const InlinePortal = lazy(() => import("../apps/portal/PortalApp").then((m) => ({ default: m.InlinePortal })));

type Tab = "chat" | "inbox" | "aops";
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

function Badge({ item }: { item: InboxItem }) {
  return <span className={`sk-badge ${item.badge}`}>{item.badgeText}</span>;
}

function Digest({ onOpen, onTab }: { onOpen: (i: InboxItem) => void; onTab: (t: Tab) => void }) {
  const fresh = inbox().filter((i) => i.fresh);
  return (
    <div className="sk-row assistant">
      <div className="sk-avatar" aria-hidden>
        <Sparkle size={14} />
      </div>
      <div className="sk-msg sk-digest" data-testid="sk-digest">
        <div className="sk-digest-h">While you were away</div>
        <p>
          {greeting()}, {PERSONA.first}. Your AOPs ran <b>{fresh.length} jobs</b> since you were last here, and <b>one needs your review</b>.
        </p>
        <ul className="sk-digest-list">
          {fresh.map((i) => (
            <li key={i.id}>
              <button onClick={() => onOpen(i)} data-testid={`digest-${i.id}`}>
                <span className="sk-ring" aria-hidden />
                <span className="sk-digest-t">
                  <b>{i.title}</b>
                  <span className="sk-muted">
                    {i.source} · {i.when}
                  </span>
                </span>
                <Badge item={i} />
              </button>
            </li>
          ))}
        </ul>
        <div className="sk-tip">Tip: type @ to bring in a person, store, saved search or file. Type / for commands like /run.</div>
        <div className="sk-actions">
          <button className="sk-act soft" onClick={() => onTab("inbox")} data-testid="digest-open-inbox">
            <Icon name="check" size={13} /> Open Inbox
          </button>
          <button className="sk-act soft" onClick={() => onTab("aops")} data-testid="digest-view-aops">
            <Icon name="aop" size={13} /> View AOPs
          </button>
        </div>
      </div>
    </div>
  );
}

function InboxTab({ onOpen }: { onOpen: (i: InboxItem) => void }) {
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const items = inbox().filter((i) => (filter === "all" ? true : filter === "open" ? i.fresh : !i.fresh));
  return (
    <div className="sk-pane" data-testid="sk-inbox">
      <div className="sk-seg">
        {(["all", "open", "closed"] as const).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "open" ? "New" : "Resolved & dismissed"}
          </button>
        ))}
      </div>
      <ul className="sk-list">
        {items.map((i) => (
          <li key={i.id}>
            <button onClick={() => onOpen(i)} data-testid={`inbox-${i.id}`} className={i.fresh ? "" : "dim"}>
              <span className={`sk-ring ${i.fresh ? "" : "done"}`} aria-hidden />
              <span className="sk-digest-t">
                <b>{i.title}</b>
                <span className="sk-muted">
                  {i.source} · {i.when}
                </span>
              </span>
              <Badge item={i} />
            </button>
          </li>
        ))}
      </ul>
      <p className="sk-muted small sk-pad">Findings come from your AOPs. Sidekick suggests; nothing is created or changed on its own.</p>
    </div>
  );
}

function AopsTab({ onRun }: { onRun: (name: string) => void }) {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return (
    <div className="sk-pane" data-testid="sk-aops">
      <p className="sk-muted small sk-pad">AOPs run on a schedule after your nightly data load and drop findings in your Inbox. Each one is a Snowflake task calling the anomaly agent.</p>
      {aops().map((a) => {
        const enabled = on[a.id] ?? a.enabled;
        return (
          <div key={a.id} className="sk-aop" data-testid={`aop-${a.id}`}>
            <div className="sk-aop-h">
              <b>{a.name}</b>
              <label className="sk-toggle" aria-label={`Enable ${a.name}`}>
                <input type="checkbox" checked={enabled} onChange={(e) => setOn((x) => ({ ...x, [a.id]: e.target.checked }))} />
                <span />
              </label>
            </div>
            <div className="sk-muted small">{a.description}</div>
            <div className="sk-aop-meta">
              <span className="sk-chip">{a.schedule}</span>
              <span className="sk-muted small">
                Last run {a.lastRun} · {a.lastResult}
              </span>
              <button className="sk-act soft" onClick={() => onRun(a.name)} disabled={!enabled} data-testid={`aop-run-${a.id}`}>
                Run now
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PromptLibrary({ onPick, onClose }: { onPick: (p: string) => void; onClose: () => void }) {
  return (
    <div className="sk-modal" role="dialog" aria-label="Sidekick Prompt Library" onClick={onClose}>
      <div className="sk-library" onClick={(e) => e.stopPropagation()}>
        <div className="sk-library-h">
          <h2>Sidekick Prompt Library</h2>
          <button className="sk-icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="sk-library-grid">
          {PROMPT_LIBRARY.map((p) => (
            <button key={p.category} className="sk-lib-card" onClick={() => onPick(p.prompt)} data-testid={`lib-${p.category.toLowerCase().replace(/\W+/g, "-")}`}>
              <div className="sk-lib-cat">{p.category}</div>
              <div className="sk-lib-body">
                <div className="sk-muted small">Try asking:</div>
                <div className="sk-lib-p">{p.prompt}</div>
                <div className="sk-lib-hint">{p.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Composer({ busy, onSend, onStop, onLibrary, draft, setDraft }: { busy: boolean; onSend: (t: string) => void; onStop: () => void; onLibrary: () => void; draft: string; setDraft: (s: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [draft]);
  const submit = () => {
    const t = draft.trim();
    if (!t || busy) return;
    // "/run markdown" is shorthand for running an AOP on demand.
    const run = t.match(/^\/run\s+(.+)/i);
    onSend(run ? `Run the ${run[1]} AOP now` : t);
    setDraft("");
  };
  return (
    <div className="sk-composer">
      <button className="sk-icon-btn" aria-label="Prompt library" title="Prompt library" onClick={onLibrary} data-testid="sk-library">
        <Icon name="book" />
      </button>
      <textarea
        id="sk-input"
        ref={ref}
        rows={1}
        value={draft}
        placeholder="Ask Sidekick anything…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        data-testid="composer-input"
        aria-label="Message Sidekick"
      />
      {busy ? (
        <button className="sk-send stop" aria-label="Stop" onClick={onStop} data-testid="composer-stop">
          <Icon name="stop" />
        </button>
      ) : (
        <button className="sk-send" aria-label="Send" onClick={submit} disabled={!draft.trim()} data-testid="composer-send">
          <Icon name="send" />
        </button>
      )}
    </div>
  );
}

function PortalPane() {
  const st = useBrowser();
  const mount = useSyncExternalStore(browserHost.subscribe, () => browserHost.mount);
  const cursorFresh = st.cursor && Date.now() - st.cursor.at < 2600;
  return (
    <section className="ap-pane" aria-label="Appriss Retail portal">
      {cursorFresh && (
        <div className="sk-agent-cursor" key={st.cursor!.at} aria-live="polite">
          <Sparkle size={12} /> Sidekick · {friendlyLabel(st.cursor!.label)}
        </div>
      )}
      <Suspense fallback={<div className="ap-loading">Loading portal…</div>}>
        <InlinePortal key={mount.key} initialUrl={mount.url} />
      </Suspense>
    </section>
  );
}

export default function SidekickApp() {
  const brand = getBrand();
  const { list, activeId } = useStore();
  const [tab, setTab] = useState<Tab>("chat");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [library, setLibrary] = useState(false);
  const [history, setHistory] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const active = list.find((c) => c.id === activeId);
  const last = active?.messages.at(-1);
  const busy = !!active && (isBusy(active.id) || (last?.role === "assistant" && ["submitting", "thinking", "streaming"].includes(last.status)));
  const initials = `${PERSONA.first[0]}${PERSONA.last[0]}`;

  useEffect(() => {
    applyTheme(brand, "light");
    document.title = "Sidekick · Appriss Retail";
    browserHost.setOpen(true);
    fetch("/api/config").then((r) => (r.ok ? r.json() : null)).then(setCfg).catch(() => undefined);
  }, [brand]);
  useEffect(() => {
    if (activeId) void resumeConversation(activeId);
  }, [activeId]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [last?.text.length, last?.steps.length, last?.approvals.length, active?.messages.length, tab]);

  const send = useCallback(
    (text: string) => {
      setTab("chat");
      setAnalysis(null);
      const conv = active ?? createConversation(brand.id);
      const userMsg: UIMessage = { ...emptyAssistant("assist"), role: "user", text, status: "done" };
      const asst = emptyAssistant("assist");
      updateConversation(conv.id, (c) => ({ ...c, title: c.messages.length ? c.title : text.slice(0, 60), messages: [...c.messages, userMsg, asst] }));
      const content: UserContentItem[] = [{ type: "text", text }];
      void sendTurn(conv.id, asst.id, content, "assist");
    },
    [active, brand.id],
  );
  const openAnalysis = useCallback((a: Analysis) => setAnalysis(a), []);
  const api = useMemo(() => ({ send, openAnalysis, busy }), [send, openAnalysis, busy]);
  const openItem = (i: InboxItem) => send(i.prompt);
  const newChat = () => {
    setActive(null);
    setAnalysis(null);
    setTab("chat");
    setHistory(false);
  };

  return (
    <SidekickCtx.Provider value={api}>
      <div className={`sk-shell ${collapsed ? "collapsed" : ""}`}>
        {!collapsed && (
          <aside className="sk-panel" aria-label="Sidekick">
            {analysis ? (
              <AnalysisView
                a={analysis}
                onBack={() => setAnalysis(null)}
                onContinue={() => {
                  setAnalysis(null);
                  setTimeout(() => document.getElementById("sk-input")?.focus(), 50);
                }}
              />
            ) : (
              <>
                <header className="sk-head">
                  <Sparkle size={18} />
                  <span className="sk-name">{brand.productName}</span>
                  <span className="sk-beta">BETA</span>
                  <span className="sk-head-icon" title={cfg?.demo ? "Scripted demo agent" : `Cortex Agent ${cfg?.agent ?? ""}`}>
                    <Icon name="bubble" size={13} />
                  </span>
                  <span className="sk-spacer" />
                  <button className="sk-pillbtn" aria-label="Conversation history" onClick={() => setHistory((h) => !h)} data-testid="sk-history">
                    <Icon name="menu" />
                  </button>
                  <button className="sk-pillbtn" aria-label="New chat" onClick={newChat} data-testid="new-chat">
                    <Icon name="plus" />
                  </button>
                  <button className="sk-icon-btn" aria-label="Close Sidekick" onClick={() => setCollapsed(true)} data-testid="sk-close">
                    <Icon name="x" />
                  </button>
                  {history && (
                    <div className="sk-history" role="menu">
                      <div className="sk-muted small">Recent conversations</div>
                      {list.length === 0 && <div className="sk-muted small">No conversations yet.</div>}
                      {list.slice(0, 12).map((c) => (
                        <div key={c.id} className={`sk-history-row ${c.id === activeId ? "on" : ""}`}>
                          <button onClick={() => (setActive(c.id), setHistory(false), setTab("chat"))}>{c.title}</button>
                          <button aria-label={`Delete ${c.title}`} onClick={() => deleteConversation(c.id)}>
                            <Icon name="x" size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </header>
                <nav className="sk-tabs" role="tablist">
                  {(
                    [
                      ["chat", "Chat", "bubble"],
                      ["inbox", "Inbox", "check"],
                      ["aops", "AOPs", "aop"],
                    ] as const
                  ).map(([id, label, icon]) => (
                    <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)} data-testid={`tab-${id}`}>
                      <Icon name={icon} size={13} /> {label}
                      {id === "inbox" && <span className="sk-count">3</span>}
                    </button>
                  ))}
                </nav>
                <div className="sk-body" ref={scroller}>
                  {tab === "chat" && (
                    <div className="sk-thread" data-testid="messages">
                      <div className="sk-row assistant">
                        <div className="sk-avatar" aria-hidden>
                          <Sparkle size={14} />
                        </div>
                        <div className="sk-msg">{brand.emptyPrompt}</div>
                      </div>
                      <Digest onOpen={openItem} onTab={setTab} />
                      {active?.messages.map((m) => <SidekickMessage key={m.id} m={m} convId={active.id} initials={initials} />)}
                    </div>
                  )}
                  {tab === "inbox" && <InboxTab onOpen={openItem} />}
                  {tab === "aops" && <AopsTab onRun={(name) => send(`Run the ${name} now`)} />}
                </div>
                <Composer busy={busy} onSend={send} onStop={() => active && stopTurn(active.id)} onLibrary={() => setLibrary(true)} draft={draft} setDraft={setDraft} />
              </>
            )}
          </aside>
        )}
        <PortalPane />
        {collapsed && (
          <button className="sk-launcher" onClick={() => setCollapsed(false)} data-testid="sk-open">
            <Sparkle size={18} /> Sidekick
          </button>
        )}
        {library && (
          <PromptLibrary
            onPick={(p) => {
              setLibrary(false);
              setDraft(p);
              setTimeout(() => document.getElementById("sk-input")?.focus(), 50);
            }}
            onClose={() => setLibrary(false)}
          />
        )}
      </div>
    </SidekickCtx.Provider>
  );
}
