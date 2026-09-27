"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSuburbPlaces, fetchSuburbs, type Suburb, type SuburbPlace } from "@/lib/suburb-data";
import { useWorkspace } from "@/lib/workspace";

/** Name search over the 627 active suburbs — the picker half of "map + picker".
 *  TRI-121: also matches LINZ suburb/locality names and their aliases ("Grey
 *  Lynn", "Arch Hill") and resolves them to the SA2 holding most of the place.
 *  TRI-122: also accepts a street address. Anything with a digit (or three or
 *  more words) is sent to /api/geocode; a confident hit resolves to the SA2
 *  containing it and pins the address on the map. Below the confidence floor
 *  the box shows the candidates or says there is no confident match — it
 *  never silently picks one (the TRI-47 geocode honesty rule). The address
 *  text goes to the geocoder only: never logged, embedded or sent to the LLM. */

interface GeocodeHit {
  full_address: string;
  suburb_locality: string | null;
  town_city: string | null;
  lng: number;
  lat: number;
  sa2_code: string | null;
  sa2_name: string | null;
  score: number;
}
interface GeocodeResponse {
  matched: boolean;
  reason?: "no_confident_match" | "ambiguous";
  message?: string;
  match?: GeocodeHit;
  candidates: GeocodeHit[];
}

const looksLikeAddress = (q: string) => /\d/.test(q) || q.trim().split(/\s+/).length >= 3;

export function SuburbSearch() {
  const { select, selectAddress } = useWorkspace();
  const [all, setAll] = useState<Suburb[]>([]);
  const [places, setPlaces] = useState<SuburbPlace[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState<{ q: string; res: GeocodeResponse | null; loading: boolean }>({ q: "", res: null, loading: false });
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

  // Debounced geocode for address-shaped queries.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 3 || !looksLikeAddress(query)) {
      setGeo({ q: "", res: null, loading: false });
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setGeo({ q: query, res: null, loading: true });
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const res = (await r.json()) as GeocodeResponse;
        setGeo({
          q: query,
          res: r.ok ? res : { matched: false, reason: "no_confident_match", message: res.message ?? "Address lookup failed.", candidates: [] },
          loading: false,
        });
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setGeo({ q: query, res: { matched: false, reason: "no_confident_match", message: "Address lookup failed.", candidates: [] }, loading: false });
      }
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  const needle = q.trim().toLowerCase();
  const addressMode = needle.length >= 3 && looksLikeAddress(needle);
  const sa2Matches = needle && !addressMode ? all.filter((s) => s.name.toLowerCase().includes(needle)).slice(0, 8) : [];
  const sa2Names = new Set(all.map((s) => s.name.toLowerCase()));
  const placeMatches =
    needle && !addressMode
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

  const geoHits: GeocodeHit[] = geo.res ? (geo.res.match ? [geo.res.match, ...geo.res.candidates] : geo.res.candidates) : [];
  const showAddress = addressMode && geo.q === q.trim();
  const pick = (h: GeocodeHit) => {
    if (!h.sa2_code) return;
    selectAddress({ label: h.full_address, lng: h.lng, lat: h.lat, sa2_code: h.sa2_code, sa2_name: h.sa2_name });
    setQ("");
    setOpen(false);
  };

  const anything = sa2Matches.length > 0 || placeMatches.length > 0 || (showAddress && (geo.loading || geoHits.length > 0 || !!geo.res));

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
        placeholder="Find a suburb or Auckland address…"
        aria-label="Find a suburb or address"
        className="h-9 w-full rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-ink/40 focus:border-harbour focus:outline-none"
      />
      {open && anything && (
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
          {showAddress && geo.loading && (
            <li className="px-3 py-2 text-xs text-ink/50" aria-live="polite">
              Looking up Auckland addresses…
            </li>
          )}
          {showAddress && !geo.loading && geo.res && geo.res.reason === "ambiguous" && (
            <li className="px-3 pt-2 text-[11px] uppercase tracking-wide text-ink/45">Did you mean</li>
          )}
          {showAddress &&
            !geo.loading &&
            geoHits.map((h) => (
              <li key={`addr-${h.full_address}`}>
                <button
                  type="button"
                  onClick={() => pick(h)}
                  disabled={!h.sa2_code}
                  data-testid="address-hit"
                  title={
                    h.sa2_code
                      ? `Opens the ${h.sa2_name ?? h.sa2_code} area profile with this address pinned. LINZ NZ Addresses (CC BY 4.0).`
                      : "This address is outside the covered Auckland statistical areas."
                  }
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-canvas disabled:opacity-40"
                >
                  <span className="truncate">{h.full_address}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink/40">
                    {h.sa2_code ? `→ ${h.sa2_name ?? h.sa2_code}` : "outside coverage"}
                  </span>
                </button>
              </li>
            ))}
          {showAddress && !geo.loading && geo.res && geoHits.length === 0 && (
            <li className="px-3 py-2 text-xs text-ink/60" aria-live="polite" data-testid="address-nomatch">
              {geo.res.message ?? "No Auckland address confidently matches."} Auckland addresses only.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
