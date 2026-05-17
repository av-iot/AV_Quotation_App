import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
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

  return NextResponse.json({ ok: true });
}
