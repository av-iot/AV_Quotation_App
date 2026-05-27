"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Receipt, LayoutDashboard, Settings,
  Sun, ChevronLeft, ChevronRight, Moon, LogOut,
  Bell, Package, Activity, Wrench, FolderOpen,
  Users, ShieldCheck, Menu, Layers,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import LanguageToggle from "@/components/LanguageToggle";
import {
  hasPermission, ROLE_LABELS, ROLE_GRADIENT, ROLE_CHIPS, type Permission,
} from "@/lib/permissions";
import type { UserRole } from "@/types";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const ALL_NAV = [
  { href: "/",          icon: LayoutDashboard, label: "Dashboard",          permission: "view:dashboard"      as Permission },
  { href: "/projects",  icon: FolderOpen,       label: "Projects",           permission: "view:projects"       as Permission },
  { href: "/proposals", icon: FileText,          label: "New Design",         permission: "view:proposals"      as Permission },
  { href: "/quotations",icon: Receipt,           label: "Invoices",           permission: "view:invoices"       as Permission },
  { href: "/installations", icon: Layers,       label: "Installation Sites", permission: "view:installations"  as Permission },
  { href: "/services",  icon: Wrench,            label: "Services",           permission: "view:services"       as Permission },
  { href: "/products",  icon: Package,           label: "Products",           permission: "view:products"       as Permission },
  { href: "/activity",  icon: Activity,          label: "Activity Logs",      permission: "view:activity"       as Permission },
  { href: "/users",     icon: Users,             label: "Users",              permission: "view:users"          as Permission },
  { href: "/settings",  icon: Settings,          label: "Settings",           permission: "view:settings"       as Permission },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoCollapseRef = useRef<NodeJS.Timeout | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
      setCollapsed(false);
      autoCollapseRef.current = setTimeout(() => setCollapsed(true), 5000);
    }
    return () => { if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current); };
  }, []);

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!collapsed && hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, [collapsed]);

  // Keep sidebar fully open while profile dropdown is open; clear all collapse timers
  useEffect(() => {
    if (isUserMenuOpen) {
      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
      if (autoCollapseRef.current) { clearTimeout(autoCollapseRef.current); autoCollapseRef.current = null; }
      setIsHovered(true);
    }
  }, [isUserMenuOpen]);
  const isExpanded = !collapsed || isHovered || isUserMenuOpen;

  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);
  const { user, loading, signOut } = useAuth();

  const navItems = useMemo(() => {
    if (!user) return [];
    return ALL_NAV.filter(item => hasPermission(user.role as UserRole, item.permission));
  }, [user]);

  const handleInteract = () => {
    setShowToggle(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowToggle(false), 5000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading || !user) {
      if (!loading && !user) router.push("/login");
      return;
    }

    const role = (user.role || "viewer") as UserRole;
    
    // Viewer is completely locked out of main routes
    if (role === "viewer" && !pathname.startsWith("/pending")) {
      router.replace("/pending");
      return;
    }

    // Check specific route permissions
    const routeGuards: { prefix: string; perm: Permission }[] = [
      { prefix: "/proposals", perm: "view:proposals" },
      { prefix: "/quotations", perm: "view:invoices" },
      { prefix: "/receipts", perm: "view:invoices" },
      { prefix: "/installations", perm: "view:installations" },
      { prefix: "/services", perm: "view:services" },
      { prefix: "/projects", perm: "view:projects" },
      { prefix: "/products", perm: "view:products" },
      { prefix: "/users", perm: "view:users" },
      { prefix: "/settings", perm: "view:settings" },
      { prefix: "/activity", perm: "view:activity" },
    ];

    for (const guard of routeGuards) {
      if (pathname.startsWith(guard.prefix) && !hasPermission(role, guard.perm)) {
        // Redirect to their default allowed route
        if (hasPermission(role, "view:dashboard")) router.replace("/");
        else if (hasPermission(role, "view:services")) router.replace("/services");
        else router.replace("/pending");
        return;
      }
    }

    // If they try to access Dashboard but don't have permission
    if (pathname === "/" && !hasPermission(role, "view:dashboard")) {
      if (hasPermission(role, "view:services")) {
        const checkAndRedirect = async () => {
          try {
            const plansRef = collection(db, "servicePlans");
            const q = query(
              plansRef, 
              where("status", "in", ["planned", "in_progress"])
            );
            const snap = await getDocs(q);
            
            const userName = (user.displayName || "").trim().toLowerCase();
            const userEmail = (user.email || "").trim().toLowerCase();
            const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD format
            
            let todayPlanId = null;
            let otherPlanId = null;
            
            for (const doc of snap.docs) {
              const plan = doc.data();
              const leader = (plan.teamLeader || "").trim().toLowerCase();
              const members = (plan.members || []).map((m: string) => (m || "").trim().toLowerCase());
              
              const isAssigned = 
                (leader && (leader === userName || leader === userEmail)) ||
                members.some((m: string) => m === userName || m === userEmail);
                
              if (isAssigned) {
                if (plan.date === todayStr) {
                  todayPlanId = doc.id;
                  break;
                } else if (!otherPlanId) {
                  otherPlanId = doc.id;
                }
              }
            }
            
            const targetId = todayPlanId || otherPlanId;
            if (targetId) {
              router.replace(`/services/route/${targetId}`);
            } else {
              router.replace("/services");
            }
          } catch (err) {
            console.error("Error finding route plan:", err);
            router.replace("/services");
          }
        };
        checkAndRedirect();
      } else {
        router.replace("/pending");
      }
      return;
    }
  }, [pathname, user, loading, router]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background overflow-hidden">
        {/* Ambient glow */}
        <motion.div
          className="absolute h-96 w-96 rounded-full bg-amber-400/10 blur-3xl pointer-events-none"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative flex flex-col items-center gap-8">
          {/* Logo ring + icon */}
          <div className="relative flex items-center justify-center">
            {/* Outer pulse ring */}
            <motion.div
              className="absolute h-28 w-28 rounded-full border border-amber-400/30"
              animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
            {/* Inner ring */}
            <motion.div
              className="absolute h-20 w-20 rounded-full border border-amber-400/50"
              animate={{ scale: [1, 1.4], opacity: [0.8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
            />
            {/* Icon container */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
              className="relative h-16 w-16 rounded-2xl bg-white shadow-xl shadow-black/10 flex items-center justify-center"
            >
              <Image src="/icon.png" alt="Alta Vision" width={40} height={40} className="object-contain" priority />
            </motion.div>
          </div>

          {/* Brand + subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="text-center space-y-1"
          >
            <p className="text-lg font-black tracking-tight text-foreground">Alta Vision Solar</p>
            <p className="text-xs text-muted-foreground tracking-widest uppercase font-medium">Management System</p>
          </motion.div>

          {/* Animated progress dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-1.5"
          >
            {[0, 1, 2, 3].map(i => (
              <motion.div
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-amber-500"
                animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
              />
            ))}
          </motion.div>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const role = (user.role || "viewer") as UserRole;
  const roleGradient = ROLE_GRADIENT[role] || ROLE_GRADIENT.viewer;
  const roleLabel = ROLE_LABELS[role] || "Viewer";
  const chips = ROLE_CHIPS[role] || ["View Only"];

  const sidebarW = isExpanded ? 240 : 68;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background print:h-auto print:overflow-visible print:bg-white">
      {/* ── Mobile strip (icon + menu trigger) ──────────────────────── */}
      <div className="flex md:hidden flex-col items-center pt-3 pb-4 gap-3 border-r bg-card w-14 shrink-0 z-20 print:hidden">
        <Image src="/icon.png" alt="Alta Vision" width={36} height={36} className="object-contain" priority />
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-muted hover:bg-accent text-muted-foreground hover:text-foreground active:scale-95 transition-all duration-150"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden print:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              key="mobile-drawer"
              initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[240px] flex flex-col bg-card border-r shadow-2xl md:hidden print:hidden"
            >
              {/* Drawer logo */}
              <div className="flex h-16 items-center border-b px-4 shrink-0">
                <Image src="/logo.png" alt="Alta Vision" width={160} height={27} className="object-contain" priority />
              </div>

              {/* Drawer nav */}
              <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                {navItems.map(({ href, icon: Icon, label }) => {
                  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn("sidebar-link px-3", isActive && "active")}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} />
                      <span className="flex-1 truncate text-sm">{label}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Drawer user area */}
              <div className="border-t p-3 space-y-1 shrink-0">
                <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={user?.photoURL || undefined} referrerPolicy="no-referrer" />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{user?.displayName || "User"}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-accent transition-colors"
                >
                  <Sun className={`h-4 w-4 text-amber-500 ${themeMounted && theme === "dark" ? "" : "hidden"}`} />
                  <Moon className={`h-4 w-4 text-blue-500 ${themeMounted && theme === "dark" ? "hidden" : ""}`} />
                  <span suppressHydrationWarning>{themeMounted && theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                </button>
                <button
                  onClick={() => { signOut(); setMobileOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: sidebarW }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative hidden md:flex flex-col border-r bg-card z-20 print:hidden"
        onMouseEnter={() => {
          if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
          setIsHovered(true);
          handleInteract();
        }}
        onMouseLeave={() => {
          if (isUserMenuOpen) return; // keep open while profile dropdown is active
          handleInteract();
          if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
          hoverTimerRef.current = setTimeout(() => { setIsHovered(false); hoverTimerRef.current = null; }, 400);
        }}
        onMouseMove={handleInteract}
      >
        {/* Floating Toggle Button */}
        <AnimatePresence>
          {showToggle && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}
              className="absolute -right-3.5 top-[18px] z-50 hidden md:flex"
            >
              <Button
                variant="outline" size="icon"
                className="h-7 w-7 rounded-full bg-background shadow-sm shrink-0"
                onClick={() => {
                  setCollapsed((c) => {
                    const next = !c;
                    if (next) {
                      setIsHovered(false);
                      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
                    }
                    return next;
                  });
                }}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logo */}
        <div className={cn("flex h-16 items-center border-b", !isExpanded ? "justify-center px-2" : "px-4")}>
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}
                className="flex items-center overflow-hidden"
              >
                <Image src="/logo.png" alt="Alta Vision" width={170} height={27} className="object-contain" priority />
              </motion.div>
            )}
          </AnimatePresence>
          {!isExpanded && (
            <div className="flex w-full items-center justify-center">
              <Image src="/icon.png" alt="Alta Vision" width={36} height={36} className="object-contain" priority />
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn("sidebar-link", isActive && "active", !isExpanded ? "justify-center px-0" : "px-3")}
                title={!isExpanded ? label : undefined}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} />
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.18 }}
                      className="flex-1 truncate text-sm"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* User area */}
        <div className="border-t p-3">
          <DropdownMenu open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center rounded-lg p-2 transition-colors duration-150 hover:bg-accent",
                  !isExpanded ? "justify-center" : "gap-2.5 text-left"
                )}
              >
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={user?.photoURL || undefined} referrerPolicy="no-referrer" />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }} className="min-w-0 flex-1"
                    >
                      <p className="truncate text-xs font-medium">{user?.displayName || "User"}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </DropdownMenuTrigger>

            {/* ── Redesigned profile popup ── */}
            <DropdownMenuContent
              align={!isExpanded ? "center" : "end"}
              side="right"
              sideOffset={12}
              className="w-72 p-0 rounded-2xl shadow-2xl border-0 overflow-hidden"
            >
              {/* Gradient header */}
              <div className={cn("p-4 text-white", roleGradient)}>
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 border-2 border-white/30 shadow-lg shrink-0">
                    <AvatarImage src={user?.photoURL || undefined} referrerPolicy="no-referrer" />
                    <AvatarFallback className="bg-white/20 text-white text-lg font-black">
                      {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white leading-tight">
                      {user?.displayName || "User"}
                    </p>
                    <p className="truncate text-[10px] text-white/65 mt-0.5">{user?.email}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <ShieldCheck className="h-3 w-3 text-white/70 shrink-0" />
                      <span className="text-[10px] font-black text-white/90 uppercase tracking-widest">
                        {roleLabel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Permission chips */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {chips.map((chip) => (
                    <span
                      key={chip}
                      className="text-[10px] bg-white/15 text-white/90 px-2 py-0.5 rounded-full font-semibold border border-white/20 backdrop-blur-sm"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="p-2.5 space-y-1 bg-card">
                <div className="px-1 py-0.5">
                  <LanguageToggle />
                </div>

                <DropdownMenuItem
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="rounded-xl py-2 cursor-pointer text-xs font-semibold text-foreground hover:bg-accent transition-all flex items-center gap-2"
                >
                  <Sun className={`h-4 w-4 text-amber-500 ${themeMounted && theme === "dark" ? "" : "hidden"}`} />
                  <Moon className={`h-4 w-4 text-blue-500 ${themeMounted && theme === "dark" ? "hidden" : ""}`} />
                  <span suppressHydrationWarning>{themeMounted && theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1" />

                <DropdownMenuItem
                  onClick={signOut}
                  className="rounded-xl py-2.5 cursor-pointer text-xs font-bold text-destructive hover:bg-destructive/15 hover:text-destructive focus:bg-destructive/15 focus:text-destructive active:scale-[0.98] transition-all duration-150 flex items-center gap-2 group border border-transparent hover:border-destructive/20"
                >
                  <LogOut className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                  Sign Out
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="flex h-16 items-center justify-between border-b bg-card px-6 print:hidden">
          <h2 className="text-sm font-semibold text-muted-foreground capitalize">
            {pathname === "/" ? "Dashboard" : pathname.slice(1).split("/")
              .map(s => s === "quotations" ? "invoices" : s)
              .filter(s => !(s.length >= 15 && /^[a-zA-Z0-9]+$/.test(s)))
              .join(" / ")}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </header>

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
