import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import {
  ONE_TIME_GRACE_SECONDS,
  consumeOneTimeLink,
  findLinkByToken,
  isLinkViewable,
  readerCookieName,
  readerCookiePresent,
  readerCookieValue,
} from "@/lib/reader";

type Action = "start" | "beat" | "end";

/**
 * Reader session tracker: the reader page sends start on load, a heartbeat
 * every ~30s, and end (via sendBeacon) when the page hides. Sessions power
 * the average-read-time and last-reader cards on the dashboard.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    chapterId?: string;
    sessionId?: string;
    action?: Action;
    durationMs?: number;
  } | null;

  const token = body?.token?.trim();
  const chapterId = body?.chapterId?.trim();
  const sessionId = body?.sessionId?.trim();
  const action = body?.action;

  if (!token || !chapterId || !sessionId || !action) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const link = await findLinkByToken(token);
  if (!link || !(await isLinkViewable(link, token))) {
    return NextResponse.json({ error: "link_unavailable" }, { status: 404 });
  }

  const unlocked = await readerCookiePresent(link, token);
  if (!unlocked) return NextResponse.json({ error: "locked" }, { status: 403 });

  // The chapter must belong to the text this link points at.
  const chapter = await db()
    .select()
    .from(schema.chapters)
    .where(and(eq(schema.chapters.id, chapterId), eq(schema.chapters.textId, link.textId)))
    .get();
  if (!chapter) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const timestamp = now();

  if (action === "start") {
    const existing = await db()
      .select()
      .from(schema.readSessions)
      .where(eq(schema.readSessions.id, sessionId))
      .get();
    if (!existing) {
      await db().insert(schema.readSessions).values({
        id: sessionId,
        shareLinkId: link.id,
        textId: link.textId,
        chapterId,
        readerLabel: link.label,
        startedAt: timestamp,
        lastSeenAt: timestamp,
        durationMs: 0,
        completed: false,
      });
    }

    // One-time links are burned by the first reader page that mounts: the
    // status flips to "consumed" and this browser receives the consumed
    // cookie (its value is derived from the link status too, so it can't be
    // forged or replayed elsewhere). Later starts on the same browser are
    // no-ops but re-arm the cookie, so multi-chapter texts keep working in
    // one sitting.
    const res = NextResponse.json({ ok: true });
    if (link.oneTime) {
      const consumed = await consumeOneTimeLink(link);
      if (consumed || link.status === "consumed") {
        res.cookies.set(
          readerCookieName(link.id),
          await readerCookieValue(token, link.passwordHash || "", "consumed"),
          {
            httpOnly: true,
            sameSite: "lax",
            secure: true,
            // Domain-wide so /api/r/session can read it too (it sits outside /r).
            path: "/",
            maxAge: ONE_TIME_GRACE_SECONDS,
          },
        );
      }
    }
    return res;
  }

  if (action === "beat" || action === "end") {
    const durationMs = Number.isFinite(body?.durationMs)
      ? Math.max(0, Math.round(body.durationMs as number))
      : 0;
    await db()
      .update(schema.readSessions)
      .set({
        lastSeenAt: timestamp,
        durationMs,
        completed: action === "end" ? true : undefined,
      })
      .where(
        and(
          eq(schema.readSessions.id, sessionId),
          eq(schema.readSessions.shareLinkId, link.id),
        ),
      );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}