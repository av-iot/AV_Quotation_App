import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { AppUser } from "@/types";

/**
 * Log an audit activity on the client.
 * Supports offline persistence so writes will auto-sync when online.
 */
export async function logActivityClient(
  user: AppUser | null,
  action: string,
  details: Record<string, any>
) {
  try {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    
    await addDoc(collection(db, "audit_logs"), {
      userId: user?.uid || "dev_user",
      userEmail: user?.email || "dev@altavision.lk",
      userName: user?.displayName || "Dev User",
      action,
      details: {
        ...details,
        userAgent,
      },
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to write client audit log:", err);
  }
}
