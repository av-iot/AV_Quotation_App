import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const docsDir = path.join(process.cwd(), "docs", "legal");
    
    if (!fs.existsSync(docsDir)) {
      // Create the directory and a sample file if it doesn't exist
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(
        path.join(docsDir, "01_TermsAndConditions.md"),
        `# General Terms and Conditions\n\n1. **Acceptance of Proposal**: By signing this document, the customer agrees to the system specifications and pricing.\n2. **Validity**: This proposal is valid for 14 days from the date of issue.\n3. **Installation**: Alta Vision Ltd will ensure all installations are carried out by certified engineers.\n4. **Warranty**: Hardware warranties are strictly governed by the original equipment manufacturer (OEM) policies.`
      );
    }

    const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md') || f.endsWith('.txt')).sort();
    
    const documents = files.map(filename => {
      const content = fs.readFileSync(path.join(docsDir, filename), "utf-8");
      return {
        filename,
        title: filename.replace(/^\d+_/, '').replace(/\.(md|txt)$/, '').replace(/([A-Z])/g, ' $1').trim(),
        content
      };
    });

    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error("Error reading legal docs:", error);
    return NextResponse.json({ error: error.message, documents: [] }, { status: 500 });
  }
}
