"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANCHOR_KINDS,
  ANCHOR_LABELS,
  MAX_POIS,
  clearAnchors,
  removeAnchor,
  upsertAnchor,
  useAnchors,
  type AnchorKind,
} from "@/lib/preferences";
import { Popover } from "./popover";

interface GeocodeHit {
  full_address: string;
  lng: number;
  lat: number;
  sa2_code: string | null;
  sa2_name: string | null;
  score: number;
}
interface GeocodeResponse {
  matched: boolean;
  match?: GeocodeHit;
  candidates: GeocodeHit[];
  message?: string;
  error?: string;
}

/**
 * TRI-91 — the places you actually travel to (home, work, school drop-off,
 * daycare, up to three points of interest). Generalises the single "my
 * workplace" control (TRI-54) and keeps its central rule: an address is stored
 * ONLY after you confirm a geocoded match. A typed string is never saved as-is,
 * because a wrong origin silently poisons every commute figure derived from it.
 *
 * Everything lives in localStorage — nothing about where you live is sent
 * anywhere except as the destination of a routing call you triggered.
 *
 * TRI-145: sits on the shared Popover (Escape, focus return, flips when there
 * is no room); 40 px controls; `initiallyOpen` lets the phone You menu open
 * straight onto it, and desktop listens for the same `nzsi:open-places` event
 * the Getting Around nudge dispatches.
 */
export function AnchorsControl({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const anchors = useAnchors();
  const [open, setOpen] = useState(initiallyOpen);
  const [kind, setKind] = useState<AnchorKind>("home");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<GeocodeHit[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpenPlaces = () => {
      if (anchorRef.current && getComputedStyle(anchorRef.current).display !== "none") setOpen(true);
    };
    window.addEventListener("nzsi:open-places", onOpenPlaces);
    return () => window.removeEventListener("nzsi:open-places", onOpenPlaces);
  }, []);

  const reset = () => {
    setCandidates(null);
    setNotice(null);
    setBusy(false);
  };

  const save = (h: GeocodeHit) => {
    upsertAnchor({
      kind,
      label: ANCHOR_LABELS[kind],
      address: h.full_address,
      lng: h.lng,
      lat: h.lat,
      sa2_code: h.sa2_code,
      sa2_name: h.sa2_name,
    });
    setDraft("");
    reset();
  };

  const lookup = async () => {
    if (draft.trim().length < 3) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(draft.trim())}`);
      const json = (await res.json()) as GeocodeResponse;
      if (!res.ok) {
        setNotice(json.error ?? "Lookup failed — try again.");
        setCandidates(null);
      } else if (json.matched && json.match) {
        // A confident match still gets an explicit confirm step.
        setCandidates([json.match, ...json.candidates.slice(0, 2)]);
      } else if (json.candidates.length) {
        setNotice("Pick the address you meant:");
        setCandidates(json.candidates.slice(0, 4));
      } else {
        setNotice(json.message ?? "No Auckland address found for that.");
        setCandidates(null);
      }
    } catch {
      setNotice("Lookup failed — try again.");
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  };

  const poiCount = anchors.filter((a) => a.kind === "poi").length;
  const kindTaken = (k: AnchorKind) => (k === "poi" ? poiCount >= MAX_POIS : anchors.some((a) => a.kind === k));

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          reset();
          setOpen((o) => !o);
        }}
        title={anchors.length ? anchors.map((a) => `${a.label}: ${a.address}`).join("\n") : "Save the places you travel to"}
        className={`inline-flex h-10 items-center gap-1.5 rounded-control border px-3 text-label font-medium transition-colors ${
          anchors.length ? "border-harbour/60 bg-harbour/10 text-ink" : "border-hairline bg-surface text-ink hover:border-harbour"
        }`}
      >
        Places
        {anchors.length > 0 && <span className="font-mono">{anchors.length}</span>}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label="Your places" width="w-80">
        {anchors.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1">
            {anchors.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-control border border-hairline bg-canvas px-2 py-1.5">
                <span className="min-w-0">
                  <span className="block text-label font-medium text-ink">{a.label}</span>
                  <span className="block truncate font-mono text-micro text-ink/55" title={a.address}>
                    {a.address}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAnchor(a.id)}
                  aria-label={`Remove ${a.label}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center text-label text-ink/45 hover:text-ink"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <label className="text-label font-medium text-ink/80" htmlFor="anchor-kind">
            Add a place
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <select
              id="anchor-kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as AnchorKind);
                reset();
              }}
              className="h-10 shrink-0 rounded-control border border-hairline bg-canvas px-1.5 text-label text-ink focus:border-harbour focus:outline-none"
            >
              {ANCHOR_KINDS.map((k) => (
                <option key={k} value={k} disabled={kindTaken(k)}>
                  {ANCHOR_LABELS[k]}
                  {k === "poi" ? ` (${poiCount}/${MAX_POIS})` : kindTaken(k) ? " — set" : ""}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                reset();
              }}
              aria-label="Address in Auckland"
              placeholder="e.g. 12 Madden Street"
              className="h-10 min-w-0 flex-1 rounded-control border border-hairline bg-canvas px-2 font-mono text-body text-ink focus:border-harbour focus:outline-none"
            />
          </div>

          {notice && <p className="mt-2 text-label leading-snug text-ink/65">{notice}</p>}

          {candidates && (
            <ul className="mt-2 flex flex-col gap-1">
              {candidates.map((c) => (
                <li key={`${c.full_address}${c.lng}`}>
                  <button
                    type="button"
                    onClick={() => save(c)}
                    className="min-h-10 w-full rounded-control border border-hairline px-2 py-1.5 text-left text-label leading-snug text-ink hover:border-harbour"
                  >
                    {c.full_address}
                    {c.sa2_name && <span className="text-ink/50"> · {c.sa2_name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                clearAnchors();
                reset();
              }}
              disabled={!anchors.length}
              className="min-h-10 px-1 text-label text-ink/60 hover:text-ink disabled:opacity-40"
            >
              Clear all
            </button>
            <button
              type="submit"
              disabled={busy || draft.trim().length < 3 || kindTaken(kind)}
              className="min-h-10 rounded-control bg-harbour px-3 text-label font-medium text-surface hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Looking up…" : "Find address"}
            </button>
          </div>
        </form>

        <p className="mt-2 text-micro leading-snug text-ink/55">
          Stored on this device only, and saved only after you confirm a match — profiles then show drive times to each place.
          Addresses: Toitū Te Whenua LINZ (CC BY 4.0).
        </p>
      </Popover>
    </div>
  );
}
