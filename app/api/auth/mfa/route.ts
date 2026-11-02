import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sha256Hex } from "@/lib/reader";
import { clientIp, checkLimit, clearLimit, recordFailure, LOCKOUT_STAGES } from "@/lib/rate-limit";
import { consumeMfaChallenge, getAdminMfa } from "@/lib/mfa";
import { verifyTOTP } from "@/lib/totp";
import { audit } from "@/lib/audit";

const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_MAX = 6;

/** Complete an admin login that has MFA enabled by presenting a 6-digit TOTP. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    challenge?: string;
    code?: string;
  } | null;
  const challenge = body?.challenge?.trim();
  const code = body?.code?.trim();

  if (!challenge || !code) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Brute-force guard for the second factor, keyed by the caller IP.
  const rateKey = `mfa_login_${await sha256Hex(clientIp(request))}`;
  const limit = await checkLimit({
    key: rateKey,
    max: RATE_MAX,
    windowMs: RATE_WINDOW_MS,
    lockout: LOCKOUT_STAGES,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  const recordFail = () =>
    recordFailure({
      key: rateKey,
      max: RATE_MAX,
      windowMs: RATE_WINDOW_MS,
      lockout: LOCKOUT_STAGES,
    });

  const adminId = await consumeMfaChallenge(challenge); // single-use
  if (!adminId) {
    await recordFail();
    return NextResponse.json({ error: "challenge_expired" }, { status: 401 });
  }

  const mfa = await getAdminMfa(adminId);
  if (!mfa?.enabled || !verifyTOTP(mfa.secret, code)) {
    await recordFail();
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  // Success → clear the rate counter and issue the session.
  await clearLimit(rateKey);
  await audit("auth.login_mfa", {
    actor: `admin:${adminId}`,
    request,
  });
  const session = await auth.createAdminSession(adminId);
  return auth.attachSessionCookie(NextResponse.json({ ok: true, role: "admin" }), session);
}