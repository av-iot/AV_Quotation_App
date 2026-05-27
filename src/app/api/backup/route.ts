import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";

async function authenticateSuperadmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) return { error: "Unauthorized", status: 401 };

  const decoded = await verifyIdToken(token);
  if (!decoded) return { error: "Unauthorized", status: 401 };

  const db = adminDb();
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  let role = userDoc.exists ? userDoc.data()?.role || "viewer" : "viewer";

  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",").map(e => e.trim()).filter(e => e);
  if (decoded.email && superAdminEmails.includes(decoded.email)) role = "superadmin";

  if (role !== "superadmin") {
    return { error: "Forbidden", status: 403 };
  }

  return { db, decoded };
}

// GET: Download TOON legacy data backup
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { db } = auth;

    // Export TOON legacy data
    const projectSnap = await db.collection("old_project_data").get();
    const serviceSnap = await db.collection("old_service").get();

    const projects: Record<string, any>[] = [];
    const services: Record<string, any>[] = [];

    projectSnap.docs.forEach(doc => {
      projects.push({
        pn: doc.id,
        ...doc.data(),
      });
    });

    serviceSnap.docs.forEach(doc => {
      services.push({
        pn: doc.id,
        ...doc.data(),
      });
    });

    const backup = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      type: "TOON_LEGACY_BACKUP",
      collections: {
        old_project_data: {
          count: projects.length,
          data: projects,
        },
        old_service: {
          count: services.length,
          data: services,
        },
      },
    };

    return NextResponse.json(backup, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="toon-backup-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error: any) {
    console.error("Backup API error:", error);
    return NextResponse.json({ error: error.message || "Failed to create backup" }, { status: 500 });
  }
}

// POST: Restore TOON legacy data from backup
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { db } = auth;
    const body = await req.json();

    if (!body.collections?.old_project_data || !body.collections?.old_service) {
      return NextResponse.json(
        { error: "Invalid backup format: missing collections" },
        { status: 400 }
      );
    }

    const batch = db.batch();
    let projectsRestored = 0;
    let servicesRestored = 0;

    // Restore projects
    for (const proj of body.collections.old_project_data.data || []) {
      const pn = proj.pn;
      if (!pn) continue;

      const { pn: _, ...data } = proj;
      const docRef = db.collection("old_project_data").doc(pn);
      batch.set(docRef, data, { merge: true });
      projectsRestored++;
    }

    // Restore services
    for (const svc of body.collections.old_service.data || []) {
      const pn = svc.pn;
      if (!pn) continue;

      const { pn: _, ...data } = svc;
      const docRef = db.collection("old_service").doc(pn);
      batch.set(docRef, data, { merge: true });
      servicesRestored++;
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Restored ${projectsRestored} projects and ${servicesRestored} services`,
      projectsRestored,
      servicesRestored,
    });
  } catch (error: any) {
    console.error("Restore API error:", error);
    return NextResponse.json({ error: error.message || "Failed to restore backup" }, { status: 500 });
  }
}
