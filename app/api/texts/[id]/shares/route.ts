import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import { getTextAccess } from "@/lib/access";

/**
 * "Share with a specific writer" — lets the owner grant another registered
 * user read (or edit) access to this text from within their own panel.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access === "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db()
    .select({
      id: schema.textShares.id,
      userId: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      canEdit: schema.textShares.canEdit,
      createdAt: schema.textShares.createdAt,
    })
    .from(schema.textShares)
    .innerJoin(schema.users, eq(schema.textShares.userId, schema.users.id))
    .where(eq(schema.textShares.textId, id))
    .orderBy(desc(schema.textShares.createdAt));

  return NextResponse.json({ shares: rows });
}

/** Add a share by username. Only the owner (or admin) may do this. */
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

  const body = (await request.json().catch(() => null)) as {
    username?: string;
    canEdit?: boolean;
  } | null;
  const username = body?.username?.trim();
  if (!username) return NextResponse.json({ error: "username_required" }, { status: 400 });

  const target = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get();
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // A user cannot share a text with themselves (it is already theirs).
  if (account.kind === "user" && target.id === account.user.id) {
    return NextResponse.json({ error: "cannot_share_self" }, { status: 400 });
  }
  if (text.ownerId === target.id) {
    return NextResponse.json({ error: "already_owner" }, { status: 400 });
  }

  const existing = await db()
    .select()
    .from(schema.textShares)
    .where(and(eq(schema.textShares.textId, id), eq(schema.textShares.userId, target.id)))
    .get();
  if (existing) {
    // Just toggle the flag on an existing share.
    await db()
      .update(schema.textShares)
      .set({ canEdit: Boolean(body?.canEdit) })
      .where(eq(schema.textShares.id, existing.id));
    return NextResponse.json({ ok: true });
  }

  await db().insert(schema.textShares).values({
    id: newId(),
    textId: id,
    userId: target.id,
    canEdit: Boolean(body?.canEdit),
    createdAt: now(),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Remove a share by username. Owner (or admin) only. */
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

  const body = (await request.json().catch(() => null)) as { username?: string } | null;
  const username = body?.username?.trim();
  if (!username) return NextResponse.json({ error: "username_required" }, { status: 400 });

  const target = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get();
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  await db()
    .delete(schema.textShares)
    .where(and(eq(schema.textShares.textId, id), eq(schema.textShares.userId, target.id)));
  return NextResponse.json({ ok: true });
}