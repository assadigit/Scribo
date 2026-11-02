import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import {
  allowedGoogleEmails,
  exchangeCode,
  googleConfigured,
  verifyGoogleIdToken,
} from "@/lib/google-oauth";
import { createMfaChallenge, getAdminMfa } from "@/lib/mfa";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/reader";

/**
 * Google OAuth callback: exchange the code, verify the ID token, then link
 * the verified email to an existing account and mint the standard
 * `scribo_session` cookie (existing writers by `users.email`; an allowlisted
 * email maps to the single super admin). No accounts are auto-created.
 *
 * The state cookie is always consumed (cleared) so the flow can't be
 * replayed, and the PKCE verifier + state match are required before any
 * token exchange happens (CSRF-safe on a stateless edge).
 */
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "go_oauth";
const OAUTH_COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const toLogin = () => {
    const res = NextResponse.redirect(`${appUrl()}/auth/login`);
    res.cookies.set(OAUTH_COOKIE, "", { ...OAUTH_COOKIE_BASE, maxAge: 0 });
    return res;
  };

  if (!googleConfigured() || !code || !state) return toLogin();

  const cookieStore = await cookies();
  const oauthRaw = cookieStore.get(OAUTH_COOKIE)?.value;
  let oauth: { state?: string; verifier?: string; nonce?: string } | null = null;
  try {
    const parsed = oauthRaw
      ? (JSON.parse(oauthRaw) as { state?: string; verifier?: string; nonce?: string })
      : null;
    oauth = parsed;
  } catch {
    oauth = null;
  }
  if (!oauth || oauth.state !== state || !oauth.verifier) return toLogin();

  const exchanged = await exchangeCode(code, oauth.verifier);
  if (!exchanged) return toLogin();

  const profile = await verifyGoogleIdToken(exchanged.idToken);
  if (!profile) return toLogin();

  // 1 — a registered writer whose stored email matches the verified email.
  const user = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, profile.email))
    .get();
  if (user) {
    if (user.googleSub !== profile.sub) {
      await db()
        .update(schema.users)
        .set({ googleSub: profile.sub })
        .where(eq(schema.users.id, user.id));
    }
    await audit("auth.google_login", {
      actor: `user:${user.id}`,
      detail: { email: profile.email },
      request,
    });
    const session = await auth.createUserSession(user.id);
    const res = NextResponse.redirect(`${appUrl()}/admin`);
    res.cookies.set(OAUTH_COOKIE, "", { ...OAUTH_COOKIE_BASE, maxAge: 0 });
    auth.attachSessionCookie(res, session);
    return res;
  }

  // 2 — an allowlisted email signs in as the single super admin (no account
  // is ever created, so this branch is the only way "your own email" gets in).
  if (allowedGoogleEmails().has(profile.email)) {
    const admin = await db().select().from(schema.admins).get();
    if (admin) {
      if (admin.googleSub !== profile.sub) {
        await db()
          .update(schema.admins)
          .set({ googleSub: profile.sub })
          .where(eq(schema.admins.id, admin.id));
      }
      await audit("auth.google_login", {
        actor: `admin:${admin.id}`,
        detail: { email: profile.email },
        request,
      });
      const mfa = await getAdminMfa(admin.id);
      if (mfa?.enabled) {
        const challenge = await createMfaChallenge(admin.id);
        const res = NextResponse.redirect(
          `${appUrl()}/auth/login?tab=mfa&challenge=${encodeURIComponent(challenge)}`,
        );
        res.cookies.set(OAUTH_COOKIE, "", { ...OAUTH_COOKIE_BASE, maxAge: 0 });
        return res;
      }
      const session = await auth.createAdminSession(admin.id);
      const res = NextResponse.redirect(`${appUrl()}/admin`);
      res.cookies.set(OAUTH_COOKIE, "", { ...OAUTH_COOKIE_BASE, maxAge: 0 });
      auth.attachSessionCookie(res, session);
      return res;
    }
  }

  return toLogin();
}
