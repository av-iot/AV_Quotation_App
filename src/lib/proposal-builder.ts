import type { Proposal, ProposalFormData, ProposalOption, ComponentSpec } from "@/types";

export function buildProposalFromForm(
  form: ProposalFormData,
  userId: string
): Omit<Proposal, "id" | "createdAt" | "updatedAt"> {
  const qtnNo = form.qtnNo || `QTN_${Date.now().toString().slice(-5)}`;

  const options: ProposalOption[] = form.options
    .slice(0, form.numOptions)
    .map((opt, i) => {
      const panel: ComponentSpec = {
        brand: "", model: opt.panelProductId, ratingLabel: "",
        qty: Number(opt.panelQty) || 0, totalCapacity: "",
        warranty: "", origin: opt.coo || "China", manufacture: opt.coo || "China",
        productId: opt.panelProductId,
      };
      const inverter: ComponentSpec = {
        brand: "", model: opt.inverterProductId, ratingLabel: "",
        qty: Number(opt.inverterQty) || 1, totalCapacity: "",
        warranty: "", origin: opt.coo || "China", manufacture: opt.coo || "China",
        productId: opt.inverterProductId,
      };
      const battery: ComponentSpec | undefined =
        form.sysType !== "ongrid" && opt.batteryProductId
          ? {
              brand: "", model: opt.batteryProductId, ratingLabel: "",
              qty: Number(opt.batteryQty) || 1, totalCapacity: "",
              warranty: "", origin: opt.coo || "China", manufacture: opt.coo || "China",
              productId: opt.batteryProductId,
            }
          : undefined;

      return {
        label: form.numOptions > 1 ? `Option ${i + 1}` : "",
        panel,
        inverter,
        battery,
        pricing: {
          estOutput: opt.estOutput || "",
          sysPrice: Number(opt.sysPrice) || 0,
          ...(opt.structPrice ? { structPrice: Number(opt.structPrice) } : {}),
          totalPrice: Number(opt.totalPrice || opt.sysPrice) || 0,
          specialStructNote: opt.specialStructNote || false,
        },
      };
    });

  return {
    qtnNo,
    date: form.date,
    customer: {
      name: form.custName,
      address: form.addr,
      phone: form.phone,
      ...(form.phone2 ? { phone2: form.phone2 } : {}),
      email: form.email,
      sendFormat: form.sendFormat || [],
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
    status: "draft",
    createdBy: userId,
  };
}