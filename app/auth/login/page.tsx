"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Scribo } from "@/components/icons/scribo";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers";
import { CircleNotch } from "@phosphor-icons/react";

type Tab = "login" | "register";
type ResetStep = "request" | "complete";

const INPUT_CLASS = "field-type w-full text-[15px]";

const SUBMIT_CLASS =
  "btn-type btn-type-solid mt-2 inline-flex w-full items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    searchParams.get("tab") === "register" ? "register" : "login",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [challenge, setChallenge] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<ResetStep>("request");
  const [resetNotice, setResetNotice] = useState<string>();
  const [resetView, setResetView] = useState(false);

  const { t, locale } = useI18n();

  const fallbackError = t.authErrorFallback;
  const loginErrors: Record<string, string> = {
    missing_fields: t.errLoginMissing,
    invalid_credentials: t.errLoginInvalid,
  };
  const mfaErrors: Record<string, string> = {
    missing_fields: t.errMfaMissing,
    invalid_code: t.errMfaInvalid,
    challenge_expired: t.errMfaExpired,
  };
  const registerErrors: Record<string, string> = {
    invalid_body: t.errRegisterInvalid,
    missing_fields: t.errRegisterMissing,
    password_too_short: t.errPasswordTooShort,
    username_taken: t.errUsernameTaken,
    email_taken: t.errEmailTaken,
    invalid_invite: t.errInviteInvalid,
    expired_invite: t.errInviteExpired,
    registration_failed: t.errRegisterFailed,
    rate_limited: t.errRegisterRateLimited,
  };

  // Maintain the tab from ?tab= login/register links (render-time state
  // adjustment — see react.dev/learn/you-might-not-need-an-effect).
  const [prevParams, setPrevParams] = useState(searchParams);
  if (searchParams !== prevParams) {
    setPrevParams(searchParams);
    const next = searchParams.get("tab");
    if (next === "login" || next === "register") setTab(next);
  }

  // A Google OAuth admin login that requires TOTP redirects here with
  // ?tab=mfa&challenge=… — adopt the challenge on render, then strip the
  // param from the URL (effect below) so the MFA “back” link returns to the
  // login form instead of immediately re-entering the pending-challenge step.
  const challengeParam = searchParams.get("challenge");
  if (challengeParam && challenge !== challengeParam) {
    setChallenge(challengeParam);
  }

  useEffect(() => {
    if (!searchParams.get("challenge")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("challenge");
    const qs = next.toString();
    router.replace(qs ? `/auth/login?${qs}` : "/auth/login", { scroll: false });
  }, [searchParams, router]);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      mfaRequired?: boolean;
      challenge?: string;
    } | null;
    if (res.ok && data?.mfaRequired && data.challenge) {
      setChallenge(data.challenge);
      setBusy(false);
      return;
    }
    if (res.ok) {
      router.push("/admin");
      router.refresh();
      return;
    }
    setError(loginErrors[data?.error ?? ""] ?? fallbackError);
    setBusy(false);
  }

  async function handleMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !challenge) return;
    setBusy(true);
    setError(undefined);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge, code: form.get("code") }),
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(mfaErrors[data?.error ?? ""] ?? fallbackError);
    setBusy(false);
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        email: form.get("email") || undefined,
        password: form.get("password"),
        displayName: form.get("displayName"),
        code: String(form.get("code") ?? "")
          .trim()
          .toUpperCase(),
      }),
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(registerErrors[data?.error ?? ""] ?? fallbackError);
    setBusy(false);
  }

  async function handleResetRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setResetNotice(undefined);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: form.get("identifier") }),
    });
    const data = (await res.json().catch(() => null)) as { delivery?: "none" | "email" } | null;
    setBusy(false);
    if (res.ok && data?.delivery === "email") {
      setResetNotice(t.authResetNoticeEmailSent);
      setResetStep("complete");
    } else {
      setResetNotice(t.authResetNoticeManual);
    }
  }

  async function handleResetComplete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setResetNotice(undefined);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/reset-password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: form.get("token"),
        password: form.get("password"),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setResetNotice(t.authResetDone);
      setTab("login");
      setResetStep("request");
    } else {
      setError(t.authResetInvalid);
    }
  }

  return (
    <main
      dir={locale === "fa" ? "rtl" : "ltr"}
      className="flex min-h-dvh bg-background"
    >
      {/* 60% picture panel — desktop-only artwork; hidden on small screens */}
      <div className="relative hidden w-[60%] shrink-0 overflow-hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero/hero-v2-pc.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-black/15"
        />
        <div className="absolute inset-x-0 bottom-0 px-10 py-9">
          <div className="flex items-center gap-2.5">
            <Scribo className="h-7 w-7 text-white" />
            <span className="font-serif text-3xl font-medium tracking-tight text-white">{t.brand}</span>
          </div>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/85">{t.authTagline}</p>
        </div>
      </div>

      {/* 40% form panel */}
      <div className="flex w-full flex-1 flex-col items-center justify-center px-6 py-16 lg:w-[40%]">
        <div className="flex w-full max-w-sm flex-col items-stretch gap-8">
          <div className="flex flex-col items-center gap-4 text-center lg:hidden">
            <Scribo className="h-12 w-12 text-foreground" />
            <h1 className="font-serif text-3xl font-medium tracking-tight">{t.brand}</h1>
            <p className="text-sm text-muted">{t.authTagline}</p>
          </div>

        <div
          role="tablist"
          aria-label={t.authTablistAria}
          className="grid grid-cols-2 gap-1 rounded-lg border border-border-subtle bg-surface p-1"
        >
          {(["login", "register"] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={tab === tabKey}
              onClick={() => {
                setTab(tabKey);
                setResetView(false);
                setError(undefined);
              }}
              className={cn(
                "h-9 rounded-md text-sm font-medium transition-colors",
                tab === tabKey
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {tabKey === "login" ? t.authTabLogin : t.authTabRegister}
            </button>
          ))}
        </div>

        {tab === "login" ? (
          challenge ? (
            <form className="flex flex-col gap-4" onSubmit={handleMfa}>
              <p className="text-sm text-muted">{t.authMfaIntro}</p>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-muted">{t.authMfaCodeLabel}</span>
                <input
                  name="code"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  className={INPUT_CLASS}
                  placeholder="6-digit"
                />
              </label>
              <button type="submit" disabled={busy} className={SUBMIT_CLASS}>
                {busy && <CircleNotch size={16} className="animate-spin" aria-hidden="true" />}
                {t.authMfaSubmit}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallenge(null);
                  setError(undefined);
                }}
                className="text-center text-xs text-muted underline-offset-4 hover:underline"
              >
                {t.authMfaBack}
              </button>
              {error && <p className="text-center text-xs text-muted">{error}</p>}
            </form>
          ) : resetView ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                {resetStep === "request"
                  ? t.authResetRequestHint
                  : t.authResetCompleteHint}
              </p>
              {resetStep === "request" ? (
                <form className="flex flex-col gap-4" onSubmit={handleResetRequest}>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-muted">{t.authResetIdentifierLabel}</span>
                    <input name="identifier" required className={INPUT_CLASS} />
                  </label>
                  <button type="submit" disabled={busy} className={SUBMIT_CLASS}>
                    {busy && <CircleNotch size={16} className="animate-spin" aria-hidden="true" />}
                    {t.authResetRequestSubmit}
                  </button>
                </form>
              ) : (
                <form className="flex flex-col gap-4" onSubmit={handleResetComplete}>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-muted">{t.authResetCodeLabel}</span>
                    <input name="token" dir="ltr" required className={INPUT_CLASS} />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-muted">{t.authNewPasswordLabel}</span>
                    <input
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      className={INPUT_CLASS}
                    />
                  </label>
                  <button type="submit" disabled={busy} className={SUBMIT_CLASS}>
                    {busy && <CircleNotch size={16} className="animate-spin" aria-hidden="true" />}
                    {t.authResetSubmit}
                  </button>
                </form>
              )}
              {resetNotice && <p className="text-center text-xs text-muted">{resetNotice}</p>}
              {error && <p className="text-center text-xs text-muted">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setResetView(false);
                  setResetStep("request");
                  setError(undefined);
                  setResetNotice(undefined);
                }}
                className="text-center text-xs text-muted underline-offset-4 hover:underline"
              >
                {t.authResetBackToLogin}
              </button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleLogin}>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-muted">{t.authUsernameLabel}</span>
                <input name="username" autoComplete="username" required className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-muted">{t.authPasswordLabel}</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  className={INPUT_CLASS}
                />
              </label>
              <button type="submit" disabled={busy} className={SUBMIT_CLASS}>
                {busy && <CircleNotch size={16} className="animate-spin" aria-hidden="true" />}
                {t.authLoginSubmit}
              </button>
              <button
                type="button"
                onClick={() => setResetView(true)}
                className="text-center text-xs text-muted underline-offset-4 hover:underline"
              >
                {t.authForgotPassword}
              </button>
              {error && <p className="text-center text-xs text-muted">{error}</p>}
            </form>
          )
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleRegister}>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted">{t.authUsernameLabel}</span>
              <input name="username" autoComplete="username" required className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted">{t.authDisplayNameLabel}</span>
              <input name="displayName" required className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted">{t.authEmailOptionalLabel}</span>
              <input name="email" type="email" autoComplete="email" className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted">{t.authPasswordLabel}</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-muted">{t.authInviteCodeLabel}</span>
              <input
                name="code"
                dir="ltr"
                autoComplete="off"
                required
                className={INPUT_CLASS}
              />
            </label>
            <button type="submit" disabled={busy} className={SUBMIT_CLASS}>
              {busy && <CircleNotch size={16} className="animate-spin" aria-hidden="true" />}
              {t.authRegisterSubmit}
            </button>
            {error && <p className="text-center text-xs text-muted">{error}</p>}
          </form>
        )}

        <Link
          href="/"
          className="text-center text-xs text-muted underline-offset-4 hover:underline"
        >
          {t.authBackHome}
        </Link>
        </div>
      </div>
    </main>
  );
}

export default function AuthLoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
