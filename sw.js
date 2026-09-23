const CACHE = "cc-shell-v9";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=9",
  "./p50-history.css?v=5",
  "./app.js?v=9",
  "./google-calendar.js",
  "./google-calendar-session.js",
  "./google-calendar-data.js",
  "./recurrence.js",
  "./supabase-client.js",
  "./p50-history.js?v=5",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// App shell: tenta sempre a versão mais recente da rede e usa cache como fallback offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // deixa passar pedidos ao Supabase e outros externos

  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(async () => {
        const cached = await caches.match(e.request);
        if (cached) return cached;

        if (e.request.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }

        return Response.error();
      })
  );
});
