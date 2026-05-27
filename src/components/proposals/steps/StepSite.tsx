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
  const { register, watch, setValue, formState: { errors } } = useFormContext<ProposalFormData>();
  const phase = watch("phase") || "1";
  const cutoutCurrent = watch("cutoutCurrent") || "63";

  useEffect(() => {
    register("utility", { required: "Utility provider is required" });
    register("phase", { required: "Phase supply is required" });
    register("cutoutCurrent", {
      required: "Cutout current is required",
      validate: (val) => {
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) return "Cutout current must be greater than 0";
        return true;
      }
    });
    register("mountType", { required: "Mount type is required" });
    register("roofType", {
      validate: (val) => {
        const mount = watch("mountType") || "roof";
        if (mount === "roof" && !val) {
          return "Roof type is required for roof mount";
        }
        return true;
      }
    });
    register("powerScheme", { required: "Power scheme is required" });
  }, [register, watch]);

  useEffect(() => {
    if (phase === "1" && cutoutCurrent !== "32") {
      setValue("cutoutCurrent", "32", { shouldValidate: true });
    }
  }, [phase, cutoutCurrent, setValue]);

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Home className="h-4 w-4 text-primary" />
            Site details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">

            {/* Utility provider */}
            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label>Utility provider</Label>
              <Select
                value={watch("utility") || "CEB"}
                onValueChange={(v) => setValue("utility", v as any, { shouldValidate: true })}
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
              {errors.utility && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.utility.message}</p>
              )}
            </motion.div>

            {/* Phase supply */}
            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label>Phase supply</Label>
              <Select value={phase} onValueChange={(v) => setValue("phase", v as any, { shouldValidate: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Single Phase</SelectItem>
                  <SelectItem value="3">Three Phase</SelectItem>
                </SelectContent>
              </Select>
              {errors.phase && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.phase.message}</p>
              )}
            </motion.div>

            {/* Cutout current */}
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
                        setValue("cutoutCurrent", "100", { shouldValidate: true }); // default bulk
                      } else {
                        setValue("cutoutCurrent", v, { shouldValidate: true });
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
                        onChange={(e) => setValue("cutoutCurrent", e.target.value, { shouldValidate: true })}
                        placeholder="Enter bulk capacity (e.g. 100)"
                      />
                      <p className="text-xs font-medium text-destructive">
                        * Note: Need a transformer for bulk connections.
                      </p>
                    </motion.div>
                  )}
                </div>
              )}
              {errors.cutoutCurrent && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.cutoutCurrent.message}</p>
              )}
            </motion.div>

            {/* Power scheme */}
            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label>Power scheme</Label>
              <Select defaultValue="Net Accounting" onValueChange={(v) => setValue("powerScheme", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Net Accounting">Net Accounting</SelectItem>
                  <SelectItem value="Net Metering">Net Metering</SelectItem>
                  <SelectItem value="Net Plus">Net +</SelectItem>
                  <SelectItem value="Net Plus plus">Net ++</SelectItem>
                </SelectContent>
              </Select>
              {errors.powerScheme && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.powerScheme.message}</p>
              )}
            </motion.div>

            {/* Mount type & structure */}
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
                      setValue("mountType", value as any, { shouldValidate: true });
                      setValue("roofType", "", { shouldValidate: true });
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
                <Select value={watch("roofType") || ""} onValueChange={(v) => setValue("roofType", v, { shouldValidate: true })}>
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

              {errors.mountType && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.mountType.message}</p>
              )}
              {errors.roofType && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.roofType.message}</p>
              )}
            </motion.div>

          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
