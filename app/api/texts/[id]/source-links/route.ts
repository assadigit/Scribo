import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";
import { newId } from "@/lib/ids";

const URL_MAX = 2048;
const TITLE_MAX = 200;

/** Only http(s) URLs are allowed as cited sources (safe to render on reader). */
function isSafeSourceUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && value.length <= URL_MAX;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access === "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db()
    .select()
    .from(schema.textLinks)
    .where(eq(schema.textLinks.textId, id))
    .orderBy(asc(schema.textLinks.position));

  return NextResponse.json({ links: rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    url?: string;
    title?: string;
  } | null;

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = body?.url?.trim() ?? "";
  if (!isSafeSourceUrl(url)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  const title = (body?.title ?? "").trim().slice(0, TITLE_MAX) || null;

  const last = await db()
    .select({ position: schema.textLinks.position })
    .from(schema.textLinks)
    .where(eq(schema.textLinks.textId, id))
    .orderBy(asc(schema.textLinks.position))
    .get();

  const linkId = newId();
  await db().insert(schema.textLinks).values({
    id: linkId,
    textId: id,
    url,
    title,
    position: (last?.position ?? -1) + 1,
    createdAt: now(),
  });

  const created = await db()
    .select()
    .from(schema.textLinks)
    .where(eq(schema.textLinks.id, linkId))
    .get();
  return NextResponse.json({ link: created }, { status: 201 });
}
