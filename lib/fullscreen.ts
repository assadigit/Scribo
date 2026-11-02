/**
 * Thin, defensive wrappers around the browser Fullscreen API (with a webkit
 * fallback). Used by the editors' focus mode — real fullscreen hides the
 * browser chrome (tabs, URL bar, bookmarks) so only the paper remains.
 */

type FsDocument = Document & { webkitExitFullscreen?: () => void | Promise<void> };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };

export function isFullscreen(): boolean {
  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}

/** Enter real browser fullscreen; resolves quietly if unsupported or blocked. */
export function requestFullscreen(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const el = document.documentElement as FsElement;
  const method = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!method) return Promise.resolve();
  return Promise.resolve(method()).catch(() => {});
}

/** Leave real browser fullscreen (no-op when not in fullscreen). */
export function exitFullscreen(): void {
  if (typeof document === "undefined") return;
  if (!document.fullscreenElement) return;
  const doc = document as FsDocument;
  const method = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(document);
  if (method) void Promise.resolve(method()).catch(() => {});
}
