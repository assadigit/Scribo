import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/lib/auth";
import { dictionaries, type Dictionary } from "@/lib/i18n";
import { getAuthorProfile } from "@/lib/profile";
import { SiteHeader } from "@/components/site-header";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const account = await auth.getCurrentAccount();
  if (!account) redirect("/auth/login");

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];

  const profile = account.kind === "admin" ? await getAuthorProfile() : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        brandHref="/"
        brandLabel="Scribo"
        profile={{
          href: "/admin/profile",
          name: profile?.name || (account.kind === "user" ? account.user.displayName || account.user.username : undefined),
          avatar: profile?.avatar,
          role: account.kind === "admin" ? t.panelRoleSuperAdmin : undefined,
        }}
        right={
          account.kind === "admin" ? (
            <Link
              href="/admin/users"
              className="hidden items-center gap-1.5 text-xs text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline sm:inline-flex"
            >
              <UsersThree size={14} />
              {t.panelNavSuper}
            </Link>
          ) : null
        }
      />
      <main className="app-chrome mx-auto w-full max-w-5xl flex-1 px-4 pb-24 sm:px-6">{children}</main>
    </div>
  );
}