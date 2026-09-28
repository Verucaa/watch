import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getHomepage, search, getDetails, getEpisodes, getStreamUrls, getDirectStream, setProxy } from "./lib/7reels.js";
import { cached, stats } from "./lib/cache.js";
import { proxyPlaylist, isAllowed, allowHost } from "./lib/hls.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

if (process.env.PROXY_URL) setProxy(process.env.PROXY_URL);

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

/* 7reels.js swallows upstream failures and returns {error}. Turn that into a throw
   so lib/cache.js can fall back to a stale entry instead of caching the failure. */
const unwrap = (v) => {
    if (v && v.error) throw new Error(v.error);
    return v;
};

const asyncRoute = (fn) => (req, res) =>
    fn(req, res).catch((e) => res.status(502).json({ error: e.message || "upstream error" }));

const clean = (v, fallback = null) => {
    const s = String(v ?? "").trim();
    return s === "" || s === "null" || s === "undefined" ? fallback : s;
};
const int = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
};

/* ---------------------------------------------------------------- data */

app.get(
    "/api/home",
    asyncRoute(async (_req, res) => {
        res.json(await cached("home", 10 * 60e3, async () => unwrap(await getHomepage())));
    })
);

app.get(
    "/api/search",
    asyncRoute(async (req, res) => {
        const q = clean(req.query.q);
        const page = int(req.query.page) || 1;
        if (!q) return res.json({ query: "", page: 1, total: 0, results: [] });
        res.json(await cached(`search:${q}:${page}`, 30 * 60e3, async () => unwrap(await search(q, page))));
    })
);

app.get(
    "/api/detail/:type/:id",
    asyncRoute(async (req, res) => {
        const type = req.params.type === "tv" ? "tv" : "movie";
        res.json(await cached(`detail:${type}:${req.params.id}`, 24 * 3600e3, async () => unwrap(await getDetails(req.params.id, type))));
    })
);

app.get(
    "/api/episodes/:id/:season",
    asyncRoute(async (req, res) => {
        const season = int(req.params.season) || 1;
        res.json(await cached(`episodes:${req.params.id}:${season}`, 24 * 3600e3, async () => unwrap(await getEpisodes(req.params.id, season))));
    })
);

/** Embed servers + best-effort direct m3u8 (proxied so the browser can read it). */
app.get(
    "/api/servers",
    asyncRoute(async (req, res) => {
        const type = req.query.type === "tv" ? "tv" : "movie";
        const id = clean(req.query.id);
        const season = int(req.query.s);
        const episode = int(req.query.e);
        if (!id) return res.status(400).json({ error: "id required" });

        const payload = await cached(`servers:${type}:${id}:${season}:${episode}`, 10 * 60e3, async () => {
            const embeds = await getStreamUrls(id, type, season, episode);
            return { embeds: Array.isArray(embeds) ? embeds : [] };
        });

        let direct = null;
        let directError = null;
        try {
            const r = await cached(`direct:${type}:${id}:${season}:${episode}`, 10 * 60e3, async () => {
                for (const p of ["vidcore", "vidup", "vidfast"]) {
                    const res = await getDirectStream(id, type, season, episode, p);
                    if (res.status === "success" && res.result?.url) {
                        return { ...res.result, _player: p };
                    }
                    directError = res.message || directError;
                }
                throw new Error(directError || "no direct source");
            });
            if (r.url) {
                allowHost(r.url);
                direct = {
                    label: "Direct HD",
                    player: r._player,
                    raw: r.url,
                    url: `/api/hls?u=${encodeURIComponent(r.url)}`,
                    qualities: true,
                    noReferrer: !!r.noReferrer
                };
            }
        } catch (e) {
            directError = e.message;
        }

        res.json({ ...payload, direct, directError, type, id: String(id), season, episode });
    })
);

app.get(
    "/api/hls",
    asyncRoute(async (req, res) => {
        const u = clean(req.query.u);
        if (!isAllowed(u)) return res.status(400).json({ error: "playlist not allowed" });
        const { body } = await proxyPlaylist(u, clean(req.query.r, undefined));
        res.set("Content-Type", "application/vnd.apple.mpegurl");
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Cache-Control", "no-store");
        res.send(body);
    })
);

app.get("/api/health", (_req, res) => res.json({ ok: true, up: process.uptime(), cache: stats() }));

/* ---------------------------------------------------------------- static */

app.use(
    express.static(path.join(__dirname, "public"), {
        etag: true,
        maxAge: "1h",
        setHeaders: (res, file) => {
            if (file.endsWith("sw.js") || file.endsWith(".html")) res.set("Cache-Control", "no-cache");
        }
    })
);

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`WATCH17 ready on http://localhost:${PORT}`));
