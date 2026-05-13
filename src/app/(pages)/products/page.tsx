"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import type { Product, ProductType, InverterProduct, BatteryProduct, PanelProduct } from "@/types";
import ProductFormDialog from "@/components/products/ProductFormDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreVertical, Pencil, Trash2, Loader2, Zap, Battery, Sun, Power } from "lucide-react";

const fmtRs = (n: number) => n ? "Rs. " + Number(n).toLocaleString("en-US") : "—";

export default function ProductsPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<ProductType>("inverter");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("brand"));
    return onSnapshot(q, (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product));
      setLoading(false);
    });
  }, []);

  const filtered = products.filter(
    (p) => p.type === activeTab &&
      (p.brand?.toLowerCase().includes(search.toLowerCase()) ||
        p.model?.toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setDialogOpen(true); };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    setDeleting(id);
    try {
      await deleteDoc(doc(db, "products", id));
      toast({ title: "Product deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (p: Product) => {
    await updateDoc(doc(db, "products", p.id), { active: !p.active });
  };

  const counts = {
    inverter: products.filter((p) => p.type === "inverter").length,
    battery: products.filter((p) => p.type === "battery").length,
    panel: products.filter((p) => p.type === "panel").length,
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Power className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Product Catalog</h1>
            <p className="text-sm text-muted-foreground">Manage inverters, batteries and panels</p>
          </div>
        </div>
        <Button onClick={openAdd} className="gap-2 bg-primary hover:bg-primary/90">
  <Plus className="h-4 w-4" />
  Add product
</Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProductType)}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <TabsList>
            {[
              { value: "inverter", label: "Inverters", icon: <Zap className="h-4 w-4" /> },
              { value: "battery",  label: "Batteries", icon: <Battery className="h-4 w-4" /> },
              { value: "panel",    label: "Panels",    icon: <Sun className="h-4 w-4" /> },
            ].map(({ value, label, icon }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                {icon}{label}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {counts[value as ProductType]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Search brand / model…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {(["inverter", "battery", "panel"] as ProductType[]).map((tabVal) => (
          <TabsContent key={tabVal} value={tabVal}>
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-3">
                    <p className="text-sm text-muted-foreground">{search ? "No results." : `No ${tabVal}s added yet.`}</p>
                    <Button size="sm" onClick={openAdd} className="gap-2"><Plus className="h-3.5 w-3.5" />Add first {tabVal}</Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Brand</TableHead>
                        <TableHead className="text-xs">Model</TableHead>
                        {tabVal === "inverter" && (<><TableHead className="text-xs">Type</TableHead><TableHead className="text-xs">Phase</TableHead><TableHead className="text-xs">Rated power</TableHead><TableHead className="text-xs">MPPT</TableHead></>)}
                        {tabVal === "battery" && (<><TableHead className="text-xs">Usable energy</TableHead><TableHead className="text-xs">Cell type</TableHead><TableHead className="text-xs">Voltage</TableHead><TableHead className="text-xs">Cycles</TableHead></>)}
                        {tabVal === "panel" && (<><TableHead className="text-xs">Output</TableHead><TableHead className="text-xs">Type</TableHead><TableHead className="text-xs">Efficiency</TableHead><TableHead className="text-xs">Size (mm)</TableHead></>)}
                        <TableHead className="text-xs text-right">Buy / Sell</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {filtered.map((p, i) => (
                          <motion.tr key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.03 }} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                            <TableCell className="py-3 text-sm font-medium">{p.brand}</TableCell>
                            <TableCell className="py-3 font-mono text-xs">{p.model}</TableCell>

                            {p.type === "inverter" && (<>
                              <TableCell className="py-3"><Badge variant="outline" className="text-xs capitalize">{(p as InverterProduct).inverter_type}</Badge></TableCell>
                              <TableCell className="py-3 text-xs text-muted-foreground">{(p as InverterProduct).phase_count}</TableCell>
                              <TableCell className="py-3 text-sm tabular-nums">{(p as InverterProduct).input_rated_power ? ((p as InverterProduct).input_rated_power / 1000).toFixed(1) + " kW" : "—"}</TableCell>
                              <TableCell className="py-3 text-sm text-center">{(p as InverterProduct).mppt_count || "—"}</TableCell>
                            </>)}

                            {p.type === "battery" && (<>
                              <TableCell className="py-3 text-sm tabular-nums">{(p as BatteryProduct).usable_energy} kWh</TableCell>
                              <TableCell className="py-3 text-xs text-muted-foreground">{(p as BatteryProduct).cell_type}</TableCell>
                              <TableCell className="py-3 text-xs text-muted-foreground">{(p as BatteryProduct).nominal_voltage}V</TableCell>
                              <TableCell className="py-3 text-sm tabular-nums">{(p as BatteryProduct).cycle_count?.toLocaleString()}</TableCell>
                            </>)}

                            {p.type === "panel" && (<>
                              <TableCell className="py-3 text-sm font-semibold tabular-nums">{(p as PanelProduct).max_panel_output_power}W</TableCell>
                              <TableCell className="py-3 text-xs text-muted-foreground">{(p as PanelProduct).panel_type}</TableCell>
                              <TableCell className="py-3 text-sm tabular-nums">{(p as PanelProduct).max_efficiency}%</TableCell>
                              <TableCell className="py-3 text-xs text-muted-foreground">{(p as PanelProduct).width} × {(p as PanelProduct).height}</TableCell>
                            </>)}

<TableCell className="py-3 text-right text-sm tabular-nums">
  <div className="flex flex-col items-end gap-0.5">
    <span className="text-xs text-muted-foreground">B: {fmtRs((p as any).buy_price)}</span>
    <span className="font-medium">S: {fmtRs((p as any).sell_price)}</span>
  </div>
</TableCell>                     <TableCell className="py-3">
                              <button onClick={() => handleToggleActive(p)}>
                                <Badge variant={p.active ? "default" : "secondary"} className="cursor-pointer text-xs">
                                  {p.active ? "Active" : "Inactive"}
                                </Badge>
                              </button>
                            </TableCell>
                            <TableCell className="py-3">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    {deleting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreVertical className="h-3.5 w-3.5" />}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDelete(p.id)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

<ProductFormDialog
  open={dialogOpen}
  onClose={() => setDialogOpen(false)}
  editing={editing}
/>    </div>
  );
}