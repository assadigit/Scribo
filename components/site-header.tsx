"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarBlank,
  CaretDown,
  CircleNotch,
  Moon,
  Plus,
  SignOut,
  SquaresFour,
  Sun,
  Translate,
  UserCircle,
  User,
} from "@phosphor-icons/react";
import { useCalendar, useI18n, useTheme } from "@/components/providers";
import { locales } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Consistent site header shown on every page (landing, reader, admin). RTL/LTR
 * aware — it mirrors automatically because it's laid out with flex + logical
 * properties, so the logo sits on the correct side for Farsi. The theme and
 * language (فا/EN) buttons appear only for anonymous visitors (signed-in users
 * switch theme, language, and calendar from the profile dropdown). When a
 * signed-in profile is passed it also shows an avatar that opens a dropdown
 * with: view profile, dashboard, new post, day/night, language, calendar
 * (Jalali/Gregorian), and logout.
 */

export function SiteHeader({
  brandHref = "/",
  brandLabel = "Scribo",
  profile,
  right,
  showAuth = false,
  dashboardHref = "/admin",
  newPostHref = "/admin/texts/new",
}: {
  brandHref?: string;
  brandLabel?: string;
  /** When present, shows an avatar dropdown with profile/theme/lang/calendar. */
  profile?: {
    href: string;
    name?: string;
    avatar?: string | null;
    role?: string;
  } | null;
  right?: React.ReactNode;
  /** Show a Login/Sign-up button for anonymous visitors (e.g. landing page). */
  showAuth?: boolean;
  /** Destination of the "Dashboard" item in the profile dropdown. */
  dashboardHref?: string;
  /** Destination of the "New post" item in the profile dropdown. */
  newPostHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { calendar, toggleCalendar } = useCalendar();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="app-chrome sticky top-0 z-20 bg-background">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
        <Link href={brandHref} className="flex shrink-0 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme === "dark" ? "/logo/scribo-dark-mode.png" : "/logo/scribo-light-mode.png"}
            alt={brandLabel}
            width={151}
            height={57}
            className="h-[34px] w-auto shrink-0 sm:h-[41px]"
            decoding="async"
          />
        </Link>

        {/* Primary nav — Home / About / Contact. Hidden below md so the
            floating pill never crowds on small screens; the logo still
            covers Home there. Active page gets aria-current + underline. */}
        <nav aria-label={t.hdrNavAria} className="hidden items-center gap-1 md:flex">
          {[
            { href: "/", label: t.hdrHome },
            { href: "/about", label: t.hdrAbout },
            { href: "/contact", label: t.hdrContact },
          ].map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-3 text-sm transition-colors",
                  active ? "text-foreground underline underline-offset-4" : "text-muted hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          {right}

          {/* Theme — only for anonymous visitors; signed-in users toggle from the profile dropdown */}
          {!profile && (
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t.themeToggle}
              title={t.themeToggle}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground sm:h-9 sm:w-9"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          {/* Language — only for anonymous visitors; signed-in users use the profile dropdown */}
          {!profile && (
            <div className="flex items-center gap-0.5" role="group" aria-label={t.localeToggle}>
              {locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  aria-pressed={locale === l}
                  className={cn(
                    "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-xs transition-colors sm:h-9 sm:min-w-9",
                    locale === l ? "text-foreground underline underline-offset-4" : "text-muted hover:text-foreground",
                  )}
                >
                  {l === "fa" ? "فا" : "EN"}
                </button>
              ))}
            </div>
          )}

          {/* Login / Register — shown only for anonymous visitors on pages that opt in.
              Kept at the edge (outermost) of the header. */}
          {!profile && showAuth && (
            <Link
              href="/auth/login"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border-subtle px-2.5 text-xs font-medium text-foreground transition-colors hover:border-foreground sm:h-9 sm:px-3.5 sm:text-sm"
            >
              <UserCircle size={15} className="hidden sm:inline-block" />
              {t.hdrLogin}
            </Link>
          )}

          {/* New post — the primary CTA, a filled button when signed in.
              The dropdown keeps its own copy for discoverability. */}
          {profile && (
            <Link
              href={newPostHref}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground transition-transform active:scale-[0.98] sm:h-9 sm:px-4 sm:text-sm"
            >
              <Plus size={14} weight="bold" />
              {t.hdrNewPost}
            </Link>
          )}

          {/* Profile dropdown */}
          {profile && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t.hdrAccountMenu}
                className="flex items-center gap-2 rounded-full border border-border-subtle px-1.5 py-1 transition-colors hover:border-foreground"
              >
                {profile.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-muted">
                    <User className="h-4 w-4" />
                  </span>
                )}
                <CaretDown size={12} className="text-muted" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute end-0 top-full mt-2 z-30 w-60 overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-lg shadow-black/5"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      window.location.href = profile.href;
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition-colors hover:bg-surface-muted"
                  >
                    {profile.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-muted">
                        <UserCircle className="h-6 w-6" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{profile.name || t.hdrProfileFallback}</span>
                      {profile.role && <span className="block text-xs text-muted">{profile.role}</span>}
                    </span>
                  </button>
                  <div className="border-t border-border-subtle" role="separator" />

                  <MenuLink href={dashboardHref} onClick={() => setMenuOpen(false)} icon={<SquaresFour className="h-4 w-4" />}>
                    {t.hdrDashboard}
                  </MenuLink>
                  <MenuLink href={newPostHref} onClick={() => setMenuOpen(false)} icon={<Plus className="h-4 w-4" />}>
                    {t.hdrNewPost}
                  </MenuLink>

                  <div className="border-t border-border-subtle" role="separator" />

                  <MenuRow onClick={toggleTheme} icon={theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}>
                    {theme === "dark" ? t.themeDayMode : t.themeNightMode}
                  </MenuRow>
                  <MenuRow
                    onClick={() => setLocale(locale === "fa" ? "en" : "fa")}
                    icon={<Translate className="h-4 w-4" />}
                  >
                    {locale === "fa" ? t.langToEnglish : t.langToFarsi}
                  </MenuRow>
                  <MenuRow onClick={toggleCalendar} icon={<CalendarBlank className="h-4 w-4" />}>
                    {calendar === "jalali" ? t.calToGregorian : t.calToJalali}
                  </MenuRow>

                  <div className="border-t border-border-subtle" role="separator" />

                  <MenuRow onClick={handleLogout} disabled={loggingOut} icon={loggingOut ? <CircleNotch className="h-4 w-4 animate-spin" /> : <SignOut className="h-4 w-4" />}>
                    {t.logoutAction}
                  </MenuRow>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuRow({
  children,
  onClick,
  icon,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      <span className="inline-flex w-4 items-center justify-center text-muted">{icon}</span>
      {children}
    </button>
  );
}

function MenuLink({
  href,
  onClick,
  children,
  icon,
}: {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm text-foreground transition-colors hover:bg-surface-muted"
    >
      <span className="inline-flex w-4 items-center justify-center text-muted">{icon}</span>
      {children}
    </Link>
  );
}