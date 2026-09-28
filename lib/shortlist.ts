"use client";

import { useSyncExternalStore } from "react";

/**
 * TRI-99 — the saved-suburbs shortlist. Same contract as lib/preferences.ts:
 * client-only, localStorage under one key, read through useSyncExternalStore
 * with a null server snapshot (SSR renders nothing saved; the stored list
 * applies after hydration), a custom event plus `storage` for cross-tab sync.
 *
 * Local-only and account-free by design: the shortlist is a reader's private
 * working set. It never goes in the URL (TRI-97 privacy rule) and never rides
 * on /api/ask. Names are cached alongside codes so the strip can render
 * without a fetch.
 */

export interface SavedSuburb {
  sa2: string;
  name: string;
}

const KEY = "nzsi:shortlist";
const EVENT = "nzsi:shortlist-changed";
export const SHORTLIST_MAX = 12;

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const isSaved = (x: unknown): x is SavedSuburb =>
  !!x && typeof x === "object" && typeof (x as SavedSuburb).sa2 === "string" && /^\d{6}$/.test((x as SavedSuburb).sa2) && typeof (x as SavedSuburb).name === "string";

function parse(raw: string | null): SavedSuburb[] {
  try {
    const v = raw === null ? [] : (JSON.parse(raw) as unknown[]);
    return Array.isArray(v) ? v.filter(isSaved).slice(0, SHORTLIST_MAX) : [];
  } catch {
    return [];
  }
}

const snapshot = () => localStorage.getItem(KEY) ?? "";

export function useShortlist(): SavedSuburb[] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  return parse(raw || null);
}

export function getShortlist(): SavedSuburb[] {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

function write(list: SavedSuburb[]): void {
  const clean = list.filter(isSaved).slice(0, SHORTLIST_MAX);
  if (clean.length) localStorage.setItem(KEY, JSON.stringify(clean));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function isShortlisted(list: SavedSuburb[], sa2: string): boolean {
  return list.some((s) => s.sa2 === sa2);
}

/** Save (newest last) or remove; the list is capped — the oldest drops off. */
export function toggleShortlist(sa2: string, name: string): void {
  const cur = getShortlist();
  if (isShortlisted(cur, sa2)) write(cur.filter((s) => s.sa2 !== sa2));
  else write([...cur, { sa2, name }].slice(-SHORTLIST_MAX));
}

export function removeFromShortlist(sa2: string): void {
  write(getShortlist().filter((s) => s.sa2 !== sa2));
}

export function clearShortlist(): void {
  write([]);
}
