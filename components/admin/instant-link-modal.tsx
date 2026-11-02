"use client";

import { useState } from "react";
import { CircleNotch, Copy, EnvelopeSimple, X } from "@phosphor-icons/react";
import { useI18n } from "@/components/providers";

/**
 * “Instant link” modal — opened from a post's row in the list. Mirrors the
 * create-form of the ShareLinks panel: reader label, greeting, password,
 * auto-approve and one-time flags. On success shows the fresh URL with
 * copy + native-mail buttons.
 */
export function InstantLinkModal({
  textId,
  title,
  onClose,
}: {
  textId: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const [form, setForm] = useState({ label: "", greeting: "", password: "" });
  const [autoApprove, setAutoApprove] = useState(false);
  const [oneTime, setOneTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [freshLabel, setFreshLabel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

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
    } else {
      setNotice(t.shareNoticeError);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.linkModalTitle.replace("{title}", title)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-4xl border border-border-subtle bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg font-medium tracking-tight">
            {t.linkModalTitle.replace("{title}", title)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.shareClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-4xl text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {freshUrl ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">{t.shareFreshLabel}</p>
            <div className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="min-w-0 flex-1 truncate rounded-4xl bg-surface-muted px-4 py-3 text-xs">
                {freshUrl}
              </code>
              <button
                type="button"
                onClick={() => copy(freshUrl)}
                className="inline-flex h-10 items-center gap-1.5 rounded-4xl border border-border-subtle px-4 text-xs transition-colors hover:border-foreground"
              >
                <Copy size={14} />
                {t.shareCopy}
              </button>
              <button
                type="button"
                onClick={() => mailtoShare(freshUrl, freshLabel || undefined)}
                className="inline-flex h-10 items-center gap-1.5 rounded-4xl border border-border-subtle px-4 text-xs transition-colors hover:border-foreground"
              >
                <EnvelopeSimple size={14} />
                {t.shareEmail}
              </button>
            </div>
            {notice && <p className="text-xs text-muted">{notice}</p>}
            <button
              type="button"
              onClick={onClose}
              className="mt-2 inline-flex h-10 items-center justify-center rounded-4xl bg-accent px-6 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              {t.shareClose}
            </button>
          </div>
        ) : (
          <form onSubmit={create} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">{t.shareReaderLabel}</span>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="h-11 rounded-4xl border border-border-subtle bg-surface px-4 outline-none focus:border-foreground"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">{t.shareGreetingLabel}</span>
              <input
                value={form.greeting}
                onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                className="h-11 rounded-4xl border border-border-subtle bg-surface px-4 outline-none focus:border-foreground"
              />
            </label>
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted">{t.sharePasswordLabel}</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="h-11 rounded-4xl border border-border-subtle bg-surface px-4 outline-none focus:border-foreground"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>{t.shareAutoApprove}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={oneTime}
                  onChange={(e) => setOneTime(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>{t.shareOneTimeLabel}</span>
              </label>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-4xl bg-accent px-6 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy && <CircleNotch size={16} className="animate-spin" />}
                {busy ? t.shareBusy : t.shareCreate}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-4xl border border-border-subtle px-6 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
              >
                {t.shareClose}
              </button>
              {notice && <span className="text-xs text-muted">{notice}</span>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
