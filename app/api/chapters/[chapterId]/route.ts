import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";


export async function GET(
  _request: Request,
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
  if (access === "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const versions = await db()
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.chapterId, chapterId))
    .orderBy(desc(schema.versions.number));

  const draft = await db()
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.chapterId, chapterId))
    .get();

  return NextResponse.json({ chapter, versions, draft: draft ?? null });
}