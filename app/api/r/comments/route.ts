import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  findLinkByToken,
  isLinkViewable,
  readerCookiePresent,
  sha256Hex,
} from "@/lib/reader";
import { checkLimit, recordAttempt } from "@/lib/rate-limit";

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX = 6; // comments per window per link
const BODY_MAX = 4000;
const NAME_MAX = 60;
const EMAIL_MAX = 200;

/**
 * Reader comment submission for a chapter's current version.
 * Body: { token, chapterId, name, email?, body, website? (honeypot) }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    chapterId?: string;
    name?: string;
    email?: string;
    body?: string;
    website?: string; // honeypot — bots fill this, humans never see it
  } | null;

  const token = body?.token?.trim();
  const chapterId = body?.chapterId?.trim();
  const name = body?.name?.trim();
  const email = body?.email?.trim();
  const commentBody = body?.body?.trim();

  if (!token || !chapterId) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const link = await findLinkByToken(token);
  if (!link || !(await isLinkViewable(link, token))) {
    return NextResponse.json({ error: "link_unavailable" }, { status: 404 });
  }

  // Must have passed the link's password (if any) in this browser.
  if (!(await readerCookiePresent(link, token))) {
    return NextResponse.json({ error: "locked" }, { status: 403 });
  }

  // Honeypot: pretend success so bots don't learn they were caught.
  if (body?.website) return NextResponse.json({ ok: true, status: "pending" });

  if (!name || name.length > NAME_MAX) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (!commentBody || commentBody.length > BODY_MAX) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (email) {
    if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
  }

  const chapter = await db()
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .get();
  if (!chapter || chapter.textId !== link.textId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const version = await db()
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.chapterId, chapterId), eq(schema.versions.isCurrent, true)))
    .get();
  if (!version) return NextResponse.json({ error: "not_published" }, { status: 404 });

  // Per-link rate limit, shared via lib/rate-limit (same pattern as likes/unlock).
  const rateKey = `comment_${link.tokenHash}`;
  const limit = await checkLimit({ key: rateKey, max: RATE_MAX, windowMs: RATE_WINDOW_MS });
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  await recordAttempt({ key: rateKey, max: RATE_MAX, windowMs: RATE_WINDOW_MS });

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  const ipHash = ip ? await sha256Hex(ip) : null;
  const approved = link.autoApproveComments;

  const id = newId();
  await db().insert(schema.comments).values({
    id,
    versionId: version.id,
    textId: link.textId,
    shareLinkId: link.id,
    authorName: name,
    authorEmail: email || null,
    body: commentBody,
    status: approved ? "approved" : "pending",
    ipHash,
    createdAt: now(),
  });

  return NextResponse.json(
    { ok: true, status: approved ? "approved" : "pending" },
    { status: 201 },
  );
}