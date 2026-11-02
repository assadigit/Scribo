"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleNotch, FloppyDisk, Key, LinkBreak, Plus, Trash, X } from "@phosphor-icons/react";
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

type ManagedUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  nickname: string | null;
  createdAt: number;
  noteCount: number;
};

export function UsersManager() {
  const { t, locale } = useI18n();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));

  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [freshCodes, setFreshCodes] = useState<string[]>([]);
  const [resetFor, setResetFor] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  // Snapshot of “now” taken when data loads, so expiry is derived from state
  // instead of calling Date.now() during render (React purity rule).
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    setNowMs(Date.now());
    const [inviteRes, userRes] = await Promise.all([
      fetch("/api/auth/invites"),
      fetch("/api/admin/users"),
    ]);
    if (inviteRes.ok) {
      const d = (await inviteRes.json()) as { codes: Invite[] };
      setInvites(d.codes);
    }
    if (userRes.ok) {
      const d = (await userRes.json()) as { users: ManagedUser[] };
      setUsers(d.users);
    }
  }, []);

  useEffect(() => {
    // Initial fetch defined inline so no setState can run synchronously in
    // the effect body; event handlers reuse `load` above.
    let ignore = false;
    async function startFetch() {
      const [inviteRes, userRes] = await Promise.all([
        fetch("/api/auth/invites"),
        fetch("/api/admin/users"),
      ]);
      setNowMs(Date.now());
      if (inviteRes.ok) {
        const d = (await inviteRes.json()) as { codes: Invite[] };
        if (!ignore) setInvites(d.codes);
      }
      if (userRes.ok) {
        const d = (await userRes.json()) as { users: ManagedUser[] };
        if (!ignore) setUsers(d.users);
      }
    }
    void startFetch();
    return () => {
      ignore = true;
    };
  }, []);

  async function createInvites() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/auth/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        count,
        note: note || undefined,
        expiresInDays: expiresDays ? Number(expiresDays) : undefined,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const d = (await res.json()) as { codes: string[] };
      setFreshCodes(d.codes);
      setNotice(t.usersCreateSuccess.replace("{count}", num(d.codes.length)));
      setNote("");
      void load();
    } else {
      setNotice(t.usersCreateFailed);
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

  async function resetPassword() {
    if (!resetFor || busy || newPassword.length < 8) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/admin/users/${resetFor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    setBusy(false);
    if (res.ok) {
      setNotice(t.usersResetDone.replace("{name}", resetFor.displayName));
      setResetFor(null);
      setNewPassword("");
    } else {
      setNotice(t.usersResetFailed);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (!confirm(t.usersDeleteConfirm.replace("{name}", user.displayName))) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      setNotice(t.usersDeleted);
      void load();
    } else {
      setNotice(t.usersDeleteFailed);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Invite codes */}
      <section className="flex flex-col gap-4 rounded-xl border border-border-subtle p-5">
        <h2 className="text-sm font-medium text-muted">{t.usersInvitesSection}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.usersCountLabel}</span>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.usersNoteLabel}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.usersNotePlaceholder}
              className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">{t.usersExpiryLabel}</span>
            <input
              type="number"
              min={1}
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder={t.usersExpiryPlaceholder}
              className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void createInvites()}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <CircleNotch size={16} className="animate-spin" /> : <Plus size={16} />}
            {t.invCreateButton}
          </button>
          {notice && <span className="text-xs text-muted">{notice}</span>}
        </div>

        {freshCodes.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-foreground/50 bg-surface-muted p-3">
            <p className="text-xs text-muted">{t.usersFreshCodes}</p>
            <div className="flex flex-wrap gap-2">
              {freshCodes.map((code) => (
                <code key={code} dir="ltr" className="rounded bg-surface px-2.5 py-1.5 text-xs">
                  {code}
                </code>
              ))}
            </div>
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
      </section>

      {/* Registered writers */}
      <section className="flex flex-col gap-4 rounded-xl border border-border-subtle p-5">
        <h2 className="text-sm font-medium text-muted">
          {t.usersRegisteredHeading.replace("{count}", num(users.length))}
        </h2>
        {users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-subtle py-10 text-center text-sm text-muted">
            {t.usersEmpty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {users.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {user.displayName}
                    {user.nickname && user.nickname !== user.displayName && (
                      <span className="text-xs font-normal text-muted"> ({user.nickname})</span>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    <span dir="ltr">@{user.username}</span>
                    {user.email ? <span> · {user.email}</span> : null} ·{" "}
                    {t.usersMemberSince.replace("{date}", formatDate(user.createdAt))} ·{" "}
                    {t.superNotesLabel.replace("{count}", num(user.noteCount))}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setResetFor(user);
                      setNewPassword("");
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground"
                  >
                    <Key size={14} />
                    {t.usersPasswordReset}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteUser(user)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground"
                  >
                    <Trash size={14} />
                    {t.usersDeleteBtn}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {resetFor && (
          <form
            className="flex flex-wrap items-center gap-3 rounded-lg border border-foreground/50 bg-surface-muted p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void resetPassword();
            }}
          >
            <span className="text-sm">{t.usersNewPasswordLabel.replace("{name}", resetFor.displayName)}</span>
            <input
              type="password"
              autoFocus
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.usersPasswordPlaceholder}
              className="h-10 min-w-48 flex-1 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
            />
            <button
              type="submit"
              disabled={busy || newPassword.length < 8}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <CircleNotch size={16} className="animate-spin" /> : <FloppyDisk size={16} />}
              {t.usersSave}
            </button>
            <button
              type="button"
              onClick={() => setResetFor(null)}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-subtle px-4 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
            >
              <X size={14} />
              {t.usersCancel}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}