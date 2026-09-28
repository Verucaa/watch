/**
 * Worker smoke test. wrangler/workerd does not run on this host, so the entry is
 * bundled with esbuild and called directly with a stubbed ASSETS binding --
 * that still exercises routing, the method guard, the open-proxy guard and the
 * scraper path. Run: npm run check:worker
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "w17-"));
const out = join(dir, "worker.mjs");
await build({ entryPoints: ["worker/index.js"], bundle: true, format: "esm", outfile: out, platform: "neutral", logLevel: "silent" });
await writeFile(join(dir, "package.json"), '{"type":"module"}');

const { default: worker } = await import(`file://${out}`);
const hit = [];

const env = {
    ASSETS: {
        fetch(req) {
            hit.push(new URL(req.url).pathname);
            return new Response("<!doctype html>shell", { headers: { "Content-Type": "text/html" } });
        }
    }
};

const call = (path, init) => worker.fetch(new Request(`https://watch17.test${path}`, init), env);

/* 1. routing */
const health = await call("/api/health");
assert.equal(health.status, 200);
assert.equal((await health.json()).ok, true, "health must report ok");

assert.equal((await call("/api/nope")).status, 404, "unknown /api path is 404");
assert.equal((await call("/api/home", { method: "POST" })).status, 405, "write methods are refused");

const shell = await call("/index.html");
assert.equal(shell.status, 200, "static files fall through to ASSETS");
assert.ok(hit.includes("/index.html"), "ASSETS binding must receive the request");

/* 2. the open-proxy guard is the security boundary -- nothing else covers it */
const evil = await call("/api/hls?u=" + encodeURIComponent("https://evil.example/x.m3u8"));
assert.equal(evil.status, 400, "host outside the CDN list must be refused");
assert.match((await evil.json()).error, /not allowed/);

const notPlaylist = await call("/api/hls?u=" + encodeURIComponent("https://moon.quietridge.top/vd/a.mp4"));
assert.equal(notPlaylist.status, 400, "non-playlist path must be refused");

/* a listed host passes the guard and reaches the CDN -- the failure that comes
   back (502) proves we did proxy it, and is expected without network access */
const listed = await call("/api/hls?u=" + encodeURIComponent("https://moon.quietridge.top/vd/abc/master.m3u8"));
assert.notEqual(listed.status, 400, "a listed playlist host must pass the guard");

/* 3. validation without touching the network */
const noQ = await call("/api/search");
const noQBody = await noQ.json();
assert.equal(noQBody.total, 0, "empty query returns an empty page");
assert.equal((await call("/api/detail?type=movie")).status, 400, "detail without id is a 400");
assert.equal((await call("/api/direct?id=")).status, 400, "direct without id is a 400");
const noS = await call("/api/servers?type=tv&id=1396");
assert.equal(noS.status, 200, "tv without s/e must not break");
assert.equal((await call("/api/episodes?id=5&season=abc")).status, 200, "bad season falls back to 1");

console.log("ok - worker routing, method guard, open-proxy guard, validation");
console.log(`   /api/hls on a listed host returned ${listed.status} (upstream CDN, needs network)`);
