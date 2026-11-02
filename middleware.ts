import { NextRequest, NextResponse } from "next/server";

/**
 * Same-site CSRF guard for mutating API calls.
 *
 * Browsers attach an Origin header to POST/PUT/PATCH/DELETE requests (even
 * same-origin ones), so a mismatched Origin proves the request did not come
 * from one of our own pages. Keep this list in sync with `APP_URL` in
 * wrangler.toml — a new deployment domain must be added here too.
 *
 * Non-browser clients (curl, scripts, Workers) usually omit Origin and pass
 * through; they cannot be CSRFed because they carry no ambient credentials.
 *
 * NB: this stays as the legacy `middleware.ts` on purpose. Next 16's formal
 * `proxy.ts` convention only runs on the Node.js runtime, which
 * `@opennextjs/cloudflare` 1.20 does not support for proxy code — the legacy
 * middleware file still builds, deploys, and runs on the Edge runtime.
 */
const ALLOWED_ORIGINS = new Set([
  "https://scribo.ir",
  "https://www.scribo.ir",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method)) return NextResponse.next();
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();
  if (ALLOWED_ORIGINS.has(origin)) return NextResponse.next();
  return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
}

export const config = {
  matcher: ["/api/:path*"],
};
