"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps the app in next-themes. attribute="data-theme" drives the [data-theme]
 * selector in tokens.css. Since TRI-145 the first load follows the OS setting
 * (a phone in dark mode gets the dark palette); the toggle still overrides and
 * next-themes persists the choice. A blocking script prevents theme flash.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
