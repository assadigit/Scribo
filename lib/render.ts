import { localizeDigits } from "@/lib/format";

/**
 * Minimal TipTap JSON → HTML renderer used by the reader pages.
 * Works in workerd (no DOM, no deps). Supports the node/mark types enabled in
 * the admin editor (StarterKit + link/underline/textAlign/image + highlight,
 * color, table, and task lists). Keep these cases in sync with the extension
 * list in components/editor/extensions.ts.
 */

type JSONNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: JSONNode[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Restrict a CSS color value to a safe charset so it can never break out of a
// style attribute (e.g. `color: red; background:url(…)`) or inject markup.
function safeColor(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/[^#\w,.()%\s\-]/g, "");
  return cleaned.slice(0, 64);
}

// Font-family marks are limited to the self-hosted/editor choices. Returning a
// fixed mapped value prevents arbitrary CSS from entering the reader HTML.
function safeFontFamily(value: unknown): string {
  if (typeof value !== "string") return "";
  const families: Record<string, string> = {
    MashinTahrir: '"MashinTahrir"',
    "Special Elite": '"Special Elite"',
    Vazirmatn: '"Vazirmatn"',
    monospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  };
  return families[value.trim()] ?? "";
}

function renderMarks(text: string, marks?: JSONNode["marks"]): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "highlight": {
        const bg = safeColor(mark.attrs?.color ?? "");
        out = bg
          ? `<mark style="background-color:${bg}">${out}</mark>`
          : `<mark>${out}</mark>`;
        break;
      }
      case "textStyle": {
        const color = safeColor(mark.attrs?.color ?? "");
        // Font size comes from the toolbar picker as e.g. "14px". Whitelist
        // the format (number + px/pt/rem/em) so it can never break out of the
        // style attribute — and so notes saved with the older pt ladder still
        // render. Font-family is selected from a fixed allowlist.
        const rawSize = typeof mark.attrs?.fontSize === "string" ? mark.attrs.fontSize : "";
        const size = /^\d+(\.\d+)?(px|pt|rem|em)$/i.test(rawSize.trim()) ? rawSize.trim() : "";
        const fontFamily = safeFontFamily(mark.attrs?.fontFamily);
        const styles = [
          color && `color:${color}`,
          size && `font-size:${size}`,
          fontFamily && `font-family:${fontFamily}`,
        ]
          .filter(Boolean)
          .join(";");
        out = styles ? `<span style="${styles}">${out}</span>` : out;
        break;
      }
      case "link": {
        // Only allow safe schemes. escapeHtml alone still lets `javascript:`
        // through and it is rendered as raw HTML on the reader page, so any
        // other scheme is rendered as inert text instead of a clickable href.
        const raw = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        const safeHref = /^(https?:|mailto:)/i.test(raw.trim()) ? raw : "";
        if (!safeHref) {
          out = `<span class="reader-inert-link">${out}</span>`;
          break;
        }
        const rel = /^https?:/i.test(safeHref) ? ' rel="noopener noreferrer"' : "";
        out = `<a href="${escapeHtml(safeHref)}"${rel}>${out}</a>`;
        break;
      }
    }
  }
  return out;
}

function renderNode(node: JSONNode): string {
  if (node.type === "text" && typeof node.text === "string") {
    // Context-aware numerals: Farsi context → Persian digits, Latin stays.
    return renderMarks(escapeHtml(localizeDigits(node.text)), node.marks);
  }

  const children = (node.content ?? []).map(renderNode).join("");
  // Whitelist text-align so a malicious bodyJson value can never inject CSS
  // or break out of the style attribute.
  const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);
  const align =
    typeof node.attrs?.textAlign === "string" && ALIGNMENTS.has(node.attrs.textAlign)
      ? node.attrs.textAlign
      : null;
  const style = align && align !== "left" ? ` style="text-align:${align}"` : "";

  switch (node.type) {
    case "paragraph":
      return `<p${style}>${children || "<br>"}</p>`;
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const h = Math.min(Math.max(level, 1), 6);
      return `<h${h}${style}>${children}</h${h}>`;
    }
    case "bulletList":
      return `<ul>${children}</ul>`;
    case "orderedList": {
      // `start` must be a bounded integer; anything else is dropped so a
      // malicious JSON payload can't inject attributes into the tag.
      const rawStart = node.attrs?.start;
      let startAttr = "";
      const numeric =
        typeof rawStart === "number" ? rawStart : typeof rawStart === "string" ? Number(rawStart) : NaN;
      if (Number.isFinite(numeric)) {
        startAttr = ` start="${Math.max(1, Math.min(Math.floor(numeric), 9999))}"`;
      }
      return `<ol${startAttr}>${children}</ol>`;
    }
    case "listItem":
      return `<li>${children}</li>`;
    case "blockquote":
      return `<blockquote>${children}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${escapeHtml(extractText(node))}</code></pre>`;
    case "hardBreak":
      return "<br>";
    case "horizontalRule":
      return "<hr>";
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      // Scheme whitelist: http(s) + raster data: URIs only (no javascript:,
      // no svg+xml — a known inline-script XSS vector when rendered as HTML).
      // Length cap keeps a giant data URI from bloating every reader page.
      const safeSrc =
        /^(https?:\/\/|data:image\/(png|jpeg|webp|gif);)/i.test(src.trim()) &&
        src.length <= 2_000_000
          ? src
          : "";
      if (!safeSrc) {
        return `<span class="reader-inert-image">${escapeHtml(alt) || ""}</span>`;
      }
      return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer" />`;
    }
    case "table":
      return `<table><tbody>${children}</tbody></table>`;
    case "tableRow":
      return `<tr>${children}</tr>`;
    case "tableCell":
      return `<td${cellAttrs(node)}>${children || "&nbsp;"}</td>`;
    case "tableHeader":
      return `<th${cellAttrs(node)}>${children || "&nbsp;"}</th>`;
    case "taskList":
      return `<ul class="task-list">${children}</ul>`;
    case "taskItem": {
      const checked = node.attrs?.checked ? " checked" : "";
      return `<li class="task-item"${checked}>${children}</li>`;
    }
    default:
      return children;
  }
}

function cellAttrs(node: JSONNode): string {
  const attrs = node.attrs ?? {};
  let out = "";
  if (typeof attrs.colspan === "number" && attrs.colspan > 1) out += ` colspan="${attrs.colspan}"`;
  if (typeof attrs.rowspan === "number" && attrs.rowspan > 1) out += ` rowspan="${attrs.rowspan}"`;
  return out;
}

function extractText(node: JSONNode): string {
  if (node.type === "text" && typeof node.text === "string") return node.text;
  return (node.content ?? []).map(extractText).join("");
}

/** Render a stored version.bodyJson into safe HTML. Accepts JSON string or object. */
export function renderTipTapJson(json: string | unknown): string {
  let data: JSONNode | undefined;
  if (typeof json === "string") {
    try {
      data = JSON.parse(json) as JSONNode;
    } catch {
      return "";
    }
  } else if (json && typeof json === "object") {
    data = json as JSONNode;
  }
  if (!data) return "";
  return renderNode(data);
}

/** Extract the plain-text content of a TipTap document (for excerpts). */
export function tipTapPlainText(json: string | unknown): string {
  let data: JSONNode | undefined;
  if (typeof json === "string") {
    try {
      data = JSON.parse(json) as JSONNode;
    } catch {
      return "";
    }
  } else if (json && typeof json === "object") {
    data = json as JSONNode;
  }
  if (!data) return "";
  return localizeDigits(extractText(data)).replace(/\s+/g, " ").trim();
}