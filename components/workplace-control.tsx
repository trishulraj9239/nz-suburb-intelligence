"use client";

import { useEffect, useRef, useState } from "react";
import { setWorkplace, useWorkplace, type Workplace } from "@/lib/preferences";

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
 * Top-bar "my workplace" control (TRI-54). The address is only saved after a
 * confirmed geocode pick — a typed string is never stored as-is, so commute-
 * to-work always points at a real LINZ address.
 */
export function WorkplaceControl() {
  const workplace = useWorkplace();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<GeocodeHit[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const reset = () => {
    setCandidates(null);
    setNotice(null);
    setBusy(false);
  };

  const save = (h: GeocodeHit) => {
    const w: Workplace = {
      address: h.full_address,
      lng: h.lng,
      lat: h.lat,
      sa2_code: h.sa2_code,
      sa2_name: h.sa2_name,
    };
    setWorkplace(w);
    reset();
    setOpen(false);
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
        // Confident match still gets an explicit confirm step.
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

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setDraft(workplace?.address ?? "");
          reset();
          setOpen((o) => !o);
        }}
        title={workplace ? `Workplace: ${workplace.address}` : "Set your workplace address"}
        className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${
          workplace
            ? "border-harbour/60 bg-harbour/10 text-ink"
            : "border-hairline bg-surface text-ink hover:border-harbour"
        }`}
      >
        Workplace
        {workplace && (
          <span className="max-w-28 truncate font-mono">{workplace.address.split(",")[0]}</span>
        )}
      </button>

      {open && (
        <form
          className="absolute right-0 top-10 z-30 w-72 rounded-lg border border-hairline bg-surface p-3 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <label className="text-xs font-medium text-ink/75" htmlFor="workplace-address">
            Workplace address (Auckland)
          </label>
          <input
            id="workplace-address"
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              reset();
            }}
            placeholder="e.g. 12 Madden Street, Auckland"
            autoFocus
            className="mt-1.5 h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-sm text-ink focus:border-harbour focus:outline-none"
          />

          {notice && <p className="mt-2 text-[11px] leading-snug text-ink/60">{notice}</p>}

          {candidates && (
            <ul className="mt-2 flex flex-col gap-1">
              {candidates.map((c) => (
                <li key={`${c.full_address}${c.lng}`}>
                  <button
                    type="button"
                    onClick={() => save(c)}
                    className="w-full rounded-md border border-hairline px-2 py-1.5 text-left text-[11px] leading-snug text-ink hover:border-harbour"
                  >
                    {c.full_address}
                    {c.sa2_name && <span className="text-ink/45"> · {c.sa2_name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setWorkplace(null);
                reset();
                setOpen(false);
              }}
              className="text-xs text-ink/50 hover:text-ink"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={busy || draft.trim().length < 3}
              className="rounded-md bg-harbour px-3 py-1 text-xs font-medium text-surface hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Looking up…" : "Find address"}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-ink/45">
            Saved only after you confirm a match — profiles then show commute to work.
            Addresses: Toitū Te Whenua LINZ (CC BY 4.0).
          </p>
        </form>
      )}
    </div>
  );
}
