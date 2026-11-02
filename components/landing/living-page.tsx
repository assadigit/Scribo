"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/providers";

/**
 * The Living Page — the hero's signature element. A frosted index-card panel
 * (70% opacity so the hero artwork breathes behind it) that types out rotating
 * opening lines in the real writing-surface typefaces (MashinTahrir for Farsi,
 * Special Elite for English), with a blinking typewriter stick caret that runs
 * just ahead of the words. Loops forever: type each line, pause, wipe, repeat.
 * Restarts cleanly when the locale syncs in after hydration or the user
 * switches language, so the loop always types in the visible language.
 *
 * The animation always runs — prefers-reduced-motion is intentionally ignored
 * because the demo is the page's signature element; a statically rendered
 * line reads as broken once visitors expect the typing.
 */
export function LivingPage() {
  const { locale, t } = useI18n();
  const [typed, setTyped] = useState("");

  // The provider renders fa first (SSR-safe) and syncs the real locale from
  // the cookie after hydration. Wipe any typed characters the instant the
  // locale settles so stale-language text never flashes on screen.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTyped("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [locale]);

  useEffect(() => {
    const lines = [t.demoLine1, t.demoLine2, t.demoLine3, t.demoLine4];
    let lineIdx = 0;
    let charIdx = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const typeChar = () => {
      const line = lines[lineIdx];
      if (charIdx < line.length) {
        setTyped(line.slice(0, charIdx + 1));
        charIdx += 1;
        timer = setTimeout(typeChar, 70 + Math.random() * 55);
        return;
      }
      // Line complete: carriage-return pause, then wipe and move on.
      timer = setTimeout(() => {
        lineIdx = (lineIdx + 1) % lines.length;
        charIdx = 0;
        setTyped("");
        timer = setTimeout(typeChar, 380);
      }, 520);
    };

    timer = setTimeout(typeChar, 600);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [t]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="landing-typewriter w-full max-w-md rounded-xl border border-border-subtle bg-surface/70 px-6 py-6 text-2xl leading-9 text-foreground shadow-[0_18px_50px_-28px_rgba(22,21,17,0.25)] backdrop-blur-sm sm:px-8 sm:text-3xl sm:leading-10">
        <p className="min-h-[6.5rem] break-words sm:min-h-[8.5rem]">
          {typed}
          <span className="landing-caret" aria-hidden="true" />
        </p>
      </div>
    </div>
  );
}