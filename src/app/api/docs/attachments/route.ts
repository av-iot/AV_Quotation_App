import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";

async function checkAuth(req: NextRequest, requiredRole?: string) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return { error: "Unauthorized", status: 401, decoded: null };
  }

  const decoded = await verifyIdToken(token);
  if (!decoded) {
    return { error: "Unauthorized", status: 401, decoded: null };
  }

  if (requiredRole) {
    const userDoc = await adminDb().collection("users").doc(decoded.uid).get();
    const role = userDoc.data()?.role;
    if (!["superadmin", "admin", "authorized"].includes(role)) {
      return { error: "Forbidden", status: 403, decoded };
    }
  }

  return { error: null, status: 200, decoded };
}

export async function GET(req: NextRequest) {
  // Auth check for read access
  const authCheck = await checkAuth(req);
  if (authCheck.error) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  const { searchParams } = new URL(req.url);
  const file = searchParams.get("file");
  const docsDir = path.join(process.cwd(), "src", "app", "api", "docs");

  try {
    if (file) {
      // Validate filename to prevent directory traversal
      const safeFile = path.basename(file);
      if (!safeFile.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
      }
      const filePath = path.join(docsDir, safeFile);
      const buffer = await fs.readFile(filePath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${encodeURIComponent(safeFile)}"`,
        },
      });
    }

    // List all PDF files
    const files = await fs.readdir(docsDir);
    const pdfs = files.filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
    return NextResponse.json({ pdfs });
  } catch (error: any) {
    console.error("Error in attachments API:", error);
    return NextResponse.json({ pdfs: [], error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Auth check for write access - requires superadmin/admin
  const authCheck = await checkAuth(req, "admin");
  if (authCheck.error) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const name = file.name;
    if (!name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const docsDir = path.join(process.cwd(), "src", "app", "api", "docs");
    const filePath = path.join(docsDir, name);

    await fs.writeFile(filePath, buffer);
    return NextResponse.json({ success: true, fileName: name });
  } catch (error: any) {
    console.error("Failed to upload file:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // Auth check for delete access - requires superadmin/admin
  const authCheck = await checkAuth(req, "admin");
  if (authCheck.error) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get("file");
    if (!fileName) {
      return NextResponse.json({ error: "No file specified" }, { status: 400 });
    }

    const safeFile = path.basename(fileName);
    if (!safeFile.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    const docsDir = path.join(process.cwd(), "src", "app", "api", "docs");
    const filePath = path.join(docsDir, safeFile);

    await fs.unlink(filePath);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete file:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
