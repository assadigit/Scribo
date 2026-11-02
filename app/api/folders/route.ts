import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";

/** Folders of the current account: users own via ownerId, the super admin
 *  via adminId (its personal tree). Whole tree — nesting is client-side. */
export async function GET() {
  const account = await auth.getCurrentAccount();
  if (!account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db()
    .select()
    .from(schema.folders)
    .where(
      account.kind === "admin"
        ? eq(schema.folders.adminId, account.admin.id)
        : eq(schema.folders.ownerId, account.user.id),
    )
    .orderBy(asc(schema.folders.position));
  return NextResponse.json({ folders: rows });
}

/** Create a folder for the current account (optionally inside a parent). */
export async function POST(request: Request) {
  const account = await auth.getCurrentAccount();
  if (!account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    parentId?: string | null;
  } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const timestamp = now();
  let parentId: string | null = null;
  if (body?.parentId) {
    const parent = await db()
      .select()
      .from(schema.folders)
      .where(eq(schema.folders.id, body.parentId))
      .get();
    const sameOwner =
      parent &&
      (account.kind === "admin"
        ? parent.adminId === account.admin.id
        : parent.ownerId === account.user.id);
    if (!sameOwner) {
      return NextResponse.json({ error: "parent_not_found" }, { status: 400 });
    }
    parentId = parent.id;
  }

  const count = await db()
    .select({ value: schema.folders.position })
    .from(schema.folders)
    .where(
      account.kind === "admin"
        ? eq(schema.folders.adminId, account.admin.id)
        : eq(schema.folders.ownerId, account.user.id),
    );
  const id = newId();
  await db().insert(schema.folders).values({
    id,
    ownerId: account.kind === "admin" ? null : account.user.id,
    adminId: account.kind === "admin" ? account.admin.id : null,
    name,
    parentId,
    position: count.length,
    createdAt: timestamp,
  });

  const folder = await db().select().from(schema.folders).where(eq(schema.folders.id, id)).get();
  return NextResponse.json({ folder }, { status: 201 });
}