import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  FONT_FORMATS,
  MAX_FONT_CHARS,
  clearCustomFont,
  getCustomFont,
  isValidFontFamily,
  saveCustomFont,
} from "@/lib/fonts";
import { audit } from "@/lib/audit";

const DATA_URL_RE = /^data:font\/[a-z0-9.+-]+;base64,/i;

async function currentAdmin() {
  return auth.getCurrentAdmin();
}

/** Read the site-wide custom font (public: it already ships in every HTML
 *  page's head today — the client FontLoader fetches it so public pages can
 *  stay static while still honoring an uploaded font after hydration). */
export async function GET() {
  const font = await getCustomFont();
  return NextResponse.json(font ? { family: font.family, format: font.format, dataUrl: font.dataUrl } : { ok: false });
}

/** Upload/replace the site-wide custom font (super admin only). */
export async function POST(request: Request) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { family, format, dataUrl } = (body ?? {}) as {
    family?: unknown;
    format?: unknown;
    dataUrl?: unknown;
  };

  if (typeof family !== "string" || !isValidFontFamily(family)) {
    return NextResponse.json({ error: "invalid_family" }, { status: 400 });
  }
  if (
    typeof format !== "string" ||
    !FONT_FORMATS.includes(format as (typeof FONT_FORMATS)[number])
  ) {
    return NextResponse.json({ error: "invalid_format" }, { status: 400 });
  }
  if (typeof dataUrl !== "string" || dataUrl.length > MAX_FONT_CHARS) {
    return NextResponse.json({ error: "invalid_data" }, { status: 400 });
  }
  // Must be a well-formed font data URL — anything else (URLs, scripts, etc.)
  // is rejected so it can never be interpreted as HTML or a fetch source.
  if (!DATA_URL_RE.test(dataUrl)) {
    return NextResponse.json({ error: "invalid_data" }, { status: 400 });
  }

  await saveCustomFont({
    family: family.trim(),
    format,
    dataUrl,
    updatedAt: Date.now(),
  });
  await audit("font.upload", {
    actor: `admin:${(await currentAdmin())?.id ?? "unknown"}`,
    detail: { family: family.trim(), format },
    request,
  });
  return NextResponse.json({ ok: true, family: family.trim() });
}

/** Remove the custom font and fall back to the bundled Vazirmatn. */
export async function DELETE(request: Request) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await clearCustomFont();
  await audit("font.delete", {
    actor: `admin:${(await currentAdmin())?.id ?? "unknown"}`,
    request,
  });
  return NextResponse.json({ ok: true });
}