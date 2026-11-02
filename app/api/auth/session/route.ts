import { NextResponse } from "next/server";
import { getSiteHeaderProps } from "@/lib/site-props";

/**
 * Public auth state for the landing/About/Contact header and CTAs. The pages
 * themselves are statically rendered, so the signed-in/out decision moves to
 * the client: this endpoint mirrors getSiteHeaderProps(). Only the session
 * owner ever sees their own profile — anonymous visitors get showAuth: true.
 */
export async function GET() {
  const state = await getSiteHeaderProps();
  return NextResponse.json(state);
}