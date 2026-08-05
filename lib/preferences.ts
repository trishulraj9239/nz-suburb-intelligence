"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PERSONA, isPersonaKey } from "./persona";

/**
 * User preferences (TRI-37) — client-only, persisted in localStorage, read
 * through useSyncExternalStore so SSR renders the empty state and components
 * stay in sync across the tree without prop-drilling.
 *
 * v1: weekly rent budget. House budget joins when Tier-2 price data lands
 * (TRI-38). v2 (TRI-54): "my workplace" — a single geocode-confirmed address;
 * profile and NL answers show commute-to-work without re-typing it. Never
 * stored from a guess: the control only saves a confirmed geocode match.
 * v3 (TRI-58): active persona key — drives section order, default map
 * metric, and NL emphasis via lib/persona.ts.
 */

const KEY = "nzsi:rent-budget";
const WORKPLACE_KEY = "nzsi:workplace";
const ANCHORS_KEY = "nzsi:anchors";
const PERSONA_KEY = "nzsi:persona";
const EVENT = "nzsi:prefs-changed";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function snapshot(): string | null {
  return localStorage.getItem(KEY);
}

export function useRentBudget(): number | null {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setRentBudget(value: number | null): void {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, String(Math.round(value)));
  }
  window.dispatchEvent(new Event(EVENT));
}

export interface Workplace {
  address: string;
  lng: number;
  lat: number;
  sa2_code: string | null;
  sa2_name: string | null;
}

function workplaceSnapshot(): string | null {
  return localStorage.getItem(WORKPLACE_KEY);
}

export function useWorkplace(): Workplace | null {
  const raw = useSyncExternalStore(subscribe, workplaceSnapshot, () => null);
  if (raw === null) return null;
  try {
    const w = JSON.parse(raw) as Workplace;
    return typeof w.address === "string" && Number.isFinite(w.lng) && Number.isFinite(w.lat)
      ? w
      : null;
  } catch {
    return null;
  }
}

/** Non-reactive read — for snapshotting the preference at ask time. */
export function getWorkplace(): Workplace | null {
  try {
    const raw = localStorage.getItem(WORKPLACE_KEY);
    if (raw === null) return null;
    const w = JSON.parse(raw) as Workplace;
    return typeof w.address === "string" && Number.isFinite(w.lng) && Number.isFinite(w.lat)
      ? w
      : null;
  } catch {
    return null;
  }
}

export function setWorkplace(w: Workplace | null): void {
  if (w === null) localStorage.removeItem(WORKPLACE_KEY);
  else localStorage.setItem(WORKPLACE_KEY, JSON.stringify(w));
  window.dispatchEvent(new Event(EVENT));
}

// --- Anchors (TRI-91) -------------------------------------------------------
// v3: the single workplace generalises to a small list of named places the
// user actually travels to. Same localStorage + pub/sub pattern; the shape of
// an anchor is a Workplace plus a `kind`, so the geocode-confirmed contract
// carries over unchanged: an anchor only exists if the address resolved. A
// typed-but-unconfirmed string is never stored — a wrong origin silently
// poisons every commute answer that uses it.

export const ANCHOR_KINDS = ["home", "work", "school", "daycare", "poi"] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

export const ANCHOR_LABELS: Record<AnchorKind, string> = {
  home: "Home",
  work: "Work",
  school: "School drop-off",
  daycare: "Daycare",
  poi: "Point of interest",
};

/** At most one of each singular kind; POIs are capped so a rank that routes to
 *  every anchor can't quietly multiply ORS calls (2000 directions/day). */
export const MAX_POIS = 3;

export interface Anchor extends Workplace {
  id: string;
  kind: AnchorKind;
  /** User-facing name, e.g. "Gym". Defaults to the kind's label. */
  label: string;
}

function isAnchor(a: unknown): a is Anchor {
  const x = a as Anchor;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.address === "string" &&
    Number.isFinite(x.lng) &&
    Number.isFinite(x.lat) &&
    (ANCHOR_KINDS as readonly string[]).includes(x.kind)
  );
}

/**
 * Read + migrate. A user who set a workplace before M17 keeps it: the legacy
 * `nzsi:workplace` value becomes a `work` anchor. The legacy key is left in
 * place rather than deleted, so an older deploy (or a rollback) still finds it
 * — the two are kept in sync by setAnchors below.
 */
function parseAnchors(raw: string | null, legacy: string | null): Anchor[] {
  let list: Anchor[] = [];
  try {
    const parsed = raw === null ? [] : (JSON.parse(raw) as unknown[]);
    if (Array.isArray(parsed)) list = parsed.filter(isAnchor);
  } catch {
    list = [];
  }
  if (!list.length && legacy) {
    try {
      const w = JSON.parse(legacy) as Workplace;
      if (typeof w.address === "string" && Number.isFinite(w.lng) && Number.isFinite(w.lat)) {
        return [{ ...w, id: "legacy-work", kind: "work", label: ANCHOR_LABELS.work }];
      }
    } catch {
      /* unparseable legacy value — ignore */
    }
  }
  return list;
}

function anchorsSnapshot(): string {
  // One string so useSyncExternalStore's identity check stays cheap and stable;
  // parsing happens outside the store.
  return `${localStorage.getItem(ANCHORS_KEY) ?? ""}|${localStorage.getItem(WORKPLACE_KEY) ?? ""}`;
}

export function useAnchors(): Anchor[] {
  const raw = useSyncExternalStore(subscribe, anchorsSnapshot, () => "");
  const [a, w] = raw.split("|");
  return parseAnchors(a || null, w || null);
}

/** Non-reactive read — for snapshotting preferences at ask time. */
export function getAnchors(): Anchor[] {
  try {
    return parseAnchors(
      localStorage.getItem(ANCHORS_KEY),
      localStorage.getItem(WORKPLACE_KEY),
    );
  } catch {
    return [];
  }
}

export function setAnchors(list: Anchor[]): void {
  const clean = list.filter(isAnchor).slice(0, ANCHOR_KINDS.length + MAX_POIS);
  localStorage.setItem(ANCHORS_KEY, JSON.stringify(clean));
  // Keep the legacy key mirroring the work anchor so anything still reading it
  // (and the /api/ask `workplace` field) stays correct.
  const work = clean.find((x) => x.kind === "work");
  if (work) {
    const { address, lng, lat, sa2_code, sa2_name } = work;
    localStorage.setItem(WORKPLACE_KEY, JSON.stringify({ address, lng, lat, sa2_code, sa2_name }));
  } else {
    localStorage.removeItem(WORKPLACE_KEY);
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Add or replace. Singular kinds overwrite; POIs append up to MAX_POIS. */
export function upsertAnchor(a: Omit<Anchor, "id"> & { id?: string }): void {
  const list = getAnchors();
  const id = a.id ?? `${a.kind}-${list.length}-${a.address.slice(0, 12)}`;
  const next: Anchor = { ...a, id, label: a.label || ANCHOR_LABELS[a.kind] };
  if (a.kind === "poi") {
    const pois = list.filter((x) => x.kind === "poi" && x.id !== id);
    if (pois.length >= MAX_POIS) return;
    setAnchors([...list.filter((x) => x.id !== id), next]);
  } else {
    setAnchors([...list.filter((x) => x.kind !== a.kind), next]);
  }
}

export function removeAnchor(id: string): void {
  setAnchors(getAnchors().filter((a) => a.id !== id));
}

export function clearAnchors(): void {
  localStorage.removeItem(ANCHORS_KEY);
  localStorage.removeItem(WORKPLACE_KEY);
  window.dispatchEvent(new Event(EVENT));
}

function personaSnapshot(): string | null {
  return localStorage.getItem(PERSONA_KEY);
}

/**
 * Active persona key. SSR (and first client render, via the null server
 * snapshot) resolves to DEFAULT_PERSONA — components that reorder content by
 * persona need a mounted guard so server and first client render agree.
 */
export function usePersona(): string {
  const raw = useSyncExternalStore(subscribe, personaSnapshot, () => null);
  return isPersonaKey(raw) ? raw : DEFAULT_PERSONA;
}

/** Non-reactive read — for snapshotting the preference at ask time. */
export function getPersona(): string {
  try {
    const raw = localStorage.getItem(PERSONA_KEY);
    return isPersonaKey(raw) ? raw : DEFAULT_PERSONA;
  } catch {
    return DEFAULT_PERSONA;
  }
}

export function setPersona(key: string): void {
  if (!isPersonaKey(key)) return;
  if (key === DEFAULT_PERSONA) localStorage.removeItem(PERSONA_KEY);
  else localStorage.setItem(PERSONA_KEY, key);
  window.dispatchEvent(new Event(EVENT));
}

export type BudgetVerdict = "under" | "on" | "over";

/** ±5% band counts as "on budget". */
export function budgetVerdict(rent: number, budget: number): BudgetVerdict {
  const ratio = rent / budget;
  if (ratio <= 0.95) return "under";
  if (ratio <= 1.05) return "on";
  return "over";
}
