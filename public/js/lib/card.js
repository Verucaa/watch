import { el, icon, tmdb, yearOf, sectionHead, toast } from "./ui.js";
import { lazyImg, lazySection } from "./lazy.js";
import { isFav, toggleFav } from "./store.js";

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

const href = (m) => `#/detail/${m.type}/${m.id}`;

export function card(m) {
    const favBtn = el(
        "button",
        {
            class: "btn icon",
            type: "button",
            "aria-label": "Simpan ke daftar",
            style: "position:absolute;bottom:8px;right:8px;padding:7px;background:rgba(4,6,12,.72);backdrop-filter:blur(6px)"
        },
        icon("heart")
    );
    const paint = () => {
        const on = isFav(m.id, m.type);
        favBtn.style.color = on ? "#f472b6" : "#cbd5e1";
        favBtn.style.borderColor = on ? "rgba(244,114,182,.5)" : "";
    };
    favBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const added = toggleFav({ id: m.id, type: m.type, title: m.title, poster: m.poster, year: m.year });
        paint();
        toast(added ? "Disimpan ke daftar" : "Dihapus dari daftar", added ? "ok" : "");
    });
    paint();

    return el(
        "a",
        { class: "poster", href: href(m) },
        m.poster ? lazyImg(tmdb(m.poster), m.title) : el("div", { class: "ph" }, icon("play")),
        el("div", { class: "badge", text: m.type === "tv" ? "SERIES" : "FILM" }),
        m.rating ? el("div", { class: "rating", text: `★ ${m.rating.toFixed(1)}` }) : null,
        favBtn,
        el("div", { class: "poster-body" }, el("div", { class: "t", text: m.title }), m.year ? el("div", { class: "small muted", text: m.year }) : null)
    );
}

export function grid(movies) {
    return el("div", { class: "grid" }, movies.map(card));
}

export function rail(movies) {
    return el("div", { class: "rail" }, movies.map(card));
}

export function ranked(movies) {
    return el(
        "div",
        { class: "ranked" },
        movies.slice(0, 20).map((m, i) =>
            el(
                "a",
                { class: "ranked-row", href: href(m) },
                el("div", { class: "n", text: String(i + 1) }),
                m.poster ? lazyImg(tmdb(m.poster, "w185"), m.title) : el("div", { class: "sk", style: "width:58px;aspect-ratio:2/3" }),
                el(
                    "div",
                    { class: "m grow" },
                    el("div", { class: "t", text: m.title }),
                    el("div", { class: "small muted", text: [m.type === "tv" ? "Series" : "Film", m.year, m.rating ? `★ ${m.rating.toFixed(1)}` : null].filter(Boolean).join(" · ") })
                )
            )
        )
    );
}

/** Section whose body is only built when it scrolls near the viewport. */
export function section(title, movies, { eyebrow, mode = "grid", aside } = {}) {
    if (!movies || !movies.length) return null;
    return lazySection(title, () =>
        el("div", {}, sectionHead(eyebrow, title, aside), mode === "rail" ? rail(movies) : mode === "ranked" ? ranked(movies) : grid(movies))
    );
}
