/**
 * Format a stored qtnNo for display.
 *
 * Priority (when propNo or siteNo provided):
 *   - installment 1    → always P_INV_[propNum]             e.g. P_INV_50001
 *   - installment 2+, siteNo assigned → Inv_[siteNo]/[N]   e.g. Inv_1603/2
 *   - installment 2+, no siteNo       → Inv_[propNum]/[N]  e.g. Inv_50001/2
 *   - fallback         → use stored qtnNo (legacy / direct format)
 *
 * @param qtnNo            Raw stored quotation number (e.g. "P_Inv_89184/1")
 * @param isPaid           Whether the quotation is in a paid status
 * @param installmentNo    Installment sequence number (1, 2, 3 …)
 * @param installmentPercent  Payment % this installment represents
 * @param siteNo           Project site number once assigned (e.g. "1603")
 * @param propNo           Human-readable proposal number (e.g. "Prop_50006")
 */
export function formatQtnNo(
  qtnNo: string,
  isPaid: boolean,
  installmentNo?: number,
  installmentPercent?: number,
  siteNo?: string,
  propNo?: string
): string {
  if (!qtnNo) return "—";

  // Determine whether this installment should render as an Invoice (vs Proforma)
  const isInvoice =
    (installmentNo != null && installmentNo > 1) ||
    (installmentPercent === 100 && isPaid);

  // Extract installment part from stored suffix: "P_Inv_89184/2" → instPart = "2"
  const suffixMatch = qtnNo.match(/\/(\d+)$/);
  const instPart = suffixMatch
    ? suffixMatch[1]
    : installmentNo != null
    ? String(installmentNo)
    : null;

  // ── Priority 1: Site number assigned → Inv_[siteNo]/[N] for installments 2+ ──
  // Installment 1 (advance payment) always uses the proposal number because the
  // site number is only assigned after advance payment and site confirmation.
  const cleanSiteNo = siteNo && siteNo !== "Pending" ? siteNo.trim() : null;
  const isAdvancePayment = installmentNo === 1;
  if (cleanSiteNo && instPart && !isAdvancePayment) {
    return `Inv_${cleanSiteNo}/${instPart}`;
  }

  // ── Priority 2: Use the proposal number as the base ──────────────────────
  if (propNo && instPart) {
    const propNum = propNo.replace(/^[Pp]rop_/, "");
    return isAdvancePayment
      ? `P_INV_${propNum}`
      : `Inv_${propNum}/${instPart}`;
  }

  // ── Fallback: use stored qtnNo as-is (legacy / no propNo supplied) ────────
  if (qtnNo.startsWith("P_Inv_") || qtnNo.startsWith("P_inv_")) {
    return isInvoice ? qtnNo.replace(/^P_[Ii]nv_/, "Inv_") : qtnNo;
  }
  if (qtnNo.startsWith("Inv_")) return qtnNo; // already a final invoice

  // Legacy QTN_ format — backward compat
  if (/^[Qq][Tt][Nn]_/.test(qtnNo)) {
    const base = qtnNo.replace(/^[Qq][Tt][Nn]_/, "");
    return isInvoice ? `Inv_${base}` : `P_Inv_${base}`;
  }

  return qtnNo;
}
