import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";

type CommentStatus = "pending" | "approved" | "rejected";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const comment = await db()
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, id))
    .get();
  if (!comment) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const text = await db()
    .select()
    .from(schema.texts)
    .where(eq(schema.texts.id, comment.textId))
    .get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { status?: CommentStatus };
  if (!["pending", "approved", "rejected"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  await db()
    .update(schema.comments)
    .set({ status: body.status, moderatedAt: body.status === "pending" ? null : now() })
    .where(eq(schema.comments.id, id));

  const updated = await db().select().from(schema.comments).where(eq(schema.comments.id, id)).get();
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    comment: {
      id: updated.id,
      status: updated.status,
      moderatedAt: updated.moderatedAt,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const comment = await db()
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, id))
    .get();
  if (!comment) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const text = await db()
    .select()
    .from(schema.texts)
    .where(eq(schema.texts.id, comment.textId))
    .get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await db().delete(schema.comments).where(eq(schema.comments.id, id));
  return NextResponse.json({ ok: true });
}