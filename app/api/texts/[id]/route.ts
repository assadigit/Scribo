import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";
import { audit } from "@/lib/audit";


export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access === "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const chapters = await db()
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.textId, id))
    .orderBy(asc(schema.chapters.position));

  const tagRows = await db()
    .select({
      tag: schema.tags,
    })
    .from(schema.textTags)
    .innerJoin(schema.tags, eq(schema.textTags.tagId, schema.tags.id))
    .where(eq(schema.textTags.textId, id));

  const links = await db()
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.textId, id));

  const sourceLinks = await db()
    .select()
    .from(schema.textLinks)
    .where(eq(schema.textLinks.textId, id))
    .orderBy(asc(schema.textLinks.position));

  return NextResponse.json({
    text,
    chapters,
    tags: tagRows.map((r) => r.tag),
    links,
    sourceLinks,
  });
}

const PATCHABLE = [
  "title",
  "subtitle",
  "authorNote",
  "status",
  "direction",
  "metaDescription",
  "folderId",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const existing = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, existing);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const values: Record<string, unknown> = { updatedAt: now() };
  for (const key of PATCHABLE) {
    if (body[key] !== undefined) {
      const v = body[key];
      values[key] = v === "" ? null : v;
    }
  }
  if (values.title === "") delete values.title;
  if (body.status === "published" && !existing.publishedAt) {
    values.publishedAt = now();
  }

  // A folder reference must belong to the account (may still be cleared to null).
  if (values.folderId !== undefined && values.folderId !== null) {
    const folderId = String(values.folderId);
    const folder = await db()
      .select()
      .from(schema.folders)
      .where(eq(schema.folders.id, folderId))
      .get();
    const sameOwner =
      folder &&
      (account.kind === "admin"
        ? folder.adminId === account.admin.id
        : folder.ownerId === account.user.id);
    if (!sameOwner) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
  }

  await db().update(schema.texts).set(values).where(eq(schema.texts.id, id));
  const updated = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  return NextResponse.json({ text: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await db().delete(schema.texts).where(eq(schema.texts.id, id));
  await audit("text.delete", {
    actor: account.kind === "admin" ? `admin:${account.admin.id}` : `user:${account.user.id}`,
    target: `text:${id}`,
    detail: { title: text.title },
    request: _request,
  });
  return NextResponse.json({ ok: true });
}
