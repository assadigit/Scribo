import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";


export const dynamic = "force-dynamic";

export default async function NewTextPage() {
  const account = await auth.getCurrentAccount();
  if (!account) redirect("/auth/login");
  // The workspace's empty form IS the new-note flow — no separate page.
  redirect("/admin/texts");
}