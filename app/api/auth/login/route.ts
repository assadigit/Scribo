import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { sha256Hex } from "@/lib/reader";
import { clientIp, checkLimit, clearLimit, recordFailure, LOCKOUT_STAGES } from "@/lib/rate-limit";
import { createMfaChallenge, getAdminMfa } from "@/lib/mfa";
import { audit } from "@/lib/audit";

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 8; // failed attempts per username+IP before we slow things down

/** Try the admins table first, then the registered users table. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // D1-backed windowed rate limit per (username, IP) with an escalating
  // lockout, shared via lib/rate-limit. Prevents brute-force in both the
  // admin and registered-user login paths.
  const key = `login_${encodeURIComponent(username)}_${await sha256Hex(clientIp(request))}`;
  const limit = await checkLimit({
    key,
    max: RATE_MAX,
    windowMs: RATE_WINDOW_MS,
    lockout: LOCKOUT_STAGES,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  const fail = () =>
    recordFailure({
      key,
      max: RATE_MAX,
      windowMs: RATE_WINDOW_MS,
      lockout: LOCKOUT_STAGES,
    });

  // Super admin. When MFA is enabled we don't issue a session yet — we return
  // a short-lived challenge that must be completed with a TOTP code first.
  const admin = await db()
    .select()
    .from(schema.admins)
    .where(eq(schema.admins.username, username))
    .get();
  if (admin && (await auth.verifyPassword(password, admin.passwordHash))) {
    await clearLimit(key); // success resets
    const mfa = await getAdminMfa(admin.id);
    if (mfa?.enabled) {
      const challenge = await createMfaChallenge(admin.id);
      await audit("auth.login_stage1", {
        actor: `admin:${admin.id}`,
        detail: { username },
        request,
      });
      return NextResponse.json({ ok: true, mfaRequired: true, challenge, role: "admin" });
    }
    const session = await auth.createAdminSession(admin.id);
    await audit("auth.login", {
      actor: `admin:${admin.id}`,
      detail: { username },
      request,
    });
    return auth.attachSessionCookie(NextResponse.json({ ok: true, role: "admin" }), session);
  }

  // Registered writer.
  const user = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get();
  if (user && (await auth.verifyPassword(password, user.passwordHash))) {
    await clearLimit(key); // success resets
    const session = await auth.createUserSession(user.id);
    await audit("auth.login", {
      actor: `user:${user.id}`,
      detail: { username },
      request,
    });
    return auth.attachSessionCookie(NextResponse.json({ ok: true, role: "user" }), session);
  }

  await fail();
  return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
}