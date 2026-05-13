// ─── /api/auth/myiot/route.ts ─────────────────────────────────────────────────
// POST { token: <myiot JWT> } → { customToken }
import { NextRequest, NextResponse } from "next/server";
import { createCustomTokenFromMyIot } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const customToken = await createCustomTokenFromMyIot(token);
  if (!customToken) return NextResponse.json({ error: "Invalid myiot token" }, { status: 401 });

  return NextResponse.json({ customToken });
}
