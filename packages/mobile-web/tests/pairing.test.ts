import assert from "node:assert/strict";
import test from "node:test";
import { decryptText, deriveEncryptionKey } from "../lib/crypto.ts";
import { accountFromPayload, parsePairingPayload, syncHttpOrigin } from "../lib/pairing.ts";
import { cancelGatewaySession, createGatewaySession, getGatewayTranscript, listGatewaySessionCreationOptions, listGatewayWorkspaces, normalizeGatewayUrl, respondGatewayPrompt } from "../lib/gateway.ts";
import { chooseWorkspacePath, sessionsForWorkspace } from "../lib/workspaceView.ts";
import { draftForSession, patchWorkflowDraft, startWorkflowDraft } from "../lib/workflowDraft.ts";
import { formatSessionPhase } from "../lib/sessionPhase.ts";
import { formatTranscriptTimestamp } from "../lib/transcriptTimestamp.ts";

const future = 2_000_000_000_000;
const payload = {
  version: 5,
  serverUrl: "wss://sync.example/",
  encryptionKeySeed: "dGVzdC1lbmNyeXB0aW9uLWtleS1zZWVkLWZvci10ZXN0cw==",
  expiresAt: future,
  analyticsId: "analytics-1",
  syncEmail: "person@example.com",
  personalOrgId: "org-personal",
  personalUserId: "user-test-12345",
};

test("formats transcript timestamps with both the calendar date and time", () => {
  const messageCreatedAt = new Date(2026, 7, 23, 17, 42, 0);

  assert.equal(
    formatTranscriptTimestamp(messageCreatedAt.getTime()),
    messageCreatedAt.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  );
  assert.equal(formatTranscriptTimestamp(0), "");
});

test("parses the desktop v5 deep link and discards the seed from stored account data", () => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  const parsed = parsePairingPayload(`nimbalyst://pair?data=${encodeURIComponent(encoded)}`, future - 1);
  assert.equal(parsed.personalUserId, "user-test-12345");
  assert.equal(parsed.serverUrl, "wss://sync.example");

  const account = accountFromPayload(parsed, 123);
  assert.equal(account.keySalt, "user-test-12345");
  assert.equal(account.pairedAt, 123);
  assert.equal("encryptionKeySeed" in account, false);
});

test("rejects expired and insecure remote payloads", () => {
  assert.throws(
    () => parsePairingPayload(JSON.stringify({ ...payload, expiresAt: future - 1 }), future),
    /expired/,
  );
  assert.throws(
    () => parsePairingPayload(JSON.stringify({ ...payload, serverUrl: "ws://sync.example" }), future - 1),
    /encrypted sync server/,
  );
});

test("parses a v6 desktop gateway without storing the raw encryption seed", () => {
  const parsed = parsePairingPayload(JSON.stringify({
    ...payload,
    version: 6,
    remoteGateway: {
      port: 3456,
      token: "a".repeat(64),
      pwaUrl: "https://nimbalyst-command-center.fsrcapital.chatgpt.site",
      workspaces: [{ path: "C:\\Code\\Nimbalyst", name: "Nimbalyst" }],
    },
  }), future - 1);
  const account = accountFromPayload(parsed, 123);
  assert.equal(account.remoteGateway?.port, 3456);
  assert.equal(account.remoteGateway?.token, "a".repeat(64));
  assert.equal("encryptionKeySeed" in account, false);
});

test("rejects malformed desktop gateway credentials", () => {
  assert.throws(
    () => parsePairingPayload(JSON.stringify({ ...payload, remoteGateway: { port: 3456, token: "short", pwaUrl: "https://example.com", workspaces: [] } }), future - 1),
    /credential is invalid/,
  );
});

test("normalizes private gateway addresses and requires HTTPS away from localhost", () => {
  assert.equal(normalizeGatewayUrl("https://my-pc.tail1234.ts.net/"), "https://my-pc.tail1234.ts.net");
  assert.equal(normalizeGatewayUrl("http://localhost:3456/"), "http://localhost:3456");
  assert.throws(() => normalizeGatewayUrl("http://my-pc.tail1234.ts.net"), /must use HTTPS/);
});

test("matches the shared iOS, Android, and desktop AES-GCM test vector", async () => {
  const key = await deriveEncryptionKey(payload.encryptionKeySeed, payload.personalUserId);
  const plaintext = await decryptText(
    "07DfjrYjG0f1/3swnwWVpq6LsGZnw02+Kx4vzmu78YPm",
    "AQIDBAUGBwgJCgsM",
    key,
  );
  assert.equal(plaintext, "Hello, Nimbalyst!");
});

test("converts WebSocket sync URLs to the matching HTTPS auth origin", () => {
  assert.equal(syncHttpOrigin("wss://sync.example"), "https://sync.example");
});

test("rejects a malformed transcript response instead of crashing the session view", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ messages: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  try {
    await assert.rejects(
      getGatewayTranscript({
        version: 6,
        userId: "user-test",
        personalUserId: "user-test",
        personalOrgId: "org-test",
        syncEmail: "person@example.com",
        serverUrl: "wss://sync.example",
        keySalt: "user-test",
        pairedAt: 123,
        remoteGateway: {
          url: "https://desktop.tail1234.ts.net",
          port: 3456,
          token: "a".repeat(64),
          pwaUrl: "https://nimbalyst-command-center.fsrcapital.chatgpt.site",
          workspaces: [],
        },
      }, "C:\\Code\\Nimbalyst", "session-1"),
      /invalid transcript/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends interactive responses through the scoped desktop gateway route", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await respondGatewayPrompt({
      version: 6,
      userId: "user-test",
      personalUserId: "user-test",
      personalOrgId: "org-test",
      syncEmail: "person@example.com",
      serverUrl: "wss://sync.example",
      keySalt: "user-test",
      pairedAt: 123,
      remoteGateway: {
        url: "https://desktop.tail1234.ts.net",
        port: 3456,
        token: "a".repeat(64),
        pwaUrl: "https://nimbalyst-command-center.fsrcapital.chatgpt.site",
        workspaces: [],
      },
    }, "C:\\Code\\Nimbalyst", "session-1", {
      promptId: "permission-1",
      promptType: "permission_request",
      createdAt: 123,
      toolName: "Bash",
      command: "npm test",
      isDestructive: false,
      warnings: [],
    }, { decision: "allow", scope: "once" });

    assert.deepEqual(sentBody, {
      workspacePath: "C:\\Code\\Nimbalyst",
      sessionId: "session-1",
      promptId: "permission-1",
      promptType: "permission_request",
      response: { decision: "allow", scope: "once" },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("explains when the gateway address serves a non-gateway page", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<!doctype html><title>Nimbalyst</title>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  try {
    await assert.rejects(
      listGatewayWorkspaces({
        version: 6,
        userId: "user-test",
        personalUserId: "user-test",
        personalOrgId: "org-test",
        syncEmail: "person@example.com",
        serverUrl: "wss://sync.example",
        keySalt: "user-test",
        pairedAt: 123,
        remoteGateway: {
          url: "https://desktop.tail1234.ts.net",
          port: 3457,
          token: "a".repeat(64),
          pwaUrl: "https://nimbalyst-command-center.fsrcapital.chatgpt.site",
          workspaces: [],
        },
      }),
      /port 3457/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("explains how to authorize a project when the desktop allows none", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ workspaces: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  try {
    await assert.rejects(
      listGatewayWorkspaces({
        version: 6,
        userId: "user-test",
        personalUserId: "user-test",
        personalOrgId: "org-test",
        syncEmail: "person@example.com",
        serverUrl: "wss://sync.example",
        keySalt: "user-test",
        pairedAt: 123,
        remoteGateway: {
          url: "https://desktop.tail1234.ts.net",
          port: 3457,
          token: "a".repeat(64),
          pwaUrl: "https://nimbalyst-command-center.fsrcapital.chatgpt.site",
          workspaces: [],
        },
      }),
      /Settings.*Account.*Web App.*select a project/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends cancellation through the scoped desktop gateway route", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let sentBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  try {
    await cancelGatewaySession({
      version: 6,
      userId: "user-test",
      personalUserId: "user-test",
      personalOrgId: "org-test",
      syncEmail: "person@example.com",
      serverUrl: "wss://sync.example",
      keySalt: "user-test",
      pairedAt: 123,
      remoteGateway: {
        url: "https://desktop.tail1234.ts.net",
        port: 3457,
        token: "a".repeat(64),
        pwaUrl: "https://nimbalyst-command-center.fsrcapital.chatgpt.site",
        workspaces: [],
      },
    }, "C:\\Code\\Nimbalyst", "session-1");

    assert.match(requestedUrl, /\/remote\/v1\/sessions\/session-1\/cancel$/);
    assert.deepEqual(sentBody, { workspacePath: "C:\\Code\\Nimbalyst" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loads session creation options and submits a worktree session", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url, body });
    const response = url.endsWith("/session-options")
      ? { providers: [{ id: "openai-codex", label: "OpenAI Codex", models: [{ id: "openai-codex:gpt-5.6-sol", label: "GPT-5.6 Sol" }] }] }
      : { sessionId: "session-new", title: "Remote build" };
    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const account = {
    version: 6 as const,
    userId: "user-test",
    personalUserId: "user-test",
    personalOrgId: "org-test",
    syncEmail: "person@example.com",
    serverUrl: "wss://sync.example",
    keySalt: "user-test",
    pairedAt: 123,
    remoteGateway: {
      url: "https://desktop.tail1234.ts.net",
      port: 3457,
      token: "a".repeat(64),
      pwaUrl: "https://nimbalyst-command-center.fsrcapital.chatgpt.site",
      workspaces: [],
    },
  };
  try {
    const options = await listGatewaySessionCreationOptions(account, "C:\\Code\\Nimbalyst");
    assert.equal(options.providers[0]?.id, "openai-codex");

    const created = await createGatewaySession(account, "C:\\Code\\Nimbalyst", {
      provider: "openai-codex",
      model: "openai-codex:gpt-5.6-sol",
      prompt: "Build the feature",
      title: "Remote build",
      useWorktree: true,
    });
    assert.equal(created.sessionId, "session-new");
    assert.match(requests[0].url, /\/remote\/v1\/session-options$/);
    assert.match(requests[1].url, /\/remote\/v1\/sessions\/create$/);
    assert.deepEqual(requests[1].body, {
      workspacePath: "C:\\Code\\Nimbalyst",
      provider: "openai-codex",
      model: "openai-codex:gpt-5.6-sol",
      prompt: "Build the feature",
      title: "Remote build",
      useWorktree: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps the selected workspace when available and scopes its sessions", () => {
  const workspaces = [
    { path: "C:\\Code\\Nimbalyst", name: "Nimbalyst" },
    { path: "C:\\Code\\Daemon", name: "Daemon" },
  ];
  assert.equal(chooseWorkspacePath(workspaces, "C:\\Code\\Daemon"), "C:\\Code\\Daemon");
  assert.equal(chooseWorkspacePath(workspaces, "C:\\Code\\Missing"), "C:\\Code\\Nimbalyst");
  assert.deepEqual(
    sessionsForWorkspace([
      { id: "one", workspacePath: "C:\\Code\\Nimbalyst" },
      { id: "two", workspacePath: "C:\\Code\\Daemon" },
    ], "C:\\Code\\Daemon").map((session) => session.id),
    ["two"],
  );
});

test("keeps unsaved workflow text when a live session refresh arrives", () => {
  const original = {
    id: "session-1",
    myNotes: "Saved notes",
    nextAction: "Saved action",
    waitingOn: "",
    attentionReasons: ["review"],
  };
  const draft = patchWorkflowDraft(startWorkflowDraft(original), {
    myNotes: "A longer note that is still being typed",
    nextAction: "Run the focused regression test",
  });
  const refreshed = {
    ...original,
    myNotes: "Saved notes",
    nextAction: "Saved action",
  };

  assert.deepEqual(draftForSession(refreshed, draft), draft);
});

test("formats desktop Kanban phases for compact PWA badges", () => {
  assert.equal(formatSessionPhase("implementing"), "Implementing");
  assert.equal(formatSessionPhase("manual-review"), "Manual Review");
  assert.equal(formatSessionPhase(""), "");
});
