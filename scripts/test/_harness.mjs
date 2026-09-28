/**
 * TRI-151 / TRI-143 — one harness for every verify script.
 *
 *   NZSI_BASE_URL   where the app is (default http://localhost:3000; CI passes
 *                   the Vercel preview URL)
 *   PW_CHANNEL      browser channel for playwright-core. Default "msedge"
 *                   (the local machine); set it EMPTY in CI to use the
 *                   Chromium that `npx playwright install chromium` put in the
 *                   cache (same major version as playwright-core).
 *   NZSI_VIEWPORT   WxH (default 1440x900; run-phone.mjs sets 390x844)
 */
export const BASE_URL = (process.env.NZSI_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

export function viewport() {
  const m = /^(\d+)x(\d+)$/.exec(process.env.NZSI_VIEWPORT ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1440, height: 900 };
}

export const isPhone = () => viewport().width < 1024;

/** Launch options: headless, on the configured channel (or the bundled Chromium when PW_CHANNEL is empty). */
export function launchOptions() {
  const channel = process.env.PW_CHANNEL === undefined ? "msedge" : process.env.PW_CHANNEL;
  return { headless: true, ...(channel ? { channel } : {}) };
}
