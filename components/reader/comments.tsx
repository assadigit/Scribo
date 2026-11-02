"use client";

import { useState } from "react";
import { ChatCircle, CircleNotch, PaperPlaneTilt } from "@phosphor-icons/react";
import { formatDate, toFa } from "@/lib/format";
import { useI18n } from "@/components/providers";

export type CommentDto = {
  id: string;
  authorName: string;
  body: string;
  createdAt: number | null;
};

export function ChapterComments({
  token,
  chapterId,
  initialComments,
}: {
  token: string;
  chapterId: string;
  initialComments: CommentDto[];
}) {
  const { t, locale } = useI18n();
  const num = (n: number | string) => (locale === "fa" ? toFa(n) : String(n));
  const [comments, setComments] = useState<CommentDto[]>(initialComments);
  const [form, setForm] = useState({ name: "", email: "", body: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/r/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, chapterId, ...form }),
      });
      if (res.ok) {
        const data = (await res.json()) as { status: "approved" | "pending" };
        if (data.status === "approved") {
          setComments((prev) => [
            ...prev,
            {
              id: `local-${Date.now()}`,
              authorName: form.name.trim(),
              body: form.body.trim(),
              createdAt: Date.now(),
            },
          ]);
          setForm({ name: "", email: "", body: "", website: "" });
          setNotice(t.commentsSubmitted);
        } else {
          setForm({ name: "", email: "", body: "", website: "" });
          setNotice(t.commentsPending);
        }
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setNotice(
          data?.error === "rate_limited"
            ? t.commentsRateLimited
            : t.commentsSubmitError,
        );
      }
    } catch {
      setNotice(t.commentsConnectionError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12" aria-label={t.commentsAria}>
      <h2 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted">
        <ChatCircle size={14} />
        {t.commentsCount.replace("{count}", num(comments.length))}
      </h2>

      {comments.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t.commentsEmpty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-5">
          {comments.map((c) => (
            <li key={c.id} className="border-b border-border-subtle pb-5 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{c.authorName}</span>
                <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>
              </div>
              <p className="margin-note mt-1 leading-7">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.commentsNameLabel}</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={60}
              className="field-type w-full text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.commentsEmailLabel}</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              maxLength={200}
              className="field-type w-full text-sm"
            />
          </label>
        </div>
        {/* Honeypot — invisible to humans, irresistible to bots */}
        <label className="hidden" aria-hidden="true">
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">{t.commentsBodyLabel}</span>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            required
            rows={4}
            maxLength={4000}
            className="field-type w-full resize-y text-sm"
          />
        </label>
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={busy}
            className="btn-type btn-type-solid inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? <CircleNotch size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} />}
            {t.commentsSubmit}
          </button>
          {notice && <span className="text-xs text-muted">{notice}</span>}
        </div>
      </form>
    </section>
  );
}