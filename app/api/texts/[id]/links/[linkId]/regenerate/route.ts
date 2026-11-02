import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { newToken, newTokenPrefix } from "@/lib/ids";
import { linkTokenHash, shareUrl } from "@/lib/reader";
import { getTextAccess } from "@/lib/access";


/** Issue a brand-new token for an existing link (old URL stops working). */
export async function POST(
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

  // A burned one-time link stays burned — its token must not be reusable.
  if (link.status === "consumed") {
    return NextResponse.json({ error: "consumed_link" }, { status: 400 });
  }

  const token = newToken();
  const tokenHash = await linkTokenHash(token);
  await db()
    .update(schema.shareLinks)
    .set({ token, tokenHash, tokenPrefix: newTokenPrefix() })
    .where(eq(schema.shareLinks.id, linkId));

  return NextResponse.json({ link: { id: linkId, url: shareUrl(token) } });
}