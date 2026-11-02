"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleNotch, LinkBreak, Plus } from "@phosphor-icons/react";
import { formatDate, toFa } from "@/lib/format";
import { useI18n } from "@/components/providers";

type Invite = {
  id: string;
  code: string;
  note: string | null;
  usedBy: string | null;
  usedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
};

/**
 * Invite-code management for a registered writer (shown on their profile).
 * Uses the same role-aware `/api/auth/invites` endpoints as the admin panel,
 * but only ever lists/creates/deletes the user's own codes.
 */
export function MyInvites() {
  const { t, locale } = useI18n();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));
  const [invites, setInvites] = useState<Invite[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  // Snapshot of “now” taken when data loads, so expiry is derived from state
  // instead of calling Date.now() during render (React purity rule).
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    setNowMs(Date.now());
    const res = await fetch("/api/auth/invites");
    if (res.ok) {
      const d = (await res.json()) as { codes: Invite[] };
      setInvites(d.codes);
    }
  }, []);

  useEffect(() => {
    // Initial fetch defined inline so no setState can run synchronously in
    // the effect body; event handlers reuse `load` above.
    let ignore = false;
    async function startFetch() {
      const res = await fetch("/api/auth/invites");
      setNowMs(Date.now());
      if (res.ok) {
        const d = (await res.json()) as { codes: Invite[] };
        if (!ignore) setInvites(d.codes);
      }
    }
    void startFetch();
    return () => {
      ignore = true;
    };
  }, []);

  async function createInvite() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/auth/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 1, note: note || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      const d = (await res.json()) as { codes: string[] };
      setFreshCode(d.codes[0] ?? null);
      setNotice(t.invCreated);
      setNote("");
      void load();
    } else {
      setNotice(t.invCreateFailed);
    }
  }

  async function revokeInvite(id: string) {
    if (!confirm(t.invRevokeConfirm)) return;
    const res = await fetch("/api/auth/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) void load();
  }

  return (
    <section className="flex max-w-xl flex-col gap-4 rounded-xl border border-border-subtle p-5">
      <header>
        <h2 className="text-sm font-medium">{t.invTitle}</h2>
        <p className="mt-1 text-xs text-muted">{t.invIntro}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted">{t.invNoteLabel}</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={60}
            placeholder={t.invNotePlaceholder}
            className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
          />
        </label>
        <button
          type="button"
          onClick={() => void createInvite()}
          disabled={busy}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <CircleNotch size={16} className="animate-spin" /> : <Plus size={16} />}
          {t.invCreateButton}
        </button>
      </div>
      {notice && <p className="text-xs text-muted">{notice}</p>}

      {freshCode && (
        <div className="flex flex-col gap-2 rounded-lg border border-foreground/50 bg-surface-muted p-3">
          <p className="text-xs text-muted">{t.invFreshLabel}</p>
          <code dir="ltr" className="w-fit rounded bg-surface px-2.5 py-1.5 text-sm">
            {freshCode}
          </code>
        </div>
      )}

      {invites.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <code dir="ltr" className="rounded bg-surface-muted px-2 py-1 text-xs">
                  {invite.code}
                </code>
                <span className="text-xs text-muted">
                  {invite.usedAt
                    ? t.invUsed.replace("{date}", formatDate(invite.usedAt))
                    : invite.expiresAt && invite.expiresAt < nowMs
                      ? t.invExpired
                      : invite.expiresAt
                        ? t.invUntil.replace("{date}", formatDate(invite.expiresAt))
                        : t.invActive}
                </span>
                {invite.note && <span className="text-xs text-muted">«{invite.note}»</span>}
              </div>
              {!invite.usedAt && (
                <button
                  type="button"
                  onClick={() => void revokeInvite(invite.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
                >
                  <LinkBreak size={14} />
                  {t.invRevoke}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {invites.length === 0 && !freshCode && (
        <p className="rounded-lg border border-dashed border-border-subtle py-6 text-center text-xs text-muted">
          {t.invEmpty.replace("{count}", num(0))}
        </p>
      )}
    </section>
  );
}
