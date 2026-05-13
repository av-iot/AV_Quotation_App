import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb, adminStorage, adminAuth } from "@/lib/firebase-admin";


export async function POST(req: NextRequest) {
  // Try Authorization header first, then session cookie
  const authHeader = req.headers.get("authorization");
  const cookieHeader = req.cookies.get("__session")?.value;
  const token = authHeader?.replace("Bearer ", "") || cookieHeader;

  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let decoded;
  try {
    // Try as ID token first
    decoded = await verifyIdToken(token);
    // If that fails, try as session cookie
    if (!decoded) {
      decoded = await adminAuth().verifySessionCookie(token, true);
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })};
