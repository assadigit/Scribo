import { NextResponse } from "next/server";
import {
  createPkce,
  googleAuthorizeUrl,
  googleConfigured,
  randomBase64Url,
} from "@/lib/google-oauth";

/**
 * Start Google login: build the authorization URL, stash the PKCE verifier +
 * state + nonce in a short-lived HttpOnly cookie, then redirect to Google.
 *
 * The cookie holds the flow secret because the Worker has no stable session
 * store — the callback reads it back and consumes it, then clears it.
 */
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "go_oauth";
const OAUTH_TTL_S = 10 * 60; // 10 minutes to complete the round-trip

export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.json({ error: "google_not_configured" }, { status: 503 });
  }

  const { verifier, challenge } = await createPkce();
  const state = randomBase64Url();
  const nonce = randomBase64Url();

  const res = NextResponse.redirect(googleAuthorizeUrl({ state, codeChallenge: challenge, nonce }));
  res.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ state, verifier, nonce }),
    { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: OAUTH_TTL_S },
  );
  return res;
}
