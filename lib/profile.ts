import { eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import type { SessionAccount } from "@/lib/auth";

/**
 * Author profile shown on reader pages ("written by [name]" + avatar).
 * Stored in the key/value `settings` table so no new storage service is
 * needed (no R2). The avatar is a small base64 data URL (client-side resized
 * to ~256px JPEG before upload), so it stays well within D1's free tier.
 */

export type AuthorProfile = {
  name: string;
  nickname: string | null;
  bio: string | null;
  avatar: string | null;
};

const KEYS = ["author.name", "author.nickname", "author.bio", "author.avatar"] as const;

export async function getAuthorProfile(): Promise<AuthorProfile> {
  const rows = await db()
    .select()
    .from(schema.settings)
    .where(inArray(schema.settings.key, [...KEYS]));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const name = (map.get("author.name") ?? "").trim();
  const nickname = (map.get("author.nickname") ?? "").trim() || null;
  const bio = (map.get("author.bio") ?? "").trim() || null;
  const avatar = (map.get("author.avatar") ?? "").trim() || null;
  return { name, nickname, bio, avatar };
}

export async function saveAuthorProfile(profile: AuthorProfile): Promise<void> {
  const entries: Array<{ key: string; value: string }> = [
    { key: "author.name", value: profile.name.trim() },
    { key: "author.nickname", value: (profile.nickname ?? "").trim() },
    { key: "author.bio", value: (profile.bio ?? "").trim() },
    { key: "author.avatar", value: (profile.avatar ?? "").trim() },
  ];
  for (const entry of entries) {
    await db()
      .insert(schema.settings)
      .values(entry)
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: entry.value } });
  }
}

/*
 * Per-account "block copy & print on new share links" default. Stored in the
 * key/value `settings` table under `protect.default.{kind}.{id}` so no schema
 * migration is needed; the same pattern as the author profile/font/MFA. The
 * default when unset is ON — content protection is the safest choice for a
 * private writing app.
 */
const PROTECT_DEFAULT_PREFIX = "protect.default.";

function protectDefaultKey(account: SessionAccount): string {
  return account.kind === "admin"
    ? `${PROTECT_DEFAULT_PREFIX}admin.${account.admin.id}`
    : `${PROTECT_DEFAULT_PREFIX}user.${account.user.id}`;
}

/** Profile-level default applied to every newly created share link. */
export async function getProtectContentDefault(account: SessionAccount): Promise<boolean> {
  const row = await db()
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, protectDefaultKey(account)))
    .get();
  // Absent value → ON (protect content by default).
  return row ? row.value !== "0" : true;
}

export async function saveProtectContentDefault(
  account: SessionAccount,
  enabled: boolean,
): Promise<void> {
  const key = protectDefaultKey(account);
  const value = enabled ? "1" : "0";
  await db()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

/**
 * The byline shown on reader pages for a given text: a registered writer's
 * profile lives on their `users` row; the super admin's texts (owner_id NULL)
 * fall back to the site-wide `settings` profile.
 */
export async function getOwnerByline(ownerId: string | null): Promise<AuthorProfile> {
  if (ownerId) {
    const user = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, ownerId))
      .get();
    if (user) {
      return {
        name: user.displayName,
        nickname: user.nickname,
        bio: user.bio,
        avatar: user.avatar,
      };
    }
  }
  return getAuthorProfile();
}
