import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getAdminMfa } from "@/lib/mfa";
import { MfaManager } from "@/components/admin/mfa-manager";
import { dictionaries, type Dictionary } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminMfaPage() {
  const admin = await auth.getCurrentAdmin();
  if (!admin) redirect("/admin");

  const mfa = await getAdminMfa(admin.id);

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];

  return (
    <div className="flex flex-col gap-6 py-8">
      <header>
        <h1 className="font-serif text-2xl font-medium tracking-tight">{t.mfaPageTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.mfaPageSubtitle}
        </p>
      </header>

      <MfaManager enabled={mfa?.enabled ?? false} />

      <section className="max-w-xl rounded-xl border border-border-subtle p-5 text-sm leading-7 text-muted">
        <h2 className="mb-2 font-medium text-foreground">{t.mfaPageHelpTitle}</h2>
        <p>{t.mfaPageHelpBody}</p>
      </section>
    </div>
  );
}