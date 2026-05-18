"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { collection, addDoc, updateDoc, doc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { InverterProduct, BatteryProduct, PanelProduct, ProductType, InverterType } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AnyProduct = InverterProduct | BatteryProduct | PanelProduct;

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: AnyProduct | null;
}

function Field({ label, required, children, hint, col2 }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string; col2?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", col2 && "col-span-2")}>
      <Label className="text-sm">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="col-span-2 mt-2">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <Separator />
    </div>
  );
}

const getQtyValue = (val: any) => {
  if (val === undefined || val === null || val === "") return 1;
  const num = Number(val);
  return isNaN(num) ? 1 : num;
};

function numericFields(type: ProductType, data: any, invType: InverterType) {
  if (type === "inverter") {
    const base = {
      input_rated_power: Number(data.input_rated_power),
      max_input_power: Number(data.max_input_power),
      max_input_voltage: Number(data.max_input_voltage),
      max_output_current: Number(data.max_output_current),
      pv_string_count: Number(data.pv_string_count),
      mppt_count: Number(data.mppt_count),
      warranty: Number(data.warranty),
      qty: getQtyValue(data.qty),
      buy_price: data.buy_price ? Number(data.buy_price).toFixed(2) : "0.00",
      sell_price: Number(data.sell_price).toFixed(2),
    };
    if (invType === "hybrid" || invType === "offgrid") {
      return {
        ...base,
        output_power: Number(data.output_power),
        nominal_battery_voltage: Number(data.nominal_battery_voltage),
        no_of_battery_inputs: Number(data.no_of_battery_inputs),
        max_charging_power: Number(data.max_charging_power),
        max_discharging_power: Number(data.max_discharging_power),
      };
    }
    return base;
  }
  if (type === "battery") {
    return {
      usable_energy: Number(data.usable_energy),
      max_energy: Number(data.max_energy),
      nominal_voltage: Number(data.nominal_voltage),
      cycle_count: Number(data.cycle_count),
      warranty: Number(data.warranty),
      qty: getQtyValue(data.qty),
      buy_price: data.buy_price ? Number(data.buy_price).toFixed(2) : "0.00",
      sell_price: Number(data.sell_price).toFixed(2),
    };
  }
  if (type === "panel") {
    return {
      max_panel_output_power: Number(data.max_panel_output),
      max_panel_output: Number(data.max_panel_output),
      max_efficiency: Number(data.max_efficiency),
      max_power_voltage: Number(data.max_power_voltage),
      width: Number(data.width),
      height: Number(data.height),
      length: Number(data.length),
      warranty: Number(data.warranty),
      qty: getQtyValue(data.qty),
      buy_price: data.buy_price ? Number(data.buy_price).toFixed(2) : "0.00",
      sell_price: Number(data.sell_price).toFixed(2),
    };
  }
  return {};
}

export default function ProductFormDialog({ open, onClose, editing }: Props) {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<ProductType>("inverter");
  const [inverterType, setInverterType] = useState<InverterType>("ongrid");

  // When editing, use the product's existing type
  const productType: ProductType = editing ? editing.type : selectedType;

  const onTypeChange = (t: ProductType) => {
    setSelectedType(t);
    reset({});
    setInverterType("ongrid");
  };

  const { register, handleSubmit, reset, setValue, watch } = useForm<any>({
    defaultValues: editing || {},
  });

  const [uploadingFile, setUploadingFile] = useState(false);
  const watchDataSheetUrl = watch("dataSheetUrl");
  const watchDataSheetName = watch("dataSheetName");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const storageRef = ref(storage, `datasheets/${productType}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      setValue("dataSheetUrl", downloadUrl, { shouldDirty: true });
      setValue("dataSheetName", file.name, { shouldDirty: true });
      toast({ title: "Datasheet uploaded successfully!" });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  };

useEffect(() => {
    if (open) {
      reset(editing || {});
      if (editing) {
        setSelectedType(editing.type);
        if (editing.type === "inverter") {
          setInverterType((editing as InverterProduct).inverter_type || "ongrid");
        }
      } else {
        setSelectedType("inverter");
        setInverterType("ongrid");
      }
    }
  }, [open, editing, reset]);

  const onSubmit = async (data: any) => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        ...data,
        type: productType,
        active: data.active !== false,
        updatedAt: now,
        ...(productType === "inverter" && { inverter_type: inverterType }),
        ...numericFields(productType, data, inverterType),
      };
      if (editing?.id) {
        await updateDoc(doc(db, "products", editing.id), payload);
        toast({ title: "Product updated" });
      } else {
        await addDoc(collection(db, "products"), { ...payload, createdAt: now });
        toast({ title: "Product added" });
      }
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const title = `${editing ? "Edit" : "Add"} ${productType.charAt(0).toUpperCase() + productType.slice(1)}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
  <DialogTitle>{editing ? `Edit ${productType}` : "Add product"}</DialogTitle>
</DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-2">
  <div className="grid grid-cols-2 gap-4">

    {/* Product type selector — only shown when adding new */}
    {!editing && (
      <>
        <div className="col-span-2">
          <Label className="text-sm">
            Product type <span className="text-destructive">*</span>
          </Label>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {[
              { value: "inverter", label: "Inverter", icon: "⚡" },
              { value: "battery",  label: "Battery",  icon: "🔋" },
              { value: "panel",    label: "Panel",    icon: "☀️" },
            ].map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onTypeChange(value as ProductType)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm font-medium transition-all",
                  selectedType === value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                <span className="text-2xl">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <Separator />
        </div>
      </>
    )}

    <Section title="General" />

            <Field label="Brand" required>
              <Input {...register("brand", { required: true })} placeholder="GoodWe" className="h-9 text-sm" />
            </Field>
            <Field label="Model" required>
              <Input {...register("model", { required: true })} placeholder="GW5000-ES-C10" className="h-9 text-sm" />
            </Field>
            <Field label="Country of origin" required>
              <Input {...register("origin", { required: true })} placeholder="China" className="h-9 text-sm" />
            </Field>
            <Field label="Country of manufacture" required>
              <Input {...register("manufacture", { required: true })} placeholder="China" className="h-9 text-sm" />
            </Field>
            <Field label="Warranty (Years)" required>
              <Input {...register("warranty", { required: true })} type="number" placeholder="5" className="h-9 text-sm" />
            </Field>
            <Field label="Inventory / Batch Qty">
              <Input {...register("qty", { required: false })} type="number" placeholder="1" className="h-9 text-sm" />
            </Field>
            <Field label="Buy price (LKR)">
              <Input 
                {...register("buy_price", { required: false })} 
                type="number" 
                step="any" 
                placeholder="0" 
                className="h-9 text-sm" 
                onChange={(e) => {
                  const val = e.target.value;
                  setValue("buy_price", val);
                  const num = Number(val) || 0;
                  const sell = num * 1.205 * 1.10;
                  setValue("sell_price", sell.toFixed(2), { shouldDirty: true });
                }}
              />
            </Field>
            <Field label="Sell price (LKR)" required>
              <Input {...register("sell_price", { required: true })} type="number" step="any" placeholder="0" className="h-9 text-sm" />
            </Field>

            {/* ── INVERTER FIELDS ── */}
            {productType === "inverter" && (
              <>
                <Section title="Inverter specs" />

                <Field label="Inverter type" required>
                  <Select value={inverterType} onValueChange={(v) => { setInverterType(v as InverterType); setValue("inverter_type", v); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ongrid">On-Grid</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="offgrid">Off-Grid</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Phase" required>
                  <Select
                    defaultValue={(editing as InverterProduct)?.phase_count || "Single Phase"}
                    onValueChange={(v) => setValue("phase_count", v)}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Single Phase">Single Phase</SelectItem>
                      <SelectItem value="Three Phase">Three Phase</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Input rated power (W)" required>
                  <Input {...register("input_rated_power", { required: true })} type="number" step="any" placeholder="5000" className="h-9 text-sm" />
                </Field>
                <Field label="Max input power (W)" required>
                  <Input {...register("max_input_power", { required: true })} type="number" step="any" placeholder="6500" className="h-9 text-sm" />
                </Field>
                <Field label="Max input voltage (V)" required>
                  <Input {...register("max_input_voltage", { required: true })} type="number" step="any" placeholder="600" className="h-9 text-sm" />
                </Field>
                <Field label="Max output current (A)" required>
                  <Input {...register("max_output_current", { required: true })} type="number" step="any" placeholder="22.7" className="h-9 text-sm" />
                </Field>
                <Field label="PV string count" required>
                  <Input {...register("pv_string_count", { required: true })} type="number" placeholder="2" className="h-9 text-sm" />
                </Field>
                <Field label="MPPT count" required>
                  <Input {...register("mppt_count", { required: true })} type="number" placeholder="2" className="h-9 text-sm" />
                </Field>

                {/* Hybrid / offgrid extra fields */}
                {(inverterType === "hybrid" || inverterType === "offgrid") && (
                  <>
                    <Section title="Battery connection (Hybrid / Off-Grid)" />

                    <Field label="Battery type" required>
                      <Input {...register("battery_type", { required: true })} placeholder="LiFePO4" className="h-9 text-sm" />
                    </Field>
                    <Field label="Output power (W)" required>
                      <Input {...register("output_power", { required: true })} type="number" step="any" placeholder="5000" className="h-9 text-sm" />
                    </Field>
                    <Field label="Nominal battery voltage (V)" required>
                      <Input {...register("nominal_battery_voltage", { required: true })} type="number" step="any" placeholder="48" className="h-9 text-sm" />
                    </Field>
                    <Field label="No. of battery inputs" required>
                      <Input {...register("no_of_battery_inputs", { required: true })} type="number" placeholder="1" className="h-9 text-sm" />
                    </Field>
                    <Field label="Max charging power (W)" required>
                      <Input {...register("max_charging_power", { required: true })} type="number" step="any" placeholder="3000" className="h-9 text-sm" />
                    </Field>
                    <Field label="Max discharging power (W)" required>
                      <Input {...register("max_discharging_power", { required: true })} type="number" step="any" placeholder="3000" className="h-9 text-sm" />
                    </Field>
                    <Field label="Battery voltage range" required col2>
                      <Input {...register("battery_voltage_range", { required: true })} placeholder="44.8 - 57.6V" className="h-9 text-sm" />
                    </Field>
                  </>
                )}
              </>
            )}

            {/* ── BATTERY FIELDS ── */}
            {productType === "battery" && (
              <>
                <Section title="Battery specs" />

                <Field label="Usable energy (kWh)" required>
                  <Input {...register("usable_energy", { required: true })} type="number" step="any" placeholder="4.8" className="h-9 text-sm" />
                </Field>
                <Field label="Max energy (kWh)" required>
                  <Input {...register("max_energy", { required: true })} type="number" step="any" placeholder="5.0" className="h-9 text-sm" />
                </Field>
                <Field label="Cell type" required>
                  <Input {...register("cell_type", { required: true })} placeholder="LiFePO4" className="h-9 text-sm" />
                </Field>
                <Field label="Nominal voltage (V)" required>
                  <Input {...register("nominal_voltage", { required: true })} type="number" step="any" placeholder="51.2" className="h-9 text-sm" />
                </Field>
<Field label="Min battery voltage (V)" required>
  <Input {...register("min_battery_voltage", { required: true })} type="number" step="any" placeholder="44.8" className="h-9 text-sm" />
</Field>
<Field label="Max battery voltage (V)" required>
  <Input {...register("max_battery_voltage", { required: true })} type="number" step="any" placeholder="57.6" className="h-9 text-sm" />
</Field>
                <Field label="Cycle count" required>
                  <Input {...register("cycle_count", { required: true })} type="number" placeholder="6000" className="h-9 text-sm" />
                </Field>
                <Field label="Battery model type" col2>
                  <Input {...register("battery_model_type", { required: false })} placeholder="Wall-mounted" className="h-9 text-sm" />
                </Field>
              </>
            )}

            {/* ── PANEL FIELDS ── */}
            {productType === "panel" && (
              <>
                <Section title="Panel specs" />

                <Field label="Max panel output (W)" required>
                  <Input {...register("max_panel_output", { required: true })} type="number" step="any" placeholder="620" className="h-9 text-sm" />
                </Field>
                <Field label="Panel type" required>
                  <Input {...register("panel_type", { required: true })} placeholder="Monocrystalline" className="h-9 text-sm" />
                </Field>
                <Field label="Max efficiency (%)" required>
                  <Input {...register("max_efficiency", { required: true })} type="number" step="any" placeholder="21.3" className="h-9 text-sm" />
                </Field>
                <Field label="Max power voltage / Vmp (V)" required>
                  <Input {...register("max_power_voltage", { required: true })} type="number" step="any" placeholder="41.8" className="h-9 text-sm" />
                </Field>

                <Section title="Dimensions (mm)" />

                <Field label="Width (mm)" required>
                  <Input {...register("width", { required: true })} type="number" placeholder="1096" className="h-9 text-sm" />
                </Field>
                <Field label="Height (mm)" required>
                  <Input {...register("height", { required: true })} type="number" placeholder="2384" className="h-9 text-sm" />
                </Field>
                <Field label="Depth / thickness (mm)" required>
                  <Input {...register("length", { required: true })} type="number" placeholder="35" className="h-9 text-sm" />
                </Field>
              </>
            )}

            {/* ── TECHNICAL DATASHEET UPLOAD ── */}
            <Section title="Technical Datasheet" />
            <div className="col-span-2">
              <Field label="Product Datasheet (PDF/Image)" hint="Optional. Upload manufacturer technical datasheet to attach with proposals.">
                <div className="mt-1 flex items-center gap-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-4 transition-all hover:bg-zinc-50">
                  {uploadingFile ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 pl-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Uploading datasheet to secure cloud storage...</span>
                    </div>
                  ) : watchDataSheetUrl ? (
                    <div className="flex flex-1 items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">📄</span>
                        <div className="text-left">
                          <p className="text-xs font-semibold text-zinc-800 line-clamp-1">{watchDataSheetName || "datasheet.pdf"}</p>
                          <a href={watchDataSheetUrl} target="_blank" rel="noreferrer" className="text-[10px] font-medium text-primary hover:underline">View live datasheet</a>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-medium text-destructive hover:bg-destructive/5 hover:text-destructive shrink-0"
                        onClick={() => {
                          setValue("dataSheetUrl", "");
                          setValue("dataSheetName", "");
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <label className="flex w-full cursor-pointer flex-col items-center justify-center py-3">
                      <div className="flex flex-col items-center justify-center space-y-1 text-center">
                        <span className="text-2xl">📤</span>
                        <p className="text-xs font-semibold text-zinc-700">Click to upload or drag & drop</p>
                        <p className="text-[10px] text-zinc-400">PDF, JPG, PNG up to 10MB</p>
                      </div>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  )}
                </div>
              </Field>
            </div>

          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}