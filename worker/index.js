import { getHomepage, search, getDetails, getEpisodes, getStreamUrls, getDirectStream } from "../lib/7reels.js";
import { cached, stats } from "../lib/cache.js";
import { proxyPlaylist, isAllowed } from "../lib/hls.js";

/**
 * Cloudflare Worker entry.
 *  - /api/*  handled here (run_worker_first in wrangler.jsonc)
 *  - /api/hls proxies m3u8 playlists (the CDN only allows vidcore.net/vidup.to
 *    as Referer, and browsers cannot set Referer from JS)
 *  - everything else falls through to the static Vite build via env.ASSETS
 */

/* 7reels.js swallows upstream failures and returns {error}. Turn that into a throw
   so lib/cache.js can fall back to a stale entry instead of caching the failure. */
const unwrap = (v) => {
    if (v && v.error) throw new Error(v.error);
    return v;
};

const clean = (v, fallback = null) => {
    const s = String(v ?? "").trim();
    return s === "" || s === "null" || s === "undefined" ? fallback : s;
};

const int = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
};

/** series always need a concrete s/e, otherwise every upstream URL comes back broken */
const ep = (u) => (u.searchParams.get("type") === "tv" ? { s: int(u.searchParams.get("s")) || 1, e: int(u.searchParams.get("e")) || 1 } : { s: null, e: null });

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const fail = (e) => json({ error: e?.message || "upstream error" }, 502);

const ROUTES = {
    "/api/health": () => json({ ok: true, edge: "cloudflare-worker", cache: stats() }),

    "/api/home": () => cached("home", 10 * 60e3, async () => unwrap(await getHomepage())).then(json),

    "/api/search": (u) => {
        const term = clean(u.searchParams.get("q"));
        const page = int(u.searchParams.get("page")) || 1;
        if (!term) return json({ query: "", page: 1, total: 0, results: [] });
        return cached(`search:${term}:${page}`, 30 * 60e3, async () => unwrap(await search(term, page))).then(json);
    },

    "/api/detail": (u) => {
        const type = u.searchParams.get("type") === "tv" ? "tv" : "movie";
        const id = clean(u.searchParams.get("id"));
        if (!id) return json({ error: "id required" }, 400);
        return cached(`detail:${type}:${id}`, 24 * 3600e3, async () => unwrap(await getDetails(id, type))).then(json);
    },

    "/api/episodes": (u) => {
        const id = clean(u.searchParams.get("id"));
        const season = int(u.searchParams.get("season")) || 1;
        if (!id) return json({ error: "id required" }, 400);
        return cached(`episodes:${id}:${season}`, 24 * 3600e3, async () => unwrap(await getEpisodes(id, season))).then(json);
    },

    "/api/servers": async (u) => {
        const type = u.searchParams.get("type") === "tv" ? "tv" : "movie";
        const id = clean(u.searchParams.get("id"));
        if (!id) return json({ error: "id required" }, 400);
        const { s, e } = ep(u);
        /* cached() merges with an object spread, so the producer must return an
           object -- a bare array comes back as {"0":..,"_cache":"miss"} */
        const payload = await cached(`servers:${type}:${id}:${s}:${e}`, 10 * 60e3, async () => {
            const list = unwrap(await getStreamUrls(id, type, s, e));
            return { embeds: Array.isArray(list) ? list : [] };
        });
        return json({ ...payload, type, id: String(id), season: s, episode: e });
    },

    /* direct HLS costs ~3s per player on a cold isolate, so it is NOT part of
       /api/servers: the embed list is what must load fast, direct only upgrades
       the server list once it arrives. */
    "/api/direct": async (u) => {
        const type = u.searchParams.get("type") === "tv" ? "tv" : "movie";
        const id = clean(u.searchParams.get("id"));
        if (!id) return json({ error: "id required" }, 400);
        const { s, e } = ep(u);

        try {
            const r = await cached(`direct:${type}:${id}:${s}:${e}`, 10 * 60e3, async () => {
                let note = null;
                for (const p of ["vidcore", "vidup", "vidfast"]) {
                    const res = await getDirectStream(id, type, s, e, p);
                    if (res.status === "success" && res.result?.url) return { ...res.result, _player: p };
                    note = res.message || note;
                }
                throw new Error(note || "no direct source");
            });
            if (!r.url) throw new Error("no direct source");
            return json({
                direct: {
                    label: "Direct HD",
                    player: r._player,
                    quality: "Auto · HD",
                    raw: r.url,
                    url: `/api/hls?u=${encodeURIComponent(r.url)}`,
                    qualities: true
                },
                type,
                id: String(id),
                season: s,
                episode: e
            });
        } catch (e) {
            return json({ direct: null, error: e.message, type, id: String(id), season: s, episode: e });
        }
    }
};

async function hlsRoute(u, env) {
    const src = clean(u.searchParams.get("u"));
    if (!isAllowed(src, env?.HLS_HOSTS)) return json({ error: "playlist not allowed" }, 400);
    const { body } = await proxyPlaylist(src, clean(u.searchParams.get("r")));
    return new Response(body, {
        headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*"
        }
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/api/")) {
            if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method not allowed" }, 405);
            try {
                if (url.pathname === "/api/hls") return await hlsRoute(url, env);
                const route = ROUTES[url.pathname];
                if (route) return await route(url);
                return json({ error: "unknown endpoint" }, 404);
            } catch (e) {
                return fail(e);
            }
        }

        if (!env?.ASSETS) return json({ error: "static assets binding missing" }, 500);
        return env.ASSETS.fetch(request);
    }
};
