import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getCustomFont } from "@/lib/fonts";
import { FontUploader } from "@/components/admin/font-uploader";
import { dictionaries, type Dictionary } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminFontsPage() {
  const admin = await auth.getCurrentAdmin();
  if (!admin) redirect("/admin");

  const font = await getCustomFont();

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];

  return (
    <div className="flex flex-col gap-6 py-8">
      <header>
        <h1 className="font-serif text-2xl font-medium tracking-tight">{t.fontsTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.fontsSubtitle}
        </p>
      </header>

      <FontUploader
        current={font ? { family: font.family, format: font.format } : null}
      />

      <section className="max-w-xl rounded-xl border border-border-subtle p-5 text-sm leading-7 text-muted">
        <h2 className="mb-2 font-medium text-foreground">{t.fontsHelpTitle}</h2>
        <p>{t.fontsFormatsHelp}</p>
        <p className="mt-2">{t.fontsRemovalNote}</p>
      </section>
    </div>
  );
}