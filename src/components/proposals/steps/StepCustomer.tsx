"use client";

import { useEffect } from "react";
import { useFormContext, Controller } from "react-hook-form";
import type { ProposalFormData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User } from "lucide-react";
import { motion } from "framer-motion";

const stagger = {
  animate: { transition: { staggerChildren: 0.05 } },
};
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

export default function StepCustomer({ onNext }: { onNext: () => void }) {
  const { register, watch, setValue, control, formState: { errors } } = useFormContext<ProposalFormData>();

  useEffect(() => {
    register("sendFormat", {
      validate: (val) => (val && val.length > 0) || "At least one sending format must be selected",
    });
  }, [register]);

  return (
    <motion.div variants={stagger} initial="initial" animate="animate">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" />
            Customer details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">

            {/* Title + Full name */}
            <motion.div variants={fadeUp} className="sm:col-span-2">
              <FormItem>
                <FormLabel>Full name / company *</FormLabel>
                {/* Unified bordered container with green left accent — matching Address field style */}
                <div className="flex items-stretch rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden border-l-[3px] border-l-emerald-500">
                  {/* Title / Salutation Select */}
                  <Controller
                    name="custSalutation"
                    control={control}
                    defaultValue=""
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger className="w-[100px] shrink-0 font-semibold border-0 border-r border-input rounded-none shadow-none focus:ring-0 focus:ring-offset-0 bg-muted/30 text-foreground">
                          <SelectValue placeholder="Title" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          <SelectItem value="Mr.">Mr.</SelectItem>
                          <SelectItem value="Miss.">Miss.</SelectItem>
                          <SelectItem value="Mrs.">Mrs.</SelectItem>
                          <SelectItem value="Ven.">Ven.</SelectItem>
                          <SelectItem value="Dr.">Dr.</SelectItem>
                          <SelectItem value="Hon.">Hon.</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {/* Full Name Input — borderless inside container */}
                  <Input
                    {...register("custName", { required: "Name is required" })}
                    placeholder="K. W. Athukorala"
                    className="flex-1 border-0 shadow-none rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                  />
                </div>
                {errors.custName && (
                  <p className="text-sm font-medium text-destructive mt-1.5">{errors.custName.message}</p>
                )}
              </FormItem>
            </motion.div>


            {/* Address — single textarea */}
            <motion.div variants={fadeUp} className="sm:col-span-2">
              <FormItem>
                <FormLabel>Address *</FormLabel>
                <FormControl>
                  <Textarea
                    {...register("addr", { required: "Address is required" })}
                    placeholder={"No. 17,\n3rd Lane,\nPitakotte,\nColombo"}
                    rows={4}
                    className="resize-none"
                  />
                </FormControl>
                {errors.addr && (
                  <p className="text-sm font-medium text-destructive mt-1.5">{errors.addr.message}</p>
                )}
              </FormItem>
            </motion.div>

            {/* Phone 1 — required */}
            <motion.div variants={fadeUp}>
              <FormItem>
                <FormLabel>Phone number (whatsapp if available) *</FormLabel>
                <FormControl>
                  <Input
                    {...register("phone", {
                      required: "Phone number is required",
                      validate: (val) => {
                        const clean = val.replace(/[\s\-\(\)]/g, "");
                        return (
                          /^(?:0|94|\+94)?\d{9}$/.test(clean) ||
                          "Invalid phone number (must be a 10-digit number like 0771234567)"
                        );
                      }
                    })}
                    placeholder="077 208 3894"
                    type="tel"
                  />
                </FormControl>
                {errors.phone && (
                  <p className="text-sm font-medium text-destructive mt-1.5">{errors.phone.message}</p>
                )}
              </FormItem>
            </motion.div>

            {/* Phone 2 — optional */}
            <motion.div variants={fadeUp}>
              <FormItem>
                <FormLabel>
                  Phone number 2{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...register("phone2", {
                      validate: (val) => {
                        if (!val) return true;
                        const clean = val.replace(/[\s\-\(\)]/g, "");
                        return (
                          /^(?:0|94|\+94)?\d{9}$/.test(clean) ||
                          "Invalid phone number (must be a 10-digit number like 0113601100)"
                        );
                      }
                    })}
                    placeholder="011 360 1100"
                    type="tel"
                  />
                </FormControl>
                {errors.phone2 && (
                  <p className="text-sm font-medium text-destructive mt-1.5">{errors.phone2.message}</p>
                )}
              </FormItem>
            </motion.div>

            {/* Email */}
            <motion.div variants={fadeUp} className="sm:col-span-2">
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input
                    {...register("email", {
                      validate: (val) => !val || /^[^@]+@[^@]+\.[^@]+$/.test(val) || "Invalid email address"
                    })}
                    type="email"
                    placeholder="client@email.com"
                  />
                </FormControl>
                {errors.email && (
                  <p className="text-sm font-medium text-destructive mt-1.5">{errors.email.message}</p>
                )}
              </FormItem>
            </motion.div>

            {/* Quotation sending format */}
            <motion.div variants={fadeUp} className="sm:col-span-2 pt-2">
              <FormLabel className="text-sm font-semibold mb-3 block">Quotation sending format</FormLabel>
              <div className="flex flex-wrap gap-4">
                {[
                  { id: "email", label: "Email" },
                  { id: "whatsapp", label: "WhatsApp" },
                  { id: "print", label: "Print (Mail)" },
                ].map((format) => (
                  <div key={format.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`format-${format.id}`}
                      checked={(watch("sendFormat") || []).includes(format.id)}
                      onCheckedChange={(checked) => {
                        const current = watch("sendFormat") || [];
                        let nextVal;
                        if (checked) {
                          nextVal = [...current, format.id];
                        } else {
                          nextVal = current.filter((f) => f !== format.id);
                        }
                        setValue("sendFormat", nextVal, { shouldValidate: true });
                      }}
                    />
                    <label
                      htmlFor={`format-${format.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {format.label}
                    </label>
                  </div>
                ))}
              </div>
              {errors.sendFormat && (
                <p className="text-sm font-medium text-destructive mt-2">{errors.sendFormat.message}</p>
              )}
            </motion.div>

          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}