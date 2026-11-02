import { createHmac, randomBytes } from "node:crypto";

/**
 * Minimal RFC 6238 TOTP (SHA-1, 6 digits, 30s period) with a ±1 step window.
 * Uses node:crypto's HMAC so it works inside the workerd nodejs_compat runtime
 * (the same reason password derivation goes through node:crypto). The secret is
 * a base32 string (RFC 4648, 20 random bytes from crypto) readable by any
 * standard authenticator app.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** RFC 4226 HOTP for an 8-byte big-endian counter. */
function hotp(secret: Uint8Array, counter: number): string {
  const bytes = new Uint8Array(8);
  let v = counter;
  for (let i = 7; i >= 0; i--) {
    bytes[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  // createHmac accepts Uint8Array for both key and data; digest() returns a
  // Uint8Array-compatible Buffer we only index, so no Buffer allocation needed.
  const hmac = createHmac("sha1", secret).update(bytes).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return (bin % 1_000_000).toString().padStart(6, "0");
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Generate a new base32 TOTP secret (20 random bytes → 32 chars). */
export function generateTOTPSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The otpauth:// URI to add to an authenticator app. */
export function otpauthUrl(secret: string, account: string): string {
  return `otpauth://totp/Scribo:${encodeURIComponent(account)}?secret=${secret}&issuer=Scribo&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Verify a 6-digit token against a secret, allowing the neighbouring
 * 30s steps to reduce clock-drift annoyances.
 */
export function verifyTOTP(secret: string, token: string): boolean {
  const clean = (token ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const decoded = base32Decode(secret);
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -1; i <= 1; i++) {
    if (timingSafeEq(hotp(decoded, counter + i), clean)) return true;
  }
  return false;
}