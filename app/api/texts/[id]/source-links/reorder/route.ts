import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";

/**
 * Reorder a text's source links in one shot: the client sends the full ordered
 * list of link ids and the server re-assigns positions 0..n-1. The list must
 * match exactly the links that belong to this text (no foreign ids, no dupes),
 * so a stale client can never scramble another note's links.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { order?: unknown } | null;

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const order = Array.isArray(body?.order)
    ? body.order.filter((x): x is string => typeof x === "string")
    : [];
  if (order.length === 0) return NextResponse.json({ error: "invalid_order" }, { status: 400 });

  const existing = await db()
    .select({ id: schema.textLinks.id })
    .from(schema.textLinks)
    .where(eq(schema.textLinks.textId, id));
  const existingIds = new Set(existing.map((r) => r.id));
  if (order.length !== existingIds.size || new Set(order).size !== order.length) {
    return NextResponse.json({ error: "invalid_order" }, { status: 400 });
  }
  for (const linkId of order) {
    if (!existingIds.has(linkId)) {
      return NextResponse.json({ error: "invalid_order" }, { status: 400 });
    }
  }

  for (let i = 0; i < order.length; i++) {
    await db()
      .update(schema.textLinks)
      .set({ position: i })
      .where(eq(schema.textLinks.id, order[i]));
  }
  return NextResponse.json({ ok: true });
}
