import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";

/**
 * List comments for a text the account can access (all statuses, newest first).
 * Query param: ?textId=<id>
 */
export async function GET(request: Request) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const textId = new URL(request.url).searchParams.get("textId");
  if (!textId) return NextResponse.json({ error: "textId_required" }, { status: 400 });

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, textId)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access === "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db()
    .select({
      id: schema.comments.id,
      versionId: schema.comments.versionId,
      shareLinkId: schema.comments.shareLinkId,
      authorName: schema.comments.authorName,
      authorEmail: schema.comments.authorEmail,
      body: schema.comments.body,
      status: schema.comments.status,
      createdAt: schema.comments.createdAt,
      moderatedAt: schema.comments.moderatedAt,
      versionNumber: schema.versions.number,
      chapterTitle: schema.chapters.title,
      chapterId: schema.chapters.id,
    })
    .from(schema.comments)
    .innerJoin(schema.versions, eq(schema.comments.versionId, schema.versions.id))
    .innerJoin(schema.chapters, eq(schema.versions.chapterId, schema.chapters.id))
    .where(eq(schema.comments.textId, textId))
    .orderBy(desc(schema.comments.createdAt));

  return NextResponse.json({ comments: rows });
}