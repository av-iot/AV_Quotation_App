import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { buildProposalFromForm } from "@/lib/proposal-builder";
import type { ProposalFormData } from "@/types";

// ─── GET /api/proposals ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyIdToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = adminDb();
  const snap = await db
    .collection("proposals")
    .where("createdBy", "==", decoded.uid)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const proposals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ data: proposals });
}

// ─── POST /api/proposals ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyIdToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body: ProposalFormData & { status: string } = await req.json();

  // Build structured proposal from form data
  const proposal = buildProposalFromForm(body, decoded.uid);

  const db = adminDb();
  const ref = await db.collection("proposals").add({
    ...proposal,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Fire-and-forget: generate docx in background
  if (body.status === "sent") {
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/proposals/${ref.id}/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(console.error);
  }

  return NextResponse.json({ data: { id: ref.id, qtnNo: proposal.qtnNo } });
}
