import http from "./http.js";

/**
 * The m3u8 CDNs behind 7reels allowlist Referer on playlists (#EXTM3U) but
 * expose segments with `access-control-allow-origin: *`. A browser cannot spoof
 * Referer (forbidden header), so playlists have to be fetched server-side.
 *
 * Only .m3u8 over https is proxied, and only from hosts on the list below --
 * otherwise this endpoint would be an open proxy.
 *
 * ponytail: the list is static because Cloudflare Workers isolates are NOT shared
 * between requests, so anything learned in /api/servers is gone by the time
 * /api/hls runs. When the CDN rotates a host, set the HLS_HOSTS env var on the
 * Worker (comma separated, no rebuild). If this ever must track hosts
 * dynamically, sign the URL in /api/servers instead.
 */
const DEFAULT_HOSTS = "moon.quietridge.top,emberforge.site";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
const REFERRERS = ["https://vidcore.net/", "https://vidup.to/"];

/** envHosts: comma-separated override, see the note above. */
export function isAllowed(url, envHosts) {
    const list = String(envHosts || DEFAULT_HOSTS)
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        return u.protocol === "https:" && /\.m3u8(\?|$)/i.test(u.pathname + u.search) && list.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
        return false;
    }
}

/** Wrap every playlist URI so the client keeps talking to us; segments stay direct. */
export function rewritePlaylist(playlist, srcUrl) {
    const base = new URL(srcUrl);
    const proxied = (abs) => `/api/hls?u=${encodeURIComponent(abs)}&r=${encodeURIComponent(REFERRERS[0])}`;
    return playlist
        .split(/\r?\n/)
        .map((line) => {
            const t = line.trim();
            if (!t || t.startsWith("#")) return line;
            if (/^[a-z]+:\/\//i.test(t)) {
                return /\.m3u8(\?|$)/i.test(t) ? proxied(t) : t;
            }
            const abs = new URL(t, base).href;
            return /\.m3u8(\?|$)/i.test(abs) ? proxied(abs) : abs;
        })
        .join("\n");
}

export async function proxyPlaylist(url, referer) {
    const first = REFERRERS.includes(referer) ? referer : REFERRERS[0];
    const order = [first, ...REFERRERS].filter((v, i, a) => a.indexOf(v) === i);
    let lastErr;
    for (const r of order) {
        try {
            const res = await http.get(url, { headers: { "User-Agent": UA, Referer: r, Accept: "*/*" }, timeout: 8000 });
            const body = String(res.data || "");
            if (!body.includes("#EXTM3U")) throw new Error("not an m3u8 playlist");
            return { body: rewritePlaylist(body, url), referer: r };
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error("playlist fetch failed");
}
