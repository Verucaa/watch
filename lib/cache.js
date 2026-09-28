/**
 * TTL cache with in-flight dedupe and stale-on-error fallback.
 * ponytail: one Map, no LRU library. 400 entries is plenty for a single-user cache.
 */
const MAX = 400;
const store = new Map();
const inflight = new Map();

function prune() {
    while (store.size > MAX) {
        store.delete(store.keys().next().value);
    }
}

export async function cached(key, ttl, producer) {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now - hit.t < ttl) {
        return { ...hit.v, _cache: "hit" };
    }
    if (inflight.has(key)) {
        return inflight.get(key);
    }

    const job = (async () => {
        try {
            const v = await producer();
            store.set(key, { t: Date.now(), v });
            prune();
            return { ...hit?.v, ...v, _cache: hit ? "revalidate" : "miss" };
        } catch (e) {
            if (hit) {
                return { ...hit.v, _cache: "stale", _age: now - hit.t, _err: e.message };
            }
            throw e;
        } finally {
            inflight.delete(key);
        }
    })();

    inflight.set(key, job);
    return job;
}

export function stats() {
    return { entries: store.size, inflight: inflight.size, max: MAX };
}
