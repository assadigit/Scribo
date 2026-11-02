import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import { sha256Hex } from "@/lib/reader";
import { clientIp, checkLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * List invite codes. The super admin sees every code; a registered writer
 * only sees the codes they created themselves.
 */
export async function GET() {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const query = db().select().from(schema.inviteCodes);
  if (account.kind === "user") {
    query.where(eq(schema.inviteCodes.createdByUserId, account.user.id));
  }
  const codes = await query.orderBy(desc(schema.inviteCodes.createdAt));
  return NextResponse.json({ codes });
}

/** Create invite codes. Admin or any registered writer may create them. */
export async function POST(request: Request) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Light per-IP limiter so a scripted account can't mint unlimited codes.
  const limit = await checkLimit({
    key: `invite_${account.kind === "admin" ? "admin" : "user"}_${await sha256Hex(clientIp(request))}`,
    max: 20,
    windowMs: 15 * 60 * 1000,
    lockout: [5, 15, 60].map((m) => m * 60 * 1000),
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    count?: number;
    note?: string;
    expiresInDays?: number;
  } | null;
  const count = Math.min(Math.max(Math.floor(body?.count ?? 1), 1), 20);
  const timestamp = now();
  const expiresAt = body?.expiresInDays ? timestamp + body.expiresInDays * 86400_000 : null;

  const created: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = newInviteCode();
    await db().insert(schema.inviteCodes).values({
      id: newId(),
      code,
      createdBy: account.kind === "admin" ? account.admin.id : null,
      createdByUserId: account.kind === "user" ? account.user.id : null,
      note: body?.note?.trim() || null,
      expiresAt,
      createdAt: timestamp,
    });
    created.push(code);
  }
  await audit("invite.create", {
    actor: account.kind === "admin" ? `admin:${account.admin.id}` : `user:${account.user.id}`,
    detail: { count, note: body?.note?.trim() || null, expiresInDays: body?.expiresInDays ?? null },
    request,
  });
  return NextResponse.json({ codes: created }, { status: 201 });
}

/** Delete an invite code. Users may only revoke codes they created. */
export async function DELETE(request: Request) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  if (account.kind === "user") {
    const invite = await db()
      .select()
      .from(schema.inviteCodes)
      .where(
        and(
          eq(schema.inviteCodes.id, body.id),
          eq(schema.inviteCodes.createdByUserId, account.user.id),
        ),
      )
      .get();
    if (!invite) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  await db().delete(schema.inviteCodes).where(eq(schema.inviteCodes.id, body.id));
  await audit("invite.delete", {
    actor: account.kind === "admin" ? `admin:${account.admin.id}` : `user:${account.user.id}`,
    target: `invite:${body.id}`,
    request,
  });
  return NextResponse.json({ ok: true });
}
