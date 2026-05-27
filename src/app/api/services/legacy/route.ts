import { NextRequest, NextResponse } from "next/server";
import { adminDb, verifyIdToken } from "@/lib/firebase-admin";
import { expandServiceToon } from "@/lib/toon-helpers";

export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  try {
    // Authentication check
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyIdToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = adminDb();
    const snap = await db.collection("old_service").get();

    if (snap.empty) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
      });
    }

    const services = snap.docs.map(doc => {
      const expanded = expandServiceToon(doc.data());

      // Convert services array to milestones format
      const milestones: Array<{ name: string; date: string; notes: string }> = [];

      if (expanded.services) {
        expanded.services.forEach(svc => {
          milestones.push({
            name: `${svc.round}${['st', 'nd', 'rd', 'th'][(svc.round % 10) - 1] || 'th'} Service`,
            date: svc.date || "---",
            notes: svc.remarks || "",
          });
        });
      }

      if (expanded.paidServices) {
        expanded.paidServices.forEach(paid => {
          milestones.push({
            name: `Paid Service ${paid.number}`,
            date: paid.date || "---",
            notes: paid.remarks || "",
          });
        });
      }

      return {
        projectNo: expanded.projectNo,
        customerName: "", // Not stored in TOON
        address: "", // Not stored in TOON
        contactNumber: "", // Not stored in TOON
        serviceYears: expanded.serviceYearsAgreement || "",
        serviceRounds: expanded.serviceRoundsAgreement || "",
        freeServiceDone: expanded.freeServiceDone || "",
        paymentUpdate: expanded.paymentUpdate || "",
        remarks: "", // Not stored in TOON
        breakdownNotes: expanded.breakdownNotes || "",
        milestones,
        fileName: "old_service",
      };
    });

    return NextResponse.json(services, {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    });
  } catch (error: any) {
    console.error("Failed to load legacy services from Firestore:", error);
    return NextResponse.json(
      { error: "Failed to retrieve legacy services history data" },
      { status: 500 }
    );
  }
}
