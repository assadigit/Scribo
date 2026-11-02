"use client";

import { useRef, useState } from "react";
import { CircleNotch, FloppyDisk, Image as ImageIcon, Trash, UserCircle } from "@phosphor-icons/react";
import type { AuthorProfile } from "@/lib/profile";
import { useI18n } from "@/components/providers";

const SIZE = 384; // cover-cropped square avatar

/** Downscale/crop an uploaded image to a 384×384 JPEG data URL (client-side). */
function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas context");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable image"));
    };
    img.src = url;
  });
}

export function ProfileEditor({
  initial,
  protectContentDefault,
}: {
  initial: AuthorProfile;
  /** Profile-level default: block copy & print on new share links. */
  protectContentDefault: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial.name);
  const [nickname, setNickname] = useState(initial.nickname ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [avatar, setAvatar] = useState<string | null>(initial.avatar);
  const [protectOn, setProtectOn] = useState(protectContentDefault);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Only accept raster images; everything else is rejected here.
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError(t.profileInvalidImage);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t.profileImageTooLarge);
      return;
    }
    try {
      const dataUrl = await resizeToDataUrl(file);
      setAvatar(dataUrl);
      setNotice(t.profileImageSelected);
    } catch {
      setError(t.profileImageReadFailed);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError(t.profileNameRequired);
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        nickname: nickname.trim(),
        bio: bio.trim(),
        avatar,
        protectContentDefault: protectOn,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setNotice(t.profileSaved);
    } else {
      setError(
        ((await res.json().catch(() => ({}))) as { error?: string }).error === "invalid_avatar"
          ? t.profileInvalidAvatar
          : t.profileSaveFailed,
      );
    }
  }

  return (
    <form onSubmit={save} className="flex max-w-xl flex-col gap-5 rounded-xl border border-border-subtle p-5">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-muted">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={t.profileAvatarAlt} className="h-full w-full object-cover" />
          ) : (
            <UserCircle size={28} className="text-muted" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border-subtle px-4 text-xs transition-colors hover:border-foreground"
          >
            <ImageIcon size={14} />
            {t.profileChoosePhoto}
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => {
                setAvatar(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border-subtle px-4 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
            >
              <Trash size={14} />
              {t.profileRemovePhoto}
            </button>
          )}
        </div>
      </div>

      {/* Nickname */}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">{t.profileNicknameLabel}</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={40}
          className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
          placeholder={t.profileNicknamePlaceholder}
        />
      </label>

      {/* Name */}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">{t.profileNameLabel}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
          placeholder={t.profileNamePlaceholder}
        />
      </label>

      {/* Bio */}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">{t.profileBioLabel}</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={300}
          rows={3}
          className="rounded-md border border-border-subtle bg-surface px-3 py-2 outline-none focus:border-foreground"
          placeholder={t.profileBioPlaceholder}
        />
      </label>

      {/* Default copy/print protection on new share links */}
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-subtle bg-surface-muted/50 p-4 text-sm">
        <input
          type="checkbox"
          checked={protectOn}
          onChange={(e) => setProtectOn(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span className="flex flex-col gap-1">
          <span>{t.profileProtectLabel}</span>
          <span className="text-xs leading-5 text-muted">{t.profileProtectHint}</span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <CircleNotch size={16} className="animate-spin" /> : <FloppyDisk size={16} />}
          {t.profileSaveButton}
        </button>
        {notice && <span className="text-xs text-muted">{notice}</span>}
        {error && <span className="text-xs text-foreground">{error}</span>}
      </div>
    </form>
  );
}