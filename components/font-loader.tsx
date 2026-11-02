"use client";

import { useEffect, useState } from "react";
import { customFontCss, type CustomFont } from "@/lib/fonts";

/**
 * Loads the site-wide custom font (admin-uploaded, stored as a data URL in
 * D1) on the client instead of blocking the server render on a D1 read:
 * public pages render with the bundled Vazirmatn and swap to the custom
 * face after hydration — invisible in practice because the font was never
 * available before first paint anyway.
 */
export function FontLoader() {
  const [font, setFont] = useState<CustomFont | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/fonts")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (!alive) return;
        const b = body as { family?: unknown; format?: unknown; dataUrl?: unknown } | null;
        if (
          b &&
          typeof b.family === "string" &&
          typeof b.format === "string" &&
          typeof b.dataUrl === "string"
        ) {
          setFont({ family: b.family, format: b.format, dataUrl: b.dataUrl, updatedAt: 0 });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!font) return null;
  // React 19 hoists <style> into <head>.
  return <style dangerouslySetInnerHTML={{ __html: customFontCss(font) }} />;
}