import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import { getTextAccess } from "@/lib/access";


/**
 * Publish a new version of a chapter. Body: { title?, bodyJson, note? }
 * The version number is the next one after the latest published version,
 * that version becomes `is_current`, and the working draft is cleared.
 *
 * The insert + current-flag flip run in one transaction so two concurrent
 * publishes can never leave two rows marked current or both claim the same
 * version number. On a unique-constraint collision (the race where both
 * readers saw the same latest version) we retry exactly once against the new
 * latest row, then give up with a 409 instead of a 500.
 */
export async function POST(
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
    note?: string;
  };

  if (typeof body.bodyJson !== "string" || !body.bodyJson) {
    return NextResponse.json({ error: "body_required" }, { status: 400 });
  }

  let version: typeof schema.versions.$inferSelect | null = null;
  for (let attempt = 0; attempt < 2 && !version; attempt += 1) {
    const latest = await db()
      .select()
      .from(schema.versions)
      .where(eq(schema.versions.chapterId, chapterId))
      .orderBy(desc(schema.versions.number))
      .get();

    const number = (latest?.number ?? 0) + 1;
    const timestamp = now();
    const versionId = newId();

    try {
      await db().transaction(async (tx) => {
        await tx.insert(schema.versions).values({
          id: versionId,
          chapterId,
          number,
          title: body.title?.trim() || null,
          bodyJson: body.bodyJson as string,
          note: body.note?.trim() || null,
          isCurrent: true,
          createdAt: timestamp,
        });

        if (latest) {
          await tx
            .update(schema.versions)
            .set({ isCurrent: false })
            .where(eq(schema.versions.id, latest.id));
        }

        await tx
          .update(schema.chapters)
          .set({ updatedAt: timestamp })
          .where(eq(schema.chapters.id, chapterId));
        await tx.delete(schema.drafts).where(eq(schema.drafts.chapterId, chapterId));
      });

      version = (await db()
        .select()
        .from(schema.versions)
        .where(eq(schema.versions.id, versionId))
        .get()) ?? null;
    } catch {
      // Unique-constraint race on (chapter_id, number): the loop re-reads the
      // latest version and tries once more with the new number.
    }
  }

  if (!version) {
    return NextResponse.json({ error: "version_conflict" }, { status: 409 });
  }

  return NextResponse.json({ version }, { status: 201 });
}