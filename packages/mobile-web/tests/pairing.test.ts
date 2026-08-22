import assert from "node:assert/strict";
import test from "node:test";
import { decryptText, deriveEncryptionKey } from "../lib/crypto.ts";
import { accountFromPayload, parsePairingPayload, syncHttpOrigin } from "../lib/pairing.ts";
import { authSessionFromExchange, signInErrorMessage } from "../lib/stytchAuth.ts";

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

test("accepts an authenticated session only for the paired account and organization", () => {
  const account = accountFromPayload(payload, 123);
  const auth = authSessionFromExchange(account, {
    member_authenticated: true,
    session_token: "session-token",
    session_jwt: "session-jwt",
    member_id: "user-test-12345",
    member: { member_id: "user-test-12345", email_address: "person@example.com" },
    organization: { organization_id: "org-personal" },
    member_session: { expires_at: "2030-01-01T00:00:00Z" },
  });
  assert.equal(auth.userId, "user-test-12345");
  assert.equal(auth.orgId, "org-personal");
  assert.equal(auth.expiresAt, "2030-01-01T00:00:00Z");

  assert.throws(
    () => authSessionFromExchange(account, {
      member_authenticated: true,
      session_token: "session-token",
      session_jwt: "session-jwt",
      member_id: "someone-else",
      organization: { organization_id: "org-personal" },
    }),
    /different Nimbalyst account/,
  );
});

test("explains when the hosted PWA domain has not been approved", () => {
  const error = Object.assign(new Error("Domain not allowed"), { error_type: "bad_domain_for_stytch_sdk" });
  assert.match(signInErrorMessage(error), /needs to be approved/);
});
