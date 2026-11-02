import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import { sha256Hex } from "@/lib/reader";
import { clientIp, checkLimit, clearLimit, recordFailure, LOCKOUT_STAGES } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 10; // failed attempts per IP before slowing things down

/**
 * Invite-code registration for new writers. The super admin creates invite
 * codes; a valid unused code is required to open an account. On success the
 * new user is signed in immediately.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    email?: string;
    password?: string;
    displayName?: string;
    nickname?: string;
    code?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  // Per-IP windowed rate limit with an escalating lockout, shared via
  // lib/rate-limit — guards against invite-code brute force and username
  // enumeration.
  const rateKey = `reg_${await sha256Hex(clientIp(request))}`;
  const limit = await checkLimit({
    key: rateKey,
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

  const recordFail = () =>
    recordFailure({
      key: rateKey,
      max: RATE_MAX,
      windowMs: RATE_WINDOW_MS,
      lockout: LOCKOUT_STAGES,
    });

  const username = body.username?.trim();
  const password = body.password;
  // Invite codes are minted from an unambiguous uppercase alphabet; normalize
  // so lowercase input or copy-paste quirks can't produce false "invalid".
  const code = body.code?.trim().toUpperCase();
  if (!username || !password || !code) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();

  const invite = await db()
    .select()
    .from(schema.inviteCodes)
    .where(eq(schema.inviteCodes.code, code))
    .get();
  if (!invite || invite.usedBy || invite.usedAt) {
    await recordFail();
    return NextResponse.json({ error: "invalid_invite" }, { status: 403 });
  }
  if (invite.expiresAt && invite.expiresAt < now()) {
    await recordFail();
    return NextResponse.json({ error: "expired_invite" }, { status: 403 });
  }

  const id = newId();
  const timestamp = now();
  const displayName = body.displayName?.trim() || username;
  // Derive the hash before opening the transaction so the CPU-bound PBKDF2
  // (100k iterations) never holds the D1 write lock.
  const passwordHash = await auth.hashPassword(password);

  try {
    // Create the user and claim the invite inside one transaction. The user
    // row is inserted BEFORE the claim because D1 enforces foreign keys in
    // every transaction and `used_by` references users(id) — updating it to
    // a not-yet-existing id would fail the whole transaction. The claim is a
    // conditional UPDATE (only when still unused), so two simultaneous
    // registrations with the same code can't both win — the loser's throw
    // rolls the whole transaction back, including the user insert.
    await db().transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, username))
        .get();
      if (existing) throw Object.assign(new Error("username_taken"), { code: "username_taken" });
      if (email) {
        const emailTaken = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .get();
        if (emailTaken) throw Object.assign(new Error("email_taken"), { code: "email_taken" });
      }

      await tx.insert(schema.users).values({
        id,
        username,
        email: email || null,
        passwordHash,
        displayName,
        nickname: body.nickname?.trim() || null,
        bio: null,
        avatar: null,
        createdAt: timestamp,
      });

      const claim = await tx
        .update(schema.inviteCodes)
        .set({ usedBy: id, usedAt: timestamp })
        .where(and(eq(schema.inviteCodes.id, invite.id), isNull(schema.inviteCodes.usedBy)))
        .run();
      if (claim.meta.changes === 0) {
        throw Object.assign(new Error("invalid_invite"), { code: "invalid_invite" });
      }
    });
  } catch (err) {
    const code =
      err instanceof Error && "code" in err
        ? (err as Error & { code?: string }).code
        : "";
    if (code === "username_taken" || code === "email_taken") {
      await recordFail();
      return NextResponse.json({ error: code }, { status: 409 });
    }
    if (code === "invalid_invite") {
      await recordFail();
      return NextResponse.json({ error: "invalid_invite" }, { status: 403 });
    }
    // Unique-constraint race (username/email) or any other failure — rollback
    // already released the invite claim.
    await recordFail();
    return NextResponse.json({ error: "registration_failed" }, { status: 500 });
  }

  // Best-effort housekeeping after the user + session are committed: a
  // failure here must not turn a successful registration into a raw 500
  // (the client would report a vague error while the user already exists).
  try {
    await clearLimit(rateKey); // success resets
    await audit("auth.register", {
      actor: `user:${id}`,
      detail: { username, email: email ?? null, displayName },
      request,
    });
  } catch {
    // Non-fatal; the account is already created.
  }

  const session = await auth.createUserSession(id);
  return auth.attachSessionCookie(NextResponse.json({ ok: true }, { status: 201 }), session);
}