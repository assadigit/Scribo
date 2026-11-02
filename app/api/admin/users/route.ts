import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";

/** Admin-only: list all registered writers (for management + invites). */
export async function GET() {
  const admin = await auth.getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const users = await db()
    .select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      displayName: schema.users.displayName,
      nickname: schema.users.nickname,
      createdAt: schema.users.createdAt,
      noteCount: sql<number>`(SELECT COUNT(*) FROM ${schema.texts} WHERE ${schema.texts.ownerId} = ${schema.users.id})`,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));
  return NextResponse.json({ users });
}