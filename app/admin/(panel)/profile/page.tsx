import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { getAuthorProfile, getProtectContentDefault } from "@/lib/profile";
import { getAdminMfa } from "@/lib/mfa";
import { getCustomFont } from "@/lib/fonts";
import { ProfileEditor } from "@/components/admin/profile-editor";
import { MyInvites } from "@/components/admin/my-invites";
import { MfaManager } from "@/components/admin/mfa-manager";
import { FontUploader } from "@/components/admin/font-uploader";
import { dictionaries, type Dictionary } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function AdminProfilePage() {
  const account = await auth.getCurrentAccount();
  if (!account) redirect("/auth/login");

  // Super admin's profile lives in the site-wide `settings`; a registered
  // writer's profile lives on their `users` row — both share the same shape.
  const profile =
    account.kind === "admin"
      ? await getAuthorProfile()
      : {
          name: account.user.displayName,
          nickname: account.user.nickname,
          bio: account.user.bio,
          avatar: account.user.avatar,
        };

  // Default copy/print protection for newly created share links (profile-level).
  const protectContentDefault = await getProtectContentDefault(account);

  // For registered writers: when they joined, and who invited them. The
  // admin was here first, so they get no "invited by" line.
  let membership: { joinedAt: number; invitedByName: string | null } | null = null;
  if (account.kind === "user") {
    const invite = await db()
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.usedBy, account.user.id))
      .get();

    let invitedByName: string | null = null;
    if (invite) {
      if (invite.createdBy) {
        const admin = await db()
          .select()
          .from(schema.admins)
          .where(eq(schema.admins.id, invite.createdBy))
          .get();
        if (admin) invitedByName = admin.username;
      } else if (invite.createdByUserId) {
        const creator = await db()
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, invite.createdByUserId))
          .get();
        if (creator) invitedByName = creator.displayName || creator.username;
      }
    }
    membership = { joinedAt: account.user.createdAt, invitedByName };
  }

  // Admin-only extras folded into the profile: login security + site font.
  const mfa =
    account.kind === "admin" ? await getAdminMfa(account.admin.id) : null;
  const font = account.kind === "admin" ? await getCustomFont() : null;

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];

  return (
    <div className="flex flex-col gap-6 py-8">
      <header>
        <h1 className="font-serif text-2xl font-medium tracking-tight">{t.profileTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.profileSubtitle}
        </p>
      </header>

      <ProfileEditor initial={profile} protectContentDefault={protectContentDefault} />

      {account.kind === "user" && membership && (
        <section className="flex max-w-xl flex-col gap-2 rounded-xl border border-border-subtle p-5 text-sm">
          <h2 className="font-medium">{t.profileAccountSection}</h2>
          <p className="text-muted">
            {t.profileMembershipDate} <span dir="ltr" className="text-foreground">{formatDateTime(membership.joinedAt)}</span>
          </p>
          <p className="text-muted">
            {membership.invitedByName ? (
              <>
                {t.profileInvitedBy}{" "}
                <span className="font-medium text-foreground">{membership.invitedByName}</span>
              </>
            ) : (
              t.profileInvitedBySystemAdmin
            )}
          </p>
        </section>
      )}

      {account.kind === "user" && <MyInvites />}

      {/* Security (two-factor) — admin */}
      {account.kind === "admin" && (
        <section className="flex max-w-xl flex-col gap-4 rounded-xl border border-border-subtle p-5">
          <div>
            <h2 className="font-medium">{t.mfaPageTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.mfaPageSubtitle}</p>
          </div>
          <MfaManager enabled={mfa?.enabled ?? false} />
          <p className="text-sm leading-7 text-muted">
            <span className="font-medium text-foreground">{t.mfaPageHelpTitle} </span>
            {t.mfaPageHelpBody}
          </p>
        </section>
      )}

      {/* Fonts (site-wide) */}
      {account.kind === "admin" && (
        <section className="flex max-w-xl flex-col gap-4 rounded-xl border border-border-subtle p-5">
          <div>
            <h2 className="font-medium">{t.fontsTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.fontsSubtitle}</p>
          </div>
          <FontUploader current={font ? { family: font.family, format: font.format } : null} />
          <p className="text-sm leading-7 text-muted">
            <span className="font-medium text-foreground">{t.fontsHelpTitle} </span>
            {t.fontsFormatsHelp} {t.fontsRemovalNote}
          </p>
        </section>
      )}
    </div>
  );
}