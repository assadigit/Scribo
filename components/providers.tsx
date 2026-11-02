"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dictionaries, type Dictionary, type Locale } from "@/lib/i18n";

type Theme = "light" | "dark";
export type Calendar = "jalali" | "gregorian";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "light",
  toggleTheme: () => {},
});

const LocaleContext = createContext<{
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}>({
  locale: "fa",
  t: dictionaries.fa,
  setLocale: () => {},
});

const CalendarContext = createContext<{
  calendar: Calendar;
  setCalendar: (c: Calendar) => void;
    toggleCalendar: () => void;
}>({
  calendar: "jalali",
  setCalendar: () => {},
  toggleCalendar: () => {},
});

export function Providers({
  children,
}: {
  children: ReactNode;
}) {
  // Static-safe defaults: the root layout no longer reads cookies, so the
  // first (server) render is always fa/light/jalali. The bootstrap script in
  // the layout sets dir/lang/theme pre-paint from the cookie; the effect
  // below syncs context state right after hydration so toggles and t() match
  // what the user already sees. (Initial state must match the server render,
  // so cookie values are read in the effect, not in useState initializers —
  // otherwise React hydration would tear the DOM.)
  const [theme, setThemeState] = useState<Theme>("light");
  const [locale, setLocaleState] = useState<Locale>("fa");
  const [calendar, setCalendarState] = useState<Calendar>("jalali");

  useEffect(() => {
    // Intentional: initial state must match the server render (fa/light) to
    // avoid hydration tears, so the cookie values are applied exactly once,
    // after hydration. This is the sanctioned "sync from an external platform
    // API" effect (document.cookie); the set-state-in-effect rule is too
    // eager for it, so it is disabled for this effect only.
    /* eslint-disable react-hooks/set-state-in-effect */
    const cookie = document.cookie;
    const get = (n: string) => {
      const m = cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
      return m ? m[1] : null;
    };
    const themeFromCookie = get("theme");
    if (themeFromCookie === "dark" || themeFromCookie === "light") {
      setThemeState(themeFromCookie);
      document.documentElement.classList.toggle("dark", themeFromCookie === "dark");
    }
    const localeFromCookie = get("locale");
    if (localeFromCookie === "en" || localeFromCookie === "fa") {
      setLocaleState(localeFromCookie);
      document.documentElement.lang = localeFromCookie;
      document.documentElement.dir = localeFromCookie === "fa" ? "rtl" : "ltr";
    }
    const calendarFromCookie = get("calendar");
    if (calendarFromCookie === "gregorian" || calendarFromCookie === "jalali") {
      setCalendarState(calendarFromCookie);
    } else {
      // No explicit calendar preference → it follows the language: Shamsi
      // (Jalali) for Farsi, Gregorian for English. (An explicit toggle in
      // the profile menu writes the cookie, which wins over the default.)
      setCalendarState(get("locale") === "en" ? "gregorian" : "jalali");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Auto light/dark by the device clock: dark from 21:00 until 07:00, light
  // otherwise. Only applies when the user hasn't set a manual theme cookie
  // (a manual toggle writes `theme=`, which takes priority until cleared).
  useEffect(() => {
    const hasManualTheme = /(?:^|;\s*)theme=/.test(document.cookie);
    if (hasManualTheme) return;

    const applyTheme = () => {
      const h = new Date().getHours();
      const autoDark = h >= 21 || h < 7;
      setThemeState(autoDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", autoDark);
    };
    applyTheme();
    const id = setInterval(applyTheme, 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      const root = document.documentElement;
      root.classList.toggle("dark", next === "dark");
      document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    const root = document.documentElement;
    root.lang = l;
    root.dir = l === "fa" ? "rtl" : "ltr";
    document.cookie = `locale=${l};path=/;max-age=31536000;samesite=lax`;
    // The calendar follows the language unless the user has an explicit
    // preference (a `calendar=` cookie, written only by a manual toggle).
    if (!/(?:^|; )calendar=/.test(document.cookie)) {
      setCalendarState(l === "en" ? "gregorian" : "jalali");
    }
    // Server components render from the cookie at request time, so a client-
    // side switch alone would leave them in the old language while flipping
    // the page to RTL. Reload so the whole page re-renders in the new locale.
    window.location.reload();
  }, []);

  const setCalendar = useCallback((c: Calendar) => {
    setCalendarState(c);
    document.cookie = `calendar=${c};path=/;max-age=31536000;samesite=lax`;
  }, []);

  const toggleCalendar = useCallback(() => {
    setCalendarState((prev) => {
      const next = prev === "jalali" ? "gregorian" : "jalali";
      document.cookie = `calendar=${next};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  }, []);

  const themeValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  const localeValue = useMemo(
    () => ({ locale, t: dictionaries[locale], setLocale }),
    [locale, setLocale],
  );
  const calendarValue = useMemo(
    () => ({ calendar, setCalendar, toggleCalendar }),
    [calendar, setCalendar, toggleCalendar],
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <LocaleContext.Provider value={localeValue}>
        <CalendarContext.Provider value={calendarValue}>{children}</CalendarContext.Provider>
      </LocaleContext.Provider>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export const useI18n = () => useContext(LocaleContext);
export const useCalendar = () => useContext(CalendarContext);