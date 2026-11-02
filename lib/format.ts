import type { Calendar } from "@/components/providers";

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/**
 * Solar Hijri (Jalali) date from a timestamp, via the browser/ICU Persian
 * calendar. Returns null when the runtime lacks `fa`/persian support (falls
 * back to Gregorian). Digits are kept Latin ({ y, m, d }).
 */
export function toJalali(timestamp: number): { y: number; m: number; d: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const y = Number(pick("year").replace(/[^\d]/g, ""));
    const m = Number(pick("month"));
    const d = Number(pick("day"));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return { y, m, d };
  } catch {
    return null;
  }
}

/** Persian (Jalali) date string with Persian digits, e.g. ۱۴۰۵/۰۵/۱۶. */
export function formatJalaliDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  const j = toJalali(timestamp);
  if (!j) return formatDate(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${j.y}/${pad(j.m)}/${pad(j.d)}`.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/**
 * Locale + calendar-aware date. Farsi defaults to the solar Hijri (Jalali)
 * calendar; an explicit calendar preference overrides that. Falls back to
 * Gregorian when the Persian calendar is unavailable.
 */
export function formatLocalDate(
  timestamp: number | null | undefined,
  locale: "fa" | "en" = "fa",
  calendar?: Calendar,
): string {
  if (!timestamp) return "—";
  const useJalali =
    calendar === "jalali" || (calendar === undefined && locale === "fa");
  if (useJalali) {
    const j = toJalali(timestamp);
    if (j) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${j.y}/${pad(j.m)}/${pad(j.d)}`.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
    }
  }
  return formatDate(timestamp);
}

/**
 * Locale-aware clock time (HH:MM, 24h). Farsi renders with Persian digits
 * (۲۱:۳۰), English with Latin digits (21:30).
 */
export function formatLocalTime(
  timestamp: number | null | undefined,
  locale: "fa" | "en" = "fa",
): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return locale === "fa" ? toFa(time) : time;
}

/**
 * Locale + calendar-aware date with clock time, e.g. ۱۴۰۵/۰۵/۱۶، ۲۱:۳۰
 * (Farsi, Jalali) or 2026/08/09 · 21:30 (English, Gregorian).
 */
export function formatLocalDateTime(
  timestamp: number | null | undefined,
  locale: "fa" | "en" = "fa",
  calendar?: Calendar,
): string {
  if (!timestamp) return "—";
  const date = formatLocalDate(timestamp, locale, calendar);
  const time = formatLocalTime(timestamp, locale);
  if (date === "—" || time === "—") return "—";
  return locale === "fa" ? `${date}، ${time}` : `${date} · ${time}`;
}

export function toFa(value: number | string): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** Arabic-script letters, digits, and punctuation (Farsi included). */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Context-aware digit localization for mixed Farsi/Latin content: a Latin
 * digit run becomes Persian digits when the nearest preceding letter (skipping
 * whitespace, punctuation and other digits) is Arabic-script; otherwise the
 * run stays Latin.
 *
 * "فصل 3 از 10" → "فصل ۳ از ۱۰" and "نسخه 2.0" → "نسخه ۲.۰" while "Chapter 3
 * of 10" is untouched. Runs at the very start of a string default to Latin.
 */
export function localizeDigits(text: string): string {
  return text.replace(/\d+/g, (run, offset) => {
    for (let i = offset - 1; i >= 0; i--) {
      const ch = text[i];
      // Skip whitespace, punctuation and other digits to find the nearest
      // actual letter — “the latest letter before the number decides”.
      if (!/[\s\p{P}\p{S}\d]/u.test(ch)) {
        return ARABIC_SCRIPT.test(ch) ? toFa(run) : run;
      }
    }
    return run;
  });
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/** Collapse a duration in milliseconds into a short human string (Fa or En). */
export function formatDurationMs(ms: number | null | undefined, locale: "fa" | "en" = "fa"): string {
  const seconds = Math.round((ms ?? 0) / 1000);
  if (seconds < 60) return locale === "fa" ? `${toFa(seconds)} ثانیه` : `${seconds}s`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return locale === "fa" ? `${toFa(minutes)} دقیقه` : `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return locale === "fa" ? `${toFa(hours)} ساعت` : `${hours} hr`;
}

/** Clock time HH:MM:SS (24h) — used for autosave stamps. Farsi locale gets
 *  Persian digits (e.g. ۱۴:۲۳:۰۵). */
export function formatClockTime(
  timestamp: number | null | undefined,
  locale: "fa" | "en" = "fa",
): string {
  if (!timestamp) return locale === "fa" ? "—" : "—";
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const clock = `${hh}:${mm}:${ss}`;
  return locale === "fa" ? toFa(clock) : clock;
}

/** Human “x minutes / hours / days ago” relative time. */
export function formatRelativeTime(
  timestamp: number | null | undefined,
  locale: "fa" | "en" = "fa",
): string {
  if (!timestamp) return locale === "fa" ? "—" : "—";
  const diff = Date.now() - timestamp;
  if (diff < 45_000) return locale === "fa" ? "همین حالا" : "just now";
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return locale === "fa" ? `${toFa(minutes)} دقیقه پیش` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale === "fa" ? `${toFa(hours)} ساعت پیش` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return locale === "fa" ? `${toFa(days)} روز پیش` : `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return locale === "fa" ? `${toFa(months)} ماه پیش` : `${months}mo ago`;
  const years = Math.round(months / 12);
  return locale === "fa" ? `${toFa(years)} سال پیش` : `${years}y ago`;
}