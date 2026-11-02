"use client";

import Link from "next/link";
import { useState } from "react";
import { useCalendar, useI18n } from "@/components/providers";
import { toFa, toJalali } from "@/lib/format";

/**
 * Site footer shown on the landing and reader pages. Mirrors the header's
 * minimal black/white aesthetic and is RTL-aware (flex + logical properties
 * mirror automatically for Farsi). The copyright year follows the calendar
 * preference like every other date in the app: Jalali (with Persian digits)
 * when the solar Hijri calendar is active, Gregorian otherwise.
 */
export function SiteFooter() {
  const { t } = useI18n();
  const { calendar } = useCalendar();

  // Captured once at mount (the copyright year only needs to change on reload;
  // a state initializer is allowed to be impure, unlike render-time Date.now).
  const [now] = useState(() => Date.now());
  const jalali = toJalali(now);
  const year =
    calendar === "jalali" && jalali
      ? toFa(jalali.y)
      : String(new Date(now).getFullYear());

  return (
    <footer className="app-chrome border-t border-border-subtle bg-surface">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          {/* Brand */}
          <div className="flex flex-col items-start gap-3">
            <span className="font-serif text-lg font-medium tracking-tight">{t.brand}</span>
            <p className="text-sm leading-6 text-muted">{t.tagline}</p>
          </div>

          {/* Quick links */}
          <nav aria-label={t.footerNavAria} className="flex flex-col items-start gap-3">
            <p className="text-sm font-medium">{t.footerLinks}</p>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              <li>
                <Link href="/" className="transition-colors hover:text-foreground">
                  {t.footerHome}
                </Link>
              </li>
              <li>
                <Link href="/auth/login" className="transition-colors hover:text-foreground">
                  {t.hdrLogin}
                </Link>
              </li>
              <li>
                <Link href="/admin" className="transition-colors hover:text-foreground">
                  {t.author}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Footer note */}
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm leading-6 text-muted">{t.footer}</p>
          </div>
        </div>

        <div className="mt-10 border-t border-border-subtle pt-6">
          <p className="text-xs text-muted">
            © {year} {t.brand}
          </p>
        </div>
      </div>
    </footer>
  );
}
