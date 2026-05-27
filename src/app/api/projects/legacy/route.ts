import { NextRequest, NextResponse } from "next/server";
import { adminDb, verifyIdToken } from "@/lib/firebase-admin";
import { expandProjectToon } from "@/lib/toon-helpers";

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
    const snap = await db.collection("old_project_data").get();

    if (snap.empty) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
      });
    }

    const projects = snap.docs.map(doc => {
      const expanded = expandProjectToon(doc.data());
      return {
        projectNo: expanded.projectNo,
        customerName: expanded.customerName,
        address: expanded.address,
        phone: expanded.phone,
        email: expanded.email,
        solarPanelCapacity: expanded.solarCapacity,
        inverterBrand: expanded.inverterBrand,
        inverterModelNo: expanded.inverterModel,
        inverterCapacity: expanded.inverterCapacity,
        invSerialNo: expanded.inverterSN,
        latitude: expanded.latitude,
        longitude: expanded.longitude,
        wifiUsername: expanded.wifiUsername,
        wifiPassword: expanded.wifiPassword,
        nic: expanded.nic,
        remarks: expanded.remarks,
        projectInstallationDate: expanded.installDate,
        adbCash: expanded.adbCash,
        panelWattage: expanded.panelWattage || 0,
        noOfPanels: expanded.panelQty || 0,
        solarPanelModel: expanded.panelModel,
        panelType: expanded.panelType,
        utilityProvider: expanded.utility,
        uploadedAt: expanded.uploadedAt,
      };
    });

    return NextResponse.json(projects, {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    });
  } catch (error: any) {
    console.error("Failed to load legacy projects from Firestore:", error);
    return NextResponse.json(
      { error: "Failed to retrieve legacy projects data" },
      { status: 500 }
    );
  }
}
