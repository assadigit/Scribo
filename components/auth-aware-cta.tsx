"use client";

import Link from "next/link";
import { useHeaderAuth } from "@/lib/header-auth";
import { useI18n } from "@/components/providers";
import { cn } from "@/lib/utils";

/**
 * Landing CTA (hero + final section): shows "dashboard" when a session
 * exists, "sign in" otherwise. Rendered client-side so the landing page
 * can be statically generated without a per-request session read.
 */
export function AuthAwareCta({ className }: { className?: string }) {
  const { t } = useI18n();
  const state = useHeaderAuth();
  const signedIn = state.status === "ready" && !state.showAuth;
  const href = signedIn ? "/admin" : "/auth/login";
  const label = signedIn ? t.hdrDashboard : t.landingSignIn;

  return (
    <Link
      href={href}
      className={cn(
        "landing-ui inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent px-8 text-base font-medium text-accent-foreground transition-transform active:scale-[0.98]",
        className,
      )}
    >
      {label}
    </Link>
  );
}