"use client";
/* eslint-disable @next/next/no-img-element -- vinext's next/image shim uses a second React renderer in the browser. */

import { useEffect, useMemo, useState } from "react";
import PairingPanel from "./PairingPanel";
import { getStoredPairing, type StoredPairing } from "../lib/pairingStore";

type AttentionReason =
  | "user-input"
  | "review"
  | "manual-testing"
  | "blocked"
  | "agent-handoff";

type SessionState = "working" | "waiting" | "done" | "blocked";

type Session = {
  id: string;
  title: string;
  project: string;
  agent: "Claude" | "Codex";
  model: string;
  state: SessionState;
  updated: string;
  branch: string;
  worktree: string;
  summary: string;
  myNotes: string;
  nextAction: string;
  waitingOn: string;
  attentionReasons: AttentionReason[];
};

const attentionLabels: Record<AttentionReason, string> = {
  "user-input": "Your input",
  review: "Review",
  "manual-testing": "Manual test",
  blocked: "Blocked",
  "agent-handoff": "Agent handoff",
};

const attentionIcons: Record<AttentionReason, string> = {
  "user-input": "?",
  review: "✓",
  "manual-testing": "⌁",
  blocked: "!",
  "agent-handoff": "↗",
};

const seedSessions: Session[] = [
  {
    id: "workflow-metadata",
    title: "Session workflow metadata",
    project: "Nimbalyst",
    agent: "Claude",
    model: "Opus 4.1",
    state: "waiting",
    updated: "2m",
    branch: "feat/session-workflow-metadata",
    worktree: "C:\\Code\\Nimbalyst",
    summary: "Add personal workflow context without disturbing session execution or sync.",
    myNotes: "Desktop flow looks great. Keep the mobile surface focused and calm.",
    nextAction: "Review the PWA session detail and workflow editor on a phone.",
    waitingOn: "Your visual review",
    attentionReasons: ["review"],
  },
  {
    id: "sync-contract",
    title: "Encrypted metadata sync contract",
    project: "Nimbalyst",
    agent: "Codex",
    model: "GPT-5.6",
    state: "working",
    updated: "8m",
    branch: "feat/session-workflow-metadata",
    worktree: "C:\\Code\\Nimbalyst",
    summary: "Verify additive metadata fields across desktop, browser, and mobile clients.",
    myNotes: "Unknown attention reasons must remain forward-compatible.",
    nextAction: "Have Claude review reconnection and conflict behavior.",
    waitingOn: "Codex test run",
    attentionReasons: ["agent-handoff"],
  },
  {
    id: "windows-packaging",
    title: "Windows native packaging",
    project: "Nimbalyst",
    agent: "Claude",
    model: "Sonnet 4",
    state: "blocked",
    updated: "21m",
    branch: "chore/windows-packaging",
    worktree: "C:\\Code\\Nimbalyst-windows",
    summary: "Produce a reliable signed Windows build for the personal fork.",
    myNotes: "Visual Studio C++ workload is installed and native modules compile.",
    nextAction: "Retry the release packaging job.",
    waitingOn: "Signing certificate decision",
    attentionReasons: ["blocked", "user-input"],
  },
  {
    id: "command-center-copy",
    title: "Command center onboarding copy",
    project: "Nimbalyst",
    agent: "Codex",
    model: "GPT-5.6",
    state: "done",
    updated: "1h",
    branch: "feat/onboarding-copy",
    worktree: "C:\\Code\\Nimbalyst-copy",
    summary: "Explain the human orchestration layer in one short first-run experience.",
    myNotes: "Copy is concise and ready for a final read.",
    nextAction: "Approve or leave comments.",
    waitingOn: "",
    attentionReasons: ["review"],
  },
  {
    id: "context-inspector",
    title: "Context Inspector research",
    project: "Nimbalyst",
    agent: "Claude",
    model: "Opus 4.1",
    state: "done",
    updated: "3h",
    branch: "research/context-inspector",
    worktree: "C:\\Code\\Nimbalyst-research",
    summary: "Catalog context sources for a possible later inspector.",
    myNotes: "Useful later, but not justified for version one.",
    nextAction: "No action—revisit after real workflow pain appears.",
    waitingOn: "",
    attentionReasons: [],
  },
];

const storageKey = "nimbalyst-pwa-demo-sessions-v1";

function StateDot({ state }: { state: SessionState }) {
  return <span className={`state-dot state-${state}`} aria-hidden="true" />;
}

function AttentionPill({ reason }: { reason: AttentionReason }) {
  return (
    <span className={`attention-pill attention-${reason}`}>
      <span aria-hidden="true">{attentionIcons[reason]}</span>
      {attentionLabels[reason]}
    </span>
  );
}

function SessionRow({
  session,
  selected,
  onSelect,
}: {
  session: Session;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`session-row ${selected ? "session-row-selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <div className="session-row-main">
        <div className="session-title-line">
          <StateDot state={session.state} />
          <strong>{session.title}</strong>
          <span className="session-time">{session.updated}</span>
        </div>
        <p>{session.summary}</p>
        <div className="session-meta">
          <span>{session.agent}</span>
          <span>{session.model}</span>
          <span className="branch-name">{session.branch}</span>
        </div>
      </div>
      {session.attentionReasons.length > 0 && (
        <div className="session-attention">
          {session.attentionReasons.map((reason) => (
            <AttentionPill key={reason} reason={reason} />
          ))}
        </div>
      )}
      <span className="row-chevron" aria-hidden="true">›</span>
    </button>
  );
}

function EmptyAttention({ onShowAll }: { onShowAll: () => void }) {
  return (
    <div className="empty-attention">
      <span className="empty-check" aria-hidden="true">✓</span>
      <h2>You’re caught up</h2>
      <p>No agent sessions need your attention right now.</p>
      <button type="button" onClick={onShowAll}>View all sessions</button>
    </div>
  );
}

export default function NimbalystMobile() {
  const [sessions, setSessions] = useState(seedSessions);
  const [view, setView] = useState<"attention" | "all">("attention");
  const [selectedId, setSelectedId] = useState(seedSessions[0].id);
  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [pairingLoaded, setPairingLoaded] = useState(false);
  const [pairing, setPairing] = useState<StoredPairing>();
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    void getStoredPairing()
      .then((stored) => setPairing(stored))
      .finally(() => setPairingLoaded(true));
  }, []);

  useEffect(() => {
    let restored: Session[] | null = null;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) restored = JSON.parse(saved) as Session[];
    } catch {
      // Ignore malformed or unavailable browser storage and keep demo state.
    }
    queueMicrotask(() => {
      if (restored) setSessions(restored);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [hydrated, sessions]);

  const visibleSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (view === "attention" && session.attentionReasons.length === 0) return false;
      if (!query) return true;
      return [session.title, session.summary, session.agent, session.branch]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, sessions, view]);

  const selectedSession =
    sessions.find((session) => session.id === selectedId) ?? sessions[0];
  const attentionCount = sessions.filter(
    (session) => session.attentionReasons.length > 0,
  ).length;

  const updateSelected = (patch: Partial<Session>) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === selectedSession.id ? { ...session, ...patch } : session,
      ),
    );
  };

  const toggleReason = (reason: AttentionReason) => {
    const current = selectedSession.attentionReasons;
    updateSelected({
      attentionReasons: current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason],
    });
  };

  const selectSession = (id: string) => {
    setSelectedId(id);
    setEditing(false);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setEditing(false);
    setDetailOpen(false);
  };

  if (!pairingLoaded) {
    return (
      <PairingPanel
        onPaired={setPairing}
        onExploreDemo={() => setDemoMode(true)}
      />
    );
  }

  if (!demoMode && (!pairing || !pairing.auth)) {
    return (
      <PairingPanel
        pairing={pairing}
        onPaired={setPairing}
        onExploreDemo={() => setDemoMode(true)}
      />
    );
  }

  const connectionLabel = pairing?.auth ? "Secure pairing ready" : "Preview workspace";

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-mark">
          <img src="/nimbalyst-icon.png" width={25} height={25} alt="" />
          <span>Nimbalyst</span>
        </div>
        <nav>
          <button
            className={view === "attention" ? "nav-active" : ""}
            onClick={() => setView("attention")}
            type="button"
          >
            <span aria-hidden="true">◎</span>
            Needs attention
            <em>{attentionCount}</em>
          </button>
          <button
            className={view === "all" ? "nav-active" : ""}
            onClick={() => setView("all")}
            type="button"
          >
            <span aria-hidden="true">≡</span>
            All sessions
          </button>
        </nav>
        <div className="sidebar-project">
          <span className="project-avatar">N</span>
          <div>
            <strong>Nimbalyst</strong>
            <small>Personal workspace</small>
          </div>
        </div>
      </aside>

      <section className="session-column">
        <header className="mobile-header">
          <div className="brand-mark">
            <img src="/nimbalyst-icon.png" width={24} height={24} alt="" />
            <span>Nimbalyst</span>
          </div>
          <span className="connection-badge"><i /> {connectionLabel}</span>
        </header>

        <div className="session-heading">
          <div>
            <span className="eyebrow">COMMAND CENTER</span>
            <h1>{view === "attention" ? "Needs attention" : "All sessions"}</h1>
            <p>
              {view === "attention"
                ? `${attentionCount} sessions are waiting for input, review, or a handoff.`
                : `${sessions.length} sessions across your personal workspace.`}
            </p>
          </div>
          <span className="connection-badge desktop-connection"><i /> {connectionLabel}</span>
        </div>

        {pairing?.auth && (
          <div className="pairing-ready-banner">
            <span aria-hidden="true">◇</span>
            <p><strong>Secure desktop pairing is active.</strong> Live session hydration is the next milestone; this screen still uses preview sessions.</p>
          </div>
        )}

        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search sessions</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sessions"
          />
          <kbd>⌘ K</kbd>
        </label>

        <div className="mobile-tabs" role="tablist" aria-label="Session view">
          <button
            role="tab"
            aria-selected={view === "attention"}
            onClick={() => setView("attention")}
            type="button"
          >
            Attention <span>{attentionCount}</span>
          </button>
          <button
            role="tab"
            aria-selected={view === "all"}
            onClick={() => setView("all")}
            type="button"
          >
            All sessions
          </button>
        </div>

        <div className="session-list" aria-live="polite">
          {visibleSessions.length > 0 ? (
            visibleSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                selected={selectedSession.id === session.id}
                onSelect={() => selectSession(session.id)}
              />
            ))
          ) : view === "attention" && !search ? (
            <EmptyAttention onShowAll={() => setView("all")} />
          ) : (
            <div className="no-results">No sessions match “{search}”.</div>
          )}
        </div>
      </section>

      <section className={`detail-column ${detailOpen ? "detail-open" : ""}`} aria-label="Session details">
        <header className="detail-header">
          <button className="back-button" onClick={closeDetail} type="button" aria-label="Back to sessions">‹</button>
          <div>
            <span className="eyebrow">SESSION</span>
            <h2>{selectedSession.title}</h2>
          </div>
          <button className="edit-button" onClick={() => setEditing(!editing)} type="button">
            {editing ? "Done" : "Edit"}
          </button>
        </header>

        <div className="detail-scroll">
          <div className="status-card">
            <div className="status-card-main">
              <StateDot state={selectedSession.state} />
              <div>
                <strong>{selectedSession.state === "waiting" ? "Waiting" : selectedSession.state[0].toUpperCase() + selectedSession.state.slice(1)}</strong>
                <span>{selectedSession.agent} · {selectedSession.model}</span>
              </div>
            </div>
            <span className="updated-label">Updated {selectedSession.updated} ago</span>
          </div>

          <section className="detail-section">
            <div className="section-label">OBJECTIVE</div>
            <p className="objective-copy">{selectedSession.summary}</p>
          </section>

          <section className="detail-section workflow-section">
            <div className="section-heading-row">
              <div className="section-label">YOUR WORKFLOW</div>
              {!editing && <span>Synced across devices</span>}
            </div>

            {editing ? (
              <div className="workflow-form">
                <label>
                  My Notes
                  <textarea
                    value={selectedSession.myNotes}
                    onChange={(event) => updateSelected({ myNotes: event.target.value })}
                    rows={4}
                  />
                </label>
                <label>
                  Next Action
                  <textarea
                    value={selectedSession.nextAction}
                    onChange={(event) => updateSelected({ nextAction: event.target.value })}
                    rows={3}
                  />
                </label>
                <label>
                  Waiting On
                  <input
                    value={selectedSession.waitingOn}
                    onChange={(event) => updateSelected({ waitingOn: event.target.value })}
                  />
                </label>
                <fieldset>
                  <legend>Needs Attention</legend>
                  <div className="reason-grid">
                    {(Object.keys(attentionLabels) as AttentionReason[]).map((reason) => (
                      <button
                        key={reason}
                        className={selectedSession.attentionReasons.includes(reason) ? "reason-active" : ""}
                        onClick={() => toggleReason(reason)}
                        type="button"
                        aria-pressed={selectedSession.attentionReasons.includes(reason)}
                      >
                        <span aria-hidden="true">{attentionIcons[reason]}</span>
                        {attentionLabels[reason]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : (
              <div className="workflow-readout">
                <div>
                  <span>My Notes</span>
                  <p>{selectedSession.myNotes || "No notes yet."}</p>
                </div>
                <div className="next-action-block">
                  <span>Next Action</span>
                  <p>{selectedSession.nextAction || "No next action set."}</p>
                </div>
                <div>
                  <span>Waiting On</span>
                  <p>{selectedSession.waitingOn || "Nothing right now."}</p>
                </div>
              </div>
            )}
          </section>

          {!editing && selectedSession.attentionReasons.length > 0 && (
            <section className="detail-section">
              <div className="section-label">NEEDS ATTENTION</div>
              <div className="detail-pills">
                {selectedSession.attentionReasons.map((reason) => (
                  <AttentionPill key={reason} reason={reason} />
                ))}
              </div>
            </section>
          )}

          <section className="detail-section technical-section">
            <div className="section-label">SESSION CONTEXT</div>
            <dl>
              <div><dt>Project</dt><dd>{selectedSession.project}</dd></div>
              <div><dt>Branch</dt><dd>{selectedSession.branch}</dd></div>
              <div><dt>Worktree</dt><dd>{selectedSession.worktree}</dd></div>
            </dl>
          </section>
        </div>
      </section>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        <button className={view === "attention" ? "bottom-active" : ""} onClick={() => setView("attention")} type="button">
          <span aria-hidden="true">◎</span>
          Attention
        </button>
        <button className={view === "all" ? "bottom-active" : ""} onClick={() => setView("all")} type="button">
          <span aria-hidden="true">≡</span>
          Sessions
        </button>
        <button type="button">
          <span aria-hidden="true">⚙</span>
          Settings
        </button>
      </nav>
    </main>
  );
}
