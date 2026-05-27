import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";

// Collections to DELETE (transactional data)
const COLLECTIONS_TO_DELETE = [
  "proposals",
  "quotations",
  "receipts",
  "projects",
  "services",
  "service_plans",
  "servicePlans",
  "service_checklists",
  "serviceChecklistData",
  "print",
  "sequences",
];

// Collections to PRESERVE (user & system data + legacy TOON tables)
const COLLECTIONS_TO_PRESERVE = [
  "users",
  "activity",
  "products",
  "settings",
  "company_info",
  "bank_info",
  "old_project_data",    // Legacy TOON projects — DO NOT DELETE
  "old_service",         // Legacy TOON services — DO NOT DELETE
];

export async function POST(req: NextRequest) {
  try {
    // ── Authentication ──────────────────────────────────────────────────────
    const token = req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized: Missing token" }, { status: 401 });
    }

    const decoded = await verifyIdToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Authorization ──────────────────────────────────────────────────────
    const db = adminDb();
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    let role = userDoc.exists ? userDoc.data()?.role || "viewer" : "viewer";

    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",").map(e => e.trim()).filter(e => e);
    if (decoded.email && superAdminEmails.includes(decoded.email)) role = "superadmin";

    if (role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Confirmation Header ─────────────────────────────────────────────────
    const confirmHeader = req.headers.get("x-confirm-cleanup");
    if (confirmHeader !== "true") {
      return NextResponse.json(
        { error: "Confirmation required: add header x-confirm-cleanup: true" },
        { status: 400 }
      );
    }

    // ── Delete Collections ──────────────────────────────────────────────────
    const deletedCollections: Record<string, number> = {};

    for (const collName of COLLECTIONS_TO_DELETE) {
      try {
        const snapshot = await db.collection(collName).get();

        if (snapshot.empty) {
          deletedCollections[collName] = 0;
          continue;
        }

        // Delete in batches of 100
        let deleted = 0;
        const docs = snapshot.docs;

        for (let i = 0; i < docs.length; i += 100) {
          const batch = db.batch();
          const batchDocs = docs.slice(i, i + 100);

          batchDocs.forEach(doc => {
            batch.delete(doc.ref);
            deleted++;
          });

          await batch.commit();
        }

        deletedCollections[collName] = deleted;
      } catch (err: any) {
        // Collection might not exist, which is fine
        deletedCollections[collName] = 0;
      }
    }

    // ── Reset Sequence Counters ─────────────────────────────────────────────
    let sequenceReset = false;
    try {
      const seqRef = db.collection("sequences").doc("counters");
      await seqRef.set({
        qtnNo: 50000,
        srvNo: 50000,
        invNo: 50000,
        propNo: 50000,
        recNo: 50000,
        resetAt: new Date().toISOString(),
      });
      sequenceReset = true;
    } catch (err) {
      console.warn("Could not reset sequences:", err);
    }

    return NextResponse.json({
      success: true,
      message: "Database cleanup completed. Transactional data deleted.",
      deletedCollections,
      sequenceReset,
      preserved: COLLECTIONS_TO_PRESERVE,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Cleanup API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cleanup database" },
      { status: 500 }
    );
  }
}
