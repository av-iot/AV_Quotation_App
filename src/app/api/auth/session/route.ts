import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import { logActivityServer } from "@/lib/audit-logger-server";

// POST — set session cookie after successful Firebase login
export async function POST(req: NextRequest) {
  const { idToken } = await req.json();
  if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    // Verify and decode
    const decoded = await adminAuth().verifyIdToken(idToken);

    // Secure server-side user check & initialization to prevent privilege escalation
    const userDocRef = adminDb().collection("users").doc(decoded.uid);
    const userSnap = await userDocRef.get();

    const isSuperAdminEmail =
      decoded.email === "admin@altavision.lk" ||
      decoded.email === "dev@altavision.lk" ||
      decoded.email === "devopsaltavision@gmail.com" ||
      decoded.email === process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;

    let userRole = "viewer";
    const VALID_ROLES = ["superadmin", "admin", "authorized", "stakeholder", "viewer", "engineer"];

    if (userSnap.exists) {
      const userData = userSnap.data() || {};
      userRole = userData.role || "viewer";
      if (!VALID_ROLES.includes(userRole)) {
        userRole = "viewer";
      }

      // Force superadmin role only on the server if designated superadmin email
      if (isSuperAdminEmail && userRole !== "superadmin") {
        userRole = "superadmin";
        await userDocRef.set({ role: "superadmin" }, { merge: true });
      }
    } else {
      userRole = isSuperAdminEmail ? "superadmin" : "viewer";
      await userDocRef.set({
        uid: decoded.uid,
        email: decoded.email || "",
        displayName: decoded.name || decoded.displayName || null,
        photoURL: decoded.picture || null,
        source: "google",
        role: userRole,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }

    // Create a 5-day session cookie
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn });

    (await cookies()).set("__session", sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    // Log login activity
    await logActivityServer(
      decoded.uid,
      decoded.email || "",
      (decoded.name || decoded.displayName || "") as string,
      "LOGIN",
      {
        authProvider: decoded.firebase?.sign_in_provider || "google",
      },
      req
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Session creation error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

// DELETE — clear session cookie on sign out
export async function DELETE() {
  (await cookies()).delete("__session");
  return NextResponse.json({ ok: true });
}
