"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps the app in next-themes. attribute="data-theme" drives the [data-theme]
 * selector in globals.css; enableSystem + defaultTheme="system" respect the OS
 * prefers-color-scheme on first load; the choice is persisted by next-themes
 * (no localStorage hacks of our own). A blocking script prevents theme flash.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
