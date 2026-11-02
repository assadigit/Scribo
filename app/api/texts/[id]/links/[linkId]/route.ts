import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { shareUrl } from "@/lib/reader";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";
import { audit } from "@/lib/audit";


export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, linkId } = await params;
  const link = await db()
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.id, linkId))
    .get();
  if (!link || link.textId !== id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, link.textId)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    label?: string | null;
    greeting?: string | null;
    password?: string | null;
    status?: "active" | "revoked" | "consumed";
    autoApproveComments?: boolean;
    oneTime?: boolean;
    protectContent?: boolean;
    pinnedVersionId?: string | null;
  };

  // A consumed one-time link is burned forever — never resurrect it.
  if (link.status === "consumed" && body.status === "active") {
    return NextResponse.json({ error: "consumed_link" }, { status: 400 });
  }

  const values: Record<string, unknown> = {};
  if (body.label !== undefined) values.label = body.label?.trim() || null;
  if (body.greeting !== undefined) values.greeting = body.greeting?.trim() || null;
  if (body.status !== undefined) values.status = body.status;
  if (body.autoApproveComments !== undefined) values.autoApproveComments = body.autoApproveComments;
  if (body.oneTime !== undefined) values.oneTime = body.oneTime;
  if (body.protectContent !== undefined) values.protectContent = body.protectContent;
  if (body.pinnedVersionId !== undefined) values.pinnedVersionId = body.pinnedVersionId || null;

  // "" or null clears the password; otherwise hash the new one.
  if (body.password !== undefined) {
    const trimmed = body.password?.trim();
    values.passwordHash = trimmed ? await auth.hashPassword(trimmed) : null;
  }

  await db().update(schema.shareLinks).set(values).where(eq(schema.shareLinks.id, linkId));
  const updated = await db()
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.id, linkId))
    .get();

  await audit("link.update", {
    actor: account.kind === "admin" ? `admin:${account.admin.id}` : `user:${account.user.id}`,
    target: `text:${id}/link:${linkId}`,
    detail: { changed: Object.keys(values), label: link.label },
    request,
  });

  return NextResponse.json({
    link: {
      id: updated?.id,
      label: updated?.label,
      greeting: updated?.greeting,
      status: updated?.status,
      oneTime: updated?.oneTime,
      consumedAt: updated?.consumedAt,
      autoApproveComments: updated?.autoApproveComments,
      protectContent: updated?.protectContent,
      hasPassword: Boolean(updated?.passwordHash),
      url: updated?.token ? shareUrl(updated.token) : null,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, linkId } = await params;
  const link = await db()
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.id, linkId))
    .get();
  if (!link || link.textId !== id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, link.textId)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await db().delete(schema.shareLinks).where(eq(schema.shareLinks.id, linkId));
  await audit("link.delete", {
    actor: account.kind === "admin" ? `admin:${account.admin.id}` : `user:${account.user.id}`,
    target: `text:${id}/link:${linkId}`,
    detail: { label: link.label },
    request: _request,
  });
  return NextResponse.json({ ok: true });
}