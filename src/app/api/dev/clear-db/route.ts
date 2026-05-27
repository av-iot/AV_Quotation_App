import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";
import { logActivityServer } from "@/lib/audit-logger-server";

// Helper function to delete all documents in a collection in batches
async function deleteCollection(db: FirebaseFirestore.Firestore, collectionPath: string, batchSize: number = 100) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise<void>((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject);
  });
}

async function deleteQueryBatch(
  db: FirebaseFirestore.Firestore,
  query: FirebaseFirestore.Query,
  resolve: () => void,
  reject: (err: any) => void
) {
  try {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
      resolve();
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    // Recurse on the next batch
    process.nextTick(() => {
      deleteQueryBatch(db, query, resolve, reject);
    });
  } catch (err) {
    reject(err);
  }
}

export async function POST(req: NextRequest) {
  // 1. Strict environment guard
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden: This utility is only available in development environment." }, { status: 403 });
  }

  try {
    // 2. Authentication check
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyIdToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = adminDb();

    // 3. Authorization check (only superadmin or admin can clear database)
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    let role = userDoc.exists ? userDoc.data()?.role || "viewer" : "viewer";

    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",").map(e => e.trim()).filter(e => e);
    if (decoded.email && superAdminEmails.includes(decoded.email)) role = "superadmin";

    if (role !== "superadmin" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Target transactional collections
    const collectionsToClear = [
      "proposals",
      "quotations",
      "receipts",
      "projects",
      "services",
      "pdf_prints"
    ];

    // Clear each collection in batches
    for (const collection of collectionsToClear) {
      await deleteCollection(db, collection);
    }

    // 5. Reset sequence counters in system/counters
    const counterRef = db.collection("system").doc("counters");
    await counterRef.delete(); // Delete document to completely reset all counters to defaults

    // 6. Log activity to audit logs (which is preserved)
    await logActivityServer(
      decoded.uid,
      decoded.email || "",
      (decoded.displayName || decoded.name || "Dev User") as string,
      "DATABASE_CLEAR",
      {
        clearedCollections: collectionsToClear,
        countersReset: true
      },
      req
    );

    return NextResponse.json({
      success: true,
      message: "Database cleared successfully. Transactional collections removed and counters reset to defaults."
    });
  } catch (err: any) {
    console.error("Database clear error:", err);
    return NextResponse.json({ error: err.message || "Failed to clear database" }, { status: 500 });
  }
}
