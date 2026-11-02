import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { Scribo } from "@/components/icons/scribo";
import { LockScreen } from "@/components/reader/lock-screen";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { ReadingProgress } from "@/components/reader/reading-progress";
import { AuthorByline } from "@/components/reader/author-byline";
import { ChapterBody } from "@/components/reader/chapter-body";
import { ChapterComments, type CommentDto } from "@/components/reader/comments";
import { LikeButton } from "@/components/reader/like-button";
import { ReaderSourceLinks } from "@/components/reader/source-links";
import { ReadSessionTracker } from "@/components/reader/read-session-tracker";
import { LinkUnavailable } from "@/components/reader/link-unavailable";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { renderTipTapJson } from "@/lib/render";
import { localizeDigits } from "@/lib/format";
import { dictionaries, type Dictionary } from "@/lib/i18n";
import {
  appUrl,
  findLinkByToken,
  getLikeState,
  getTextWithChapters,
  isLinkViewable,
  readerCookiePresent,
  shareUrl,
} from "@/lib/reader";

/** Looks up link+text once for metadata, or the fallback when not found. */
async function resolveMetadata(token: string) {
  const link = await findLinkByToken(token);
  if (!link) return null;
  const data = await getTextWithChapters(link.textId);
  return { link, text: data?.text ?? null };
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const resolved = await resolveMetadata(token);
  const description =
    resolved?.text?.metaDescription ||
    resolved?.text?.subtitle ||
    "یک نوشته خصوصی از اسکریبو.";
  const url = shareUrl(token);
  return {
    title: resolved?.text?.title
      ? `${resolved.text.title} - Scribo`
      : "Scribo - Private Readings",
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    openGraph: {
      title: resolved?.text?.title ?? "Scribo",
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
      title: resolved?.text?.title ?? "Scribo",
      description,
      images: [`${appUrl()}/hero/og-cover.jpg`],
    },
  };
}

export default async function ReaderHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await findLinkByToken(token);

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];

  // A real-but-disabled link gets a gentle message; an unknown token is a 404.
  if (!link) notFound();
  if (!(await isLinkViewable(link, token))) {
    return <LinkUnavailable usedOnce={link.oneTime && link.status === "consumed"} />;
  }

  const unlocked = await readerCookiePresent(link, token);

  // Password-protected and not yet unlocked → lock screen.
  if (!unlocked) {
    return (
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <div className="flex flex-col items-center gap-3">
            <Scribo className="h-12 w-12 text-foreground" />
            <p className="font-serif text-2xl font-medium tracking-tight">{t.brand}</p>
            {link.greeting && (
              <p className="max-w-sm text-center text-sm text-muted">{link.greeting}</p>
            )}
          </div>
          <LockScreen token={token} />
        </main>
      </div>
    );
  }

  const data = await getTextWithChapters(link.textId);
  if (!data) notFound();
  const { text, chapters } = data;

  // Reader likes — one per anonymous browser (frv cookie) per text.
  const likeState = await getLikeState(link.textId);

  // The first chapter's body reads inline on the home page, so it needs the
  // same comment list and reading-time tracking as a dedicated chapter page.
  const firstChapter = chapters[0] ?? null;
  const inlineComments: CommentDto[] = firstChapter
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
            eq(schema.comments.versionId, firstChapter.versionId),
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
        className={`app-chrome page-turn mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-32${link.protectContent ? " reader-protected" : ""}`}
        dir={text.direction}
      >
        {link.greeting && (
          <p className="mb-8 font-serif text-lg italic text-muted">{link.greeting}</p>
        )}

        <h1 className="font-serif text-4xl font-medium leading-tight tracking-tight text-foreground md:text-5xl">
          {localizeDigits(text.title)}
        </h1>
        {text.subtitle && <p className="mt-3 text-base text-muted">{localizeDigits(text.subtitle)}</p>}

        <AuthorByline dir={text.direction} ownerId={text.ownerId} />

        {text.authorNote && (
          <p className="paper-sheet mt-8 px-5 py-4 text-sm leading-7 text-muted">
            {text.authorNote}
          </p>
        )}

        {/* The first chapter's body reads inline, right under the title — no
            extra click needed. This is the entire post: a shared link reveals
            exactly one note, never a list of other notes. */}
        {firstChapter && (
          <>
            <ChapterBody dir={text.direction} html={renderTipTapJson(firstChapter.bodyJson)} />
            <LikeButton
              token={token}
              textId={link.textId}
              initialCount={likeState.count}
              initialLiked={likeState.liked}
              initialMyName={likeState.myName}
              initialLikers={likeState.likers}
            />
            <ReaderSourceLinks links={data.links} locale={locale} />
            <ChapterComments
              token={token}
              chapterId={firstChapter.id}
              initialComments={inlineComments}
            />
            <ReadSessionTracker token={token} chapterId={firstChapter.id} />
          </>
        )}

        {chapters.length === 0 && (
          <p className="mt-10 text-sm text-muted">{t.readerNoChapters}</p>
        )}
      </main>

      <SiteFooter />

      <ReaderToolbar />
    </div>
  );
}
