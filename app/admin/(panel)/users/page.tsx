import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { UsersManager } from "@/components/admin/users-manager";
import { dictionaries, type Dictionary } from "@/lib/i18n";
import { toFa } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await auth.getCurrentAdmin();
  if (!admin) redirect("/auth/login");

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value === "en" ? "en" : "fa";
  const t: Dictionary = dictionaries[locale];
  const num = (n: number | string) => (locale === "fa" ? toFa(n) : String(n));

  const [writers, notes, pending, sessions] = await Promise.all([
    db().select({ value: sql<number>`COUNT(*)` }).from(schema.users).get(),
    db().select({ value: sql<number>`COUNT(*)` }).from(schema.texts).get(),
    db()
      .select({ value: sql<number>`COUNT(*)` })
      .from(schema.comments)
      .where(eq(schema.comments.status, "pending"))
      .get(),
    db().select({ value: sql<number>`COUNT(*)` }).from(schema.readSessions).get(),
  ]);

  const cards: Array<{ label: string; value: string }> = [
    { label: t.superStatWriters, value: num(writers?.value ?? 0) },
    { label: t.superStatNotes, value: num(notes?.value ?? 0) },
    { label: t.superStatPending, value: num(pending?.value ?? 0) },
    { label: t.superStatSessions, value: num(sessions?.value ?? 0) },
  ];

  return (
    <div className="flex flex-col gap-6 py-8">
      <header>
        <h1 className="font-serif text-2xl font-medium tracking-tight">{t.superTitle}</h1>
        <p className="mt-1 text-sm text-muted">{t.superSubtitle}</p>
      </header>

      {/* Admin capability cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t.dashReportAria}>
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex min-h-28 flex-col justify-between gap-3 rounded-xl border border-border-subtle bg-surface p-4"
          >
            <p className="text-xs text-muted">{card.label}</p>
            <p className="font-serif text-2xl font-medium tracking-tight">{card.value}</p>
          </div>
        ))}
      </section>

      <UsersManager />
    </div>
  );
}