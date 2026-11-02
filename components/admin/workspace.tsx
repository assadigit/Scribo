"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { CaretDown, DownloadSimple, FolderDashed, FolderSimple, PencilSimple, Plus, Stack, Trash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatDate, toFa } from "@/lib/format";
import { useI18n } from "@/components/providers";
import { StatusBadge } from "./status-badge";
import { FolderBoxes } from "./folder-boxes";

/**
 * Obsidian-like workspace for registered writers: a collapsible folder tree on
 * the side (unlimited nesting), a filtered text list, and HTML5 drag-and-drop
 * to move a text between folders. Folder create/rename/delete are inline.
 */

export type WorkspaceText = {
  id: string;
  title: string;
  subtitle: string | null;
  status: "draft" | "published" | "archived";
  updatedAt: number;
  folderId: string | null;
  shared?: boolean;
};

export type WorkspaceFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

type FolderNode = WorkspaceFolder & { children: FolderNode[]; depth: number };

function buildTree(folders: WorkspaceFolder[]): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  for (const f of folders) byId.set(f.id, { ...f, children: [], depth: 0 });
  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      node.depth = byId.get(node.parentId)!.depth + 1;
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "fa"));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

type FolderRowProps = {
  node: FolderNode;
  collapsed: Set<string>;
  counts: Map<string, number>;
  selected: string | "unfiled" | "all";
  dropTarget: string | null;
  busy: boolean;
  renamingId: string | null;
  newFolderFor: string | "root" | null;
  renameValue: string;
  newName: string;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onDropTarget: (id: string | null) => void;
  onDrop: (folderId: string | null) => void;
  onBeginRename: (id: string, name: string) => void;
  onRenameValue: (value: string) => void;
  onRenameSubmit: (id: string) => void;
  onBeginNewFolder: (id: string) => void;
  onNewName: (value: string) => void;
  onNewFolderSubmit: (id: string) => void;
  onDelete: (id: string) => void;
};

function FolderRow(props: FolderRowProps) {
  const { t, locale } = useI18n();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));
  const {
    node,
    collapsed,
    counts,
    selected,
    dropTarget,
    busy,
    renamingId,
    newFolderFor,
    renameValue,
    newName,
    onToggleCollapse,
    onSelect,
    onDrop,
    onDropTarget,
    onBeginRename,
    onRenameValue,
    onRenameSubmit,
    onBeginNewFolder,
    onNewName,
    onNewFolderSubmit,
    onDelete,
  } = props;

  const isCollapsed = collapsed.has(node.id);
  const count = counts.get(node.id) ?? 0;
  const active = selected === node.id;
  const isDropTarget = dropTarget === node.id;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md py-1.5 pr-1.5",
          isDropTarget && "bg-surface-muted ring-1 ring-foreground",
        )}
        style={{ paddingInlineStart: `${0.75 + node.depth * 1.1}rem` }}
        onDragOver={(e) => {
          e.preventDefault();
          if (dropTarget !== node.id) onDropTarget(node.id);
        }}
        onDragLeave={() => onDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(node.id);
        }}
      >
        <button
          type="button"
          aria-label={isCollapsed ? t.wsCollapseOpen : t.wsCollapseClose}
          onClick={() => onToggleCollapse(node.id)}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center text-muted transition-transform",
            node.children.length === 0 && "invisible",
            isCollapsed && "-rotate-90",
          )}
        >
          <CaretDown size={12} />
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-sm transition-colors",
            active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface-muted",
          )}
        >
          <FolderSimple size={16} className="shrink-0" />
          <span className="truncate">{node.name}</span>
          {count > 0 && (
            <span className={cn("text-[11px]", active ? "text-accent-foreground/70" : "text-muted")}>
              {num(count)}
            </span>
          )}
        </button>
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            aria-label={t.wsNewFolderAria}
            onClick={() => onBeginNewFolder(node.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            aria-label={t.wsRenameAria}
            onClick={() => onBeginRename(node.id, node.name)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <PencilSimple size={13} />
          </button>
          <button
            type="button"
            aria-label={t.wsDeleteFolderAria}
            onClick={() => onDelete(node.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <Trash size={13} />
          </button>
        </span>
      </div>

      {renamingId === node.id && (
        <form
          className="flex items-center gap-1 px-2 py-1"
          style={{ paddingInlineStart: `${1.75 + node.depth * 1.1}rem` }}
          onSubmit={(e) => {
            e.preventDefault();
            onRenameSubmit(node.id);
          }}
        >
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameValue(e.target.value)}
            className="field-type h-7 w-full min-w-0 flex-1 text-sm"
          />
          <button type="submit" disabled={busy} className="btn-type">
            {t.wsSave}
          </button>
        </form>
      )}

      {newFolderFor === node.id && (
        <form
          className="flex items-center gap-1 px-2 py-1"
          style={{ paddingInlineStart: `${1.75 + node.depth * 1.1}rem` }}
          onSubmit={(e) => {
            e.preventDefault();
            onNewFolderSubmit(node.id);
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => onNewName(e.target.value)}
            placeholder={t.wsNewFolderPlaceholder}
            className="field-type h-7 w-full min-w-0 flex-1 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="btn-type"
          >
            {t.wsCreate}
          </button>
        </form>
      )}

      {!isCollapsed && node.children.length > 0 && (
        <ul className="flex flex-col">
          {node.children.map((child) => (
            <FolderRow key={child.id} {...props} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Workspace({
  texts,
  folders,
}: {
  texts: WorkspaceText[];
  folders: WorkspaceFolder[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));
  const [selected, setSelected] = useState<string | "unfiled" | "all">("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newFolderFor, setNewFolderFor] = useState<string | "root" | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(folders), [folders]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of texts) {
      if (t.folderId) map.set(t.folderId, (map.get(t.folderId) ?? 0) + 1);
    }
    return map;
  }, [texts]);

  const unfiledCount = useMemo(() => texts.filter((t) => !t.folderId).length, [texts]);

  const visible = useMemo(() => {
    if (selected === "all") return texts;
    if (selected === "unfiled") return texts.filter((t) => !t.folderId);
    return texts.filter((t) => t.folderId === selected);
  }, [texts, selected]);

  async function moveText(textId: string, folderId: string | null) {
    const res = await fetch(`/api/texts/${textId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    if (res.ok) router.refresh();
  }

  function onDrop(folderId: string | null) {
    if (!dragging) return;
    setDropTarget(null);
    setDragging(null);
    void moveText(dragging, folderId);
  }

  async function createFolder(parentId: string | "root" | null, name?: string) {
    const folderName = (name ?? newName).trim();
    if (!folderName || busy) return false;
    setBusy(true);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: folderName, parentId: parentId === "root" ? null : parentId }),
    });
    setBusy(false);
    if (res.ok) {
      setNewFolderFor(null);
      setNewName("");
      setCollapsed(new Set()); // reveal new folder
      router.refresh();
      return true;
    }
    return false;
  }

  async function renameFolder(id: string) {
    const name = renameValue.trim();
    if (!name || busy) return;
    setBusy(true);
    const res = await fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) {
      setRenamingId(null);
      router.refresh();
    }
  }

  async function deleteFolder(id: string) {
    if (!confirm(t.wsDeleteFolderConfirm)) return;
    const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSelected((s) => (s === id ? "all" : s));
      router.refresh();
    }
  }

  async function deleteText(id: string) {
    if (!confirm(t.detailDeleteConfirm)) return;
    const res = await fetch(`/api/texts/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rowProps: Omit<FolderRowProps, "node"> = {
    collapsed,
    counts,
    selected,
    dropTarget,
    busy,
    renamingId,
    newFolderFor,
    renameValue,
    newName,
    onToggleCollapse: toggleCollapse,
    onSelect: setSelected,
    onDrop,
    onDropTarget: setDropTarget,
    onBeginRename: (id, name) => {
      setNewFolderFor(null);
      setRenamingId(id);
      setRenameValue(name);
    },
    onRenameValue: setRenameValue,
    onRenameSubmit: (id) => void renameFolder(id),
    onBeginNewFolder: (id) => {
      setRenamingId(null);
      setNewFolderFor(id);
      setNewName("");
    },
    onNewName: setNewName,
    onNewFolderSubmit: (id) => void createFolder(id),
    onDelete: (id) => void deleteFolder(id),
  };

  function renderRows(nodes: FolderNode[]): ReactNode {
    return nodes.map((node) => <FolderRow key={node.id} {...rowProps} node={node} />);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* NotebookLM-style folder cards: note count + latest edit per folder. */}
      <FolderBoxes
        folders={folders}
        texts={texts}
        selected={selected}
        onSelect={setSelected}
        onCreateFolder={(name, parentId) =>
          createFolder(parentId ?? "root", name).then((ok) => ok)
        }
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        {/* Sidebar */}
      <aside className="h-fit rounded-sm border border-border-subtle bg-surface p-2 lg:sticky lg:top-20">
        <div className="flex items-center justify-between px-2 pb-1 pt-1">
          <p className="text-xs font-medium text-muted">{t.wsFolders}</p>
          <button
            type="button"
            onClick={() => {
              setRenamingId(null);
              setNewFolderFor("root");
              setNewName("");
            }}
            className="btn-type inline-flex items-center gap-1.5"
          >
            <Plus size={13} />
            {t.wsAddFolder}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setSelected("all")}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
            selected === "all" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface-muted",
          )}
        >
          <Stack size={16} className="shrink-0" />
          <span className="flex-1 text-left">{t.wsAll}</span>
          <span className={cn("text-[11px]", selected === "all" ? "text-accent-foreground/70" : "text-muted")}>
            {num(texts.length)}
          </span>
        </button>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget("unfiled");
          }}
          onDragLeave={() => setDropTarget((d) => (d === "unfiled" ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(null);
          }}
        >
          <button
            type="button"
            onClick={() => setSelected("unfiled")}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
              selected === "unfiled" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface-muted",
            )}
          >
            <FolderDashed size={16} className="shrink-0" />
            <span className="flex-1 text-left">{t.wsUnfiled}</span>
            {unfiledCount > 0 && (
              <span className={cn("text-[11px]", selected === "unfiled" ? "text-accent-foreground/70" : "text-muted")}>
                {num(unfiledCount)}
              </span>
            )}
          </button>
        </div>

        {tree.length > 0 && (
          <ul className="mt-1 flex flex-col border-t border-border-subtle pt-1">{renderRows(tree)}</ul>
        )}

        {newFolderFor === "root" && (
          <form
            className="mt-2 flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void createFolder("root");
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.wsNewFolderPlaceholder}
              className="field-type h-8 w-full min-w-0 flex-1 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="btn-type"
            >
              {t.wsCreate}
            </button>
          </form>
        )}
      </aside>

      {/* Text list */}
      <section className="min-w-0">
        {visible.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border-subtle py-16 text-center text-sm text-muted">
            {t.wsEmptyTexts}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-sm border border-border-subtle">
            {visible.map((text, index) => (
              <li
                key={text.id}
                draggable
                onDragStart={(e: DragEvent<HTMLLIElement>) => {
                  e.dataTransfer.setData("text/plain", text.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(text.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropTarget(null);
                }}
                className={cn("transition-colors", dragging === text.id && "opacity-40")}
              >
                <div className="flex items-center gap-2 px-4 py-4 transition-colors hover:bg-surface-muted">
                  <Link
                    href={`/admin/texts/${text.id}`}
                    className="group flex min-w-0 flex-1 flex-col gap-1"
                  >
                    <div className="flex items-center gap-3">
                    <StatusBadge status={text.status} />
                    {text.shared && (
                        <span className={`tag-type tag-tilt-${(index % 4) + 1} shrink-0`}>
                          {t.wsSharedBadge}
                        </span>
                      )}
                      <h2 className="min-w-0 flex-1 font-medium leading-snug group-hover:underline">{text.title}</h2>
                      <span className="shrink-0 text-xs text-muted">{formatDate(text.updatedAt)}</span>
                    </div>
                    {text.subtitle && <p className="text-sm text-muted line-clamp-1">{text.subtitle}</p>}
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={`/api/texts/${text.id}/export-md`}
                      title={t.wsDownloadMd}
                      aria-label={t.wsDownloadMd}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border-subtle text-muted transition-colors hover:border-foreground hover:text-foreground"
                    >
                      <DownloadSimple size={15} />
                    </a>
                    <Link
                      href={`/admin/texts/${text.id}`}
                      title={t.wsEdit}
                      aria-label={t.wsEdit}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border-subtle text-muted transition-colors hover:border-foreground hover:text-foreground"
                    >
                      <PencilSimple size={15} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void deleteText(text.id)}
                      title={t.detailDeleteBtn}
                      aria-label={t.detailDeleteBtn}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border-subtle text-muted transition-colors hover:border-foreground hover:text-foreground"
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}


