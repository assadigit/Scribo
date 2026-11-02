import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";

/**
 * Site-wide custom font, stored as a base64 data URL in the key/value
 * `settings` table (no R2 / no paid storage needed) — the same pattern used
 * for the author avatar. When absent, the app uses the bundled Vazirmatn.
 */

export type CustomFont = {
  family: string;
  /** CSS format token: truetype | opentype | woff | woff2 */
  format: string;
  /** `data:font/…;base64,…` */
  dataUrl: string;
  updatedAt: number;
};

export const FONT_KEY = "site.font";
export const MAX_FONT_CHARS = 4_000_000; // base64 data URL of a ~3MB font file

export const FONT_FORMATS = ["truetype", "opentype", "woff", "woff2"] as const;
export const FONT_EXT_FORMAT: Record<string, string> = {
  ttf: "truetype",
  otf: "opentype",
  woff: "woff",
  woff2: "woff2",
};

/** A safe CSS font-family identifier (letters, digits, spaces, hyphen, endash). */
const FAMILY_RE = /^[\p{L}\p{N} _\u2013-]{1,60}$/u;

export function isValidFontFamily(name: string): boolean {
  return FAMILY_RE.test(name.trim());
}

export async function getCustomFont(): Promise<CustomFont | null> {
  const row = await db()
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, FONT_KEY))
    .get();
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as CustomFont;
    if (
      typeof parsed.family !== "string" ||
      !isValidFontFamily(parsed.family) ||
      !FONT_FORMATS.includes(parsed.format as (typeof FONT_FORMATS)[number]) ||
      typeof parsed.dataUrl !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCustomFont(font: CustomFont): Promise<void> {
  const value = JSON.stringify(font);
  await db()
    .insert(schema.settings)
    .values({ key: FONT_KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export async function clearCustomFont(): Promise<void> {
  await db().delete(schema.settings).where(eq(schema.settings.key, FONT_KEY));
}

/**
 * CSS block injected into <head> whenever a custom font is set. The family is
 * strictly validated so it can never break out of the <style> context.
 */
export function customFontCss(font: CustomFont): string {
  return [
    `@font-face{font-family:"${font.family}";src:url(${font.dataUrl}) format("${font.format}");font-weight:100 900;font-style:normal;font-display:swap;}`,
    // When the uploaded custom font lacks Farsi glyphs, fall back to the real
    // bundled Vazirmatn family so Farsi text never falls through to a system
    // font (e.g. Arial). The custom family is tried first, so a genuine Farsi
    // upload still takes precedence.
    `:root{--font-vazirmatn:"${font.family}","Vazirmatn";}`,
  ].join("");
}