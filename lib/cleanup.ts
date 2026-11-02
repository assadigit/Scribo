import { eq, like, lt } from "drizzle-orm";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";

/**
 * Best-effort, lazy data lifecycle cleanup.
 *
 * Cloudflare Workers have no cron scheduler in this OpenNext deployment, so
 * the sweep piggybacks on authenticated dashboard traffic: the first request
 * after `CLEANUP_INTERVAL_MS` deletes expired/aged-out rows (sessions, reset
 * codes, rate-limit counters, old read sessions). It is fully wrapped in
 * try/catch so a failure can never break the route that triggered it.
 */

const CLEANUP_KEY = "last_cleanup_at";
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // run at most once a day

const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // sessions older than 90 days
const RESET_CODE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // reset codes older than 1 day
const READ_SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // read sessions older than a year

/** Rate-limit / single-use keys that self-heal and are safe to purge. */
const VOLATILE_SETTING_PREFIXES = [
  "login_", // login brute-force counters
  "attempt_", // reader unlock counters
  "comment_", // comment spam counters
  "reg_", // registration counters
  "mfa_challenge.", // single-use MFA login challenges
];

/**
 * Run the sweep if it is due. Returns immediately when nothing is due.
 * Must be awaited (workerd freezes isolates before fire-and-forget promises
 * resolve, so `void maybeRunCleanup()` would silently never run).
 */
export async function maybeRunCleanup(): Promise<void> {
  try {
    const row = await db()
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, CLEANUP_KEY))
      .get();
    const last = row ? Number(row.value) || 0 : 0;
    if (last && now() - last < CLEANUP_INTERVAL_MS) return;

    const ts = now();

    await db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, ts));
    await db()
      .delete(schema.passwordResetCodes)
      .where(lt(schema.passwordResetCodes.expiresAt, ts));
    await db()
      .delete(schema.readSessions)
      .where(lt(schema.readSessions.startedAt, ts - READ_SESSION_MAX_AGE_MS));
    await db()
      .delete(schema.sessions)
      .where(lt(schema.sessions.createdAt, ts - SESSION_MAX_AGE_MS));
    await db()
      .delete(schema.passwordResetCodes)
      .where(lt(schema.passwordResetCodes.createdAt, ts - RESET_CODE_MAX_AGE_MS));

    for (const prefix of VOLATILE_SETTING_PREFIXES) {
      await db().delete(schema.settings).where(like(schema.settings.key, `${prefix}%`));
    }

    await db()
      .insert(schema.settings)
      .values({ key: CLEANUP_KEY, value: String(ts) })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(ts) } });
  } catch {
    // Never let cleanup take down a request — it is opportunistic.
  }
}
