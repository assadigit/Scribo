"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleNotch, Lock } from "@phosphor-icons/react";
import { useI18n } from "@/components/providers";

export function LockScreen({ token }: { token: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/r/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          data?.error === "rate_limited"
            ? t.lockRateLimited
            : t.lockInvalidPassword,
        );
        setPassword("");
      }
    } catch {
      setError(t.lockConnectionError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-xs flex-col gap-4 rounded-xl border border-border-subtle p-6"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle text-muted">
        <Lock size={20} />
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">{t.lockPrompt}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="h-11 rounded-md border border-border-subtle bg-surface px-3 text-center outline-none focus:border-foreground"
        />
      </label>
      {error && <p className="text-xs text-muted">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <CircleNotch size={16} className="animate-spin" /> : <Lock size={15} />}
        {t.lockSubmit}
      </button>
    </form>
  );
}
