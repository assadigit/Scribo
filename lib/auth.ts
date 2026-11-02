import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db, now } from "@/lib/db";
import { newId } from "@/lib/ids";

export const SESSION_COOKIE = "scribo_session";
const SESSION_DAYS = 30;
const ADMIN_ITERATIONS = 100_000;

/* ----------------------------- helpers ----------------------------- */

import { pbkdf2 as pbkdf2Callback } from "node:crypto";
import { promisify } from "node:util";

/* ------------------------------------------------------------------ */
/* IMPORTANT: workerd's Web Crypto (crypto.subtle) rejects PBKDF2     */
/* iterations above 100_000, so password derivation must go through   */
/* node:crypto (nodejs_compat) instead. Output is byte-identical to   */
/* Web Crypto PBKDF2-HMAC-SHA256, so existing hashes stay valid.      */
/* ------------------------------------------------------------------ */

const pbkdf2Async = promisify(pbkdf2Callback) as (
  password: string,
  salt: Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
) => Promise<Uint8Array>;

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* constant-time compare */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const data = typeof input === "string" ? textEncoder.encode(input) : input;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as BufferSource,
  );
  return bytesToHex(new Uint8Array(digest));
}

/* ----------------------------- passwords ----------------------------- */

async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number) {
  return pbkdf2Async(password, salt, iterations, 32, "sha256");
}

/** Hash a password into a self-describing `pbkdf2$N$salt$hash` string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derivePbkdf2(password, salt, ADMIN_ITERATIONS);
  return `pbkdf2$${ADMIN_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

/** Verify a plaintext password against a stored hash string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  try {
    const salt = hexToBytes(parts[2]);
    const hash = hexToBytes(parts[3]);
    const candidate = await derivePbkdf2(password, salt, iterations);
    return timingSafeEqual(candidate, hash);
  } catch {
    return false;
  }
}

/* ----------------------------- types ----------------------------- */

export type SessionAccount =
  | { kind: "admin"; admin: typeof schema.admins.$inferSelect }
  | { kind: "user"; user: typeof schema.users.$inferSelect };

/* ----------------------------- sessions ----------------------------- */

export type SessionData = { token: string; expiresAt: number };

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: true,
  path: "/",
} as const;

/**
 * Create a session for either an admin or a registered user and record a row
 * in `sessions` keyed by a hash of the token.
 *
 * The cookie itself is NOT set here. Route Handlers must attach it to their
 * response with `attachSessionCookie` — mutating `cookies()` inside a Route
 * Handler does not emit a Set-Cookie header (only Server Actions flush those
 * mutations), which silently logged everyone out on every request.
 */
async function createSession(account: {
  adminId?: string;
  userId?: string;
}): Promise<SessionData> {
  const token = bytesToBase64Url(randomBytes(32));
  const tokenHash = await sha256Hex(token);
  const id = newId();
  const createdAt = now();
  const expiresAt = createdAt + SESSION_DAYS * 24 * 60 * 60 * 1000;

  await db().insert(schema.sessions).values({
    id,
    tokenHash,
    adminId: account.adminId ?? null,
    userId: account.userId ?? null,
    createdAt,
    expiresAt,
  });

  return { token, expiresAt };
}

async function createAdminSession(adminId: string): Promise<SessionData> {
  return createSession({ adminId });
}

async function createUserSession(userId: string): Promise<SessionData> {
  return createSession({ userId });
}

/** Attach the freshly-created session cookie to a Route Handler response. */
function attachSessionCookie(res: NextResponse, session: SessionData): NextResponse {
  res.cookies.set(SESSION_COOKIE, session.token, {
    ...SESSION_COOKIE_OPTIONS,
    expires: new Date(session.expiresAt),
  });
  return res;
}

/**
 * Revoke the current session (DB row + cookie) on a Route Handler response.
 * Returns the response with the cookie cleared.
 */
async function destroySession(res: NextResponse): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = await sha256Hex(token);
    await db().delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash));
  }
  res.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, expires: new Date(0) });
  return res;
}

/**
 * Resolve the currently-authenticated account (an admin OR a registered
 * writer). Returns null when there is no valid session.
 */
async function getCurrentAccount(): Promise<SessionAccount | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await db()
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.tokenHash, tokenHash))
    .get();
  if (!session) return null;
  if (session.expiresAt < now()) {
    // Expired session: clean up its row eagerly so the sessions table doesn't
    // accumulate dead entries (full sweep runs in the lazy cleanup).
    await db().delete(schema.sessions).where(eq(schema.sessions.id, session.id));
    return null;
  }

  if (session.adminId) {
    const admin = await db()
      .select()
      .from(schema.admins)
      .where(eq(schema.admins.id, session.adminId))
      .get();
    if (admin) return { kind: "admin", admin };
  }
  if (session.userId) {
    const user = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .get();
    if (user) return { kind: "user", user };
  }
  return null;
}

/** Only returns a session when the logged-in account is the super admin. */
async function getCurrentAdmin() {
  const account = await getCurrentAccount();
  return account?.kind === "admin" ? account.admin : null;
}

/** Only returns a session when the logged-in account is a registered user. */
async function getCurrentUser() {
  const account = await getCurrentAccount();
  return account?.kind === "user" ? account.user : null;
}

export const auth = {
  createSession,
  createAdminSession,
  createUserSession,
  attachSessionCookie,
  destroySession,
  getCurrentAccount,
  getCurrentAdmin,
  getCurrentUser,
  hashPassword,
  verifyPassword,
};