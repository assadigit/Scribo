"use client";

import { useState } from "react";
import { FolderSimple, Plus, Stack } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatRelativeTime, toFa } from "@/lib/format";
import { useI18n } from "@/components/providers";
import type { WorkspaceFolder, WorkspaceText } from "./workspace";

/**
 * NotebookLM-style folder boxes for the writer dashboard: one card per folder
 * showing its note count and latest edit, plus an "All notes" card. Clicking a
 * card filters the text list in `Workspace` (shares its selection state). A
 * dashed "new folder" tile opens an inline name field — creation is one step.
 */

type FolderBoxesProps = {
  folders: WorkspaceFolder[];
  texts: WorkspaceText[];
  selected: string | "all" | "unfiled";
  onSelect: (id: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => Promise<boolean>;
};

export function FolderBoxes({ folders, texts, selected, onSelect, onCreateFolder }: FolderBoxesProps) {
  const { t, locale } = useI18n();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // Per-folder stats: note count + newest update timestamp.
  const stats = new Map<string, { count: number; latest: number }>();
  let allLatest = 0;
  for (const text of texts) {
    if (text.updatedAt > allLatest) allLatest = text.updatedAt;
    if (!text.folderId) continue;
    const s = stats.get(text.folderId) ?? { count: 0, latest: 0 };
    s.count += 1;
    if (text.updatedAt > s.latest) s.latest = text.updatedAt;
    stats.set(text.folderId, s);
  }

  // A manila-folder silhouette: small top radius + header strip, so folder
  // boxes read as FOLDERS, not as another text/log box.
  const cardClass = (active: boolean) =>
    cn(
      "group flex flex-col overflow-hidden rounded-b-xl rounded-t-[4px] border text-start transition-colors",
      active
        ? "border-foreground ring-1 ring-foreground"
        : "border-border-subtle bg-surface hover:border-foreground/60",
    );
  const headerClass = (active: boolean) =>
    cn(
      "flex items-center gap-2 px-3 py-2",
      active ? "bg-accent/10 text-foreground" : "bg-surface-muted text-muted",
    );

  return (
    <section
      aria-label={t.wsFolders}
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
    >
      <button
        type="button"
        onClick={() => onSelect("all")}
        aria-label={t.wsBoxAria}
        className={cardClass(selected === "all")}
      >
        <span className={headerClass(selected === "all")}>
          <Stack size={18} className="shrink-0" />
          <span className="min-w-0 truncate text-sm font-medium">{t.wsBoxAll}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-3 text-[11px] text-muted">
          <span>{t.wsBoxCount.replace("{count}", num(texts.length))}</span>
          {texts.length > 0 && <span aria-hidden="true">·</span>}
          {texts.length > 0 && (
            <span className="truncate">{formatRelativeTime(allLatest, locale)}</span>
          )}
        </span>
      </button>

      {folders.map((folder) => {
        const s = stats.get(folder.id);
        const count = s?.count ?? 0;
        return (
          <button
            key={folder.id}
            type="button"
            onClick={() => onSelect(folder.id)}
            aria-label={t.wsBoxAria}
            className={cardClass(selected === folder.id)}
          >
            <span className={headerClass(selected === folder.id)}>
              <FolderSimple size={18} className="shrink-0" />
              <span
                className="min-w-0 truncate text-sm font-medium"
                style={{ unicodeBidi: "plaintext" }}
              >
                {folder.name}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-3 text-[11px] text-muted">
              <span>
                {t.wsBoxCount.replace("{count}", num(count))}
              </span>
              {s && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{formatRelativeTime(s.latest, locale)}</span>
                </>
              )}
            </span>
          </button>
        );
      })}

      {/* “Create folder” tile — NotebookLM-style: a dashed card that becomes
          an inline one-step name field, creating the folder at the root. */}
      <div className="flex min-h-24 flex-col justify-end gap-3 rounded-b-xl rounded-t-[4px] border border-dashed border-border-subtle p-4 transition-colors hover:border-foreground/60">
        {creating ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name || busy) return;
              setBusy(true);
              void onCreateFolder(name, null).then((ok) => {
                setBusy(false);
                if (ok) {
                  setNewName("");
                  setCreating(false);
                }
              });
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.wsNewFolderPlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Escape") setCreating(false);
              }}
              className="h-9 w-full rounded-md border border-border-subtle bg-surface px-2.5 text-sm outline-none focus:border-foreground"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t.wsCreate}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="h-8 rounded-md border border-border-subtle px-3 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
              >
                {t.edCancel}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-full min-h-10 flex-1 items-center gap-2 text-start text-sm text-muted transition-colors hover:text-foreground"
          >
            <Plus size={18} className="shrink-0" />
            <span className="truncate">{t.wsAddFolder}</span>
          </button>
        )}
      </div>
    </section>
  );
}