import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* Super admin — the platform owner (sees everything). A single row today. */
export const admins = sqliteTable("admins", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  googleSub: text("google_sub").unique(),
  createdAt: integer("created_at").notNull(),
});

/* Registered writers. Readers (family/friends) never register — they use the
   password-protected share links. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  nickname: text("nickname"),
  bio: text("bio"),
  avatar: text("avatar"),
  googleSub: text("google_sub").unique(),
  createdAt: integer("created_at").notNull(),
});

/* Per-user (or per-admin), Obsidian-like folder tree. parent_id allows
   unlimited nesting. owner_id (registered writer) XOR admin_id (super
   admin's personal tree) — exactly one is set. */
export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    adminId: text("admin_id").references(() => admins.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: text("parent_id").references(
      (): AnySQLiteColumn => folders.id,
      { onDelete: "cascade" },
    ),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_folders_owner").on(t.ownerId, t.parentId),
    index("idx_folders_admin").on(t.adminId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    adminId: text("admin_id").references(() => admins.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    lastUsedAt: integer("last_used_at"),
  },
  (t) => [
    index("idx_sessions_admin").on(t.adminId),
    index("idx_sessions_user").on(t.userId),
  ],
);

export const texts = sqliteTable(
  "texts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    authorNote: text("author_note"),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    direction: text("direction", { enum: ["rtl", "ltr"] }).notNull().default("rtl"),
    metaDescription: text("meta_description"),
    coverKey: text("cover_key"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    publishedAt: integer("published_at"),
  },
  (t) => [index("idx_texts_owner").on(t.ownerId)],
);

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    textId: text("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    title: text("title"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_chapters_text").on(t.textId)],
);

export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title"),
    bodyJson: text("body_json").notNull().default("{}"),
    note: text("note"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_versions_chapter").on(t.chapterId),
    uniqueIndex("idx_versions_chapter_number").on(t.chapterId, t.number),
  ],
);

export const drafts = sqliteTable("drafts", {
  chapterId: text("chapter_id")
    .primaryKey()
    .references(() => chapters.id, { onDelete: "cascade" }),
  title: text("title"),
  bodyJson: text("body_json").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});

/* Tags are personal — owner_id null means admin-owned (the original writer). */
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  nameFa: text("name_fa"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
});

export const textTags = sqliteTable(
  "text_tags",
  {
    textId: text("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [index("idx_text_tags_text").on(t.textId)],
);

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    textId: text("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    /** Full token (for admin to re-view/copy share URLs). Hash is used for lookup. */
    token: text("token").notNull().default("").unique(),
    label: text("label"),
    greeting: text("greeting"),
    passwordHash: text("password_hash"),
    pinnedVersionId: text("pinned_version_id"),
    /** One-time links open exactly once; after consumption only the browser
       that used them can finish within the grace window. */
    oneTime: integer("one_time", { mode: "boolean" }).notNull().default(false),
    /** When a one-time link was burned (millis). */
    consumedAt: integer("consumed_at"),
    status: text("status", { enum: ["active", "revoked", "consumed"] })
      .notNull()
      .default("active"),
    autoApproveComments: integer("auto_approve_comments", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Disable copy/selection on the reader and block printing (CSS-level). */
    protectContent: integer("protect_content", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
    lastUsedAt: integer("last_used_at"),
  },
  (t) => [index("idx_share_links_text").on(t.textId)],
);

/* Source/reference links attached to a text — the author's reading list shown
   as a tidy container under the note on the reader. Independent of share_links
   (those are access URLs; these are cited links referenced inside the body). */
export const textLinks = sqliteTable(
  "text_links",
  {
    id: text("id").primaryKey(),
    textId: text("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_text_links_text").on(t.textId)],
);

/* Reader likes — one per anonymous browser (per-reader cookie) per text. */
export const likes = sqliteTable(
  "likes",
  {
    id: text("id").primaryKey(),
    textId: text("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    shareLinkId: text("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    /** Per-browser anonymous reader id (matches the `frv` cookie). */
    readerId: text("reader_id").notNull().default(""),
    /** Optional display name the reader chose when liking ("" = anonymous). */
    authorName: text("author_name").notNull().default(""),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_likes_text_reader").on(t.textId, t.readerId),
    index("idx_likes_text").on(t.textId),
    index("idx_likes_link").on(t.shareLinkId),
  ],
);

/* Share a text to a specific registered writer (appears in their panel). */
export const textShares = sqliteTable(
  "text_shares",
  {
    id: text("id").primaryKey(),
    textId: text("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_text_shares_text_user").on(t.textId, t.userId),
    index("idx_text_shares_user").on(t.userId),
  ],
);

/* One-time invite codes for registration. The admin or any registered writer
   can create them (admin -> created_by, writer -> created_by_user_id). */
export const inviteCodes = sqliteTable(
  "invite_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    createdBy: text("created_by").references(() => admins.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    usedBy: text("used_by").references(() => users.id, { onDelete: "set null" }),
    usedAt: integer("used_at"),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_invite_codes_created_by_user").on(t.createdByUserId)],
);

/* Self-service password reset tokens (delivery needs an email provider). */
export const passwordResetCodes = sqliteTable("password_reset_codes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    textId: text("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    shareLinkId: text("share_link_id").references(() => shareLinks.id, {
      onDelete: "set null",
    }),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    body: text("body").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    replyToId: text("reply_to_id"),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at").notNull(),
    moderatedAt: integer("moderated_at"),
  },
  (t) => [
    index("idx_comments_version").on(t.versionId),
    index("idx_comments_text_status").on(t.textId, t.status),
  ],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/* Immutable audit trail of destructive and security-relevant actions. Rows
   are never updated or deleted — the log is append-only so "who did what,
   when" always survives. actor is "user:<id>" / "admin:<id>" / "reader" /
   null (anonymous). detail is free-form JSON. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    actor: text("actor"),
    target: text("target"),
    detail: text("detail"),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_audit_log_action_created").on(t.action, t.createdAt),
    index("idx_audit_log_actor").on(t.actor),
  ],
);

export const readSessions = sqliteTable(
  "read_sessions",
  {
    id: text("id").primaryKey(),
    shareLinkId: text("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    textId: text("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id").references(() => chapters.id, { onDelete: "cascade" }),
    readerLabel: text("reader_label"),
    startedAt: integer("started_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("idx_read_sessions_link").on(t.shareLinkId),
    index("idx_read_sessions_text").on(t.textId),
  ],
);