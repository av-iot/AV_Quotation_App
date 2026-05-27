// VAT-inclusive model: when vatInvoice=true, the entered system price INCLUDES VAT.
// Grand total = entered price (after discount). VAT is extracted backwards.

function _subtotalAfterDiscount(opt: any, proposal: any): number {
  const sysPrice = opt.pricing?.sysPrice || 0;
  const structPrice = opt.pricing?.includeStructInTotal !== false
    ? (opt.pricing?.structPrice || 0) : 0;
  const installPrice = opt.pricing?.includeInstallInTotal !== false
    ? (opt.pricing?.installPrice || 0) : 0;
  const cebCharges = proposal.cebInclusive !== true
    ? (proposal.cebCharges || 0) : 0;
  const discountPct = opt.pricing?.discount || 0;
  const subtotal = sysPrice + structPrice + installPrice + cebCharges;
  const discountAmt = (subtotal * discountPct) / 100;
  return subtotal - discountAmt;
}

/** Grand total (VAT-inclusive when vatInvoice=true — VAT already in the entered price) */
export function computeOptionTotal(opt: any, proposal: any): number {
  return Math.round(_subtotalAfterDiscount(opt, proposal));
}

/** Price before VAT — extracted from the VAT-inclusive grand total */
export function computeFinalBeforeVat(opt: any, proposal: any): number {
  const grandTotal = _subtotalAfterDiscount(opt, proposal);
  if (!proposal.vatInvoice) return Math.round(grandTotal);
  const vatRate = Number(proposal.vatRate) || 18;
  return Math.round(grandTotal / (1 + vatRate / 100));
}

/** VAT amount extracted from the inclusive price */
export function computeVatAmount(opt: any, proposal: any): number {
  if (!proposal.vatInvoice) return 0;
  return computeOptionTotal(opt, proposal) - computeFinalBeforeVat(opt, proposal);
}
