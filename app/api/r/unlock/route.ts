import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import {
  ONE_TIME_GRACE_SECONDS,
  consumeOneTimeLink,
  findLinkByToken,
  isLinkAccessible,
  readerCookieName,
  readerCookieValue,
} from "@/lib/reader";
import { checkLimit, clearLimit, recordAttempt } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX_ATTEMPTS = 10;
const UNLOCK_DAYS = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    password?: string;
  } | null;
  const token = body?.token?.trim();
  const password = body?.password;

  if (!token || !password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const link = await findLinkByToken(token);
  if (!link || !isLinkAccessible(link) || !link.passwordHash) {
    return NextResponse.json({ error: "link_unavailable" }, { status: 404 });
  }

  // Simple D1-backed rate limit per link: N attempts per 15 min window.
  const attemptKey = `attempt_${link.tokenHash}`;
  const limit = await checkLimit({
    key: attemptKey,
    max: RATE_MAX_ATTEMPTS,
    windowMs: RATE_WINDOW_MS,
  });
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const ok = await auth.verifyPassword(password, link.passwordHash);
  await recordAttempt({ key: attemptKey, max: RATE_MAX_ATTEMPTS, windowMs: RATE_WINDOW_MS });

  if (!ok) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  // Successful unlock → clear the counter and set the reader cookie.
  await clearLimit(attemptKey);
  await audit("reader.unlock", {
    actor: "reader",
    target: `link:${link.id}(text:${link.textId})`,
    detail: { oneTime: Boolean(link.oneTime) },
    request,
  });
  await db()
    .update(schema.shareLinks)
    .set({ lastUsedAt: now() })
    .where(eq(schema.shareLinks.id, link.id));

  // A one-time link is burned the moment the correct password is presented:
  // status flips to "consumed" and this browser alone gets a grace cookie to
  // finish the text; nobody else can ever enter it again.
  const oneTimeConsumed = link.oneTime ? await consumeOneTimeLink(link) : false;

  // Attach the unlock proof to the response. Mutating `cookies()` is a no-op
  // in Route Handlers on this OpenNext deployment (same bug that broke login),
  // so the cookie is set on the NextResponse explicitly.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    readerCookieName(link.id),
    await readerCookieValue(token, link.passwordHash, oneTimeConsumed ? "consumed" : link.status),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      // The unlock proof must also reach /api/r/* (session tracker) which
      // lives outside /r, so the cookie is scoped to the whole domain.
      path: "/",
      maxAge: oneTimeConsumed ? ONE_TIME_GRACE_SECONDS : UNLOCK_DAYS * 24 * 60 * 60,
    },
  );
  return res;
}
