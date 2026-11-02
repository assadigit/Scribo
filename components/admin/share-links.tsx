"use client";

import { useState } from "react";
import { ArrowsClockwise, Copy, EnvelopeSimple, LinkBreak, LinkSimple, Trash, X } from "@phosphor-icons/react";
import type { shareLinks } from "@/db/schema";
import { toFa } from "@/lib/format";
import { useI18n } from "@/components/providers";

type Link = typeof shareLinks.$inferSelect;

type LinkDto = {
  id: string;
  label: string | null;
  greeting: string | null;
  tokenPrefix: string | null;
  status: "active" | "revoked" | "consumed";
  oneTime: boolean;
  consumedAt: number | null;
  autoApproveComments: boolean;
  protectContent: boolean;
  hasPassword: boolean;
  url: string | null;
  createdAt: number | null;
};

function toDto(l: Link): LinkDto {
  return {
    id: l.id,
    label: l.label,
    greeting: l.greeting,
    tokenPrefix: l.tokenPrefix,
    status: l.status,
    oneTime: l.oneTime,
    consumedAt: l.consumedAt,
    autoApproveComments: l.autoApproveComments,
    protectContent: Boolean(l.protectContent),
    hasPassword: Boolean(l.passwordHash),
    url: l.token ? `/r/${l.token}` : null,
    createdAt: l.createdAt,
  };
}

export function ShareLinks({
  textId,
  initialLinks,
}: {
  textId: string;
  initialLinks: Link[];
}) {
  const { t, locale } = useI18n();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));

  const [links, setLinks] = useState<LinkDto[]>(() => initialLinks.map(toDto));
  const [form, setForm] = useState({ label: "", greeting: "", password: "" });
  const [autoApprove, setAutoApprove] = useState(false);
  const [oneTime, setOneTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [freshLabel, setFreshLabel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/texts/${textId}/links`);
    if (res.ok) {
      const data = (await res.json()) as { links: LinkDto[] };
      setLinks(data.links);
    }
  }

  function fullUrl(path: string) {
    // Already absolute (e.g. after a refresh that returned an absolute URL).
    if (/^https?:\/\//i.test(path)) return path;
    return `${window.location.origin}${path}`;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t.shareCopied);
    } catch {
      setNotice(t.shareCopyFailed);
    }
  }

  /** Native mail app share — no Gmail required. */
  function mailtoShare(url: string, label?: string | null) {
    const subject = encodeURIComponent(
      label
        ? t.shareMailSubjectNamed.replace("{label}", label)
        : t.shareMailSubject,
    );
    const body = encodeURIComponent(t.shareMailBody.replace("{url}", url));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/texts/${textId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: form.label || undefined,
        greeting: form.greeting || undefined,
        password: form.password || undefined,
        autoApproveComments: autoApprove,
        oneTime,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const data = (await res.json()) as { link: { url: string } };
      setFreshUrl(data.link.url);
      setFreshLabel(form.label.trim());
      setForm({ label: "", greeting: "", password: "" });
      setAutoApprove(false);
      setOneTime(false);
      await refresh();
    } else {
      setNotice(t.shareNoticeError);
    }
  }

  async function regenerate(link: LinkDto) {
    if (!confirm(t.shareRegenerateConfirm)) return;
    const res = await fetch(`/api/texts/${textId}/links/${link.id}/regenerate`, {
      method: "POST",
    });
    if (res.ok) {
      const data = (await res.json()) as { link: { url: string } };
      setFreshUrl(data.link.url);
      setFreshLabel(link.label ?? "");
      await refresh();
    } else {
      setNotice(t.shareConsumedBlocked);
    }
  }

  async function toggleStatus(link: LinkDto) {
    if (link.status === "consumed") return; // burned one-time links are final
    const res = await fetch(`/api/texts/${textId}/links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: link.status === "active" ? "revoked" : "active",
      }),
    });
    if (res.ok) await refresh();
  }

  async function remove(link: LinkDto) {
    if (!confirm(t.shareDeleteConfirm.replace("{label}", link.label || t.shareUnnamed))) return;
    const res = await fetch(`/api/texts/${textId}/links/${link.id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border-subtle p-5">
      <h2 className="text-sm font-medium text-muted">
        {t.shareTitle.replace("{count}", num(links.length))}
      </h2>

      {/* Create form */}
      <form onSubmit={create} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.shareReaderLabel}</span>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.shareGreetingLabel}</span>
            <input
              value={form.greeting}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.sharePasswordLabel}</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
          </label>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="h-4 w-4"
            />
            <span>{t.shareAutoApprove}</span>
          </label>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={oneTime}
              onChange={(e) => setOneTime(e.target.checked)}
              className="h-4 w-4"
            />
            <span>{t.shareOneTimeLabel}</span>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t.shareBusy : t.shareCreate}
          </button>
          {notice && <span className="text-xs text-muted">{notice}</span>}
        </div>
      </form>

      {/* Freshly created/regenerated link */}
      {freshUrl && (
        <div className="flex flex-col gap-2 rounded-md border border-accent bg-surface-muted p-3">
          <p className="text-xs text-muted">{t.shareFreshLabel}</p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 truncate rounded bg-surface px-3 py-2 text-xs">
              {freshUrl}
            </code>
            <button
              type="button"
              onClick={() => copy(freshUrl)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border-subtle px-4 text-xs transition-colors hover:border-foreground"
            >
              <Copy size={14} />
              {t.shareCopy}
            </button>
            <button
              type="button"
              onClick={() => mailtoShare(freshUrl, freshLabel || undefined)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border-subtle px-4 text-xs transition-colors hover:border-foreground"
            >
              <EnvelopeSimple size={14} />
              {t.shareEmail}
            </button>
            <button
              type="button"
              onClick={() => {
                setFreshUrl(null);
                setFreshLabel("");
              }}
              aria-label={t.shareClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Link list */}
      {links.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-subtle py-10 text-center text-sm text-muted">
          {t.shareEmpty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {links.map((link) => (
            <li key={link.id} className="flex flex-col gap-2 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{link.label || t.shareUnnamed}</span>
                <span
                  className={
                    link.status === "active"
                      ? "rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-muted"
                      : "rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-muted line-through"
                  }
                >
                  {link.status === "active"
                    ? t.shareActive
                    : link.status === "consumed"
                      ? t.shareConsumed
                      : t.shareRevoked}
                </span>
                {link.oneTime && (
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-muted">
                    {t.shareOneTimeBadge}
                  </span>
                )}
                {link.hasPassword && (
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-muted">
                    {t.shareLocked}
                  </span>
                )}
                {link.autoApproveComments && (
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-muted">
                    {t.shareFreeComments}
                  </span>
                )}
                {link.protectContent && (
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-muted">
                    {t.shareProtectBadge}
                  </span>
                )}
              </div>
              {link.greeting && <p className="text-xs text-muted">«{link.greeting}»</p>}
              {link.url && (
                <div className="flex items-center gap-2">
                  <code dir="ltr" className="flex-1 truncate rounded bg-surface-muted px-3 py-1.5 text-xs">
                    {link.url}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(fullUrl(link.url!))}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs transition-colors hover:border-foreground"
                  >
                    <Copy size={14} />
                    {t.shareCopy}
                  </button>
                  <button
                    type="button"
                    onClick={() => mailtoShare(fullUrl(link.url!), link.label)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs transition-colors hover:border-foreground"
                  >
                    <EnvelopeSimple size={14} />
                    {t.shareEmail}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => regenerate(link)}
                  disabled={link.status === "consumed"}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowsClockwise size={14} />
                  {t.shareRegenerate}
                </button>
                <button
                  type="button"
                  onClick={() => toggleStatus(link)}
                  disabled={link.status === "consumed"}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {link.status === "active" ? <LinkBreak size={14} /> : <LinkSimple size={14} />}
                  {link.status === "active" ? t.shareToggleRevoke : t.shareToggleActive}
                </button>
                <button
                  type="button"
                  onClick={() => remove(link)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground"
                >
                  <Trash size={14} />
                  {t.shareDelete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}