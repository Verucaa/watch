import { api, q, probe } from "../lib/api.js";
import { el, icon, pushLoader, popLoader, toast, empty } from "../lib/ui.js";
import { markServer, serverState, rankServers, pushRecent, settings } from "../lib/store.js";
import { store } from "../lib/kv.js";

const HLS_URL = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
const WATCHDOG = 15000; // silence longer than this == server considered dead
const posKey = (type, id, s, e) => `pos:${type}:${id}:${s || 0}:${e || 0}`;

let hlsLib = null;
async function loadHls(video) {
    if (hlsLib) return hlsLib;
    if (video.canPlayType("application/vnd.apple.mpegurl")) return (hlsLib = { native: true });
    hlsLib = (await import(/* webpackIgnore: true */ HLS_URL)).default;
    return hlsLib;
}

export async function watchView(mount, params) {
    const { type = "movie", id } = params;
    const season = Number(params.s) || null;
    const episode = Number(params.e) || null;

    const video = el("video", { playsinline: true, controls: true, controlslist: "nodownload", preload: "metadata" });
    const veil = el("div", { class: "veil", hidden: true });
    const frame = el("div", { class: "player" }, video, veil);
    const serverBar = el("div", { class: "servers" });
    const status = el("p", { class: "small muted" });
    const extra = el("div", { class: "stack" });
    const qualitySlot = el("div", { class: "bar" });

    const wrap = el(
        "div",
        { class: "wrap stack" },
        el("div", { class: "bar" }, el("a", { class: "btn ghost", href: `#/detail/${type}/${id}` }, icon("back"), "Detail"), el("div", { class: "grow" }), status),
        frame,
        serverBar,
        extra
    );
    mount(wrap);

    video.addEventListener("timeupdate", () => {
        if (video.currentTime > 5) store.set(posKey(type, id, season, episode), video.currentTime, 0);
    });
    video.addEventListener("ended", () => {
        if (settings().autonext && type === "tv" && episode) nextEpisode();
    });

    pushLoader("Mengambil server…");
    let data;
    try {
        data = await api(`/api/servers?${q({ type, id, s: season, e: episode })}`, "servers");
    } catch (e) {
        popLoader();
        wrap.replaceChildren(empty("Gagal memuat server", e.message));
        return;
    }
    popLoader();

    const list = [];
    if (data.direct) list.push({ label: data.direct.label, quality: "Auto · HD", url: data.direct.url, direct: true });
    for (const e of data.embeds || []) list.push({ label: e.server, quality: e.quality, url: e.url, direct: false });

    if (!list.length) {
        wrap.replaceChildren(empty("Tidak ada server", "Sumber tidak menyediakan pemutar untuk judul ini."));
        return;
    }

    let title = `${type === "tv" ? "Series" : "Film"} #${id}`;
    const head = el("h1", { class: "title", style: "font-size:clamp(20px,5vw,32px);margin:0", text: title });
    frame.after(head);
    pushRecent({ id, type, title, season, episode });
    api(`/api/detail/${type}/${id}`, "detail")
        .then((d) => {
            if (d.title) {
                head.textContent = d.title;
                title = d.title;
                document.title = `${d.title} - WATCH17`;
                pushRecent({ id, type, title, season, episode, poster: d.poster ? d.poster.replace("https://image.tmdb.org/t/p/w500", "") : null });
            }
        })
        .catch(() => {});

    /* ------------------------------------------------------------ state */
    let current = null;
    let hls = null;
    let watchdog = null;
    let countdown = null;
    let left = 0;
    let strikes = 0;
    let attempts = 0;

    const showVeil = (...kids) => {
        veil.replaceChildren(...kids);
        veil.hidden = false;
    };
    const hideVeil = () => {
        clearTimeout(watchdog);
        clearInterval(countdown);
        watchdog = countdown = null;
        veil.hidden = true;
    };

    function stop() {
        hideVeil();
        if (hls) {
            try {
                hls.destroy();
            } catch {}
            hls = null;
        }
        frame.querySelector("iframe")?.remove();
        if (video.parentNode !== frame) frame.insertBefore(video, veil);
        video.style.display = "";
        video.removeAttribute("src");
        video.load();
    }

    function armWatchdog(onGiveUp) {
        clearTimeout(watchdog);
        clearInterval(countdown);
        left = Math.round(WATCHDOG / 1000);
        const num = el("div", { class: "count", text: String(left) });
        showVeil(el("div", { class: "spinner" }), el("p", { class: "small", text: "Server tidak merespons — beralih otomatis…" }), num, el("button", { class: "btn", onclick: () => onGiveUp() }, icon("next"), "Ganti server"));
        countdown = setInterval(() => {
            num.textContent = String(Math.max(--left, 0));
        }, 1000);
        watchdog = setTimeout(onGiveUp, WATCHDOG);
    }

    function bail(server) {
        markServer(server.url, false);
        toast(`${server.label} tidak tersedia — pindah server`, "err");
        next();
    }

    function next() {
        stop();
        if (attempts >= list.length) {
            showVeil(
                el("h3", { text: "Semua server gagal" }),
                el("p", { class: "small muted", text: "Sumber sedang tidak stabil. Muat ulang untuk mencoba lagi." }),
                el("button", { class: "btn primary", onclick: () => { attempts = 0; list.forEach((s) => markServer(s.url, true)); paint(); play(rankServers(list)[0]); } }, icon("refresh"), "Coba lagi")
            );
            status.textContent = "0 server tersedia";
            return;
        }
        attempts++;
        const rest = list.filter((s) => s !== current);
        play(rankServers(rest.length ? rest : list)[0]);
    }

    function paint() {
        serverBar.replaceChildren(
            ...rankServers(list).map((s) => {
                const st = serverState(s.url);
                return el(
                    "button",
                    { class: `server ${s === current ? "on" : ""} ${st === "dead" ? "dead" : ""}`, title: s.url, onclick: () => { attempts = 0; play(s); } },
                    el("div", { class: "bar", style: "gap:7px;flex-wrap:nowrap" }, el("i", { class: "dot" }), el("b", { text: s.label })),
                    el("span", { text: s.quality })
                );
            })
        );
    }

    async function play(server) {
        if (!server) return;
        stop();
        current = server;
        strikes = 0;
        status.textContent = `${server.label} · ${server.quality}`;
        paint();

        const pos = store.get(posKey(type, id, season, episode))?.v || 0;

        if (server.direct) {
            showVeil(el("div", { class: "spinner" }), el("p", { class: "small", text: `Menyiapkan ${server.label}…` }));
            armWatchdog(() => bail(server));
            try {
                const Hls = await loadHls(video);
                if (Hls.native) {
                    video.src = server.url;
                    video.addEventListener("loadedmetadata", () => { hideVeil(); if (pos > 20) video.currentTime = pos; }, { once: true });
                } else {
                    hls = new Hls({ enableWorker: true, backBufferLength: 60, maxBufferLength: 30 });
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        hideVeil();
                        buildQuality(Hls);
                        if (pos > 20) video.currentTime = pos;
                        video.play().catch(() => {});
                    });
                    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => {
                        const h = hls.levels?.[d.level]?.height;
                        if (h) status.textContent = `${server.label} · ${h}p`;
                    });
                    hls.on(Hls.Events.ERROR, (_e, d) => {
                        if (!d.fatal) return;
                        if (++strikes < 3 && d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            hls.startLoad();
                            return;
                        }
                        bail(server);
                    });
                    hls.loadSource(server.url);
                    hls.attachMedia(video);
                }
                video.addEventListener("error", () => bail(server), { once: true });
            } catch {
                bail(server);
            }
            return;
        }

        /* iframe embeds: a cross-origin frame cannot report an error, so silence
           plus the pre-flight probe is the only signal we get. */
        const iframe = el("iframe", {
            src: server.url,
            allow: "autoplay; fullscreen; encrypted-media; picture-in-picture",
            allowfullscreen: true,
            scrolling: "no",
            title: `Pemutar ${server.label}`
        });
        video.style.display = "none";
        frame.insertBefore(iframe, veil);
        armWatchdog(() => bail(server));
        iframe.addEventListener(
            "load",
            () => setTimeout(() => current === server && hideVeil(), 2500),
            { once: true }
        );
    }

    function buildQuality(Hls) {
        if (!hls?.levels?.length || hls.levels.length < 2) return;
        qualitySlot.replaceChildren(
            el("span", { class: "small muted", text: "Kualitas" }),
            el(
                "select",
                { class: "quality", "aria-label": "Kualitas", onchange: (e) => (hls.currentLevel = Number(e.target.value)) },
                el("option", { value: "-1", text: "Auto" }),
                hls.levels.map((l, i) => el("option", { value: String(i), text: l.height ? `${l.height}p` : `Level ${i + 1}` }))
            )
        );
        if (!qualitySlot.isConnected) extra.prepend(qualitySlot);
    }

    /* ---------------------------------------------------- pre-flight probe */
    Promise.all(
        list.map((s) =>
            probe(s.url, s.direct ? 8000 : 5000).then((ok) => {
                markServer(s.url, ok);
                return ok;
            })
        )
    ).then(() => paint());

    /* ------------------------------------------------------------- notes */
    const notes = [];
    if (data._src && data._src !== "net") notes.push(`Daftar server dari cache (${data._src})`);
    if (data.directError) notes.push(`Sumber langsung tidak tersedia: ${data.directError}`);
    if (notes.length) extra.append(el("div", { class: "note", text: notes.join(" · ") }));
    extra.append(qualitySlot);

    if (type === "tv") {
        extra.append(
            el(
                "div",
                { class: "bar" },
                el("h2", { class: "title", style: "font-size:18px;margin-right:auto", text: "Navigasi episode" }),
                el("button", { class: "btn", disabled: !episode || episode <= 1, onclick: () => (location.hash = `#/watch/tv/${id}?s=${season}&e=${episode - 1}`) }, icon("back"), "Sebelumnya"),
                el("button", { class: "btn primary", onclick: () => nextEpisode() }, "Berikutnya", icon("next"))
            )
        );
    }

    extra.append(
        el(
            "div",
            { class: "bar" },
            el("a", { class: "btn ghost", href: `#/detail/${type}/${id}` }, icon("bookmark"), "Detail & episode"),
            el("div", { class: "grow" }),
            el("button", { class: "btn ghost", onclick: () => play(current) }, icon("refresh"), "Muat ulang")
        )
    );

    function nextEpisode() {
        if (type === "tv" && episode) location.hash = `#/watch/tv/${id}?s=${season}&e=${episode + 1}`;
    }

    paint();
    play(rankServers(list)[0]);

    return stop; // router calls this before the next navigation
}
