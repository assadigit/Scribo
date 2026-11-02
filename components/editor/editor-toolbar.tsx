"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOutSimple,
  CaretDown,
  Check,
  Image as ImageIcon,
  LinkSimple,
  Notebook,
  Smiley,
  Table,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextAa,
  TextT,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers";
import { EMOJI_CATEGORIES } from "@/components/editor/emoji-data";

/**
 * Shared formatting toolbar for the rich-text editors. Direction-agnostic:
 * it renders inside whichever `dir` context the editor box provides, so it
 * mirrors correctly for RTL/LTR. Grouped controls (Heading, Lists) collapse
 * into dropdowns so the toolbar never overflows horizontally on phones.
 */

type ToolProps = {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolBtn({ title, active, disabled, onClick, children }: ToolProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 min-w-7 shrink-0 items-center justify-center rounded-sm px-1 text-xs transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted hover:bg-surface-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-muted",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border-subtle" aria-hidden="true" />;
}

/* Standard paragraph text-direction icons (Material Design
   format_textdirection_l_to_r / r_to_l): text lines plus an arrow showing the
   flow. These are the de-facto standard for RTL/LTR toggles (Gmail, Docs,
   WordPress…), so they read correctly in both Farsi and English UIs. */
const DIRECTION_LTR_PATH =
  "M9 10v5h2V4h2v11h2V4h2V2H9C6.79 2 5 3.79 5 6s1.79 4 4 4zm12 8-4-4v3H5v2h12v3l4-4z";
const DIRECTION_RTL_PATH =
  "M10 10v5h2V4h2v11h2V4h2V2h-8C7.79 2 6 3.79 6 6s1.79 4 4 4zm-2 7v-3l-4 4 4 4v-3h12v-2H8z";

function DirectionIcon({ path, size = 16 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * Grouped dropdown. Renders a trigger with the current selection's label and
 * a panel listing the options. The panel is portaled to <body> and positioned
 * with viewport coordinates, so the toolbar's horizontal scroller can never
 * clip it and it always paints above the editor. Closes on outside click,
 * Escape, scrolling, or resize.
 */
type PanelPos = { top: number; left: number };

/**
 * Measure the trigger and position a popover just below it. Called from the
 * trigger's click handler, so reading refs is allowed.
 */
function measurePanelPos(trigger: HTMLElement, width: number): PanelPos {
  const rect = trigger.getBoundingClientRect();
  const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
  const top = Math.min(rect.bottom + 6, window.innerHeight - 80);
  return { top, left };
}

function GroupMenu({
  label,
  open,
  onToggle,
  onClose,
  title,
  panelWidth = 176,
  children,
}: {
  label: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  panelWidth?: number;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const handleToggle = () => {
    const trigger = triggerRef.current;
    if (trigger) setPos(measurePanelPos(trigger, panelWidth));
    onToggle();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Scrolling (page or the toolbar's own overflow) would leave the fixed
    // panel misaligned with its trigger, so close it.
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, onClose]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        ref={triggerRef}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleToggle}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-sm px-1.5 text-xs transition-colors",
          open ? "bg-surface-muted text-foreground" : "text-muted hover:bg-surface-muted hover:text-foreground",
        )}
      >
        <span className="whitespace-nowrap">{label}</span>
        <CaretDown size={12} className="shrink-0" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ top: pos.top, left: pos.left, width: panelWidth }}
            className="fixed z-[130] min-w-40 overflow-hidden rounded-xl border border-border-subtle bg-surface p-1 shadow-lg"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuItem({
  label,
  active,
  onSelect,
}: {
  label: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-start text-xs transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface-muted",
      )}
    >
      {label}
      {active && <Check size={14} className="shrink-0 opacity-80" />}
    </button>
  );
}

/* Text-ink palette — muted “analog ink” shades tuned for the cream paper
   writing surface (all ≥4.5:1 on --paper): warm leather tones instead of
   saturated primaries. Dark text on dark paper keeps the same limitation
   as before, so every color stays intentional and paper-quiet. */
const PRESET_COLORS = [
  "#211e1a", // ink (matches --ink)
  "#6b5847", // warm taupe
  "#a33b2c", // oxblood (--stamp-red)
  "#6e5a22", // mustard-ochre
  "#5a6b51", // olive-sage
  "#4c6278", // dusty slate
  "#6e4c6b", // muted plum
  "#8a4553", // dusty rosewood
];

/* Pale highlight palette — warm, desaturated pastels that sit quietly on
   the cream paper; dark text stays readable on every swatch in both light
   and dark mode (see .ProseMirror mark / .reader-prose mark). */
type HighlightColorKey =
  | "toolHighlightBlue"
  | "toolHighlightGreen"
  | "toolHighlightRed"
  | "toolHighlightOrange"
  | "toolHighlightPink"
  | "toolHighlightYellow"
  | "toolHighlightPurple";

const HIGHLIGHT_COLORS: ReadonlyArray<{ hex: string; labelKey: HighlightColorKey }> = [
  { hex: "#C9D8E8", labelKey: "toolHighlightBlue" },
  { hex: "#CDDCC2", labelKey: "toolHighlightGreen" },
  { hex: "#F2D3CC", labelKey: "toolHighlightRed" },
  { hex: "#F5DDB8", labelKey: "toolHighlightOrange" },
  { hex: "#F3CDDC", labelKey: "toolHighlightPink" },
  { hex: "#F7E2A8", labelKey: "toolHighlightYellow" },
  { hex: "#E2D5EA", labelKey: "toolHighlightPurple" },
];

const DEFAULT_HIGHLIGHT = "#F7E2A8";

/* Editor type scale (px) — the single source of truth for text size in the
   writing surface. The surface CSS (.ProseMirror) uses the same units and
   bases: English (LTR) 12px, Farsi (RTL) 14px — both steps of this ladder,
   so "Auto" and the matching size agree. Steps are 2px around body sizes
   (10–18), then 4px (18–24), then the heading climb (24–48). Applied as a
   TipTap textStyle mark (font-size in the inline style); lib/render.ts
   whitelists px/pt/rem/em so older saved docs keep their pt sizes. */
const FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48] as const;

const FONT_FAMILIES = [
  { value: "MashinTahrir", label: "ماشین تحریر" },
  { value: "Special Elite", label: "Special Elite" },
  { value: "Vazirmatn", label: "Vazirmatn" },
  { value: "monospace", label: "Monospace" },
] as const;

export function EditorToolbar({
  editor,
  direction,
  onDirectionChange,
  focusActive = false,
  onToggleFocus,
  linesOn = false,
  onToggleLines,
  onUndo,
  stickToContainer = false,
}: {
  editor: Editor;
  /** Current base direction of the writing surface (rtl/ltr). */
  direction: "rtl" | "ltr";
  onDirectionChange: (d: "rtl" | "ltr") => void;
  /** When provided, renders a distraction-free / fullscreen focus toggle. */
  focusActive?: boolean;
  onToggleFocus?: () => void;
  /** Notebook ruled-lines backdrop (editor writing surface). */
  linesOn?: boolean;
  onToggleLines?: () => void;
  /** When provided, used for undo so the host can guard against blanking the note. */
  onUndo?: () => void;
  /** Pin the toolbar flush to the top of its own scrolling container
      (top: 0) instead of under the page header (top: 16). Use inside an
      overflow container where the toolbar is the first child, so text never
      slides into the gap above it. */
  stickToContainer?: boolean;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const { t } = useI18n();
  const [headingOpen, setHeadingOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(EMOJI_CATEGORIES[0].id);
  const colorWrapRef = useRef<HTMLDivElement | null>(null);
  const hlWrapRef = useRef<HTMLDivElement | null>(null);
  const [colorPos, setColorPos] = useState<PanelPos | null>(null);
  const [hlPos, setHlPos] = useState<PanelPos | null>(null);

  const openColor = () => {
    const wrap = colorWrapRef.current;
    if (wrap) setColorPos(measurePanelPos(wrap, 176));
    setColorOpen((v) => !v);
  };

  const openHighlight = () => {
    const wrap = hlWrapRef.current;
    if (wrap) setHlPos(measurePanelPos(wrap, 232));
    setHlOpen((v) => !v);
  };

  // The color / highlight popups are portaled & fixed to the viewport; any
  // scroll (page or the toolbar's own overflow) would misalign them, so close.
  useEffect(() => {
    if (!colorOpen && !hlOpen) return;
    const onScroll = () => {
      setColorOpen(false);
      setHlOpen(false);
    };
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [colorOpen, hlOpen]);

  async function insertImageFromUrl() {
    const raw = prompt(t.toolImagePrompt)?.trim();
    if (!raw) return;

    let url: URL;
    try {
      url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");
    } catch {
      alert(t.toolImageInvalid);
      return;
    }

    // Verify that the address resolves as an image before inserting it. This
    // avoids the broken-image placeholder produced by article-page URLs and
    // expired CDN links. no-referrer also works with more hotlink-protected CDNs.
    const image = document.createElement("img");
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.src = url.toString();
    const valid = await new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 10_000);
      image.onload = () => {
        window.clearTimeout(timeout);
        resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
      };
      image.onerror = () => {
        window.clearTimeout(timeout);
        resolve(false);
      };
    });

    if (!valid) {
      alert(t.toolImageInvalid);
      return;
    }
    editor.chain().focus().setImage({ src: url.toString() }).run();
  }

  function insertTable() {
    const rows = Number(prompt(t.toolTableRows, "3") ?? "3");
    const cols = Number(prompt(t.toolTableCols, "2") ?? "2");
    if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1) return;
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }

  const inTable = editor.isActive("table");

  const headingLabel = editor.isActive("heading", { level: 1 })
    ? t.toolHeading1
    : editor.isActive("heading", { level: 2 })
      ? t.toolHeading2
      : editor.isActive("heading", { level: 3 })
        ? t.toolHeading3
        : editor.isActive("heading", { level: 4 })
          ? t.toolHeading4
          : editor.isActive("heading", { level: 5 })
            ? t.toolHeading5
            : editor.isActive("heading", { level: 6 })
              ? t.toolHeading6
              : t.toolHeading;

  const listLabel = editor.isActive("bulletList")
    ? t.toolBulletList
    : editor.isActive("orderedList")
      ? t.toolOrderedList
      : editor.isActive("taskList")
        ? t.toolTaskList
        : editor.isActive("blockquote")
          ? t.toolBlockquote
          : editor.isActive("codeBlock")
            ? t.toolCodeBlock
            : t.toolList;

  const activeAlign: "left" | "center" | "right" | "justify" | null =
    editor.isActive("textAlign", { textAlign: "left" })
      ? "left"
      : editor.isActive("textAlign", { textAlign: "center" })
        ? "center"
        : editor.isActive("textAlign", { textAlign: "right" })
          ? "right"
          : editor.isActive("textAlign", { textAlign: "justify" })
            ? "justify"
            : null;

  // With no explicit alignment picked, the trigger mirrors the document
  // direction: Farsi documents read right-aligned, English left-aligned.
  const alignShown: "left" | "center" | "right" | "justify" =
    activeAlign ?? (direction === "rtl" ? "right" : "left");

  const alignIcon = (a: "left" | "center" | "right" | "justify") =>
    a === "left" ? (
      <TextAlignLeft size={16} />
    ) : a === "center" ? (
      <TextAlignCenter size={16} />
    ) : a === "justify" ? (
      <TextAlignJustify size={16} />
    ) : (
      <TextAlignRight size={16} />
    );

  const alignLabel = (a: "left" | "center" | "right" | "justify") =>
    a === "left"
      ? t.toolAlignLeft
      : a === "center"
        ? t.toolAlignCenter
        : a === "right"
          ? t.toolAlignRight
          : t.toolJustify;

  // List the primary option first to mirror the reading direction.
  const alignOptions: ("left" | "center" | "right" | "justify")[] =
    direction === "rtl"
      ? ["right", "center", "left", "justify"]
      : ["left", "center", "right", "justify"];

  // Mirror the active highlight swatch on the trigger button (defaults to
  // the yellow marker when nothing is highlighted yet).
  const activeHighlightColor = editor.isActive("highlight")
    ? (editor.getAttributes("highlight").color as string | undefined) ?? DEFAULT_HIGHLIGHT
    : DEFAULT_HIGHLIGHT;

  const currentFontFamily =
    typeof editor.getAttributes("textStyle").fontFamily === "string"
      ? (editor.getAttributes("textStyle").fontFamily as string)
      : "";
  const activeEmojiCategory =
    EMOJI_CATEGORIES.find((category) => category.id === emojiCategory) ?? EMOJI_CATEGORIES[0];

  return (
    <div
      className={`sticky ${stickToContainer ? "top-0" : "top-16"} z-10 flex flex-wrap items-center gap-0 border-b border-border-subtle bg-background/70 px-1 py-1 backdrop-blur`}
    >
      <ToolBtn
        title={t.toolUndo}
        disabled={!editor.can().undo()}
        onClick={() => (onUndo ? onUndo() : editor.chain().focus().undo().run())}
      >
        <ArrowCounterClockwise size={16} />
      </ToolBtn>
      <ToolBtn title={t.toolRedo} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <ArrowClockwise size={16} />
      </ToolBtn>
      <Divider />

      {/* Inline style: Bold stays a single icon; Italic/Underline/Strike are
          stacked in one dropdown to keep the toolbar compact. The trigger
          shows only the active style (or a muted I when none) — the rest
          appear in the menu when clicked. */}
      <ToolBtn title={t.toolBold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>B</b>
      </ToolBtn>
      <GroupMenu
        title={`${t.toolItalic} / ${t.toolUnderline} / ${t.toolStrike}`}
        open={styleOpen}
        onToggle={() => setStyleOpen((v) => !v)}
        onClose={() => setStyleOpen(false)}
        label={
          editor.isActive("italic") ? (
            <i className="text-sm">I</i>
          ) : editor.isActive("underline") ? (
            <u className="text-sm">U</u>
          ) : editor.isActive("strike") ? (
            <s className="text-sm">S</s>
          ) : (
            <i className="text-sm opacity-45">I</i>
          )
        }
      >
        <MenuItem
          label={
            <span className="flex items-center gap-2">
              <i className="w-4 shrink-0 text-center text-sm">I</i>
              {t.toolItalic}
            </span>
          }
          active={editor.isActive("italic")}
          onSelect={() => {
            editor.chain().focus().toggleItalic().run();
            setStyleOpen(false);
          }}
        />
        <MenuItem
          label={
            <span className="flex items-center gap-2">
              <u className="w-4 shrink-0 text-center text-sm">U</u>
              {t.toolUnderline}
            </span>
          }
          active={editor.isActive("underline")}
          onSelect={() => {
            editor.chain().focus().toggleUnderline().run();
            setStyleOpen(false);
          }}
        />
        <MenuItem
          label={
            <span className="flex items-center gap-2">
              <s className="w-4 shrink-0 text-center text-sm">S</s>
              {t.toolStrike}
            </span>
          }
          active={editor.isActive("strike")}
          onSelect={() => {
            editor.chain().focus().toggleStrike().run();
            setStyleOpen(false);
          }}
        />
      </GroupMenu>

      {/* Text styling — one dropdown for font size + family, keeping the
          toolbar narrow enough to never scroll horizontally. */}
      <GroupMenu
        title={t.toolFontSize}
        open={fontSizeOpen}
        onToggle={() => setFontSizeOpen((v) => !v)}
        onClose={() => setFontSizeOpen(false)}
        label={<TextAa size={16} />}
      >
        <span className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted">
          {t.toolFontSize}
        </span>
        <MenuItem
          label={
            <span className="flex items-center gap-2">
              <TextT size={14} className="w-4 shrink-0 opacity-60" />
              {t.toolFontSizeAuto}
            </span>
          }
          active={
            typeof editor.getAttributes("textStyle").fontSize !== "string"
          }
          onSelect={() => {
            editor.chain().focus().unsetFontSize().run();
            setFontSizeOpen(false);
          }}
        />
        <div className="grid grid-cols-4 gap-0.5 px-1.5 py-1">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().setFontSize(`${size}px`).run();
                setFontSizeOpen(false);
              }}
              className={cn(
                "inline-flex h-7 items-center justify-center rounded-sm text-xs tabular-nums transition-colors",
                editor.isActive("textStyle", { fontSize: `${size}px` })
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-surface-muted",
              )}
            >
              {size}
            </button>
          ))}
        </div>
        <span className="mx-2 my-1 block h-px bg-border-subtle" aria-hidden="true" />
        <span className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted">
          {t.toolFontFamily}
        </span>
        <MenuItem
          label={t.toolFontDefault}
          active={!currentFontFamily}
          onSelect={() => {
            editor.chain().focus().unsetFontFamily().run();
            setFontSizeOpen(false);
          }}
        />
        {FONT_FAMILIES.map((font) => (
          <MenuItem
            key={font.value}
            label={
              <span style={{ fontFamily: font.value }}>{font.label}</span>
            }
            active={currentFontFamily === font.value}
            onSelect={() => {
              editor.chain().focus().setFontFamily(font.value).run();
              setFontSizeOpen(false);
            }}
          />
        ))}
      </GroupMenu>
      <Divider />

      {/* Highlight + color */}
      <div className="relative shrink-0" ref={hlWrapRef}>
        <ToolBtn title={t.toolHighlight} active={editor.isActive("highlight")} onClick={openHighlight}>
          <span className="rounded-sm px-1 text-black" style={{ backgroundColor: activeHighlightColor }}>
            ab
          </span>
        </ToolBtn>
        {hlOpen && (
          <>
            <button
              type="button"
              aria-label={t.toolClose}
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setHlOpen(false)}
              tabIndex={-1}
            />
            {hlPos &&
              createPortal(
                <div
                  style={{ top: hlPos.top, left: hlPos.left }}
                  className="fixed z-[130] flex items-center gap-1 rounded-xl border border-border-subtle bg-surface p-1.5 shadow-lg"
                >
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={t[c.labelKey]}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        editor.chain().focus().setHighlight({ color: c.hex }).run();
                        setHlOpen(false);
                      }}
                      className="h-5 w-5 rounded-full border border-border-subtle transition-transform hover:scale-110"
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                  <span className="mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />
                  <button
                    type="button"
                    title={t.toolHighlightRemove}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor.chain().focus().unsetHighlight().run();
                      setHlOpen(false);
                    }}
                    className="inline-flex h-6 items-center rounded-md px-1.5 text-[11px] text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </div>,
                document.body,
              )}
          </>
        )}
      </div>
      <div className="relative shrink-0" ref={colorWrapRef}>
        <ToolBtn title={t.toolTextColor} active={colorOpen} onClick={openColor}>
          <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-border-subtle text-[9px] leading-none">
            A
          </span>
        </ToolBtn>
        {colorOpen && (
          <>
            <button
              type="button"
              aria-label={t.toolClose}
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setColorOpen(false)}
              tabIndex={-1}
            />
            {colorPos &&
              createPortal(
                <div
                  style={{ top: colorPos.top, left: colorPos.left }}
                  className="fixed z-[130] flex items-center gap-1 rounded-xl border border-border-subtle bg-surface p-1.5 shadow-lg"
                >
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(c).run();
                    setColorOpen(false);
                  }}
                  className="h-5 w-5 rounded-full border border-border-subtle transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
              <span className="mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />
              <button
                type="button"
                title={t.toolDefaultColor}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setColorOpen(false);
                }}
                className="inline-flex h-6 items-center rounded-md px-1.5 text-[11px] text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <X size={14} />
              </button>
                </div>,
                document.body,
              )}
          </>
        )}
      </div>
      <Divider />

      {/* Heading dropdown */}
      <GroupMenu
        title={t.toolHeading}
        label={headingLabel}
        open={headingOpen}
        onToggle={() => setHeadingOpen((v) => !v)}
        onClose={() => setHeadingOpen(false)}
      >
        <MenuItem
          label={<span>{t.toolParagraph} <span className="text-muted">(P · 1em)</span></span>}
          active={editor.isActive("paragraph")}
          onSelect={() => {
            editor.chain().focus().setParagraph().run();
            setHeadingOpen(false);
          }}
        />
        <MenuItem
          label={<span>{t.toolHeading1} <span className="text-muted">(H1 · 1.6em)</span></span>}
          active={editor.isActive("heading", { level: 1 })}
          onSelect={() => {
            editor.chain().focus().toggleHeading({ level: 1 }).run();
            setHeadingOpen(false);
          }}
        />
        <MenuItem
          label={<span>{t.toolHeading2} <span className="text-muted">(H2 · 1.35em)</span></span>}
          active={editor.isActive("heading", { level: 2 })}
          onSelect={() => {
            editor.chain().focus().toggleHeading({ level: 2 }).run();
            setHeadingOpen(false);
          }}
        />
        <MenuItem
          label={<span>{t.toolHeading3} <span className="text-muted">(H3 · 1.15em)</span></span>}
          active={editor.isActive("heading", { level: 3 })}
          onSelect={() => {
            editor.chain().focus().toggleHeading({ level: 3 }).run();
            setHeadingOpen(false);
          }}
        />
        <MenuItem
          label={<span>{t.toolHeading4} <span className="text-muted">(H4 · 1em)</span></span>}
          active={editor.isActive("heading", { level: 4 })}
          onSelect={() => {
            editor.chain().focus().toggleHeading({ level: 4 }).run();
            setHeadingOpen(false);
          }}
        />
        <MenuItem
          label={<span>{t.toolHeading5} <span className="text-muted">(H5 · 0.95em)</span></span>}
          active={editor.isActive("heading", { level: 5 })}
          onSelect={() => {
            editor.chain().focus().toggleHeading({ level: 5 }).run();
            setHeadingOpen(false);
          }}
        />
        <MenuItem
          label={<span>{t.toolHeading6} <span className="text-muted">(H6 · 0.9em)</span></span>}
          active={editor.isActive("heading", { level: 6 })}
          onSelect={() => {
            editor.chain().focus().toggleHeading({ level: 6 }).run();
            setHeadingOpen(false);
          }}
        />
      </GroupMenu>
      <Divider />

      {/* Lists dropdown */}
      <GroupMenu
        label={listLabel}
        title={t.toolList}
        open={listOpen}
        onToggle={() => setListOpen((v) => !v)}
        onClose={() => setListOpen(false)}
      >
        <MenuItem
          label={t.toolBulletList}
          active={editor.isActive("bulletList")}
          onSelect={() => {
            editor.chain().focus().toggleBulletList().run();
            setListOpen(false);
          }}
        />
        <MenuItem
          label={t.toolOrderedList}
          active={editor.isActive("orderedList")}
          onSelect={() => {
            editor.chain().focus().toggleOrderedList().run();
            setListOpen(false);
          }}
        />
        <MenuItem
          label={t.toolTaskList}
          active={editor.isActive("taskList")}
          onSelect={() => {
            editor.chain().focus().toggleTaskList().run();
            setListOpen(false);
          }}
        />
        <MenuItem
          label={t.toolBlockquote}
          active={editor.isActive("blockquote")}
          onSelect={() => {
            editor.chain().focus().toggleBlockquote().run();
            setListOpen(false);
          }}
        />
        <MenuItem
          label={t.toolCodeBlock}
          active={editor.isActive("codeBlock")}
          onSelect={() => {
            editor.chain().focus().toggleCodeBlock().run();
            setListOpen(false);
          }}
        />
      </GroupMenu>

      {/* Alignment — compacted into one dropdown; the trigger icon reflects the
          current alignment and falls back to the document direction (right for
          Farsi, left for English). */}
      <GroupMenu
        title={t.toolAlign}
        label={alignIcon(alignShown)}
        open={alignOpen}
        onToggle={() => setAlignOpen((v) => !v)}
        onClose={() => setAlignOpen(false)}
      >
        {alignOptions.map((a) => (
          <MenuItem
            key={a}
            label={
              <span className="flex items-center gap-2">
                {alignIcon(a)}
                {alignLabel(a)}
              </span>
            }
            active={activeAlign === a}
            onSelect={() => {
              editor.chain().focus().setTextAlign(a).run();
              setAlignOpen(false);
            }}
          />
        ))}
      </GroupMenu>
      <Divider />

      {/* Writing direction — bilingual notes switch RTL/LTR often enough to
          deserve a visible toggle. */}
      <GroupMenu
        title={t.toolDirection}
        label={
          <DirectionIcon path={direction === "rtl" ? DIRECTION_RTL_PATH : DIRECTION_LTR_PATH} />
        }
        open={dirOpen}
        onToggle={() => setDirOpen((v) => !v)}
        onClose={() => setDirOpen(false)}
      >
        <MenuItem
          label={
            <span className="flex items-center gap-2">
              <DirectionIcon path={DIRECTION_RTL_PATH} />
              {t.toolDirectionRtL}
            </span>
          }
          active={direction === "rtl"}
          onSelect={() => {
            onDirectionChange("rtl");
            setDirOpen(false);
          }}
        />
        <MenuItem
          label={
            <span className="flex items-center gap-2">
              <DirectionIcon path={DIRECTION_LTR_PATH} />
              {t.toolDirectionLtR}
            </span>
          }
          active={direction === "ltr"}
          onSelect={() => {
            onDirectionChange("ltr");
            setDirOpen(false);
          }}
        />
      </GroupMenu>
      <Divider />

      {/* Insert */}
      <GroupMenu
        title={t.toolEmoji}
        label={<Smiley size={16} />}
        open={emojiOpen}
        onToggle={() => setEmojiOpen((v) => !v)}
        onClose={() => setEmojiOpen(false)}
        panelWidth={304}
      >
        <div className="flex gap-1 overflow-x-auto border-b border-border-subtle p-1" role="tablist">
          {EMOJI_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={emojiCategory === category.id}
              title={category.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setEmojiCategory(category.id)}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base transition-colors",
                emojiCategory === category.id ? "bg-accent" : "hover:bg-surface-muted",
              )}
            >
              {category.icon}
            </button>
          ))}
        </div>
        <div
          className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-1"
          role="tabpanel"
          aria-label={activeEmojiCategory.label}
        >
          {activeEmojiCategory.emojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              type="button"
              title={emoji}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().insertContent(emoji).run();
                setEmojiOpen(false);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-surface-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
      </GroupMenu>
      <ToolBtn
        title={t.toolLink}
        onClick={() => {
          const url = prompt(t.toolLinkPrompt);
          if (!url) return;
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        <LinkSimple size={16} />
      </ToolBtn>
      <ToolBtn title={t.toolImage} onClick={() => void insertImageFromUrl()}>
        <ImageIcon size={16} />
      </ToolBtn>
      <ToolBtn
        title={inTable ? t.toolDeleteTable : t.toolTable}
        active={inTable}
        onClick={() => {
          if (inTable) {
            editor.chain().focus().deleteTable().run();
          } else {
            insertTable();
          }
        }}
      >
        <Table size={16} />
      </ToolBtn>
      <Divider />

      {/* Notebook ruled-lines backdrop (toggleable in focus mode too) */}
      {onToggleLines && (
        <ToolBtn
          title={linesOn ? t.edNotebookLinesOnTitle : t.edNotebookLinesOffTitle}
          active={linesOn}
          onClick={onToggleLines}
        >
          <Notebook size={16} />
        </ToolBtn>
      )}

      {/* Distraction-free / fullscreen focus mode */}
      {onToggleFocus && (
        <ToolBtn
          title={focusActive ? t.edExitFocusMode : t.edFocusMode}
          active={focusActive}
          onClick={onToggleFocus}
        >
          <ArrowsOutSimple size={16} />
        </ToolBtn>
      )}
    </div>
  );
}