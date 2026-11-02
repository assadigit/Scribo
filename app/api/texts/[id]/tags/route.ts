import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";

function tagIsVisible(tag: typeof schema.tags.$inferSelect, account: Awaited<ReturnType<typeof auth.getCurrentAccount>>): boolean {
  if (!account) return false;
  // Admin owns site-wide tags (owner_id NULL); users own their own tags.
  if (account.kind === "admin") return tag.ownerId === null;
  return tag.ownerId === account.user.id;
}

/** Assign a tag (by id) to this text. Requires write access + visible tag. */
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

  const body = (await request.json().catch(() => null)) as { tagId?: string } | null;
  if (!body?.tagId) return NextResponse.json({ error: "tag_required" }, { status: 400 });

  const tag = await db().select().from(schema.tags).where(eq(schema.tags.id, body.tagId)).get();
  if (!tag || !tagIsVisible(tag, account)) {
    return NextResponse.json({ error: "tag_not_found" }, { status: 404 });
  }

  const existing = await db()
    .select()
    .from(schema.textTags)
    .where(and(eq(schema.textTags.textId, id), eq(schema.textTags.tagId, body.tagId)))
    .get();
  if (!existing) {
    await db().insert(schema.textTags).values({ textId: id, tagId: body.tagId });
  }
  return NextResponse.json({ ok: true });
}

/** Remove a tag from this text. */
export async function DELETE(
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

  const body = (await request.json().catch(() => null)) as { tagId?: string } | null;
  if (!body?.tagId) return NextResponse.json({ error: "tag_required" }, { status: 400 });

  await db()
    .delete(schema.textTags)
    .where(and(eq(schema.textTags.textId, id), eq(schema.textTags.tagId, body.tagId)));
  return NextResponse.json({ ok: true });
}