"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps the app in next-themes. attribute="data-theme" drives the [data-theme]
 * selector in globals.css. We default to light (enableSystem off) so the map's
 * choropleth/borders read at full contrast on first load; the user's toggle
 * choice is persisted by next-themes. A blocking script prevents theme flash.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
