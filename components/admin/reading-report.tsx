"use client";

import { useMemo } from "react";
import { ChartBar, Clock, Timer, Users } from "@phosphor-icons/react";
import { formatDurationMs, formatLocalDate, formatRelativeTime, toFa } from "@/lib/format";
import { useCalendar, useI18n } from "@/components/providers";

export type ReportReader = {
  readerLabel: string;
  sessions: number;
  completed: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastSeenAt: number | null;
  chapterTitles: string[];
};

export type ReportChapter = {
  chapterId: string;
  chapterTitle: string;
  position: number;
  sessions: number;
  uniqueReaders: number;
  totalDurationMs: number;
  avgDurationMs: number;
};

export type ReportDay = {
  day: string;
  sessions: number;
  readers: number;
  durationMs: number;
};

export type ReadingReportData = {
  textTitle: string;
  totalSessions: number;
  uniqueReaders: number;
  totalDurationMs: number;
  avgSessionDurationMs: number;
  completedCount: number;
  completionRate: number;
  readers: ReportReader[];
  chapters: ReportChapter[];
  days: ReportDay[];
};

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-border-subtle bg-surface p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </p>
      <div>
        <p className="font-serif text-xl font-medium leading-snug tracking-tight">{value}</p>
        {sub && <p className="mt-1 text-[11px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface p-5">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function ReadingReport({ data }: { data: ReadingReportData }) {
  const { locale, t } = useI18n();
  const { calendar } = useCalendar();
  const num = (n: number | string) => (locale === "fa" ? toFa(n) : String(n));
  const listSep = locale === "fa" ? "، " : ", ";

  const maxDaySessions = useMemo(
    () => Math.max(1, ...data.days.map((d) => d.sessions)),
    [data.days],
  );

  const activityDays = useMemo(() => data.days.filter((d) => d.sessions > 0).length, [data.days]);

  const completionPct = Math.round(data.completionRate * 100);

  return (
    <div className="flex flex-col gap-6">
      {/* Aggregate bento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.rrTotalSessions} value={num(data.totalSessions)} sub={t.rrTotalSessionsSub} icon={<Clock size={14} />} />
        <StatCard
          label={t.rrUniqueReaders}
          value={num(data.uniqueReaders)}
          sub={t.rrUniqueReadersSub.replace("{count}", num(data.completedCount))}
          icon={<Users size={14} />}
        />
        <StatCard
          label={t.rrAvgTime}
          value={formatDurationMs(data.avgSessionDurationMs, locale)}
          sub={t.rrAvgTimeSub}
          icon={<Timer size={14} />}
        />
        <StatCard
          label={t.rrTotalTime}
          value={formatDurationMs(data.totalDurationMs, locale)}
          sub={
            data.uniqueReaders
              ? t.rrTotalTimeSub.replace("{percent}", num(completionPct))
              : `${num(completionPct)}%`
          }
          icon={<ChartBar size={14} />}
        />
      </div>

      {/* Per-reader breakdown */}
      <SectionCard title={t.rrReadersHeading.replace("{count}", num(data.readers.length))}>
        {data.readers.length === 0 ? (
          <EmptyState label={t.rrEmpty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-muted">
                  <th className="pb-2.5 font-medium">{t.rrReadersTableName}</th>
                  <th className="pb-2.5 font-medium">{t.rrReadersTableSessions}</th>
                  <th className="pb-2.5 font-medium">{t.rrReadersTableTotal}</th>
                  <th className="pb-2.5 font-medium">{t.rrReadersTableAvg}</th>
                  <th className="pb-2.5 font-medium">{t.rrReadersTableLast}</th>
                  <th className="pb-2.5 font-medium">{t.rrReadersTableOpened}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.readers.map((r) => (
                  <tr key={r.readerLabel}>
                    <td className="py-3">
                      <span className="font-medium">{r.readerLabel}</span>
                      <span className="ms-2 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-muted">
                        {r.completed > 0 ? t.rrComplete : t.rrIncomplete}
                      </span>
                    </td>
                    <td className="py-3 tabular-nums">{num(r.sessions)}</td>
                    <td className="py-3 whitespace-nowrap">{formatDurationMs(r.totalDurationMs, locale)}</td>
                    <td className="py-3 whitespace-nowrap">{formatDurationMs(r.avgDurationMs, locale)}</td>
                    <td className="py-3 whitespace-nowrap text-muted">
                      {r.lastSeenAt ? formatRelativeTime(r.lastSeenAt, locale) : "—"}
                    </td>
                    <td className="py-3 max-w-56">
                      <p className="line-clamp-2 text-muted">{r.chapterTitles.join(listSep) || "—"}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Per-chapter breakdown */}
      <SectionCard title={t.rrChaptersHeading.replace("{count}", num(data.chapters.length))}>
        {data.chapters.length === 0 ? (
          <p className="text-sm text-muted">{t.rrChaptersEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-muted">
                  <th className="pb-2.5 font-medium">{t.rrChaptersTablePos}</th>
                  <th className="pb-2.5 font-medium">{t.rrChaptersTableText}</th>
                  <th className="pb-2.5 font-medium">{t.rrChaptersTableSessions}</th>
                  <th className="pb-2.5 font-medium">{t.rrChaptersTableReaders}</th>
                  <th className="pb-2.5 font-medium">{t.rrChaptersTableTotal}</th>
                  <th className="pb-2.5 font-medium">{t.rrChaptersTableAvg}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.chapters.map((c) => (
                  <tr key={c.chapterId}>
                    <td className="py-3 text-muted">{num(c.position + 1)}</td>
                    <td className="py-3 font-medium">{c.chapterTitle}</td>
                    <td className="py-3 tabular-nums">{num(c.sessions)}</td>
                    <td className="py-3 tabular-nums">{num(c.uniqueReaders)}</td>
                    <td className="py-3 whitespace-nowrap">{formatDurationMs(c.totalDurationMs, locale)}</td>
                    <td className="py-3 whitespace-nowrap">{formatDurationMs(c.avgDurationMs, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* 30-day activity trend */}
      <SectionCard title={t.rrActivityTitle.replace("{count}", num(activityDays))}>
        <div
          className="flex items-end gap-[3px]"
          style={{ height: 72 }}
          role="img"
          aria-label={t.rrActivityAria}
        >
          {data.days.map((d) => {
            const h = Math.round((d.sessions / maxDaySessions) * 64) || (d.sessions > 0 ? 4 : 2);
            const dateLabel = formatLocalDate(Date.parse(d.day + "T00:00:00"), locale, calendar);
            return (
              <div
                key={d.day}
                title={
                  d.sessions
                    ? t.rrActivityTooltip
                        .replace("{date}", dateLabel)
                        .replace("{sessions}", num(d.sessions))
                        .replace("{duration}", formatDurationMs(d.durationMs, locale))
                    : dateLabel
                }
                className={`flex-1 rounded-sm transition-colors ${
                  d.sessions > 0 ? "bg-foreground/70" : "bg-border-subtle/50"
                }`}
                style={{ height: h }}
              />
            );
          })}
        </div>
        <p className="text-[11px] text-muted">{t.rrActivityHint}</p>
      </SectionCard>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border-subtle py-10 text-center text-sm text-muted">
      {label}
    </p>
  );
}
