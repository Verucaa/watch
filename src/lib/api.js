import { useEffect, useState, useSyncExternalStore } from "react";
import { store } from "./kv.js";
import { toast } from "./ui.jsx";

/** ttl per resource kind, in ms. Detail/episodes barely change -> cache hard. */
const TTL = {
    home: 10 * 60e3,
    search: 30 * 60e3,
    detail: 24 * 3600e3,
    episodes: 24 * 3600e3,
    servers: 10 * 60e3
};

const inflight = new Map();

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
 * Stale-while-revalidate over localStorage: a hit renders instantly, the network
 * refresh happens behind it. Offline or upstream down -> serve the last good copy
 * instead of an error page.
 */
export async function api(path, kind = "search", opts = {}) {
    const key = opts.key || `${kind}:${path}`;
    const ttl = opts.ttl ?? TTL[kind] ?? TTL.search;
    const hit = opts.force ? null : store.get(key);
    const age = hit ? Date.now() - hit.t : Infinity;

    if (hit && age < ttl) return { ...hit.v, _src: "cache" };

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
            if (typeof window !== "undefined" && navigator.onLine === false) toast("Offline — memakai cache", "err");
            throw e;
        });

    inflight.set(key, job);
    try {
        return await job;
    } finally {
        inflight.delete(key);
    }
}

/** reachability probe used for the pre-flight server health check */
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

/** useApi('/api/home', 'home') -> { data, error, loading, reload } */
export function useApi(path, kind, opts = {}) {
    const key = opts.key || `${kind}:${path}`;
    const [bust, setBust] = useState(0);

    /* paint from the cached copy immediately, revalidate behind it -- a reload
       with a warm cache must not flash a skeleton */
    const [state, setState] = useState(() => {
        if (!path) return { data: null, error: null, loading: false };
        const hit = store.get(key)?.v;
        return { data: hit ? { ...hit, _src: "cache" } : null, error: null, loading: true };
    });

    useEffect(() => {
        if (!path) return;
        let alive = true;
        api(path, kind, { ...opts, key, force: bust > 0 })
            .then((data) => alive && setState({ data, error: null, loading: false }))
            /* keep whatever we already painted: a failed refresh must not blank the page */
            .catch((error) => alive && setState((s) => ({ data: s.data, error, loading: false })));
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, bust]);

    return { ...state, reload: () => setBust((n) => n + 1) };
}

/** subscribe to one localStorage-backed key. The fallback is captured once so
    getSnapshot keeps a stable identity (an inline [] each render loops React). */
export function useLocal(key, fallback) {
    const [empty] = useState(() => fallback ?? null);
    return useSyncExternalStore(
        (cb) => store.subscribe(cb),
        () => {
            const hit = store.get(key)?.v;
            return hit === null || hit === undefined ? empty : hit;
        },
        () => empty
    );
}

export const qs = (o) =>
    Object.entries(o)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
