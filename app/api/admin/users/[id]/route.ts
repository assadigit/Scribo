import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { audit } from "@/lib/audit";

/**
 * Admin-only per-user management. The admin can set a new password directly
 * (the no-email fallback for password resets) or delete a writer's account.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await auth.getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const user = await db().select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { password?: string } | null;
  const password = body?.password;
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  await db()
    .update(schema.users)
    .set({ passwordHash: await auth.hashPassword(password) })
    .where(eq(schema.users.id, id));
  await audit("user.password_reset", {
    actor: `admin:${admin.id}`,
    target: `user:${id}`,
    detail: { username: user.username },
    request,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await auth.getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const user = await db().select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Cascade removes their texts, folders, tags, sessions and shares.
  await db().delete(schema.users).where(eq(schema.users.id, id));
  await audit("user.delete", {
    actor: `admin:${admin.id}`,
    target: `user:${id}`,
    detail: { username: user.username, email: user.email },
    request: _request,
  });
  return NextResponse.json({ ok: true });
}