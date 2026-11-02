import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAuthorProfile, getProtectContentDefault, saveAuthorProfile, saveProtectContentDefault } from "@/lib/profile";
import * as schema from "@/db/schema";

const MAX_NAME = 80;
const MAX_NICKNAME = 40;
const MAX_BIO = 300;
const MAX_AVATAR_CHARS = 600_000;

/**
 * Author profile of the current account. The super admin's profile is the
 * site-wide one stored in the `settings` table ("written by …" on reader
 * pages); a registered writer's profile lives on their `users` row.
 */
export async function GET() {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (account.kind === "admin") {
    const profile = await getAuthorProfile();
    return NextResponse.json({
      ...profile,
      protectContentDefault: await getProtectContentDefault(account),
    });
  }

  const user = account.user;
  return NextResponse.json({
    name: user.displayName,
    nickname: user.nickname,
    bio: user.bio,
    avatar: user.avatar,
    protectContentDefault: await getProtectContentDefault(account),
  });
}

async function updateProfile(request: Request) {
  const account = await auth.getCurrentAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { name, nickname, bio, avatar, protectContentDefault } = (body ?? {}) as {
    name?: unknown;
    nickname?: unknown;
    bio?: unknown;
    avatar?: unknown;
    protectContentDefault?: unknown;
  };

  if (typeof name !== "string" || name.trim().length > MAX_NAME) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (typeof nickname !== "string" || nickname.trim().length > MAX_NICKNAME) {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }
  if (typeof bio !== "string" || bio.trim().length > MAX_BIO) {
    return NextResponse.json({ error: "invalid_bio" }, { status: 400 });
  }
  if (typeof avatar !== "string" || avatar.length > MAX_AVATAR_CHARS) {
    return NextResponse.json({ error: "invalid_avatar" }, { status: 400 });
  }

  // The avatar is a base64 data URL; anything else is rejected (XSS-safe).
  const trimmedAvatar = avatar.trim();
  if (trimmedAvatar && !trimmedAvatar.startsWith("data:image/")) {
    return NextResponse.json({ error: "invalid_avatar" }, { status: 400 });
  }
  if (protectContentDefault !== undefined && typeof protectContentDefault !== "boolean") {
    return NextResponse.json({ error: "invalid_protect_content_default" }, { status: 400 });
  }

  if (account.kind === "admin") {
    await saveAuthorProfile({
      name: name.trim(),
      nickname: nickname.trim() || null,
      bio: bio.trim() || null,
      avatar: trimmedAvatar || null,
    });
  } else {
    await db()
      .update(schema.users)
      .set({
        displayName: name.trim(),
        nickname: nickname.trim() || null,
        bio: bio.trim() || null,
        avatar: trimmedAvatar || null,
      })
      .where(eq(schema.users.id, account.user.id));
  }

  if (protectContentDefault !== undefined) {
    await saveProtectContentDefault(account, protectContentDefault);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  return updateProfile(request);
}

/** Kept for the existing admin profile editor, which sends PUT. */
export async function PUT(request: Request) {
  return updateProfile(request);
}
