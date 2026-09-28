# WATCH17

Streaming film & series: React + Vite + TailwindCSS di depan, satu Cloudflare Worker di belakang. Multi server dengan auto-failover, cache offline, dan PWA.

## Struktur

```
index.html            shell Vite
src/                  frontend React
  main.jsx            entry + registrasi service worker
  App.jsx             shell, router lazy, navbar, dock
  views/              Home, Search, Browse, List, Detail, Watch
  lib/                router, api (SWR), kv (localStorage), store, ui, card, lazy
worker/index.js       entry Worker: seluruh /api/*
lib/                  http, 7reels, cache, hls  (dipakai Worker, bukan browser)
public/               manifest, service worker, favicon
test/                 selfcheck, rendercheck, workercheck
```

Satu runtime saja. Tidak ada Express: `worker/index.js` melayani `/api/*`, sisanya jatuh ke `env.ASSETS` (hasil `vite build`).

## Menjalankan

```bash
npm install
npm run dev:api     # terminal 1 - Worker di http://localhost:8787
npm run dev         # terminal 2 - Vite di http://localhost:5173 (proxy /api)
```

Tanpa `wrangler` (atau di platform yang tidak didukung, mis. Termux), Worker bisa diuji tanpa runtime Cloudflare:

```bash
npm run check:worker   # bundle esbuild + worker.fetch() dengan stub ASSETS
```

## Deploy

```bash
npm run deploy      # vite build + wrangler deploy
```

Static dan Worker dikirim dalam satu Worker. Host HLS boleh ditambah tanpa build ulang:

```bash
wrangler secret put HLS_HOSTS      # mis. "moon.quietridge.top,emberforge.site"
```

## Endpoint

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/api/health` | status + statistik cache |
| GET | `/api/home` | beranda (trending, top 10, featured) |
| GET | `/api/search?q=&page=` | pencarian |
| GET | `/api/detail?type=movie\|tv&id=` | detail, cast, kru |
| GET | `/api/episodes?id=&season=` | episode satu season |
| GET | `/api/servers?type=&id=&s=&e=` | daftar server + direct HLS |
| GET | `/api/hls?u=&r=` | proxy playlist `.m3u8` |

`/api/*` hanya menerima GET/HEAD.

## Kenapa `/api/hls` ada

CDN di belakang 7reels hanya mengizinkan Referer `vidcore.net`/`vidup.to` untuk playlist. Browser tidak boleh memalsukan Referer, jadi playlist diambil Worker lalu ditulis ulang ke `/api/hls?u=...`. Segmen video tetap diambil browser langsung (CORS-nya mengizinkan).

Endpoint ini **bukan** open proxy: hanya `.m3u8` over https, dan hanya dari host di `HLS_HOSTS`. Kalau CDN ganti host, tambah lewat env di atas. Kalau nanti harus mengikuti host secara dinamis, tandai URL-nya di `/api/servers`.

## Cache

Dua lapis, keduanya stale-on-error:

- **Edge** (`lib/cache.js`): TTL per sumber di memory isolate, plus in-flight dedupe.
- **Perangkat** (`src/lib/kv.js`): localStorage 3.5 MB, evict yang paling lama. `useApi` melukis dari cache dulu lalu revalidate di belakang, jadi reload yang hangat tidak menampilkan skeleton dan mode offline tetap terbuka.

## Test

```bash
npm run check           # jalankan ketiganya
npm run check:render    # render 9 route React tanpa DOM
npm run check:worker    # routing Worker, guard method, guard open proxy
```

`selfcheck.js` (dipanggil `npm run check` di awal): rewrite playlist, guard open proxy, stale cache.

`check:worker` membundle Worker dengan esbuild lalu memanggil `worker.fetch()` dengan stub `ASSETS`, jadi tidak butuh `workerd`.
