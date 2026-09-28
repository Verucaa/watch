import { Suspense, lazy, useEffect, useState } from "react";
import { useRoute } from "./lib/router.js";
import { Icon, LoaderProvider, Toaster, hideLoader } from "./lib/ui.jsx";

const Home = lazy(() => import("./views/Home.jsx"));
const Search = lazy(() => import("./views/Search.jsx"));
const Browse = lazy(() => import("./views/Browse.jsx"));
const List = lazy(() => import("./views/List.jsx"));
const Detail = lazy(() => import("./views/Detail.jsx"));
const Watch = lazy(() => import("./views/Watch.jsx"));

const DOCK = [
    { id: "home", to: "#/home", label: "Home", icon: "home" },
    { id: "search", to: "#/search", label: "Cari", icon: "search" },
    { id: "trending", to: "#/trending", label: "Trending", icon: "bolt" },
    { id: "series", to: "#/series", label: "Series", icon: "series" },
    { id: "list", to: "#/list", label: "Daftar", icon: "bookmark" }
];

function Navbar() {
    return (
        <header className="sticky top-0 z-40 flex h-[58px] items-center justify-center bg-gradient-to-b from-ink/90 via-ink/40 to-transparent px-[clamp(14px,4vw,34px)] backdrop-blur-md sm:h-[66px]">
            <a href="#/home" className="animate-rise bg-grad bg-clip-text font-brand text-[clamp(20px,5.4vw,30px)] font-bold leading-none tracking-[0.1em] text-transparent drop-shadow-[0_0_26px_rgba(56,189,248,.28)]" aria-label="WATCH17 beranda">
                WATCH<span className="opacity-70">17</span>
            </a>
        </header>
    );
}

function Dock({ active }) {
    return (
        <nav className="fixed bottom-[calc(10px+var(--safe-b))] left-1/2 z-50 flex w-[min(520px,calc(100vw-20px))] -translate-x-1/2 gap-0.5 rounded-full border border-ice/20 bg-coal/85 p-1.5 shadow-dock backdrop-blur-xl sm:bottom-[18px] sm:w-[460px] sm:backdrop-blur-2xl" aria-label="Menu utama">
            {DOCK.map((d) => (
                <a
                    key={d.id}
                    href={d.to}
                    aria-current={active === d.id ? "page" : undefined}
                    className={`dock-link ${active === d.id ? "dock-on" : ""}`}
                >
                    <Icon name={d.icon} className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
                    <span className="text-[10.5px] sm:text-[11.5px]">{d.label}</span>
                </a>
            ))}
        </nav>
    );
}

function OfflineBanner() {
    const [off, setOff] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
    useEffect(() => {
        const on = () => setOff(false);
        const offFn = () => setOff(true);
        addEventListener("online", on);
        addEventListener("offline", offFn);
        return () => {
            removeEventListener("online", on);
            removeEventListener("offline", offFn);
        };
    }, []);
    if (!off) return null;
    return <div className="fixed left-1/2 top-[72px] z-[60] -translate-x-1/2 rounded-full border border-amber-400/40 bg-yellow-900/85 px-3.5 py-1.5 text-xs font-semibold text-amber-200">Offline — memakai cache</div>;
}

function Route({ route }) {
    const [name, a, b] = route.seg;
    if (name === "search") return <Search key={route.params.q || ""} params={route.params} />;
    if (name === "trending") return <Browse mode="trending" />;
    if (name === "series") return <Browse mode="series" />;
    if (name === "list") return <List />;
    if (name === "detail") return <Detail key={`${a}:${b}:${JSON.stringify(route.params)}`} type={a} id={b} params={route.params} />;
    if (name === "watch") return <Watch key={`${a}:${b}:${JSON.stringify(route.params)}`} type={a || "movie"} id={b} params={route.params} />;
    return <Home />;
}

export default function App() {
    const route = useRoute();
    const active = route.seg[0] || "home";

    useEffect(() => {
        hideLoader();
        if (route.seg[0] !== "search" && route.seg[0] !== "list") scrollTo({ top: 0 });
    }, [route]);

    return (
        <LoaderProvider>
            <Navbar />
            <main id="view" className="pb-dock min-h-[60vh] focus:outline-none">
                <Suspense fallback={<div className="wrap py-16"><div className="sk h-8 w-48" /></div>}>
                    <Route route={route} />
                </Suspense>
            </main>
            <Dock active={active} />
            <OfflineBanner />
            <Toaster />
        </LoaderProvider>
    );
}
