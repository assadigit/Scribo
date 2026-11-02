import { NextResponse } from "next/server";
import { asc, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .slice(0, 40);
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/** List the current user's tags. The super admin's tags are the site-wide ones. */
export async function GET() {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ownerId = account.kind === "user" ? account.user.id : null;
  const rows = await db()
    .select()
    .from(schema.tags)
    .where(ownerId ? eq(schema.tags.ownerId, ownerId) : isNull(schema.tags.ownerId))
    .orderBy(asc(schema.tags.name));
  return NextResponse.json({ tags: rows });
}

/** Create a personal tag. */
export async function POST(request: Request) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: string; nameFa?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const id = newId();
  await db().insert(schema.tags).values({
    id,
    name,
    slug: slugify(name),
    nameFa: body?.nameFa?.trim() || null,
    ownerId: account.kind === "user" ? account.user.id : null,
    createdAt: now(),
  });
  const tag = await db().select().from(schema.tags).where(eq(schema.tags.id, id)).get();
  return NextResponse.json({ tag }, { status: 201 });
}