import { store } from "./kv.js";
import { toast, offlineBadge } from "./ui.js";

/** ttl per resource kind, in ms. Detail/episodes barely change -> cache hard. */
const TTL = {
    home: 10 * 60e3,
    search: 30 * 60e3,
    detail: 24 * 3600e3,
    episodes: 24 * 3600e3,
    servers: 10 * 60e3
};

const inflight = new Map();
const online = () => navigator.onLine !== false;

async function fetchJson(path, timeout = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(path, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
        return body;
    } finally {
        clearTimeout(t);
    }
}

/**
 * Stale-while-revalidate: return a hit instantly, refresh in the background.
 * Offline or upstream down -> serve the last good copy instead of an error page.
 */
export async function api(path, kind = "search", opts = {}) {
    const key = opts.key || `${kind}:${path}`;
    const ttl = opts.ttl ?? TTL[kind] ?? TTL.search;
    const hit = store.get(key);
    const age = hit ? Date.now() - hit.t : Infinity;

    if (hit && age < ttl) {
        return { ...hit.v, _src: "cache" };
    }

    if (hit) {
        if (!inflight.has(key)) {
            inflight.set(
                key,
                fetchJson(path)
                    .then((v) => store.set(key, v, ttl))
                    .catch(() => null)
                    .finally(() => inflight.delete(key))
            );
        }
        return { ...hit.v, _src: "stale" };
    }

    if (inflight.has(key)) return inflight.get(key);

    const job = fetchJson(path, opts.timeout)
        .then((v) => {
            store.set(key, v, ttl);
            return { ...v, _src: "net" };
        })
        .catch((e) => {
            offlineBadge(!online());
            throw e;
        });

    inflight.set(key, job);
    try {
        return await job;
    } finally {
        inflight.delete(key);
    }
}

export const q = (o) =>
    Object.entries(o)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

export async function probe(url, ms = 4500) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        await fetch(url, { mode: "no-cors", signal: ctrl.signal, cache: "no-store" });
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(t);
    }
}

addEventListener("online", () => {
    offlineBadge(false);
    toast("Koneksi kembali aktif", "ok");
});
addEventListener("offline", () => {
    offlineBadge(true);
    toast("Offline — data dari cache", "err");
});
