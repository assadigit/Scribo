"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChartBar,
  CheckCircle,
  CircleNotch,
  FloppyDisk,
  Minus,
  Moon,
  Notebook,
  PaperPlaneTilt,
  PencilLine,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
  Sun,
  Trash,
  UserPlus,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { RICH_EXTENSIONS } from "@/components/editor/extensions";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { useI18n, useTheme } from "@/components/providers";
import { formatClockTime, formatDurationMs, formatLocalDateTime, formatRelativeTime, toFa } from "@/lib/format";
import {
  getTypewriterSfxEnabled,
  initTypewriterSfx,
  setTypewriterSfx,
  subscribeTypewriterSfx,
  typewriterSfx,
} from "@/lib/sfx";
import { exitFullscreen, requestFullscreen } from "@/lib/fullscreen";
import { resetEditorHistory, undoWouldClearDoc } from "@/lib/editor-undo";
import {
  getNotebookLinesEnabled,
  initNotebookLines,
  setNotebookLines,
  subscribeNotebookLines,
} from "@/lib/notebook-lines";
import { ShareLinks } from "./share-links";
import { CommentsPanel, type CommentDto } from "./comments-panel";
import { InstantLinkModal } from "./instant-link-modal";
import { SourceLinks, type SourceLinkDto } from "./source-links";

/* ------------------------------ DTO types ------------------------------ */

export type WorkspaceTextRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: "draft" | "published" | "archived";
  direction: "rtl" | "ltr";
  updatedAt: number;
  publishedAt: number | null;
  chapterCount?: number;
  /** First 200 plain-text characters of the note's current body. */
  excerpt?: string;
};

export type TextTagDto = { id: string; name: string; nameFa: string | null };
type FolderDto = { id: string; name: string; parentId: string | null; position: number };
export type TextShareDto = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  canEdit: boolean;
  createdAt: number | null;
};

export type ReadStats = {
  readerCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  recentReads: Array<{
    id: string;
    readerLabel: string | null;
    chapterId: string;
    durationMs: number;
    lastSeenAt: number;
    startedAt: number;
    completed: boolean;
  }>;
};

type VersionDto = {
  id: string;
  number: number;
  title: string | null;
  bodyJson: string;
  note: string | null;
  isCurrent: boolean;
  createdAt: number;
};

type TextDetailResponse = {
  text: {
    id: string;
    title: string;
    subtitle: string | null;
    authorNote: string | null;
    metaDescription: string | null;
    status: WorkspaceTextRow["status"];
    direction: WorkspaceTextRow["direction"];
    ownerId: string | null;
    folderId: string | null;
  };
  chapters: Array<{ id: string; title: string | null; position: number }>;
  tags: TextTagDto[];
  links: unknown[];
  sourceLinks: SourceLinkDto[];
};

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/* ------------------------------ autosave helpers ------------------------------ */

const AUTOSAVE_INTERVAL_MS = 60_000;
const autosaveKey = (id: string | null) => `scribo:autosave:${id ?? "new"}`;

type LocalDraft = { title: string; bodyJson: string; updatedAt: number };

/** Crash-recovery buffer kept in the browser — survives power/internet loss. */
function readLocalDraft(id: string | null): LocalDraft | null {
  try {
    const raw = localStorage.getItem(autosaveKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    if (typeof parsed?.bodyJson !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** A draft only counts as “work worth keeping” if it has a title or body text. */
function draftHasContent(draft: LocalDraft): boolean {
  if (draft.title.trim()) return true;
  try {
    const doc = JSON.parse(draft.bodyJson) as {
      content?: Array<{ content?: Array<{ text?: string }> }>;
    };
    return (
      doc.content?.some((block) => block.content?.some((node) => (node.text ?? "").trim())) ?? false
    );
  } catch {
    return false;
  }
}

/* Farsi/Arabic (RTL) script ranges. If the note contains any, it is RTL. */
const RTL_RE = /[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/;
function detectDirection(text: string): WorkspaceTextRow["direction"] {
  return RTL_RE.test(text) ? "rtl" : "ltr";
}

/** Flatten a nested folder tree for the editor's compact folder picker. */
function flattenFolders(folders: FolderDto[]): Array<{ folder: FolderDto; depth: number }> {
  const children = new Map<string | null, FolderDto[]>();
  const ids = new Set(folders.map((folder) => folder.id));
  for (const folder of folders) {
    const parentId = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    const group = children.get(parentId) ?? [];
    group.push(folder);
    children.set(parentId, group);
  }
  for (const group of children.values()) group.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  const result: Array<{ folder: FolderDto; depth: number }> = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) ?? []) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      result.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

/* ------------------------------ component ------------------------------ */

export function TextsWorkspace({
  initialSelectedId = null,
  isAdmin = false,
  myUserId = null,
}: {
  initialSelectedId?: string | null;
  isAdmin?: boolean;
  myUserId?: string | null;
}) {
  const { t, locale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));

  // Single-post mode: opened from the dashboard for one note (no post strip).
  const singleMode = Boolean(initialSelectedId);

  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [form, setForm] = useState({
    title: "",
    status: "draft" as WorkspaceTextRow["status"],
    direction: (locale === "fa" ? "rtl" : "ltr") as WorkspaceTextRow["direction"],
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [charCount, setCharCount] = useState(0);
  // Editor text size (focus-mode A−/A+ controls, persisted per device).
  const [fontScale, setFontScale] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const v = Number(localStorage.getItem("scribo-editor-scale"));
    return Number.isFinite(v) && v >= 0.8 && v <= 1.4 ? v : 1;
  });
  useEffect(() => {
    try {
      localStorage.setItem("scribo-editor-scale", String(fontScale));
    } catch {
      /* storage unavailable — scale stays in-memory */
    }
  }, [fontScale]);
  // Ask before silently loading a half-written NEW post — the author chooses
  // “continue writing” or “start fresh” over the restored draft.
  const [draftModal, setDraftModal] = useState(false);

  // Confirm before an undo that would wipe the whole note (the user may have
  // insisted past the loaded-content baseline).
  const [undoClearModal, setUndoClearModal] = useState(false);

  // Detail of the selected text (management sections).
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionDto[]>([]);
  const [tags, setTags] = useState<TextTagDto[]>([]);
  const [availableTags, setAvailableTags] = useState<TextTagDto[]>([]);
  const [folders, setFolders] = useState<FolderDto[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [shares, setShares] = useState<TextShareDto[]>([]);
  const [shareUsername, setShareUsername] = useState("");
  const [canEditNewShare, setCanEditNewShare] = useState(false);
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [links, setLinks] = useState<unknown[]>([]);
  const [sourceLinks, setSourceLinks] = useState<SourceLinkDto[]>([]);
  const [readStats, setReadStats] = useState<ReadStats | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [instantLinkFor, setInstantLinkFor] = useState<WorkspaceTextRow | null>(null);

  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);

  // Autosave: dirty flag, in-flight guards and a fresh-value context.
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const autoDirtyRef = useRef(false);
  const autoSavingRef = useRef(false);
  const manualSavingRef = useRef(false);
  // A manual RTL/LTR choice (toolbar toggle) disables content auto-detection.
  const manualDirRef = useRef(false);
  // Mirror of manualDirRef that React can render with — while set, the editor
  // DOM carries a dir-pinned class so the chosen direction wins over the
  // per-paragraph plaintext auto-detection (see globals.css).
  const [dirPinned, setDirPinned] = useState(false);
  const draftSeqRef = useRef(0);
  const ctxRef = useRef<{ title: string; selectedId: string | null; chapterId: string | null }>({
    title: "",
    selectedId: null,
    chapterId: null,
  });
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const editor = useEditor({
    extensions: RICH_EXTENSIONS,
    content: EMPTY_DOC,
    editorProps: {
      attributes: {
        dir: locale === "fa" ? "rtl" : "ltr",
        class: "prose-invert focus:outline-none min-h-[42vh]",
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
          if (undoWouldClearDoc(_view.state)) {
            setUndoClearModal(true);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setBodyDirty(true);
      autoDirtyRef.current = true;
      setCharCount((prev) => {
        const next = editor.state.doc.textBetween(0, editor.state.doc.content.size, "", "").length;
        return next === prev ? prev : next;
      });
    },
  });

  // Typewriter-sound preference lives in the sfx module (persisted per device,
  // default ON); subscribing via useSyncExternalStore keeps the Settings
  // toggle in sync without setState-in-effect (SSR snapshot: on).
  const sfxOn = useSyncExternalStore(
    subscribeTypewriterSfx,
    getTypewriterSfxEnabled,
    () => true,
  );

  // Notebook ruled-lines preference (persisted per device; on by default).
  const linesOn = useSyncExternalStore(
    subscribeNotebookLines,
    getNotebookLinesEnabled,
    () => true,
  );

  /* ------------------------- typewriter sound ------------------------- */

  useEffect(() => {
    initTypewriterSfx();
  }, []);

  useEffect(() => {
    initNotebookLines();
  }, []);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!sfxOn || !e.key || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") typewriterSfx.playTypeReturn();
      else if (e.key === "Backspace" || e.key === "Delete") typewriterSfx.playTypeDelete();
      else if (e.key === " ") typewriterSfx.playTypeSpace();
      else if (e.key.length === 1) typewriterSfx.playTypeKey();
    };
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor, sfxOn]);

  /* ------------------------- focus mode (fullscreen) ------------------------- */

  // Esc leaves focus mode — either the browser consumed it to exit fullscreen
  // (synced via fullscreenchange) or, if fullscreen was blocked, this handler.
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocusMode(false);
        exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  // Keep focus mode in lockstep with real browser fullscreen.
  useEffect(() => {
    const onFsChange = () => {
      if (document.fullscreenElement) {
        if (!focusMode) exitFullscreen();
      } else if (focusMode) {
        setFocusMode(false);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [focusMode]);

  function toggleFocus() {
    if (focusMode) {
      setFocusMode(false);
      exitFullscreen();
    } else {
      setFocusMode(true);
      void requestFullscreen();
    }
  }

  const canShareToWriter = isAdmin || Boolean(ownerId && myUserId && ownerId === myUserId);

  /* ------------------------- editor dir + pending body ------------------------- */

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("dir", form.direction);
    // A pinned direction is authoritative — plaintext per-paragraph
    // auto-detection (globals.css) must yield so the whole surface flips.
    editor.view.dom.classList.toggle("dir-pinned", dirPinned);
    if (pendingBody === null) return;
    const body = pendingBody;
    const title = pendingTitle;
    try {
      editor.commands.setContent(JSON.parse(body));
    } catch {
      editor.commands.setContent(EMPTY_DOC);
    }
    // Loaded content becomes the undo baseline — undo can never blank the note.
    resetEditorHistory(editor);
    autoDirtyRef.current = false;
    // State is only consumed (cleared/merged) after the editor work above, on a
    // microtask, so the effect body performs no synchronous setState (the React
    // Compiler set-state-in-effect rule) while the TipTap side-effects belong
    // here where they were already running.
    Promise.resolve().then(() => {
      setBodyDirty(false);
      if (title !== null) setForm((f) => (f.title === title ? f : { ...f, title }));
      setPendingBody(null);
      setPendingTitle(null);
    });
  }, [editor, form.direction, dirPinned, pendingBody, pendingTitle]);

  // Auto RTL/LTR: derive direction from the note's language (Farsi → rtl,
  // English → ltr); an empty note defaults to the app's language. Skipped once
  // the author pins a direction with the toolbar RTL/LTR toggle.
  useEffect(() => {
    if (!editor) return;
    if (manualDirRef.current) return;
    const text = `${form.title} ${editor.getText()}`.trim();
    const next: WorkspaceTextRow["direction"] = text
      ? detectDirection(text)
      : locale === "fa"
        ? "rtl"
        : "ltr";
    setForm((f) => (f.direction === next ? f : { ...f, direction: next }));
  }, [form.title, charCount, editor, locale]);

  // Manual override for the toolbar RTL/LTR toggle — pins the direction until
  // a new note is started (then auto-detection takes over again).
  function handleDirectionChange(d: WorkspaceTextRow["direction"]) {
    manualDirRef.current = true;
    setDirPinned(true);
    setForm((f) => (f.direction === d ? f : { ...f, direction: d }));
  }

  // Toolbar undo: dry-run first; if the next undo would wipe the note, ask.
  function requestUndo() {
    if (!editor) return;
    if (undoWouldClearDoc(editor.state)) {
      setUndoClearModal(true);
    } else {
      editor.chain().focus().undo().run();
    }
  }

  // Mirror the current editing context so the 1-minute timer never goes stale.
  useEffect(() => {
    ctxRef.current = { title: form.title, selectedId, chapterId };
  }, [form.title, selectedId, chapterId]);

  // Restore a half-written NEW post (no chapterId yet) after a crash / power loss.
  // The content is loaded UNDER a choice overlay instead of being shown silently.
  const newRestoreRef = useRef(false);
  useEffect(() => {
    if (initialSelectedId) return;
    if (newRestoreRef.current || !editor || pendingBody !== null) return;
    newRestoreRef.current = true;
    const local = readLocalDraft(null);
    if (!local || !draftHasContent(local)) return;
    // The read happens here (localStorage, a non-React system); the state is
    // written on a microtask so nothing setStates synchronously in the effect
    // body (React Compiler set-state-in-effect rule).
    Promise.resolve().then(() => {
      setPendingBody(local.bodyJson);
      setPendingTitle(local.title || null);
      setDraftModal(true);
    });
  }, [editor, initialSelectedId, pendingBody]);

  /* ------------------------ draft recovery prompt ------------------------ */

  function continueDraft() {
    setDraftModal(false);
    setNotice(t.wsDraftRestored);
  }

  function discardDraft() {
    setDraftModal(false);
    setNotice(null);
    try {
      localStorage.removeItem(autosaveKey(null));
    } catch {
      /* ignore */
    }
    manualDirRef.current = false;
    setDirPinned(false);
    setPendingBody(JSON.stringify(EMPTY_DOC));
    setPendingTitle("");
    setForm({ title: "", status: "draft", direction: locale === "fa" ? "rtl" : "ltr" });
    setBodyDirty(false);
    autoDirtyRef.current = false;
    setAutoState("idle");
  }

  /* ------------------------- 1-minute autosave ------------------------- */

  const runAutoSave = useCallback(() => {
    if (!editor || autoSavingRef.current || manualSavingRef.current) return;
    const { title, selectedId, chapterId } = ctxRef.current;
    const bodyJson = JSON.stringify(editor.getJSON());
    const payload = { title: title.trim(), bodyJson };
    const seq = draftSeqRef.current;
    autoSavingRef.current = true;
    setAutoState("saving");
    const finish = (ok: boolean) => {
      if (draftSeqRef.current !== seq) return; // a manual save happened mid-flight
      autoDirtyRef.current = !ok;
      setAutoState(ok ? "saved" : "error");
      if (ok) setLastSavedAt(Date.now());
    };
    // 1) Crash-recovery buffer in the browser — works offline, survives power loss.
    try {
      localStorage.setItem(
        autosaveKey(selectedId),
        JSON.stringify({ ...payload, updatedAt: Date.now() }),
      );
    } catch {
      /* storage unavailable — the server draft below is still a fallback */
    }
    // 2) Server-side draft, once the post exists (new posts have no chapter yet).
    if (!selectedId || !chapterId) {
      autoSavingRef.current = false;
      finish(true);
      return;
    }
    fetch(`/api/chapters/${chapterId}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error("draft");
        finish(true);
      })
      .catch(() => finish(false))
      .finally(() => {
        autoSavingRef.current = false;
      });
  }, [editor]);

  useEffect(() => {
    const id = setInterval(() => void runAutoSave(), AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [runAutoSave]);

  // Flush the buffer the moment the tab hides — the 1-minute cadence alone would
  // lose up to a minute of typing on a crash, power cut or closed laptop.
  useEffect(() => {
    if (!editor) return;
    const flush = () => {
      if (manualSavingRef.current) return;
      const { title, selectedId, chapterId } = ctxRef.current;
      const bodyJson = JSON.stringify(editor.getJSON());
      try {
        localStorage.setItem(
          autosaveKey(selectedId),
          JSON.stringify({ title: title.trim(), bodyJson, updatedAt: Date.now() }),
        );
        setLastSavedAt(Date.now());
      } catch {
        /* ignore */
      }
      if (selectedId && chapterId && autoDirtyRef.current) {
        fetch(`/api/chapters/${chapterId}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), bodyJson }),
        }).catch(() => {});
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [editor]);

  /* ------------------------------ data loading ------------------------------ */

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      setNotice(null);
      try {
        const [detailRes, commentsRes, reportRes, sharesRes] = await Promise.all([
          fetch(`/api/texts/${id}`),
          fetch(`/api/comments?textId=${id}`),
          fetch(`/api/texts/${id}/report`),
          fetch(`/api/texts/${id}/shares`),
        ]);
        if (!detailRes.ok) return;

        const detail = (await detailRes.json()) as TextDetailResponse;
        const text = detail.text;
        setOwnerId(text.ownerId);
        setFolderId(text.folderId ?? null);
        manualDirRef.current = true;
        setDirPinned(true);
        setForm({
          title: text.title,
          status: text.status,
          direction: text.direction,
        });
        setTags(detail.tags ?? []);
        setLinks(detail.links ?? []);
        setSourceLinks(detail.sourceLinks ?? []);
        setSelectedId(id);

        if (commentsRes.ok) {
          const d = (await commentsRes.json()) as { comments: CommentDto[] };
          setComments(d.comments ?? []);
        }
        if (reportRes.ok) {
          const d = (await reportRes.json()) as { readStats: ReadStats };
          setReadStats(d.readStats);
        }
        if (sharesRes.ok) {
          const d = (await sharesRes.json()) as { shares: TextShareDto[] };
          setShares(d.shares ?? []);
        }

        const firstChapter = detail.chapters?.[0];
        const local = readLocalDraft(id);
        if (firstChapter) {
          setChapterId(firstChapter.id);
          const chRes = await fetch(`/api/chapters/${firstChapter.id}`);
          if (chRes.ok) {
            const ch = (await chRes.json()) as {
              versions: VersionDto[];
              draft: { bodyJson: string; updatedAt: number } | null;
            };
            setVersions(ch.versions ?? []);
            const current = (ch.versions ?? []).find((v) => v.isCurrent);
            const draft = ch.draft ?? null;
            // A draft older than the last published revision is stale — prefer the
            // revision (prevents an old autosave from masking a newer save).
            const draftFresh = draft && (!current || draft.updatedAt > current.createdAt);
            const serverBody = draftFresh
              ? (draft?.bodyJson ?? JSON.stringify(EMPTY_DOC))
              : (current?.bodyJson ?? JSON.stringify(EMPTY_DOC));
            const serverTs = draftFresh ? (draft?.updatedAt ?? 0) : (current?.createdAt ?? 0);
            if (local && local.updatedAt > serverTs) {
              setPendingBody(local.bodyJson);
              setPendingTitle(local.title || null);
              setNotice(tRef.current.wsDraftRestored);
            } else {
              setPendingBody(serverBody);
              setPendingTitle(null);
            }
          }
        } else {
          setChapterId(null);
          setVersions([]);
          if (local) {
            setPendingBody(local.bodyJson);
            setPendingTitle(local.title || null);
            setNotice(tRef.current.wsDraftRestored);
          } else {
            setPendingBody(JSON.stringify(EMPTY_DOC));
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!initialSelectedId) return;
    // Deferred so the shared loadDetail (which flips `loading` synchronously)
    // is never invoked from the effect body (React Compiler set-state rule).
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void loadDetail(initialSelectedId);
    });
    return () => {
      cancelled = true;
    };
  }, [initialSelectedId, loadDetail]);

  // Available tags and folders for the editor controls (fetched once).
  useEffect(() => {
    fetch("/api/folders")
      .then((r) => (r.ok ? (r.json() as Promise<{ folders: FolderDto[] }>) : null))
      .then((d) => d && setFolders(d.folders ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => (r.ok ? (r.json() as Promise<{ tags: TextTagDto[] }>) : null))
      .then((d) => d && setAvailableTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  /* ------------------------------ new / save ------------------------------ */

  function startNew() {
    if (saving) return;
    setSelectedId(null);
    setChapterId(null);
    setVersions([]);
    setTags([]);
    setFolderId(null);
    setShares([]);
    setComments([]);
    setLinks([]);
    setSourceLinks([]);
    setReadStats(null);
    setOwnerId(null);
    setNotice(null);
    setForm({
      title: "",
      status: "draft",
      direction: locale === "fa" ? "rtl" : "ltr",
    });
    manualDirRef.current = false;
    setDirPinned(false);
    setPendingBody(JSON.stringify(EMPTY_DOC));
    setPendingTitle("");
    setBodyDirty(false);
    autoDirtyRef.current = false;
    setAutoState("idle");
  }

  async function save(targetStatus?: WorkspaceTextRow["status"]) {
    if (saving || !editor) return;
    const title = form.title.trim();
    if (!title) {
      setNotice(t.wsTitleRequired);
      return;
    }
    const direction = manualDirRef.current
      ? form.direction
      : detectDirection(`${title} ${editor.getText()}`);
    const status: WorkspaceTextRow["status"] = targetStatus ?? form.status;
    setSaving(true);
    manualSavingRef.current = true;
    autoSavingRef.current = false;
    setNotice(null);
    try {
      if (!selectedId) {
        // Create: title + body + status in one flat POST.
        const res = await fetch("/api/texts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            direction,
            status,
            folderId,
            bodyJson: editor.getJSON(),
          }),
        });
        if (!res.ok) {
          setNotice(t.detailSaveFailed);
          return;
        }
        const data = (await res.json()) as { id: string };
        setSelectedId(data.id);
        draftSeqRef.current += 1;
        autoDirtyRef.current = false;
        setAutoState("idle");
        try {
          localStorage.removeItem(autosaveKey(null));
        } catch {
          /* ignore */
        }
        setNotice(t.wsCreated);
        await loadDetail(data.id);
      } else {
        // Update: title/status/direction PATCH + a new revision if the body changed.
        const res = await fetch(`/api/texts/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            status,
            direction,
            folderId,
          }),
        });
        if (!res.ok) {
          setNotice(t.detailSaveFailed);
          return;
        }
        if (bodyDirty && chapterId) {
          const vres = await fetch(`/api/chapters/${chapterId}/versions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              bodyJson: JSON.stringify(editor.getJSON()),
            }),
          });
          if (!vres.ok) {
            setNotice(t.detailSaveFailed);
            return;
          }
        }
        setBodyDirty(false);
        autoDirtyRef.current = false;
        setAutoState("idle");
        draftSeqRef.current += 1;
        try {
          localStorage.removeItem(autosaveKey(selectedId));
        } catch {
          /* ignore */
        }
        setNotice(t.detailSaved);
        await loadDetail(selectedId);
      }
      setLastSavedAt(Date.now());
    } catch {
      setNotice(t.detailSaveFailed);
    } finally {
      setSaving(false);
      manualSavingRef.current = false;
    }
  }

  /* ------------------------- global keyboard shortcuts ------------------------- */

  // Ctrl/Cmd+S saves, Ctrl/Cmd+Enter saves/publishes (publish on first save).
  // `save` reads fresh state but is recreated every render — mirror it (and the
  // selected id) through refs so the stable []-dep listener never captures a
  // stale closure. Esc already exits focus mode via the effect above.
  const saveRef = useRef<typeof save>(() => Promise.resolve());
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    saveRef.current = save;
    selectedIdRef.current = selectedId;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveRef.current();
      } else if (key === "enter") {
        e.preventDefault();
        void saveRef.current(selectedIdRef.current ? undefined : "published");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------ delete / restore ------------------------------ */

  async function removeText(id?: string) {
    const target = id ?? selectedId;
    if (!target) return;
    if (!confirm(t.detailDeleteConfirm)) return;
    const res = await fetch(`/api/texts/${target}`, { method: "DELETE" });
    if (res.ok) {
      draftSeqRef.current += 1;
      setNotice(t.wsDeleted);
      try {
        localStorage.removeItem(autosaveKey(target));
      } catch {
        /* ignore */
      }
      if (target === selectedId) startNew();
    }
  }

  function restoreVersion(v: VersionDto) {
    if (!editor) return;
    if (!confirm(t.wsRevRestoreConfirm.replace("{n}", num(v.number)))) return;
    setPendingBody(v.bodyJson);
    setPendingTitle(v.title);
    setBodyDirty(true);
    autoDirtyRef.current = true;
    setNotice(t.wsRevRestored);
  }

  /* ------------------------------ tags / shares ------------------------------ */

  async function toggleTag(tag: TextTagDto) {
    if (!selectedId) return;
    const has = tags.some((x) => x.id === tag.id);
    const res = await fetch(`/api/texts/${selectedId}/tags`, {
      method: has ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });
    if (res.ok) {
      setTags((prev) => (has ? prev.filter((x) => x.id !== tag.id) : [...prev, tag]));
    }
  }

  async function addShare() {
    if (!selectedId) return;
    const username = shareUsername.trim();
    if (!username) return;
    const res = await fetch(`/api/texts/${selectedId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, canEdit: canEditNewShare }),
    });
    if (res.ok) {
      setShareUsername("");
      setCanEditNewShare(false);
      await refreshShares();
    }
  }

  async function toggleShareEdit(share: TextShareDto) {
    if (!selectedId) return;
    const res = await fetch(`/api/texts/${selectedId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: share.username, canEdit: !share.canEdit }),
    });
    if (res.ok) await refreshShares();
  }

  async function removeShare(share: TextShareDto) {
    if (!selectedId) return;
    if (!confirm(t.detailRemoveShareConfirm.replace("{name}", share.displayName))) return;
    const res = await fetch(`/api/texts/${selectedId}/shares`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: share.username }),
    });
    if (res.ok) await refreshShares();
  }

  async function refreshShares() {
    if (!selectedId) return;
    const res = await fetch(`/api/texts/${selectedId}/shares`);
    if (res.ok) {
      const data = (await res.json()) as { shares: TextShareDto[] };
      setShares(data.shares);
    }
  }

  const statusOptions: Array<{ value: WorkspaceTextRow["status"]; label: string }> = [
    { value: "draft", label: t.dashStatusDraft },
    { value: "published", label: t.dashStatusPublished },
    { value: "archived", label: t.dashStatusArchived },
  ];

  /* ------------------------------- render ------------------------------- */

  // Focus mode: real browser fullscreen (hides tabs/browser chrome) with a
  // minimal paper — title + content only, on a rounded surface with a
  // light/dark toggle so the writing mood can change mid-session. Autosave
  // keeps running underneath.
  if (focusMode && editor) {
    return (
      <div dir={form.direction} className="fixed inset-0 z-[100] flex flex-col bg-background">
        {/* Chrome reveal zone — hovering anywhere on the bottom edge fades the
            controls in; otherwise the surface stays pure paper. */}
        <div className="group fixed inset-x-0 bottom-0 z-20 h-36">
          {/* Notebook-lines paper style toggle */}
          <div className="pointer-events-none fixed inset-x-0 top-5 z-10 flex items-center justify-center px-4 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setNotebookLines(!linesOn)}
            aria-pressed={linesOn}
            title={linesOn ? t.edNotebookLinesOnTitle : t.edNotebookLinesOffTitle}
            className={`inline-flex h-10 items-center gap-2 rounded-full border bg-background/90 px-5 text-xs backdrop-blur transition-colors ${
              linesOn
                ? "border-foreground text-foreground"
                : "border-border-subtle text-muted hover:border-foreground hover:text-foreground"
            }`}
          >
            <Notebook size={16} aria-hidden="true" />
            {t.edNotebookLines}
          </button>
          </div>
          {/* Character count — pinned to the bottom-left corner, pale */}
          <span className="pointer-events-none fixed bottom-4 left-4 z-20 text-xs text-muted/70">
            {t.edCharCount.replace("{n}", num(charCount))}
          </span>
          {/* Writing status (autosave proof), save actions, text size,
              theme + exit — grouped at the bottom, revealed on hover */}
          <div className="pointer-events-none fixed inset-x-0 bottom-8 z-10 flex flex-col items-center gap-2.5 px-6 pb-2 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 sm:bottom-10 sm:flex-row sm:justify-center sm:gap-3">
            <div className="inline-flex h-10 min-w-0 max-w-[94vw] items-center gap-1.5 rounded-full border border-border-subtle bg-background/90 px-4 text-xs text-muted backdrop-blur sm:px-5">
              <span className="flex min-w-0 items-center gap-1.5">
              {autoState === "error" ? (
                <>
                  <WarningCircle size={14} className="shrink-0 text-amber-500" aria-hidden="true" />
                  <span className="truncate">{t.wsAutoError}</span>
                </>
              ) : lastSavedAt ? (
                <>
                  <CheckCircle size={14} className="shrink-0 text-emerald-500" aria-hidden="true" />
                  <span className="truncate">
                    {t.edLastSaveAt.replace("{time}", formatClockTime(lastSavedAt, locale))}
                  </span>
                </>
              ) : (
                <span className="truncate">{t.wsAutoIdle}</span>
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">

            <button
              type="button"
              onClick={() => void save("published")}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <CircleNotch size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <PaperPlaneTilt size={14} aria-hidden="true" />
              )}
              {t.edFocusPublish}
              <kbd className="rounded border border-border-subtle px-1 text-[10px] leading-tight">Ctrl+Enter</kbd>
            </button>
            <button
              type="button"
              onClick={() => void save("draft")}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-background/90 px-5 text-xs text-muted backdrop-blur transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
            >
              <FloppyDisk size={14} aria-hidden="true" />
              {t.edFocusSaveDraft}
              <kbd className="rounded border border-border-subtle px-1 text-[10px] leading-tight">Ctrl+S</kbd>
            </button>
            <button
              type="button"
              onClick={() => setFontScale((s) => Math.max(0.8, Number((s - 0.1).toFixed(2))))}
              title={t.edFontSmaller}
              aria-label={t.edFontSmaller}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-full border border-border-subtle bg-background/90 px-4 text-xs text-muted backdrop-blur transition-colors hover:border-foreground hover:text-foreground"
            >
              <Minus size={12} aria-hidden="true" />
              <span className="text-sm leading-none">A</span>
            </button>
            <button
              type="button"
              onClick={() => setFontScale((s) => Math.min(1.4, Number((s + 0.1).toFixed(2))))}
              title={t.edFontLarger}
              aria-label={t.edFontLarger}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-full border border-border-subtle bg-background/90 px-4 text-xs text-muted backdrop-blur transition-colors hover:border-foreground hover:text-foreground"
            >
              <Plus size={12} aria-hidden="true" />
              <span className="text-sm leading-none">A</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? t.readerToolbarLight : t.readerToolbarDark}
              title={theme === "dark" ? t.themeDayMode : t.themeNightMode}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-background/90 px-5 text-xs text-muted backdrop-blur transition-colors hover:border-foreground hover:text-foreground"
            >
              {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
              {theme === "dark" ? t.themeDayMode : t.themeNightMode}
            </button>
            <button
              type="button"
              onClick={toggleFocus}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-background/90 px-5 text-xs text-muted backdrop-blur transition-colors hover:border-foreground hover:text-foreground"
            >
              {t.edExitFocusMode}
              <kbd className="rounded border border-border-subtle px-1 text-[10px] leading-tight">Esc</kbd>
            </button>
          </div>
        </div>
      </div>
      {/* A4-like writing surface — grows with the user's screen (view-height
          driven width, capped by viewport width). The scroll container stays
          LTR so the scrollbar always sits on the right; an inner wrapper
          carries the note's own RTL/LTR direction with generous paper
          margins. */}
      <div className="mx-auto flex min-h-0 w-full max-w-[min(94vw,62vh,1150px)] flex-1 flex-col px-4 pt-16 pb-40 sm:px-8 sm:pt-20">
        <div
          dir="ltr"
          className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-sm border border-border-subtle bg-surface shadow-[3px_3px_0_rgba(33,30,26,0.06),0_12px_30px_rgba(33,30,26,0.08)]"
        >
          <div
            dir={form.direction}
            className="flex flex-1 flex-col p-10 sm:p-16"
            style={{ "--editor-scale": String(fontScale) } as CSSProperties}
          >
            <input
              value={form.title}
              onChange={(e) => {
                autoDirtyRef.current = true;
                if (notice) setNotice(null);
                setForm({ ...form, title: e.target.value });
              }}
              dir={form.direction}
              placeholder={t.composerTitlePlaceholder}
              className={`border-b bg-transparent pb-3 font-serif text-xl font-medium tracking-tight outline-none transition-colors placeholder:text-xs placeholder:text-muted/60 sm:text-2xl sm:placeholder:text-sm ${
                notice === t.wsTitleRequired ? "border-red-400" : "border-border-subtle focus:border-foreground"
              }`}
            />
            {/* Ruled area starts exactly at the first text line, so every
                paragraph sits on a notebook rule (the title stays clean
                above it). */}
            <div
              className={`mt-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${
                linesOn ? "notebook-ruled" : ""
              }`}
            >
              <EditorContent editor={editor} className="w-full [&_.tiptap]:outline-none" />
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs text-muted underline-offset-4 hover:underline">
            <ArrowLeft size={14} className="rtl:-scale-x-100" />
            {t.detailBack}
          </Link>
          {singleMode && (
            <h1 className="mt-2 font-serif text-2xl font-medium tracking-tight">
              {form.title.trim() || t.wsEdit}
            </h1>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-6">
        {/* Editor + management for the selected note — full width */}
        <section className="flex min-w-0 flex-col gap-6">
          {/* Form: title + body (the note itself) */}
          <div className="flex flex-col gap-5 rounded-xl border border-border-subtle p-5">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">{t.detailTitleLabel}</span>
              <input
                value={form.title}
                onChange={(e) => {
                  autoDirtyRef.current = true;
                  setForm({ ...form, title: e.target.value });
                }}
                dir={form.direction}
                placeholder={t.composerTitlePlaceholder}
                className="w-full border-b border-border-subtle bg-transparent pb-2 text-xl font-medium tracking-tight outline-none transition-colors placeholder:text-muted/60 focus:border-foreground"
              />
            </label>

            <div
              dir={form.direction}
              className="h-[calc(100dvh-19rem)] min-h-[14rem] min-w-0 overflow-x-hidden overflow-y-auto rounded-sm border border-border-subtle bg-surface px-5 py-6 shadow-[3px_3px_0_rgba(33,30,26,0.06),0_12px_30px_rgba(33,30,26,0.08)] sm:px-10"
              style={{ "--editor-scale": String(fontScale) } as CSSProperties}
            >
              {editor && (
                <EditorToolbar
                  editor={editor}
                  direction={form.direction}
                  onDirectionChange={handleDirectionChange}
                  focusActive={focusMode}
                  onToggleFocus={toggleFocus}
                  linesOn={linesOn}
                  onToggleLines={() => setNotebookLines(!linesOn)}
                  onUndo={requestUndo}
                  stickToContainer
                />
              )}
              <div className={`mt-3 min-w-0 overflow-x-hidden ${linesOn ? "notebook-ruled" : ""}`}>
                <EditorContent editor={editor} className="min-w-0 [&_.tiptap]:outline-none" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {selectedId ? (
                <>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || loading}
                    className="btn-type btn-type-solid inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {saving ? (
                      <CircleNotch size={16} className="animate-spin" />
                    ) : (
                      <FloppyDisk size={16} />
                    )}
                    {t.detailSaveButton}
                  </button>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">{t.detailStatusLabel}</span>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value as WorkspaceTextRow["status"] })
                      }
                      className="h-10 rounded-md border border-border-subtle bg-surface px-3 text-sm outline-none focus:border-foreground"
                    >
                      {statusOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">{t.wsFolders}</span>
                    <select
                      value={folderId ?? ""}
                      onChange={(e) => setFolderId(e.target.value || null)}
                      className="h-10 max-w-44 rounded-md border border-border-subtle bg-surface px-3 text-sm outline-none focus:border-foreground"
                    >
                      <option value="">{t.wsUnfiled}</option>
                      {flattenFolders(folders).map(({ folder, depth }) => (
                        <option key={folder.id} value={folder.id}>
                          {"\u00A0".repeat(depth * 2)}
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void save("published")}
                  disabled={saving || loading}
                  className="btn-type btn-type-solid inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {saving ? (
                    <CircleNotch size={16} className="animate-spin" />
                  ) : (
                    <FloppyDisk size={16} />
                  )}
                  {t.wsSavePublish}
                </button>
              )}
              {loading && <CircleNotch size={14} className="animate-spin text-muted" />}
              {!loading && (
                <span className="text-xs text-muted" role="status">
                  {autoState === "saved" ? (
                    <span
                      key={lastSavedAt ?? "saved"}
                      className="stamp stamp-press stamp-fade"
                    >
                      {lastSavedAt
                        ? t.wsAutoSavedAt.replace("{time}", formatClockTime(lastSavedAt, locale))
                        : t.wsAutoSaved}
                    </span>
                  ) : autoState === "saving" ? (
                    t.wsAutoSaving
                  ) : autoState === "error" ? (
                    t.wsAutoError
                  ) : (
                    t.wsAutoIdle
                  )}
                </span>
              )}
              {notice && <span className="text-xs text-muted">{notice}</span>}
            </div>
          </div>

          {/* Manage sections only for the selected note */}
          {selectedId && (
            <>
              {/* Share links — right after the editor's save button */}
              <ShareLinks textId={selectedId} initialLinks={links as never} />

              {/* Source/reference links cited in the note's body */}
              <SourceLinks textId={selectedId} initialLinks={sourceLinks} />

              {/* Revision history — revisions of THIS note, never list entries */}
              <section className="flex flex-col gap-3 rounded-xl border border-border-subtle p-5">
                <h2 className="text-sm font-medium text-muted">
                  {t.wsRevHistory}
                  {versions.length > 0 && ` (${num(versions.length)})`}
                </h2>
                {versions.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border-subtle py-8 text-center text-sm text-muted">
                    {t.wsRevEmpty}
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
                    {versions.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-subtle text-xs text-muted">
                            {num(v.number)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {v.title || t.wsRevFallbackTitle.replace("{n}", num(v.number))}
                              {v.isCurrent && (
                                <span className="mr-2 inline-flex items-center rounded-full border border-foreground px-2 py-0.5 text-[10px] text-foreground">
                                  {t.wsRevCurrent}
                                </span>
                              )}
                            </p>
                            {v.note && <p className="truncate text-xs text-muted">{v.note}</p>}
                            <p className="text-xs text-muted">{formatLocalDateTime(v.createdAt, locale)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreVersion(v)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
                        >
                          <ArrowLeft size={13} className="rotate-180 rtl:rotate-0" />
                          {t.wsRevRestore}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Settings */}
              <section className="flex flex-col gap-4 rounded-xl border border-border-subtle p-5">
                <h2 className="text-sm font-medium text-muted">{t.detailSettings}</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void removeText()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-danger/40 px-4 text-xs text-danger transition-colors hover:border-danger hover:bg-danger/10"
                  >
                    <Trash size={14} />
                    {t.detailDeleteText}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypewriterSfx(!sfxOn)}
                    title={sfxOn ? t.edTypewriterOnTitle : t.edTypewriterOffTitle}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-subtle px-4 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
                  >
                    {sfxOn ? <SpeakerHigh size={14} /> : <SpeakerSlash size={14} />}
                    {sfxOn ? t.edTypewriterOn : t.edTypewriterOff}
                  </button>
                </div>
              </section>

              {/* Reading report */}
              {readStats && (
                <section className="flex flex-col gap-4 rounded-xl border border-border-subtle p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-medium text-muted">{t.detailReportHeading}</h2>
                    <Link
                      href={`/admin/texts/${selectedId}/report`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
                    >
                      <ChartBar size={14} />
                      {t.detailReportLink}
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
                      <p className="text-xs text-muted">{t.detailStatReaders}</p>
                      <p className="font-serif text-lg font-medium">{num(readStats.readerCount)}</p>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
                      <p className="text-xs text-muted">{t.detailStatTotal}</p>
                      <p className="font-serif text-lg font-medium">
                        {formatDurationMs(readStats.totalDurationMs, locale)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
                      <p className="text-xs text-muted">{t.detailStatAvg}</p>
                      <p className="font-serif text-lg font-medium">
                        {formatDurationMs(readStats.avgDurationMs, locale)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
                      <p className="text-xs text-muted">{t.detailStatLast}</p>
                      <p className="font-serif text-lg font-medium">
                        {readStats.recentReads[0]
                          ? formatRelativeTime(readStats.recentReads[0].lastSeenAt, locale)
                          : "-"}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Tags */}
              <section className="flex flex-col gap-3 rounded-xl border border-border-subtle p-5">
                <button
                  type="button"
                  onClick={() => setTagPanelOpen((v) => !v)}
                  className="flex items-center justify-between text-sm font-medium text-muted"
                >
                  <span>{t.detailTags}</span>
                  <span className="inline-flex items-center text-xs">
                    {tagPanelOpen ? <Minus size={14} /> : <Plus size={14} />}
                  </span>
                </button>
                {tagPanelOpen && (
                  <div className="flex flex-col gap-3">
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => void toggleTag(tag)}
                            className="inline-flex h-8 items-center gap-1 rounded-full border border-foreground px-3 text-xs transition-colors hover:bg-surface-muted"
                          >
                            {tag.nameFa || tag.name}
                            <span aria-hidden="true">
                              <X size={12} />
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {availableTags.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs text-muted">{t.detailAddTag}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {availableTags
                            .filter((x) => !tags.some((existing) => existing.id === x.id))
                            .map((tag) => (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => void toggleTag(tag)}
                                className="inline-flex h-8 items-center rounded-full border border-border-subtle px-3 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
                              >
                                {tag.nameFa || tag.name}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Share with a writer (owner + admin only) */}
              {canShareToWriter && (
                <section className="flex flex-col gap-3 rounded-xl border border-border-subtle p-5">
                  <button
                    type="button"
                    onClick={() => setSharePanelOpen((v) => !v)}
                    className="flex items-center justify-between text-sm font-medium text-muted"
                  >
                    <span>{t.detailShareHeading}</span>
                    <span className="inline-flex items-center text-xs">
                      {sharePanelOpen ? <Minus size={14} /> : <Plus size={14} />}
                    </span>
                  </button>
                  {sharePanelOpen && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="text-muted">{t.detailShareUsername}</span>
                          <input
                            value={shareUsername}
                            onChange={(e) => setShareUsername(e.target.value)}
                            placeholder={t.detailShareUsernamePlaceholder}
                            dir="ltr"
                            className="h-10 rounded-md border border-border-subtle bg-surface px-3 outline-none focus:border-foreground"
                          />
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={canEditNewShare}
                            onChange={(e) => setCanEditNewShare(e.target.checked)}
                            className="h-4 w-4"
                          />
                          <span>{t.detailCanEdit}</span>
                        </label>
                        <div>
                          <button
                            type="button"
                            onClick={() => void addShare()}
                            disabled={!shareUsername.trim()}
                            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            <UserPlus size={15} />
                            {t.detailAddWriter}
                          </button>
                        </div>
                      </div>

                      {shares.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border-subtle py-8 text-center text-sm text-muted">
                          {t.detailShareEmpty}
                        </p>
                      ) : (
                        <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
                          {shares.map((share) => (
                            <li key={share.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{share.displayName}</span>
                                <span className="text-xs text-muted" dir="ltr">
                                  @{share.username}
                                </span>
                                {share.canEdit && (
                                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] text-muted">
                                    {t.detailCanEditBadge}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => void toggleShareEdit(share)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground"
                                >
                                  <PencilLine size={14} />
                                  {share.canEdit ? t.detailReadOnly : t.detailCanEdit}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeShare(share)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-muted transition-colors hover:border-foreground hover:text-foreground"
                                >
                                  <Trash size={14} />
                                  {t.detailDeleteBtn}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Comments */}
              <CommentsPanel initialComments={comments} />
            </>
          )}
        </section>
      </div>

      {instantLinkFor && (
        <InstantLinkModal
          textId={instantLinkFor.id}
          title={instantLinkFor.title}
          onClose={() => setInstantLinkFor(null)}
        />
      )}

      {draftModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.wsDraftModalTitle}
        >
          <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted">
                <PencilLine size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-serif text-lg font-medium tracking-tight">{t.wsDraftModalTitle}</h2>
                <p className="mt-1 text-sm text-muted">{t.wsDraftModalBody}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={discardDraft}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-subtle px-5 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
              >
                <Trash size={15} aria-hidden="true" />
                {t.wsDraftFresh}
              </button>
              <button
                type="button"
                onClick={continueDraft}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
              >
                <PencilLine size={15} aria-hidden="true" />
                {t.wsDraftContinue}
              </button>
            </div>
          </div>
        </div>
      )}

      {undoClearModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.wsUndoClearTitle}
        >
          <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted">
                <WarningCircle size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-serif text-lg font-medium tracking-tight">{t.wsUndoClearTitle}</h2>
                <p className="mt-1 text-sm text-muted">{t.wsUndoClearBody}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setUndoClearModal(false)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-subtle px-5 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
              >
                {t.wsUndoClearCancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  editor?.chain().focus().undo().run();
                  setUndoClearModal(false);
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
              >
                <WarningCircle size={15} aria-hidden="true" />
                {t.wsUndoClearConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
