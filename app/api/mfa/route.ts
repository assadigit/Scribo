import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { clearAdminMfa, getAdminMfa, saveAdminMfa } from "@/lib/mfa";
import { generateTOTPSecret, otpauthUrl, verifyTOTP } from "@/lib/totp";

async function currentAdminId(): Promise<string | null> {
  const admin = await auth.getCurrentAdmin();
  return admin?.id ?? null;
}

/** Begin setup: generate a secret (not yet enabled) and hand over the otpauth URI. */
export async function POST() {
  const adminId = await currentAdminId();
  if (!adminId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const secret = generateTOTPSecret();
  await saveAdminMfa(adminId, { secret, enabled: false });
  return NextResponse.json({ otpauthUrl: otpauthUrl(secret, "admin"), secret });
}

/** Confirm the TOTP code and enable MFA for the current admin. */
export async function PUT(request: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim();
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const mfa = await getAdminMfa(adminId);
  // Must have a pending secret and the presented code must match before we
  // flip the flag — proves the authenticator was actually configured.
  if (!mfa || mfa.enabled || !verifyTOTP(mfa.secret, code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  await saveAdminMfa(adminId, { secret: mfa.secret, enabled: true });
  return NextResponse.json({ ok: true });
}

/** Disable MFA — requires the current TOTP code as proof of possession. */
export async function DELETE(request: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim();
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const mfa = await getAdminMfa(adminId);
  if (!mfa?.enabled || !verifyTOTP(mfa.secret, code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  await clearAdminMfa(adminId);
  return NextResponse.json({ ok: true });
}