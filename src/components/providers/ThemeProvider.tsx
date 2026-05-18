"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Suppress the React 19 / Next.js 16+ console.error warnings that trigger dev overlays
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const orig = console.error;
  console.error = (...args: any[]) => {
    if (typeof args[0] === "string") {
      // Filter next-themes script tag hydration warning
      if (args[0].includes("Encountered a script tag")) {
        return;
      }
      // Filter local dev missing Firebase API key error to prevent overlay crash
      if (args[0].includes("Firebase API Key is missing")) {
        return;
      }
    }
    orig.apply(console, args);
  };
}

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
