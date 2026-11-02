import { and, desc, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";

/* ------------------------- token / hashing ------------------------- */

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/** Hash used to look up a share link from its URL token. */
export function linkTokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}

/* ------------------------- reader cookies ------------------------- */

/** Cookie that proves this browser already passed the link's password. */
export function readerCookieName(linkId: string): string {
  return `fr_${linkId}`;
}

/**
 * Deterministic proof-of-unlock: derived from the link password hash and the
 * link's *current* status, so it can only be produced by someone who presented
 * the correct password AND the link is still active. Deriving from status
 * means revoking a link automatically invalidates every reader's unlock cookie
 * — access can only ever outlive revocation by re-entering the password on a
 * newly reactivated link.
 */
export async function readerCookieValue(
  token: string,
  passwordHash: string,
  status: string,
): Promise<string> {
  return sha256Hex(`${token}|${passwordHash}|${status}`);
}

/* ------------------------- one-time links ------------------------- */

/**
 * How long a burned one-time link stays readable in the browser that used it,
 * so the recipient can finish a multi-chapter text in the same sitting.
 */
export const ONE_TIME_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours

/** One-time grace window in seconds (for cookie max-age). */
export const ONE_TIME_GRACE_SECONDS = ONE_TIME_GRACE_MS / 1000;

export async function readerCookiePresent(
  link: typeof schema.shareLinks.$inferSelect,
  token: string,
): Promise<boolean> {
  const cookieStore = await cookies();
  // A consumed one-time link only stays readable for the very browser that
  // presented it — the "no password → always unlocked" shortcut must NOT apply.
  if (link.oneTime && link.status === "consumed") {
    const expected = await readerCookieValue(token, link.passwordHash || "", "consumed");
    return cookieStore.get(readerCookieName(link.id))?.value === expected;
  }
  if (!link.passwordHash) return true; // no password → always unlocked
  const expected = await readerCookieValue(token, link.passwordHash, link.status);
  const got = cookieStore.get(readerCookieName(link.id))?.value;
  return got === expected;
}

/**
 * Whether the link may currently show content. An active link is always
 * readable; a burned one-time link only in the hands of the browser that
 * consumed it, and only inside the grace window.
 */
export async function isLinkViewable(
  link: typeof schema.shareLinks.$inferSelect,
  token: string,
): Promise<boolean> {
  // Fresh and active → readable (expiry still applies).
  if (link.status === "active" && (!link.expiresAt || link.expiresAt >= Date.now())) {
    return true;
  }
  // Burned one-time link: only the browser that consumed it can finish within
  // the grace window; afterwards it looks like a dead link again.
  if (link.oneTime && link.status === "consumed" && link.consumedAt) {
    if (link.consumedAt + ONE_TIME_GRACE_MS < Date.now()) return false;
    return readerCookiePresent(link, token);
  }
  return false;
}

/**
 * Burn a one-time link (once). No-op for non-one-time links, revoked links,
 * and links already consumed — so re-sending/re-opening is safe.
 *
 * The UPDATE is conditional on the link still being `active` so two browsers
 * racing to open the same one-time link can never both succeed: exactly one
 * wins (changes > 0), the other gets `false`.
 */
export async function consumeOneTimeLink(
  link: typeof schema.shareLinks.$inferSelect,
  timestamp = Date.now(),
): Promise<boolean> {
  if (!link.oneTime || link.status !== "active") return false;
  const res = await db()
    .update(schema.shareLinks)
    .set({ status: "consumed", consumedAt: timestamp, lastUsedAt: timestamp })
    .where(
      and(eq(schema.shareLinks.id, link.id), eq(schema.shareLinks.status, "active")),
    );
  return res.meta.changes > 0;
}

/* ------------------------- link lookup ------------------------- */

export async function findLinkByToken(token: string) {
  const tokenHash = await linkTokenHash(token);
  return db().select().from(schema.shareLinks).where(eq(schema.shareLinks.tokenHash, tokenHash)).get();
}

export function isLinkAccessible(link: { status: string; expiresAt: number | null }): boolean {
  if (link.status !== "active") return false;
  if (link.expiresAt && link.expiresAt < Date.now()) return false;
  return true;
}

export function appUrl(): string {
  const env = getCloudflareContext().env as unknown as { APP_URL?: string };
  return env.APP_URL ?? "https://scribo.ir";
}

export function shareUrl(token: string): string {
  return `${appUrl()}/r/${token}`;
}

/* ------------------------- reader likes ------------------------- */

/** Per-browser anonymous reader id cookie, used for likes (and future reader features). */
export const READER_ID_COOKIE = "frv";

/** The anonymous reader id for this browser, or null on first visit. */
export async function getReaderId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(READER_ID_COOKIE)?.value ?? null;
}

/**
 * Total likes for a text plus whether this browser already liked it, the
 * name attached to this browser's like ("" when anonymous/not liked), and
 * the newest named likers (for the LinkedIn-style avatar stack).
 * No cookie → not liked (correct for a first-time visitor).
 */
export async function getLikeState(textId: string) {
  const readerId = await getReaderId();
  const countRow = await db()
    .select({ count: sql<number>`count(*)` })
    .from(schema.likes)
    .where(eq(schema.likes.textId, textId))
    .get();

  const namedRows = await db()
    .select({ name: schema.likes.authorName })
    .from(schema.likes)
    .where(
      and(
        eq(schema.likes.textId, textId),
        sql`${schema.likes.authorName} != ''`,
      ),
    )
    .orderBy(desc(schema.likes.createdAt))
    .limit(8)
    .all();

  let liked = false;
  let myName = "";
  if (readerId) {
    const mine = await db()
      .select({ authorName: schema.likes.authorName })
      .from(schema.likes)
      .where(and(eq(schema.likes.textId, textId), eq(schema.likes.readerId, readerId)))
      .get();
    liked = !!mine;
    myName = mine?.authorName ?? "";
  }
  return { count: countRow?.count ?? 0, liked, myName, likers: namedRows.map((r) => r.name) };
}

/* ------------------------- reading data ------------------------- */

/** Source/reference links attached to a text, in display order. */
export async function getTextLinks(textId: string) {
  return db()
    .select()
    .from(schema.textLinks)
    .where(eq(schema.textLinks.textId, textId))
    .orderBy(schema.textLinks.position);
}

export async function getTextWithChapters(textId: string) {
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, textId)).get();
  if (!text) return null;

  const chapters = await db()
    .select({
      id: schema.chapters.id,
      textId: schema.chapters.textId,
      position: schema.chapters.position,
      title: schema.chapters.title,
      createdAt: schema.chapters.createdAt,
      updatedAt: schema.chapters.updatedAt,
      bodyJson: schema.versions.bodyJson,
      versionId: schema.versions.id,
      versionNumber: schema.versions.number,
    })
    .from(schema.chapters)
    .innerJoin(schema.versions, eq(schema.chapters.id, schema.versions.chapterId))
    .where(eq(schema.versions.isCurrent, true))
    .orderBy(schema.chapters.position);

  const links = await getTextLinks(textId);

  return { text, chapters, links };
}

export async function getChapterWithVersion(textId: string, chapterId: string) {
  const chapter = await db()
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .get();
  if (!chapter || chapter.textId !== textId) return null;

  const version = await db()
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.chapterId, chapterId), eq(schema.versions.isCurrent, true)))
    .get();
  return { chapter, version };
}
