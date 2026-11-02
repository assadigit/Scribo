"use client";

import {
  ArrowLeft,
  ArrowRight,
  LinkSimple,
  LockKey,
  MagnifyingGlass,
  NotePencil,
  PenNib,
  Stamp,
  Tray,
} from "@phosphor-icons/react";
import { useI18n } from "@/components/providers";
import { SiteHeaderAuth } from "@/components/site-header-auth";
import { AuthAwareCta } from "@/components/auth-aware-cta";
import { SiteFooter } from "@/components/site-footer";
import { toFa } from "@/lib/format";
import { LivingPage } from "@/components/landing/living-page";
import { Reveal } from "@/components/landing/reveal";

/**
 * Scribo landing — “Ink & Invitation”.
 *
 * A near-monochrome paper-and-ink system with one functional accent (seal red,
 * used only where something is private or sealed). The hero sits on the
 * full-bleed Scribo artwork (light + dark variants) with a quiet scrim and
 * the headline set in the house typewriter face; beside it, the Living Page
 * card types a line of writing live, in the actual editor typefaces. The only
 * sound is opt-in, behind the "hear it type" toggle.
 *
 * Layout is start-aligned (right in Farsi, left in English) and mirrors fully
 * in RTL via logical properties + dir-aware classes.
 */
export function Landing() {
  const { t, locale } = useI18n();
  const rtl = locale === "fa";

  // Section markers: Farsi digits when the interface is Farsi, latin otherwise.
  const sectionNum = (n: number) =>
    locale === "fa" ? toFa(String(n).padStart(2, "0")) : String(n).padStart(2, "0");

  return (
    <div className="landing flex flex-col">
      {/* Sticky floating header — a direct child of the page column, so it stays
          pinned at the top across the whole page (hero + sections + footer).
          The auth-aware island fetches the session client-side; this page is
          statically generated. */}
      <SiteHeaderAuth />

      <main>
        {/* ───────────────────────── Hero ───────────────────────── */}
        {/* Full-bleed artwork band: the previous Scribo hero photograph, with
            the mobile crop on small screens and the desktop crop above md.
            Dark mode swaps to the dedicated darkmode variants. The scrim is
            the same treatment /auth/login uses, so paper-white text stays
            readable over the artwork in both modes. */}
        <section className="relative overflow-hidden border-b border-border-subtle">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[url('/hero/hero-v2-mobile.webp')] bg-cover bg-center dark:bg-[url('/hero/hero-mobile-darkmode.jpg')] md:hidden"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 hidden bg-[url('/hero/hero-v2-pc.webp')] bg-cover bg-center dark:bg-[url('/hero/hero-pc-darkmode.jpg')] md:block"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-black/25"
          />

          <div className="relative mx-auto flex w-full max-w-5xl flex-col items-start gap-12 px-6 pb-20 pt-24 sm:px-8 md:pt-28 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16 lg:pb-28">
            <div className="flex max-w-2xl flex-col items-start gap-6">
              <p
                className="landing-ui fade-up text-[13px] font-semibold uppercase tracking-[0.08em] text-white/70"
                style={{ animationDelay: "80ms" }}
              >
                {t.heroEyebrow}
              </p>
              <h1
                className="landing-typewriter fade-up text-[2.125rem] font-medium leading-[1.1] tracking-tight text-white md:text-[4rem] md:leading-[1.05]"
                style={{ animationDelay: "160ms" }}
              >
                {t.tagline}
              </h1>
              <p
                className="landing-body fade-up max-w-xl text-lg leading-[1.6] text-white/85 md:text-xl md:leading-[1.6]"
                style={{ animationDelay: "240ms" }}
              >
                {t.subline}
              </p>

            <div className="fade-up flex flex-col items-start gap-2" style={{ animationDelay: "320ms" }}>
              <AuthAwareCta />
            </div>
          </div>

          {/* The Living Page — types a real line of writing in the editor faces. */}
          <div className="fade-up flex w-full justify-start lg:justify-center" style={{ animationDelay: "300ms" }}>
            <LivingPage />
          </div>
        </div>
        </section>

        {/* ───────────────────── ۰۱ — What Scribo is ───────────────────── */}
        <Chapter num={sectionNum(1)} centered>
          <Reveal>
            <h2 className="landing-display text-[1.75rem] font-medium leading-[1.25] tracking-tight text-foreground md:text-[2.5rem]">
              {t.whatIsTitle}
            </h2>
            <p className="landing-body mx-auto mt-5 max-w-[42rem] text-lg leading-[1.7] text-muted md:text-xl md:leading-[1.7]">
              {t.whatIsBody}
            </p>
          </Reveal>
        </Chapter>

        {/* ────────────────────── ۰۲ — Why Scribo ────────────────────── */}
        <Chapter num={sectionNum(2)}>
          <Reveal>
            <h2 className="landing-display text-[1.75rem] font-medium leading-[1.25] tracking-tight text-foreground md:text-[2.5rem]">
              {t.whyUseTitle}
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whyCards(t).map((card, i) => (
              <Reveal key={card.title} delay={i * 40}>
                <div
                  className={
                    card.seal
                      ? "flex h-full flex-col items-start gap-3 rounded-md border border-seal/25 bg-[var(--seal-soft)] p-5"
                      : "flex h-full flex-col items-start gap-3 rounded-md border border-border-subtle bg-surface p-5"
                  }
                >
                  <span
                    className={
                      card.seal
                        ? "flex h-9 w-9 items-center justify-center rounded-md text-seal"
                        : "flex h-9 w-9 items-center justify-center rounded-md bg-surface-muted text-muted"
                    }
                  >
                    {card.icon}
                  </span>
                  <h3 className="landing-ui text-xl font-semibold leading-[1.3] text-foreground md:text-2xl">{card.title}</h3>
                  <p className="landing-body text-base leading-[1.6] text-muted">{card.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Chapter>

        {/* ───────────────────── ۰۳ — How it works ───────────────────── */}
        <Chapter num={sectionNum(3)}>
          <Reveal>
            <h2 className="landing-display text-[1.75rem] font-medium leading-[1.25] tracking-tight text-foreground md:text-[2.5rem]">
              {t.howUseTitle}
            </h2>
          </Reveal>

          <ol className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-0">
            {howSteps(t).map((step, i) => (
              <li key={step.title} className="relative flex flex-col gap-3 lg:px-8">
                {/* The route a piece of writing takes: a thin hairline path
                    in the gap between steps, with a direction-aware arrow
                    (points left in RTL, right in LTR). */}
                {i > 0 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute top-[18px] hidden h-px w-8 bg-border-subtle lg:block -start-8"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute top-[9px] hidden text-muted lg:block -start-8"
                    >
                      {rtl ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
                    </span>
                  </>
                )}
                <Reveal delay={i * 50}>
                  <div className="flex flex-col gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-muted text-muted">
                      {step.icon}
                    </span>
                    <h3 className="landing-ui text-xl font-semibold leading-[1.3] text-foreground md:text-2xl">{step.title}</h3>
                    <p className="landing-body text-base leading-[1.6] text-muted">{step.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </Chapter>

        {/* ─────────────────────── Trust band ─────────────────────── */}
        <section className="trust-band border-y border-border-subtle bg-accent text-accent-foreground">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-8 px-6 py-16 sm:px-8 md:py-20 lg:flex-row lg:items-center lg:gap-16">
            <Reveal className="lg:w-1/2">
              <div className="flex items-start gap-5">
                <span className="landing-seal flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-seal/40 text-seal">
                  <Stamp size={26} aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-3">
                  <h2 className="landing-display text-2xl font-medium leading-[1.3] tracking-tight text-accent-foreground md:text-3xl">
                    {t.trustTitle}
                  </h2>
                  <p className="landing-body text-base leading-[1.6] text-muted">{t.trustBody}</p>
                </div>
              </div>
            </Reveal>
            <ul className="grid gap-x-10 gap-y-4 lg:w-1/2 lg:grid-cols-2">
              {trustItems(t).map((item, i) => (
                <Reveal key={item.label} delay={i * 40}>
                  <li className="landing-ui flex items-center gap-3 text-sm font-medium">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-seal">
                      {item.icon}
                    </span>
                    {item.label}
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ─────────────────────── Final CTA ─────────────────────── */}
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-20 text-center sm:px-8 md:py-28">
          <Reveal>
            <h2 className="landing-display max-w-xl text-3xl font-medium leading-[1.15] tracking-tight text-foreground md:text-5xl">
              {t.ctaTitle}
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <AuthAwareCta />
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ─────────────────────────── section helpers ─────────────────────────── */

function Chapter({
  num,
  children,
  centered = false,
}: {
  num: string;
  children: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <section
      className={`mx-auto w-full max-w-5xl border-t border-border-subtle px-6 py-16 sm:px-8 md:py-20 ${
        centered ? "text-center" : "text-start"
      }`}
    >
      <p className="landing-ui text-xs font-semibold uppercase tracking-[0.3em] text-muted" aria-hidden="true">
        {num}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ─────────────────────────── content helpers ─────────────────────────── */

function whyCards(t: ReturnType<typeof useI18n>["t"]) {
  return [
    { icon: <PenNib size={18} aria-hidden="true" />, title: t.why1Title, body: t.why1Body, seal: false },
    { icon: <LinkSimple size={18} aria-hidden="true" />, title: t.why2Title, body: t.why2Body, seal: false },
    { icon: <Tray size={18} aria-hidden="true" />, title: t.why3Title, body: t.why3Body, seal: false },
    { icon: <LockKey size={18} aria-hidden="true" />, title: t.why4Title, body: t.why4Body, seal: true },
  ];
}

function howSteps(t: ReturnType<typeof useI18n>["t"]) {
  return [
    { icon: <NotePencil size={18} aria-hidden="true" />, title: t.how1Title, body: t.how1Body },
    { icon: <LinkSimple size={18} aria-hidden="true" />, title: t.how2Title, body: t.how2Body },
    { icon: <MagnifyingGlass size={18} aria-hidden="true" />, title: t.how3Title, body: t.how3Body },
  ];
}

function trustItems(t: ReturnType<typeof useI18n>["t"]) {
  return [
    { icon: <MagnifyingGlass size={15} aria-hidden="true" />, label: t.trustItem1 },
    { icon: <LinkSimple size={15} aria-hidden="true" />, label: t.trustItem2 },
    { icon: <LockKey size={15} aria-hidden="true" />, label: t.trustItem3 },
    { icon: <Stamp size={15} aria-hidden="true" />, label: t.trustItem4 },
  ];
}
