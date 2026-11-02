"use client";

import { useState } from "react";
import { ArrowCounterClockwise, Check, CircleNotch, Trash, X } from "@phosphor-icons/react";
import { formatDate, toFa } from "@/lib/format";
import { useI18n } from "@/components/providers";

export type CommentDto = {
  id: string;
  chapterId: string;
  chapterTitle: string | null;
  versionNumber: number | null;
  authorName: string;
  authorEmail: string | null;
  body: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number | null;
  moderatedAt: number | null;
};

export function CommentsPanel({ initialComments }: { initialComments: CommentDto[] }) {
  const { t, locale } = useI18n();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));

  const [comments, setComments] = useState<CommentDto[]>(() => {
    const order = { pending: 0, approved: 1, rejected: 2 } as const;
    return [...initialComments].sort((a, b) => order[a.status] - order[b.status]);
  });
  const [busy, setBusy] = useState(false);

  const statusLabel = (status: CommentDto["status"]) =>
    status === "pending"
      ? t.cmpStatusPending
      : status === "approved"
        ? t.cmpStatusApproved
        : t.cmpStatusRejected;

  async function setStatus(id: string, status: CommentDto["status"]) {
    setBusy(true);
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (res.ok) {
      const data = (await res.json()) as { comment: { id: string; status: CommentDto["status"]; moderatedAt: number | null } };
      setComments((prev) =>
        prev.map((c) =>
          c.id === data.comment.id
            ? { ...c, status: data.comment.status, moderatedAt: data.comment.moderatedAt }
            : c,
        ),
      );
    }
  }

  async function remove(id: string) {
    if (!confirm(t.cmpDeleteConfirm)) return;
    setBusy(true);
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border-subtle p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">
          {t.cmpCommentsCount.replace("{count}", num(comments.length))}
        </h2>
        {busy && <CircleNotch size={14} className="animate-spin text-muted" />}
      </div>

      {comments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-subtle py-10 text-center text-sm text-muted">
          {t.cmpEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className={
                c.status === "pending"
                  ? "flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-muted p-4"
                  : "flex flex-col gap-2 rounded-lg border border-border-subtle p-4 opacity-80"
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{c.authorName}</span>
                {c.authorEmail && (
                  <span className="text-muted" dir="ltr">
                    {c.authorEmail}
                  </span>
                )}
                <span
                  className={
                    c.status === "pending"
                      ? "rounded-full border border-border-subtle px-2 py-0.5 font-medium"
                      : "rounded-full border border-border-subtle px-2 py-0.5 text-muted"
                  }
                >
                  {statusLabel(c.status)}
                </span>
                <span className="text-muted">
                  {t.cmpChapterOn
                    .replace("{title}", c.chapterTitle || `#${c.chapterId.slice(0, 8)}`)
                    .replace("{v}", c.versionNumber !== null ? num(c.versionNumber) : "—")}
                </span>
                <span className="text-muted">{formatDate(c.createdAt)}</span>
              </div>
              <p className="text-sm leading-7">{c.body}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {c.status !== "approved" && (
                  <button
                    type="button"
                    onClick={() => setStatus(c.id, "approved")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 transition-colors hover:border-foreground"
                  >
                    <Check size={14} />
                    {t.cmpApprove}
                  </button>
                )}
                {c.status !== "rejected" && (
                  <button
                    type="button"
                    onClick={() => setStatus(c.id, "rejected")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground"
                  >
                    <X size={14} />
                    {t.cmpReject}
                  </button>
                )}
                {c.status !== "pending" && (
                  <button
                    type="button"
                    onClick={() => setStatus(c.id, "pending")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground"
                  >
                    <ArrowCounterClockwise size={14} />
                    {t.cmpBackToPending}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground"
                >
                  <Trash size={14} />
                  {t.cmpDelete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
