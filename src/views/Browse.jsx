import { useMemo } from "react";
import { useApi } from "../lib/api.js";
import { Grid } from "../lib/card.jsx";
import { Empty, SkeletonGrid, norm, useBlockLoader } from "../lib/ui.jsx";

/** Shared page for #/trending and #/series — both read the cached home payload. */
export default function Browse({ mode }) {
    const { data, error, loading } = useApi("/api/home", "home");
    useBlockLoader(loading && !data, "Memuat…");

    const list = useMemo(() => {
        const trending = (data?.topReels?.trending || []).map(norm);
        const overall = (data?.topReels?.topOverall || []).map(norm);
        const raw =
            mode === "series"
                ? [...trending, ...(data?.featured?.tv || []).map((m) => norm(m, "tv")), ...overall].filter((m) => m.type === "tv")
                : [...trending, ...(data?.featured?.movie || []).map((m) => norm(m, "movie"))];
        const seen = new Set();
        return raw.filter((m) => (seen.has(`${m.type}:${m.id}`) ? false : (seen.add(`${m.type}:${m.id}`), true)));
    }, [data, mode]);

    const title = mode === "series" ? "Semua Series" : "Trending";

    if (error && !data) return <Empty title="Gagal memuat" sub={error.message} />;

    return (
        <div className="wrap grid gap-5 py-6">
            <div>
                <p className="eyebrow">{mode === "series" ? "Serial" : "Viral"}</p>
                <h1 className="font-title text-[clamp(24px,6vw,40px)]">{title}</h1>
                <p className="mt-1 text-xs text-mist">
                    {list.length} judul{data?._src && data._src !== "net" ? " · dari cache" : " · data terbaru"}
                </p>
            </div>
            {loading && !data ? <SkeletonGrid n={14} /> : <Grid items={list} />}
        </div>
    );
}
