"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LanguageToggle({ className }: { className?: string }) {
  const [currentLang, setCurrentLang] = useState<"en" | "si" | "ta">("en");

  useEffect(() => {
    const getLangFromCookie = () => {
      const match = document.cookie.match(/googtrans=([^;]+)/);
      if (match) {
        const val = decodeURIComponent(match[1]);
        if (val.endsWith("/si")) return "si";
        if (val.endsWith("/ta")) return "ta";
      }
      return "en";
    };
    setCurrentLang(getLangFromCookie());
  }, []);

  const changeLanguage = (lang: "en" | "si" | "ta") => {
    const value = lang === "en" ? "/en/en" : `/en/${lang}`;
    
    // Set cookies for current path and domains
    document.cookie = `googtrans=${value}; path=/`;
    document.cookie = `googtrans=${value}; path=/; domain=${window.location.hostname}`;
    
    const parts = window.location.hostname.split('.');
    if (parts.length > 2) {
      const mainDomain = parts.slice(-2).join('.');
      document.cookie = `googtrans=${value}; path=/; domain=.${mainDomain}`;
    }

    setCurrentLang(lang);
    window.location.reload();
  };

  return (
    <div className={cn("flex items-center gap-1 p-0.5 rounded-lg bg-muted border border-border/50 w-full", className)}>
      <div className="flex items-center gap-1.5 px-2 text-muted-foreground notranslate">
        <Globe className="h-3.5 w-3.5" />
      </div>
      <button
        type="button"
        onClick={() => changeLanguage("en")}
        className={cn(
          "flex-1 text-center py-1 rounded-md text-[10px] sm:text-[11px] font-semibold transition-all notranslate",
          currentLang === "en"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => changeLanguage("si")}
        className={cn(
          "flex-1 text-center py-1 rounded-md text-[10px] sm:text-[11px] font-semibold transition-all notranslate",
          currentLang === "si"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        සිංහල
      </button>
      <button
        type="button"
        onClick={() => changeLanguage("ta")}
        className={cn(
          "flex-1 text-center py-1 rounded-md text-[10px] sm:text-[11px] font-semibold transition-all notranslate",
          currentLang === "ta"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        தமிழ்
      </button>
    </div>
  );
}
