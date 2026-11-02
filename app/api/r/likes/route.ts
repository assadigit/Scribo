import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  READER_ID_COOKIE,
  findLinkByToken,
  isLinkViewable,
  readerCookiePresent,
} from "@/lib/reader";
import { checkLimit, recordAttempt } from "@/lib/rate-limit";

const READER_ID_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX = 30; // like toggles per window per link
const NAME_MAX = 60;

/** Newest named likers, newest first (LinkedIn-style avatar stack). */
async function getLikers(textId: string, limit = 8) {
  const rows = await db()
    .select({ name: schema.likes.authorName })
    .from(schema.likes)
    .where(and(eq(schema.likes.textId, textId), sql`${schema.likes.authorName} != ''`))
    .orderBy(desc(schema.likes.createdAt))
    .limit(limit)
    .all();
  return rows.map((r) => r.name);
}

/**
 * Toggle a reader's like on a text. Body: { token, textId, name? }.
 * One like per anonymous browser (frv cookie) per text — the unique index
 * enforces it even under races. A light per-link rate limit keeps a
 * cookie-churning client from inflating the count.
 *
 * The optional `name` is attached to the like (or updates an existing one)
 * so the author sees who liked; empty name stays anonymous.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    textId?: string;
    name?: string;
  } | null;

  const token = body?.token?.trim();
  const textId = body?.textId?.trim();
  const name = body?.name?.trim() ?? "";
  if (!token || !textId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (name.length > NAME_MAX) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const link = await findLinkByToken(token);
  if (!link || !(await isLinkViewable(link, token))) {
    return NextResponse.json({ error: "link_unavailable" }, { status: 404 });
  }

  // Must have passed the link's password (if any) in this browser.
  if (!(await readerCookiePresent(link, token))) {
    return NextResponse.json({ error: "locked" }, { status: 403 });
  }

  if (link.textId !== textId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Per-link rate limit, shared via lib/rate-limit (same pattern as comments/unlock).
  const rateKey = `like_${link.tokenHash}`;
  const limit = await checkLimit({ key: rateKey, max: RATE_MAX, windowMs: RATE_WINDOW_MS });
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  await recordAttempt({ key: rateKey, max: RATE_MAX, windowMs: RATE_WINDOW_MS });

  // Anonymous reader identity — minted on first like and remembered for a
  // year in this browser.
  const cookieStore = await cookies();
  let readerId = cookieStore.get(READER_ID_COOKIE)?.value ?? null;
  let freshId = false;
  if (!readerId) {
    readerId = newId();
    freshId = true;
  }

  const existing = await db()
    .select({ id: schema.likes.id })
    .from(schema.likes)
    .where(and(eq(schema.likes.textId, textId), eq(schema.likes.readerId, readerId)))
    .get();

  let liked: boolean;
  if (existing) {
    // Unlike, or update the name on an already-liked text.
    if (name) {
      await db()
        .update(schema.likes)
        .set({ authorName: name })
        .where(eq(schema.likes.id, existing.id));
      liked = true;
    } else {
      await db().delete(schema.likes).where(eq(schema.likes.id, existing.id));
      liked = false;
    }
  } else {
    await db().insert(schema.likes).values({
      id: newId(),
      textId,
      shareLinkId: link.id,
      readerId,
      authorName: name,
      createdAt: now(),
    });
    liked = true;
  }

  const countRow = await db()
    .select({ count: sql<number>`count(*)` })
    .from(schema.likes)
    .where(eq(schema.likes.textId, textId))
    .get();
  const likers = await getLikers(textId);

  // Set the identity cookie on the response — mutating `cookies()` is a no-op
  // in Route Handlers on this OpenNext deployment (see unlock route).
  const res = NextResponse.json({ ok: true, liked, count: countRow?.count ?? 0, myName: name, likers });
  if (freshId) {
    res.cookies.set(READER_ID_COOKIE, readerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: READER_ID_MAX_AGE,
    });
  }
  return res;
}