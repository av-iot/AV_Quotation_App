/**
 * Shared utility to format warranties according to business rules.
 */
export function getFormattedWarranty(
  type: "inverter" | "battery" | "panel",
  brand: string,
  model: string,
  subtype: string,
  warrantyVal: number | string,
  hasGoodweBattery?: boolean
): string {
  const brandLower = (brand || "").toLowerCase().trim();
  const modelLower = (model || "").toLowerCase().trim();
  const subtypeLower = (subtype || "").toLowerCase().trim();
  const years = parseInt(String(warrantyVal)) || 0;

  if (type === "panel") {
    // Panels has 12 year product warranty and 25 year performance warranty
    const prodYears = years || 12;
    return `${prodYears} Year Product Warranty\n• 25 Year Performance Warranty`;
  }

  if (type === "battery") {
    // Batteries has 5 year product warranty and 5 year extended warranty
    const prodYears = years || 5;
    return `${prodYears} Year Product Warranty + 5 Year Extended Warranty`;
  }

  if (type === "inverter") {
    const isGoodwe = brandLower.includes("goodwe");
    const isHybrid =
      subtypeLower.includes("hybrid") ||
      modelLower.includes("hybrid") ||
      brandLower.includes("hybrid") ||
      // Offgrid/hybrid-offgrid and battery systems act as hybrid setups
      subtypeLower.includes("offgrid") ||
      modelLower.includes("offgrid") ||
      brandLower.includes("offgrid") ||
      subtypeLower.includes("off-grid") ||
      modelLower.includes("off-grid") ||
      brandLower.includes("off-grid");

    if (isGoodwe) {
      if (isHybrid) {
        // goodwe hybrid battery and goodwe battery makes 10 year product warranty for inverter
        if (hasGoodweBattery) {
          return "10 Year Product Warranty";
        }
        // Goodwe Hybrid inverters has 5 year product warranty + 5 year extended warranty
        const prodYears = years || 5;
        return `${prodYears} Year Product Warranty + 5 Year Extended Warranty`;
      }
      // Goodwe ongrid inverters 10 year product warranty
      const prodYears = years || 10;
      return `${prodYears} Year Product Warranty`;
    }

    // Default inverter fallback
    if (isHybrid) {
      const prodYears = years || 5;
      return `${prodYears} Year Product Warranty + 5 Year Extended Warranty`;
    }
    const prodYears = years || 10;
    return `${prodYears} Year Product Warranty`;
  }

  return `${years} Year Warranty`;
}
