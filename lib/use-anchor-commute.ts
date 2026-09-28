"use client";

import { useEffect, useState } from "react";
import type { Anchor } from "@/lib/preferences";

export interface CommuteResponse {
  duration_s: number | null;
  distance_m: number;
  fallback: boolean;
  caveat: string;
  source: { name: string };
  retrieved_at: string;
}

/** `undefined` = still routing, `null` = the call failed. */
export type CommuteResult = CommuteResponse | null | undefined;

const memo = new Map<string, Promise<CommuteResponse | null>>();

function route(sa2: string, a: Anchor): Promise<CommuteResponse | null> {
  const key = `${sa2}|${a.lng},${a.lat}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const p = fetch("/api/commute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin: { sa2_code: sa2 }, destination: { lng: a.lng, lat: a.lat }, mode: "driving-car" }),
  })
    .then((res) => (res.ok ? (res.json() as Promise<CommuteResponse>) : null))
    .catch(() => null);
  memo.set(key, p);
  return p;
}

/**
 * TRI-54 / TRI-91 / TRI-148 — drive time from a suburb's origin to each of
 * the reader's saved places. User-specific, so it's a live /api/commute call
 * (server-cached indefinitely, memoised here per suburb×place) rather than a
 * registry metric. Drive mode only: it's the mode people ask about for a
 * daily trip, and every extra mode is another ORS call against a 2000/day
 * budget. One hook for the whole list keeps the hook count stable however
 * many places are saved.
 */
export function useAnchorCommutes(sa2: string, anchors: Anchor[]): Map<string, CommuteResult> {
  const ids = anchors.map((a) => a.id).join(",");
  const [state, setState] = useState<{ key: string; results: Map<string, CommuteResult> }>({ key: "", results: new Map() });

  useEffect(() => {
    let stale = false;
    const key = `${sa2}|${ids}`;
    for (const a of anchors) {
      route(sa2, a).then((r) => {
        if (stale) return;
        setState((prev) => {
          const results = new Map(prev.key === key ? prev.results : []);
          results.set(a.id, r);
          return { key, results };
        });
      });
    }
    return () => {
      stale = true;
    };
    // `anchors` is derived from `ids` for the purpose of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sa2, ids]);

  return state.key === `${sa2}|${ids}` ? state.results : new Map();
}

/** Quota guard: each place is one ORS directions call on first view (the
 *  result is then cached indefinitely server-side). Auto-routing every saved
 *  place would burn up to 7 calls each time a profile is opened, so only the
 *  first few go automatically and the rest are opt-in per suburb. */
export const AUTO_ROUTED_ANCHORS = 3;

/**
 * TRI-149 — the same, for several suburbs at once (Compare): one hook however
 * many suburbs × places are on screen. Keys are `${sa2}|${anchorId}`.
 */
export function useAnchorCommutesMulti(sa2s: string[], anchors: Anchor[]): Map<string, CommuteResult> {
  const ids = `${sa2s.join(",")}#${anchors.map((a) => a.id).join(",")}`;
  const [state, setState] = useState<{ key: string; results: Map<string, CommuteResult> }>({ key: "", results: new Map() });

  useEffect(() => {
    let stale = false;
    for (const sa2 of sa2s) {
      for (const a of anchors) {
        route(sa2, a).then((r) => {
          if (stale) return;
          setState((prev) => {
            const results = new Map(prev.key === ids ? prev.results : []);
            results.set(`${sa2}|${a.id}`, r);
            return { key: ids, results };
          });
        });
      }
    }
    return () => {
      stale = true;
    };
    // `sa2s` and `anchors` are fully described by `ids` for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return state.key === ids ? state.results : new Map();
}
