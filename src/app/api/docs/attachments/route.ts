import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(req: NextRequest) {
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
