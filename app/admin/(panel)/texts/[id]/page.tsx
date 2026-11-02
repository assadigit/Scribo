import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";
import { auth } from "@/lib/auth";
import { TextsWorkspace } from "@/components/admin/texts-workspace";


export const dynamic = "force-dynamic";

export default async function AdminTextEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await auth.getCurrentAccount();
  if (!account) redirect("/auth/login");

  const text = await db().select().from(schema.texts).where(eq(schema.texts.id, id)).get();
  if (!text) notFound();

  return (
    <TextsWorkspace
      initialSelectedId={id}
      isAdmin={account.kind === "admin"}
      myUserId={account.kind === "user" ? account.user.id : null}
    />
  );
}