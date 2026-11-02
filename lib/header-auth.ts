"use client";

import { useEffect, useState } from "react";

export type HeaderAuthState =
  | { status: "loading" }
  | {
      status: "ready";
      showAuth: boolean;
      profile: {
        href: string;
        name?: string;
        avatar?: string | null;
      } | null;
    };

/**
 * Signed-in state for statically-rendered public pages. The landing/About/
 * Contact pages no longer read the session cookie on the server (that would
 * force every request through the Worker), so the header and CTAs fetch it
 * here instead. Module-level cache: one fetch per page load, shared by the
 * header island and every CTA island.
 */
let cached: HeaderAuthState | null = null;
let inflight: Promise<HeaderAuthState> | null = null;

function fetchState(): Promise<HeaderAuthState> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/api/auth/session")
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as {
          showAuth?: boolean;
          profile?: { href?: string; name?: string; avatar?: string | null } | null;
        } | null;
        cached = {
          status: "ready",
          showAuth: body?.showAuth ?? true,
          profile: body?.profile
            ? {
                href: body.profile.href || "/admin",
                name: body.profile.name,
                avatar: body.profile.avatar,
              }
            : null,
        };
        return cached;
      })
      .catch(() => {
        // Session endpoint down: degrade to the anonymous public state.
        cached = { status: "ready", showAuth: true, profile: null };
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useHeaderAuth(): HeaderAuthState {
  const [state, setState] = useState<HeaderAuthState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    fetchState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}