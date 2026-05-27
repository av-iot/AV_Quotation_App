"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Loader2, MapPin, User, Zap, Battery, Sun, Save, AlertTriangle, Check
} from "lucide-react";
import Link from "next/link";

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  confirmed:             { label: "Confirmed",           color: "text-blue-600 bg-blue-50 border-blue-250 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30" },
  installation:          { label: "Installation",        color: "text-purple-600 bg-purple-50 border-purple-250 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30" },
  installation_complete: { label: "Installed",           color: "text-indigo-600 bg-indigo-50 border-indigo-250 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30" },
  commissioned:          { label: "Commissioned",        color: "text-emerald-600 bg-emerald-50 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30" },
  monitoring:            { label: "Monitoring",          color: "text-cyan-600 bg-cyan-50 border-cyan-250 dark:bg-cyan-950/20 dark:text-cyan-400 dark:border-cyan-900/30" },
  legacy:                { label: "In Operation",        color: "text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800/30" },
};

interface Project {
  id: string;
  projectNo: string;
  siteNo: string;
  customer: { name: string; address: string; phone: string };
  solarCapacity: number;
  systemType: string;
  stage: string;
  engineer?: string;
}

interface InstallationData {
  panels: Array<{ model: string; qty: string; serialNos: string }>;
  inverters: Array<{ brand: string; model: string; qty: string; serialNos: string }>;
  batteries: Array<{ brand: string; model: string; qty: string; serialNos: string }>;
  location: { lat: string; lng: string; address: string };
  wifi: { ssid: string; password: string };
  photos: Record<string, Array<{ url: string; name: string }>>;
  notes: string;
  commissioning?: {
    gridVoltage: string;
    gridFrequency: string;
    systemOutput: string;
    meterReading: string;
    netMeteringRef: string;
    testDate: string;
    remarks: string;
    photos: Record<string, Array<{ url: string; name: string }>>;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export default function InstallationDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [installation, setInstallation] = useState<InstallationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("installation");

  // Form state
  const [panels, setPanels] = useState<InstallationData["panels"]>([{ model: "", qty: "", serialNos: "" }]);
  const [inverters, setInverters] = useState<InstallationData["inverters"]>([{ brand: "", model: "", qty: "", serialNos: "" }]);
  const [batteries, setBatteries] = useState<InstallationData["batteries"]>([]);
  const [location, setLocation] = useState({ lat: "", lng: "", address: "" });
  const [wifi, setWifi] = useState({ ssid: "", password: "" });
  const [notes, setNotes] = useState("");
  const [commissioning, setCommissioning] = useState({
    gridVoltage: "", gridFrequency: "", systemOutput: "",
    meterReading: "", netMeteringRef: "", testDate: "", remarks: ""
  });

  // Fetch project and installation data
  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const projSnap = await getDoc(doc(db, "projects", id));
        if (projSnap.exists()) {
          setProject(projSnap.data() as Project);
        }

        // Subscribe to installation data
        const instUnsub = onSnapshot(doc(db, "installations", id), (snap) => {
          if (snap.exists()) {
            const data = snap.data() as InstallationData;
            setInstallation(data);
            setPanels(data.panels || [{ model: "", qty: "", serialNos: "" }]);
            setInverters(data.inverters || [{ brand: "", model: "", qty: "", serialNos: "" }]);
            setBatteries(data.batteries || []);
            setLocation(data.location || { lat: "", lng: "", address: "" });
            setWifi(data.wifi || { ssid: "", password: "" });
            setNotes(data.notes || "");
            if (data.commissioning) {
              setCommissioning(data.commissioning);
            }
          }
          setLoading(false);
        });

        return instUnsub;
      } catch (err) {
        console.error("Error fetching data:", err);
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const isLocked = project?.stage === "commissioned";
  const canEdit = !isLocked && (user?.role && ["superadmin", "admin", "authorized", "engineer", "site_engineer"].includes(user.role));

  const handleSaveInstallation = async () => {
    if (!id || !project) return;

    setSaving(true);
    try {
      await setDoc(doc(db, "installations", id), {
        panels: panels.filter(p => p.model || p.serialNos),
        inverters: inverters.filter(i => i.model || i.serialNos),
        batteries: batteries.filter(b => b.model || b.serialNos),
        location,
        wifi,
        notes,
        commissioning,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      });
      toast({ title: "Saved", description: "Installation sheet updated successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCaptureGPS = async () => {
    if (!navigator.geolocation) {
      toast({ title: "Error", description: "Geolocation not supported", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(l => ({
          ...l,
          lat: pos.coords.latitude.toString(),
          lng: pos.coords.longitude.toString(),
        }));
      },
      (err) => toast({ title: "Error", description: err.message, variant: "destructive" })
    );
  };

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!project) {
    return <div className="p-6"><p className="text-muted-foreground">Site not found</p></div>;
  }

  const stageCfg = STAGE_CONFIG[project.stage] || { label: project.stage, color: "" };

  return (
    <div className="p-6 mx-auto max-w-4xl">
      {/* Back button */}
      <Button variant="ghost" className="mb-6 gap-2" asChild>
        <Link href="/installations">
          <ArrowLeft className="h-4 w-4" />
          Back to Installations
        </Link>
      </Button>

      {/* Project Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-2xl">Site #{project.siteNo || project.projectNo}</CardTitle>
              <p className="text-muted-foreground mt-1">{project.customer.name}</p>
            </div>
            <Badge className={stageCfg.color}>
              {stageCfg.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Capacity</span>
            <p className="font-semibold">{project.solarCapacity}kW</p>
          </div>
          <div>
            <span className="text-muted-foreground">System Type</span>
            <p className="font-semibold">{project.systemType || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Location</span>
            <p className="font-semibold truncate">{project.customer.address}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Engineer</span>
            <p className="font-semibold">{project.engineer || "—"}</p>
          </div>
        </CardContent>
      </Card>

      {isLocked && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold">Site Commissioned</p>
            <p>This site is now locked for editing. To make changes, the project stage must be reverted.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="installation">Installation Sheet</TabsTrigger>
          <TabsTrigger value="commissioning">Commissioning Sheet</TabsTrigger>
        </TabsList>

        {/* Installation Sheet Tab */}
        <TabsContent value="installation" className="space-y-6">
          {/* Panels */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-yellow-500" />
                Solar Panels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {panels.map((panel, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Model</Label>
                    <Input
                      placeholder="e.g. Bifacial 450W"
                      value={panel.model}
                      onChange={(e) => setPanels(p => [...p.slice(0, i), { ...panel, model: e.target.value }, ...p.slice(i + 1)])}
                      disabled={isLocked}
                    />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" value={panel.qty} onChange={(e) => setPanels(p => [...p.slice(0, i), { ...panel, qty: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Serial Numbers</Label>
                    <Input placeholder="SN1, SN2, ..." value={panel.serialNos} onChange={(e) => setPanels(p => [...p.slice(0, i), { ...panel, serialNos: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => setPanels(p => p.filter((_, j) => j !== i))}>×</Button>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setPanels(p => [...p, { model: "", qty: "", serialNos: "" }])}>
                  + Add Panel Line
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Inverters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                Inverters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {inverters.map((inv, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Brand</Label>
                    <Input placeholder="e.g. Sungrow" value={inv.brand} onChange={(e) => setInverters(p => [...p.slice(0, i), { ...inv, brand: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Model</Label>
                    <Input placeholder="e.g. SG8K" value={inv.model} onChange={(e) => setInverters(p => [...p.slice(0, i), { ...inv, model: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" value={inv.qty} onChange={(e) => setInverters(p => [...p.slice(0, i), { ...inv, qty: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Serial Numbers</Label>
                    <Input placeholder="SN..." value={inv.serialNos} onChange={(e) => setInverters(p => [...p.slice(0, i), { ...inv, serialNos: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => setInverters(p => p.filter((_, j) => j !== i))}>×</Button>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setInverters(p => [...p, { brand: "", model: "", qty: "", serialNos: "" }])}>
                  + Add Inverter
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Batteries */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Battery className="h-5 w-5 text-green-500" />
                Batteries
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {batteries.map((bat, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Brand</Label>
                    <Input placeholder="e.g. CATL" value={bat.brand} onChange={(e) => setBatteries(p => [...p.slice(0, i), { ...bat, brand: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Model</Label>
                    <Input placeholder="e.g. LFP 10kWh" value={bat.model} onChange={(e) => setBatteries(p => [...p.slice(0, i), { ...bat, model: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" value={bat.qty} onChange={(e) => setBatteries(p => [...p.slice(0, i), { ...bat, qty: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Serial Numbers</Label>
                    <Input placeholder="SN..." value={bat.serialNos} onChange={(e) => setBatteries(p => [...p.slice(0, i), { ...bat, serialNos: e.target.value }, ...p.slice(i + 1)])} disabled={isLocked} />
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => setBatteries(p => p.filter((_, j) => j !== i))}>×</Button>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setBatteries(p => [...p, { brand: "", model: "", qty: "", serialNos: "" }])}>
                  + Add Battery
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-red-500" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Latitude</Label>
                  <Input type="number" step="0.00001" placeholder="e.g. 6.9271" value={location.lat} onChange={(e) => setLocation(l => ({ ...l, lat: e.target.value }))} disabled={isLocked} />
                </div>
                <div>
                  <Label className="text-xs">Longitude</Label>
                  <Input type="number" step="0.00001" placeholder="e.g. 80.7789" value={location.lng} onChange={(e) => setLocation(l => ({ ...l, lng: e.target.value }))} disabled={isLocked} />
                </div>
              </div>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={handleCaptureGPS} className="w-full">
                  📍 Capture GPS
                </Button>
              )}
              <div>
                <Label className="text-xs">Address</Label>
                <Input value={location.address} onChange={(e) => setLocation(l => ({ ...l, address: e.target.value }))} disabled={isLocked} placeholder={project.customer.address} />
              </div>
            </CardContent>
          </Card>

          {/* WiFi */}
          <Card>
            <CardHeader>
              <CardTitle>WiFi Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">SSID / Network Name</Label>
                <Input value={wifi.ssid} onChange={(e) => setWifi(w => ({ ...w, ssid: e.target.value }))} disabled={isLocked} placeholder="Network name" />
              </div>
              <div>
                <Label className="text-xs">Password</Label>
                <Input type="password" value={wifi.password} onChange={(e) => setWifi(w => ({ ...w, password: e.target.value }))} disabled={isLocked} placeholder="WiFi password" />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Engineer Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isLocked} placeholder="Any remarks or issues..." className="min-h-24" />
            </CardContent>
          </Card>

          {canEdit && (
            <Button onClick={handleSaveInstallation} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Installation Sheet
            </Button>
          )}
        </TabsContent>

        {/* Commissioning Sheet Tab */}
        <TabsContent value="commissioning" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Grid & System Parameters</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Grid Voltage (V)</Label>
                <Input type="number" value={commissioning.gridVoltage} onChange={(e) => setCommissioning(c => ({ ...c, gridVoltage: e.target.value }))} disabled={isLocked} placeholder="230" />
              </div>
              <div>
                <Label className="text-xs">Grid Frequency (Hz)</Label>
                <Input type="number" step="0.01" value={commissioning.gridFrequency} onChange={(e) => setCommissioning(c => ({ ...c, gridFrequency: e.target.value }))} disabled={isLocked} placeholder="50" />
              </div>
              <div>
                <Label className="text-xs">System Output (kW)</Label>
                <Input type="number" step="0.1" value={commissioning.systemOutput} onChange={(e) => setCommissioning(c => ({ ...c, systemOutput: e.target.value }))} disabled={isLocked} placeholder={project.solarCapacity.toString()} />
              </div>
              <div>
                <Label className="text-xs">Test Date</Label>
                <Input type="date" value={commissioning.testDate} onChange={(e) => setCommissioning(c => ({ ...c, testDate: e.target.value }))} disabled={isLocked} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Meter & Net Metering</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Meter Reading (kWh)</Label>
                <Input value={commissioning.meterReading} onChange={(e) => setCommissioning(c => ({ ...c, meterReading: e.target.value }))} disabled={isLocked} placeholder="Initial meter reading" />
              </div>
              <div>
                <Label className="text-xs">Net Metering Reference</Label>
                <Input value={commissioning.netMeteringRef} onChange={(e) => setCommissioning(c => ({ ...c, netMeteringRef: e.target.value }))} disabled={isLocked} placeholder="e.g. Certificate no." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Remarks</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea value={commissioning.remarks} onChange={(e) => setCommissioning(c => ({ ...c, remarks: e.target.value }))} disabled={isLocked} placeholder="Any issues or notes..." className="min-h-24" />
            </CardContent>
          </Card>

          {canEdit && (
            <Button onClick={handleSaveInstallation} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Commissioning Sheet
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
