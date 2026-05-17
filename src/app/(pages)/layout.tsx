"use client";

import { useState, useRef, useEffect } from "react";
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
          {NAV_ITEMS.map(({ href, icon: Icon, label, badge }) => {
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
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Moon className="mr-2 h-4 w-4" />
                )}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
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
