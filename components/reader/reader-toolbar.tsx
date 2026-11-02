"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { useI18n, useTheme } from "@/components/providers";

const SCALE_KEY = "scribo:reader-scale";
const MIN = 0.875;
const MAX = 1.375;
const STEP = 0.0625;
const DEFAULT = 1;

function clamp(v: number) {
  return Math.min(MAX, Math.max(MIN, v));
}


export function ReaderToolbar() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  // Read the persisted scale once at first render (SSR-safe: skip when the
  // window doesn't exist). The DOM variable is applied by an effect below.
  const [scale, setScale] = useState(() => {
    if (typeof window === "undefined") return DEFAULT;
    const saved = parseFloat(window.localStorage.getItem(SCALE_KEY) ?? "");
    return clamp(Number.isFinite(saved) ? saved : DEFAULT);
  });

  useEffect(() => {
    document.documentElement.style.setProperty("--reader-scale", String(scale));
  }, [scale]);

  function change(delta: number) {
    setScale((prev) => {
      const next = clamp(prev + delta);
      document.documentElement.style.setProperty("--reader-scale", String(next));
      localStorage.setItem(SCALE_KEY, String(next));
      return next;
    });
  }

  function reset() {
    setScale((prev) => {
      if (prev === DEFAULT) return prev;
      document.documentElement.style.setProperty("--reader-scale", String(DEFAULT));
      localStorage.setItem(SCALE_KEY, String(DEFAULT));
      return DEFAULT;
    });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-6">
      <div
        dir="ltr"
        className="app-chrome pointer-events-auto flex items-center gap-0.5 rounded-sm border border-border-subtle bg-surface/90 px-1.5 py-1 shadow-lg shadow-black/5 backdrop-blur"
      >
        <button
          type="button"
          onClick={() => change(-STEP)}
          aria-label={t.readerToolbarSmaller}
          disabled={scale <= MIN}
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        >
          A−
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label={t.readerToolbarResetSizeAria}
          title={t.readerToolbarReset}
          className="inline-flex h-9 w-11 items-center justify-center rounded-sm text-xs text-muted tabular-nums transition-colors hover:text-foreground"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => change(STEP)}
          aria-label={t.readerToolbarLarger}
          disabled={scale >= MAX}
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        >
          A+
        </button>
        <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden="true" />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? t.readerToolbarLight : t.readerToolbarDark}
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted transition-colors hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}