import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import * as schema from "@/db/schema";
import { maybeRunCleanup } from "@/lib/cleanup";
import { newId, newSlug, newToken, newTokenPrefix } from "@/lib/ids";
import { linkTokenHash, shareUrl } from "@/lib/reader";
import { tipTapPlainText } from "@/lib/render";
import { getProtectContentDefault } from "@/lib/profile";


export async function GET() {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Opportunistic data-lifecycle sweep (at most once a day, fully caught).
  await maybeRunCleanup();

  const select = {
    id: schema.texts.id,
    slug: schema.texts.slug,
    title: schema.texts.title,
    subtitle: schema.texts.subtitle,
    status: schema.texts.status,
    direction: schema.texts.direction,
    metaDescription: schema.texts.metaDescription,
    createdAt: schema.texts.createdAt,
    updatedAt: schema.texts.updatedAt,
    publishedAt: schema.texts.publishedAt,
  };

  let rows;
  if (account.kind === "admin") {
    rows = await db()
      .select(select)
      .from(schema.texts)
      .orderBy(desc(schema.texts.updatedAt))
      .limit(100);
  } else {
    const userId = account.user.id;
    const sharedIds = db()
      .select({ textId: schema.textShares.textId })
      .from(schema.textShares)
      .where(eq(schema.textShares.userId, userId));
    rows = await db()
      .select(select)
      .from(schema.texts)
      .where(or(eq(schema.texts.ownerId, userId), inArray(schema.texts.id, sharedIds)))
      .orderBy(desc(schema.texts.updatedAt))
      .limit(100);
  }

  // Chapter counts in a single grouped pass instead of a correlated subquery
  // per row (avoids the N+1 on the dashboard list).
  const ids = rows.map((r) => r.id);
  let counts: Array<{ textId: string; count: number }> = [];
  if (ids.length > 0) {
    const grouped = await db()
      .select({ textId: schema.chapters.textId, count: sql<number>`COUNT(*)` })
      .from(schema.chapters)
      .where(inArray(schema.chapters.textId, ids))
      .groupBy(schema.chapters.textId);
    counts = grouped.map((g) => ({ textId: g.textId, count: Number(g.count) }));
  }
  const countByText = new Map(counts.map((c) => [c.textId, c.count]));

  // Plain-text excerpt from the first chapter's current version (200 chars).
  let bodies: Array<{ textId: string; bodyJson: string }> = [];
  if (ids.length > 0) {
    bodies = await db()
      .select({ textId: schema.chapters.textId, bodyJson: schema.versions.bodyJson })
      .from(schema.chapters)
      .innerJoin(
        schema.versions,
        and(
          eq(schema.versions.chapterId, schema.chapters.id),
          eq(schema.versions.isCurrent, true),
        ),
      )
      .where(and(eq(schema.chapters.position, 0), inArray(schema.chapters.textId, ids)));
  }
  const excerptByText = new Map(
    bodies.map((b) => [b.textId, tipTapPlainText(b.bodyJson).slice(0, 200)]),
  );
  const texts = rows.map((r) => ({
    ...r,
    chapterCount: countByText.get(r.id) ?? 0,
    excerpt: excerptByText.get(r.id) ?? "",
  }));

  return NextResponse.json({ texts });
}

type CreateBody = {
  title?: string;
  subtitle?: string;
  direction?: "rtl" | "ltr";
  metaDescription?: string;
  authorNote?: string;
  /** Draft / published / archived — takes precedence over `publish`. */
  status?: "draft" | "published" | "archived";
  /** TipTap JSON (object or JSON string) for the first chapter. */
  bodyJson?: unknown;
  /** Create a share link on publish (public token by default). */
  publish?: boolean;
  linkLabel?: string;
  linkGreeting?: string;
  linkPassword?: string;
  autoApproveComments?: boolean;
  /** One-time links open exactly once. */
  linkOneTime?: boolean;
  /** Disable copy/selection on the reader (CSS-level, best-effort). */
  linkProtectContent?: boolean;
  /** Optional parent folder (validated against the account). */
  folderId?: string;
};

export async function POST(request: Request) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });

  const id = newId();
  const timestamp = now();
  const direction = body.direction === "ltr" ? "ltr" : "rtl";
  const publish = Boolean(body.publish);
  const status =
    body.status === "published" || body.status === "archived"
      ? body.status
      : publish
        ? "published"
        : "draft";
  const ownerId = account.kind === "admin" ? null : account.user.id;

  // Normalise the optional first-chapter body.
  let bodyJson: string | null = null;
  if (body.bodyJson) {
    try {
      bodyJson = typeof body.bodyJson === "string" ? body.bodyJson : JSON.stringify(body.bodyJson);
    } catch {
      bodyJson = null;
    }
  }

  // Validate the optional folder belongs to the account before assigning it.
  let folderId: string | null = null;
  const rawFolderId = typeof body.folderId === "string" ? body.folderId.trim() : "";
  if (rawFolderId) {
    const folder = await db()
      .select()
      .from(schema.folders)
      .where(eq(schema.folders.id, rawFolderId))
      .get();
    const sameOwner =
      folder &&
      (account.kind === "admin"
        ? folder.adminId === account.admin.id
        : folder.ownerId === account.user.id);
    if (!sameOwner) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    folderId = folder.id;
  }

  await db().insert(schema.texts).values({
    id,
    slug: newSlug(title),
    title,
    subtitle: body.subtitle?.trim() || null,
    authorNote: body.authorNote?.trim() || null,
    metaDescription: body.metaDescription?.trim() || null,
    direction,
    status,
    ownerId,
    folderId,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: status === "published" ? timestamp : null,
  });

  // First chapter (position 0) always holds the initial body, as version #1,
  // so every text — even a title-only draft — resolves to a readable page.
  // bodyJson may be null (no editor body was sent), in which case the version
  // stores an empty document.
  const chapterId = newId();
  await db().insert(schema.chapters).values({
    id: chapterId,
    textId: id,
    position: 0,
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db().insert(schema.versions).values({
    id: newId(),
    chapterId,
    number: 1,
    title,
    bodyJson: bodyJson ?? "{}",
    isCurrent: true,
    createdAt: timestamp,
  });

  // Optional: publish a share link immediately (public token by default).
  let linkUrl: string | null = null;
  if (publish) {
    const token = newToken();
    const password = body.linkPassword?.trim();
    const passwordHash = password ? await auth.hashPassword(password) : null;
    // Copy/print protection defaults from the account's profile (ON by default).
    const protectContent = body.linkProtectContent ?? (await getProtectContentDefault(account));
    await db().insert(schema.shareLinks).values({
      id: newId(),
      textId: id,
      token,
      tokenHash: await linkTokenHash(token),
      tokenPrefix: newTokenPrefix(),
      label: body.linkLabel?.trim() || null,
      greeting: body.linkGreeting?.trim() || null,
      passwordHash,
      autoApproveComments: body.autoApproveComments ?? false,
      oneTime: body.linkOneTime ?? false,
      protectContent,
      status: "active",
      createdAt: timestamp,
    });
    linkUrl = shareUrl(token);
  }

  return NextResponse.json({ id, linkUrl, published: publish }, { status: 201 });
}