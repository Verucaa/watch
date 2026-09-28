const $ = (sel, root = document) => root.querySelector(sel);

/** Tiny DOM builder. Remote strings always go through textContent -> no XSS from scraped data. */
export function el(tag, props = {}, ...kids) {
    const node = tag.startsWith("svg:") ? document.createElementNS("http://www.w3.org/2000/svg", tag.slice(4)) : document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v; // only ever used with ICONS below
        else if (k === "style") node.setAttribute("style", v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (k === "dataset") Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(3)) {
        if (kid === null || kid === undefined || kid === false) continue;
        node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
}

const PATHS = {
    play: "M8 5v14l11-7z",
    heart: "M12 21s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.5 5.2 5.2 0 0 1 21.3 12c-1.8 4.4-9.3 9-9.3 9",
    refresh: "M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7",
    back: "M15 5l-7 7 7 7",
    next: "M9 5l7 7-7 7",
    search: "M10.5 3a7.5 7.5 0 1 1-4.9 13.2l-3.1 3.1-1.4-1.4 3.1-3.1A7.5 7.5 0 0 1 10.5 3m0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11",
    plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
    bolt: "M13 2 4 14h6l-1 8 9-12h-6z",
    bookmark: "M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1",
    trash: "M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z",
    wifi: "M12 18.5 5.5 12 4 13.5 12 21.5 20 13.5 18.5 12z"
};

export function icon(name, cls = "") {
    const svg = el("svg:svg", { viewBox: "0 0 24 24", "aria-hidden": "true", fill: "currentColor" });
    if (cls) svg.setAttribute("class", cls);
    svg.append(el("svg:path", { d: PATHS[name] || "" }));
    return svg;
}

export const loaderEl = () => $("#loader");
export const loaderText = () => $("#loader-text");

export function loader(on, text = "Memuat…") {
    const l = loaderEl();
    if (!l) return;
    l.hidden = !on;
    if (on && text) loaderText().textContent = text;
}

let depth = 0;
export function pushLoader(text) {
    depth++;
    loader(true, text);
}
export function popLoader() {
    depth = Math.max(0, depth - 1);
    if (!depth) loader(false);
}

export function toast(msg, kind = "") {
    const box = $("#toasts");
    if (!box) return;
    const t = el("div", { class: `toast ${kind}`, text: msg });
    box.append(t);
    setTimeout(() => {
        t.style.transition = "opacity .3s, transform .3s";
        t.style.opacity = "0";
        t.style.transform = "translateY(8px)";
        setTimeout(() => t.remove(), 320);
    }, kind === "err" ? 4600 : 2800);
}

export const offlineBadge = (on) => {
    const n = $("#net");
    if (n) n.hidden = !on;
};

export function skeletons(n = 10) {
    return el(
        "div",
        { class: "grid" },
        Array.from({ length: n }, () =>
            el("div", {}, el("div", { class: "sk sk-card" }), el("div", { class: "sk sk-line" }), el("div", { class: "sk sk-line short" }))
        )
    );
}

export function empty(title, sub) {
    return el("div", { class: "empty" }, el("h3", { text: title }), sub ? el("p", { class: "muted", text: sub }) : null);
}

export function sectionHead(eyebrow, title, extra) {
    return el("div", { class: "sec-head" }, el("div", {}, eyebrow ? el("p", { class: "eyebrow", text: eyebrow }) : null, el("h2", { class: "title", text: title })), extra || null);
}

export const tmdb = (p, size = "w342") => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);

export const yearOf = (d) => (d ? String(d).slice(0, 4) : "");
