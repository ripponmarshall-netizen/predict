"use strict";

// Bump this on each deploy to bust the cache
const CACHE = "predikt-v2";
const FONT_CACHE = "predikt-fonts-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./config.js",
  "./styles.css",
  "./helpers.jsx",
  "./data.jsx",
  "./icons.jsx",
  "./components.jsx",
  "./questions.jsx",
  "./leaderboard.jsx",
  "./me.jsx",
  "./admin.jsx",
  "./app.jsx",
  "./icon-192.svg",
  "./icon-512.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

// React + Babel load from a CDN at pinned versions (see index.html). Without
// caching them the app can't start offline, so they are precached too.
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js",
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js",
];
const CDN_HOSTS = new Set(["unpkg.com", "cdn.jsdelivr.net"]);

// Cache each file on its own: cache.addAll() is all-or-nothing, so one
// failed download would otherwise leave nothing cached at all.
const precache = (cache, urls, init) =>
  Promise.all(
    urls.map((u) =>
      fetch(new Request(u, init))
        .then((res) => (res.ok ? cache.put(u, res) : null))
        .catch(() => null),
    ),
  );

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all([
          // "reload" skips the browser's HTTP cache. Without it a deploy can
          // precache a stale copy of a file next to fresh ones, mixing old
          // and new code in one cache version.
          precache(cache, ASSETS, { cache: "reload" }),
          precache(cache, CDN_ASSETS, { mode: "cors", credentials: "omit" }),
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Google Fonts: stale-while-revalidate
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    e.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          const networkFetch = fetch(e.request)
            .then((response) => {
              cache.put(e.request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || networkFetch;
        }),
      ),
    );
    return;
  }

  // Anything else from another site (the Supabase API above all) goes
  // straight to the network: live data is never served from a cache.
  if (url.origin !== self.location.origin && !CDN_HOSTS.has(url.hostname)) {
    return;
  }

  // config.js says which database to use: network-first, so a change to it
  // reaches installed copies without waiting for a new cache version.
  if (url.pathname.endsWith("/config.js")) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./config.js", copy));
          }
          return response;
        })
        .catch(() => caches.match("./config.js")),
    );
    return;
  }

  // App shell document: network-first
  if (url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // Only a good page replaces the cached shell; a 404/5xx would
          // otherwise be what opens next time the phone is offline.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(e.request)
            .then((cached) => cached || caches.match("./index.html")),
        ),
    );
    return;
  }

  // App assets and pinned CDN scripts: cache-first, falling back to network
  const isCdn = CDN_HOSTS.has(url.hostname);
  e.respondWith(
    caches.match(e.request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (
            res &&
            res.status === 200 &&
            (url.origin === self.location.origin || isCdn)
          ) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
    }),
  );
});
