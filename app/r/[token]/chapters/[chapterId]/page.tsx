import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { Scribo } from "@/components/icons/scribo";
import { LockScreen } from "@/components/reader/lock-screen";
import { ChapterBody } from "@/components/reader/chapter-body";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { ReadingProgress } from "@/components/reader/reading-progress";
import { ChapterComments, type CommentDto } from "@/components/reader/comments";
import { LikeButton } from "@/components/reader/like-button";
import { ReaderSourceLinks } from "@/components/reader/source-links";
import { ReadSessionTracker } from "@/components/reader/read-session-tracker";
import { LinkUnavailable } from "@/components/reader/link-unavailable";
import { AuthorByline } from "@/components/reader/author-byline";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { renderTipTapJson } from "@/lib/render";
import { localizeDigits, toFa } from "@/lib/format";
import { dictionaries, type Dictionary } from "@/lib/i18n";
import {
  appUrl,
  findLinkByToken,
  getChapterWithVersion,
  getLikeState,
  getTextLinks,
  isLinkViewable,
  readerCookiePresent,
  shareUrl,
} from "@/lib/reader";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string; chapterId: string }>;
}): Promise<Metadata> {
  const { token, chapterId } = await params;
  const link = await findLinkByToken(token);
  const text = link
    ? await db().select().from(schema.texts).where(eq(schema.texts.id, link.textId)).get()
    : null;
  const chapter = link ? await db().select().from(schema.chapters).where(eq(schema.chapters.id, chapterId)).get() : null;
  const description =
    text?.metaDescription || text?.subtitle || "یک نوشته خصوصی از اسکریبو.";
  const url = `${shareUrl(token)}/chapters/${chapterId}`;
  const title = chapter?.title || text?.title || "Scribo";
  return {
    title: `${title} — Scribo`,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Scribo",
      type: "article",
      images: [
        {
          url: `${appUrl()}/hero/og-cover.jpg`,
          width: 1200,
          height: 630,
          alt: "Scribo",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${appUrl()}/hero/og-cover.jpg`],
    },
  };
}

export default async function ReaderChapterPage({
  params,
}: {
  params: Promise<{ token: string; chapterId: string }>;
}) {
  const { token, chapterId } = await params;
  const link = await findLinkByToken(token);

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));
  const t: Dictionary = dictionaries[locale];

  if (!link) notFound();
  if (!(await isLinkViewable(link, token))) {
    return <LinkUnavailable usedOnce={link.oneTime && link.status === "consumed"} />;
  }

  const unlocked = await readerCookiePresent(link, token);
  if (!unlocked) {
    return (
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <div className="flex flex-col items-center gap-3">
            <Scribo className="h-12 w-12 text-foreground" />
            <p className="font-serif text-2xl font-medium tracking-tight">{t.brand}</p>
          </div>
          <LockScreen token={token} />
        </main>
      </div>
    );
  }

  const text = await db()
    .select()
    .from(schema.texts)
    .where(eq(schema.texts.id, link.textId))
    .get();
  if (!text) notFound();

  const { chapter, version } = (await getChapterWithVersion(text.id, chapterId)) ?? {};
  if (!chapter) notFound();

  const sourceLinks = await getTextLinks(text.id);

  // Reader likes — one per anonymous browser (frv cookie) per text.
  const likeState = await getLikeState(text.id);

  // Approved comments on the chapter's current version, oldest first.
  const approvedComments: CommentDto[] = version
    ? await db()
        .select({
          id: schema.comments.id,
          authorName: schema.comments.authorName,
          body: schema.comments.body,
          createdAt: schema.comments.createdAt,
        })
        .from(schema.comments)
        .where(
          and(
            eq(schema.comments.versionId, version.id),
            eq(schema.comments.status, "approved"),
          ),
        )
        .orderBy(asc(schema.comments.createdAt))
    : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <ReadingProgress />

      <main
        className={`mx-auto w-full max-w-2xl flex-1 px-6 py-10 pb-32${link.protectContent ? " reader-protected" : ""}`}
        dir={text.direction}
      >
        <p className="text-xs uppercase tracking-widest text-muted">{localizeDigits(text.title)}</p>
        <h1 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
          {localizeDigits(chapter.title || t.detailUntitledChapter.replace("{n}", num(1)))}
        </h1>

        <AuthorByline dir={text.direction} ownerId={text.ownerId} />

        {version ? (
          <ChapterBody dir={text.direction} html={renderTipTapJson(version.bodyJson)} />
        ) : (
          <p className="reader-page mt-10 text-sm text-muted">{t.readerNotPublished}</p>
        )}

        <LikeButton
          token={token}
          textId={text.id}
          initialCount={likeState.count}
          initialLiked={likeState.liked}
          initialMyName={likeState.myName}
          initialLikers={likeState.likers}
        />

        <ReaderSourceLinks links={sourceLinks} locale={locale} />

        {version && (
          <ChapterComments
            token={token}
            chapterId={chapter.id}
            initialComments={approvedComments}
          />
        )}

        {/* Reading-time analytics (only on authored content). */}
        {version && <ReadSessionTracker token={token} chapterId={chapter.id} />}
      </main>

      <SiteFooter />

      <ReaderToolbar />
    </div>
  );
}
