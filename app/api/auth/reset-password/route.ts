import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/auth";
import { clientIp, checkLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const encoder = new TextEncoder();
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Request a password reset for a registered user by username or email.
 * Emails are only delivered when a RESEND_API_KEY secret is configured
 * (optional — Scribo deliberately avoids paid services). When no email
 * provider is configured we do NOT return a token; the super admin can always
 * set a user's password directly from the admin panel. Always returns OK to
 * avoid leaking which usernames/emails exist.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    identifier?: string;
  } | null;
  const identifier = body?.identifier?.trim().toLowerCase();
  if (!identifier) return NextResponse.json({ error: "missing_identifier" }, { status: 400 });

  // Per-IP limiter: an attacker with the RESEND key set could otherwise spam
  // a victim's inbox. Always answers OK; when blocked we silently skip the
  // delivery so the endpoint still leaks nothing.
  const limit = await checkLimit({
    key: `reset_req_${await sha256Hex(clientIp(request))}`,
    max: 5,
    windowMs: 60 * 60 * 1000, // 5 per hour per IP
    lockout: [15, 60, 6 * 60].map((m) => m * 60 * 1000),
  });
  if (!limit.ok) return NextResponse.json({ ok: true, delivery: "none" });

  const byUsername = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, identifier))
    .get();
  const byEmail = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, identifier))
    .get();
  const target = byUsername ?? byEmail;

  const resendKey = process.env.RESEND_API_KEY;
  if (!target?.email || !resendKey) {
    return NextResponse.json({ ok: true, delivery: "none" });
  }

  const tokenRaw = Array.from(crypto.getRandomValues(new Uint8Array(20)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const timestamp = now();
  await db().insert(schema.passwordResetCodes).values({
    id: newId(),
    userId: target.id,
    tokenHash: await sha256Hex(tokenRaw),
    expiresAt: timestamp + 60 * 60 * 1000, // 1 hour
    createdAt: timestamp,
  });

  // Best-effort delivery; failures are swallowed so the API still returns OK.
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Scribo <onboarding@resend.dev>",
        to: target.email,
        subject: "بازنشانی گذرواژهٔ اسکریبو",
        html: `<p>کد بازنشانی شما: <b>${tokenRaw}</b><br/>تا یک ساعت معتبر است.</p>`,
      }),
    });
  } catch {}

  return NextResponse.json({ ok: true, delivery: "email" });
}

/** Complete a reset: present the emailed code + a new password. */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    password?: string;
  } | null;
  const token = body?.token?.trim();
  const password = body?.password;
  if (!token || !password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  // Per-IP limiter on code redemption: a leaked reset code is brute-forced
  // faster when the endpoint accepts unlimited guesses.
  const limit = await checkLimit({
    key: `reset_use_${await sha256Hex(clientIp(request))}`,
    max: 30,
    windowMs: 15 * 60 * 1000,
    lockout: [2, 8, 30, 24 * 60].map((m) => m * 60 * 1000),
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  const code = await db()
    .select()
    .from(schema.passwordResetCodes)
    .where(eq(schema.passwordResetCodes.tokenHash, await sha256Hex(token)))
    .get();
  if (!code || code.usedAt || code.expiresAt < now()) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  await db()
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(schema.users.id, code.userId));
  await db()
    .update(schema.passwordResetCodes)
    .set({ usedAt: now() })
    .where(eq(schema.passwordResetCodes.id, code.id));
  await audit("auth.reset_complete", {
    actor: `user:${code.userId}`,
    detail: { via: "email_code" },
    request,
  });
  return NextResponse.json({ ok: true });
}