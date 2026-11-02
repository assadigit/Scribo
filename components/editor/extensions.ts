"use client";

import type { Extensions } from "@tiptap/react";
import { dictionaries, isLocale } from "@/lib/i18n";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TiptapLink from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Typography from "@tiptap/extension-typography";
import { TextStyle, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { MarkdownShortcuts } from "@/components/editor/markdown-shortcuts";

/**
 * The full rich-text extension set shared by every editor (new-text composer
 * and the chapter editor). The stored JSON (`version.bodyJson`) is rendered in
 * the reader via lib/render.ts, which understands each node/mark below — keep
 * them in sync if you change this list.
 */
/**
 * The editor placeholder can't live off `useI18n` (this file isn't a
 * component). Resolve the active locale from `<html lang>`, which the root
 * layout and the inline head script keep in sync with the locale cookie.
 */
function activeEditorPlaceholder(): string {
  if (typeof document === "undefined") return dictionaries.fa.edEditorPlaceholder;
  const locale = isLocale(document.documentElement.lang)
    ? document.documentElement.lang
    : "fa";
  return dictionaries[locale].edEditorPlaceholder;
}

export const RICH_EXTENSIONS: Extensions = [
  // Obsidian markdown input rules must run before StarterKit's own rules so
  // the task-list `[ ] ` keystrokes are seen before the bullet rule converts
  // `- ` early (see markdown-shortcuts.ts).
  MarkdownShortcuts,
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Underline,
  Typography,
  TextStyle,
  FontFamily,
  FontSize,
  Color,
  Highlight.configure({ multicolor: true }),
  Placeholder.configure({ placeholder: activeEditorPlaceholder() }),
  TiptapLink.configure({ openOnClick: false, autolink: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Image.configure({
    HTMLAttributes: {
      loading: "lazy",
      referrerpolicy: "no-referrer",
    },
  }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
];