"use client";

import { useState } from "react";
import { CircleNotch, Heart } from "@phosphor-icons/react";
import { toFa } from "@/lib/format";
import { useI18n } from "@/components/providers";

type LikeResponse = {
  ok: boolean;
  liked: boolean;
  count: number;
  myName: string;
  likers: string[];
};

/** Deterministic pastel hue for a name — same person always gets the same color. */
function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Initials for the avatar circle: first char of the first two words. */
function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  const first = Array.from(parts[0])[0] ?? "";
  if (parts.length === 1) return first;
  return first + (Array.from(parts[1])[0] ?? "");
}

/**
 * Reader like button — one like per anonymous browser (frv cookie) per text.
 * Toggles via /api/r/likes; count, liked state, the reader's own name and the
 * newest named likers come back in the response. On the first like the reader
 * gets a one-time inline prompt to attach a name (LinkedIn-style likers row).
 */
export function LikeButton({
  token,
  textId,
  initialCount,
  initialLiked,
  initialMyName = "",
  initialLikers = [],
}: {
  token: string;
  textId: string;
  initialCount: number;
  initialLiked: boolean;
  initialMyName?: string;
  initialLikers?: string[];
}) {
  const { t, locale } = useI18n();
  const num = (n: number | string) => (locale === "fa" ? toFa(n) : String(n));
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [likers, setLikers] = useState<string[]>(initialLikers);
  const [busy, setBusy] = useState(false);
  const [needsName, setNeedsName] = useState(initialLiked && !initialMyName);
  const [nameInput, setNameInput] = useState("");
  const [nameBusy, setNameBusy] = useState(false);

  const title = liked ? t.likesLikedTitle : t.likesNotLikedTitle;
  const countLabel =
    count === 1
      ? t.likesCountOne.replace("{count}", num(1))
      : t.likesCountMany.replace("{count}", num(count));

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/r/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, textId }),
      });
      if (res.ok) {
        const data = (await res.json()) as LikeResponse;
        setLiked(data.liked);
        setCount(data.count);
        setLikers(data.likers);
        setNeedsName(data.liked && !data.myName);
      }
    } catch {
      // Keep current state; the next click simply retries.
    } finally {
      setBusy(false);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (nameBusy || !name) return;
    setNameBusy(true);
    try {
      const res = await fetch("/api/r/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, textId, name }),
      });
      if (res.ok) {
        const data = (await res.json()) as LikeResponse;
        setCount(data.count);
        setLikers(data.likers);
        setNeedsName(false);
      }
    } catch {
      // Keep the prompt open; the reader can retry.
    } finally {
      setNameBusy(false);
    }
  }

  const shown = likers.slice(0, 5);
  const overflow = Math.max(0, count - shown.length);

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={liked}
          aria-label={title}
          title={title}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border-subtle bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-foreground disabled:opacity-50"
        >
          {busy ? (
            <CircleNotch size={18} className="animate-spin" />
          ) : (
            <Heart
              size={18}
              weight={liked ? "fill" : "regular"}
              className={liked ? "text-red-400" : "text-muted"}
            />
          )}
          <span>{t.likesLabel}</span>
        </button>
        <span className="text-sm text-muted">{countLabel}</span>
      </div>

      {shown.length > 0 && (
        <div className="mt-3 flex items-center gap-2.5">
          <div className="flex" aria-label={t.likesLikersAria} title={t.likesLikersAria}>
            {shown.map((name, i) => (
              <span
                key={`${name}-${i}`}
                title={name}
                className={`liker-avatar flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium ring-2 ring-surface ${i === 0 ? "ms-0" : "-ms-2"}`}
                style={{ "--avatar-hue": avatarHue(name) } as React.CSSProperties}
              >
                {avatarInitials(name)}
              </span>
            ))}
          </div>
          {overflow > 0 && (
            <span className="text-xs text-muted">{t.likesMore.replace("{count}", num(overflow))}</span>
          )}
        </div>
      )}

      {needsName && (
        <form onSubmit={saveName} className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t.likesNamePrompt}</span>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            maxLength={60}
            placeholder={t.likesNamePlaceholder}
            className="h-9 w-44 rounded-md border border-border-subtle bg-surface px-3 text-sm outline-none focus:border-foreground"
          />
          <button
            type="submit"
            disabled={nameBusy || !nameInput.trim()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {nameBusy ? <CircleNotch size={14} className="animate-spin" /> : null}
            {t.likesNameSave}
          </button>
          <button
            type="button"
            onClick={() => setNeedsName(false)}
            className="text-xs text-muted hover:text-foreground"
          >
            {t.likesNameSkip}
          </button>
        </form>
      )}
    </div>
  );
}