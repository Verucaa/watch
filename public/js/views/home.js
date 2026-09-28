import { api } from "../lib/api.js";
import { el, icon, tmdb, skeletons, empty, pushLoader, popLoader } from "../lib/ui.js";
import { section, norm, card } from "../lib/card.js";
import { recent } from "../lib/store.js";
import { lazyImg } from "../lib/lazy.js";

export async function homeView(mount) {
    const wrap = el("div", { class: "stack" });
    const heroSlot = el("div");
    const body = el("div", { class: "wrap stack" }, skeletons(10));
    wrap.append(heroSlot, body);
    mount(wrap);

    pushLoader("Mengambil pilihan…");
    let data;
    try {
        data = await api("/api/home", "home");
    } catch (e) {
        popLoader();
        body.replaceChildren(empty("Tidak bisa memuat beranda", `${e.message}. Coba lagi nanti.`));
        return;
    }
    popLoader();

    const trending = (data.topReels?.trending || []).map((r) => norm(r));
    const topOverall = (data.topReels?.topOverall || []).map((r) => norm(r));
    const movies = (data.featured?.movie || []).map((r) => norm(r, "movie"));
    const series = (data.featured?.tv || []).map((r) => norm(r, "tv"));
    const pool = [...trending, ...movies, ...series].filter((m) => m.backdrop);

    /* ---- hero with client-side shuffle (no extra requests) */
    if (pool.length) {
        let i = Math.floor(Math.random() * Math.min(pool.length, 8));
        const slide = el("div", { class: "hero-in" });
        const bgImg = el("img", { alt: "", fetchpriority: "high" });
        const paint = () => {
            const m = pool[i];
            bgImg.src = tmdb(m.backdrop, "w1280");
            slide.replaceChildren(
                el("h1", { class: "title", text: m.title }),
                el(
                    "div",
                    { class: "hero-meta" },
                    el("span", { class: "chip rate", text: `★ ${m.rating ? m.rating.toFixed(1) : "-"}` }),
                    m.year ? el("span", { class: "chip", text: m.year }) : null,
                    el("span", { class: "chip sky", text: m.type === "tv" ? "Series" : "Film" }),
                    m.overview ? el("span", { class: "chip", text: `${m.overview.split(/\s+/).length} kata` }) : null,
                    data._src && data._src !== "net" ? el("span", { class: "chip vio", text: data._src === "cache" ? "dari cache" : "cache + muat ulang" }) : null
                ),
                m.overview ? el("p", { class: "ov", text: m.overview.length > 260 ? `${m.overview.slice(0, 260)}…` : m.overview }) : null,
                el(
                    "div",
                    { class: "acts" },
                    el("a", { class: "btn primary", href: `#/watch/${m.type}/${m.id}` }, icon("play"), "Tonton"),
                    el("a", { class: "btn", href: `#/detail/${m.type}/${m.id}` }, "Detail"),
                    el("button", { class: "btn icon", "aria-label": "Ganti judul", title: "Ganti judul", onclick: () => { i = (i + 1) % pool.length; paint(); } }, icon("refresh"))
                )
            );
        };
        paint();
        heroSlot.append(el("div", { class: "hero" }, el("div", { class: "hero-bg" }, bgImg), slide));
    }

    const cont = recent().slice(0, 12);

    body.append(
        section("Trending Sekarang", trending.slice(0, 20), { eyebrow: "Viral", mode: "rail" }),
        section("Top 10", topOverall, { eyebrow: "Peringkat", mode: "ranked" }),
        section("Film Pilihan", movies, { eyebrow: "Featured" }),
        section("Lanjut Menonton", cont.map((r) => ({ ...r })), { eyebrow: "Riwayat", mode: "rail" }),
        section("Series Pilihan", series.length ? series : trending.filter((m) => m.type === "tv"), { eyebrow: "Serial" })
    );

    if (!trending.length && !movies.length) {
        body.replaceChildren(empty("Belum ada data", "Sumber sedang kosong. Coba beberapa saat lagi."));
    }
}
