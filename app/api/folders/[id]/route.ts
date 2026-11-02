import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";

/** True when the folder belongs to the current account (user via ownerId,
 *  super admin via adminId). */
async function ownsFolder(
  account: { kind: "admin"; admin: { id: string } } | { kind: "user"; user: { id: string } },
  folder: { ownerId: string | null; adminId: string | null } | undefined,
): Promise<boolean> {
  if (!folder) return false;
  if (account.kind === "admin") return folder.adminId === account.admin.id;
  return folder.ownerId === account.user.id;
}

/** Rename a folder (or move it under another parent). Owner only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const folder = await db().select().from(schema.folders).where(eq(schema.folders.id, id)).get();
  if (!(await ownsFolder(account, folder))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    parentId?: string | null;
  };

  const values: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    values.name = body.name.trim();
  }
  if (body.parentId !== undefined) {
    if (body.parentId === null || body.parentId === "") {
      values.parentId = null;
    } else {
      const parent = await db()
        .select()
        .from(schema.folders)
        .where(eq(schema.folders.id, body.parentId))
        .get();
      if (!parent || !(await ownsFolder(account, parent)) || parent.id === (folder?.id ?? id)) {
        return NextResponse.json({ error: "parent_not_found" }, { status: 400 });
      }
      values.parentId = parent.id;
    }
  }
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  await db().update(schema.folders).set(values).where(eq(schema.folders.id, id));
  const updated = await db().select().from(schema.folders).where(eq(schema.folders.id, id)).get();
  return NextResponse.json({ folder: updated });
}

/** Delete a folder. Children folders move to the root; texts lose the folder. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const folder = await db().select().from(schema.folders).where(eq(schema.folders.id, id)).get();
  if (!(await ownsFolder(account, folder))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Cascade: subfolders go to root, texts become un-filed.
  await db()
    .update(schema.folders)
    .set({ parentId: null })
    .where(eq(schema.folders.parentId, id));
  await db().update(schema.texts).set({ folderId: null }).where(eq(schema.texts.folderId, id));
  await db().delete(schema.folders).where(eq(schema.folders.id, id));
  return NextResponse.json({ ok: true });
}