"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/providers";
import { toFa } from "@/lib/format";

/** How long the percentage pill stays visible after the last scroll event. */
const HIDE_AFTER_MS = 1200;

/**
 * Sleek, AJAX-powered (no page reloads) reading progress bar for reader pages.
 * A fixed 3px bar at the very top of the viewport fills as the reader scrolls,
 * plus a tiny percentage pill that fades in while scrolling and out on idle.
 * Left→right fill is the universal progress idiom and works in RTL too.
 */
export function ReadingProgress() {
  const { locale, t } = useI18n();
  const [progress, setProgress] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let raf = 0;

    const measure = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const next = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
      setProgress(next);
      setScrolling(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setScrolling(false), HIDE_AFTER_MS);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const percent = Math.round(progress * 100);
  const label = locale === "fa" ? toFa(percent) : String(percent);
  const showPill = scrolling && progress > 0 && progress < 1;

  return (
    <div
      role="progressbar"
      aria-label={t.readerProgressAria}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="pointer-events-none fixed inset-x-0 top-0 z-[140]"
    >
      {/* Track + fill — 3px, sits above the sticky glass header. */}
      <div className="h-[3px] w-full bg-accent/20">
        <div className="h-full origin-left bg-accent" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* Percentage pill — centered below the bar, visible only while scrolling.
          Kept off tiny screens so it never collides with the header chrome. */}
      <div
        aria-hidden="true"
        className={`absolute left-1/2 top-2 hidden -translate-x-1/2 rounded-full border border-border-subtle bg-surface/90 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted shadow-sm backdrop-blur transition-opacity duration-300 sm:block ${
          showPill ? "opacity-100" : "opacity-0"
        }`}
      >
        {t.readerProgressRead.replace("{p}", label)}
      </div>
    </div>
  );
}
