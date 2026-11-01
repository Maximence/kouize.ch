"use client";

import { useEffect } from "react";

/** Scroll the rendered note to a heading and flash it, for "open source" links. */
export function ScrollToSection({ anchor }: { anchor: string }) {
  useEffect(() => {
    const el = anchor ? document.getElementById(anchor) : document.getElementById("top");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!anchor) return;
    el.classList.add("section-highlight");
    const t = setTimeout(() => el.classList.remove("section-highlight"), 2500);
    return () => clearTimeout(t);
  }, [anchor]);
  return null;
}
