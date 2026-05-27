import { db } from "./firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  query,
  where,
  serverTimestamp,
  getDoc
} from "firebase/firestore";

/**
 * Generates a unique site number based on system type and mount type.
 * Ranges:
 * - On-grid: 1600+ (range [1600, 5399])
 * - Hybrid: 5400+ (range [5400, 9999])
 * - Off-grid: 10000+ (range >= 10000)
 * - Ground mount: GM-0002+ (if mountType is 'ground')
 * - Other Company: OCP100+
 */
export async function generateSiteNumber(
  sysType: string,
  mountType?: string,
  isOtherCompany?: boolean
): Promise<string> {
  const projectsSnap = await getDocs(collection(db, "projects"));
  const siteNos: string[] = [];
  projectsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.siteNo) {
      siteNos.push(String(data.siteNo).trim());
    }
  });

  const isGround = mountType?.toLowerCase() === "ground" || mountType?.toLowerCase() === "ground mount";

  if (isOtherCompany) {
    let maxVal = 99; // Starts from OCP100, so base is 99
    siteNos.forEach((no) => {
      if (no.startsWith("OCP")) {
        const numPart = parseInt(no.replace("OCP", ""), 10);
        if (!isNaN(numPart) && numPart > maxVal) {
          maxVal = numPart;
        }
      }
    });
    return `OCP${maxVal + 1}`;
  }

  if (isGround) {
    let maxVal = 1; // Starts from GM-0002, so base is 1
    siteNos.forEach((no) => {
      if (no.startsWith("GM-")) {
        const numPart = parseInt(no.replace("GM-", ""), 10);
        if (!isNaN(numPart) && numPart > maxVal) {
          maxVal = numPart;
        }
      }
    });
    const nextVal = maxVal + 1;
    const padded = String(nextVal).padStart(4, "0");
    return `GM-${padded}`;
  }

  const sysTypeLower = (sysType || "").toLowerCase();

  if (sysTypeLower === "offgrid") {
    let maxVal = 9999; // Starts from 10000
    siteNos.forEach((no) => {
      const num = parseInt(no, 10);
      if (!isNaN(num) && num >= 10000 && num > maxVal) {
        maxVal = num;
      }
    });
    return String(maxVal + 1);
  }

  if (sysTypeLower === "hybrid" || sysTypeLower === "hybrid-offgrid" || sysTypeLower === "grid-backup") {
    let maxVal = 5399; // Starts from 5400
    siteNos.forEach((no) => {
      const num = parseInt(no, 10);
      if (!isNaN(num) && num >= 5400 && num < 10000 && num > maxVal) {
        maxVal = num;
      }
    });
    return String(maxVal + 1);
  }

  // Default is ongrid
  let maxVal = 1599; // Starts from 1600
  siteNos.forEach((no) => {
    const num = parseInt(no, 10);
    if (!isNaN(num) && num >= 1600 && num < 5400 && num > maxVal) {
      maxVal = num;
    }
  });
  return String(maxVal + 1);
}

/**
 * Helper to check if a number represents currency words
 */
export function numberToWords(num: number): string {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (num === 0) return "Zero";

  const g = (n: number): string => {
    if (n < 20) return a[n];
    const d = n % 10;
    return b[Math.floor(n / 10)] + (d ? " " + a[d] : "");
  };

  const h = (n: number): string => {
    const hund = Math.floor(n / 100);
    const rest = n % 100;
    return (hund ? a[hund] + " Hundred" : "") + (hund && rest ? " and " : "") + (rest ? g(rest) : "");
  };

  let str = "";
  let temp = Math.floor(num);

  const millions = Math.floor(temp / 1000000);
  temp %= 1000000;
  if (millions) {
    str += h(millions) + " Million ";
  }

  const thousands = Math.floor(temp / 1000);
  temp %= 1000;
  if (thousands) {
    str += h(thousands) + " Thousand ";
  }

  if (temp) {
    str += h(temp);
  }

  // Handle cents if any
  const cents = Math.round((num - Math.floor(num)) * 100);
  if (cents > 0) {
    str += ` and Cents ${g(cents)}`;
  }

  return str.trim() + " Rupees Only";
}
