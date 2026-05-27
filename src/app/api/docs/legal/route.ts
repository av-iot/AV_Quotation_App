import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { verifyIdToken } from "@/lib/firebase-admin";

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

    const docsDir = path.join(process.cwd(), "docs", "legal");
    const docsDirExists = await fs.access(docsDir).then(() => true).catch(() => false);

    if (!docsDirExists) {
      // Create the directory and a sample file if it doesn't exist
      await fs.mkdir(docsDir, { recursive: true });
      await fs.writeFile(
        path.join(docsDir, "01_TermsAndConditions.md"),
        `# General Terms and Conditions\n\n1. **Acceptance of Proposal**: By signing this document, the customer agrees to the system specifications and pricing.\n2. **Validity**: This proposal is valid for 14 days from the date of issue.\n3. **Installation**: Alta Vision Ltd will ensure all installations are carried out by certified engineers.\n4. **Warranty**: Hardware warranties are strictly governed by the original equipment manufacturer (OEM) policies.`
      );
    }

    const files = (await fs.readdir(docsDir))
      .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      .sort();

    const documents = await Promise.all(files.map(async filename => {
      const content = await fs.readFile(path.join(docsDir, filename), "utf-8");
      return {
        filename,
        title: filename.replace(/^\d+_/, '').replace(/\.(md|txt)$/, '').replace(/([A-Z])/g, ' $1').trim(),
        content
      };
    }));

    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error("Error reading legal docs:", error);
    // Don't leak internal error details
    return NextResponse.json({ error: "Failed to load documents", documents: [] }, { status: 500 });
  }
}
