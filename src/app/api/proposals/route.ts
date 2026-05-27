import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { buildProposalFromForm } from "@/lib/proposal-builder";
import type { ProposalFormData } from "@/types";
import { logActivityServer } from "@/lib/audit-logger-server";

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
  console.log("POST /api/proposals called");
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyIdToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body: ProposalFormData & { status: string } = await req.json();
  console.log("POST body:", JSON.stringify(body, null, 2));
  const db = adminDb();

  // Fetch all active products to look up details
  const prodSnap = await db.collection("products").where("active", "==", true).get();
  const productsMap = new Map<string, any>();
  prodSnap.docs.forEach((d) => productsMap.set(d.id, d.data()));

  // Generate sequential numbers starting from 50000
  const counterRef = db.collection("system").doc("counters");
  const { qtnNo, propNo } = await db.runTransaction(async (t) => {
    const docSnap = await t.get(counterRef);
    let seq = 50000;
    if (docSnap.exists && docSnap.data()?.proposalSeq) {
      seq = docSnap.data()?.proposalSeq;
    }
    seq += 1;
    t.set(counterRef, { proposalSeq: seq }, { merge: true });
    
    const seqStr = String(seq); // no zero-padding — sequence starts at 50000+
    return {
      qtnNo: `P_Inv_${seqStr}`,
      propNo: `Prop_${seqStr}`
    };
  });

  // Build structured proposal from form data
  const proposal = buildProposalFromForm(body, decoded.uid, productsMap);
  
  // Override form-provided qtnNo with our generated sequence
  proposal.qtnNo = qtnNo;
  proposal.propNo = propNo;

  const ref = await db.collection("proposals").add({
    ...proposal,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Log proposal creation
  await logActivityServer(
    decoded.uid,
    decoded.email || "",
    (decoded.name || decoded.displayName || "") as string,
    "PROPOSAL_CREATE",
    {
      proposalId: ref.id,
      qtnNo: proposal.qtnNo,
      propNo: proposal.propNo || "",
      customerName: proposal.customer.name,
      sysType: proposal.sysType,
      status: body.status,
    },
    req
  );



  return NextResponse.json({ data: { id: ref.id, qtnNo: proposal.qtnNo } });
}
