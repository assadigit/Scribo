import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { getTextAccess } from "@/lib/access";
import { renderTipTapMarkdown } from "@/lib/markdown";

/**
 * Export a text as a Markdown (.md) file for downloading — Obsidian-ready:
 * YAML frontmatter (title, dates, status) + the note's body in GFM.
 * Any account with at least read access may download (read-only shares too).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getTextAccess(account, text);
  if (access === "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const chapters = await db()
    .select({
      id: schema.chapters.id,
      title: schema.chapters.title,
      position: schema.chapters.position,
      bodyJson: schema.versions.bodyJson,
    })
    .from(schema.chapters)
    .innerJoin(schema.versions, eq(schema.chapters.id, schema.versions.chapterId))
    .where(and(eq(schema.chapters.textId, id), eq(schema.versions.isCurrent, true)))
    .orderBy(asc(schema.chapters.position));

  const sourceLinks = await db()
    .select()
    .from(schema.textLinks)
    .where(eq(schema.textLinks.textId, id))
    .orderBy(asc(schema.textLinks.position));

  // YAML frontmatter — the same shape Obsidian understands.
  const frontmatter = [
    "---",
    `title: "${String(text.title).replace(/"/g, '\\"')}"`,
    text.subtitle ? `subtitle: "${String(text.subtitle).replace(/"/g, '\\"')}"` : null,
    `status: ${text.status}`,
    `created: ${new Date(text.createdAt).toISOString()}`,
    `updated: ${new Date(text.updatedAt).toISOString()}`,
    text.publishedAt ? `published: ${new Date(text.publishedAt).toISOString()}` : null,
    "---",
    "",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const parts: string[] = [frontmatter];

  if (text.subtitle) parts.push(`*${text.subtitle}*`, "");
  if (text.authorNote) parts.push(`> ${text.authorNote}`, "");

  // One note usually has a single chapter; multi-chapter notes become a
  // heading per chapter so the structure survives in Obsidian.
  chapters.forEach((chapter, i) => {
    const md = renderTipTapMarkdown(chapter.bodyJson);
    if (!md) return;
    if (chapters.length > 1) {
      parts.push(`## ${chapter.title || `بخش ${i + 1}`}`, "");
    }
    parts.push(md);
  });

  if (sourceLinks.length > 0) {
    parts.push("---", "", "## منابع", "");
    for (const link of sourceLinks) {
      parts.push(`- [${link.title || link.url}](${link.url})`);
    }
    parts.push("");
  }

  const body = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";

  // Safe ASCII filename from the slug so headers never break.
  const filename = `${text.slug}.md`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}