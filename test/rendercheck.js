/**
 * Render smoke test: every route must mount and produce markup without a real
 * network or real localStorage. Catches what a build cannot -- bad hook order,
 * undefined fixture fields, snapshot loops. Run: npm run check:render
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/* ------------------------------------------------------------- browser stubs */
const mem = new Map();
globalThis.localStorage = {
    get length() {
        return mem.size;
    },
    key: (i) => [...mem.keys()][i] ?? null,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
};
globalThis.location = { hash: "#/home", origin: "https://w.test", href: "https://w.test/#/home", replace() {} };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
Object.defineProperty(globalThis, "document", { value: { title: "" }, configurable: true });

const HOME = {
    featured: {
        movie: [{ id: 1, title: "Film Satu", overview: "o", backdrop_path: "/b.jpg", poster_path: "/p.jpg", vote_average: 8.1, release_date: "2024-02-02" }],
        tv: [{ id: 2, name: "Seri Dua", overview: "o", backdrop_path: "/b2.jpg", poster_path: "/p2.jpg", vote_average: 7.4, first_air_date: "2023-05-05" }]
    },
    topReels: {
        trending: [{ id: 3, media_type: "tv", name: "Trending Tiga", overview: "o", backdrop_path: "/b3.jpg", poster_path: "/p3.jpg", vote_average: 9, first_air_date: "2025-01-01" }],
        topOverall: [{ id: 4, media_type: "movie", title: "Top Empat", vote_average: 6, release_date: "2020-01-01" }]
    }
};
const ROUTES = {
    "/api/home": HOME,
    "/api/search": { query: "dune", page: 1, total: 1, results: [{ id: 5, title: "Dune", vote_average: 8, release_date: "2021-10-22", poster_path: "/p5.jpg" }] },
    "/api/detail": { id: 1, title: "Film Satu", originalTitle: "Film Satu", overview: "sinopsis", rating: 8.1, releaseDate: "2024-02-02", poster: "https://image.tmdb.org/t/p/w500/p.jpg", backdrop: "https://image.tmdb.org/t/p/w780/b.jpg", genres: [{ name: "Aksi" }], cast: [{ id: 9, name: "Aktor", character: "Tokoh", profile_path: "/c.jpg" }], crew: [{ id: 10, name: "Sutradara", job: "Director" }] },
    "/api/episodes": { episodes: [{ id: 11, episodeNumber: 1, name: "Awal", airDate: "2024-03-01", rating: 8.4, stillPath: "/s.jpg" }] },
    "/api/servers": { embeds: [{ server: "Strigil", quality: "4K", url: "https://strigil.cc/embed/movie/1" }] },
    "/api/direct": { direct: { label: "Direct HD", quality: "Auto · HD", url: "/api/hls?u=x" } }
};
/* seed the localStorage SWR cache so the first paint has data, exactly like a
   warm reload does */
const seed = (kind, path, v) => mem.set(`w17:${kind}:${path}`, JSON.stringify({ t: Date.now(), ttl: 0, v }));
seed("home", "/api/home", HOME);
seed("search", "/api/search?q=dune&page=1", ROUTES["/api/search"]);
seed("detail", "/api/detail?type=movie&id=1", ROUTES["/api/detail"]);
seed("detail", "/api/detail?type=tv&id=2", { ...ROUTES["/api/detail"], id: 2, title: "Seri Dua" });
seed("episodes", "/api/episodes?id=2&season=1", ROUTES["/api/episodes"]);
seed("servers", "/api/servers?type=movie&id=1", ROUTES["/api/servers"]);
seed("direct", "/api/direct?type=movie&id=1", ROUTES["/api/direct"]);
seed("servers", "/api/servers?type=tv&id=2&s=1&e=2", ROUTES["/api/servers"]);
seed("direct", "/api/direct?type=tv&id=2&s=1&e=2", ROUTES["/api/direct"]);
seed("servers", "/api/servers?type=tv&id=2&s=1&e=1", { embeds: [{ server: "Default S1E1", quality: "HD", url: "https://strigil.cc/embed/tv/2/1/1" }] });
seed("direct", "/api/direct?type=tv&id=2&s=1&e=1", ROUTES["/api/direct"]);

globalThis.fetch = async (url) => {
    const body = ROUTES[String(url).split("?")[0]] || {};
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};

/* ----------------------------------------------------------------- bundle app */
/* react stays external so the app and react-dom/server share one instance;
   the bundle therefore has to sit inside the project for node_modules resolution */
const dir = join("node_modules", ".cache", "w17-render");
await mkdir(dir, { recursive: true });
const out = join(dir, "app.mjs");
await build({
    entryPoints: ["src/App.jsx"],
    bundle: true,
    format: "esm",
    outfile: out,
    jsx: "automatic",
    platform: "neutral",
    define: { "process.env.NODE_ENV": '"development"' },
    external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime", "react/jsx-dev-runtime"],
    logLevel: "silent"
});
const { default: App } = await import(pathToFileURL(resolve(out)).href);

const CASES = [
    /* home defers its below-the-fold sections to IntersectionObserver, so only
       the hero is guaranteed to be in the first pass */
    ["#/home", ["WATCH", "Tonton"]],
    ["#/trending", ["Trending", "Film Satu"]],
    ["#/series", ["Semua Series", "Seri Dua"]],
    ["#/search", ["Cari", "Dune"]],
    ["#/list", ["Daftar Saya", "Belum ada apa-apa"]],
    /* the cast rail is deferred, so only the always-visible header is asserted */
    ["#/detail/movie/1", ["Film Satu", "Aksi", "Sutradara"]],
    ["#/detail/tv/2?s=1", ["Seri Dua", "Pilih episode", "Season 1", "Awal"]],
    ["#/watch/movie/1", ["Strigil", "Direct HD"]],
    ["#/watch/tv/2?s=1&e=2", ["Navigasi episode", "Berikutnya"]],
    /* a bare tv watch url must resolve s=1/e=1: the cache key below only exists
       with those params, so seeing this server proves the default was applied */
    ["#/watch/tv/2", ["Default S1E1"]]
];

/* pass 1 warms the React.lazy modules, pass 2 asserts on real markup */
for (const [hash] of CASES) {
    location.hash = hash;
    renderToString(createElement(App));
}
await new Promise((r) => setTimeout(r, 30));

for (const [hash, expects] of CASES) {
    location.hash = hash;
    const html = renderToString(createElement(App));
    const missing = expects.filter((e) => !html.includes(e));
    assert.equal(missing.length, 0, `${hash} missing ${JSON.stringify(missing)}`);
    assert.ok(!html.includes("Something went wrong"), `${hash} hit a React error boundary`);
    console.log(`ok ${hash.padEnd(24)} ${html.length} bytes`);
}
/* a skeleton proves the deferred blocks are deferred, not silently missing */
for (const hash of ["#/home", "#/detail/movie/1"]) {
    location.hash = hash;
    assert.ok(renderToString(createElement(App)).includes('class="sk'), `${hash} must reserve space for deferred blocks`);
}

console.log("ok - every route renders");
