import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import type { SessionAccount } from "@/lib/auth";

export type TextAccess = "none" | "read" | "write";

/**
 * Resolve how a given account may use a text.
 *  - Super admin can edit anything (owner_id is NULL for the original writer).
 *  - A registered user writes their own texts and reads/writes texts shared
 *    to them (canEdit toggles read vs write).
 *  - Any other text is not accessible.
 */
export async function getTextAccess(
  account: SessionAccount,
  text: { id: string; ownerId: string | null },
): Promise<TextAccess> {
  if (account.kind === "admin") return "write";

  const userId = account.user.id;
  if (text.ownerId === userId) return "write";

  const share = await db()
    .select()
    .from(schema.textShares)
    .where(and(eq(schema.textShares.textId, text.id), eq(schema.textShares.userId, userId)))
    .get();
  if (!share) return "none";
  return share.canEdit ? "write" : "read";
}

/** Convenience: is this account the owner of the text (or the admin)? */
export function accountOwnsText(
  account: SessionAccount,
  text: { ownerId: string | null },
): boolean {
  if (account.kind === "admin") return true;
  return text.ownerId === account.user.id;
}