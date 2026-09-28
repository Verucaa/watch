import { useState } from "react";
import { Icon, cx, norm, tmdb, toast } from "./ui.jsx";
import { isFav, toggleFav, useFavs } from "./store.js";

export const href = (m) => `#/detail/${m.type}/${m.id}`;

export function Card({ media: m }) {
    const favs = useFavs();
    const [on, setOn] = useState(isFav(favs, m.id, m.type));

    return (
        <a href={href(m)} className="poster group block">
            {m.poster ? (
                <img
                    src={tmdb(m.poster)}
                    alt={m.title}
                    loading="lazy"
                    decoding="async"
                    width="342"
                    height="513"
                    className="aspect-[2/3] w-full bg-gradient-to-br from-slab2 to-coal object-cover transition duration-500 group-hover:scale-[1.04]"
                />
            ) : (
                <div className="grid aspect-[2/3] place-items-center text-ice/20">
                    <Icon name="play" className="h-8 w-8" />
                </div>
            )}
            <span className="absolute left-1.5 top-1.5 rounded-lg bg-ink/80 px-2 py-0.5 text-[10.5px] font-bold">{m.type === "tv" ? "SERIES" : "FILM"}</span>
            {m.rating ? <span className="absolute right-1.5 top-1.5 rounded-lg bg-ink/80 px-2 py-0.5 text-[10.5px] font-bold text-amber-300">★ {m.rating.toFixed(1)}</span> : null}
            <button
                type="button"
                aria-label="Simpan ke daftar"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const added = toggleFav({ id: m.id, type: m.type, title: m.title, poster: m.poster, year: m.year });
                    setOn(added);
                    toast(added ? "Disimpan ke daftar" : "Dihapus dari daftar", added ? "ok" : "");
                }}
                className={cx(
                    "absolute bottom-1.5 right-1.5 rounded-lg border border-white/10 bg-ink/75 p-1.5 backdrop-blur transition hover:scale-110",
                    on ? "text-pink-400" : "text-slate-300"
                )}
            >
                <Icon name="heart" className="h-4 w-4" />
            </button>
            <div className="p-2.5">
                <div className="line-clamp-2 font-title text-[13.5px] font-bold leading-tight">{m.title}</div>
                {m.year ? <div className="text-xs text-mist">{m.year}</div> : null}
            </div>
        </a>
    );
}

export const Grid = ({ items }) => (
    <div className="grid-cards">
        {items.map((m) => (
            <Card key={`${m.type}:${m.id}`} media={m} />
        ))}
    </div>
);

export const Rail = ({ items }) => (
    <div className="rail no-scrollbar">
        {items.map((m) => (
            <Card key={`${m.type}:${m.id}`} media={m} />
        ))}
    </div>
);

export const Ranked = ({ items }) => (
    <div className="grid gap-2.5">
        {items.slice(0, 20).map((m, i) => (
            <a key={`${m.type}:${m.id}`} href={href(m)} className="flex items-center gap-3.5 rounded-xl border border-ice/10 bg-slab/60 p-2 transition hover:border-ice/40 hover:bg-slab2/80">
                <div className="grad-text w-8 flex-none text-center font-title text-3xl font-extrabold">{i + 1}</div>
                {m.poster ? <img src={tmdb(m.poster, "w185")} alt="" loading="lazy" decoding="async" className="h-[86px] w-[58px] flex-none rounded-lg object-cover" /> : <div className="sk h-[86px] w-[58px] flex-none" />}
                <div className="min-w-0 flex-1">
                    <div className="truncate font-title text-sm font-bold">{m.title}</div>
                    <div className="truncate text-xs text-mist">
                        {[m.type === "tv" ? "Series" : "Film", m.year, m.rating ? `★ ${m.rating.toFixed(1)}` : null].filter(Boolean).join(" · ")}
                    </div>
                </div>
            </a>
        ))}
    </div>
);

/** Sections below the fold mount on scroll (see useInView in Home). */
export function Section({ eyebrow, title, items, mode = "grid", aside }) {
    if (!items?.length) return null;
    return (
        <section className="content-auto">
            <div className="mb-3.5 flex items-end justify-between gap-3">
                <div>
                    {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
                    <h2 className="font-title text-[clamp(18px,3.6vw,26px)] leading-tight">{title}</h2>
                </div>
                {aside}
            </div>
            {mode === "rail" ? <Rail items={items} /> : mode === "ranked" ? <Ranked items={items} /> : <Grid items={items} />}
        </section>
    );
}

export { norm };
