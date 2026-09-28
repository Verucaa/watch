import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ icons */
const PATHS = {
    play: "M8 5v14l11-7z",
    heart: "M12 21s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.5 5.2 5.2 0 0 1 21.3 12c-1.8 4.4-9.3 9-9.3 9",
    refresh: "M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7",
    back: "M15 5l-7 7 7 7",
    next: "M9 5l7 7-7 7",
    search: "M10.5 3a7.5 7.5 0 1 1-4.9 13.2l-3.1 3.1-1.4-1.4 3.1-3.1A7.5 7.5 0 0 1 10.5 3m0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11",
    plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
    bolt: "M13 2 4 14h6l-1 8 9-12h-6z",
    trash: "M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z",
    home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
    bookmark: "M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1",
    series: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1m2 3v2h2V8zm4 0v2h2V8zm4 0v2h2V8zM6 11v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2zM6 14v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2z"
};

export function Icon({ name, className = "h-5 w-5" }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
            <path d={PATHS[name] || ""} />
        </svg>
    );
}

/* ----------------------------------------------------------------- loader
   Module-level bridge so views can call pushLoader() without threading a
   context through every component. */
let setLoaderState = null;

export function pushLoader(text) {
    setLoaderState?.((s) => ({ d: s.d + 1, text: text ?? s.text }));
}
export function popLoader() {
    setLoaderState?.((s) => ({ d: Math.max(0, s.d - 1), text: s.text }));
}
export function hideLoader() {
    setLoaderState?.({ d: 0, text: "Memuat…" });
}

/** React-safe way to hold the global loader while a view is fetching. */
export function useBlockLoader(active, text = "Memuat…") {
    useEffect(() => {
        if (!active) return;
        pushLoader(text);
        return () => popLoader();
    }, [active, text]);
}

export function LoaderProvider({ children }) {
    const [state, setState] = useState({ d: 0, text: "Memuat…" });
    useEffect(() => {
        setLoaderState = setState;
        return () => {
            setLoaderState = null;
        };
    }, []);
    return (
        <>
            {children}
            {state.d > 0 && (
                <div className="fixed inset-0 z-[90] grid animate-fade place-content-center justify-items-center gap-4 bg-ink/75 backdrop-blur-sm" role="status" aria-busy="true" aria-live="polite">
                    <div className="relative h-14 w-14">
                        <i className="absolute inset-0 animate-spin-slow rounded-full border-2 border-transparent border-t-aqua" />
                        <i className="absolute inset-2 animate-spin-rev rounded-full border-2 border-transparent border-t-grape" />
                        <i className="absolute inset-4 animate-spin-slow rounded-full border-2 border-transparent border-t-white" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mist">{state.text}</p>
                </div>
            )}
        </>
    );
}

/* ----------------------------------------------------------------- toasts */
const toastSubs = new Set();
let toastId = 0;

export function toast(msg, kind = "") {
    const t = { id: ++toastId, msg, kind };
    toastSubs.forEach((fn) => fn(t));
    setTimeout(() => toastSubs.forEach((fn) => fn({ ...t, gone: true })), kind === "err" ? 4600 : 2800);
}

export function Toaster() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        const fn = (t) => setItems((cur) => (t.gone ? cur.filter((x) => x.id !== t.id) : [...cur, t].slice(-4)));
        toastSubs.add(fn);
        return () => toastSubs.delete(fn);
    }, []);
    return (
        <div className="pointer-events-none fixed bottom-[calc(4.5rem+44px)] right-3 z-[95] grid w-[min(320px,calc(100vw-28px))] gap-2 sm:bottom-24 sm:right-6">
            {items.map((t) => (
                <div
                    key={t.id}
                    className={`animate-rise rounded-xl border bg-slab/95 px-3.5 py-2.5 text-[13px] shadow-[0_14px_34px_-16px_#000] ${
                        t.kind === "err" ? "border-red-400/45" : t.kind === "ok" ? "border-green-400/40" : "border-ice/20"
                    }`}
                >
                    {t.msg}
                </div>
            ))}
        </div>
    );
}

/* -------------------------------------------------------------- feedback */
export const Spinner = ({ className = "h-11 w-11" }) => (
    <div className={`rounded-full border-2 border-ice/20 border-t-aqua animate-spin-slow ${className}`} />
);

export function SkeletonGrid({ n = 10 }) {
    return (
        <div className="grid-cards">
            {Array.from({ length: n }, (_, i) => (
                <div key={i}>
                    <div className="sk aspect-[2/3]" />
                    <div className="sk mt-2 h-[11px] w-full" />
                    <div className="sk mt-1.5 h-[11px] w-[55%]" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonRows({ n = 4 }) {
    return (
        <div className="grid gap-2.5">
            {Array.from({ length: n }, (_, i) => (
                <div key={i} className="sk h-16 w-full" />
            ))}
        </div>
    );
}

export const Empty = ({ title, sub }) => (
    <div className="grid place-items-center gap-3 px-5 py-16 text-center">
        <h3 className="font-title text-xl">{title}</h3>
        {sub ? <p className="muted max-w-md text-sm text-mist">{sub}</p> : null}
    </div>
);

export const SectionHead = ({ eyebrow, title, aside }) => (
    <div className="mb-3.5 flex items-end justify-between gap-3">
        <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 className="font-title text-[clamp(18px,3.6vw,26px)] leading-tight">{title}</h2>
        </div>
        {aside}
    </div>
);

export const ErrorNote = ({ children }) => <div className="rounded-xl border border-dashed border-ice/20 p-3.5 text-[13px] text-mist">{children}</div>;

/* ---------------------------------------------------------------- helpers */
export const tmdb = (p, size = "w342") => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);
export const yearOf = (d) => (d ? String(d).slice(0, 4) : "");
export const cx = (...a) => a.filter(Boolean).join(" ");

/** Upstream mixes TMDB movie/tv shapes; collapse to one card shape. */
export function norm(r, fallback = "movie") {
    const type = r.media_type || (r.title && !r.name ? "movie" : r.name && !r.title ? "tv" : fallback);
    return {
        id: r.id,
        type,
        title: r.title || r.name || "Tanpa judul",
        poster: r.poster_path || null,
        backdrop: r.backdrop_path || null,
        rating: r.vote_average || 0,
        year: yearOf(r.release_date || r.first_air_date),
        overview: r.overview || ""
    };
}
