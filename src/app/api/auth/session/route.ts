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

    // Get superadmin emails from env (no NEXT_PUBLIC_ prefix)
    const superAdminEmailsStr = process.env.SUPER_ADMIN_EMAILS || "";
    const superAdminEmails = superAdminEmailsStr.split(",").map((e) => e.trim()).filter((e) => e);
    const isSuperAdminEmail = superAdminEmails.includes(decoded.email || "");

    let userRole = "viewer";
    let isApproved = false; // New users are NOT approved by default
    const VALID_ROLES = ["superadmin", "admin", "authorized", "stakeholder", "viewer", "engineer", "site_engineer", "team_leader", "technician"];

    if (userSnap.exists) {
      const userData = userSnap.data() || {};
      userRole = userData.role || "viewer";
      isApproved = userData.approved !== false; // Existing users are approved by default (backward compat)
      if (!VALID_ROLES.includes(userRole)) {
        userRole = "viewer";
      }

      // Force superadmin role only on the server if designated superadmin email
      if (isSuperAdminEmail && userRole !== "superadmin") {
        userRole = "superadmin";
        isApproved = true; // Superadmins are auto-approved
        await userDocRef.set({ role: "superadmin", approved: true }, { merge: true });
      }
    } else {
      // New user — set up with viewer role and approved=false
      if (isSuperAdminEmail) {
        userRole = "superadmin";
        isApproved = true; // Superadmins are auto-approved
      }
      await userDocRef.set({
        uid: decoded.uid,
        email: decoded.email || "",
        displayName: decoded.name || decoded.displayName || null,
        photoURL: decoded.picture || null,
        source: "google",
        role: userRole,
        approved: isApproved,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }

    // Create a 5-day session cookie
    // Note: Firebase session cookies don't support custom claims, so we embed approval status in a custom token
    // But for the session cookie, we use the standard flow. The middleware will check Firestore for the approved field.
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn });

    (await cookies()).set("__session", sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    // Also set a cookie with approval status so middleware can check it without DB calls
    (await cookies()).set("__user_approved", String(isApproved), {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
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

    return NextResponse.json({ ok: true, role: userRole });
  } catch (err: any) {
    console.error("Session creation error:", err.message);
    // Don't leak internal error details
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
}

// DELETE — clear session cookie on sign out
export async function DELETE() {
  (await cookies()).delete("__session");
  return NextResponse.json({ ok: true });
}
