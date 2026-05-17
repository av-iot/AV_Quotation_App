import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";

/**
 * Log an audit activity on the server.
 */
export async function logActivityServer(
  userId: string,
  userEmail: string,
  userName: string,
  action: string,
  details: Record<string, any>,
  req?: NextRequest
) {
  try {
    const db = adminDb();
    
    let ip = "";
    let userAgent = "";
    if (req) {
      ip = req.headers.get("x-forwarded-for") || req.ip || "";
      userAgent = req.headers.get("user-agent") || "";
    }

    await db.collection("audit_logs").add({
      userId,
      userEmail: userEmail || "",
      userName: userName || "",
      action,
      details: {
        ...details,
        ip,
        userAgent,
      },
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to write server audit log:", err);
  }
}
