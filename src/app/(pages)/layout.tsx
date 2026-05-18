"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Receipt, LayoutDashboard, Settings,
  Sun, ChevronLeft, ChevronRight, Moon, LogOut,
  User, Bell, Package, Activity
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/proposals", icon: FileText, label: "Proposals", badge: null },
  { href: "/quotations", icon: Receipt, label: "Quotations", badge: null },
  { href: "/products",  icon: Package,          label: "Products" },
  { href: "/activity", icon: Activity, label: "Activity Logs" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoCollapseRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-collapse after 5 seconds on first load
  useEffect(() => {
    autoCollapseRef.current = setTimeout(() => {
      setCollapsed(true);
    }, 5000);
    return () => {
      if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
    };
  }, []);
  
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, loading, signOut } = useAuth();

  const navItems = useMemo(() => {
    const items = [
      { href: "/", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/proposals", icon: FileText, label: "Proposals", badge: null },
      { href: "/quotations", icon: Receipt, label: "Quotations", badge: null },
      { href: "/products",  icon: Package,          label: "Products" },
      { href: "/activity", icon: Activity, label: "Activity Logs" },
    ];
    if (user?.role === "superadmin") {
      items.push({ href: "/users", icon: User, label: "User Roles" });
    }
    items.push({ href: "/settings", icon: Settings, label: "Settings" });
    return items;
  }, [user]);

  const handleInteract = () => {
    setShowToggle(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowToggle(false);
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const sidebarW = collapsed ? 68 : 240;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background print:h-auto print:overflow-visible print:bg-white">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: sidebarW }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col border-r bg-card z-20 print:hidden"
        onMouseEnter={handleInteract}
        onMouseMove={handleInteract}
      >
        {/* Floating Toggle Button */}
        <AnimatePresence>
          {showToggle && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="absolute -right-3.5 top-[18px] z-50 hidden md:flex"
            >
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full bg-background shadow-sm shrink-0"
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logo area */}
        <div className={cn("flex h-16 items-center border-b", collapsed ? "justify-center px-2" : "px-4")}>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="flex items-center overflow-hidden"
              >
                <Image
                  src="/logo.png"
                  alt="Alta Vision"
                  width={170}
                  height={27}
                  className="object-contain"
                  priority
                />
              </motion.div>
            )}
          </AnimatePresence>
          {collapsed && (
            <div className="flex w-full items-center justify-center">
              <Image
                src="/icon.png"
                alt="Alta Vision"
                width={36}
                height={36}
                className="object-contain"
                priority
              />
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map(({ href, icon: Icon, label, badge }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn("sidebar-link", isActive && "active", collapsed ? "justify-center px-0" : "px-3")}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.18 }}
                      className="flex-1 truncate text-sm"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {badge && !collapsed && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">
                    {badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User area */}
        <div className="border-t p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center rounded-lg p-2 transition-colors duration-150 hover:bg-accent",
                  collapsed ? "justify-center" : "gap-2.5 text-left"
                )}
              >
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={user?.photoURL || undefined} referrerPolicy="no-referrer" />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-xs font-medium">{user?.displayName || "User"}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={collapsed ? "center" : "end"} className="w-72 p-4 rounded-2xl shadow-xl border bg-card text-card-foreground" side="right" sideOffset={12}>
              {/* Premium Header Block */}
              <div className="flex items-center gap-3 pb-3.5 border-b border-border">
                <Avatar className="h-12 w-12 border-2 border-primary/20 shadow-sm shrink-0">
                  <AvatarImage src={user?.photoURL || undefined} referrerPolicy="no-referrer" />
                  <AvatarFallback className="bg-primary/10 text-primary text-base font-bold">
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-grow">
                  <p className="truncate text-sm font-bold text-foreground leading-tight">{user?.displayName || "User"}</p>
                  <p className="truncate text-[10px] text-muted-foreground mt-0.5 mb-1.5">{user?.email}</p>
                  
                  {/* Dynamic Role Badge */}
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <Badge variant={
                      user?.role === "superadmin" ? "default" :
                      user?.role === "admin" ? "default" :
                      user?.role === "authorized" ? "secondary" : "outline"
                    } className="text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 h-auto">
                      {user?.role === "superadmin" ? "Super Admin" :
                       user?.role === "admin" ? "Admin" :
                       user?.role === "authorized" ? "Authorized" :
                       user?.role === "stakeholder" ? "Stakeholder" : "Viewer"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-semibold text-muted-foreground bg-muted/30 border-muted-foreground/10 px-1.5 py-0.5 h-auto capitalize">
                      {user?.source || "google"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Account Details & Diagnostic Stats */}
              <div className="py-3.5 space-y-3.5 border-b border-border">
                {/* Permissions Pipeline */}
                <div>
                  <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Security Context</span>
                  <div className="bg-muted/45 rounded-xl p-2.5 border border-border/40 text-[10.5px] leading-relaxed text-muted-foreground">
                    {user?.role === "superadmin" && "Full administrative permissions, global system configuration, role access pipeline settings, database structures."}
                    {user?.role === "admin" && "Administrative permissions, catalog modifications, inverter/panel product configurations."}
                    {user?.role === "authorized" && "Authorized user credentials. Full proposal and quotation creation, editing, conversion."}
                    {user?.role === "stakeholder" && "Financial stakeholder view. Read-only permissions with dashboard revenue metrics pipeline."}
                    {user?.role === "viewer" && "Default viewer permissions. Read-only catalog visibility, PDF viewing, downloads."}
                  </div>
                </div>

                {/* Technical Diagnostic details */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                  <div>
                    <span className="text-muted-foreground/80 block">Access Protocol</span>
                    <span className="font-bold text-foreground flex items-center gap-1 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      OAuth 2.0 SSL
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/80 block">Privilege Level</span>
                    <span className="font-bold text-foreground mt-0.5 block">
                      {user?.role === "superadmin" ? "Level 5 (Max)" :
                       user?.role === "admin" ? "Level 4" :
                       user?.role === "authorized" ? "Level 3" :
                       user?.role === "stakeholder" ? "Level 2" : "Level 1"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions / settings */}
              <div className="pt-2 space-y-1">
                <DropdownMenuItem 
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="rounded-lg py-2 cursor-pointer text-xs font-semibold text-foreground hover:bg-accent transition-all flex items-center"
                >
                  {theme === "dark" ? (
                    <Sun className="mr-2 h-4 w-4 text-amber-500 animate-spin-slow" />
                  ) : (
                    <Moon className="mr-2 h-4 w-4 text-blue-500" />
                  )}
                  {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                </DropdownMenuItem>

                {user?.role === "superadmin" && (
                  <DropdownMenuItem 
                    asChild 
                    className="rounded-lg py-2 cursor-pointer text-xs font-semibold text-foreground hover:bg-accent transition-all flex items-center"
                  >
                    <Link href="/users">
                      <Settings className="mr-2 h-4 w-4 text-zinc-500" />
                      Global Access Control
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="my-1.5" />
                
                <DropdownMenuItem 
                  onClick={signOut} 
                  className="rounded-lg py-2 cursor-pointer text-xs font-bold text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive transition-all flex items-center"
                >
                  <LogOut className="mr-2 h-4 w-4 shrink-0" />
                  Secure Sign Out
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b bg-card px-6 print:hidden">
          <h2 className="text-sm font-semibold text-muted-foreground capitalize">
            {pathname === "/" ? "Dashboard" : pathname.slice(1).split("/").join(" / ")}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page content with Framer Motion transitions */}
        <main className="flex-1 overflow-y-auto print:overflow-visible print:p-0">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
