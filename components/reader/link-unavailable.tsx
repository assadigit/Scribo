import Link from "next/link";
import { cookies } from "next/headers";
import { Scribo } from "@/components/icons/scribo";
import { SiteHeader } from "@/components/site-header";
import { dictionaries, type Dictionary } from "@/lib/i18n";

/** Dead-link screen: revoked/expired links, and burned one-time links that were
 *  already used (or whose grace window ran out). */
export async function LinkUnavailable({ usedOnce }: { usedOnce: boolean }) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <Scribo className="h-10 w-10 text-muted" />
        <p className="text-lg font-medium text-foreground">
          {usedOnce ? t.readerOneTimeUsed : t.readerLinkDisabled}
        </p>
        <p className="text-sm text-muted">
          {usedOnce ? t.readerOneTimeUsedEn : t.readerLinkDisabledEn}
        </p>
        <Link href="/" className="text-xs text-muted underline-offset-4 hover:underline">
          {t.readerLinkHome}
        </Link>
      </main>
    </div>
  );
}