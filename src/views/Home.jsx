import { useMemo, useState } from "react";
import { useApi } from "../lib/api.js";
import { useRecent } from "../lib/store.js";
import { Icon, norm, tmdb, useBlockLoader } from "../lib/ui.jsx";
import { Section } from "../lib/card.jsx";
import { Deferred } from "../lib/lazy.jsx";

export default function Home() {
    const { data, error, loading } = useApi("/api/home", "home");
    const recent = useRecent();
    const [i, setI] = useState(() => Math.floor(Math.random() * 6));

    const { pool, trending, topOverall, movies, series } = useMemo(() => {
        const trending = (data?.topReels?.trending || []).map(norm);
        const topOverall = (data?.topReels?.topOverall || []).map(norm);
        const movies = (data?.featured?.movie || []).map((r) => norm(r, "movie"));
        const series = (data?.featured?.tv || []).map((r) => norm(r, "tv"));
        const withArt = [...trending, ...movies, ...series].filter((m) => m.backdrop);
        return { pool: withArt, trending, topOverall, movies, series };
    }, [data]);

    useBlockLoader(loading && !data, "Mengambil pilihan…");
    if (loading && !data) return <div className="wrap py-10" />;

    if (error && !data) {
        return (
            <div className="wrap py-20 text-center">
                <h3 className="font-title text-xl">Tidak bisa memuat beranda</h3>
                <p className="mt-2 text-sm text-mist">{error.message}</p>
            </div>
        );
    }

    const hero = pool[Math.min(i, Math.max(pool.length - 1, 0))];

    return (
        <div>
            {hero ? (
                <section className="relative -mt-[58px] grid min-h-[clamp(340px,62vh,620px)] items-end overflow-hidden border-b border-ice/10 px-[clamp(14px,4vw,34px)] pb-8 pt-24 sm:-mt-[66px]">
                    <div className="absolute inset-0">
                        <img key={hero.id} src={tmdb(hero.backdrop, "w1280")} alt="" fetchPriority="high" className="h-full w-full animate-fade object-cover opacity-50 saturate-110" />
                        <div className="absolute inset-0 bg-gradient-to-b from-ink/50 via-ink/25 to-ink" />
                        <div className="absolute inset-0 bg-gradient-to-r from-ink/90 to-transparent" />
                    </div>
                    <div className="relative z-10 mx-auto w-full max-w-shell">
                        <h1 className="font-title text-[clamp(30px,8.2vw,66px)] leading-[1.05]">{hero.title}</h1>
                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                            <span className="chip border-amber-400/45 text-amber-300">★ {hero.rating ? hero.rating.toFixed(1) : "-"}</span>
                            {hero.year ? <span className="chip">{hero.year}</span> : null}
                            <span className="chip border-ice/45 text-ice">{hero.type === "tv" ? "Series" : "Film"}</span>
                            {data?._src && data._src !== "net" ? <span className="chip border-grape/45 text-violet-300">{data._src === "cache" ? "dari cache" : "cache + muat ulang"}</span> : null}
                        </div>
                        {hero.overview ? <p className="mt-3.5 max-w-[60ch] text-[#cdd9ec]">{hero.overview.length > 260 ? `${hero.overview.slice(0, 260)}…` : hero.overview}</p> : null}
                        <div className="mt-5 flex flex-wrap gap-2.5">
                            <a href={`#/watch/${hero.type}/${hero.id}`} className="btn btn-primary"><Icon name="play" className="h-[18px] w-[18px]" />Tonton</a>
                            <a href={`#/detail/${hero.type}/${hero.id}`} className="btn">Detail</a>
                            <button type="button" className="btn btn-icon" aria-label="Ganti judul" title="Ganti judul" onClick={() => setI((n) => n + 1)}>
                                <Icon name="refresh" className="h-[19px] w-[19px]" />
                            </button>
                        </div>
                    </div>
                </section>
            ) : null}

            <div className="wrap grid gap-8 py-8">
                {recent.length ? (
                    <Deferred height={200}>
                        <Section eyebrow="Riwayat" title="Lanjut Menonton" items={recent.slice(0, 12)} mode="rail" />
                    </Deferred>
                ) : null}

                <Deferred height={220}>
                    <Section eyebrow="Viral" title="Trending Sekarang" items={trending.slice(0, 20)} mode="rail" />
                </Deferred>

                <Deferred height={420}>
                    <Section eyebrow="Peringkat" title="Top 10" items={topOverall} mode="ranked" />
                </Deferred>

                <Deferred height={220}>
                    <Section eyebrow="Featured" title="Film Pilihan" items={movies} />
                </Deferred>

                <Deferred height={220}>
                    <Section eyebrow="Serial" title="Series Pilihan" items={series.length ? series : trending.filter((m) => m.type === "tv")} />
                </Deferred>

                {!trending.length && !movies.length ? <p className="py-16 text-center text-sm text-mist">Sumber sedang kosong. Coba beberapa saat lagi.</p> : null}
            </div>
        </div>
    );
}
