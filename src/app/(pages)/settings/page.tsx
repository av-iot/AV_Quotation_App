"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sliders, User, Mail, Phone, Briefcase, ShieldAlert,
  Save, Loader2, CheckCircle2, FileText
} from "lucide-react";

interface EngineerConfig {
  name: string;
  designation: string;
  phone: string;
  email: string;
}

interface SettingsState {
  engineer1: EngineerConfig;
  engineer2: EngineerConfig;
}

const DEFAULT_SETTINGS: SettingsState = {
  engineer1: {
    name: "Wikum Wijesinghe",
    designation: "B.Sc. Eng. (Hons), AMIESL",
    phone: "077 208 3894",
    email: "wikumw@altavision.lk"
  },
  engineer2: {
    name: "Oshada Ranawaka",
    designation: "B.Sc. Eng. (Hons), AMIESL",
    phone: "077 204 7891",
    email: "oshader@altavision.lk"
  }
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role && ["superadmin", "admin"].includes(user.role);

  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const docRef = doc(db, "settings", "engineers");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSettings(snap.data() as SettingsState);
        } else {
          // Initialize DB with defaults if it doesn't exist yet
          if (isAdmin) {
            await setDoc(docRef, DEFAULT_SETTINGS);
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        toast({
          title: "Load Error",
          description: "Could not retrieve engineer contact configurations.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, [user, isAdmin, toast]);

  const handleChange = (engineerKey: "engineer1" | "engineer2", field: keyof EngineerConfig, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [engineerKey]: {
        ...prev[engineerKey],
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: "Permission Denied",
        description: "Only administrators can modify system settings.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "settings", "engineers");
      await setDoc(docRef, settings);

      // Log this action client-side
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "SETTINGS_UPDATE_ENGINEERS", {
        updatedSettings: settings,
      });

      toast({
        title: "Settings Saved",
        description: "Engineer profile settings updated successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err.message || "An unexpected error occurred while saving.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground p-6">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mb-2" />
        <p className="text-sm font-semibold">Loading system settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      
      {/* Header Banner */}
      <div className="relative bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900 rounded-3xl p-8 text-white shadow-lg overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-white/5 rounded-bl-[200px] pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/10 px-3.5 py-1 rounded-full text-xs font-semibold tracking-wider uppercase border border-white/10 backdrop-blur-md">
              <Sliders className="h-3 w-3 text-emerald-300" /> Admin Settings Control
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">System Configurations</h1>
            <p className="text-emerald-100 text-sm max-w-2xl font-medium">
              Manage the default corporate Engineers, contact designations, numbers and official emails printed on the front profile of all customized client Quotation proposals.
            </p>
          </div>
          
          {isAdmin ? (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-white hover:bg-emerald-50 text-emerald-800 font-extrabold text-sm px-6 py-6 rounded-2xl shadow-md transition-all hover:scale-[1.02] flex items-center gap-2 border border-emerald-100"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {saving ? "Saving Changes..." : "Save Settings"}
            </Button>
          ) : (
            <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-200 border border-amber-500/30 px-5 py-3 rounded-2xl text-xs font-bold backdrop-blur-md">
              <ShieldAlert className="h-4 w-4 shrink-0" /> READ-ONLY MODE (Admin required to edit)
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Form on the left, Premium Live Preview on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Forms Block */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Engineer 1 Card */}
          <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 p-6 flex flex-row items-center gap-4">
              <div className="bg-emerald-500/10 p-3 rounded-xl"><User className="h-6 w-6 text-emerald-600" /></div>
              <div>
                <CardTitle className="text-lg font-black text-slate-800">Primary Engineer (Engineer 1)</CardTitle>
                <CardDescription className="text-xs mt-0.5">Primary engineer appearing on the first card of contact profile page.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><User className="h-3.5 w-3.5"/> Full Name</Label>
                  <Input
                    value={settings.engineer1.name}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer1", "name", e.target.value)}
                    placeholder="e.g. Wikum Wijesinghe"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5"/> Designation / Degrees</Label>
                  <Input
                    value={settings.engineer1.designation}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer1", "designation", e.target.value)}
                    placeholder="e.g. B.Sc. Eng. (Hons), AMIESL"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Phone className="h-3.5 w-3.5"/> Contact Phone</Label>
                  <Input
                    value={settings.engineer1.phone}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer1", "phone", e.target.value)}
                    placeholder="e.g. 077 208 3894"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Mail className="h-3.5 w-3.5"/> Direct Email</Label>
                  <Input
                    value={settings.engineer1.email}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer1", "email", e.target.value)}
                    placeholder="e.g. wikumw@altavision.lk"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Engineer 2 Card */}
          <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 p-6 flex flex-row items-center gap-4">
              <div className="bg-emerald-500/10 p-3 rounded-xl"><User className="h-6 w-6 text-emerald-600" /></div>
              <div>
                <CardTitle className="text-lg font-black text-slate-800">Secondary Engineer (Engineer 2)</CardTitle>
                <CardDescription className="text-xs mt-0.5">Secondary engineer appearing on the second card of contact profile page.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><User className="h-3.5 w-3.5"/> Full Name</Label>
                  <Input
                    value={settings.engineer2.name}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer2", "name", e.target.value)}
                    placeholder="e.g. Oshada Ranawaka"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5"/> Designation / Degrees</Label>
                  <Input
                    value={settings.engineer2.designation}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer2", "designation", e.target.value)}
                    placeholder="e.g. B.Sc. Eng. (Hons), AMIESL"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Phone className="h-3.5 w-3.5"/> Contact Phone</Label>
                  <Input
                    value={settings.engineer2.phone}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer2", "phone", e.target.value)}
                    placeholder="e.g. 077 204 7891"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Mail className="h-3.5 w-3.5"/> Direct Email</Label>
                  <Input
                    value={settings.engineer2.email}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer2", "email", e.target.value)}
                    placeholder="e.g. oshader@altavision.lk"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Live Preview Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-500" /> Page 2 Live Preview
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                <CheckCircle2 className="h-3 w-3 shrink-0" /> Dynamic Sync
              </span>
            </div>

            <div className="bg-slate-100 dark:bg-slate-950 p-6 rounded-3xl border border-slate-200/80 shadow-inner flex justify-center items-center overflow-hidden">
              
              {/* Scaled letterhead container mimicking Page 2 layout */}
              <div className="w-[380px] bg-white border border-slate-300 shadow-md p-6 flex flex-col space-y-5 rounded-2xl relative overflow-hidden select-none select-none pointer-events-none transform scale-95 transition-all">
                
                {/* Accent */}
                <div className="absolute top-0 right-0 w-[120px] h-[30px] bg-emerald-500/10 rounded-bl-[30px] flex items-center justify-end pr-3 pb-1">
                  <span className="text-[5px] font-bold text-emerald-800 tracking-wider uppercase">Alta Vision Solar</span>
                </div>

                <div className="flex flex-col items-center justify-center text-center mt-2">
                  <img src="/logo.png" alt="Alta Vision" className="h-6 object-contain mb-1" />
                  <p className="text-[6px] text-slate-400 font-bold uppercase mt-0.5">Business Reg: PV 90948</p>
                </div>

                {/* 3-Column Offices (Compact) */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-slate-50 border border-slate-200/60 rounded p-1.5 text-[5px] space-y-1">
                    <p className="font-extrabold text-emerald-700 uppercase">Reg. Office</p>
                    <p className="text-slate-500 leading-tight">42, Ruhunusiri Garden, Hakmana Road, Matara.</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded p-1.5 text-[5px] space-y-1">
                    <p className="font-extrabold text-emerald-700 uppercase">Main Office</p>
                    <p className="text-slate-500 leading-tight">No 23D, Sri Rathanapala Mawatha, Nupe, Matara.</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded p-1.5 text-[5px] space-y-1">
                    <p className="font-extrabold text-emerald-700 uppercase">Head Office</p>
                    <p className="text-slate-500 leading-tight">298A, Borella Road, Habarakada, Nupe.</p>
                  </div>
                </div>

                {/* Engineer Cards (Interactive Live Mirror!) */}
                <div className="space-y-2">
                  <p className="text-center font-bold text-slate-400 uppercase tracking-widest text-[5px]">Engineers / Contact Us</p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-2.5 relative overflow-hidden flex flex-col justify-between min-h-[65px]">
                      <div className="absolute top-0 left-0 w-full h-[1.5px] bg-emerald-500"></div>
                      <div>
                        <p className="font-black text-slate-800 text-[7px] truncate">{settings.engineer1.name || "Wikum Wijesinghe"}</p>
                        <p className="text-[5px] text-slate-400 font-bold uppercase truncate mt-0.5">{settings.engineer1.designation || "B.Sc. Eng. (Hons), AMIESL"}</p>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-100 text-[6px] text-slate-600 space-y-0.5 font-medium">
                        <p className="text-slate-800 truncate">📞 {settings.engineer1.phone || "077 208 3894"}</p>
                        <p className="text-slate-500 truncate">✉️ {settings.engineer1.email || "wikumw@altavision.lk"}</p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-2.5 relative overflow-hidden flex flex-col justify-between min-h-[65px]">
                      <div className="absolute top-0 left-0 w-full h-[1.5px] bg-emerald-500"></div>
                      <div>
                        <p className="font-black text-slate-800 text-[7px] truncate">{settings.engineer2.name || "Oshada Ranawaka"}</p>
                        <p className="text-[5px] text-slate-400 font-bold uppercase truncate mt-0.5">{settings.engineer2.designation || "B.Sc. Eng. (Hons), AMIESL"}</p>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-100 text-[6px] text-slate-600 space-y-0.5 font-medium">
                        <p className="text-slate-800 truncate">📞 {settings.engineer2.phone || "077 204 7891"}</p>
                        <p className="text-slate-500 truncate">✉️ {settings.engineer2.email || "oshader@altavision.lk"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer disclaimer (scaled preview) */}
                <div className="bg-slate-50 border border-slate-200/60 rounded p-2 text-[4.5px] text-slate-400 text-justify leading-tight">
                  No part of this publication may be reproduced or transmitted without prior written permission from Alta Vision (Pvt) Ltd.
                </div>

              </div>

            </div>

            <p className="text-xs text-slate-400 font-medium text-center mt-3">
              This preview matches the dynamic design, layout alignment, and typography of Page 2 of the printable client proposal.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
