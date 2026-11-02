"use client";

import { useEffect } from "react";

const BEAT_MS = 30_000;

/**
 * Tracks how long an unlocked reader stays on a chapter. Posts `start` on
 * mount, a heartbeat every 30s, and an `end` beacon when the page hides so an
 * average duration is preserved even if the reader navigates away.
 */
export function ReadSessionTracker({
  token,
  chapterId,
}: {
  token: string;
  chapterId: string;
}) {
  useEffect(() => {
    const sessionId = crypto.randomUUID();
    const start = Date.now();
    let ended = false;
    let timer: number | null = null;

    function post(action: "start" | "beat" | "end", durationMs: number) {
      fetch("/api/r/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, chapterId, sessionId, action, durationMs }),
      }).catch(() => {});
    }

    function finish() {
      if (ended) return;
      ended = true;
      if (timer) window.clearInterval(timer);
      const durationMs = Date.now() - start;
      const payload = JSON.stringify({ token, chapterId, sessionId, action: "end", durationMs });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/r/session",
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        post("end", durationMs);
      }
    }

    post("start", 0);
    timer = window.setInterval(() => post("beat", Date.now() - start), BEAT_MS);

    const onHide = () => finish();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      finish();
    };
  }, [token, chapterId]);

  return null;
}