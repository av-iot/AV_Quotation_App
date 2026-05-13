"use client";

import { useFormContext } from "react-hook-form";
import type { ProposalFormData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const { register, formState: { errors } } = useFormContext<ProposalFormData>();

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

            {/* Full name */}
            <motion.div variants={fadeUp} className="sm:col-span-2">
              <FormItem>
                <FormLabel>Full name / company *</FormLabel>
                <FormControl>
                  <Input
                    {...register("custName", { required: "Name is required" })}
                    placeholder="Mr. K. W. Athukorala"
                  />
                </FormControl>
                {errors.custName && (
                  <FormMessage>{errors.custName.message}</FormMessage>
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
                    placeholder="17, 3rd Lane, Pitakotte, Colombo"
                    rows={2}
                    className="resize-none"
                  />
                </FormControl>
                {errors.addr && (
                  <FormMessage>{errors.addr.message}</FormMessage>
                )}
              </FormItem>
            </motion.div>

            {/* Phone 1 — required */}
            <motion.div variants={fadeUp}>
              <FormItem>
                <FormLabel>Phone number *</FormLabel>
                <FormControl>
                  <Input
                    {...register("phone", { required: "Phone number is required" })}
                    placeholder="077 208 3894"
                    type="tel"
                  />
                </FormControl>
                {errors.phone && (
                  <FormMessage>{errors.phone.message}</FormMessage>
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
                    {...register("phone2")}
                    placeholder="011 360 1100"
                    type="tel"
                  />
                </FormControl>
              </FormItem>
            </motion.div>

            {/* Email */}
            <motion.div variants={fadeUp} className="sm:col-span-2">
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input
                    {...register("email", {
                      pattern: {
                        value: /^[^@]+@[^@]+\.[^@]+$/,
                        message: "Invalid email address",
                      },
                    })}
                    type="email"
                    placeholder="client@email.com"
                  />
                </FormControl>
                {errors.email && (
                  <FormMessage>{errors.email.message}</FormMessage>
                )}
              </FormItem>
            </motion.div>

          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}