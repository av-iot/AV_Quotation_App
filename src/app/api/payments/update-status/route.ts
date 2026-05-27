import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";
import { logActivityServer } from "@/lib/audit-logger-server";
import type { QuotationStatus } from "@/types";

const ALLOWED_STATUSES: QuotationStatus[] = [
  "pending_payment",
  "partial_payment",
  "fully_paid",
];

export async function POST(req: NextRequest) {
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

    // CRITICAL: Check role - ONLY superadmin and payment_approver
    const userDoc = await adminDb().collection("users").doc(decoded.uid).get();
    const role = userDoc.data()?.role;

    if (!["superadmin", "payment_approver"].includes(role)) {
      // Log the unauthorized attempt to the activity feed
      await logActivityServer(
        decoded.uid,
        decoded.email || "",
        (decoded.name || decoded.displayName || "") as string,
        "PAYMENT_UNAUTHORIZED_ATTEMPT",
        { role, attemptedAction: "update_payment_status" },
        req
      );
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse request body
    const { quotationId, paymentStatus, notes, paidDate } = await req.json();

    if (!quotationId || !paymentStatus) {
      return NextResponse.json(
        { error: "Missing quotationId or paymentStatus" },
        { status: 400 }
      );
    }

    // Validate payment status
    if (!ALLOWED_STATUSES.includes(paymentStatus)) {
      return NextResponse.json(
        { error: "Invalid payment status" },
        { status: 400 }
      );
    }

    // Update quotation in Firestore with audit trail
    const quotRef = adminDb().collection("quotations").doc(quotationId);
    const quotSnap = await quotRef.get();

    if (!quotSnap.exists) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    const quotData = quotSnap.data();

    // Log the change for audit trail
    const auditLog = {
      action: "payment_status_updated",
      timestamp: new Date().toISOString(),
      updatedBy: decoded.uid,
      updatedByEmail: decoded.email,
      previousStatus: quotData?.status,
      newStatus: paymentStatus,
      notes: notes || "",
    };

    await quotRef.update({
      status: paymentStatus,
      paidDate: paidDate || null,
      updatedAt: new Date().toISOString(),
      auditLog: quotData?.auditLog
        ? [...quotData.auditLog, auditLog]
        : [auditLog],
    });

    // Log to activity feed (visible in app activity log)
    await logActivityServer(
      decoded.uid,
      decoded.email || "",
      (decoded.name || decoded.displayName || "") as string,
      "PAYMENT_STATUS_UPDATED",
      {
        quotationId,
        qtnNo: quotData?.qtnNo || quotationId,
        customerName: quotData?.customer?.name || "",
        previousStatus: quotData?.status,
        newStatus: paymentStatus,
        paidDate: paidDate || null,
        notes: notes || "",
        approvedByRole: role,
      },
      req
    );

    return NextResponse.json({
      success: true,
      quotationId,
      newStatus: paymentStatus,
      auditLog,
    });
  } catch (error: any) {
    console.error("Payment status update error:", error);
    return NextResponse.json(
      { error: "Failed to update payment status" },
      { status: 500 }
    );
  }
}
