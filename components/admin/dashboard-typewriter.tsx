"use client";

import { useTheme } from "@/components/providers";
import { cn } from "@/lib/utils";

/**
 * Decorative vintage typewriter pinned below the vertical center of the
 * admin dashboard viewport — pushed well down so its top edge clears the
 * header + bento report boxes (about 12vh of breathing room), layered behind
 * the content (pointer-events disabled).
 * The light/dark variant follows the active theme; light mode is a touch more
 * translucent so the pale artwork recedes behind the cards.
 */
export function DashboardTypewriter() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={
          dark
            ? "/typewriter/typewriter-bg-darkmode-v2.png"
            : "/typewriter/typewriter-bg-lightmode-v2.png"
        }
        alt=""
        decoding="async"
        className={cn(
          "h-auto max-h-[55vh] w-auto max-w-[min(82vw,520px)] translate-y-[16vh]",
          dark ? "opacity-60" : "opacity-50",
        )}
      />
    </div>
  );
}