import assert from "node:assert/strict";
import test from "node:test";
import { decryptText, deriveEncryptionKey } from "../lib/crypto.ts";
import { accountFromPayload, parsePairingPayload, syncHttpOrigin } from "../lib/pairing.ts";

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
