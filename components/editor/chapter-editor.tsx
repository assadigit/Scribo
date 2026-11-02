"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import { RICH_EXTENSIONS } from "@/components/editor/extensions";
import { formatLocalDateTime, toFa } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exitFullscreen, requestFullscreen } from "@/lib/fullscreen";
import { resetEditorHistory, undoWouldClearDoc } from "@/lib/editor-undo";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { useCalendar, useI18n, useTheme } from "@/components/providers";
import {
  ArrowCounterClockwise,
  CircleNotch,
  Clock,
  ClockCounterClockwise,
  FileDoc,
  Minus,
  Moon,
  PaperPlaneTilt,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  getTypewriterSfxEnabled,
  initTypewriterSfx,
  setTypewriterSfx,
  subscribeTypewriterSfx,
  typewriterSfx,
} from "@/lib/sfx";

type Version = {
  id: string;
  number: number;
  title: string | null;
  bodyJson: string;
  note: string | null;
  isCurrent: boolean;
  createdAt: number;
};

type Draft = { title: string | null; bodyJson: string; updatedAt: number } | null;

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DELAY = 1200;

export function ChapterEditor({
  direction,
  textId,
  chapter,
  versions,
  draft,
}: {
  direction: "rtl" | "ltr";
  textId: string;
  chapter: { id: string; title: string | null; position: number };
  versions: Version[];
  draft: Draft;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { calendar } = useCalendar();
  const { theme, toggleTheme } = useTheme();
  // Locale-aware digits: Farsi UI shows ۰-۹, English/Latin UI shows 0-9.
  const num = (n: number | string) => (locale === "fa" ? toFa(n) : String(n));
  const [title, setTitle] = useState(draft?.title ?? chapter.title ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  // Editor text size (focus-mode A−/A+ controls, persisted per device).
  const [fontScale, setFontScale] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const v = Number(localStorage.getItem("scribo-editor-scale"));
    return Number.isFinite(v) && v >= 0.8 && v <= 1.4 ? v : 1;
  });
  const [dir, setDir] = useState<"rtl" | "ltr">(direction);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Confirm before an undo that would wipe the whole note.
  const [undoClearModal, setUndoClearModal] = useState(false);

  // Typewriter-sound preference lives in the sfx module (persisted per device,
  // default ON); subscribing via useSyncExternalStore keeps the toggle in sync
  // without setState-in-effect (SSR snapshot: on).
  const sfxOn = useSyncExternalStore(
    subscribeTypewriterSfx,
    getTypewriterSfxEnabled,
    () => true,
  );

  const initialJson = useMemo(() => {
    try {
      return draft?.bodyJson ? JSON.parse(draft.bodyJson) : undefined;
    } catch {
      return undefined;
    }
  }, [draft]);

  const editor = useEditor({
    extensions: RICH_EXTENSIONS,
    content: initialJson,
    editorProps: {
      attributes: {
        dir: direction,
        class: "prose-invert focus:outline-none min-h-[45vh]",
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
    onUpdate: () => setSaveState("saving"),
  });

  /* ------------------- typewriter sound + focus mode ------------------- */

  useEffect(() => {
    initTypewriterSfx();
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

  // Keep focus mode in lockstep with real browser fullscreen: leaving
  // fullscreen (Esc / swipe / browser UI) always exits focus mode, and a
  // stray fullscreen without focus mode is reverted.
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

  /* --------------------------- writing direction --------------------------- */

  // Keep the live editing surface in sync with the chosen direction.
  useEffect(() => {
    editor?.view.dom.setAttribute("dir", dir);
    // The chapter editor's direction is always authoritative (no content
    // auto-detection), so plaintext per-paragraph detection has to yield.
    editor?.view.dom.classList.toggle("dir-pinned", true);
  }, [editor, dir]);

  function handleDirectionChange(d: "rtl" | "ltr") {
    setDir(d);
    // Persist so readers (and the next visit) see the same direction.
    void fetch(`/api/texts/${textId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: d }),
    }).catch(() => {});
  }

  function toggleSfx() {
    setTypewriterSfx(!sfxOn);
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

  function toggleFocus() {
    if (focusMode) {
      setFocusMode(false);
      exitFullscreen();
    } else {
      setFocusMode(true);
      void requestFullscreen();
    }
  }

  /* ------------------------- debounced autosave ------------------------- */

  const saveDraft = useCallback(
    async (t: string, json: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/chapters/${chapter.id}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: t, bodyJson: JSON.stringify(json) }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    },
    [chapter.id],
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return;
    if (saveState !== "saving") return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(title, editor.getJSON());
    }, SAVE_DELAY);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [saveState, title, editor, saveDraft]);

  useEffect(() => {
    if (!editor) return;
    if (saveState === "saved" || saveState === "error") {
      const t = setTimeout(() => setSaveState("idle"), 2500);
      return () => clearTimeout(t);
    }
  }, [saveState, editor]);

  /* ------------------------------ publishing ------------------------------ */

  async function publish() {
    if (!editor) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          bodyJson: JSON.stringify(editor.getJSON()),
          note: publishNote.trim() || undefined,
        }),
      });
      if (res.ok) {
        setPublishOpen(false);
        setPublishNote("");
        setSaveState("idle");
        router.refresh();
      }
    } finally {
      setPublishing(false);
    }
  }

  /* ------------------------------ word import ------------------------------ */

  async function importWord(file: File) {
    if (!editor) return;
    setImportBusy(true);
    try {
      const mammoth = await import("mammoth/mammoth.browser");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      if (confirm(t.edReplaceWithWordConfirm)) {
        editor.commands.setContent(result.value);
        // Loaded content becomes the undo baseline — undo can never blank the note.
        resetEditorHistory(editor);
        setSaveState("saving");
      }
    } catch {
      alert(t.edWordImportError);
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ------------------------------ version restore ------------------------------ */

  function restoreVersion(v: Version) {
    if (!editor) return;
    if (!confirm(t.edRestoreVersionConfirm.replace("{n}", num(v.number)))) return;
    try {
      const json = JSON.parse(v.bodyJson);
      editor.commands.setContent(json);
      // Loaded content becomes the undo baseline — undo can never blank the note.
      resetEditorHistory(editor);
      if (v.title) setTitle(v.title);
      setSaveState("saving");
    } catch {
      alert(t.edRestoreError);
    }
  }

  if (!editor) return null;

  /* Distraction-free writing surface: only the paper and an exit affordance —
     all chrome hides until the pointer hovers the bottom edge. */
  if (focusMode) {
    return (
      <div dir={dir} className="fixed inset-0 z-[100] flex flex-col bg-background">
        {/* Chrome reveal zone — hovering the bottom edge fades the controls in */}
        <div className="group fixed inset-x-0 bottom-0 z-20 h-36">
          {/* Theme toggle stays reachable while writing */}
          <div className="pointer-events-none fixed inset-x-0 top-5 z-10 flex items-center justify-center px-4 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
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
          </div>
          {/* Text size + exit — revealed on hover */}
          <div className="pointer-events-none fixed inset-x-0 bottom-8 z-10 flex flex-wrap items-center justify-center gap-2 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 sm:bottom-10">
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
              onClick={toggleFocus}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-background/90 px-5 text-xs text-muted backdrop-blur transition-colors hover:border-foreground hover:text-foreground"
            >
              {t.edExitFocusMode}
              <kbd className="rounded border border-border-subtle px-1 text-[10px] leading-tight">Esc</kbd>
            </button>
          </div>
        </div>
        {/* Rounded writing surface — framed by the (dark in night mode)
            backdrop. The scroll container stays LTR so the scrollbar always
            sits on the right; an inner wrapper carries the note's own
            direction with generous paper margins. */}
        <div className="mx-auto flex min-h-0 w-full max-w-[min(94vw,62vh,1150px)] flex-1 flex-col px-4 pt-16 pb-40 sm:px-8 sm:pt-20">
          <div
            dir="ltr"
            className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-sm border border-border-subtle bg-surface shadow-[3px_3px_0_rgba(33,30,26,0.06),0_12px_30px_rgba(33,30,26,0.08)]"
          >
            <div
              dir={dir}
              className="flex flex-1 flex-col p-10 sm:p-16"
              style={{ "--editor-scale": String(fontScale) } as CSSProperties}
            >
              <EditorContent editor={editor} className="w-full [&_.tiptap]:outline-none" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Writer controls: typewriter sound + focus mode */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleSfx}
          title={sfxOn ? t.edTypewriterOnTitle : t.edTypewriterOffTitle}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs transition-colors",
            sfxOn
              ? "border-foreground text-foreground"
              : "border-border-subtle text-muted hover:border-foreground hover:text-foreground",
          )}
        >
          {sfxOn ? (
            <SpeakerHigh size={15} className="shrink-0" aria-hidden="true" />
          ) : (
            <SpeakerSlash size={15} className="shrink-0" aria-hidden="true" />
          )}
          {sfxOn ? t.edTypewriterOn : t.edTypewriterOff}
        </button>
      </div>

      {/* Toolbar */}
      <EditorToolbar
        editor={editor}
        direction={dir}
        onDirectionChange={handleDirectionChange}
        focusActive={focusMode}
        onToggleFocus={toggleFocus}
        onUndo={requestUndo}
      />

      {/* Title + save status */}
      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaveState("saving");
          }}
          placeholder={t.edTitlePlaceholder}
          dir={dir}
          className="border-b border-border-subtle bg-transparent pb-2 font-serif text-2xl font-medium tracking-tight outline-none placeholder:text-muted/60 focus:border-foreground"
        />
        <p className="text-xs text-muted" role="status">
          {saveState === "saved" ? (
            <span className="stamp stamp-press stamp-fade">{t.edSaved}</span>
          ) : saveState === "saving" ? (
            t.edSaving
          ) : saveState === "error" ? (
            t.edSaveError
          ) : (
            t.edDraftAutosave
          )}
        </p>
      </div>

      {/* Editor */}
      <div
        dir={dir}
        className="h-[calc(100dvh-21rem)] min-h-[16rem] min-w-0 overflow-x-hidden overflow-y-auto rounded-sm border border-border-subtle bg-surface px-6 pt-2 pb-8 shadow-[3px_3px_0_rgba(33,30,26,0.06),0_12px_30px_rgba(33,30,26,0.08)] sm:px-10"
        style={{ "--editor-scale": String(fontScale) } as CSSProperties}
      >
        <EditorContent editor={editor} className="min-w-0 [&_.tiptap]:outline-none" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          disabled={publishing}
          className="btn-type btn-type-solid inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <PaperPlaneTilt size={16} className="shrink-0" aria-hidden="true" />
          {t.edPublishNewVersion}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importWord(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importBusy}
          className="btn-type inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {importBusy ? <CircleNotch size={16} className="animate-spin" aria-hidden="true" /> : <FileDoc size={16} className="shrink-0" aria-hidden="true" />}
          {importBusy ? t.edImporting : t.edImportWord}
        </button>
      </div>

      {/* Publish dialog */}
      {publishOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface p-6">
            <h3 className="font-serif text-xl font-medium">{t.edPublishNewVersion}</h3>
            <p className="mt-1 text-sm text-muted">
              {t.edNextVersionLabel.replace(
                "{n}",
                num(Math.max(0, ...versions.map((v) => v.number)) + 1),
              )}
            </p>
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="text-muted">{t.edVersionNoteLabel}</span>
              <textarea
                value={publishNote}
                onChange={(e) => setPublishNote(e.target.value)}
                rows={2}
                placeholder={t.edVersionNotePlaceholder}
                className="rounded-md border border-border-subtle bg-surface px-3 py-2 outline-none focus:border-foreground"
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={publish}
                disabled={publishing}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {publishing ? <CircleNotch size={16} className="animate-spin" aria-hidden="true" /> : <PaperPlaneTilt size={16} className="shrink-0" aria-hidden="true" />}
                {t.edPublish}
              </button>
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-border-subtle text-sm"
              >
                {t.edCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version list */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <ClockCounterClockwise size={15} className="shrink-0" aria-hidden="true" />
          {t.edVersionsCount.replace("{count}", num(versions.length))}
        </h2>
        {versions.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border-subtle py-10 text-center text-sm text-muted">
            {t.edNoVersions}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-sm border border-border-subtle">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-subtle text-xs text-muted">
                    {num(v.number)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {v.title || t.edVersionFallbackTitle.replace("{n}", num(v.number))}
                      {v.isCurrent && (
                        <span className="stamp ms-2 align-middle">{t.edCurrent}</span>
                      )}
                    </p>
                    {v.note && <p className="truncate text-xs text-muted">{v.note}</p>}
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Clock size={12} className="shrink-0" aria-hidden="true" />
                      {formatLocalDateTime(v.createdAt, locale, calendar)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => restoreVersion(v)}
                  className="btn-type inline-flex items-center gap-2"
                >
                  <ArrowCounterClockwise size={14} className="shrink-0" aria-hidden="true" />
                  {t.edRestoreDraft}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Undo-would-clear confirm dialog */}
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
