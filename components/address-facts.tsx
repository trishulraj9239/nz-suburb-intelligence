/**
 * TRI-150 — the "This property" panel lives in components/property/ (one file
 * per epistemic group over lib/property/{fetch,copy}.ts). This module keeps
 * the import path and the `AddressFacts` name every caller and verify script
 * uses.
 */
export { PropertyPanel as AddressFacts } from "./property/property-panel";
export type { SuburbStats } from "@/lib/property/fetch";
