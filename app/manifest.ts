import type { MetadataRoute } from "next";
import { TOKENS } from "@/lib/tokens";

/**
 * Web app manifest (TRI-145, Phase A) — lets the beta user pin the app to a
 * phone home screen and open it without browser chrome. Colours come from the
 * token file so the splash matches the canvas.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NZ Suburb Intelligence",
    short_name: "NZSI",
    description: "Natural-language suburb and address research over New Zealand open government data.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: TOKENS.color.light.canvas,
    theme_color: TOKENS.color.light.surface,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
