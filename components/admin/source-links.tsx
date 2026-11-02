"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, LinkSimple, Plus, Trash } from "@phosphor-icons/react";
import { useI18n } from "@/components/providers";
import { toFa } from "@/lib/format";

export type SourceLinkDto = {
  id: string;
  url: string;
  title: string | null;
  position: number;
};

function displayTitle(link: SourceLinkDto): string {
  if (link.title) return link.title;
  try {
    return new URL(link.url).hostname;
  } catch {
    return link.url;
  }
}

export function SourceLinks({
  textId,
  initialLinks,
}: {
  textId: string;
  initialLinks: SourceLinkDto[];
}) {
  const { t, locale } = useI18n();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));

  const [links, setLinks] = useState<SourceLinkDto[]>(initialLinks);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/texts/${textId}/source-links`);
    if (res.ok) {
      const data = (await res.json()) as { links: SourceLinkDto[] };
      setLinks(data.links);
    }
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setError(t.srcInvalidUrl);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/texts/${textId}/source-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed, title: title || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      setUrl("");
      setTitle("");
      setNotice(t.srcSaved);
      await refresh();
    } else {
      setNotice(t.srcNoticeError);
    }
  }

  async function move(index: number, delta: -1 | 1) {
    const next = [...links];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLinks(next);
    await fetch(`/api/texts/${textId}/source-links/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((l) => l.id) }),
    });
    await refresh();
  }

  async function remove(link: SourceLinkDto) {
    if (!confirm(t.srcDeleteConfirm)) return;
    const res = await fetch(`/api/texts/${textId}/source-links/${link.id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border-subtle p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-muted">
        <LinkSimple size={15} aria-hidden="true" />
        {t.srcTitle.replace("{count}", num(links.length))}
      </h2>

      {/* Add form */}
      <form onSubmit={addLink} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.srcUrlLabel}</span>
            <input
              dir="ltr"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://…"
              className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.srcTitleLabel}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={15} aria-hidden="true" />
            {t.srcAdd}
          </button>
          {error && <span className="text-xs text-amber-600">{error}</span>}
          {!error && notice && <span className="text-xs text-muted">{notice}</span>}
        </div>
      </form>

      {/* Link list */}
      {links.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-subtle py-10 text-center text-sm text-muted">
          {t.srcEmpty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {links.map((link, index) => (
            <li key={link.id} className="flex items-center gap-3 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle text-[11px] text-muted">
                {num(index + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayTitle(link)}</p>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="block truncate text-xs text-muted transition-colors hover:text-foreground"
                >
                  {link.url}
                </a>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t.srcMoveUp}
                  title={t.srcMoveUp}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === links.length - 1}
                  aria-label={t.srcMoveDown}
                  title={t.srcMoveDown}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(link)}
                  aria-label={t.srcDelete}
                  title={t.srcDelete}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  <Trash size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
