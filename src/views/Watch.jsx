import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApi, probe, qs } from "../lib/api.js";
import { markServer, markServers, pushRecent, rankServers, serverState, settings, useHealth } from "../lib/store.js";
import { store } from "../lib/kv.js";
import { Icon, ErrorNote, Spinner, cx, toast, useBlockLoader } from "../lib/ui.jsx";

const HLS_URL = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
const WATCHDOG = 15000;

let hlsLib = null;
async function loadHls(video) {
    if (hlsLib) return hlsLib;
    if (video.canPlayType?.("application/vnd.apple.mpegurl")) return (hlsLib = { native: true });
    hlsLib = (await import(/* @vite-ignore */ HLS_URL)).default;
    return hlsLib;
}

const posKey = (type, id, s, e) => `pos:${type}:${id}:${s || 0}:${e || 0}`;

export default function Watch({ type = "movie", id, params }) {
    /* a series with no s/e in the URL would build broken upstream urls */
    const season = type === "tv" ? Number(params.s) || 1 : null;
    const episode = type === "tv" ? Number(params.e) || 1 : null;
    const ep = { type, id, s: season, e: episode };

    /* cold isolate latency for 7reels is 3-25s, so these get their own budget */
    const { data, error, loading } = useApi(`/api/servers?${qs(ep)}`, "servers", { timeout: 30000 });
    const directQ = useApi(`/api/direct?${qs(ep)}`, "direct", { timeout: 30000 });
    useBlockLoader(loading && !data, "Mengambil server…");

    const [title, setTitle] = useState(`${type === "tv" ? "Series" : "Film"} #${id}`);
    const [current, setCurrent] = useState(null);
    const [veil, setVeil] = useState(null);
    const [left, setLeft] = useState(0);
    const [levels, setLevels] = useState([]);
    const [level, setLevel] = useState(-1);
    const [exhausted, setExhausted] = useState(false);
    const health = useHealth();

    const videoRef = useRef(null);
    const frameRef = useRef(null);
    const hlsRef = useRef(null);
    const timers = useRef({ watchdog: null, countdown: null });
    const strikes = useRef(0);
    const attempts = useRef(0);
    const currentRef = useRef(null);
    currentRef.current = current;

    const direct = directQ.data?.direct || null;
    const list = useMemo(
        () => [
            ...(data?.embeds || []).map((e) => ({ label: e.server, quality: e.quality, url: e.url, direct: false })),
            ...(direct ? [{ label: direct.label, quality: direct.quality, url: direct.url, direct: true }] : [])
        ],
        [data, direct]
    );

    /* the player callbacks outlive renders; refs keep failover on the live list */
    const listRef = useRef(list);
    listRef.current = list;
    const healthRef = useRef(health);
    healthRef.current = health;

    /* title + history come from the detail endpoint, cached separately */
    useEffect(() => {
        if (!id) return;
        pushRecent({ id, type, title: "", season, episode });
        fetch(`/api/detail?${qs({ type, id })}`)
            .then((r) => r.json())
            .then((d) => {
                if (d?.title) {
                    setTitle(d.title);
                    document.title = `${d.title} - WATCH17`;
                    pushRecent({
                        id,
                        type,
                        title: d.title,
                        season,
                        episode,
                        poster: d.poster ? d.poster.replace("https://image.tmdb.org/t/p/w500", "") : null
                    });
                }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, type, season, episode]);

    const clearTimers = useCallback(() => {
        clearTimeout(timers.current.watchdog);
        clearInterval(timers.current.countdown);
        timers.current = { watchdog: null, countdown: null };
    }, []);

    const stop = useCallback(() => {
        clearTimers();
        if (hlsRef.current) {
            try {
                hlsRef.current.destroy();
            } catch {}
            hlsRef.current = null;
        }
        const frame = frameRef.current;
        if (!frame) return;
        frame.querySelector("iframe")?.remove();
        if (videoRef.current && !videoRef.current.isConnected) frame.prepend(videoRef.current);
        if (videoRef.current) {
            videoRef.current.style.display = "";
            videoRef.current.removeAttribute("src");
            videoRef.current.load?.();
        }
    }, [clearTimers]);

    useEffect(() => stop, [stop]);

    const next = useCallback(() => {
        stop();
        const all = listRef.current;
        if (attempts.current >= all.length) {
            setExhausted(true);
            setVeil(null);
            return;
        }
        attempts.current++;
        const rest = all.filter((s) => s.url !== currentRef.current?.url);
        play(rankServers(rest.length ? rest : all, healthRef.current)[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stop]);

    const bail = useCallback(
        (server) => {
            if (!server) return;
            markServer(server.url, false);
            toast(`${server.label} tidak tersedia — pindah server`, "err");
            next();
        },
        [next]
    );

    const armWatchdog = useCallback(
        (onGiveUp) => {
            clearTimers();
            setLeft(Math.round(WATCHDOG / 1000));
            setVeil({ kind: "watchdog" });
            timers.current.countdown = setInterval(() => setLeft((n) => Math.max(n - 1, 0)), 1000);
            timers.current.watchdog = setTimeout(onGiveUp, WATCHDOG);
        },
        [clearTimers]
    );

    const play = useCallback(
        async (server) => {
            if (!server) return;
            stop();
            setExhausted(false);
            setCurrent(server);
            setLevels([]);
            setLevel(-1);
            strikes.current = 0;
            setVeil({ kind: "boot", label: server.label });

            const video = videoRef.current;
            const pos = store.get(posKey(type, id, season, episode))?.v || 0;

            if (server.direct) {
                armWatchdog(() => bail(server));
                try {
                    const Hls = await loadHls(video);
                    if (Hls.native) {
                        video.src = server.url;
                        video.addEventListener(
                            "loadedmetadata",
                            () => {
                                clearTimers();
                                setVeil(null);
                                if (pos > 20) video.currentTime = pos;
                            },
                            { once: true }
                        );
                    } else {
                        const hls = new Hls({ enableWorker: true, backBufferLength: 60, maxBufferLength: 30 });
                        hlsRef.current = hls;
                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            clearTimers();
                            setVeil(null);
                            setLevels(hls.levels || []);
                            if (pos > 20) video.currentTime = pos;
                            video.play().catch(() => {});
                        });
                        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => {
                            const h = hls.levels?.[d.level]?.height;
                            if (h) setCurrent((s) => (s ? { ...s, quality: `${h}p` } : s));
                        });
                        hls.on(Hls.Events.ERROR, (_e, d) => {
                            if (!d.fatal) return;
                            if (++strikes.current < 3 && d.type === Hls.ErrorTypes.NETWORK_ERROR) {
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
               plus the pre-flight probe is the only signal available. */
            video.style.display = "none";
            const frame = frameRef.current;
            const iframe = document.createElement("iframe");
            iframe.src = server.url;
            iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
            iframe.allowFullscreen = true;
            iframe.setAttribute("scrolling", "no");
            iframe.title = `Pemutar ${server.label}`;
            frame.prepend(iframe);
            armWatchdog(() => bail(server));
            iframe.addEventListener("load", () => setTimeout(() => currentRef.current?.url === server.url && clearTimers(), 2500), { once: true });
        },
        [armWatchdog, bail, clearTimers, episode, id, season, stop, type]
    );

    /* ------------------------------------------------------ pre-flight probe */
    useEffect(() => {
        if (!list.length) return;
        let alive = true;
        Promise.all(list.map((s) => probe(s.url, s.direct ? 8000 : 5000).then((ok) => [s.url, ok]))).then((pairs) => {
            if (!alive) return;
            markServers(pairs);
            if (pairs.every(([, ok]) => !ok)) toast("Tidak ada server yang bisa dijangkau", "err");
        });
        return () => {
            alive = false;
        };
    }, [list]);

    useEffect(() => {
        if (list.length && !current) play(rankServers(list, health)[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => {
            if (video.currentTime > 5) store.set(posKey(type, id, season, episode), video.currentTime, 0);
        };
        const onEnd = () => {
            if (settings().autonext && type === "tv" && episode) goEpisode(episode + 1);
        };
        video.addEventListener("timeupdate", onTime);
        video.addEventListener("ended", onEnd);
        return () => {
            video.removeEventListener("timeupdate", onTime);
            video.removeEventListener("ended", onEnd);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, type, season, episode]);

    const goEpisode = (e) => {
        if (type === "tv" && e) location.hash = `#/watch/tv/${id}?s=${season}&e=${e}`;
    };

    if (error && !data) return <div className="wrap py-10"><ErrorNote>{error.message}</ErrorNote></div>;
    if (!data && loading) return <div className="wrap py-10" />;
    if (data && !list.length) return <div className="wrap py-10"><ErrorNote>Sumber tidak menyediakan pemutar untuk judul ini.</ErrorNote></div>;

    return (
        <div className="wrap grid gap-5 py-5">
            <div className="flex flex-wrap items-center gap-2.5">
                <a href={`#/detail/${type}/${id}`} className="btn btn-ghost"><Icon name="back" className="h-[18px] w-[18px]" />Detail</a>
                <div className="flex-1" />
                <p className="text-xs text-mist">{current ? `${current.label} · ${current.quality}` : exhausted ? "0 server tersedia" : "menyiapkan…"}</p>
            </div>

            <div ref={frameRef} className="relative aspect-video w-full overflow-hidden rounded-shell border border-ice/20 bg-black shadow-[0_30px_80px_-34px_#000]">
                <video ref={videoRef} playsInline controls controlsList="nodownload" preload="metadata" className="h-full w-full" />

                {veil ? (
                    <div className="absolute inset-0 grid animate-fade place-content-center justify-items-center gap-3.5 bg-gradient-to-b from-ink/80 to-ink/95 p-5 text-center">
                        {veil.kind === "watchdog" ? (
                            <>
                                <div className="grad-text font-title text-5xl font-extrabold leading-none">{left}</div>
                                <p className="text-sm text-mist">Server tidak merespons — beralih otomatis…</p>
                                <button type="button" className="btn" onClick={() => current && bail(current)}>
                                    <Icon name="next" className="h-[18px] w-[18px]" />Ganti server
                                </button>
                            </>
                        ) : (
                            <>
                                <Spinner />
                                <p className="text-sm text-mist">Menyiapkan {veil.label}…</p>
                            </>
                        )}
                    </div>
                ) : null}

                {exhausted ? (
                    <div className="absolute inset-0 grid place-content-center justify-items-center gap-3.5 bg-ink/95 p-5 text-center">
                        <h3 className="font-title text-xl">Semua server gagal</h3>
                        <p className="max-w-sm text-sm text-mist">Sumber sedang tidak stabil. Muat ulang untuk mencoba lagi.</p>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                                attempts.current = 0;
                                markServers(list.map((s) => [s.url, true]));
                                play(list[0]);
                            }}
                        >
                            <Icon name="refresh" className="h-[18px] w-[18px]" />Coba lagi
                        </button>
                    </div>
                ) : null}
            </div>

            <div className="rail no-scrollbar">
                {rankServers(list, health).map((s) => {
                    const st = serverState(s.url, health);
                    return (
                        <button
                            key={s.url}
                            type="button"
                            title={s.url}
                            className={cx("server flex flex-col gap-0.5", current?.url === s.url && "server-on", st === "dead" && "server-dead")}
                            onClick={() => {
                                attempts.current = 0;
                                play(s);
                            }}
                        >
                            <span className="flex items-center gap-1.5">
                                <i className={cx("h-1.5 w-1.5 rounded-full", st === "dead" ? "bg-red-500" : "bg-green-500")} />
                                <b className="text-[13px]">{s.label}</b>
                            </span>
                            <span className={cx("text-[10.5px] uppercase tracking-wide", current?.url === s.url ? "text-white/80" : "text-mist")}>{s.quality}</span>
                        </button>
                    );
                })}
            </div>

            {levels.length > 1 ? (
                <div className="flex items-center gap-2.5">
                    <span className="text-xs text-mist">Kualitas</span>
                    <select
                        className="rounded-lg border border-ice/20 bg-white/5 px-3 py-2 text-xs"
                        value={String(level)}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            setLevel(v);
                            if (hlsRef.current) hlsRef.current.currentLevel = v;
                        }}
                    >
                        <option value="-1">Auto</option>
                        {levels.map((l, i) => (
                            <option key={i} value={String(i)}>{l.height ? `${l.height}p` : `Level ${i + 1}`}</option>
                        ))}
                    </select>
                </div>
            ) : null}

            {data?._src && data._src !== "net" ? <ErrorNote>Daftar server dari cache ({data._src})</ErrorNote> : null}
            {directQ.loading && !direct ? (
                <p className="flex items-center gap-2 text-xs text-mist">
                    <Spinner className="h-4 w-4" />Mencari sumber HD…
                </p>
            ) : null}
            {directQ.data?.error ? <ErrorNote>Sumber langsung tidak tersedia: {directQ.data.error}</ErrorNote> : null}

            {type === "tv" ? (
                <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="mr-auto font-title text-lg">Navigasi episode</h2>
                    <button type="button" className="btn" disabled={!episode || episode <= 1} onClick={() => goEpisode(episode - 1)}>
                        <Icon name="back" className="h-[18px] w-[18px]" />Sebelumnya
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => goEpisode(episode + 1)}>
                        Berikutnya<Icon name="next" className="h-[18px] w-[18px]" />
                    </button>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2.5">
                <a href={`#/detail/${type}/${id}`} className="btn btn-ghost"><Icon name="bookmark" className="h-[18px] w-[18px]" />Detail & episode</a>
                <div className="flex-1" />
                <button type="button" className="btn btn-ghost" onClick={() => current && play(current)}>
                    <Icon name="refresh" className="h-[18px] w-[18px]" />Muat ulang
                </button>
            </div>
        </div>
    );
}
