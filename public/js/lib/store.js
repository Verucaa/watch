import { store } from "./kv.js";

/* ------------------------------------------------------------ favorites */
const cap = (arr, n) => arr.slice(0, n);

export const favs = () => store.get("favs")?.v || [];

export const isFav = (id, type = "movie") => favs().some((f) => String(f.id) === String(id) && f.type === type);

export function toggleFav(item) {
    const list = favs();
    const i = list.findIndex((f) => String(f.id) === String(item.id) && f.type === item.type);
    if (i >= 0) list.splice(i, 1);
    else list.unshift({ ...item, at: Date.now() });
    store.set("favs", cap(list, 300), 0);
    return i < 0;
}

/* --------------------------------------------------------- watch history */
export const recent = () => store.get("recent")?.v || [];

export function pushRecent(item) {
    const list = recent().filter((r) => `${r.type}:${r.id}:${r.season}:${r.episode}` !== `${item.type}:${item.id}:${item.season}:${item.episode}`);
    list.unshift({ ...item, at: Date.now() });
    store.set("recent", cap(list, 40), 0);
}

export const clearRecent = () => store.del("recent");

/* ------------------------------------------------------- server health --
   Embeds are third-party and go down without notice. Remember which ones failed
   so the auto-failover starts from a server that actually answers. */
const HEALTH_TTL = 20 * 60e3;

const healthMap = () => store.get("health")?.v || {};

export function markServer(url, ok) {
    const h = healthMap();
    h[url] = { ok, t: Date.now() };
    store.set("health", h, 0);
}

export function serverState(url) {
    const h = healthMap()[url];
    if (!h || Date.now() - h.t > HEALTH_TTL) return "unknown";
    return h.ok ? "alive" : "dead";
}

/** alive first, unknown next, known-dead last. Stable within each bucket. */
export function rankServers(list) {
    const score = (s) => (s.url.startsWith("/api/") ? 2 : { alive: 0, unknown: 1, dead: 2 }[serverState(s.url)]);
    return list
        .map((s, i) => ({ s, i }))
        .sort((a, b) => score(a.s) - score(b.s) || a.i - b.i)
        .map((x) => x.s);
}

/* ------------------------------------------------------------- settings */
export const settings = () => ({ sub: "en", autonext: true, ...(store.get("settings")?.v || {}) });
export const setSettings = (patch) => store.set("settings", { ...settings(), ...patch }, 0);
