import { api, q } from "../lib/api.js";
import { el, icon, tmdb, skeletons, empty, pushLoader, popLoader, toast, yearOf, sectionHead } from "../lib/ui.js";
import { lazyImg, lazySection } from "../lib/lazy.js";
import { isFav, toggleFav } from "../lib/store.js";

export async function detailView(mount, params) {
    const { id, type: t } = { id: params.id, type: params.type || "movie" };
    const wrap = el("div", { class: "wrap stack" }, skeletons(8));
    mount(wrap);

    pushLoader("Mengambil detail…");
    let d;
    try {
        d = await api(`/api/detail/${t}/${id}`, "detail");
    } catch (e) {
        popLoader();
        wrap.replaceChildren(empty("Gagal memuat detail", e.message));
        return;
    }
    popLoader();

    const genres = (d.genres || []).map((g) => g.name);
    const favLabel = el("span");
    const favBtn = el(
        "button",
        {
            class: "btn",
            onclick: () =>
                paintFav(
                    toggleFav({
                        id,
                        type: t,
                        title: d.title,
                        poster: d.poster ? d.poster.replace("https://image.tmdb.org/t/p/w500", "") : null,
                        year: yearOf(d.releaseDate)
                    })
                )
        },
        icon("heart"),
        favLabel
    );
    function paintFav(on) {
        favBtn.classList.toggle("on", on);
        favLabel.textContent = on ? " Tersimpan" : " Simpan";
    }
    paintFav(isFav(id, t));

    const bg = d.backdrop ? el("div", { class: "detail-bg" }, lazyImg(tmdb(d.backdrop, "w1280"), "")) : null;
    const poster = el(
        "div",
        { class: "detail-poster" },
        d.poster ? lazyImg(tmdb(d.poster, "w500"), d.title) : el("div", { class: "ph", style: "aspect-ratio:2/3;display:grid;place-items:center" }, icon("play"))
    );

    const info = el(
        "div",
        {},
        el(
            "div",
            { class: "hero-meta", style: "margin-top:0" },
            el("span", { class: "chip sky", text: t === "tv" ? "Series" : "Film" }),
            d.rating ? el("span", { class: "chip rate", text: `★ ${Number(d.rating).toFixed(1)}` }) : null,
            yearOf(d.releaseDate) ? el("span", { class: "chip", text: yearOf(d.releaseDate) }) : null,
            d._src && d._src !== "net" ? el("span", { class: "chip vio", text: "dari cache" }) : null,
            ...genres.slice(0, 3).map((g) => el("span", { class: "chip", text: g }))
        ),
        el("h1", { class: "title", text: d.title || d.originalTitle || "Tanpa judul" }),
        d.originalTitle && d.originalTitle !== d.title ? el("p", { class: "small muted", text: d.originalTitle }) : null,
        el("p", { class: "muted", style: "max-width:70ch;margin:14px 0 0", text: d.overview || "Tidak ada sinopsis." }),
        el("div", { class: "acts" }, el("a", { class: "btn primary", href: `#/watch/${t}/${id}` }, icon("play"), "Putar"), favBtn)
    );

    wrap.replaceChildren(
        el("div", { class: "detail" }, bg, el("div", { class: "detail-in" }, poster, info)),
        el("div", { class: "stack" })
    );

    const rest = wrap.lastElementChild;
    const cast = (d.cast || []).filter((c) => c.profile_path).slice(0, 14);
    if (cast.length) {
        rest.append(
            lazySection("Pemain", () =>
                el(
                    "div",
                    {},
                    sectionHead("Cast", "Pemain"),
                    el(
                        "div",
                        { class: "cast" },
                        cast.map((c) =>
                            el("figure", {}, lazyImg(tmdb(c.profile_path, "w185"), c.name), el("figcaption", { text: c.name }), el("figcaption", { class: "small", text: c.character || "" }))
                        )
                    )
                )
            )
        );
    }

    const crew = (d.crew || []).filter((c) => ["Director", "Writer", "Creator", "Screenplay"].some((j) => (c.job || "").includes(j))).slice(0, 8);
    if (crew.length) {
        rest.append(
            el("div", {}, sectionHead("Kru", "Sutradara & Penulis"), el(
                "div",
                { class: "bar" },
                crew.map((c) => el("span", { class: "chip", text: `${c.name} · ${c.job}` }))
            ))
        );
    }

    if (t === "tv") {
        const epsBox = el("div", { class: "stack" });
        const seasonBar = el("div", { class: "tabs" });
        rest.append(el("div", {}, sectionHead("Episode", "Pilih episode", el("button", { class: "btn", onclick: addSeason }, icon("plus"), "Season berikutnya")), seasonBar, epsBox));
        const seasons = new Set();
        await loadSeason(Number(params.s) || 1);

        async function loadSeason(n) {
            pushLoader(`Episode season ${n}…`);
            let data;
            try {
                data = await api(`/api/episodes/${id}/${n}`, "episodes");
            } catch (e) {
                popLoader();
                toast(`Gagal memuat season ${n}`, "err");
                return;
            }
            popLoader();
            const list = data.episodes || [];
            seasons.add(n);
            seasonBar.replaceChildren(
                [...seasons].sort((a, b) => a - b).map((s) => el("button", { class: `tab ${s === n ? "on" : ""}`, onclick: () => loadSeason(s) }, `Season ${s}`))
            );
            if (!list.length) {
                epsBox.replaceChildren(el("p", { class: "note", text: `Season ${n} belum tersedia.` }));
                return;
            }
            epsBox.replaceChildren(
                el(
                    "div",
                    { class: "eps" },
                    list.map((ep) =>
                        el(
                            "a",
                            { class: "ep", href: `#/watch/tv/${id}?s=${n}&e=${ep.episodeNumber}` },
                            ep.stillPath ? lazyImg(tmdb(ep.stillPath, "w300"), ep.name || `Episode ${ep.episodeNumber}`) : null,
                            el("b", { text: `E${ep.episodeNumber} · ${ep.name || "Episode"}` }),
                            el("span", { text: [ep.airDate ? ep.airDate.slice(0, 4) : null, ep.rating ? `★ ${Number(ep.rating).toFixed(1)}` : null].filter(Boolean).join(" · ") })
                        )
                    )
                )
            );
        }

        function addSeason() {
            const last = Math.max(0, ...seasons);
            loadSeason(last + 1);
        }
    }
}
