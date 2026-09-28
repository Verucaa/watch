/**
 * Self-check for the two pieces of logic that silently break the app when wrong:
 * playlist rewriting (playback dies) and the open-proxy guard (security).
 * Run: npm run check
 */
import assert from "node:assert/strict";
import { rewritePlaylist, isAllowed } from "../lib/hls.js";
import { cached } from "../lib/cache.js";

const MASTER = [
    "#EXTM3U",
    "#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080",
    "sd/1/index-s1080p-v1-a1.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=2,RESOLUTION=3840x2160",
    "https://other.cdn/x/master.m3u8",
    "#EXTINF:6,",
    "https://seg.cdn/a.m4s"
].join("\n");

const SRC = "https://moon.quietridge.top/vd/abc/master.m3u8";

/* 1. relative variant playlists must come back through our proxy */
const out = rewritePlaylist(MASTER, SRC).split("\n");
assert.ok(out[2].startsWith("/api/hls?u="), "relative variant must be proxied");
assert.ok(decodeURIComponent(out[2]).includes("moon.quietridge.top/vd/abc/sd/1/index-s1080p-v1-a1.m3u8"), "relative URI must resolve against the source dir");
assert.ok(out[4].startsWith("/api/hls?u="), "absolute variant on an allowed path must be proxied too");
assert.equal(out[6], "https://seg.cdn/a.m4s", "segments must stay direct (they allow CORS)");
assert.ok(!out[0].startsWith("/api/hls"), "comment lines must not be rewritten");

/* 2. the proxy must refuse anything outside the CDN list (no open proxy), while
      the HLS_HOSTS env override lets the operator add a rotated host */
assert.equal(isAllowed("https://evil.example/x.m3u8"), false, "unknown host refused");
assert.equal(isAllowed("https://moon.quietridge.top/x.mp4"), false, "non-playlist refused");
assert.equal(isAllowed("http://moon.quietridge.top/x.m3u8"), false, "plain http refused");
assert.equal(isAllowed("https://moon.quietridge.top/vd/abc/master.m3u8"), true, "listed CDN host allowed");
assert.equal(isAllowed("https://evil.moon.quietridge.top/x.m3u8"), true, "subdomain of a listed host allowed");
assert.equal(isAllowed("https://other.cdn/x/master.m3u8", "other.cdn"), true, "env override adds a rotated host");
assert.equal(isAllowed("https://other.cdn/x/master.m3u8"), false, "same host still refused without the override");

/* 3. cache serves stale data instead of erroring when upstream dies */
let calls = 0;
const flaky = async () => {
    calls++;
    if (calls === 1) return { v: 1 };
    throw new Error("upstream down");
};
assert.deepEqual(await cached("t", 60e3, flaky), { v: 1, _cache: "miss" });
const stale = await cached("t", 1, flaky);
assert.equal(stale.v, 1, "stale value must survive an upstream failure");
assert.equal(stale._cache, "stale");
assert.equal(stale._err, "upstream down");
assert.equal(await cached("t2", 60e3, flaky).then(() => "resolved", (e) => e.message), "upstream down", "no cached value -> real error");

console.log("ok - playlist rewrite, proxy guard, stale cache");
