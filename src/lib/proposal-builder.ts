import type { Proposal, ProposalFormData, ProposalOption, ComponentSpec } from "@/types";

export function buildProposalFromForm(
  form: ProposalFormData,
  userId: string,
  productsMap: Map<string, any>
): Omit<Proposal, "id" | "createdAt" | "updatedAt"> {
  const qtnNo = form.qtnNo || `P_Inv_${Date.now().toString().slice(-5)}`;

  const options: ProposalOption[] = form.options
    .slice(0, form.numOptions)
    .map((opt, i) => {
      const panelData = productsMap.get(opt.panelProductId);
      const panel: ComponentSpec = {
        brand: panelData?.brand || "",
        model: panelData?.model || opt.panelProductId,
        ratingLabel: panelData ? `${panelData.max_panel_output_power || panelData.max_panel_output}W` : "",
        qty: Number(opt.panelQty) || 0,
        totalCapacity: "",
        warranty: panelData ? `${panelData.warranty} years` : "",
        origin: panelData?.origin || "China",
        manufacture: panelData?.manufacture || "China",
        productId: opt.panelProductId,
        productSubtype: panelData?.panel_type || "",
        dataSheetUrl: panelData?.dataSheetUrl || "",
        dataSheetName: panelData?.dataSheetName || "",
      };

      const invData = productsMap.get(opt.inverterProductId);
      const inverter: ComponentSpec = {
        brand: invData?.brand || "",
        model: invData?.model || opt.inverterProductId,
        ratingLabel: invData ? `${invData.input_rated_power / 1000}kW` : "",
        qty: Number(opt.inverterQty) || 1,
        totalCapacity: "",
        warranty: invData ? `${invData.warranty} years` : "",
        origin: invData?.origin || "China",
        manufacture: invData?.manufacture || "China",
        productId: opt.inverterProductId,
        productSubtype: invData?.inverter_type || "",
        dataSheetUrl: invData?.dataSheetUrl || "",
        dataSheetName: invData?.dataSheetName || "",
      };

      const batData = opt.batteryProductId ? productsMap.get(opt.batteryProductId) : null;
      const battery: ComponentSpec | undefined =
        opt.sysType !== "ongrid" && opt.batteryProductId
          ? {
              brand: batData?.brand || "",
              model: batData?.model || opt.batteryProductId,
              ratingLabel: batData ? `${batData.usable_energy}kWh` : "",
              qty: Number(opt.batteryQty) || 1,
              totalCapacity: "",
              warranty: batData ? `${batData.warranty} years` : "",
              origin: batData?.origin || "China",
              manufacture: batData?.manufacture || "China",
              productId: opt.batteryProductId,
              dataSheetUrl: batData?.dataSheetUrl || "",
              dataSheetName: batData?.dataSheetName || "",
            }
          : undefined;

      return {
        label: form.numOptions > 1 ? `Option ${i + 1}` : "",
        panel,
        inverter,
        battery,
        expectedGen: opt.expectedGen || "",
        afterSalesPeriod: opt.afterSalesPeriod || "",
        servicesPerYear: opt.servicesPerYear || "",
        hasShading: opt.hasShading || false,
        shadingReduction: opt.shadingReduction || "",
        pricing: {
          estOutput: opt.estOutput || "",
          sysPrice: Number(opt.sysPrice) || 0,
          structPrice: Number(opt.structPrice) || 0,
          installPrice: Number(opt.installPrice) || 0,
          discount: Number(opt.discount) || 0,
          totalPrice: Number(opt.totalPrice || opt.sysPrice) || 0,
          specialStructNote: opt.specialStructNote || false,
          includeStructInTotal: opt.includeStructInTotal !== false,
          includeInstallInTotal: opt.includeInstallInTotal !== false,
        },
      };
    });

  const result = {
    qtnNo,
    date: form.date,
    customer: {
      name: form.custName,
      address: form.addr,
      phone: form.phone,
      ...(form.phone2 ? { phone2: form.phone2 } : {}),
      email: form.email,
      sendFormat: form.sendFormat || [],
      ...(form.custSalutation ? { salutation: form.custSalutation } : {}),
    },
    sysType: form.sysType,
    utility: form.utility,
    phase: form.phase,
    roofType: form.roofType || "",
    cutoutCurrent: form.cutoutCurrent || "",
    mountType: form.mountType,
    powerScheme: form.powerScheme,
    numOptions: form.numOptions,
    options,
    pay1: form.pay1 || "0",
    pay2: form.pay2 || "0",
    pay3: form.pay3 || "0",
    extraNotes: form.extraNotes || "",
    cebCharges: form.cebCharges ? Number(form.cebCharges) : 0,
    cebInclusive: form.cebInclusive !== false,
    vatInvoice: form.vatInvoice || false,
    vatRate: form.vatRate ? Number(form.vatRate) : 18,
    validityPeriod: form.validityPeriod || "14",
    status: "draft",
    createdBy: userId,
  };

  return cleanUndefined(result);
}

function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }

  const cleaned: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = cleanUndefined(val);
      }
    }
  }
  return cleaned;
}