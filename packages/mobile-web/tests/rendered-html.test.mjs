import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the secure desktop pairing entry point", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(self\)/);

  const html = await response.text();
  assert.match(html, /<title>Nimbalyst — AI development command center<\/title>/i);
  assert.match(html, /Bring your desktop sessions with you/);
  assert.match(html, /Scan desktop QR code/);
  assert.match(html, /Paste pairing payload/);
  assert.match(html, /Explore with preview sessions/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("never caches the credential-bearing sign-in callback", async () => {
  const response = await render("/pair/callback?session_token=secret");
  assert.equal(response.status, 302);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("location") ?? "", /^\/pair\/callback#session_token=secret$/);
  assert.equal(await response.text(), "");
});

test("ships an installable standalone web app shell", async () => {
  const [manifestText, serviceWorker, packageJson] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.name, "Nimbalyst");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.theme_color, "#0b0b0d");
  assert.ok(manifest.icons.some((icon) => icon.purpose.includes("maskable")));
  assert.match(serviceWorker, /nimbalyst-mobile-v2/);
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /session_token/);
  assert.match(serviceWorker, /sensitiveRoute \|\| sensitiveQuery/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|site-creator-vinext-starter/);
});
