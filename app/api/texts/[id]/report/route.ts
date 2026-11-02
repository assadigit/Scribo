import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";


/** Reading analytics for one text, client-fetchable (workspace report card). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access === "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const agg = await db()
    .select({
      count: sql<number>`COUNT(*)`,
      avg: sql<number>`AVG(${schema.readSessions.durationMs})`,
      sum: sql<number>`SUM(${schema.readSessions.durationMs})`,
    })
    .from(schema.readSessions)
    .where(eq(schema.readSessions.textId, id))
    .get();

  const recentReads = await db()
    .select({
      id: schema.readSessions.id,
      readerLabel: schema.readSessions.readerLabel,
      chapterId: schema.readSessions.chapterId,
      durationMs: schema.readSessions.durationMs,
      lastSeenAt: schema.readSessions.lastSeenAt,
      startedAt: schema.readSessions.startedAt,
      completed: schema.readSessions.completed,
    })
    .from(schema.readSessions)
    .where(eq(schema.readSessions.textId, id))
    .orderBy(desc(schema.readSessions.lastSeenAt))
    .limit(20);

  return NextResponse.json({
    readStats: {
      readerCount: Number(agg?.count ?? 0),
      totalDurationMs: Number(agg?.sum ?? 0),
      avgDurationMs: Number(agg?.avg ?? 0),
      recentReads,
    },
  });
}
