/**
 * Deferred rendering. Rows/sections are only built once they approach the
 * viewport, and images fade in on decode -- keeps first paint cheap on mobile.
 */
const io = new IntersectionObserver(
    (entries) => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            io.unobserve(e.target);
            const fn = e.target.__mount;
            if (fn) {
                delete e.target.__mount;
                fn(e.target);
            }
        }
    },
    { rootMargin: "400px 0px" }
);

/** Wrap a section so it is only built when it comes near the viewport. */
export function lazySection(title, build) {
    const sec = document.createElement("section");
    sec.className = "sec";
    // the builder must exist before observe(): an observer that fires synchronously
    // (test doubles, some polyfills) would otherwise see an undefined callback.
    sec.__mount = () => {
        const built = build();
        if (built) sec.append(built);
    };
    io.observe(sec);
    return sec;
}

const fade = new IntersectionObserver(
    (entries) => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            fade.unobserve(e.target);
            const img = e.target;
            if (img.complete) img.style.opacity = "1";
            else img.addEventListener("load", () => (img.style.opacity = "1"), { once: true });
        }
    },
    { rootMargin: "200px 0px" }
);

export function lazyImg(src, alt, cls = "") {
    const img = new Image();
    img.className = cls;
    img.alt = alt || "";
    img.decoding = "async";
    img.loading = "lazy";
    img.style.opacity = "0";
    img.style.transition = "opacity .45s ease";
    if (src) img.src = src;
    else img.style.opacity = "1";
    fade.observe(img);
    return img;
}
