import { useEffect, useState, useCallback } from "react";

/**
 * Tiny hash router. Six routes is not worth a dependency; the views themselves
 * stay lazy via React.lazy + dynamic import.
 */
const read = () => {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, qs] = raw.split("?");
    return {
        seg: path.split("/").filter(Boolean),
        params: Object.fromEntries(new URLSearchParams(qs || ""))
    };
};

export function useRoute() {
    const [route, setRoute] = useState(read);
    useEffect(() => {
        const on = () => setRoute(read());
        addEventListener("hashchange", on);
        return () => removeEventListener("hashchange", on);
    }, []);
    return route;
}

export function go(hash) {
    if (location.hash === hash) return;
    location.hash = hash;
}

export function useNavigate() {
    return useCallback((hash) => go(hash), []);
}
