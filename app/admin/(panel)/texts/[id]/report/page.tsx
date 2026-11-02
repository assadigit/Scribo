import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { auth } from "@/lib/auth";
import { ReadingReport, type ReadingReportData } from "@/components/admin/reading-report";
import { dictionaries, type Dictionary } from "@/lib/i18n";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

/** Day key in UTC, matching the SQL `strftime('%Y-%m-%d', started_at/1000, 'unixepoch')` grouping. */
function utcDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

export default async function TextReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await auth.getCurrentAccount();
  if (!account) notFound();

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) notFound();

  // A registered writer may only see the report for their own text, or one
  // shared to them. The super admin sees any text.
  if (account.kind === "user") {
    const shared = await db()
      .select({ userId: schema.textShares.userId })
      .from(schema.textShares)
      .where(eq(schema.textShares.textId, id))
      .get();
    if (text.ownerId !== account.user.id && shared?.userId !== account.user.id) notFound();
  }

  const chapterRows = await db()
    .select({ id: schema.chapters.id, title: schema.chapters.title, position: schema.chapters.position })
    .from(schema.chapters)
    .where(eq(schema.chapters.textId, id))
    .orderBy(asc(schema.chapters.position));
  const chapterById = new Map(chapterRows.map((c) => [c.id, c]));

  const ANON = t.rrAnonymous;
  const readerKey = (label: string | null | undefined) => label?.trim() || ANON;

  // All aggregates are computed in SQL (GROUP BY) instead of pulling every
  // read-session row into memory — bounded regardless of history size.

  /* ------------------------------ totals ------------------------------ */
  const totals = await db()
    .select({
      sessions: sql<number>`COUNT(*)`,
      completed: sql<number>`SUM(CASE WHEN ${schema.readSessions.completed} THEN 1 ELSE 0 END)`,
      totalDurationMs: sql<number>`COALESCE(SUM(${schema.readSessions.durationMs}), 0)`,
      readers: sql<number>`COUNT(DISTINCT COALESCE(TRIM(${schema.readSessions.readerLabel}), ''))`,
    })
    .from(schema.readSessions)
    .where(eq(schema.readSessions.textId, id))
    .get();

  const totalSessions = Number(totals?.sessions ?? 0);
  const totalDurationMs = Number(totals?.totalDurationMs ?? 0);
  const completedCount = Number(totals?.completed ?? 0);
  const uniqueReaders = Number(totals?.readers ?? 0);

  /* ------------------------------ per-reader ------------------------------ */
  const readerRows = await db()
    .select({
      readerKey: sql<string>`COALESCE(TRIM(${schema.readSessions.readerLabel}), '')`,
      sessions: sql<number>`COUNT(*)`,
      completed: sql<number>`SUM(CASE WHEN ${schema.readSessions.completed} THEN 1 ELSE 0 END)`,
      totalDurationMs: sql<number>`COALESCE(SUM(${schema.readSessions.durationMs}), 0)`,
      lastSeenAt: sql<number>`MAX(${schema.readSessions.lastSeenAt})`,
    })
    .from(schema.readSessions)
    .where(eq(schema.readSessions.textId, id))
    .groupBy(sql`COALESCE(TRIM(${schema.readSessions.readerLabel}), '')`);

  // Distinct (reader, chapter) pairs — the small extra query that rebuilds the
  // "which chapters did this reader open" list without a join explosion.
  const readerChapterRows = await db()
    .selectDistinct({
      readerLabel: schema.readSessions.readerLabel,
      chapterId: schema.readSessions.chapterId,
    })
    .from(schema.readSessions)
    .where(eq(schema.readSessions.textId, id));

  const chaptersByReader = new Map<string, Set<string>>();
  for (const row of readerChapterRows) {
    const key = readerKey(row.readerLabel);
    let set = chaptersByReader.get(key);
    if (!set) {
      set = new Set();
      chaptersByReader.set(key, set);
    }
    if (row.chapterId) set.add(row.chapterId);
  }

  const readers = readerRows
    .map((r) => {
      const key = r.readerKey || ANON;
      const sessions = Number(r.sessions ?? 0);
      const completed = Number(r.completed ?? 0);
      const total = Number(r.totalDurationMs ?? 0);
      const chapterTitles = [...(chaptersByReader.get(key) ?? [])]
        .map((cid) => chapterById.get(cid)?.title || t.rrUntitled)
        .filter(Boolean);
      return {
        readerLabel: key,
        sessions,
        completed,
        totalDurationMs: total,
        avgDurationMs: sessions ? Math.round(total / sessions) : 0,
        lastSeenAt: r.lastSeenAt ? Number(r.lastSeenAt) : null,
        chapterTitles,
      };
    })
    .sort((a, b) => b.totalDurationMs - a.totalDurationMs);

  /* ------------------------------ per-chapter ----------------------------- */
  const chapterAgg = await db()
    .select({
      chapterId: schema.readSessions.chapterId,
      sessions: sql<number>`COUNT(*)`,
      totalDurationMs: sql<number>`COALESCE(SUM(${schema.readSessions.durationMs}), 0)`,
      readers: sql<number>`COUNT(DISTINCT COALESCE(TRIM(${schema.readSessions.readerLabel}), ''))`,
    })
    .from(schema.readSessions)
    .where(eq(schema.readSessions.textId, id))
    .groupBy(schema.readSessions.chapterId);

  const aggByChapter = new Map(
    chapterAgg.map((a) => [
      a.chapterId,
      { sessions: Number(a.sessions ?? 0), totalDurationMs: Number(a.totalDurationMs ?? 0), readers: Number(a.readers ?? 0) },
    ]),
  );

  const chapters: ReadingReportData["chapters"] = chapterRows.map((c) => {
    const agg = aggByChapter.get(c.id);
    const count = agg?.sessions ?? 0;
    const total = agg?.totalDurationMs ?? 0;
    return {
      chapterId: c.id,
      chapterTitle: c.title || t.rrUntitled,
      position: c.position,
      sessions: count,
      uniqueReaders: agg?.readers ?? 0,
      totalDurationMs: total,
      avgDurationMs: count ? Math.round(total / count) : 0,
    };
  });
  const orphan = aggByChapter.get(null);
  if (orphan) {
    chapters.push({
      chapterId: "none",
      chapterTitle: t.rrOrphanChapter,
      position: chapterRows.length,
      sessions: orphan.sessions,
      uniqueReaders: orphan.readers,
      totalDurationMs: orphan.totalDurationMs,
      avgDurationMs: orphan.sessions ? Math.round(orphan.totalDurationMs / orphan.sessions) : 0,
    });
  }

  /* ------------------------------ 30-day trend ----------------------------- */
  const since = Date.now() - 29 * DAY_MS;
  const dayAgg = await db()
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${schema.readSessions.startedAt}/1000, 'unixepoch')`,
      sessions: sql<number>`COUNT(*)`,
      readers: sql<number>`COUNT(DISTINCT COALESCE(TRIM(${schema.readSessions.readerLabel}), ''))`,
      durationMs: sql<number>`COALESCE(SUM(${schema.readSessions.durationMs}), 0)`,
    })
    .from(schema.readSessions)
    .where(and(eq(schema.readSessions.textId, id), gte(schema.readSessions.startedAt, since)))
    .groupBy(sql`strftime('%Y-%m-%d', ${schema.readSessions.startedAt}/1000, 'unixepoch')`);

  const aggByDay = new Map(
    dayAgg.map((d) => [
      d.day,
      { sessions: Number(d.sessions ?? 0), readers: Number(d.readers ?? 0), durationMs: Number(d.durationMs ?? 0) },
    ]),
  );

  const todayKey = utcDayKey(Date.now());
  const todayTs = Date.UTC(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)),
  );
  const days: { day: string; sessions: number; readers: number; durationMs: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = utcDayKey(todayTs - i * DAY_MS);
    const agg = aggByDay.get(key);
    days.push({
      day: key,
      sessions: agg?.sessions ?? 0,
      readers: agg?.readers ?? 0,
      durationMs: agg?.durationMs ?? 0,
    });
  }

  const data: ReadingReportData = {
    textTitle: text.title,
    totalSessions,
    uniqueReaders,
    totalDurationMs,
    avgSessionDurationMs: totalSessions ? Math.round(totalDurationMs / totalSessions) : 0,
    completedCount,
    completionRate: totalSessions ? completedCount / totalSessions : 0,
    readers,
    chapters,
    days,
  };

  return (
    <div className="flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/texts/${text.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
            {t.rrBack}
          </Link>
          <h1 className="mt-3 font-serif text-2xl font-medium tracking-tight">{t.rrTitle}</h1>
          <p className="mt-1 text-sm text-muted">{text.title}</p>
        </div>
      </header>
      <ReadingReport data={data} />
    </div>
  );
}
