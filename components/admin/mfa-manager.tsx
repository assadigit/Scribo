"use client";

import { useState } from "react";
import { Check, CircleNotch, Copy, Plus, Prohibit, ShieldCheck } from "@phosphor-icons/react";
import { useI18n } from "@/components/providers";

export function MfaManager({ enabled: initialEnabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setup, setSetup] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clear() {
    setError(null);
    setNotice(null);
  }

  async function beginSetup() {
    clear();
    setBusy(true);
    try {
      const res = await fetch("/api/mfa", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { otpauthUrl?: string; secret?: string };
      if (res.ok && data.otpauthUrl && data.secret) {
        setSetup({ otpauthUrl: data.otpauthUrl, secret: data.secret });
        setNotice(t.mfaAddHint);
      } else {
        setError(t.mfaSetupFailed);
      }
    } catch {
      setError(t.mfaServerError);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    clear();
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t.mfaCodeIncomplete);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mfa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        setEnabled(true);
        setSetup(null);
        setCode("");
        setNotice(t.mfaEnabledNotice);
      } else {
        setError(t.mfaWrongCode);
      }
    } catch {
      setError(t.mfaServerError);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    clear();
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t.mfaDisableDesc);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        setEnabled(false);
        setCode("");
        setNotice(t.mfaDisabledNotice);
      } else {
        setError(t.mfaWrongCode);
      }
    } catch {
      setError(t.mfaServerError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-5 rounded-xl border border-border-subtle p-5">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldCheck size={16} />
          {enabled ? t.mfaStatusEnabled : t.mfaStatusDisabled}
        </p>
        <p className="mt-1 text-xs text-muted">
          {enabled
            ? t.mfaOnDesc
            : t.mfaOffDesc}
        </p>
      </div>

      {!enabled && !setup && (
        <button
          type="button"
          disabled={busy}
          onClick={beginSetup}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-subtle px-5 text-sm transition-colors hover:border-foreground disabled:opacity-50"
        >
          {busy ? <CircleNotch size={16} className="animate-spin" /> : <Plus size={16} />}
          {t.mfaEnableButton}
        </button>
      )}

      {setup && (
        <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-muted p-4">
          <p className="text-xs text-muted">{t.mfaSetupDesc}</p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 break-all rounded border border-border-subtle bg-background px-2 py-1.5 text-xs">
              {setup.secret}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(setup.secret)}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-border-subtle px-3 text-xs transition-colors hover:border-foreground"
            >
              <Copy size={14} />
              {t.mfaCopy}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="code"
              className="h-10 w-32 rounded-md border border-border-subtle bg-surface px-3 text-center text-sm outline-none focus:border-foreground"
            />
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <CircleNotch size={16} className="animate-spin" /> : <Check size={16} />}
              {t.mfaConfirmEnable}
            </button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            {t.mfaDisableDesc}
          </p>
          <div className="flex items-center gap-2">
            <input
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit"
              className="h-10 w-32 rounded-md border border-border-subtle bg-surface px-3 text-center text-sm outline-none focus:border-foreground"
            />
            <button
              type="button"
              disabled={busy}
              onClick={disable}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-subtle px-4 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
            >
              {busy ? <CircleNotch size={16} className="animate-spin" /> : <Prohibit size={16} />}
              {t.mfaDisableButton}
            </button>
          </div>
        </div>
      )}

      {(notice || error) && (
        <p className={`text-xs ${error ? "text-foreground" : "text-muted"}`}>{error ?? notice}</p>
      )}
    </div>
  );
}