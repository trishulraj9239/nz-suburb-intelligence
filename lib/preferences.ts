"use client";

import { useSyncExternalStore } from "react";

/**
 * User preferences (TRI-37) — client-only, persisted in localStorage, read
 * through useSyncExternalStore so SSR renders the empty state and components
 * stay in sync across the tree without prop-drilling.
 *
 * v1: weekly rent budget. House budget joins when Tier-2 price data lands
 * (TRI-38). v2 (TRI-54): "my workplace" — a single geocode-confirmed address;
 * profile and NL answers show commute-to-work without re-typing it. Never
 * stored from a guess: the control only saves a confirmed geocode match.
 */

const KEY = "nzsi:rent-budget";
const WORKPLACE_KEY = "nzsi:workplace";
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

export type BudgetVerdict = "under" | "on" | "over";

/** ±5% band counts as "on budget". */
export function budgetVerdict(rent: number, budget: number): BudgetVerdict {
  const ratio = rent / budget;
  if (ratio <= 0.95) return "under";
  if (ratio <= 1.05) return "on";
  return "over";
}
