import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";


export async function POST() {
  return auth.destroySession(NextResponse.json({ ok: true }));
}