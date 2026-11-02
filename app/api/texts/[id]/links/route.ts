import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId, newToken, newTokenPrefix } from "@/lib/ids";
import { linkTokenHash, shareUrl } from "@/lib/reader";
import { getTextAccess } from "@/lib/access";
import { getProtectContentDefault } from "@/lib/profile";


export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Share URLs are credentials: only the writer (admin, owner, or a
  // collaborator with edit rights) may list them. Read-only collaborators get
  // a 403 instead of the plaintext token rows.
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db()
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.textId, id))
    .orderBy(desc(schema.shareLinks.createdAt));

  return NextResponse.json({
    links: rows.map((l) => ({
      id: l.id,
      label: l.label,
      greeting: l.greeting,
      tokenPrefix: l.tokenPrefix,
      status: l.status,
      oneTime: l.oneTime,
      consumedAt: l.consumedAt,
      autoApproveComments: l.autoApproveComments,
      hasPassword: Boolean(l.passwordHash),
      protectContent: Boolean(l.protectContent),
      url: l.token ? shareUrl(l.token) : null,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      pinnedVersionId: l.pinnedVersionId,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    label?: string;
    greeting?: string;
    password?: string;
    autoApproveComments?: boolean;
    oneTime?: boolean;
    protectContent?: boolean;
    pinnedVersionId?: string | null;
  } | null;

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access !== "write") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const token = newToken();
  const tokenHash = await linkTokenHash(token);
  const password = body?.password?.trim();
  const passwordHash = password ? await auth.hashPassword(password) : null;
  // Copy/print protection defaults from the account's profile setting (ON by
  // default); a per-link override can still be sent explicitly.
  const protectContent = body?.protectContent ?? (await getProtectContentDefault(account));

  const linkId = newId();
  const timestamp = now();
  await db().insert(schema.shareLinks).values({
    id: linkId,
    textId: id,
    token,
    tokenHash,
    tokenPrefix: newTokenPrefix(),
    label: body?.label?.trim() || null,
    greeting: body?.greeting?.trim() || null,
    passwordHash,
    pinnedVersionId: body?.pinnedVersionId || null,
    autoApproveComments: body?.autoApproveComments ?? false,
    oneTime: body?.oneTime ?? false,
    protectContent,
    status: "active",
    createdAt: timestamp,
  });

  return NextResponse.json(
    {
      link: {
        id: linkId,
        label: body?.label?.trim() || null,
        greeting: body?.greeting?.trim() || null,
        status: "active",
        oneTime: body?.oneTime ?? false,
        autoApproveComments: body?.autoApproveComments ?? false,
        hasPassword: Boolean(passwordHash),
        protectContent,
        url: shareUrl(token),
      },
    },
    { status: 201 },
  );
}