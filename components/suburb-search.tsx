"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSuburbPlaces, fetchSuburbs, type Suburb, type SuburbPlace } from "@/lib/suburb-data";
import { useWorkspace } from "@/lib/workspace";

/** Name search over the 627 active suburbs — the picker half of "map + picker".
 *  TRI-121: also matches LINZ suburb/locality names and their aliases ("Grey
 *  Lynn", "Arch Hill") and resolves them to the SA2 holding most of the place;
 *  the row says how many areas the place spans, so the SA2 profile that opens
 *  is never mistaken for a whole-suburb figure. */
export function SuburbSearch() {
  const { select } = useWorkspace();
  const [all, setAll] = useState<Suburb[]>([]);
  const [places, setPlaces] = useState<SuburbPlace[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSuburbs().then(setAll).catch(() => setAll([]));
    fetchSuburbPlaces().then(setPlaces).catch(() => setPlaces([]));
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const needle = q.trim().toLowerCase();
  const sa2Matches = needle ? all.filter((s) => s.name.toLowerCase().includes(needle)).slice(0, 8) : [];
  const sa2Names = new Set(all.map((s) => s.name.toLowerCase()));
  // LINZ places whose name or an alias matches, that aren't already an SA2
  // name, and that resolve to at least one SA2.
  const placeMatches = needle
    ? places
        .filter(
          (p) =>
            p.sa2.length > 0 &&
            !sa2Names.has(p.name.toLowerCase()) &&
            (p.name.toLowerCase().includes(needle) || p.aliases.some((a) => a.toLowerCase().includes(needle))),
        )
        .slice(0, Math.max(0, 8 - sa2Matches.length))
    : [];
  const nameOf = (code: string) => all.find((s) => s.sa2_code === code)?.name ?? code;

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Find a suburb…"
        aria-label="Find a suburb"
        className="h-9 w-full rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-ink/40 focus:border-harbour focus:outline-none"
      />
      {open && (sa2Matches.length > 0 || placeMatches.length > 0) && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg">
          {sa2Matches.map((s) => (
            <li key={s.sa2_code}>
              <button
                type="button"
                onClick={() => {
                  select(s.sa2_code);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between px-3 py-2 text-left text-sm text-ink hover:bg-canvas"
              >
                <span>{s.name}</span>
                <span className="font-mono text-[10px] text-ink/40">{s.sa2_code}</span>
              </button>
            </li>
          ))}
          {placeMatches.map((p) => {
            const alias = p.aliases.find((a) => a.toLowerCase().includes(needle));
            const primary = p.sa2[0];
            return (
              <li key={`place-${p.linz_id}`}>
                <button
                  type="button"
                  onClick={() => {
                    select(primary.sa2_code);
                    setQ("");
                    setOpen(false);
                  }}
                  title={`${p.name} (${p.type.toLowerCase()}, LINZ) spans ${p.sa2.length} statistical area${p.sa2.length === 1 ? "" : "s"}: ${p.sa2.map((x) => `${nameOf(x.sa2_code)} ${Math.round(x.share * 100)}%`).join(", ")}. Opens ${nameOf(primary.sa2_code)}.`}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-canvas"
                >
                  <span>
                    {p.name}
                    {alias && alias.toLowerCase() !== p.name.toLowerCase() ? (
                      <span className="text-ink/50"> · aka {alias}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink/40">
                    {p.type.toLowerCase()} · {p.sa2.length === 1 ? nameOf(primary.sa2_code) : `${p.sa2.length} areas`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
