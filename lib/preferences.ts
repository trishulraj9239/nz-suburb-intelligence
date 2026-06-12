"use client";

import { useSyncExternalStore } from "react";

/**
 * User preferences (TRI-37) — client-only, persisted in localStorage, read
 * through useSyncExternalStore so SSR renders the empty state and components
 * stay in sync across the tree without prop-drilling.
 *
 * v1: weekly rent budget. House budget joins when Tier-2 price data lands
 * (TRI-38).
 */

const KEY = "nzsi:rent-budget";
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

export type BudgetVerdict = "under" | "on" | "over";

/** ±5% band counts as "on budget". */
export function budgetVerdict(rent: number, budget: number): BudgetVerdict {
  const ratio = rent / budget;
  if (ratio <= 0.95) return "under";
  if (ratio <= 1.05) return "on";
  return "over";
}
