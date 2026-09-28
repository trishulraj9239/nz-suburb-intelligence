/**
 * TRI-151 — one viewport for every verify script. Defaults to the desktop
 * frame; `NZSI_VIEWPORT=390x844` (or any WxH) replays the same script at
 * phone width, which is how `run-phone.mjs` turns the address-epic scripts
 * into a phone regression suite without forking them.
 */
export function viewport() {
  const m = /^(\d+)x(\d+)$/.exec(process.env.NZSI_VIEWPORT ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1440, height: 900 };
}

export const isPhone = () => viewport().width < 1024;
