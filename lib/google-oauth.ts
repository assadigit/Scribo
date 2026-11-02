import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Google OAuth 2.0 — Authorization Code flow with PKCE (RFC 7636) for the
 * writer/admin login.
 *
 * Runs entirely on the Worker using Web Crypto (fetch + crypto.subtle); no
 * extra dependencies. The `code_verifier`, `state` and `nonce` survive the
 * redirect round-trip in a short-lived HttpOnly cookie (set by the start
 * route, cleared by the callback), so the flow needs no session store and no
 * extra D1 rows.
 *
 * Account linking is by VERIFIED email only — client claims are never trusted:
 *   - a registered writer whose `users.email` matches the verified email
 *     signs in as that writer;
 *   - otherwise an email present in GOOGLE_ALLOWED_EMAILS signs in as the
 *     single super admin (there is exactly one admin row).
 * No account is ever auto-created.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUER = "https://accounts.google.com";

type GoogleEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_ALLOWED_EMAILS?: string;
  GOOGLE_REDIRECT_URI?: string;
  APP_URL?: string;
};

function googleEnv(): GoogleEnv {
  return getCloudflareContext().env as unknown as GoogleEnv;
}

export function googleClientId(): string {
  return googleEnv().GOOGLE_CLIENT_ID ?? "";
}

export function googleClientSecret(): string {
  return googleEnv().GOOGLE_CLIENT_SECRET ?? "";
}

export function googleConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}

/** Lower-cased, trimmed set of emails allowed to use Google login. */
export function allowedGoogleEmails(): Set<string> {
  return new Set(
    (googleEnv().GOOGLE_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** The callback URL registered in the Google OAuth client (prod default). */
export function googleRedirectUri(): string {
  const env = googleEnv();
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI;
  const app = env.APP_URL ?? "https://scribo.ir";
  return `${app}/api/auth/google/callback`;
}

/* ------------------------------- helpers ------------------------------- */

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  // Decode the raw byte string to UTF-8 text (JSON payloads carry non-ASCII).
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Cryptographically-random base64url string (state / nonce / verifier). */
export function randomBase64Url(byteLength = 24): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/* -------------------------------- PKCE -------------------------------- */

export type PkcePair = { verifier: string; challenge: string };

export async function createPkce(): Promise<PkcePair> {
  const verifier = randomBase64Url(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

/* ---------------------------- authorize URL ---------------------------- */

export function googleAuthorizeUrl(opts: {
  state: string;
  codeChallenge: string;
  nonce?: string;
}): string {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    access_type: "online",
  });
  if (opts.nonce) params.set("nonce", opts.nonce);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/* --------------------------- token exchange --------------------------- */

/** Swap the authorization code for an ID token. Returns null on failure. */
export async function exchangeCode(
  code: string,
  verifier: string,
): Promise<{ idToken: string } | null> {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { id_token?: string } | null;
  return data?.id_token ? { idToken: data.id_token } : null;
}

/* ------------------------ ID token verification ------------------------ */

export type GoogleProfile = { sub: string; email: string };

let jwksCache: { keys: Map<string, CryptoKey>; expiresAt: number } | null = null;

async function loadJwksKeys(): Promise<Map<string, CryptoKey>> {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error("google_certs_unavailable");
  const data = (await res.json()) as {
    keys: Array<{ kid?: string; kty?: string; use?: string; alg?: string; n?: string; e?: string }>;
  };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of data.keys) {
    if (jwk.kty !== "RSA" || jwk.use !== "sig" || !jwk.n || !jwk.e || !jwk.kid) continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "RSA",
        n: jwk.n,
        e: jwk.e,
        alg: jwk.alg ?? "RS256",
        kid: jwk.kid,
        use: "sig",
      } as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keys.set(jwk.kid, key);
  }
  jwksCache = { keys, expiresAt: Date.now() + 60_000 };
  return keys;
}

/**
 * Verify a Google ID token end-to-end: signature against Google's JWKS,
 * issuer, audience (our client id), expiry, and that the email is verified
 * by Google. Returns the profile, or null when any check fails.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile | null> {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  let header: { kid?: string };
  let payload: {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    nonce?: string;
  };
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }

  // 1 — signature (RS256).
  let key: CryptoKey | undefined;
  try {
    key = header?.kid ? (await loadJwksKeys()).get(header.kid) : undefined;
  } catch {
    key = undefined;
  }
  if (!key) return null;
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToBytes(parts[2]);
  const validSig = await crypto.subtle
    .verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, data)
    .catch(() => false);
  if (!validSig) return null;

  // 2 — core claims.
  if (payload.iss !== GOOGLE_ISSUER) return null;
  const clientId = googleClientId();
  const audOk =
    payload.aud === clientId || (Array.isArray(payload.aud) && payload.aud.includes(clientId));
  if (!audOk) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (typeof payload.email !== "string" || payload.email_verified !== true) return null;

  return { sub: payload.sub, email: payload.email.toLowerCase() };
}
