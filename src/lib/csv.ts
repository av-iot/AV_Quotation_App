/**
 * Robust CSV Utility parser and serializer.
 * Handles double-quotes, newlines, and escaping of commas correctly.
 */

export function parseCSV(csvText: string): Record<string, string>[] {
  // Strip UTF-8 Byte Order Mark (BOM) if present
  csvText = csvText.replace(/^\uFEFF/, "");
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = "";
    } else if (char === '\r') {
      // Ignore carriage returns
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  
  if (lines.length === 0) return [];
  
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let currentField = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField);
        currentField = "";
      } else {
        currentField += char;
      }
    }
    fields.push(currentField);
    return fields;
  };
  
  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim().replace(/^"|"$/g, ''));
  
  // Deduplicate headers by appending __dupN for repeat column names
  const seen: Record<string, number> = {};
  const uniqueHeaders = headers.map((h) => {
    const clean = h.trim();
    if (!clean) return "";
    const lower = clean.toLowerCase();
    if (seen[lower] === undefined) {
      seen[lower] = 1;
      return clean;
    } else {
      seen[lower]++;
      return `${clean}__dup${seen[lower]}`;
    }
  });

  const result: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const lineText = lines[i].trim();
    if (!lineText) continue;
    const values = parseLine(lines[i]);
    const obj: Record<string, string> = {};
    uniqueHeaders.forEach((header, index) => {
      if (header) {
        const val = values[index];
        obj[header] = val !== undefined ? val.trim() : "";
      }
    });
    result.push(obj);
  }
  
  return result;
}

export function toCSV(data: Record<string, any>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const escapeValue = (val: any): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  
  const headerLine = headers.join(",");
  const rows = data.map(row => 
    headers.map(header => escapeValue(row[header])).join(",")
  );
  
  return [headerLine, ...rows].join("\n");
}
