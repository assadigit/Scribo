export function newId() {
  return crypto.randomUUID();
}

/**
 * A short, human-friendly prefix for share links so that the full URL contains
 * a pseudonymous hint (e.g. `/r/john-4Fk2Q`) rather than an opaque string.
 * The full random token is stored only as a hash in the database.
 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newTokenPrefix() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function newSlug(title: string) {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .slice(0, 48) || `text-${Date.now().toString(36)}`;
  return `${base}-${Date.now().toString(36)}`;
}