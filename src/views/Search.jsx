import { useCallback, useEffect, useRef, useState } from "react";
import { useApi, qs } from "../lib/api.js";
import { Grid } from "../lib/card.jsx";
import { Icon, SkeletonGrid, Empty, norm, toast, useBlockLoader } from "../lib/ui.jsx";

const HINTS = ["Dune", "Breaking Bad", "Interstellar", "Inception", "Oppenheimer", "Arcane", "The Last of Us"];

export default function Search({ params }) {
    const [term, setTerm] = useState(params.q || "");
    const [page, setPage] = useState(1);
    const [extra, setExtra] = useState([]);
    const inputRef = useRef(null);
    const first = useRef(true);

    const path = term ? `/api/search?${qs({ q: term, page: 1 })}` : "";
    const { data, error, loading } = useApi(path, "search");
    useBlockLoader(loading && !data, term ? "Mencari…" : "Menyiapkan…");

    const results = data?.results || [];
    const shown = page === 1 ? results : [...results, ...extra];

    useEffect(() => {
        if (first.current) {
            first.current = false;
            inputRef.current?.focus();
        }
    }, []);

    const submit = useCallback((value) => {
        const v = (value ?? term).trim();
        setTerm(v);
        setPage(1);
        setExtra([]);
        if (v && location.hash !== `#/search?q=${encodeURIComponent(v)}`) location.hash = `#/search?q=${encodeURIComponent(v)}`;
    }, [term]);

    // debounce as the user types
    useEffect(() => {
        if (term === (params.q || "")) return;
        const t = setTimeout(() => submit(term), 450);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [term]);

    const loadMore = async () => {
        const next = page + 1;
        setPage(next);
        try {
            const res = await fetch(`/api/search?${qs({ q: term, page: next })}`).then((r) => r.json());
            setExtra((cur) => [...cur, ...(res.results || []).map(norm)]);
        } catch {
            toast("Gagal memuat halaman berikutnya", "err");
        }
    };

    return (
        <div className="wrap grid gap-5 py-6">
            <div className="sticky top-[58px] z-30 flex gap-2.5 bg-gradient-to-b from-ink via-ink/80 to-transparent py-3.5 sm:top-[66px]">
                <div className="relative flex-1">
                    <Icon name="search" className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 fill-slate-500" />
                    <input
                        ref={inputRef}
                        type="search"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        placeholder="Cari judul film atau series…"
                        autoComplete="off"
                        enterKeyHint="search"
                        aria-label="Cari film"
                        className="w-full rounded-full border border-ice/20 bg-white/5 py-3 pl-11 pr-4 outline-none transition focus:border-aqua focus:ring-4 focus:ring-aqua/20"
                    />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => submit()}>Cari</button>
            </div>

            <div className="flex flex-wrap gap-2">
                {HINTS.map((h) => (
                    <button key={h} type="button" onClick={() => submit(h)} className="rounded-full border border-ice/20 bg-white/[0.04] px-3.5 py-1.5 text-xs transition hover:border-aqua hover:text-ice">
                        {h}
                    </button>
                ))}
            </div>

            {term && data ? (
                <p className="-mt-2 text-xs text-mist">
                    {data.total || results.length} hasil{data._src && data._src !== "net" ? " · dari cache" : ""}
                </p>
            ) : null}

            {error && !data ? <Empty title="Pencarian gagal" sub={error.message} /> : null}

            {!term ? <Empty title="Ketik judul" sub="Cari film atau series yang ingin ditonton." /> : null}

            {term && loading && !data ? <SkeletonGrid n={12} /> : null}

            {term && !loading && shown.length ? (
                <>
                    <h2 className="font-title text-lg">Hasil untuk "{term}"</h2>
                    <Grid items={shown} />
                    {results.length > 0 ? (
                        <div className="flex justify-center py-4">
                            <button type="button" className="btn" onClick={loadMore}>Muat lebih banyak</button>
                        </div>
                    ) : null}
                </>
            ) : null}

            {term && !loading && !shown.length ? <Empty title={`Tidak ada hasil untuk "${term}"`} sub="Coba kata kunci lain." /> : null}

            {term && typeof navigator !== "undefined" && navigator.onLine === false ? (
                <p className="text-xs text-amber-300">Mode offline — hanya hasil tersimpan yang bisa dibuka.</p>
            ) : null}
        </div>
    );
}
