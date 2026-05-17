import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logActivityServer } from "@/lib/audit-logger-server";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Create a 5-day dev session cookie
  const expiresIn = 60 * 60 * 24 * 5;
  (await cookies()).set("__session", "dev_session_token", {
    maxAge: expiresIn,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  // Log dev login activity
  await logActivityServer(
    "dev_user",
    "dev@altavision.lk",
    "Dev User",
    "LOGIN",
    {
      authProvider: "dev_bypass",
    },
    req
  );

  return NextResponse.json({ ok: true });
}

