/**
 * Minimal TipTap JSON → Markdown converter used by the export-to-MD feature.
 * Runs in workerd (no DOM, no deps, no npm markdown lib needed). Supports the
 * node/mark types enabled in the admin editor (StarterKit + link/underline/
 * textAlign/image/highlight + color + table + task lists) — keep these cases
 * in sync with components/editor/extensions.ts and lib/render.ts.
 *
 * Output targets Obsidian/GitHub-flavored Markdown so a downloaded note keeps
 * its heading structure, lists, links and emphasis when imported elsewhere.
 */

type JSONNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: JSONNode[];
};

/** Escape Markdown-significant characters in inline text. */
function escapeMdText(value: string): string {
  return value.replace(/([\\`*_[\]{}()#+.!|<>~-])/g, "\\$1");
}

/** Plain text of a node subtree (for code blocks, table cells, alt text…). */
function plainText(node: JSONNode): string {
  if (node.type === "text" && typeof node.text === "string") return node.text;
  return (node.content ?? []).map(plainText).join("");
}

/** Inline markdown for a text node with marks. */
function inlineMarks(text: string, marks?: JSONNode["marks"]): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = `**${out}**`;
        break;
      case "italic":
        out = `*${out}*`;
        break;
      case "strike":
        out = `~~${out}~~`;
        break;
      case "code":
        out = `\`${out}\``;
        break;
      case "underline":
        // Markdown has no underline; keep it as inline HTML so Obsidian
        // preserves the emphasis.
        out = `<u>${out}</u>`;
        break;
      case "highlight":
        // `==text==` is the Obsidian convention for highlighted text.
        out = `==${out}==`;
        break;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        if (/^(https?:|mailto:)/i.test(href.trim())) {
          out = `[${out}](${href})`;
        } else {
          // Unsafe scheme (javascript: etc) — render as inert text.
          out = out.replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));
        }
        break;
      }
      case "textStyle": {
        const color = typeof mark.attrs?.color === "string" ? mark.attrs.color : "";
        if (color) {
          const safe = color.replace(/[^#\w,.()%\s\-]/g, "").slice(0, 64);
          out = `<span style="color:${safe}">${out}</span>`;
        }
        break;
      }
    }
  }
  return out;
}

function renderInline(node: JSONNode): string {
  if (node.type === "text" && typeof node.text === "string") {
    return inlineMarks(escapeMdText(node.text), node.marks);
  }
  if (node.type === "hardBreak") return "\n";
  if (node.type === "image") {
    const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
    // A data: URI would bloat a .md file — keep http(s) images only.
    return /^https?:\/\//i.test(src.trim()) ? `![${alt}](${src})` : alt || "";
  }
  return escapeMdText(plainText(node));
}

/** Inline content of a paragraph (or a list item's leading paragraph). */
function paragraphInline(node: JSONNode): string {
  return renderInlineNodes(node.content ?? []);
}

function renderInlineNodes(nodes: JSONNode[]): string {
  return nodes.map(renderInline).join("");
}

function renderBlock(node: JSONNode): string {
  switch (node.type) {
    case "paragraph": {
      const inline = paragraphInline(node);
      return inline ? `${inline}\n\n` : "\n";
    }
    case "heading": {
      // Must match the editor's heading levels (H1–H6); render.ts clamps to 6.
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${"#".repeat(level)} ${paragraphInline(node)}\n\n`;
    }
    case "blockquote": {
      const lines = (node.content ?? [])
        .filter((c) => c.type === "paragraph")
        .map((p) => paragraphInline(p))
        .filter(Boolean);
      return lines.map((l) => `> ${l}`).join("\n") + "\n\n";
    }
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return `\`\`\`${lang}\n${plainText(node)}\n\`\`\`\n\n`;
    }
    case "horizontalRule":
      return "---\n\n";
    case "table":
      return renderTable(node);
    default:
      return "";
  }
}

/** Render a list (bullet/ordered/task) with proper nesting under items. */
function renderList(node: JSONNode): string {
  const lines: string[] = [];

  const walk = (list: JSONNode, depth: number) => {
    const isOrdered = list.type === "orderedList";
    const isTask = list.type === "taskList";
    let counter = Number(list.attrs?.start ?? 1);
    const indent = "  ".repeat(Math.max(depth - 1, 0));

    for (const item of list.content ?? []) {
      if (item.type !== "listItem") continue;
      const nested = (item.content ?? []).filter(
        (c) => c.type === "bulletList" || c.type === "orderedList" || c.type === "taskList",
      );
      const bodyNodes = (item.content ?? []).filter((c) => !nested.includes(c));
      const bodyText = bodyNodes
        .map((n) => (n.type === "paragraph" ? paragraphInline(n) : ""))
        .filter(Boolean)
        .join(" ");

      let marker: string;
      if (isTask) {
        const checked = item.attrs?.checked ? "x" : " ";
        marker = `- [${checked}]`;
      } else if (isOrdered) {
        marker = `${counter}.`;
      } else {
        marker = "-";
      }
      lines.push(`${indent}${marker} ${bodyText}`.trimEnd());
      counter += 1;
      for (const child of nested) walk(child, depth + 1);
    }
  };

  walk(node, 1);
  return lines.join("\n") + "\n\n";
}

/** Minimal GFM table — TipTap tables map to pipe rows; header = first row. */
function renderTable(node: JSONNode): string {
  const rows = (node.content ?? []).filter((r) => r.type === "tableRow");
  if (rows.length === 0) return "";
  const cells = rows.map((row) =>
    (row.content ?? [])
      .filter((c) => c.type === "tableCell" || c.type === "tableHeader")
      .map((c) => renderInlineNodes(c.content ?? []).trim().replace(/\|/g, "\\|")),
  );
  const widths = Math.max(...cells.map((r) => r.length));
  const pad = (arr: string[]) => [...arr, ...Array<string>(widths).fill("")].slice(0, widths);
  const body = cells.map((r) => `| ${pad(r).join(" | ")} |`);
  const sep = `| ${Array<string>(widths).fill("---").join(" | ")} |`;
  return `${body[0]}\n${sep}\n${body.slice(1).join("\n")}\n\n`;
}

function renderNode(node: JSONNode): string {
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
    return renderList(node);
  }
  return renderBlock(node);
}

/** Render a stored version.bodyJson into Markdown. Accepts string or object. */
export function renderTipTapMarkdown(json: string | unknown): string {
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
  return (
    (data.content ?? [])
      .map(renderNode)
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/** Alias used by the editor's “Copy as Markdown” (Obsidian-friendly). */
export function jsonToMarkdown(doc: unknown): string {
  return renderTipTapMarkdown(doc);
}