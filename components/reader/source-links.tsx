import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { toFa } from "@/lib/format";
import { dictionaries } from "@/lib/i18n";

export type ReaderSourceLink = {
  id: string;
  url: string;
  title: string | null;
  position: number;
};

/**
 * The note's cited sources — a tidy numbered container under the article body.
 * Only http(s) URLs are rendered as links (the API enforces this; the check
 * here is a second line of defense so a bad row can never become a link).
 */
export function ReaderSourceLinks({
  links,
  locale,
}: {
  links: ReaderSourceLink[];
  locale: "fa" | "en";
}) {
  if (!links || links.length === 0) return null;
  const t = dictionaries[locale];
  const num = (n: number) => (locale === "fa" ? toFa(n) : String(n));

  return (
    <section className="mt-10 rounded-xl border border-border-subtle bg-surface p-5">
      <h2 className="text-sm font-medium text-muted">
        {t.srcTitle.replace("{count}", num(links.length))}
      </h2>
      <ol className="mt-3 flex flex-col gap-3">
        {links.map((link, i) => {
          const safe = /^https?:\/\//i.test(link.url);
          return (
            <li key={link.id} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle text-[11px] text-muted">
                {num(i + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={safe ? link.url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline decoration-border-subtle underline-offset-4 transition-colors hover:decoration-foreground"
                >
                  {link.title || link.url}
                  {safe && (
                    <ArrowSquareOut
                      size={13}
                      className="ms-1.5 inline-block text-muted"
                      aria-hidden="true"
                    />
                  )}
                </a>
                {safe && (
                  <p dir="ltr" className="mt-0.5 truncate text-xs text-muted">
                    {link.url}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
