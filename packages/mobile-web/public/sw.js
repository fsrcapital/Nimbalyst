const CACHE_NAME = "nimbalyst-mobile-v8";
const APP_SHELL = ["/", "/manifest.webmanifest", "/nimbalyst-icon-192.png", "/nimbalyst-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(APP_SHELL.map((path) => cache.add(path).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const sensitiveKeys = ["state", "session_token", "session_jwt", "user_id", "org_id", "email"];
  const sensitiveRoute = url.pathname.startsWith("/pair/") || url.pathname.startsWith("/auth/");
  const sensitiveQuery = sensitiveKeys.some((key) => url.searchParams.has(key));
  if (sensitiveRoute || sensitiveQuery) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "A Nimbalyst session needs your input." };
  }
  const title = payload.title || "Nimbalyst";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "A session needs your input.",
    icon: "/nimbalyst-icon-192.png",
    badge: "/nimbalyst-icon-192.png",
    tag: payload.tag || "nimbalyst-waiting",
    renotify: true,
    data: payload.data || { url: "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if ("navigate" in client) await client.navigate(targetUrl);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
