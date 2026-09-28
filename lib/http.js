/**
 * Minimal fetch wrapper with an axios-shaped API.
 * ponytail: Cloudflare Workers has fetch but no XHR/node:http, so axios cannot run
 * there. 7reels.js only uses get/post, so this is the smallest thing that keeps
 * that file untouched apart from one import line.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

export class HttpError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

function parseBody(text, contentType) {
    if (!text) return "";
    if (contentType.includes("json") || /^[[{"]/.test(text)) {
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
    return text;
}

export async function request(url, { method = "GET", headers = {}, body, timeout = 15000, referer, params } = {}) {
    const h = { "User-Agent": UA, Accept: "*/*", ...headers };
    if (referer) h.Referer = referer;
    if (body !== undefined && !h["Content-Type"]) h["Content-Type"] = "application/json";

    /* 7reels.js passes query params axios-style; Workers fetch has no params option. */
    if (params && Object.keys(params).length) {
        const u = new URL(url);
        for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
        url = u.href;
    }

    const res = await fetch(url, {
        method,
        headers: h,
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        signal: timeout ? AbortSignal.timeout(timeout) : undefined,
        redirect: "follow"
    });

    const text = await res.text();
    if (!res.ok) {
        throw new HttpError(`HTTP ${res.status} ${res.statusText} — ${url.slice(0, 120)}`, res.status);
    }
    return { data: parseBody(text, res.headers.get("content-type") || ""), status: res.status, headers: res.headers };
}

export const get = (url, cfg = {}) => request(url, { ...cfg, method: "GET" });
export const post = (url, body, cfg = {}) => request(url, { ...cfg, method: "POST", body });

export default { get, post, request, HttpError };
