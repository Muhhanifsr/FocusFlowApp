const CACHE_NAME = "focusflow-pwa-v1";
const scopeUrl = new URL(self.registration.scope);
const appShellUrl = new URL("index.html", scopeUrl).href;
const shellAssets = [
  appShellUrl,
  new URL("manifest.webmanifest", scopeUrl).href,
  new URL("pwa-192.png", scopeUrl).href,
  new URL("pwa-512.png", scopeUrl).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const shellResponse = await fetch(appShellUrl);
      if (!shellResponse.ok) throw new Error("Unable to cache the FocusFlow app shell.");
      const html = await shellResponse.clone().text();
      await cache.put(appShellUrl, shellResponse);

      const builtAssets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
        .map((match) => new URL(match[1], scopeUrl).href);
      await cache.addAll([...shellAssets.slice(1), ...builtAssets]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("focusflow-pwa-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== scopeUrl.origin || !requestUrl.href.startsWith(scopeUrl.href)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(appShellUrl, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(appShellUrl)) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
