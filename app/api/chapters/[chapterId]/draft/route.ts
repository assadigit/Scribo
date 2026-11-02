import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";


/**
 * Save (or clear) the working draft for a chapter. Body:
 *   { title?: string, bodyJson?: string, clear?: boolean }
 * `clear: true` deletes the draft row entirely.
 *
 * The upsert (`INSERT … ON CONFLICT(chapter_id) DO UPDATE`) removes the
 * read-then-insert race, so two concurrent auto-saves can never both fail on
 * the primary key.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await db()
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .get();
  if (!chapter) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, chapter.textId)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    bodyJson?: string;
    clear?: boolean;
  };

  if (body.clear) {
    await db().delete(schema.drafts).where(eq(schema.drafts.chapterId, chapterId));
    return NextResponse.json({ ok: true });
  }

  if (body.title === undefined && body.bodyJson === undefined) {
    return NextResponse.json({ error: "nothing_to_save" }, { status: 400 });
  }

  const updatedAt = now();
  await db()
    .insert(schema.drafts)
    .values({
      chapterId,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.bodyJson !== undefined ? { bodyJson: body.bodyJson } : {}),
      updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.drafts.chapterId,
      set: {
        // Fields the client didn't send keep their stored value.
        title:
          body.title !== undefined ? body.title : sql`${schema.drafts.title}`,
        bodyJson:
          body.bodyJson !== undefined ? body.bodyJson : sql`${schema.drafts.bodyJson}`,
        updatedAt,
      },
    });

  const draft = await db()
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.chapterId, chapterId))
    .get();

  return NextResponse.json({ draft });
}