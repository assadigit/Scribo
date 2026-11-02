"use client";

import { useSyncExternalStore } from "react";
import { CalendarBlank, Clock } from "@phosphor-icons/react";
import { useCalendar, useI18n } from "@/components/providers";
import { formatLocalDate, toFa } from "@/lib/format";

/**
 * Live "today" readout for the dashboard header. Shows the current date and
 * time from the USER's device clock (never the server clock): the date
 * follows the active locale + calendar preference (Jalali + Persian digits in
 * Farsi, Gregorian + Latin digits in English) and the time ticks every second
 * with a dimmed seconds readout. The interval lives in the store's subscribe
 * so there is no setState-in-effect; SSR renders nothing (snapshot 0) to keep
 * hydration exact, then the client clock takes over after mount.
 */

const subscribeNow = (onStoreChange: () => void) => {
  const id = setInterval(onStoreChange, 1000);
  return () => clearInterval(id);
};
const getNow = () => Date.now();
const getServerNow = () => 0;

export function DashboardClock() {
  const now = useSyncExternalStore(subscribeNow, getNow, getServerNow);
  const { locale } = useI18n();
  const { calendar } = useCalendar();

  // SSR / first hydration pass — nothing to render until the client clock is live.
  if (now === 0) return null;

  const date = formatLocalDate(now, locale, calendar);
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const ss = pad(d.getSeconds());
  const time = locale === "fa" ? toFa(`${hhmm}:${ss}`) : `${hhmm}:${ss}`;

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted">
        <CalendarBlank size={15} className="shrink-0" aria-hidden="true" />
        <span className="tabular-nums">{date}</span>
      </span>
      <span className="h-3.5 w-px bg-border-subtle" aria-hidden="true" />
      <span className="flex items-center gap-1.5">
        <Clock size={15} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="tabular-nums" suppressHydrationWarning>
          {time.slice(0, 5)}
          <span className="text-muted">{time.slice(5)}</span>
        </span>
      </span>
    </div>
  );
}