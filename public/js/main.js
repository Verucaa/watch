import { $, el, loader, toast, offlineBadge } from "./lib/ui.js";

const view = $("#view");

function parse() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, qs] = raw.split("?");
    const params = Object.fromEntries(new URLSearchParams(qs || ""));
    return { seg: path.split("/").filter(Boolean), params };
}

let teardown = null;

async function route() {
    const { seg, params } = parse();
    const [name, a, b] = seg;
    if (name === "watch" && a === "tv") {
        params.s ||= 1;
        params.e ||= 1;
    }

    teardown?.();
    teardown = null;

    const slot = el("div");
    view.replaceChildren(slot);
    document.querySelectorAll(".dock-btn").forEach((d) => d.classList.toggle("on", d.dataset.route === name));

    if (name !== "search" && name !== "list") window.scrollTo({ top: 0 });

    const mount = (node) => slot.append(node);
    let mod;
    loader(true, "Menyiapkan…");
    try {
        if (name === "search") mod = await import("./views/search.js");
        else if (name === "trending" || name === "series") mod = await import("./views/browse.js");
        else if (name === "list") mod = await import("./views/browse.js");
        else if (name === "detail") mod = await import("./views/detail.js");
        else if (name === "watch") mod = await import("./views/watch.js");
        else mod = await import("./views/home.js");
    } catch (e) {
        loader(false);
        slot.append(el("div", { class: "empty" }, el("h3", { text: "Gagal memuat halaman" }), el("p", { class: "muted", text: e.message })));
        return;
    }

    try {
        if (name === "search") await mod.searchView(mount, params);
        else if (name === "trending") await mod.browseView(mount, { mode: "trending" });
        else if (name === "series") await mod.browseView(mount, { mode: "series" });
        else if (name === "list") mod.listView(mount);
        else if (name === "detail") await mod.detailView(mount, { type: a, id: b, ...params });
        else if (name === "watch") teardown = await mod.watchView(mount, { type: a, id: b, ...params });
        else await mod.homeView(mount);
    } catch (e) {
        console.error(e);
        toast(e.message || "Terjadi kesalahan", "err");
    } finally {
        loader(false);
    }
}

addEventListener("hashchange", route);
offlineBadge(navigator.onLine === false);
if (!location.hash) location.replace("#/home");
route();

if ("serviceWorker" in navigator) {
    addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
}
