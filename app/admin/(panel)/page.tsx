import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  formatDurationMs,
  formatLocalDate,
  formatRelativeTime,
  toFa,
} from "@/lib/format";
import { Workspace, type WorkspaceFolder, type WorkspaceText } from "@/components/admin/workspace";
import { DashboardTypewriter } from "@/components/admin/dashboard-typewriter";
import { DashboardClock } from "@/components/admin/dashboard-clock";
import { getAuthorProfile } from "@/lib/profile";
import { dictionaries, type Dictionary } from "@/lib/i18n";
import { ArrowLeft, Camera, UserCircle } from "@phosphor-icons/react/dist/ssr";


const TEXT_COLUMNS = {
  id: schema.texts.id,
  slug: schema.texts.slug,
  title: schema.texts.title,
  subtitle: schema.texts.subtitle,
  status: schema.texts.status,
  direction: schema.texts.direction,
  folderId: schema.texts.folderId,
  updatedAt: schema.texts.updatedAt,
  publishedAt: schema.texts.publishedAt,
};

type DashboardText = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: (typeof schema.texts.$inferSelect)["status"];
  direction: (typeof schema.texts.$inferSelect)["direction"];
  folderId: string | null;
  updatedAt: number;
  publishedAt: number | null;
  shared?: boolean;
};

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const account = await auth.getCurrentAccount();
  if (!account) redirect("/auth/login");

  // Dashboard profile hero: the super admin's profile lives in the settings
  // table, a registered writer's on their users row — same shape (name,
  // nickname, bio, avatar), mirroring the profile editor.
  const profile =
    account.kind === "admin"
      ? await getAuthorProfile()
      : {
          name: account.user.displayName,
          nickname: account.user.nickname,
          bio: account.user.bio,
          avatar: account.user.avatar,
        };
  const profileName = profile.name || (account.kind === "admin" ? account.admin.username : account.user.username);

  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value === "en" ? "en" : "fa") as "fa" | "en";
  const t: Dictionary = dictionaries[locale];
  const num = (n: number | string) => (locale === "fa" ? toFa(n) : String(n));

  const texts: DashboardText[] = [];
  // The super admin's OWN texts (ownerId IS NULL — platform-level notes they
  // personally write) feed their personal folder workspace; the platform-wide
  // list stays available in /admin/texts.
  const ownTexts: DashboardText[] = [];

  if (account.kind === "admin") {
    // Super admin sees every text on the platform.
    texts.push(
      ...(await db()
        .select(TEXT_COLUMNS)
        .from(schema.texts)
        .orderBy(desc(schema.texts.updatedAt))),
    );
    ownTexts.push(
      ...(await db()
        .select(TEXT_COLUMNS)
        .from(schema.texts)
        .where(sql`${schema.texts.ownerId} IS NULL`)
        .orderBy(desc(schema.texts.updatedAt))),
    );
  } else {
    // A registered writer sees their own texts plus texts shared to them.
    const userId = account.user.id;
    const [own, shared] = await Promise.all([
      db()
        .select(TEXT_COLUMNS)
        .from(schema.texts)
        .where(eq(schema.texts.ownerId, userId))
        .orderBy(desc(schema.texts.updatedAt)),
      db()
        .select(TEXT_COLUMNS)
        .from(schema.textShares)
        .innerJoin(schema.texts, eq(schema.textShares.textId, schema.texts.id))
        .where(eq(schema.textShares.userId, userId))
        .orderBy(desc(schema.texts.updatedAt)),
    ]);
    const ownedIds = new Set(own.map((t) => t.id));
    texts.push(...own);
    for (const t of shared) {
      if (!ownedIds.has(t.id)) texts.push({ ...t, shared: true });
    }
  }

  // Folder tree for the workspace: registered writers own via ownerId, the
  // super admin via adminId.
  const folders: WorkspaceFolder[] =
    account.kind === "admin"
      ? await db()
          .select({
            id: schema.folders.id,
            name: schema.folders.name,
            parentId: schema.folders.parentId,
          })
          .from(schema.folders)
          .where(eq(schema.folders.adminId, account.admin.id))
          .orderBy(asc(schema.folders.position))
      : account.kind === "user"
        ? await db()
            .select({
              id: schema.folders.id,
              name: schema.folders.name,
              parentId: schema.folders.parentId,
            })
            .from(schema.folders)
            .where(eq(schema.folders.ownerId, account.user.id))
            .orderBy(asc(schema.folders.position))
        : [];

  const textIds = texts.map((t) => t.id);

  let avgReadMs: { value: number | null } | undefined;
  if (account.kind === "admin") {
    avgReadMs = await db()
      .select({ value: sql<number>`AVG(${schema.readSessions.durationMs})` })
      .from(schema.readSessions)
      .where(eq(schema.readSessions.completed, true))
      .get();
  } else if (textIds.length > 0) {
    avgReadMs = await db()
      .select({ value: sql<number>`AVG(${schema.readSessions.durationMs})` })
      .from(schema.readSessions)
      .where(
        and(
          eq(schema.readSessions.completed, true),
          inArray(schema.readSessions.textId, textIds),
        ),
      )
      .get();
  }

  const lastSession = await db()
    .select({
      id: schema.readSessions.id,
      readerLabel: schema.readSessions.readerLabel,
      durationMs: schema.readSessions.durationMs,
      lastSeenAt: schema.readSessions.lastSeenAt,
    })
    .from(schema.readSessions)
    .where(
      account.kind === "admin"
        ? undefined
        : inArray(schema.readSessions.textId, textIds),
    )
    .orderBy(desc(schema.readSessions.lastSeenAt))
    .limit(1)
    .get();

  const pending = await db()
    .select({ value: sql<number>`COUNT(*)` })
    .from(schema.comments)
    .where(eq(schema.comments.status, "pending"))
    .get();

  const latest = texts[0] ?? null;

  return (
    <div className="relative">
      {/* Vintage typewriter artwork, dead-center behind the dashboard content */}
      <DashboardTypewriter />
      <div className="relative z-10 flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-medium tracking-tight">{t.dashTitle}</h1>
          <p className="mt-1 text-sm text-muted">
            {texts.length === 0
              ? t.dashSummaryEmpty
              : t.dashSummaryCount.replace("{count}", num(texts.length))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Live date + time, driven by the user's device clock */}
          <DashboardClock />
          <Link
            href="/admin/texts"
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05),0_14px_30px_-16px_rgba(0,0,0,0.22)] transition-opacity hover:opacity-90"
          >
            {t.newTextTitle}
          </Link>
        </div>
      </header>

      {/* Profile hero + reading report in one container: identity beside the
          avatar circle, then a hairline and a minimal text-only report line
          (latest post + counts). No separate chip cards — those were visually
          competing with the folder boxes below. */}
      <section className="rounded-xl border border-border-subtle bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-muted sm:h-36 sm:w-36">
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt={t.profileAvatarAlt} className="h-full w-full object-cover" />
            ) : (
              <UserCircle size={64} className="text-muted" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-xl font-medium tracking-tight">{profileName}</p>
            {profile.nickname && (
              <p className="mt-0.5 text-sm text-muted">@{profile.nickname}</p>
            )}
            {profile.bio && (
              <p className="mt-1 line-clamp-2 text-sm leading-[1.6] text-muted">{profile.bio}</p>
            )}
            <Link
              href="/admin/profile"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
            >
              <Camera size={13} aria-hidden="true" />
              {t.profileChoosePhoto}
            </Link>
          </div>
        </div>

        {/* Reading report — plain text, no cards. */}
        <div
          role="region"
          aria-label={t.dashReportAria}
          className="mt-5 border-t border-border-subtle pt-4"
        >
          {latest ? (
            <Link
              href={`/admin/texts/${latest.id}`}
              className="group flex min-w-0 items-center gap-2"
            >
              <span className="shrink-0 text-xs text-muted">{t.dashCardLatestText}</span>
              <span className="min-w-0 truncate text-sm font-medium tracking-tight text-start transition-colors group-hover:text-foreground group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4 [unicode-bidi:plaintext]">
                {latest.title}
              </span>
              <span className="ms-auto shrink-0 text-xs tabular-nums text-muted">
                {formatLocalDate(latest.updatedAt, locale)}
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted">{t.dashSummaryEmpty}</p>
          )}

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="tabular-nums">{t.dashCardTexts}: {num(texts.length)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {t.dashCardAvgRead}:{" "}
              {avgReadMs?.value != null
                ? formatDurationMs(avgReadMs.value, locale)
                : t.dashCardAvgReadSubEmpty}
            </span>
            <span aria-hidden="true">·</span>
            {lastSession ? (
              <span>
                {t.dashCardLatestReader}: {lastSession.readerLabel} ·{" "}
                {formatRelativeTime(lastSession.lastSeenAt, locale)}
              </span>
            ) : (
              <span>{t.dashCardLatestReaderSubEmpty}</span>
            )}
          </p>
        </div>
      </section>

      {/* Pending comments strip */}
      {(pending?.value ?? 0) > 0 && (
        <Link
          href={latest ? `/admin/texts/${latest.id}` : "/admin"}
          className="flex items-center justify-between gap-3 rounded-xl border border-foreground/60 bg-surface p-4 transition-colors hover:bg-surface-muted"
        >
          <span className="text-sm font-medium">
            {t.dashPendingComments.replace("{count}", num(pending?.value ?? 0))}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {t.dashReviewArrow}
            <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </span>
        </Link>
      )}

      {/* Folder workspace (Obsidian-style tree + NotebookLM boxes): registered
          writers organize their own texts; the super admin organizes their own
          platform-level notes (ownerId IS NULL). The platform-wide list stays
          available in /admin/texts. */}
      {(account.kind === "admin" ? ownTexts : texts).length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <Workspace
          texts={(account.kind === "admin" ? ownTexts : texts) as WorkspaceText[]}
          folders={folders}
        />
      )}
      </div>
    </div>
  );
}

function EmptyState({ t }: { t: Dictionary }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border-subtle py-24 text-center">
      <div>
        <p className="text-sm text-muted">{t.dashSummaryEmpty}</p>
        <p className="mt-1 text-xs text-muted">{t.dashEmptyBody}</p>
      </div>
      <Link
        href="/admin/texts"
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        {t.dashEmptyCta}
      </Link>
    </section>
  );
}
