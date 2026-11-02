import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, now } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for uptime monitoring. Verifies the D1 connection
 * with a trivial query so a dead database shows up as non-200.
 */
export async function GET() {
  try {
    await db().run(sql`SELECT 1`);
    return NextResponse.json({
      status: "ok",
      time: now(),
      db: "ok",
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        time: now(),
        db: "error",
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 },
    );
  }
}