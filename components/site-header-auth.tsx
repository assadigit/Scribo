"use client";

import { SiteHeader } from "@/components/site-header";
import { useHeaderAuth } from "@/lib/header-auth";

/**
 * Header for statically-rendered public pages (landing, About, Contact):
 * anonymous visitors get the Login/Sign-up button, signed-in visitors the
 * avatar dropdown. When the session state has not arrived yet (first frames
 * after hydration) the header renders empty rather than flashing a button,
 * so the swap is invisible on a cache hit.
 */
export function SiteHeaderAuth() {
  const state = useHeaderAuth();
  if (state.status === "loading") return <SiteHeader showAuth={false} />;
  return (
    <SiteHeader
      showAuth={state.showAuth}
      profile={state.profile}
    />
  );
}