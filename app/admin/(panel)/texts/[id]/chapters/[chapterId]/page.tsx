import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { ChapterEditor } from "@/components/editor/chapter-editor";
import { dictionaries, type Dictionary } from "@/lib/i18n";


export default async function ChapterEditorPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const { id, chapterId } = await params;

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) notFound();

  const chapter = await db()
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .get();
  if (!chapter || chapter.textId !== id) notFound();

  const versions = await db()
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.chapterId, chapterId))
    .orderBy(desc(schema.versions.number));

  const draft = await db()
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.chapterId, chapterId))
    .get();

  return (
    <div className="flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/admin" className="underline-offset-4 hover:underline">
          {t.edBreadcrumbDashboard}
        </Link>
        <span>/</span>
        <Link href={`/admin/texts/${id}`} className="underline-offset-4 hover:underline">
          {text.title}
        </Link>
        <span>/</span>
        <span className="text-foreground">{t.edBreadcrumbEditor}</span>
      </header>
      <ChapterEditor
        direction={text.direction}
        textId={id}
        chapter={chapter}
        versions={versions.map((v) => ({
          id: v.id,
          number: v.number,
          title: v.title,
          bodyJson: v.bodyJson,
          note: v.note,
          isCurrent: v.isCurrent,
          createdAt: v.createdAt,
        }))}
        draft={
          draft
            ? { title: draft.title, bodyJson: draft.bodyJson, updatedAt: draft.updatedAt }
            : null
        }
      />
    </div>
  );
}