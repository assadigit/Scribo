import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import { getTextAccess } from "@/lib/access";


export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const timestamp = now();

  const nextRow = await db()
    .select({ max: sql<number>`COALESCE(MAX(${schema.chapters.position}), -1)` })
    .from(schema.chapters)
    .where(eq(schema.chapters.textId, id))
    .get();
  const position = (nextRow?.max ?? -1) + 1;

  const chapterId = newId();
  await db().insert(schema.chapters).values({
    id: chapterId,
    textId: id,
    position,
    title: body?.title?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db()
    .update(schema.texts)
    .set({ updatedAt: timestamp })
    .where(eq(schema.texts.id, id));

  const chapter = await db()
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .get();

  return NextResponse.json({ chapter }, { status: 201 });
}