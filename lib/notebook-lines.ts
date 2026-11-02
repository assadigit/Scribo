/**
 * Notebook ruled lines — an optional, very subtle ruled backdrop on the
 * writing surface (editor + focus mode) that mimics a paper notebook page.
 *
 * The preference persists per device via localStorage and is ON by default
 * (opt-out via the toolbar / focus-mode toggle), matching the typewriter-sound
 * pattern in lib/sfx.ts.
 */

let linesEnabled = true;

const KEY = "scribo:notebook-lines";

/* Observable store so components can subscribe without setState-in-effect. */
type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  for (const l of listeners) l();
}

export function subscribeNotebookLines(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNotebookLinesEnabled(): boolean {
  return linesEnabled;
}

/** Turn the notebook ruled lines on/off (persisted per device). */
export function setNotebookLines(enabled: boolean): void {
  linesEnabled = enabled;
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable — keep in-memory state */
  }
  emitChange();
}

/** Call once in a client effect to restore the saved preference (on by default). */
export function initNotebookLines(): void {
  try {
    linesEnabled = localStorage.getItem(KEY) !== "0";
  } catch {
    linesEnabled = true;
  }
  emitChange();
}