import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb, adminStorage, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logActivityServer } from "@/lib/audit-logger-server";
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  Packer
} from "docx";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const { id } = params;

  // Try Authorization header first, then session cookie
  const authHeader = req.headers.get("authorization");
  const cookieHeader = req.cookies.get("__session")?.value;
  const token = authHeader?.replace("Bearer ", "") || cookieHeader;

  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let decoded;
  try {
    // Try as ID token first
    decoded = await verifyIdToken(token);
    // If that fails, try as session cookie
    if (!decoded) {
      decoded = await adminAuth().verifySessionCookie(token, true);
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = adminDb();
    const docRef = db.collection("proposals").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    const proposal = docSnap.data();
    if (!proposal) {
      return NextResponse.json({ error: "Empty proposal data" }, { status: 400 });
    }

    // Build DOCX using the "docx" package
    const children: any[] = [];

    // Header Title
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "ALTA VISION SOLAR PV SYSTEM QUOTATION",
            bold: true,
            size: 32, // 16pt
            color: "1e3a8a",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Document Meta
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Proposal Ref: `, bold: true }),
          new TextRun({ text: `${proposal.propNo || proposal.qtnNo}` }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Date: `, bold: true }),
          new TextRun({ text: `${proposal.date}` }),
        ],
        spacing: { after: 300 },
      })
    );

    // Customer section
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "CUSTOMER DETAILS",
            bold: true,
            size: 24,
            color: "0f172a",
          }),
        ],
        spacing: { after: 120 },
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Name: ", bold: true }),
          new TextRun({ text: proposal.customer.name }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Address: ", bold: true }),
          new TextRun({ text: proposal.customer.address }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Contact: ", bold: true }),
          new TextRun({
            text: `${proposal.customer.phone} ${
              proposal.customer.phone2 ? `/ ${proposal.customer.phone2}` : ""
            }`,
          }),
        ],
      })
    );
    if (proposal.customer.email) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Email: ", bold: true }),
            new TextRun({ text: proposal.customer.email }),
          ],
          spacing: { after: 300 },
        })
      );
    } else {
      children.push(new Paragraph({ text: "", spacing: { after: 300 } }));
    }

    // System Specifications
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "SYSTEM SPECIFICATIONS",
            bold: true,
            size: 24,
            color: "0f172a",
          }),
        ],
        spacing: { before: 200, after: 120 },
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "System Type: ", bold: true }),
          new TextRun({ text: proposal.sysType.toUpperCase() }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Utility Provider & Phase: ", bold: true }),
          new TextRun({ text: `${proposal.utility} / ${proposal.phase} Phase` }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Power Scheme: ", bold: true }),
          new TextRun({ text: proposal.powerScheme }),
        ],
      })
    );
    if (proposal.roofType) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Roof Type: ", bold: true }),
            new TextRun({ text: proposal.roofType }),
          ],
        })
      );
    }
    if (proposal.mountType) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Mounting Type: ", bold: true }),
            new TextRun({ text: proposal.mountType.toUpperCase() }),
          ],
          spacing: { after: 300 },
        })
      );
    } else {
      children.push(new Paragraph({ text: "", spacing: { after: 300 } }));
    }

    // Proposed Options
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "PROPOSED OPTIONS",
            bold: true,
            size: 24,
            color: "0f172a",
          }),
        ],
        spacing: { before: 200, after: 120 },
      })
    );

    proposal.options.forEach((opt: any, idx: number) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: opt.label || `Option ${idx + 1}`,
              bold: true,
              size: 28,
              color: "1e3a8a",
            }),
          ],
          spacing: { before: 300, after: 120 },
        })
      );

      // Panel details
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "• Solar Panels: ", bold: true }),
            new TextRun({
              text: `${opt.panel.qty}x ${opt.panel.brand} ${opt.panel.model} (${opt.panel.ratingLabel}) — ${opt.panel.warranty} warranty`,
            }),
          ],
        })
      );

      // Inverter details
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "• Inverter: ", bold: true }),
            new TextRun({
              text: `${opt.inverter.qty}x ${opt.inverter.brand} ${opt.inverter.model} (${opt.inverter.ratingLabel}) — ${opt.inverter.warranty} warranty`,
            }),
          ],
        })
      );

      // Battery details (optional)
      if (opt.battery) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "• Battery storage: ", bold: true }),
              new TextRun({
                text: `${opt.battery.qty}x ${opt.battery.brand} ${opt.battery.model} (${opt.battery.ratingLabel}) — ${opt.battery.warranty} warranty`,
              }),
            ],
          })
        );
      }

      // Pricing
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Total Investment: ", bold: true }),
            new TextRun({
              text: `Rs. ${opt.pricing.totalPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}`,
              bold: true,
              size: 24,
              color: "10b981",
            }),
          ],
          spacing: { before: 100, after: 200 },
        })
      );
    });

    // Payment Terms
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "PAYMENT SCHEDULE",
            bold: true,
            size: 24,
            color: "0f172a",
          }),
        ],
        spacing: { before: 400, after: 120 },
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "1. Advance Payment: ", bold: true }),
          new TextRun({ text: `${proposal.pay1}% on signing/confirmation` }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "2. Delivery & Installation: ", bold: true }),
          new TextRun({ text: `${proposal.pay2}% on hardware delivery` }),
        ],
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "3. Commissioning: ", bold: true }),
          new TextRun({ text: `${proposal.pay3}% on commissioning/handover` }),
        ],
        spacing: { after: 400 },
      })
    );

    // Closing Statement
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "This proposal is system-generated and valid for 14 days. Thank you for choosing Alta Vision.",
            italics: true,
            size: 18,
            color: "64748b",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 100 },
      })
    );

    // Build the document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: children,
        },
      ],
    });

    const docxBuffer = await Packer.toBuffer(doc);

    // Upload to Firebase Storage
    const bucket = adminStorage().bucket();
    const filePath = `proposals/${id}.docx`;
    const storageFile = bucket.file(filePath);

    await storageFile.save(docxBuffer, {
      metadata: {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });

    // Generate reliable public download URL
    const docxUrl = `https://firebasestorage.googleapis.com/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(filePath)}?alt=media`;

    // Update proposal docxUrl in Firestore
    await docRef.update({
      docxUrl,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log background DOCX generation activity
    await logActivityServer(
      decoded.uid,
      decoded.email || "",
      (decoded.name || decoded.displayName || "") as string,
      "DOCX_GENERATE",
      {
        proposalId: id,
        qtnNo: proposal.qtnNo,
        propNo: proposal.propNo || "",
        customerName: proposal.customer.name,
        docxUrl,
      },
      req
    );

    return NextResponse.json({ ok: true, docxUrl });
  } catch (err: any) {
    console.error("DOCX generation error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
