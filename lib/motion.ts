/**
 * TRI-100 — honour prefers-reduced-motion on every map animation. The CSS
 * side is covered by `motion-reduce:` utilities; this is the JS side for
 * MapLibre's flyTo / fitBounds durations.
 */
export function motionMs(ms: number): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return ms;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}
