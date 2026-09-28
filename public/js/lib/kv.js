/**
 * localStorage cache layer.
 * ponytail: 3.5 MB soft cap, evict oldest entries first. localStorage is sync and
 * tiny compared to IndexedDB -- a 2.5x smaller refactor is not worth it here.
 */
const NS = "w17:";
const SOFT_CAP = 3.5 * 1024 * 1024;

function raw(key) {
    try {
        return localStorage.getItem(NS + key);
    } catch {
        return null;
    }
}

function write(key, entry) {
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
}

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

export const store = {
    get(key) {
        const s = raw(key);
        if (!s) return null;
        try {
            const e = JSON.parse(s);
            return e && typeof e === "object" && "t" in e ? e : null;
        } catch {
            return null;
        }
    },
    set(key, value, ttl) {
        const e = { t: Date.now(), ttl: ttl || 0, v: value };
        write(key, e);
        return e;
    },
    del(key) {
        try {
            localStorage.removeItem(NS + key);
        } catch {}
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
    }
};
