"use client";
/* eslint-disable @next/next/no-img-element -- vinext's next/image shim uses a second React renderer in the browser. */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import PairingPanel from "./PairingPanel";
import NotificationBell from "./NotificationBell";
import { getStoredPairing, type StoredPairing } from "../lib/pairingStore";
import {
  cancelGatewaySession,
  createGatewaySession,
  listGatewaySessions,
  listGatewaySessionCreationOptions,
  listGatewayWorkspaces,
  getGatewayTranscript,
  respondGatewayPrompt,
  sendGatewayPrompt,
  updateGatewayWorkflow,
  type GatewaySession,
  type GatewayCreatedSession,
  type GatewayPendingPrompt,
  type GatewaySessionCreationOptions,
  type GatewayTranscript,
  type GatewayTranscriptMessage,
  type GatewayWorkspace,
} from "../lib/gateway";
import { chooseWorkspacePath, sessionsForWorkspace } from "../lib/workspaceView";
import {
  draftForSession,
  patchWorkflowDraft,
  startWorkflowDraft,
  type WorkflowDraft,
} from "../lib/workflowDraft";
import { formatSessionPhase, sessionPhaseTone } from "../lib/sessionPhase";
import { formatTranscriptTimestamp } from "../lib/transcriptTimestamp";

type AttentionReason =
  | "user-input"
  | "review"
  | "manual-testing"
  | "blocked"
  | "agent-handoff";

type SessionState = "working" | "waiting" | "done" | "blocked";
type ConnectionState = "connecting" | "connected" | "stale" | "disconnected";

type Session = {
  id: string;
  title: string;
  project: string;
  agent: string;
  model: string;
  state: SessionState;
  updated: string;
  branch: string;
  worktree: string;
  gitKind: "main" | "worktree";
  gitName: string;
  activeSubagentCount: number;
  phase: string;
  summary: string;
  myNotes: string;
  nextAction: string;
  waitingOn: string;
  attentionReasons: AttentionReason[];
  workspacePath: string;
};

const attentionLabels: Record<AttentionReason, string> = {
  "user-input": "Your Input",
  review: "Review",
  "manual-testing": "Manual Test",
  blocked: "Blocked",
  "agent-handoff": "Agent Handoff",
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
    gitKind: "main",
    gitName: "Main Working Tree",
    activeSubagentCount: 0,
    phase: "planning",
    summary: "Add personal workflow context without disturbing session execution or sync.",
    myNotes: "Desktop flow looks great. Keep the mobile surface focused and calm.",
    nextAction: "Review the PWA session detail and workflow editor on a phone.",
    waitingOn: "Your visual review",
    attentionReasons: ["review"],
    workspacePath: "C:\\Code\\Nimbalyst",
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
    gitKind: "main",
    gitName: "Main Working Tree",
    activeSubagentCount: 2,
    phase: "implementing",
    summary: "Verify additive metadata fields across desktop, browser, and mobile clients.",
    myNotes: "Unknown attention reasons must remain forward-compatible.",
    nextAction: "Have Claude review reconnection and conflict behavior.",
    waitingOn: "Codex test run",
    attentionReasons: ["agent-handoff"],
    workspacePath: "C:\\Code\\Nimbalyst",
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
    gitKind: "worktree",
    gitName: "Windows packaging",
    activeSubagentCount: 0,
    phase: "validating",
    summary: "Produce a reliable signed Windows build for the personal fork.",
    myNotes: "Visual Studio C++ workload is installed and native modules compile.",
    nextAction: "Retry the release packaging job.",
    waitingOn: "Signing certificate decision",
    attentionReasons: ["blocked", "user-input"],
    workspacePath: "C:\\Code\\Nimbalyst",
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
    gitKind: "worktree",
    gitName: "Onboarding copy",
    activeSubagentCount: 0,
    phase: "validating",
    summary: "Explain the human orchestration layer in one short first-run experience.",
    myNotes: "Copy is concise and ready for a final read.",
    nextAction: "Approve or leave comments.",
    waitingOn: "",
    attentionReasons: ["review"],
    workspacePath: "C:\\Code\\Nimbalyst",
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
    gitKind: "worktree",
    gitName: "Context Inspector research",
    activeSubagentCount: 0,
    phase: "backlog",
    summary: "Catalog context sources for a possible later inspector.",
    myNotes: "Useful later, but not justified for version one.",
    nextAction: "No action—revisit after real workflow pain appears.",
    waitingOn: "",
    attentionReasons: [],
    workspacePath: "C:\\Code\\Nimbalyst",
  },
];

const seedTranscript: GatewayTranscript = {
  cursor: 4,
  truncated: false,
  messages: [
    { id: "preview-1", sequence: 1, createdAt: 0, kind: "user", label: "You", text: "Add the session workflow fields without disturbing agent execution." },
    { id: "preview-2", sequence: 2, createdAt: 0, kind: "assistant", label: "Claude", text: "I’ve traced the existing session metadata path and will keep the additions backward-compatible." },
    { id: "preview-3", sequence: 3, createdAt: 0, kind: "tool", label: "Run tests", text: "Verified the focused workflow metadata tests.", status: "completed" },
    { id: "preview-4", sequence: 4, createdAt: 0, kind: "interactive", label: "Needs your input", text: "The desktop and mobile views are ready for your review.", status: "pending" },
  ],
};

function sessionState(session: GatewaySession): SessionState {
  if (session.hasPendingInteractivePrompt || session.status === "waiting_for_input") return "waiting";
  if (["blocked", "error", "failed"].includes(session.status ?? "")) return "blocked";
  if ((session.activeSubagentCount ?? 0) > 0 || ["running", "working", "busy", "starting"].includes(session.status ?? "")) return "working";
  return "done";
}

function relativeUpdated(updatedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function toSession(session: GatewaySession, workspacePath: string, project: string): Session {
  const reasons = (session.attentionReasons ?? []).filter(
    (reason): reason is AttentionReason => reason in attentionLabels,
  );
  if (session.hasPendingInteractivePrompt && !reasons.includes("user-input")) reasons.unshift("user-input");
  const agent = session.provider.toLowerCase().includes("claude") ? "Claude" : session.provider.toLowerCase().includes("codex") || session.provider.toLowerCase().includes("openai") ? "Codex" : session.provider;
  const gitLocation = session.gitLocation ?? {
    kind: session.worktreeId ? "worktree" as const : "main" as const,
    name: session.worktreeId ? "Git Worktree" : "Main Working Tree",
    path: workspacePath,
    branch: "",
  };
  return {
    id: session.id,
    title: session.title || "Untitled session",
    project,
    agent,
    model: session.model ?? "Default model",
    state: sessionState(session),
    updated: relativeUpdated(session.updatedAt),
    branch: gitLocation.branch || (gitLocation.kind === "main" ? "Current branch" : "Unknown branch"),
    worktree: gitLocation.path,
    gitKind: gitLocation.kind,
    gitName: gitLocation.name,
    activeSubagentCount: session.activeSubagentCount ?? 0,
    phase: session.phase?.trim() ?? "",
    summary: `${agent} Session in ${project}`,
    myNotes: session.myNotes ?? "",
    nextAction: session.nextAction ?? "",
    waitingOn: session.waitingOn ?? "",
    attentionReasons: reasons,
    workspacePath,
  };
}

function executionLabel(session: Session): string {
  if (session.activeSubagentCount > 0) {
    return `${session.activeSubagentCount} Subagent${session.activeSubagentCount === 1 ? "" : "s"} Working`;
  }
  if (session.state === "working") return "Main Agent Working";
  if (session.state === "waiting") return "Waiting for You";
  if (session.state === "blocked") return "Blocked";
  return "Idle";
}

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
        <div className="session-runtime-signals">
          <span className={`execution-signal ${session.state === "working" ? "execution-active" : ""}`}>
            <i aria-hidden="true" /> {executionLabel(session)}
          </span>
          <span className={`git-location-signal git-location-${session.gitKind}`}>
            {session.gitKind === "main" ? "Main Tree" : `Worktree · ${session.gitName}`}
          </span>
          {session.phase ? (
            <span className={`kanban-phase kanban-phase-${sessionPhaseTone(session.phase)}`}>
              Kanban · {formatSessionPhase(session.phase)}
            </span>
          ) : null}
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
      <h2>You’re Caught Up</h2>
      <p>No agent sessions need your attention right now.</p>
      <button type="button" onClick={onShowAll}>View All Sessions</button>
    </div>
  );
}

function WorkspaceNavigation({
  workspaces,
  sessions,
  selectedPath,
  onSelect,
}: {
  workspaces: GatewayWorkspace[];
  sessions: Session[];
  selectedPath: string;
  onSelect: (workspacePath: string) => void;
}) {
  return (
    <div className="workspace-navigation" data-component="WorkspaceNavigation">
      <div className="workspace-navigation-label">Workspaces</div>
      <div className="workspace-navigation-list">
        {workspaces.map((workspace) => {
          const workspaceSessions = sessionsForWorkspace(sessions, workspace.path);
          const needsAttention = workspaceSessions.filter((session) => session.attentionReasons.length > 0).length;
          const selected = workspace.path === selectedPath;
          return (
            <button
              key={workspace.path}
              className={selected ? "workspace-navigation-active" : ""}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onSelect(workspace.path)}
            >
              <span className="workspace-avatar" aria-hidden="true">{workspace.name.slice(0, 1).toUpperCase()}</span>
              <span className="workspace-navigation-copy">
                <strong>{workspace.name}</strong>
                <small>{workspaceSessions.length} Session{workspaceSessions.length === 1 ? "" : "s"}</small>
              </span>
              {needsAttention > 0 ? <em>{needsAttention}</em> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TranscriptMessage({ message }: { message: GatewayTranscriptMessage }) {
  return (
    <article className={`transcript-message transcript-${message.kind} ${message.isError ? "transcript-error" : ""}`}>
      <header>
        <strong>{message.label}</strong>
        <span>
          {message.status ? `${message.status} · ` : ""}
          {formatTranscriptTimestamp(message.createdAt)}
        </span>
      </header>
      {message.text ? <p>{message.text}</p> : null}
    </article>
  );
}

function TranscriptFeed({
  transcript,
  loading,
  error,
  endRef,
}: {
  transcript: GatewayTranscript;
  loading: boolean;
  error: string;
  endRef: RefObject<HTMLDivElement | null>;
}) {
  if (loading && transcript.messages.length === 0) {
    return <div className="transcript-empty">Loading the session transcript…</div>;
  }
  if (error && transcript.messages.length === 0) {
    return <div className="transcript-empty transcript-load-error">{error}</div>;
  }
  if (transcript.messages.length === 0) {
    return <div className="transcript-empty">No transcript messages yet.</div>;
  }
  return (
    <div className="transcript-feed">
      {transcript.truncated ? <p className="transcript-history-note">Showing the latest transcript activity.</p> : null}
      {transcript.messages.map((message) => <TranscriptMessage key={`${message.id}-${message.sequence}`} message={message} />)}
      <div ref={endRef} />
    </div>
  );
}

function InteractivePromptCard({
  prompt,
  busy,
  error,
  onRespond,
}: {
  prompt: GatewayPendingPrompt;
  busy: boolean;
  error: string;
  onRespond: (response: Record<string, unknown>) => Promise<void>;
}) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  if (prompt.promptType === "permission_request") {
    return (
      <section className={`interactive-card ${prompt.isDestructive ? "interactive-danger" : ""}`}>
        <div className="interactive-kicker">Permission Required</div>
        <h3>{prompt.toolName} Wants to Run</h3>
        {prompt.command ? <pre>{prompt.command}</pre> : null}
        {prompt.warnings.map((warning) => <p className="interactive-warning" key={warning}>{warning}</p>)}
        <div className="interactive-actions">
          <button type="button" disabled={busy} onClick={() => void onRespond({ decision: "allow", scope: "once" })}>Allow Once</button>
          <button type="button" disabled={busy} onClick={() => void onRespond({ decision: "allow", scope: "session" })}>Allow for Session</button>
          <button className="interactive-reject" type="button" disabled={busy} onClick={() => void onRespond({ decision: "deny", scope: "once" })}>Deny</button>
        </div>
        {error ? <p className="interactive-response-error">{error}</p> : null}
      </section>
    );
  }

  if (prompt.promptType === "exit_plan_mode_request") {
    return (
      <section className="interactive-card">
        <div className="interactive-kicker">Plan Ready</div>
        <h3>The Agent Is Waiting for Plan Approval</h3>
        {prompt.planFilePath ? <p className="interactive-detail">{prompt.planFilePath}</p> : null}
        <div className="interactive-actions">
          <button type="button" disabled={busy} onClick={() => void onRespond({ approved: true })}>Approve Plan</button>
          <button className="interactive-reject" type="button" disabled={busy} onClick={() => void onRespond({ approved: false })}>Reject</button>
        </div>
        {error ? <p className="interactive-response-error">{error}</p> : null}
      </section>
    );
  }

  const answers = Object.fromEntries(prompt.questions.map((question) => [
    question.question,
    customAnswers[question.question]?.trim() || (selectedAnswers[question.question] ?? []).join(", "),
  ]));
  const canSubmit = Object.values(answers).every(Boolean);

  return (
    <section className="interactive-card">
      <div className="interactive-kicker">Agent Question</div>
      <form onSubmit={(event) => { event.preventDefault(); void onRespond({ answers }); }}>
        {prompt.questions.map((question) => (
          <fieldset key={question.question}>
            {question.header ? <span>{question.header}</span> : null}
            <legend>{question.question}</legend>
            {question.options.length > 0 ? (
              <div className="interactive-options">
                {question.options.map((option) => {
                  const chosen = selectedAnswers[question.question] ?? [];
                  const selected = chosen.includes(option.label);
                  return (
                    <button
                      className={selected ? "interactive-option-selected" : ""}
                      key={option.label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedAnswers((current) => {
                        const existing = current[question.question] ?? [];
                        const next = question.multiSelect
                          ? selected ? existing.filter((label) => label !== option.label) : [...existing, option.label]
                          : [option.label];
                        return { ...current, [question.question]: next };
                      })}
                    >
                      <strong>{option.label}</strong>
                      {option.description ? <small>{option.description}</small> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <input
              value={customAnswers[question.question] ?? ""}
              onChange={(event) => setCustomAnswers((current) => ({ ...current, [question.question]: event.target.value }))}
              placeholder={question.options.length > 0 ? "Or type another answer…" : "Type your answer…"}
            />
          </fieldset>
        ))}
        <button className="interactive-submit" type="submit" disabled={busy || !canSubmit}>
          {busy ? "Sending…" : "Send Answer"}
        </button>
      </form>
      {error ? <p className="interactive-response-error">{error}</p> : null}
    </section>
  );
}

function NewSessionDialog({
  account,
  workspaces,
  initialWorkspacePath,
  onClose,
  onCreated,
}: {
  account: StoredPairing["account"];
  workspaces: GatewayWorkspace[];
  initialWorkspacePath: string;
  onClose: () => void;
  onCreated: (workspacePath: string, session: GatewayCreatedSession) => void;
}) {
  const [workspacePath, setWorkspacePath] = useState(initialWorkspacePath);
  const [options, setOptions] = useState<GatewaySessionCreationOptions>({ providers: [] });
  const [provider, setProvider] = useState<"claude-code" | "openai-codex">("claude-code");
  const [model, setModel] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listGatewaySessionCreationOptions(account, workspacePath)
      .then((next) => {
        if (cancelled) return;
        setOptions(next);
        const nextProvider = next.providers[0];
        if (nextProvider) {
          setProvider(nextProvider.id);
          setModel(nextProvider.models[0]?.id ?? "");
        } else {
          setModel("");
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load desktop agents.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [account, workspacePath]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creating) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [creating, onClose]);

  const selectedProvider = options.providers.find((item) => item.id === provider);
  const submit = async () => {
    if (!prompt.trim() || !model) return;
    setCreating(true);
    setError("");
    try {
      const session = await createGatewaySession(account, workspacePath, {
        provider,
        model,
        prompt: prompt.trim(),
        title: title.trim() || undefined,
        useWorktree,
      });
      onCreated(workspacePath, session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the session.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="new-session-layer" role="presentation">
      <button className="new-session-backdrop" type="button" aria-label="Close New Session" onClick={onClose} disabled={creating} />
      <section className="new-session-dialog" role="dialog" aria-modal="true" aria-labelledby="new-session-title">
        <header>
          <div>
            <span className="eyebrow">Remote Launch</span>
            <h2 id="new-session-title">New Agent Session</h2>
          </div>
          <button type="button" aria-label="Close New Session" onClick={onClose} disabled={creating}>×</button>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label>
            <span>Workspace</span>
            <select
              value={workspacePath}
              onChange={(event) => {
                setLoading(true);
                setError("");
                setWorkspacePath(event.target.value);
              }}
              disabled={creating}
            >
              {workspaces.map((workspace) => <option key={workspace.path} value={workspace.path}>{workspace.name}</option>)}
            </select>
          </label>
          <div className="new-session-field-grid">
            <label>
              <span>Agent</span>
              <select
                value={provider}
                onChange={(event) => {
                  const nextProvider = event.target.value as "claude-code" | "openai-codex";
                  setProvider(nextProvider);
                  setModel(options.providers.find((item) => item.id === nextProvider)?.models[0]?.id ?? "");
                }}
                disabled={loading || creating}
              >
                {options.providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>Model</span>
              <select value={model} onChange={(event) => setModel(event.target.value)} disabled={loading || creating || !selectedProvider}>
                {(selectedProvider?.models ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <label>
            <span>Session Name <small>Optional</small></span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="Derived from your prompt" disabled={creating} />
          </label>
          <label>
            <span>Initial Prompt</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} maxLength={50_000} placeholder="What should the agent accomplish?" disabled={creating} />
          </label>
          <label className="new-session-worktree" htmlFor="new-session-worktree">
            <input id="new-session-worktree" type="checkbox" aria-label="Create an Isolated Git Worktree" checked={useWorktree} onChange={(event) => setUseWorktree(event.target.checked)} disabled={creating} />
            <span><strong>Create an Isolated Git Worktree</strong><small>Keeps this session’s changes separate from the main working tree.</small></span>
          </label>
          {error ? <p className="new-session-error" role="alert">{error}</p> : null}
          <div className="new-session-actions">
            <button type="button" onClick={onClose} disabled={creating}>Cancel</button>
            <button type="submit" disabled={loading || creating || !prompt.trim() || !model}>
              {creating ? "Creating…" : useWorktree ? "Create in Worktree" : "Create Session"}
            </button>
          </div>
        </form>
      </section>
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
  const [pairingLoaded, setPairingLoaded] = useState(false);
  const [pairing, setPairing] = useState<StoredPairing>();
  const [demoMode, setDemoMode] = useState(false);
  const [workspaces, setWorkspaces] = useState<GatewayWorkspace[]>([
    { path: seedSessions[0].workspacePath, name: seedSessions[0].project },
  ]);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState(seedSessions[0].workspacePath);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewayError, setGatewayError] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [gatewayRefreshKey, setGatewayRefreshKey] = useState(0);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDraft<AttentionReason> | null>(null);
  const [prompt, setPrompt] = useState("");
  const [promptSending, setPromptSending] = useState(false);
  const [promptStatus, setPromptStatus] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelStatus, setCancelStatus] = useState("");
  const [transcript, setTranscript] = useState<GatewayTranscript>({ messages: [], cursor: 0, truncated: false });
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");
  const [transcriptUpdatedAt, setTranscriptUpdatedAt] = useState(0);
  const [transcriptRefreshKey, setTranscriptRefreshKey] = useState(0);
  const [promptResponseBusy, setPromptResponseBusy] = useState(false);
  const [promptResponseError, setPromptResponseError] = useState("");
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const lastTranscriptCursorRef = useRef(0);
  const lastTranscriptSessionRef = useRef("");
  const selectedWorkspacePathRef = useRef(selectedWorkspacePath);

  useEffect(() => {
    void getStoredPairing()
      .then((stored) => setPairing(stored))
      .finally(() => setPairingLoaded(true));
  }, []);

  useEffect(() => {
    if (demoMode || !pairing?.account.remoteGateway?.url) return;
    let cancelled = false;
    let requestInFlight = false;
    let hasLoadedSuccessfully = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setSessions([]);
        setWorkspaces([]);
        setGatewayLoading(true);
        setGatewayError("");
        setConnectionState("connecting");
      }
    });
    const loadSessions = async (showLoading: boolean) => {
      if (requestInFlight) return;
      requestInFlight = true;
      if (showLoading) {
        setGatewayLoading(true);
        setGatewayError("");
        setConnectionState("connecting");
      }
      try {
        const workspaces = await listGatewayWorkspaces(pairing.account);
        const results = await Promise.all(workspaces.map(async (workspace) => ({
          workspace,
          sessions: await listGatewaySessions(pairing.account, workspace.path),
        })));
        if (cancelled) return;
        const liveSessions = results.flatMap(({ workspace, sessions: items }) =>
          items.map((session) => toSession(session, workspace.path, workspace.name)),
        );
        const nextWorkspacePath = chooseWorkspacePath(workspaces, selectedWorkspacePathRef.current);
        setSessions(liveSessions);
        setWorkspaces(workspaces);
        setSelectedWorkspacePath(nextWorkspacePath);
        selectedWorkspacePathRef.current = nextWorkspacePath;
        hasLoadedSuccessfully = true;
        setConnectionState("connected");
        setGatewayError("");
        setSelectedId((current) => liveSessions.some(
          (session) => session.id === current && session.workspacePath === nextWorkspacePath,
        ) ? current : (liveSessions.find((session) => session.workspacePath === nextWorkspacePath)?.id ?? ""));
      } catch (caught) {
        if (!cancelled) {
          setConnectionState(hasLoadedSuccessfully ? "stale" : "disconnected");
          setGatewayError(caught instanceof Error ? caught.message : "Could not load desktop sessions.");
        }
      } finally {
        requestInFlight = false;
        if (!cancelled) setGatewayLoading(false);
      }
    };
    void loadSessions(false);
    const interval = window.setInterval(() => void loadSessions(false), 6_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadSessions(true);
    };
    const onResume = () => void loadSessions(true);
    const onOffline = () => {
      setConnectionState(hasLoadedSuccessfully ? "stale" : "disconnected");
      setGatewayError("This device is offline. Sessions will reconnect automatically when the network returns.");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("offline", onOffline);
    };
  }, [demoMode, pairing, gatewayRefreshKey]);

  const workspaceSessions = useMemo(
    () => sessionsForWorkspace(sessions, selectedWorkspacePath),
    [sessions, selectedWorkspacePath],
  );

  const visibleSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workspaceSessions.filter((session) => {
      if (view === "attention" && session.attentionReasons.length === 0) return false;
      if (!query) return true;
      return [session.title, session.summary, session.agent, session.branch]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, view, workspaceSessions]);

  const selectedSession =
    workspaceSessions.find((session) => session.id === selectedId) ?? workspaceSessions[0];
  const workflowValues = selectedSession
    ? draftForSession(selectedSession, workflowDraft)
    : null;
  const attentionCount = workspaceSessions.filter(
    (session) => session.attentionReasons.length > 0,
  ).length;
  const selectedWorkspace = workspaces.find((workspace) => workspace.path === selectedWorkspacePath) ?? workspaces[0];
  const workspaceName = selectedWorkspace?.name ?? "No workspace";
  const selectedSessionId = selectedSession?.id;
  const selectedSessionWorkspacePath = selectedSession?.workspacePath;

  useEffect(() => {
    if (demoMode || !pairing?.account.remoteGateway?.url || !selectedSessionId || !selectedSessionWorkspacePath) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        const sessionChanged = lastTranscriptSessionRef.current !== selectedSessionId;
        if (sessionChanged) {
          lastTranscriptSessionRef.current = selectedSessionId;
          lastTranscriptCursorRef.current = 0;
          setTranscript({ messages: [], cursor: 0, truncated: false });
          setTranscriptUpdatedAt(0);
        }
        setTranscriptLoading(true);
        setTranscriptError("");
      }
    });

    let requestInFlight = false;
    const loadTranscript = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const nextTranscript = await getGatewayTranscript(
          pairing.account,
          selectedSessionWorkspacePath,
          selectedSessionId,
        );
        if (!cancelled) {
          setTranscript(nextTranscript);
          setTranscriptUpdatedAt(Date.now());
          setTranscriptError("");
        }
      } catch (caught) {
        if (!cancelled) setTranscriptError(caught instanceof Error ? caught.message : "Could not refresh the transcript.");
      } finally {
        requestInFlight = false;
        if (!cancelled) setTranscriptLoading(false);
      }
    };

    void loadTranscript();
    const interval = window.setInterval(() => void loadTranscript(), 3_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadTranscript();
    };
    const onResume = () => void loadTranscript();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
    };
  }, [demoMode, pairing, selectedSessionId, selectedSessionWorkspacePath, transcriptRefreshKey]);

  useEffect(() => {
    if (transcript.cursor === lastTranscriptCursorRef.current) return;
    lastTranscriptCursorRef.current = transcript.cursor;
    transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [transcript.cursor]);

  const updateSelected = (patch: Partial<Session>) => {
    if (!selectedSession) return;
    setSessions((current) =>
      current.map((session) =>
        session.id === selectedSession.id ? { ...session, ...patch } : session,
      ),
    );
  };

  const beginEditing = () => {
    if (!selectedSession) return;
    setWorkflowDraft(startWorkflowDraft(selectedSession));
    setEditing(true);
  };

  const updateDraft = (
    patch: Partial<Omit<WorkflowDraft<AttentionReason>, "sessionId">>,
  ) => {
    if (!selectedSession) return;
    setWorkflowDraft((current) => patchWorkflowDraft(
      draftForSession(selectedSession, current),
      patch,
    ));
  };

  const toggleReason = (reason: AttentionReason) => {
    if (!workflowValues) return;
    const current = workflowValues.attentionReasons;
    updateDraft({
      attentionReasons: current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason],
    });
  };

  const selectSession = (id: string) => {
    setSelectedId(id);
    setEditing(false);
    setWorkflowDraft(null);
    setDetailOpen(true);
  };

  const selectWorkspace = (workspacePath: string) => {
    selectedWorkspacePathRef.current = workspacePath;
    setSelectedWorkspacePath(workspacePath);
    setSelectedId((current) => sessions.some(
      (session) => session.id === current && session.workspacePath === workspacePath,
    ) ? current : (sessions.find((session) => session.workspacePath === workspacePath)?.id ?? ""));
    setSearch("");
    setEditing(false);
    setWorkflowDraft(null);
    setDetailOpen(false);
    setWorkspaceMenuOpen(false);
  };

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [workspaceMenuOpen]);

  const closeDetail = () => {
    setEditing(false);
    setWorkflowDraft(null);
    setDetailOpen(false);
  };

  const finishEditing = async () => {
    if (!selectedSession || !workflowValues) return;
    const workflowPatch = {
      myNotes: workflowValues.myNotes,
      nextAction: workflowValues.nextAction,
      waitingOn: workflowValues.waitingOn,
      attentionReasons: workflowValues.attentionReasons,
    };
    if (!pairing?.account.remoteGateway?.url || demoMode) {
      updateSelected(workflowPatch);
      setEditing(false);
      setWorkflowDraft(null);
      return;
    }
    setWorkflowSaving(true);
    setGatewayError("");
    try {
      await updateGatewayWorkflow(
        pairing.account,
        selectedSession.workspacePath,
        selectedSession.id,
        workflowPatch,
      );
      updateSelected(workflowPatch);
      setEditing(false);
      setWorkflowDraft(null);
    } catch (caught) {
      setGatewayError(caught instanceof Error ? caught.message : "Could not save workflow fields.");
    } finally {
      setWorkflowSaving(false);
    }
  };

  const sendPrompt = async () => {
    if (!selectedSession || !pairing?.account.remoteGateway?.url || !prompt.trim()) return;
    setPromptSending(true);
    setPromptStatus("");
    try {
      await sendGatewayPrompt(pairing.account, selectedSession.workspacePath, selectedSession.id, prompt.trim());
      setPrompt("");
      setPromptStatus("Prompt sent to the desktop session.");
      setTranscriptRefreshKey((current) => current + 1);
    } catch (caught) {
      setPromptStatus(caught instanceof Error ? caught.message : "Could not send the prompt.");
    } finally {
      setPromptSending(false);
    }
  };

  const cancelSession = async () => {
    if (!selectedSession || !pairing?.account.remoteGateway?.url) return;
    setCancelBusy(true);
    setCancelStatus("");
    try {
      await cancelGatewaySession(pairing.account, selectedSession.workspacePath, selectedSession.id);
      setCancelStatus("Stop request sent to the desktop session.");
      setTranscriptRefreshKey((current) => current + 1);
      setGatewayRefreshKey((current) => current + 1);
    } catch (caught) {
      setCancelStatus(caught instanceof Error ? caught.message : "Could not stop the session.");
    } finally {
      setCancelBusy(false);
    }
  };

  const respondToPendingPrompt = async (response: Record<string, unknown>) => {
    if (!selectedSession || !pairing || !transcript.pendingPrompt) return;
    setPromptResponseBusy(true);
    setPromptResponseError("");
    try {
      await respondGatewayPrompt(
        pairing.account,
        selectedSession.workspacePath,
        selectedSession.id,
        transcript.pendingPrompt,
        response,
      );
      setTranscript((current) => ({ ...current, pendingPrompt: null }));
      setTranscriptRefreshKey((current) => current + 1);
    } catch (caught) {
      setPromptResponseError(caught instanceof Error ? caught.message : "Could not send your response.");
    } finally {
      setPromptResponseBusy(false);
    }
  };

  const handleRemoteSessionCreated = (workspacePath: string, session: GatewayCreatedSession) => {
    selectedWorkspacePathRef.current = workspacePath;
    setSelectedWorkspacePath(workspacePath);
    setSelectedId(session.sessionId);
    setView("all");
    setSearch("");
    setEditing(false);
    setWorkflowDraft(null);
    setDetailOpen(true);
    setNewSessionOpen(false);
    setGatewayRefreshKey((current) => current + 1);
  };

  if (!pairingLoaded) {
    return (
      <PairingPanel
        onPaired={setPairing}
        onExploreDemo={() => setDemoMode(true)}
        onReset={() => setPairing(undefined)}
      />
    );
  }

  if (!demoMode && (!pairing || !pairing.account.remoteGateway?.url)) {
    return (
      <PairingPanel
        pairing={pairing}
        onPaired={setPairing}
        onExploreDemo={() => setDemoMode(true)}
        onReset={() => setPairing(undefined)}
      />
    );
  }

  const connected = Boolean(pairing?.account.remoteGateway?.url) && !demoMode;
  const connectionLabel = demoMode
    ? "Preview Workspace"
    : connectionState === "connected"
      ? "Desktop Connected"
      : connectionState === "stale"
        ? "Reconnecting"
        : connectionState === "connecting"
          ? "Connecting"
          : "Desktop Offline";
  const connectionClass = demoMode ? "preview" : connectionState;
  const activeTranscript = demoMode ? seedTranscript : transcript;

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
            Needs Attention
            <em>{attentionCount}</em>
          </button>
          <button
            className={view === "all" ? "nav-active" : ""}
            onClick={() => setView("all")}
            type="button"
          >
            <span aria-hidden="true">≡</span>
            All Sessions
          </button>
        </nav>
        <WorkspaceNavigation
          workspaces={workspaces}
          sessions={sessions}
          selectedPath={selectedWorkspacePath}
          onSelect={selectWorkspace}
        />
        <div className="sidebar-project">
          <span className="project-avatar">{workspaceName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{workspaceName}</strong>
            <small>{connected ? "Private Desktop" : "Preview Workspace"}</small>
          </div>
        </div>
      </aside>

      {workspaceMenuOpen ? (
        <div className="workspace-drawer-layer">
          <button
            className="workspace-drawer-backdrop"
            type="button"
            aria-label="Close workspace menu"
            onClick={() => setWorkspaceMenuOpen(false)}
          />
          <aside className="workspace-drawer" aria-label="Workspaces">
            <header>
              <div className="brand-mark">
                <img src="/nimbalyst-icon.png" width={24} height={24} alt="" />
                <span>Nimbalyst</span>
              </div>
              <button type="button" aria-label="Close Workspace Menu" onClick={() => setWorkspaceMenuOpen(false)}>×</button>
            </header>
            <WorkspaceNavigation
              workspaces={workspaces}
              sessions={sessions}
              selectedPath={selectedWorkspacePath}
              onSelect={selectWorkspace}
            />
            <div className={`workspace-drawer-status connection-${connectionClass}`}>
              <i aria-hidden="true" />
              <span>{connectionLabel}</span>
            </div>
          </aside>
        </div>
      ) : null}

      <section className="session-column">
        <header className="mobile-header">
          <div className="mobile-brand-group">
            <button
              className="workspace-menu-button"
              type="button"
              aria-label="Open workspace menu"
              aria-expanded={workspaceMenuOpen}
              onClick={() => setWorkspaceMenuOpen(true)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <div className="brand-mark">
              <img src="/nimbalyst-icon.png" width={24} height={24} alt="" />
              <span>{workspaceName}</span>
            </div>
          </div>
          <div className="mobile-header-actions">
            {connected ? <button className="new-session-button new-session-button-compact" type="button" aria-label="Create New Session" onClick={() => setNewSessionOpen(true)}>＋</button> : null}
            {connected && pairing ? <NotificationBell account={pairing.account} /> : null}
            <span className={`connection-badge connection-${connectionClass}`}><i /> {connectionLabel}</span>
          </div>
        </header>

        <div className="session-heading">
          <div>
            <span className="eyebrow">Command Center</span>
            <h1>{view === "attention" ? "Needs Attention" : "All Sessions"}</h1>
            <p>
              {view === "attention"
                ? `${attentionCount} sessions are waiting for input, review, or a handoff.`
                : `${workspaceSessions.length} sessions in ${workspaceName}.`}
            </p>
          </div>
          <div className="desktop-heading-actions">
            {connected ? <button className="new-session-button" type="button" onClick={() => setNewSessionOpen(true)}><span aria-hidden="true">＋</span> New Session</button> : null}
            {connected && pairing ? <NotificationBell account={pairing.account} /> : null}
            <span className={`connection-badge desktop-connection connection-${connectionClass}`}><i /> {connectionLabel}</span>
          </div>
        </div>

        {gatewayError && (
          <div className="pairing-error gateway-recovery" role="alert">
            <span>{gatewayError}</span>
            <button type="button" onClick={() => setGatewayRefreshKey((current) => current + 1)}>Retry</button>
          </div>
        )}

        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search Sessions</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Sessions"
          />
          <kbd>⌘ K</kbd>
        </label>

        <div className="mobile-tabs" role="tablist" aria-label="Session View">
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
            All Sessions
          </button>
        </div>

        <div className="session-list" aria-live="polite">
          {gatewayLoading ? (
            <div className="no-results">Loading sessions from your desktop…</div>
          ) : visibleSessions.length > 0 ? (
            visibleSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                selected={selectedSession?.id === session.id}
                onSelect={() => selectSession(session.id)}
              />
            ))
          ) : view === "attention" && !search ? (
            <EmptyAttention onShowAll={() => setView("all")} />
          ) : (
            <div className="no-results">{search ? `No sessions match “${search}”.` : "No sessions are available in this workspace."}</div>
          )}
        </div>
      </section>

      {selectedSession ? (
      <section className={`detail-column ${detailOpen ? "detail-open" : ""}`} aria-label="Session Details">
        <header className="detail-header">
          <button className="back-button" onClick={closeDetail} type="button" aria-label="Back to Sessions">‹</button>
          <div>
            <span className="eyebrow">Session</span>
            <h2>{selectedSession.title}</h2>
          </div>
          <button
            className="edit-button"
            onClick={() => editing ? void finishEditing() : beginEditing()}
            type="button"
            disabled={workflowSaving}
          >
            {workflowSaving ? "Saving…" : editing ? "Done" : "Edit"}
          </button>
        </header>

        <div className="detail-scroll">
          <div className="status-card">
            <div className="status-card-main">
              <StateDot state={selectedSession.state} />
              <div>
                <strong>{executionLabel(selectedSession)}</strong>
                <span>{selectedSession.agent} · {selectedSession.model}</span>
                {selectedSession.phase ? <span>Kanban · {formatSessionPhase(selectedSession.phase)}</span> : null}
                <small>{selectedSession.gitKind === "main" ? "Main Tree" : `Worktree · ${selectedSession.gitName}`} · {selectedSession.branch}</small>
              </div>
            </div>
            <span className="updated-label">Updated {selectedSession.updated} ago</span>
          </div>

          {connected && !editing && transcript.pendingPrompt ? (
            <InteractivePromptCard
              key={transcript.pendingPrompt.promptId}
              prompt={transcript.pendingPrompt}
              busy={promptResponseBusy}
              error={promptResponseError}
              onRespond={respondToPendingPrompt}
            />
          ) : null}

          {(connected || demoMode) && !editing ? (
            <section className="detail-section transcript-section">
              <div className="section-heading-row">
                <div className="section-label">Live Transcript</div>
                <span className={transcriptError ? "transcript-status-error" : ""}>
                  {demoMode
                    ? "Preview"
                    : transcriptLoading
                    ? "Refreshing…"
                    : transcriptError
                      ? "Disconnected"
                      : transcriptUpdatedAt
                        ? "Live"
                        : "Waiting"}
                </span>
              </div>
              <TranscriptFeed
                transcript={activeTranscript}
                loading={demoMode ? false : transcriptLoading}
                error={demoMode ? "" : transcriptError}
                endRef={transcriptEndRef}
              />
              {!demoMode && transcriptError && transcript.messages.length > 0 ? (
                <p className="transcript-inline-error">{transcriptError}</p>
              ) : null}
            </section>
          ) : null}

          {connected && !editing && (
            <section className="detail-section prompt-section">
              <div className="section-label">Continue Session</div>
              <form onSubmit={(event) => { event.preventDefault(); void sendPrompt(); }}>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={4}
                  placeholder="Tell the agent what to do next…"
                />
                <button type="submit" disabled={promptSending || !prompt.trim()}>
                  {promptSending ? "Sending…" : "Send to Session"}
                </button>
              </form>
              {promptStatus && <p className="prompt-status" role="status">{promptStatus}</p>}
              {selectedSession.state === "working" || selectedSession.state === "waiting" ? (
                <div className="session-stop-row">
                  <button className="session-stop-button" type="button" onClick={() => void cancelSession()} disabled={cancelBusy}>
                    {cancelBusy ? "Stopping…" : "Stop Current Run"}
                  </button>
                  <small>Stops the active agent turn without closing the session.</small>
                </div>
              ) : null}
              {cancelStatus && <p className="prompt-status" role="status">{cancelStatus}</p>}
            </section>
          )}

          <section className="detail-section">
            <div className="section-label">Objective</div>
            <p className="objective-copy">{selectedSession.summary}</p>
          </section>

          <section className="detail-section workflow-section">
            <div className="section-heading-row">
              <div className="section-label">Your Workflow</div>
              {!editing && <span>Synced Across Devices</span>}
            </div>

            {editing ? (
              <div className="workflow-form">
                <label>
                  My Notes
                  <textarea
                    value={workflowValues?.myNotes ?? ""}
                    onChange={(event) => updateDraft({ myNotes: event.target.value })}
                    rows={4}
                  />
                </label>
                <label>
                  Next Action
                  <textarea
                    value={workflowValues?.nextAction ?? ""}
                    onChange={(event) => updateDraft({ nextAction: event.target.value })}
                    rows={3}
                  />
                </label>
                <label>
                  Waiting On
                  <input
                    value={workflowValues?.waitingOn ?? ""}
                    onChange={(event) => updateDraft({ waitingOn: event.target.value })}
                  />
                </label>
                <fieldset>
                  <legend>Needs Attention</legend>
                  <div className="reason-grid">
                    {(Object.keys(attentionLabels) as AttentionReason[]).map((reason) => (
                      <button
                        key={reason}
                        className={workflowValues?.attentionReasons.includes(reason) ? "reason-active" : ""}
                        onClick={() => toggleReason(reason)}
                        type="button"
                        aria-pressed={workflowValues?.attentionReasons.includes(reason) ?? false}
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
              <div className="section-label">Needs Attention</div>
              <div className="detail-pills">
                {selectedSession.attentionReasons.map((reason) => (
                  <AttentionPill key={reason} reason={reason} />
                ))}
              </div>
            </section>
          )}

          <section className="detail-section technical-section">
            <div className="section-label">Session Context</div>
            <dl>
              <div><dt>Project</dt><dd>{selectedSession.project}</dd></div>
              <div><dt>Kanban</dt><dd>{formatSessionPhase(selectedSession.phase) || "Unassigned"}</dd></div>
              <div><dt>Git Location</dt><dd>{selectedSession.gitKind === "main" ? "Main Working Tree" : `Worktree · ${selectedSession.gitName}`}</dd></div>
              <div><dt>Branch</dt><dd>{selectedSession.branch}</dd></div>
              <div><dt>Path</dt><dd>{selectedSession.worktree}</dd></div>
            </dl>
          </section>
        </div>
      </section>
      ) : (
        <section className="detail-column" aria-label="Session Details">
          <div className="empty-attention">
            <h2>No Session Selected</h2>
            <p>Choose a session after one becomes available on your desktop.</p>
          </div>
        </section>
      )}

      {newSessionOpen && connected && pairing ? (
        <NewSessionDialog
          account={pairing.account}
          workspaces={workspaces}
          initialWorkspacePath={selectedWorkspacePath}
          onClose={() => setNewSessionOpen(false)}
          onCreated={handleRemoteSessionCreated}
        />
      ) : null}

      <nav className="bottom-nav" aria-label="Mobile Navigation">
        <button className={view === "attention" ? "bottom-active" : ""} onClick={() => setView("attention")} type="button">
          <span aria-hidden="true">◎</span>
          Attention
        </button>
        <button className={view === "all" ? "bottom-active" : ""} onClick={() => setView("all")} type="button">
          <span aria-hidden="true">≡</span>
          Sessions
        </button>
        <button type="button" onClick={() => setWorkspaceMenuOpen(true)}>
          <span aria-hidden="true">▦</span>
          Workspaces
        </button>
      </nav>
    </main>
  );
}
