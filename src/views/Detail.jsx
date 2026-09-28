import { useEffect, useState } from "react";
import { useApi, qs } from "../lib/api.js";
import { isFav, toggleFav, useFavs } from "../lib/store.js";
import { Icon, Empty, SkeletonRows, SkeletonGrid, toast, tmdb, useBlockLoader, yearOf } from "../lib/ui.jsx";
import { Deferred } from "../lib/lazy.jsx";

export default function Detail({ type = "movie", id, params }) {
    const { data: d, error, loading } = useApi(`/api/detail?${qs({ type, id })}`, "detail");
    useBlockLoader(loading && !d, "Mengambil detail…");

    const favs = useFavs();
    const [fav, setFav] = useState(false);
    useEffect(() => setFav(isFav(favs, id, type)), [favs, id, type]);

    if (error && !d) return <div className="wrap py-10"><Empty title="Gagal memuat detail" sub={error.message} /></div>;
    if (!d) return <div className="wrap py-10">{loading ? <SkeletonGrid n={6} /> : null}</div>;

    const genres = (d.genres || []).map((g) => g.name);
    const cast = (d.cast || []).filter((c) => c.profile_path).slice(0, 14);
    const crew = (d.crew || []).filter((c) => ["Director", "Writer", "Creator", "Screenplay"].some((j) => (c.job || "").includes(j))).slice(0, 8);
    const favItem = { id, type, title: d.title, poster: d.poster ? d.poster.replace("https://image.tmdb.org/t/p/w500", "") : null, year: yearOf(d.releaseDate) };

    return (
        <div className="grid gap-8">
            <div className="relative">
                {d.backdrop ? (
                    <div className="absolute inset-x-0 top-0 h-[380px] overflow-hidden opacity-35">
                        <img src={tmdb(d.backdrop, "w1280")} alt="" className="h-full w-full object-cover [mask-image:linear-gradient(180deg,#000_20%,transparent)]" />
                    </div>
                ) : null}
                <div className="wrap relative grid grid-cols-[104px_1fr] items-start gap-4 pb-2 pt-[74px] sm:grid-cols-[180px_1fr] sm:gap-6 lg:grid-cols-[220px_1fr]">
                    <div className="overflow-hidden rounded-xl border border-ice/20 shadow-[0_24px_50px_-28px_#000] sm:rounded-shell sm:shadow-[0_30px_60px_-30px_#000]">
                        {d.poster ? (
                            <img src={tmdb(d.poster, "w342")} alt={d.title} width="342" height="513" className="aspect-[2/3] w-full object-cover" />
                        ) : (
                            <div className="grid aspect-[2/3] place-items-center text-ice/20"><Icon name="play" className="h-8 w-8" /></div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="chip border-ice/45 text-ice">{type === "tv" ? "Series" : "Film"}</span>
                            {d.rating ? <span className="chip border-amber-400/45 text-amber-300">★ {Number(d.rating).toFixed(1)}</span> : null}
                            {yearOf(d.releaseDate) ? <span className="chip">{yearOf(d.releaseDate)}</span> : null}
                            {d._src && d._src !== "net" ? <span className="chip border-grape/45 text-violet-300">dari cache</span> : null}
                            {genres.slice(0, type === "tv" ? 2 : 3).map((g) => <span key={g} className="chip">{g}</span>)}
                        </div>
                        <h1 className="mt-2 font-title text-[clamp(19px,5.4vw,48px)] leading-[1.1] [overflow-wrap:anywhere] sm:mt-1.5">{d.title || d.originalTitle || "Tanpa judul"}</h1>
                        {d.originalTitle && d.originalTitle !== d.title ? <p className="text-[11px] text-mist sm:text-xs">{d.originalTitle}</p> : null}
                        <p className="mt-2.5 text-[13px] leading-relaxed text-mist sm:mt-3.5 sm:text-[15px]">{d.overview || "Tidak ada sinopsis."}</p>
                        <div className="mt-4 flex flex-wrap gap-2 sm:mt-5 sm:gap-2.5">
                            <a href={`#/watch/${type}/${id}`} className="btn btn-primary flex-1 px-4 sm:flex-none sm:px-5"><Icon name="play" className="h-[18px] w-[18px]" />Putar</a>
                            <button
                                type="button"
                                className={`btn flex-1 px-4 sm:flex-none sm:px-5 ${fav ? "border-pink-400/50 text-pink-300" : ""}`}
                                onClick={() => {
                                    setFav(toggleFav(favItem));
                                    toast(fav ? "Dihapus dari daftar" : "Disimpan ke daftar", fav ? "" : "ok");
                                }}
                            >
                                <Icon name="heart" className="h-[18px] w-[18px]" />{fav ? "Tersimpan" : "Simpan"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="wrap grid gap-8">
                {cast.length ? (
                    <Deferred height={120}>
                        <p className="eyebrow">Cast</p>
                        <h2 className="mb-3.5 font-title text-xl">Pemain</h2>
                        <div className="rail no-scrollbar">
                            {cast.map((c) => (
                                <figure key={c.id} className="w-[108px] text-center">
                                    <img src={tmdb(c.profile_path, "w185")} alt={c.name} loading="lazy" className="mx-auto mb-1.5 h-[68px] w-[68px] rounded-full border border-ice/20 bg-slab2 object-cover" />
                                    <figcaption className="truncate text-[11.5px] text-mist">{c.name}</figcaption>
                                    {c.character ? <figcaption className="truncate text-[11px] text-slate-500">{c.character}</figcaption> : null}
                                </figure>
                            ))}
                        </div>
                    </Deferred>
                ) : null}

                {crew.length ? (
                    <section>
                        <p className="eyebrow">Kru</p>
                        <h2 className="mb-3.5 font-title text-xl">Sutradara & Penulis</h2>
                        <div className="flex flex-wrap gap-2">
                            {crew.map((c) => <span key={`${c.id}-${c.job}`} className="chip">{c.name} · {c.job}</span>)}
                        </div>
                    </section>
                ) : null}

                {type === "tv" ? <Seasons tvId={id} initial={Number(params.s) || 1} /> : null}
            </div>
        </div>
    );
}

function Seasons({ tvId, initial }) {
    const [seasons, setSeasons] = useState(() => [initial]);
    const [current, setCurrent] = useState(initial);
    const { data, error, loading } = useApi(`/api/episodes?${qs({ id: tvId, season: current })}`, "episodes");
    useBlockLoader(loading && !data, `Episode season ${current}…`);

    useEffect(() => {
        setSeasons((cur) => (cur.includes(current) ? cur : [...cur, current].sort((a, b) => a - b)));
    }, [current]);

    const episodes = data?.episodes || [];
    const addSeason = () => setCurrent((n) => Math.max(0, ...seasons) + 1);

    return (
        <section>
            <div className="mb-3.5 flex flex-wrap items-end justify-between gap-2.5">
                <div>
                    <p className="eyebrow">Episode</p>
                    <h2 className="font-title text-xl">Pilih episode</h2>
                </div>
                <button type="button" className="btn px-4 py-2.5 text-[13px]" onClick={addSeason}>
                    <Icon name="plus" className="h-[18px] w-[18px]" />Season berikutnya
                </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
                {seasons.map((s) => (
                    <button key={s} type="button" className={`rounded-lg border px-4 py-2 text-[13px] font-semibold transition ${s === current ? "border-ice/50 bg-gradsoft text-ice" : "border-ice/20 bg-white/[0.04] hover:border-aqua"}`} onClick={() => setCurrent(s)}>
                        {`Season ${s}`}
                    </button>
                ))}
            </div>

            {error && !data ? <Empty title="Gagal memuat episode" sub={error.message} /> : null}
            {loading && !data ? <SkeletonRows n={6} /> : null}
            {data && !episodes.length ? <p className="rounded-xl border border-dashed border-ice/20 p-3.5 text-[13px] text-mist">Season {current} belum tersedia.</p> : null}

            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5">
                {episodes.map((ep) => (
                    <a key={ep.id} href={`#/watch/tv/${tvId}?s=${current}&e=${ep.episodeNumber}`} className="rounded-[11px] border border-ice/10 bg-slab/70 p-2 transition hover:border-aqua">
                        {ep.stillPath ? <img src={tmdb(ep.stillPath, "w300")} alt={ep.name || ""} loading="lazy" className="mb-1.5 aspect-video w-full rounded-lg object-cover" /> : null}
                        <b className="block text-[12.5px]">E{ep.episodeNumber} · {ep.name || "Episode"}</b>
                        <span className="block truncate text-[11px] text-mist">
                            {[ep.airDate ? ep.airDate.slice(0, 4) : null, ep.rating ? `★ ${Number(ep.rating).toFixed(1)}` : null].filter(Boolean).join(" · ")}
                        </span>
                    </a>
                ))}
            </div>
        </section>
    );
}
