/**
 * Offline shell. Static assets are cache-first (Vite hashes filenames, so a
 * cached file can never go stale); navigation is network-first with the last
 * good shell as fallback. /api/* is deliberately NOT cached here -- the app
 * already does stale-while-revalidate in localStorage, and double caching only
 * hides upstream errors.
 */
const CACHE = "w17-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    const { request } = e;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;
    if (url.pathname.startsWith("/api/")) return;

    if (request.mode === "navigate") {
        e.respondWith(
            fetch(request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put("/index.html", copy));
                    return res;
                })
                .catch(() => caches.match("/index.html").then((r) => r || Response.error()))
        );
        return;
    }

    e.respondWith(
        caches.match(request).then(
            (hit) =>
                hit ||
                fetch(request).then((res) => {
                    if (res.ok && res.type === "basic") {
                        const copy = res.clone();
                        caches.open(CACHE).then((c) => c.put(request, copy));
                    }
                    return res;
                })
        )
    );
});
