import { api } from "../lib/api.js";
import { el, icon, skeletons, empty, pushLoader, popLoader } from "../lib/ui.js";
import { grid, norm, section } from "../lib/card.js";
import { favs, clearRecent, recent } from "../lib/store.js";
import { store } from "../lib/kv.js";

/** Shared page for #/trending and #/series -- both read the cached home payload. */
export async function browseView(mount, params) {
    const mode = params.mode === "series" ? "series" : "trending";
    const title = mode === "series" ? "Semua Series" : "Trending";
    const wrap = el("div", { class: "wrap stack" }, skeletons(14));
    mount(wrap);

    pushLoader("Memuat…");
    let data;
    try {
        data = await api("/api/home", "home");
    } catch (e) {
        popLoader();
        wrap.replaceChildren(empty("Gagal memuat", e.message));
        return;
    }
    popLoader();

    const trending = (data.topReels?.trending || []).map((r) => norm(r));
    const overall = (data.topReels?.topOverall || []).map((r) => norm(r));
    const list =
        mode === "series"
            ? [...trending, ...overall].filter((m) => m.type === "tv")
            : [...trending, ...(data.featured?.movie || []).map((m) => norm(m, "movie"))];

    const seen = new Set();
    const unique = list.filter((m) => (seen.has(`${m.type}:${m.id}`) ? false : (seen.add(`${m.type}:${m.id}`), true)));

    wrap.replaceChildren(
        el("div", {}, el("p", { class: "eyebrow", text: mode === "series" ? "Serial" : "Viral" }), el("h1", { class: "title", style: "font-size:clamp(24px,6vw,40px)", text: title })),
        el("p", { class: "small muted", text: `${unique.length} judul · ${data._src && data._src !== "net" ? "dari cache" : "data terbaru"}` }),
        grid(unique)
    );
}

export function listView(mount) {
    const favList = favs();
    const watchList = recent();
    const bytes = (store.bytes() / 1024).toFixed(0);

    const wrap = el("div", { class: "wrap stack" });
    wrap.append(
        el(
            "div",
            {},
            el("p", { class: "eyebrow", text: "Koleksi" }),
            el("h1", { class: "title", style: "font-size:clamp(24px,6vw,40px)", text: "Daftar Saya" }),
            el("p", { class: "small muted", text: `Cache lokal ${bytes} KB · ${store.keys().length} entri` })
        )
    );

    if (watchList.length) {
        wrap.append(
            el(
                "div",
                { class: "bar" },
                el("h2", { class: "title", style: "font-size:18px;margin-right:auto", text: "Riwayat Tonton" }),
                el("button", { class: "btn icon", title: "Hapus riwayat", onclick: () => { clearRecent(); listView(mount); } }, icon("trash"))
            ),
            section("Riwayat", watchList, { mode: "rail" })
        );
    }
    if (favList.length) wrap.append(section("Favorit", favList, { mode: "rail" }));
    if (!favList.length && !watchList.length) wrap.append(empty("Belum ada apa-apa", "Tekan ikon hati pada judul untuk menyimpannya."));

    wrap.append(
        el(
            "div",
            { class: "bar" },
            el(
                "button",
                {
                    class: "btn ghost",
                    onclick: () => {
                        store.clear();
                        listView(mount);
                    }
                },
                icon("trash"),
                "Bersihkan cache"
            )
        )
    );
    mount(wrap);
}
