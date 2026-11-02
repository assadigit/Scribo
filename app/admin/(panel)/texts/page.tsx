import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TextsWorkspace } from "@/components/admin/texts-workspace";


export const dynamic = "force-dynamic";

export default async function AdminNewTextPage() {
  const account = await auth.getCurrentAccount();
  if (!account) redirect("/auth/login");

  return (
    <TextsWorkspace
      isAdmin={account.kind === "admin"}
      myUserId={account.kind === "user" ? account.user.id : null}
    />
  );
}