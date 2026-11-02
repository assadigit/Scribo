import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";
import { sha256Hex } from "@/lib/reader";

/**
 * Append-only audit trail for destructive and security-relevant actions.
 * `actor` is "admin:<id>" / "user:<id>" / "reader" / null (anonymous);
 * `detail` is free-form JSON (always serialized, never raw objects, so the
 * row stays immutable). Best-effort: failures are swallowed, the action the
 * caller was already committed to still succeeds.
 */
export async function audit(
  action: string,
  opts: {
    actor?: string | null;
    target?: string | null;
    detail?: Record<string, unknown> | null;
    request?: Request | null;
  } = {},
): Promise<void> {
  try {
    const ipRaw =
      opts.request?.headers.get("cf-connecting-ip") ??
      opts.request?.headers.get("x-forwarded-for");
    await db().insert(schema.auditLog).values({
      id: newId(),
      action,
      actor: opts.actor ?? null,
      target: opts.target ?? null,
      detail: opts.detail ? JSON.stringify(opts.detail) : null,
      ipHash: ipRaw ? await sha256Hex(ipRaw) : null,
      createdAt: now(),
    });
  } catch {
    // Logging must never break the action it describes.
  }
}