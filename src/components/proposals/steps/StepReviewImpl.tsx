"use client";
import { useFormContext } from "react-hook-form";
import type { ProposalFormData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";
import { motion } from "framer-motion";

const stagger = { animate: { transition: { staggerChildren: 0.06 } } };
const fadeUp  = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.2 } } };

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
      {children}
    </p>
  );
}

const fmtRs = (v?: string | number | null) => {
  if (!v) return "—";
  const n = Number(v);
  if (isNaN(n) || n === 0) return "—";
  return "Rs. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (ds: string) => {
  if (!ds) return "";
  const d   = new Date(ds);
  const day = d.getDate();
  const ord = [, "st", "nd", "rd"];
  const suf = (day % 100 > 10 && day % 100 < 20) ? "th" : (ord[day % 10] || "th");
  const mo  = ["January","February","March","April","May","June","July","August","September","October","November","December"][d.getMonth()];
  return `${day}${suf} ${mo} ${d.getFullYear()}`;
};

const getProductFromCache = (id?: string) => {
  if (!id || typeof window === "undefined") return null;
  return ((window as any).__productCache as Record<string, any> | undefined)?.[id] ?? null;
};

export default function StepReview({ onNext }: { onNext: () => void }) {
  const { watch } = useFormContext<ProposalFormData>();
  const f = watch();

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">

      {/* Banner */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <CheckCircle className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Review all details before generating. Go back to any step to edit.
          </p>
        </div>
      </motion.div>

      {/* ── Customer ── */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Row label="Name"         value={f.custName} />
            <Row label="Reference No" value={f.qtnNo} />
            <Row label="Date"         value={fmtDate(f.date)} />
            <Row label="Address"      value={f.addr} />
            <Row label="Phone"        value={f.phone} />
            {f.phone2 && <Row label="Phone 2" value={f.phone2} />}
            <Row label="Email"        value={f.email} />
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Site & System ── */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Site & system
              <Badge variant="outline" className="ml-auto text-xs capitalize">{f.sysType}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Row label="System type"    value={
              f.sysType === "ongrid" ? "On-Grid (Solar + Grid)" :
              f.sysType === "hybrid" ? "Hybrid (Solar + Grid + Battery)" :
              f.sysType === "hybrid-offgrid" ? "Hybrid (Solar + Battery - No Grid)" :
              f.sysType === "offgrid" ? "Off-Grid (Solar + Battery)" :
              f.sysType === "grid-backup" ? "Grid Backup (Grid + Battery - No Solar)" :
              f.sysType
            } />
            <Row label="Utility"        value={f.utility} />
            <Row label="Phase"          value={f.phase === "1" ? "Single Phase" : "Three Phase"} />
            <Row label="Cutout current" value={f.cutoutCurrent ? f.cutoutCurrent + " A" : undefined} />
            <Row label="Mount type"     value={f.mountType === "roof" ? "Roof mount" : "Ground mount"} />
            {f.mountType !== "ground" && <Row label="Roof type" value={f.roofType} />}
            <Row label="Power scheme"   value={f.powerScheme} />
            <Row label="Options"        value={`${f.numOptions} option(s)`} />
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Options ── */}
      {f.options?.slice(0, f.numOptions).map((opt, i) => {
        const panel   = getProductFromCache(opt.panelProductId);
        const inv     = getProductFromCache(opt.inverterProductId);
        const bat     = getProductFromCache(opt.batteryProductId);

        const panelQty = parseInt(opt.panelQty || "0") || 0;
        const invQty   = parseInt(opt.inverterQty || "1") || 1;
        const batQty   = parseInt(opt.batteryQty  || "0") || 0;

        const panelCap = panel && panelQty
          ? ((panelQty * panel.max_panel_output_power) / 1000).toFixed(2) + " kW"
          : null;
        const batCap = bat && batQty
          ? (batQty * bat.usable_energy) + " kWh"
          : null;
        const invCap = inv
          ? ((inv.input_rated_power * invQty) / 1000).toFixed(1) + " kW"
          : null;

        const sysPrice    = parseFloat(opt.sysPrice    || "0") || 0;
        const structPrice = parseFloat(opt.structPrice  || "0") || 0;
        const installPrice= parseFloat((opt as any).installPrice || "0") || 0;
        const cebCharges  = parseFloat(f.cebCharges || "0") || 0;
        const discount    = parseFloat((opt as any).discount    || "0") || 0;
        const subtotal    = sysPrice + structPrice + installPrice + cebCharges;
        const discAmt     = (subtotal * discount) / 100;
        const finalPrice  = subtotal - discAmt;

        return (
          <motion.div key={i} variants={fadeUp}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Option {i + 1}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Inverter */}
                {inv && (
                  <div>
                    <SectionTitle>Inverter</SectionTitle>
                    <Row label="Brand / Model" value={`${inv.brand} (${inv.model})`} />
                    <Row label="Rated power"   value={`${(inv.input_rated_power / 1000).toFixed(1)} kW`} />
                    <Row label="Phase"         value={inv.phase_count} />
                    <Row label="Type"          value={inv.inverter_type} />
                    <Row label="Quantity"      value={String(invQty)} />
                    <Row label="Total capacity" value={invCap ?? undefined} />
                    <Row label="Warranty"      value={inv.warranty} />
                  </div>
                )}

                {/* Panels */}
                {panel && f.sysType !== "grid-backup" && (
                  <div>
                    <SectionTitle>Solar panels</SectionTitle>
                    <Row label="Brand / Model"  value={`${panel.brand} (${panel.model})`} />
                    <Row label="Output"         value={`${panel.max_panel_output_power} W`} />
                    <Row label="Type"           value={panel.panel_type} />
                    <Row label="Quantity"       value={String(panelQty)} />
                    <Row label="Total capacity" value={panelCap ?? undefined} />
                    <Row label="Warranty"       value={panel.warranty} />
                  </div>
                )}

                {/* Battery */}
                {bat && batQty > 0 && (
                  <div>
                    <SectionTitle>Battery</SectionTitle>
                    <Row label="Brand / Model"   value={`${bat.brand} (${bat.model})`} />
                    <Row label="Usable energy"   value={`${bat.usable_energy} kWh`} />
                    <Row label="Cell type"       value={bat.cell_type} />
                    <Row label="Quantity"        value={String(batQty)} />
                    <Row label="Total capacity"  value={batCap ?? undefined} />
                    <Row label="Warranty"        value={bat.warranty} />
                  </div>
                )}

                {/* Performance & Service */}
                <div>
                  <SectionTitle>Performance & Service</SectionTitle>
                  <Row label="Expected generation" value={(opt as any).expectedGen ? `${(opt as any).expectedGen} Units/month` : "—"} />
                  <Row label="After sales service" value={(opt as any).afterSalesPeriod ? `${(opt as any).afterSalesPeriod} Years (${(opt as any).servicesPerYear} per year)` : "—"} />
                </div>
                
                {/* Pricing */}
                <div>
                  <SectionTitle>Pricing</SectionTitle>
                  <Row label="System price"    value={fmtRs(sysPrice)} />
                  {structPrice > 0  && <Row label="Structure price"    value={fmtRs(structPrice)} />}
                  {installPrice > 0 && <Row label="Installation price" value={fmtRs(installPrice)} />}
                  {cebCharges > 0 && <Row label="CEB chargers" value={fmtRs(cebCharges)} />}
                  {subtotal > 0     && <Row label="Subtotal"           value={fmtRs(subtotal)} />}
                  {discount > 0     && <Row label={`Discount (${discount}%)`} value={`− ${fmtRs(discAmt)}`} />}
                  <div className="mt-2 flex justify-between rounded-lg bg-primary/5 px-3 py-2.5">
                    <span className="text-sm font-semibold text-primary">Final price</span>
                    <span className="text-sm font-bold text-primary">{fmtRs(finalPrice)}</span>
                  </div>
                </div>

              </CardContent>
            </Card>
          </motion.div>
        );
      })}

      {/* ── Payment terms ── */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Payment terms
            </CardTitle>
          </CardHeader>
          <CardContent>
            {f.pay1 && (
              <Row label="On confirmation"  value={`${f.pay1}%`} />
            )}
            {f.pay2 && (
              <Row label="Before / during install" value={`${f.pay2}%`} />
            )}
            {f.pay3 && (
              <Row label="After commissioning" value={`${f.pay3}%`} />
            )}
            {f.validityPeriod && (
              <Row label="Validity period" value={`${f.validityPeriod} days`} />
            )}
            {f.extraNotes && (
              <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{f.extraNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

    </motion.div>
  );
}
