import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: "dist",
        target: "es2022",
        sourcemap: false
    },
    server: {
        port: 5173,
        host: true,
        // `npm run dev:api` (wrangler dev) serves the API on 8787
        proxy: { "/api": "http://localhost:8787" }
    }
});
