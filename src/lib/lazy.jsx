import { useEffect, useRef, useState } from "react";

/** true once the element has scrolled near the viewport (or IO is unavailable) */
export function useInView(margin = "400px") {
    const ref = useRef(null);
    const [seen, setSeen] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node || seen) return;
        if (typeof IntersectionObserver === "undefined") {
            setSeen(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setSeen(true);
                    io.disconnect();
                }
            },
            { rootMargin: margin }
        );
        io.observe(node);
        return () => io.disconnect();
    }, [seen, margin]);

    return [ref, seen];
}

/** Reserve space until the block scrolls into view, then build the real thing. */
export function Deferred({ height = 160, children }) {
    const [ref, seen] = useInView();
    return <div ref={ref} style={seen ? undefined : { minHeight: height }}>{seen ? children : <div className="sk h-24 w-full" />}</div>;
}
