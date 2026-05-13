"use client";
import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import type { ProposalFormData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Home } from "lucide-react";
import { motion } from "framer-motion";

const stagger = { animate: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.2 } } };

export default function StepSite({ onNext }: { onNext: () => void }) {
  const { register, watch, setValue } = useFormContext<ProposalFormData>();
  const sysType = watch("sysType");
  const phase = watch("phase") || "1";
  const cutoutCurrent = watch("cutoutCurrent") || "63";

  useEffect(() => {
    if (phase === "1" && cutoutCurrent !== "32") {
      setValue("cutoutCurrent", "32");
    }
  }, [phase, cutoutCurrent, setValue]);

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Home className="h-4 w-4 text-primary" />
            Site & system type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label>System type *</Label>
              <Select value={sysType} onValueChange={(v) => setValue("sysType", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ongrid">On-Grid (Grid Tied)</SelectItem>
                  <SelectItem value="hybrid">Hybrid (Grid Tied + Battery)</SelectItem>
                  <SelectItem value="offgrid">Off-Grid (Battery)</SelectItem>
                </SelectContent>
              </Select>
            </motion.div>

            <motion.div variants={fadeUp} className="space-y-1.5">
  <Label>Utility provider</Label>
  <Select
    value={sysType === "offgrid" ? "NONE" : (watch("utility") || "CEB")}
    onValueChange={(v) => setValue("utility", v as any)}
    disabled={sysType === "offgrid"}
  >
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="CEB">CEB</SelectItem>
      <SelectItem value="LECO">LECO</SelectItem>
      <SelectItem value="NONE">None</SelectItem>
    </SelectContent>
  </Select>
  {sysType === "offgrid" && (
    <p className="text-xs text-muted-foreground">
      Off-grid systems have no utility connection.
    </p>
  )}
</motion.div>

            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label>Phase supply</Label>
              <Select value={phase} onValueChange={(v) => setValue("phase", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Single Phase</SelectItem>
                  <SelectItem value="3">Three Phase</SelectItem>
                </SelectContent>
              </Select>
            </motion.div>

            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label>Cutout current (A)</Label>
              {phase === "1" ? (
                <Select value="32" disabled>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="32">32 A (Fixed for Single Phase)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-3">
                  <Select 
                    value={["32", "63"].includes(cutoutCurrent) ? cutoutCurrent : "bulk"} 
                    onValueChange={(v) => {
                      if (v === "bulk") {
                        setValue("cutoutCurrent", "100"); // default bulk
                      } else {
                        setValue("cutoutCurrent", v);
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="32">32 A</SelectItem>
                      <SelectItem value="63">63 A</SelectItem>
                      <SelectItem value="bulk">Bulk</SelectItem>
                    </SelectContent>
                  </Select>

                  {!["32", "63"].includes(cutoutCurrent) && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2">
                      <Input 
                        type="number" 
                        value={cutoutCurrent}
                        onChange={(e) => setValue("cutoutCurrent", e.target.value)}
                        placeholder="Enter bulk capacity (e.g. 100)"
                      />
                      <p className="text-xs font-medium text-destructive">
                        * Note: Need a transformer for bulk connections.
                      </p>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>

            <motion.div variants={fadeUp} className="space-y-3 sm:col-span-2">
  <Label>Mount type & structure</Label>

  {/* Roof / Ground toggle */}
  <div className="flex gap-3">
    {[
      { value: "roof",   label: "🏠 Roof mount" },
      { value: "ground", label: "🌿 Ground mount" },
    ].map(({ value, label }) => (
      <button
        key={value}
        type="button"
        onClick={() => {
          setValue("mountType", value as any);
          setValue("roofType", "");
        }}
        className={`flex-1 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
          watch("mountType") === value || (!watch("mountType") && value === "roof")
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40"
        }`}
      >
        {label}
      </button>
    ))}
  </div>

  {/* Roof type — only shown when roof mount selected */}
  {(watch("mountType") === "roof" || !watch("mountType")) && (
    <Select value={watch("roofType") || "tile"} onValueChange={(v) => setValue("roofType", v)}>
      <SelectTrigger><SelectValue placeholder="Select roof type" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tile">Tile roof (උළු වහල)</SelectItem>
        <SelectItem value="asbestos">Asbestos / Sheet</SelectItem>
        <SelectItem value="concrete">Concrete flat</SelectItem>
        <SelectItem value="metal">Metal / Zinc</SelectItem>
        <SelectItem value="special">Special structure needed</SelectItem>
      </SelectContent>
    </Select>
  )}

  {/* Ground mount — just a note */}
  {watch("mountType") === "ground" && (
    <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      Ground mount structure — costs will be noted separately in the proposal.
    </div>
  )}
</motion.div>

            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label>Power scheme</Label>
              <Select defaultValue="Net Accounting" onValueChange={(v) => setValue("powerScheme", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Net Accounting">Net Accounting</SelectItem>
                  <SelectItem value="Net Metering">Net Metering</SelectItem>
                  <SelectItem value="Net Plus">Net +</SelectItem>
                  <SelectItem value="Net Plus plus">Net ++</SelectItem>
                </SelectContent>
              </Select>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
