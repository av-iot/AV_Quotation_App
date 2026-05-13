import type { Proposal, ProposalFormData, ProposalOption, ComponentSpec } from "@/types";

export function buildProposalFromForm(
  form: ProposalFormData,
  userId: string,
  productsMap: Map<string, any>
): Omit<Proposal, "id" | "createdAt" | "updatedAt"> {
  const qtnNo = form.qtnNo || `QTN_${Date.now().toString().slice(-5)}`;

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