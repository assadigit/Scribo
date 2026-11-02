import { eq } from "drizzle-orm";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";

/**
 * Shared D1-backed windowed rate limiting with escalating lockouts.
 *
 * Bucket JSON: { count, windowStart, lockedUntil?, lockStage? }
 * Tolerant of the older { count, windowStart } shape — lockedUntil/lockStage
 * are simply absent and default to "no lockout / stage 0".
 *
 * Lockout schedule: each time a bucket is exhausted the next stage is applied
 * (e.g. 2 → 8 → 30 min → 24h). A window refresh resets the count but keeps
 * the escalation stage, so repeated abuse hard-blocks instead of merely
 * windowing forever.
 */

interface Bucket {
  count: number;
  windowStart: number;
  lockedUntil?: number;
  lockStage?: number;
}

export interface RateLimitSpec {
  /** Full D1 settings key. */
  key: string;
  /** Max attempts per window. */
  max: number;
  /** Window length in ms. */
  windowMs: number;
  /**
   * Escalating lockout durations in ms. Each exhaustion applies the next
   * stage; the last stage repeats (typically a hard 24h block).
   */
  lockout?: number[];
}

export interface RateLimitResult {
  ok: boolean;
  /** When blocked: ms until the caller may try again. */
  retryAfterMs: number;
}

/** Default escalation schedule: 2 min → 8 min → 30 min → 24h. */
export const LOCKOUT_STAGES = [2, 8, 30, 24 * 60].map((m) => m * 60 * 1000);

/** Best-effort client IP from Cloudflare headers. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown"
  );
}

function parseBucket(raw: string | null | undefined): Bucket {
  if (!raw) return { count: 0, windowStart: now() };
  try {
    const p = JSON.parse(raw) as Partial<Bucket>;
    if (typeof p.count !== "number" || typeof p.windowStart !== "number") {
      return { count: 0, windowStart: now() };
    }
    return {
      count: Math.max(0, Math.floor(p.count)),
      windowStart: p.windowStart,
      lockedUntil: typeof p.lockedUntil === "number" ? p.lockedUntil : undefined,
      lockStage:
        typeof p.lockStage === "number" ? Math.max(0, Math.floor(p.lockStage)) : 0,
    };
  } catch {
    return { count: 0, windowStart: now() };
  }
}

async function readBucket(key: string): Promise<Bucket> {
  const row = await db()
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();
  return parseBucket(row?.value);
}

async function saveBucket(key: string, bucket: Bucket): Promise<void> {
  await db()
    .insert(schema.settings)
    .values({ key, value: JSON.stringify(bucket) })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: JSON.stringify(bucket) },
    });
}

/** Drop an expired window, keeping the lockout escalation stage. */
function refreshWindow(bucket: Bucket, windowMs: number): Bucket {
  if (bucket.windowStart < now() - windowMs) {
    return { count: 0, windowStart: now(), lockStage: bucket.lockStage ?? 0 };
  }
  return bucket;
}

/** Apply the next lockout stage; extends the window if the lock outlives it. */
function escalate(bucket: Bucket, spec: RateLimitSpec, t: number): void {
  if (!spec.lockout?.length) return;
  const stage = Math.min(bucket.lockStage ?? 0, spec.lockout.length - 1);
  const lockMs = spec.lockout[stage];
  bucket.lockedUntil = t + lockMs;
  bucket.lockStage = (bucket.lockStage ?? 0) + 1;
  if (bucket.lockedUntil > bucket.windowStart + spec.windowMs) {
    bucket.windowStart = t;
  }
}

/**
 * Evaluate the bucket without recording a new attempt. When the bucket is
 * exhausted and a lockout schedule is configured, this escalates lockedUntil
 * (one stage per exhaustion) so repeated abuse hard-blocks instead of merely
 * windowing.
 */
export async function checkLimit(spec: RateLimitSpec): Promise<RateLimitResult> {
  const t = now();
  const bucket = refreshWindow(await readBucket(spec.key), spec.windowMs);

  if (bucket.lockedUntil !== undefined && bucket.lockedUntil > t) {
    return { ok: false, retryAfterMs: bucket.lockedUntil - t };
  }
  if (bucket.count < spec.max) {
    return { ok: true, retryAfterMs: 0 };
  }

  escalate(bucket, spec, t);
  await saveBucket(spec.key, bucket);
  const retryAfterMs =
    bucket.lockedUntil !== undefined
      ? bucket.lockedUntil - t
      : bucket.windowStart + spec.windowMs - t;
  return { ok: false, retryAfterMs: Math.max(1, retryAfterMs) };
}

/**
 * Record one failed attempt (login/mfa/register style: check before the
 * attempt, record on failure, clear on success). Escalates the lockout when
 * the bucket fills.
 */
export async function recordFailure(spec: RateLimitSpec): Promise<void> {
  const bucket = refreshWindow(await readBucket(spec.key), spec.windowMs);
  bucket.count += 1;
  if (bucket.count >= spec.max) escalate(bucket, spec, now());
  await saveBucket(spec.key, bucket);
}

/**
 * Record one attempt regardless of outcome (comments/likes style: every
 * request counts, success clears via clearLimit). Does not escalate.
 */
export async function recordAttempt(spec: RateLimitSpec): Promise<void> {
  const bucket = refreshWindow(await readBucket(spec.key), spec.windowMs);
  bucket.count += 1;
  await saveBucket(spec.key, bucket);
}

/** Clear the bucket on success. */
export async function clearLimit(key: string): Promise<void> {
  await db().delete(schema.settings).where(eq(schema.settings.key, key));
}
