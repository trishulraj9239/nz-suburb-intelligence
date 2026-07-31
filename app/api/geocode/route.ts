import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowRequest, clientIp, RATE_LIMIT_MESSAGE } from "@/lib/commute/rate-limit";

export const dynamic = "force-dynamic";

/**
 * TRI-47 — /api/geocode?q=42+ponsonby+rd
 *
 * Fuzzy-matches against the LINZ NZ Addresses Auckland clip via the
 * geocode_address() SECURITY DEFINER gate (migration 0007) — the addresses
 * table itself has no anon read. Honesty rule: below CONFIDENT we never pick
 * a winner; we return candidates (or nothing) and say so.
 */

const CONFIDENT = 0.55; // top hit is trustworthy on its own
const CANDIDATE = 0.35; // worth showing as a "did you mean"

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

export async function GET(req: NextRequest) {
  if (!allowRequest(clientIp(req))) {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 120) {
    return Response.json({ error: "q required (3-120 chars)" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("geocode_address", {
    p_query: q,
    p_limit: 5,
  });
  if (error) {
    console.error("[geocode]", error.message);
    return Response.json({ error: "geocode lookup failed" }, { status: 500 });
  }

  const hits = ((data ?? []) as GeocodeHit[]).filter((h) => h.score >= CANDIDATE);
  const source = {
    name: "NZ Addresses",
    publisher: "Toitū Te Whenua LINZ",
    licence: "CC BY 4.0",
  };

  if (!hits.length) {
    return Response.json({
      matched: false,
      reason: "no_confident_match",
      message: `No Auckland address confidently matches "${q}".`,
      candidates: [],
      source,
    });
  }

  const [top, ...rest] = hits;
  if (top.score >= CONFIDENT && (rest.length === 0 || top.score - rest[0].score > 0.05)) {
    return Response.json({ matched: true, match: top, candidates: rest, source });
  }

  return Response.json({
    matched: false,
    reason: "ambiguous",
    message: `Several Auckland addresses match "${q}" — pick one.`,
    candidates: hits,
    source,
  });
}
