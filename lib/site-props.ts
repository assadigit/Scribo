import { auth } from "@/lib/auth";
import { getAuthorProfile } from "@/lib/profile";

/**
 * Header state for public pages (landing, About, Contact): anonymous visitors
 * get the Login/Sign-up button, signed-in visitors get the avatar dropdown
 * with a profile. Mirrors what the reader and admin layouts fetch themselves.
 */
export async function getSiteHeaderProps() {
  const account = await auth.getCurrentAccount();
  if (!account) return { showAuth: true, profile: null };

  const author = account.kind === "admin" ? await getAuthorProfile() : null;
  return {
    showAuth: false,
    profile: {
      href: "/admin",
      name:
        author?.name ||
        (account.kind === "user" ? account.user.displayName || account.user.username : undefined),
      avatar: author?.avatar || (account.kind === "user" ? account.user.avatar : undefined),
    },
  };
}
