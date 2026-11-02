"use client";

import { Extension, InputRule } from "@tiptap/core";
import { findWrapping, canJoin } from "@tiptap/pm/transform";

/**
 * Obsidian-style markdown input rules that TipTap's StarterKit doesn't ship.
 *
 * StarterKit already covers the classic CommonMark shortcuts (`# ` space-based
 * headings, `**bold**`, `*it*`, `~~strike~~`, `==highlight==`, `> quote`,
 * `- ` / `1. ` lists, ` ``` ` code fence, `---` rule, `[text](url)` links,
 * `![alt](src)` images). This extension adds the Obsidian conveniences that
 * are missing:
 *
 * 1. Space-less headings — `#heading` and `##heading2` convert as soon as a
 *    character follows the hash run at the start of a line (Obsidian still
 *    requires the space; the editor intentionally relaxes that).
 * 2. Task lists typed as `- [ ]` / `- [x]` (any character in the brackets
 *    marks the task done, like Obsidian). The plain bullet input rule fires
 *    first on `- `, so this rule is registered before StarterKit and converts
 *    the resulting bullet list into a task list when the `[ ]` is completed.
 * 3. Ordered lists using a closing paren — `1) `, exactly like Obsidian.
 *
 * The extension must be registered BEFORE StarterKit so its rules are checked
 * first (the task-list rule needs to see the `[ ] ` keystrokes before the
 * bullet-list rule that converts `- ` early).
 */

/** Matches a run of 1–6 hashes at the block start, followed by (not a space
 *  and not another hash) — i.e. `#heading`, `##x` — but NOT bare `#`, `## `
 * (the space rule handles that), or 7+ hashes. */
const noSpaceHeadingRegex = /^(#{1,6})(?=[^\s#])/;

/** `- [ ] `, `* [x] `, `+ [X] ` — and the bare `[ ] ` / `[x] ` form once the
 *  `- ` has already been turned into a bullet list by StarterKit. */
const taskListRegex = /^\s*(?:[-+*]\s+)?\[(.)\]\s$/;

/** `1) ` — Obsidian also accepts a closing paren after the number. */
const orderedParenRegex = /^(\d+)\)\s$/;

export const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",

  addInputRules() {
    return [
      // 1 — space-less headings (#heading / ##heading2 / … up to 6 levels).
      new InputRule({
        find: noSpaceHeadingRegex,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          // Only convert plain blocks (list items can't hold headings).
          if ($from.parent.type.name === "heading") return null;

          // The find rule already guaranteed this shape; re-verify the level.
          const level = /^(#{1,6})/.exec(
            $from.parent.textBetween(0, $from.parentOffset, "", ""),
          )?.[1].length;
          if (!level || level > 6) return null;

          const headingType = state.schema.nodes.heading;
          const blockStart = $from.start($from.depth);
          const blockEnd = $from.end($from.depth);
          const $start = state.doc.resolve(blockStart);
          if (
            !$start
              .node(-1)
              .canReplaceWith($start.index(-1), $start.indexAfter(-1), headingType)
          ) {
            return null;
          }

          // Drop the hash run, then re-type the block as a heading. The text
          // after the hashes is preserved; the caret maps to just after it.
          state.tr
            .delete(blockStart, blockStart + level)
            .setBlockType(blockStart, blockEnd - level, headingType, { level });
        },
      }),

      // 2 — task lists (`- [ ]`, `- [x]`, `* [X]`, …).
      new InputRule({
        find: taskListRegex,
        handler: ({ state, range, match }) => {
          const checked = match[1] !== " ";

          // What kind of block are we in? The `- ` usually becomes a bullet
          // list before `[ ]` is typed, so climb to find the enclosing list.
          const $inBlock = state.doc.resolve(range.from);
          let listTypeName: string | null = null;
          let itemPos = -1;
          for (let d = $inBlock.depth; d > 0; d--) {
            const node = $inBlock.node(d);
            if (node.type.name === "bulletList" || node.type.name === "taskList") {
              listTypeName = node.type.name;
              itemPos = $inBlock.before(d + 1);
              break;
            }
          }

          const tr = state.tr;
          tr.delete(range.from, range.to);

          // Already a task list — just mark the current item done/undone.
          if (listTypeName === "taskList") {
            tr.setNodeMarkup(itemPos, undefined, { checked });
            return;
          }

          // It was a bullet list — convert the whole list to a task list.
          if (listTypeName === "bulletList") {
            const $after = tr.doc.resolve(range.from);
            let listPos2 = -1;
            let itemPos2 = -1;
            for (let d = $after.depth; d > 0; d--) {
              if ($after.node(d).type.name === "bulletList") {
                listPos2 = $after.before(d);
                itemPos2 = $after.before(d + 1);
                break;
              }
            }
            const listNode = tr.doc.nodeAt(listPos2);
            if (!listNode) return null;

            const taskListType = state.schema.nodes.taskList;
            const taskItemType = state.schema.nodes.taskItem;
            const $item = tr.doc.resolve(itemPos2);
            const currentIdx = $item.index($item.depth);

            const items = [];
            for (let i = 0; i < listNode.childCount; i++) {
              const child = listNode.child(i);
              items.push(
                taskItemType.create({ checked: i === currentIdx ? checked : false }, child.content),
              );
            }
            tr.replaceWith(listPos2, listPos2 + listNode.nodeSize, taskListType.create(null, items));
            return;
          }

          // Plain paragraph — wrap it into a fresh task list.
          const $p = tr.doc.resolve(range.from);
          const blockRange = $p.blockRange();
          if (!blockRange) return null;
          const wrapping = findWrapping(blockRange, state.schema.nodes.taskList);
          if (!wrapping) return null;
          tr.wrap(blockRange, wrapping);
          // The wrap inserts taskList → taskItem around the block; the item
          // node sits at blockRange.start + 1.
          tr.setNodeMarkup(blockRange.start + 1, undefined, { checked });
        },
      }),

      // 3 — ordered lists with a closing paren (`1) `).
      new InputRule({
        find: orderedParenRegex,
        handler: ({ state, range, match }) => {
          const orderedListType = state.schema.nodes.orderedList;
          const tr = state.tr.delete(range.from, range.to);
          const $start = tr.doc.resolve(range.from);
          const blockRange = $start.blockRange();
          if (!blockRange) return null;

          const wrapping = findWrapping(blockRange, orderedListType, {
            start: +match[1],
          });
          if (!wrapping) return null;
          tr.wrap(blockRange, wrapping);

          // Continue an existing numbered list when the number follows on.
          const before = tr.doc.resolve(range.from - 1).nodeBefore;
          if (
            before &&
            before.type === orderedListType &&
            canJoin(tr.doc, range.from - 1) &&
            (!before.attrs.type || before.attrs.type === "1") &&
            before.childCount + before.attrs.start === +match[1]
          ) {
            tr.join(range.from - 1);
          }
        },
      }),
    ];
  },
});