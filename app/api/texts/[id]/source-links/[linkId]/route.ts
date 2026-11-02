import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";
import { audit } from "@/lib/audit";

const URL_MAX = 2048;
const TITLE_MAX = 200;

function isSafeSourceUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && value.length <= URL_MAX;
}

async function getOwnedLink(textId: string, linkId: string) {
  return db()
    .select()
    .from(schema.textLinks)
    .where(and(eq(schema.textLinks.id, linkId), eq(schema.textLinks.textId, textId)))
    .get();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, linkId } = await params;
  const body = (await request.json().catch(() => null)) as { url?: string; title?: string } | null;

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await getOwnedLink(id, linkId);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const values: { url?: string; title?: string | null } = {};
  if (body?.url !== undefined) {
    const url = body.url.trim();
    if (!isSafeSourceUrl(url)) {
      return NextResponse.json({ error: "invalid_url" }, { status: 400 });
    }
    values.url = url;
  }
  if (body?.title !== undefined) {
    values.title = body.title.trim().slice(0, TITLE_MAX) || null;
  }

  await db().update(schema.textLinks).set(values).where(eq(schema.textLinks.id, linkId));
  const updated = await getOwnedLink(id, linkId);
  return NextResponse.json({ link: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, linkId } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await getOwnedLink(id, linkId);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await db().delete(schema.textLinks).where(eq(schema.textLinks.id, linkId));
  await audit("source_link.delete", {
    actor: account.kind === "admin" ? `admin:${account.admin.id}` : `user:${account.user.id}`,
    target: `text:${id}/link:${linkId}`,
    detail: { url: existing.url },
    request: _request,
  });
  return NextResponse.json({ ok: true });
}
