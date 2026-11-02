"use client";

import { EditorState } from "@tiptap/pm/state";
import { undo } from "@tiptap/pm/history";
import type { Editor } from "@tiptap/react";

/**
 * Reset the undo/redo history so the CURRENT document becomes the baseline.
 *
 * TipTap's setContent records a history step (empty → loaded), so undoing can
 * walk past the loaded note back to the initial blank doc — which looks like
 * the post was deleted. Recreating the editor state with the current doc makes
 * undo stop at the loaded content.
 *
 * NB: must use EditorState.create, NOT EditorState.reconfigure — reconfigure
 * preserves existing plugin states (and therefore the history).
 */
export function resetEditorHistory(editor: Editor) {
  const { schema, doc, selection, plugins } = editor.state;
  editor.view.updateState(EditorState.create({ schema, doc, selection, plugins }));
}

/**
 * Dry-run the next undo and report whether it would clear the whole document.
 * Returns false when nothing is undoable or the doc is already empty.
 * The captured dispatch must never be wired to the view — it only inspects
 * the transaction produced by prosemirror-history's undo command.
 */
export function undoWouldClearDoc(state: EditorState): boolean {
  if (state.doc.textContent.trim() === "") return false;
  let found = false;
  let nextText = "";
  undo(state, (tr) => {
    found = true;
    nextText = tr.doc.textContent;
  });
  return found && nextText.trim() === "";
}
