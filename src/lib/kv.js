/**
 * localStorage cache layer.
 * ponytail: 3.5 MB soft cap, evict oldest first. localStorage is sync and small
 * compared to IndexedDB -- a bigger rewrite is not worth it for a 6-tab app.
 */
const NS = "w17:";
const SOFT_CAP = 3.5 * 1024 * 1024;

const raw = (key) => {
    try {
        return localStorage.getItem(NS + key);
    } catch {
        return null;
    }
};

function evict() {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(NS)) continue;
        let t = 0;
        try {
            t = JSON.parse(localStorage.getItem(k) || "{}").t || 0;
        } catch {}
        items.push([k, t]);
    }
    items.sort((a, b) => a[1] - b[1]);
    let freed = 0;
    for (const [k] of items) {
        freed += (localStorage.getItem(k) || "").length;
        localStorage.removeItem(k);
        if (freed > 1.2 * 1024 * 1024) break;
    }
}

const write = (key, entry) => {
    try {
        localStorage.setItem(NS + key, JSON.stringify(entry));
        return true;
    } catch {
        evict();
        try {
            localStorage.setItem(NS + key, JSON.stringify(entry));
            return true;
        } catch {
            return false;
        }
    }
};

const listeners = new Set();

/* useSyncExternalStore calls getSnapshot on every render, so parsing the same
   string twice would hand React a new object reference each time and loop forever.
   One slot is not enough: two components on different keys would thrash it, so
   keep a small per-string memo. */
const memo = new Map();
const MEMO_MAX = 64;

function parse(s) {
    if (!s) return null;
    try {
        const e = JSON.parse(s);
        return e && typeof e === "object" && "t" in e ? e : null;
    } catch {
        return null;
    }
}

export const store = {
    get(key) {
        const s = raw(key);
        if (s === null) return null;
        if (memo.has(s)) return memo.get(s);
        const val = parse(s);
        if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
        memo.set(s, val);
        return val;
    },
    set(key, value, ttl) {
        const entry = { t: Date.now(), ttl: ttl || 0, v: value };
        const ok = write(key, entry);
        if (ok) listeners.forEach((fn) => fn(key));
        return entry;
    },
    del(key) {
        try {
            localStorage.removeItem(NS + key);
        } catch {}
        listeners.forEach((fn) => fn(key));
    },
    keys() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(NS)) out.push(k.slice(NS.length));
        }
        return out;
    },
    clear(prefix = "") {
        for (const k of store.keys()) if (!prefix || k.startsWith(prefix)) store.del(k);
    },
    bytes() {
        let n = 0;
        for (const k of store.keys()) n += (raw(k) || "").length;
        return n;
    },
    subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }
};
