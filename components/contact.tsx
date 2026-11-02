"use client";

import { EnvelopeSimple } from "@phosphor-icons/react";
import { useI18n } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeaderAuth } from "@/components/site-header-auth";

// TODO: point this at the author's real address before treating the contact
// page as final. The reader-comment path described in contactBody needs no
// address; this button is the only spot that does.
const CONTACT_MAILTO = "mailto:you@example.com";

/**
 * Contact page — same quiet shell as About: a short paragraph on how readers
 * reach the author (comments on the page they were sent), plus an email link
 * for everything else.
 */
export function Contact() {
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
            {t.contactTitle}
          </h1>
          <p className="landing-body text-lg leading-[1.7] text-muted md:text-xl md:leading-[1.7]">
            {t.contactBody}
          </p>
          <a
            href={CONTACT_MAILTO}
            className="landing-ui mt-2 inline-flex h-12 items-center gap-2 rounded-md bg-accent px-7 text-base font-medium text-accent-foreground transition-transform active:scale-[0.98]"
          >
            <EnvelopeSimple size={17} />
            {t.contactCta}
          </a>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}