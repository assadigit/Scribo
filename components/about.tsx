"use client";

import { useI18n } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeaderAuth } from "@/components/site-header-auth";

/**
 * About page — a quiet editorial statement in the landing's paper-and-ink
 * system. Same shell as the landing: glass header, then a centered reading
 * column with a max measure, then the footer.
 */
export function About() {
  const { t } = useI18n();

  return (
    <div className="landing flex flex-col">
      <SiteHeaderAuth />

      <main className="flex flex-1 flex-col items-center px-6 py-24 sm:px-8 md:py-32">
        <article className="flex w-full max-w-[42rem] flex-col items-start gap-6">
          <p className="landing-ui text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            {t.brand}
          </p>
          <h1 className="landing-display text-[2rem] font-medium leading-[1.15] tracking-tight text-foreground md:text-[2.75rem]">
            {t.aboutTitle}
          </h1>
          <p className="landing-body text-lg leading-[1.7] text-muted md:text-xl md:leading-[1.7]">
            {t.aboutBody1}
          </p>
          <p className="landing-body text-lg leading-[1.7] text-muted md:text-xl md:leading-[1.7]">
            {t.aboutBody2}
          </p>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}