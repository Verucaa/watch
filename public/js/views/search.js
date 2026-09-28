import { api, q } from "../lib/api.js";
import { el, icon, skeletons, empty, pushLoader, popLoader, toast } from "../lib/ui.js";
import { grid, norm } from "../lib/card.js";

const HINTS = ["Dune", "Breaking Bad", "Interstellar", "Inception", "Oppenheimer", "Naruto", "Arcane", "The Last of Us"];

export async function searchView(mount, params) {
    const input = el("input", {
        type: "search",
        placeholder: "Cari judul film atau series…",
        value: params.q || "",
        autocomplete: "off",
        enterkeyhint: "search",
        "aria-label": "Cari film"
    });

    const out = el("div", { class: "stack" });
    const pageInfo = el("p", { class: "small muted" });
    const more = el("button", { class: "btn", hidden: true }, "Muat lebih banyak");

    const wrap = el(
        "div",
        { class: "wrap stack" },
        el(
            "div",
            { class: "searchbar" },
            el("div", { class: "field" }, icon("search"), input),
            el("button", { class: "btn primary", onclick: () => submit() }, "Cari")
        ),
        el("div", { class: "suggest" }, HINTS.map((h) => el("button", { onclick: () => { input.value = h; submit(); } }, h))),
        pageInfo,
        out,
        el("div", { style: "display:flex;justify-content:center" }, more)
    );
    mount(wrap);

    let term = (params.q || "").trim();
    let page = 1;
    let total = 0;
    let busy = false;

    async function run(append) {
        if (busy || !term) return;
        busy = true;
        more.hidden = true;
        pushLoader(append ? "Memuat lagi…" : "Mencari…");
        if (!append) out.replaceChildren(skeletons(12));
        let data;
        try {
            data = await api(`/api/search?${q({ q: term, page })}`, "search");
        } catch (e) {
            out.replaceChildren(empty("Pencarian gagal", e.message));
            popLoader();
            busy = false;
            return;
        }
        popLoader();
        busy = false;

        const results = (data.results || []).map((r) => norm(r));
        total = data.total || results.length;
        if (!results.length) {
            if (!append) out.replaceChildren(empty(`Tidak ada hasil untuk "${term}"`, "Coba kata kunci lain."));
            pageInfo.textContent = append ? pageInfo.textContent : "";
            return;
        }
        const block = el("div", {}, el("h2", { class: "title", style: "font-size:18px;margin-bottom:12px", text: `Hasil untuk "${term}"` }), grid(results));
        if (append) out.append(block);
        else out.replaceChildren(block);
        pageInfo.textContent = `${Math.min(page * (total || results.length), total || page * results.length)} hasil · halaman ${page}${data._src && data._src !== "net" ? " · dari cache" : ""}`;
        more.hidden = results.length === 0;
    }

    function submit() {
        const v = input.value.trim();
        if (!v) return;
        clearTimeout(t);
        const h = `#/search?q=${encodeURIComponent(v)}`;
        term = v;
        page = 1;
        if (location.hash === h) run(false);
        else location.hash = h; // router re-renders this view
    }

    more.addEventListener("click", () => {
        page++;
        run(true);
    });

    let t;
    input.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
            term = input.value.trim();
            page = 1;
            term ? run(false) : out.replaceChildren(empty("Ketik judul", "Cari film atau series yang ingin ditonton."));
        }, 400);
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            clearTimeout(t);
            submit();
        }
    });

    if (term) run(false);
    else out.append(empty("Ketik judul", "Cari film atau series yang ingin ditonton."));

    if (!navigator.onLine) toast("Mode offline — hanya hasil tersimpan yang bisa dibuka", "err");
}
