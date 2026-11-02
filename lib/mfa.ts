import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db, now } from "@/lib/db";
import { sha256Hex } from "@/lib/reader";

/**
 * Admin MFA (TOTP) state, persisted in the key/value `settings` table so no
 * schema migration or new storage service is required. A single key per admin
 * holds the secret + enabled flag; an MFA challenge is a short-lived single-use
 * token stored under its own key.
 */

export type AdminMfa = { secret: string; enabled: boolean };

function mfaKey(adminId: string): string {
  return `mfa.${adminId}`;
}

function challengeKey(challengeHash: string): string {
  return `mfa_challenge.${challengeHash}`;
}

export async function getAdminMfa(adminId: string): Promise<AdminMfa | null> {
  const row = await db()
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, mfaKey(adminId)))
    .get();
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as AdminMfa;
    if (typeof parsed.secret !== "string" || typeof parsed.enabled !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveAdminMfa(adminId: string, mfa: AdminMfa): Promise<void> {
  const value = JSON.stringify(mfa);
  await db()
    .insert(schema.settings)
    .values({ key: mfaKey(adminId), value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export async function clearAdminMfa(adminId: string): Promise<void> {
  await db().delete(schema.settings).where(eq(schema.settings.key, mfaKey(adminId)));
}

/* ------------------------- login challenge ------------------------- */

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Challenge = { adminId: string; expiresAt: number };

export async function createMfaChallenge(adminId: string): Promise<string> {
  // node:crypto randomBytes → buffer; safe, but we encode with btoa (as auth.ts
  // does) to match the codebase's nodejs_compat-friendly patterns.
  const challenge = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const value = JSON.stringify({ adminId, expiresAt: now() + CHALLENGE_TTL_MS });
  await db()
    .insert(schema.settings)
    .values({ key: challengeKey(await sha256Hex(challenge)), value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  return challenge;
}

/** Returns the adminId if the challenge is valid, else null. Single-use: deleted on consumption. */
export async function consumeMfaChallenge(challenge: string): Promise<string | null> {
  if (!challenge) return null;
  const key = challengeKey(await sha256Hex(challenge));
  const row = await db().select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  await db().delete(schema.settings).where(eq(schema.settings.key, key)); // single-use
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as Challenge;
    if (
      typeof parsed.adminId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < Date.now()
    ) {
      return null;
    }
    return parsed.adminId;
  } catch {
    return null;
  }
}