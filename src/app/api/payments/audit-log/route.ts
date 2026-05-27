import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    // CRITICAL: Verify authentication
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyIdToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: Check role - ONLY superadmin and payment_approver can view audit logs
    const userDoc = await adminDb().collection("users").doc(decoded.uid).get();
    const role = userDoc.data()?.role;

    if (!["superadmin", "payment_approver"].includes(role)) {
      console.error(`Unauthorized audit log access attempt by user ${decoded.uid} with role ${role}`);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const quotationId = searchParams.get("quotationId");

    if (!quotationId) {
      return NextResponse.json(
        { error: "Missing quotationId parameter" },
        { status: 400 }
      );
    }

    // Fetch quotation audit log
    const quotRef = adminDb().collection("quotations").doc(quotationId);
    const quotSnap = await quotRef.get();

    if (!quotSnap.exists) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    const auditLog = quotSnap.data()?.auditLog || [];

    return NextResponse.json({
      quotationId,
      auditLog,
    });
  } catch (error: any) {
    console.error("Audit log retrieval error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve audit log" },
      { status: 500 }
    );
  }
}
