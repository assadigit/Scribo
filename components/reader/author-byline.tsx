import { UserCircle } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import { getOwnerByline } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { dictionaries } from "@/lib/i18n";

/**
 * "Written by [author name]" + circular avatar, shown at the top of a text
 * (reader home) and above each chapter. A registered writer's byline comes
 * from their `users` row; the super admin's texts (owner_id NULL) fall back
 * to the site-wide `settings` profile.
 */
export async function AuthorByline({
  dir,
  center = false,
  ownerId = null,
}: {
  dir: "rtl" | "ltr";
  center?: boolean;
  ownerId?: string | null;
}) {
  const profile = await getOwnerByline(ownerId);
  if (!profile.name) return null;

  const label = dictionaries[dir === "ltr" ? "en" : "fa"].readerWrittenBy;

  return (
    <div
      className={cn("mt-6 flex items-center gap-3", center && "justify-center text-center")}
      dir={dir}
    >
      {profile.avatar ? (
        <Image
          src={profile.avatar}
          alt={profile.name}
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-full border border-border-subtle object-cover"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-muted text-muted">
          <UserCircle size={24} />
        </span>
      )}
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-medium text-foreground">
          {profile.name}
          {profile.nickname && profile.nickname !== profile.name && (
            <span className="text-xs font-normal text-muted"> ({profile.nickname})</span>
          )}
        </p>
        {profile.bio && <p className="mt-1 text-xs leading-relaxed text-muted">{profile.bio}</p>}
      </div>
    </div>
  );
}