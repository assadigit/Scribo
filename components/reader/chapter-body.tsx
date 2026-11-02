"use client";

/**
 * The book “page” a chapter is read on. Client component so the text-size
 * toolbar can scale the typography via the `--reader-scale` CSS variable —
 * the toolbar lives in the app frame and the variable is global on <html>,
 * so this wrapper stays a thin, presentational shell. The `dir` mirrors the
 * note's own direction so the prose typesets in the matching typewriter face
 * and base size (RTL → MashinTahrir at 14pt, LTR → Special Elite at 12pt).
 */
export function ChapterBody({ html, dir }: { html: string; dir: "rtl" | "ltr" }) {
  return (
    <div className="page-turn reader-page mt-10">
      <article className="reader-prose" dir={dir} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}