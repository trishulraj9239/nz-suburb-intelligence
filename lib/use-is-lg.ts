"use client";

import { useSyncExternalStore } from "react";

const LG_QUERY = "(min-width: 1024px)";

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * True at the Tailwind `lg` breakpoint and up.
 *
 * The server snapshot is `false` (mobile-first), which doubles as the hydration
 * guard — no useMounted, no setState-in-effect (that lint rule has bitten this
 * codebase repeatedly). Extracted from context-panel in TRI-83 because the
 * answer frames now use it too: exactly ONE answer frame is mounted at a time
 * (desktop strip vs mobile sheet tab), never both behind `hidden lg:block`,
 * which would duplicate effects and ARIA live regions.
 */
export const useIsLg = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia(LG_QUERY).matches, () => false);
