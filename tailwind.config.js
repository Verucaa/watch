/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    theme: {
        extend: {
            colors: {
                ink: "#04060c",
                coal: "#080c15",
                slab: "#0d1320",
                slab2: "#131b2c",
                mist: "#93a3bd",
                ice: "#7dd3fc",
                aqua: "#38bdf8",
                ocean: "#1d4ed8",
                navy: "#1e3a8a",
                grape: "#8b5cf6"
            },
            fontFamily: {
                brand: ["W17Brand", "ui-sans-serif", "system-ui", "sans-serif"],
                title: ["W17Title", "ui-sans-serif", "system-ui", "sans-serif"]
            },
            borderRadius: { shell: "14px" },
            boxShadow: {
                glow: "0 10px 40px -12px rgba(56,189,248,.45)",
                lift: "0 22px 44px -22px rgba(56,189,248,.55)",
                dock: "0 18px 46px -18px rgba(0,0,0,.9)"
            },
            backgroundImage: {
                grad: "linear-gradient(135deg,#1d4ed8 0%,#38bdf8 52%,#8b5cf6 100%)",
                gradsoft: "linear-gradient(135deg,rgba(29,78,216,.28),rgba(139,92,246,.16))"
            },
            maxWidth: { shell: "1400px" }
        }
    },
    plugins: []
};
