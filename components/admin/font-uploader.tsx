"use client";

import { useRef, useState } from "react";
import { ArrowCounterClockwise, CircleNotch, Upload } from "@phosphor-icons/react";
import { useI18n } from "@/components/providers";

const ACCEPT = ".ttf,.otf,.woff,.woff2";
const MAX_BYTES = 3 * 1024 * 1024; // ~3MB upload cap (fits D1 fine)

const EXT_FORMAT: Record<string, string> = {
  ttf: "truetype",
  otf: "opentype",
  woff: "woff",
  woff2: "woff2",
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function FontUploader({
  current,
}: {
  current: { family: string; format: string } | null;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const format = EXT_FORMAT[ext];
    if (!format) {
      setError(t.fontUnsupportedFormat);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t.fontFileTooLarge);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      // A safe family name derived from the filename.
      const base = file.name.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N} _\u2013-]/gu, "").trim() || "Custom";
      const res = await fetch("/api/fonts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family: base.slice(0, 60), format, dataUrl }),
      });
      if (res.ok) {
        setNotice(t.fontUploaded);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === "invalid_family"
            ? t.fontInvalidFamily
            : data.error === "invalid_data"
              ? t.fontInvalidFile
              : t.fontUploadFailed,
        );
      }
    } catch {
      setError(t.fontReadFailed);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function reset() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/fonts", { method: "DELETE" });
      if (res.ok) {
        setNotice(t.fontResetDone);
      } else {
        setError(t.fontDeleteFailed);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-5 rounded-xl border border-border-subtle p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">
            {current ? (
              <>
                {t.fontActiveLabel} <span dir="auto" className="font-semibold">{current.family}</span>
              </>
            ) : (
              t.fontDefaultLabel
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {current ? t.fontFormatLabel.replace("{format}", current.format) : t.fontEmptyLabel}
          </p>
        </div>
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border-subtle text-xl font-semibold"
          style={{ fontFamily: current ? "initial" : "Vazirmatn" }}
        >
          آ
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFile}
        disabled={busy}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-subtle px-5 text-sm transition-colors hover:border-foreground disabled:opacity-50"
      >
        {busy ? <CircleNotch size={16} className="animate-spin" /> : <Upload size={16} />}
        {t.fontChooseUpload}
      </button>

      {current && (
        <button
          type="button"
          disabled={busy}
          onClick={reset}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-subtle px-5 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
        >
          <ArrowCounterClockwise size={15} />
          {t.fontResetButton}
        </button>
      )}

      {(notice || error) && (
        <p className={`text-xs ${error ? "text-foreground" : "text-muted"}`}>
          {error ?? notice}
        </p>
      )}
    </div>
  );
}