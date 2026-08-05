import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getChat, getEmbeddings } from "@/lib/llm";
import { orsMatrixToOne, OrsUnavailableError } from "@/lib/commute/ors";
import { ptKey, routedCommute } from "@/lib/commute/service";
import { DEFAULT_PERSONA, isPersonaKey, personaConfig } from "@/lib/persona";
import { HAZARD_CAVEAT, HAZARD_METRIC_KEYS, hazardRowLabel } from "@/lib/hazard";

const MODE_LABEL: Record<string, string> = {
  "driving-car": "drive",
  "cycling-regular": "cycle",
  "foot-walking": "walk",
};

interface ResolvedPlace {
  label: string;
  lng: number;
  lat: number;
  originKey: string; // cache key when used as an origin
  sa2_code: string | null;
}

/** A saved place the user can refer to by name (TRI-91/92). */
export interface AskAnchor {
  kind: string;
  label: string;
  address: string;
  lng: number;
  lat: number;
}

/** Words that mean "one of my saved places". Matched before any suburb lookup,
 *  so "home" resolves to the user's home rather than a suburb called Home. */
const ANCHOR_PATTERNS: [RegExp, string][] = [
  [/^\s*(my\s+)?work(place)?\s*$/i, "work"],
  [/^\s*(my\s+)?home\s*$/i, "home"],
  [/^\s*(the\s+|my\s+)?(kids?'?\s*)?school( drop[- ]?off)?\s*$/i, "school"],
  [/^\s*(the\s+|my\s+)?(daycare|day care|creche|childcare)\s*$/i, "daycare"],
];

function matchAnchor(text: string, anchors: AskAnchor[]): AskAnchor | null {
  for (const [re, kind] of ANCHOR_PATTERNS) {
    if (re.test(text)) return anchors.find((a) => a.kind === kind) ?? null;
  }
  // Points of interest are referred to by their own label ("gym", "Nana's").
  const t = text.trim().toLowerCase();
  return anchors.find((a) => a.kind === "poi" && a.label.toLowerCase() === t) ?? null;
}

/**
 * TRI-53 — resolve free text to a routable point: one of the user's saved
 * places, a suburb (ST_PointOnSurface origin), or a geocoded LINZ address.
 * Ambiguous geocodes use the top candidate only above 0.5 — and the answer
 * always states the resolved address, so an interpretation is visible, never
 * silent.
 */
async function resolvePlace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  text: string,
  anchors: AskAnchor[],
): Promise<ResolvedPlace | null> {
  const anchor = matchAnchor(text, anchors);
  if (anchor) {
    return {
      label: anchor.address,
      lng: anchor.lng,
      lat: anchor.lat,
      originKey: ptKey(anchor.lng, anchor.lat),
      sa2_code: null,
    };
  }
  // A saved-place word with nothing saved for it must NOT fall through to a
  // suburb name match — "home" would silently resolve to some suburb and the
  // answer would confidently route to the wrong origin.
  if (ANCHOR_PATTERNS.some(([re]) => re.test(text))) return null;
  const { data: geos } = await supabase
    .from("geographies")
    .select("sa2_code, name")
    .eq("geo_type", "SA2")
    .eq("is_active", true)
    .ilike("name", `%${text}%`)
    .limit(1);
  if (geos?.[0]) {
    const { data: pt } = await supabase
      .from("commute_origin_points")
      .select("lng, lat")
      .eq("sa2_code", geos[0].sa2_code)
      .maybeSingle();
    if (pt) {
      return {
        label: geos[0].name,
        lng: pt.lng,
        lat: pt.lat,
        originKey: `sa2:${geos[0].sa2_code}`,
        sa2_code: geos[0].sa2_code,
      };
    }
  }
  const { data: hits } = await supabase.rpc("geocode_address", { p_query: text, p_limit: 1 });
  const hit = (hits ?? [])[0] as
    | { full_address: string; lng: number; lat: number; sa2_code: string | null; score: number }
    | undefined;
  if (hit && hit.score >= 0.5) {
    return {
      label: hit.full_address,
      lng: hit.lng,
      lat: hit.lat,
      originKey: ptKey(hit.lng, hit.lat),
      sa2_code: hit.sa2_code,
    };
  }
  return null;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * TRI-28 + TRI-29 — the ask pipeline.
 *
 * POST {question} →
 *   1. PLAN (Sonnet, structured output): question → {intent, metrics, suburbs…}
 *   2. EXECUTE (server-side Supabase, anon/RLS): plan → numbered data rows
 *   3. ANSWER (Sonnet, streamed): prose with {{cN}} citation markers that the
 *      client renders as chips against the server-known sources list.
 *
 * Response is NDJSON: {type:"meta"...}, then {type:"delta",text}, {type:"done"}.
 * The sources footer comes from the rows actually queried — the model cannot
 * invent a citation the server didn't hand it.
 */

interface Plan {
  intent: "lookup" | "rank" | "compare" | "similar" | "commute" | "unsupported";
  metric_keys: string[];
  suburbs: string[];
  rank_direction: "asc" | "desc";
  limit: number;
  note: string;
  commute: {
    origin: string | null;
    destination: string | null;
    mode: "driving-car" | "cycling-regular" | "foot-walking";
    max_minutes: number | null;
  };
}

interface SourceRow {
  n: number;
  suburb: string;
  sa2_code: string;
  metric: string;
  label: string;
  value: number;
  unit: string | null;
  source: string;
  as_of: string;
  confidence: string;
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["lookup", "rank", "compare", "similar", "commute", "unsupported"],
      description:
        "lookup: facts about named suburb(s). rank: order Auckland suburbs by a metric. compare: 2-3 named suburbs side by side. similar: find suburbs like a named suburb OR matching a described vibe/criteria. commute: a routed trip between an origin and a user-specific destination (incl. the saved workplace). unsupported: anything else.",
    },
    metric_keys: {
      type: "array",
      items: { type: "string" },
      description: "Relevant metric keys from the registry. Empty = all core metrics.",
    },
    suburbs: {
      type: "array",
      items: { type: "string" },
      description: "Suburb names mentioned by the user, as written.",
    },
    rank_direction: { type: "string", enum: ["asc", "desc"] },
    limit: { type: "integer", description: "Result count for rank queries, 1-10." },
    note: { type: "string", description: "For unsupported: one sentence on why." },
    commute: {
      type: "object",
      additionalProperties: false,
      description:
        "Routed-commute details. For intent=commute: origin + destination as the user wrote them ('work' = the saved workplace). For intent=rank with a commute constraint ('within 30 min drive of X'): destination + max_minutes. Otherwise nulls.",
      properties: {
        origin: { type: ["string", "null"], description: "Suburb name or address, as written. Null if not a commute question." },
        destination: {
          type: ["string", "null"],
          description:
            "Address/place as written, or one of the user's saved places by name — exactly 'work', 'home', 'school' or 'daycare' (or a saved point-of-interest's own label). Null if none.",
        },
        mode: { type: "string", enum: ["driving-car", "cycling-regular", "foot-walking"] },
        max_minutes: { type: ["integer", "null"], description: "For commute-constrained ranking: the minutes cap. Else null." },
      },
      required: ["origin", "destination", "mode", "max_minutes"],
    },
  },
  required: ["intent", "metric_keys", "suburbs", "rank_direction", "limit", "note", "commute"],
} as const;

export async function POST(req: NextRequest) {
  const { question, provider, workplace, persona, anchors, budget, relax } = (await req.json()) as {
    question?: string;
    provider?: string;
    workplace?: { address?: string; lng?: number; lat?: number };
    persona?: string;
    anchors?: { kind?: string; label?: string; address?: string; lng?: number; lat?: number }[];
    budget?: number;
    /** TRI-105 — constraints the user removed from the answer; re-run without them. */
    relax?: string[];
  };
  if (!question?.trim() || question.length > 500) {
    return Response.json({ error: "question required (max 500 chars)" }, { status: 400 });
  }
  // Persona (TRI-61) — validated against the config registry like any other
  // body input; unknown values fall back to the default persona. Weights are
  // transparent emphasis stated in answers, never a computed score.
  const personaCfg = personaConfig(isPersonaKey(persona) ? persona : DEFAULT_PERSONA);
  // Saved workplace (TRI-54) rides along from the client; only used when the
  // question says "work". Coordinates are validated like any other input.
  const work =
    typeof workplace?.address === "string" &&
    workplace.address.length <= 200 &&
    typeof workplace.lng === "number" &&
    typeof workplace.lat === "number" &&
    workplace.lng > 173 && workplace.lng < 176 &&
    workplace.lat > -38 && workplace.lat < -35
      ? { address: workplace.address, lng: workplace.lng, lat: workplace.lat }
      : null;

  // Saved places (TRI-91/92). Validated exactly like the legacy workplace —
  // same Auckland bbox, same length caps — and capped in count so the prompt
  // can't be stuffed from the body. The legacy `workplace` field still works
  // and is folded in as a work anchor when the client hasn't sent one.
  const ANCHOR_KIND_SET = new Set(["home", "work", "school", "daycare", "poi"]);
  const savedPlaces: AskAnchor[] = (Array.isArray(anchors) ? anchors : [])
    .filter(
      (a) =>
        typeof a?.address === "string" &&
        a.address.length <= 200 &&
        typeof a.label === "string" &&
        a.label.length <= 60 &&
        typeof a.kind === "string" &&
        ANCHOR_KIND_SET.has(a.kind) &&
        typeof a.lng === "number" &&
        typeof a.lat === "number" &&
        a.lng > 173 && a.lng < 176 &&
        a.lat > -38 && a.lat < -35,
    )
    .slice(0, 7)
    .map((a) => ({
      kind: a.kind as string,
      label: a.label as string,
      address: a.address as string,
      lng: a.lng as number,
      lat: a.lat as number,
    }));
  if (work && !savedPlaces.some((a) => a.kind === "work")) {
    savedPlaces.push({ kind: "work", label: "Work", ...work });
  }

  // TRI-105 — a chip the user dismissed on the last answer. Only known keys
  // are honoured, so the body can't suppress arbitrary behaviour.
  const relaxed = new Set((Array.isArray(relax) ? relax : []).filter((r) => r === "budget" || r === "commute"));

  // Weekly rent budget (TRI-37). Emphasis only: it tells the answer what to
  // point out, and must NEVER filter rows — a suburb over budget still appears,
  // labelled, because hiding it would silently narrow the user's options.
  const rentBudget =
    !relaxed.has("budget") &&
    typeof budget === "number" && Number.isFinite(budget) && budget > 0 && budget < 5000
      ? Math.round(budget)
      : null;

  const supabase = await createClient();
  // `provider` (optional) lets the M6 eval (TRI-31) A/B backends per request; it
  // can only select among registered providers, so it's safe from the body.
  let chat;
  try {
    chat = getChat(provider);
  } catch {
    return Response.json({ error: "unknown provider" }, { status: 400 });
  }

  // Metric registry drives the planner prompt — metrics are data, not code.
  const { data: defs } = await supabase
    .from("metric_definitions")
    .select("metric_key,label,dimension,unit,value_type,higher_is_better")
    .eq("is_active", true)
    .order("display_order");
  const registry = defs ?? [];
  const scalarKeys = registry.filter((d) => d.value_type === "scalar").map((d) => d.metric_key);

  // Persona emphasis (TRI-61) — only weights whose metrics exist in the live
  // registry are surfaced. higher_is_better (nullable by design — NULL means
  // "no better/worse") rides along so emphasis is direction-aware without
  // ever becoming a composite score.
  const weightNotes = Object.entries(personaCfg.metricWeights)
    .map(([key, w]) => {
      const d = registry.find((x) => x.metric_key === key);
      if (!d) return null;
      const dir =
        d.higher_is_better === null
          ? "no better/worse direction"
          : d.higher_is_better
            ? "higher is better"
            : "lower is better";
      return `${key} ×${w} (${dir})`;
    })
    .filter((s): s is string => s !== null);
  const personaLine = `Active persona: ${personaCfg.key} ("${personaCfg.label}"). ${personaCfg.promptDescriptor}`;

  // TRI-92 — the user's saved places, listed for the planner so it knows which
  // words are resolvable. Only the kind and the label; the address itself is
  // named in the answer by the resolver, so a misinterpretation stays visible.
  const savedPlacesLine = savedPlaces.length
    ? ` Saved places currently set: ${savedPlaces.map((a) => `${a.kind}${a.kind === "poi" ? ` ("${a.label}")` : ""}`).join(", ")}. A saved place the user has NOT set is not resolvable — for those, intent=unsupported with a note saying which place isn't set.`
    : " The user has NO saved places set, so any question referring to work/home/school/daycare as a place is intent=unsupported with a note saying that place isn't set yet.";

  // Preferences that bias EMPHASIS only. The budget never filters rows: a
  // suburb over budget must still appear, labelled, because hiding it would
  // quietly narrow the user's options without telling them.
  const budgetLine = rentBudget
    ? ` The user's weekly rent budget is $${rentBudget}. Point out where a rent figure sits under or over it, but NEVER exclude a suburb for being over budget — say so instead.`
    : "";
  const preferenceNames = [
    `${personaCfg.label} mode`,
    ...(rentBudget ? [`your $${rentBudget}/wk budget`] : []),
    ...(savedPlaces.length ? [`your saved ${savedPlaces.map((a) => a.kind).join("/")}`] : []),
  ];

  // ---- 1. PLAN -------------------------------------------------------------
  const planText = await chat.complete("reasoning", {
    system: `You convert questions about Auckland (NZ) suburbs into a structured query plan. Coverage: Auckland region SA2 areas only; Census 2023/2018/2013, NZDep2018 deprivation, school directory, typical routed commute times (openrouteservice/OSM — drive, cycle, walk; no live traffic). Metric registry (key | label | unit):\n${registry
      .map((d) => `${d.metric_key} | ${d.label} | ${d.unit ?? "-"}`)
      .join("\n")}\nRules: deprivation and ethnicity have no "better/worse" — a rank by nzdep_decile is allowed but is informational only.\nCommute rules, in priority order:\n1. The question refers to one of the user's SAVED PLACES by name — work, home, school (drop-off), daycare, or a saved point of interest — → ALWAYS intent=commute with that commute field set to exactly that word. These are specific saved addresses, NOT suburbs and NOT the CBD; never answer them from the commute_* metrics.${savedPlacesLine} Example: "How long is the commute from Ponsonby to work?" → {"intent":"commute","suburbs":["Ponsonby"],"commute":{"origin":"Ponsonby","destination":"work","mode":"driving-car","max_minutes":null}}.\n2. "how far/long is <suburb> from the CBD/airport" → intent=lookup with the commute_* metrics (precomputed).\n3. A commute between a suburb/address and any other specific destination → intent=commute with commute.origin/destination as written. "Suburbs within N min <mode> of <place>" combined with a metric constraint → intent=rank on that metric plus commute.destination and commute.max_minutes. PUBLIC TRANSPORT (train, bus, ferry) times are NOT supported — intent=unsupported, note that only typical drive/cycle/walk times exist.\nRent questions about a specific dwelling type or bedroom count ARE supported: intent=lookup with the rent metrics — the data covers all dwelling types combined and the answer will say so; do not refuse them.\nHazard rules: questions about individual hazard layers (flood plain, coastal inundation, overland flow, liquefaction) or zoning/heritage ARE supported — intent=lookup or rank on those metrics. A general "is X safe / is X a safe suburb?" question → intent=lookup on the hazard metrics for that suburb (the answer states these are hazard-model layers only — no crime data — and gives no overall verdict). BUT a question asking for ANY risk or safety score or rating — overall or for a single layer, e.g. "flood risk score out of 10", "how risky is X overall" — or to merge hazard layers into one figure → intent=unsupported with note set to exactly "composite-risk".\nQuestions about construction / how much is being built / how many homes were built in a suburb → intent=lookup or rank on the consents metrics (the data measures consents, and the answer states that); do not refuse them.\nOther questions needing data we don't have (crime, house prices outside rent/income, other cities) are unsupported.\n${personaLine} When the question is open-ended about which metrics matter, lean toward this persona's priorities — but never drop a metric the user explicitly asks for.`,
    messages: [{ role: "user", content: question }],
    maxTokens: 500,
    jsonSchema: PLAN_SCHEMA as unknown as Record<string, unknown>,
  });
  let plan: Plan;
  try {
    const raw = JSON.parse(planText) as Partial<Plan>;
    // Normalise: open-weight models (the M6 eval) don't guarantee every field
    // the way Claude's structured output does — fill sane defaults so a partial
    // plan still executes instead of throwing.
    const intents = ["lookup", "rank", "compare", "similar", "commute", "unsupported"] as const;
    const modes = ["driving-car", "cycling-regular", "foot-walking"] as const;
    const rawCommute = (raw.commute ?? {}) as Partial<Plan["commute"]>;
    plan = {
      intent: intents.includes(raw.intent as Plan["intent"]) ? (raw.intent as Plan["intent"]) : "unsupported",
      metric_keys: Array.isArray(raw.metric_keys) ? raw.metric_keys.filter((k): k is string => typeof k === "string") : [],
      suburbs: Array.isArray(raw.suburbs) ? raw.suburbs.filter((s): s is string => typeof s === "string") : [],
      rank_direction: raw.rank_direction === "asc" ? "asc" : "desc",
      limit: Number.isFinite(raw.limit) ? Number(raw.limit) : 5,
      note: typeof raw.note === "string" ? raw.note : "",
      commute: {
        origin: typeof rawCommute.origin === "string" ? rawCommute.origin : null,
        destination: typeof rawCommute.destination === "string" ? rawCommute.destination : null,
        mode: modes.includes(rawCommute.mode as Plan["commute"]["mode"])
          ? (rawCommute.mode as Plan["commute"]["mode"])
          : "driving-car",
        max_minutes: Number.isFinite(rawCommute.max_minutes) ? Number(rawCommute.max_minutes) : null,
      },
    };
  } catch {
    return Response.json({ error: "planning failed" }, { status: 502 });
  }

  // ---- 2. EXECUTE ----------------------------------------------------------
  const rows: SourceRow[] = [];
  const compareCodes: string[] = [];
  const wantedMetrics = (plan.metric_keys.length ? plan.metric_keys : scalarKeys).filter(
    (k) => scalarKeys.includes(k),
  );

  if (plan.intent === "lookup" || plan.intent === "compare") {
    for (const name of plan.suburbs.slice(0, 3)) {
      const { data: geos } = await supabase
        .from("geographies")
        .select("id, sa2_code, name")
        .eq("geo_type", "SA2")
        .eq("is_active", true)
        .ilike("name", `%${name}%`)
        .limit(1);
      const geo = geos?.[0];
      if (!geo) continue;
      if (plan.intent === "compare") compareCodes.push(geo.sa2_code);

      const { data: vals } = await supabase
        .from("metric_values")
        .select(
          "value_num, category, as_of_date, confidence, metric_definitions!inner(metric_key,label,unit), sources(name)",
        )
        .eq("geo_id", geo.id)
        .is("category", null)
        .in("metric_definitions.metric_key", wantedMetrics)
        .order("as_of_date", { ascending: false });
      const seen = new Set<string>();
      for (const v of vals ?? []) {
        const md = v.metric_definitions as unknown as {
          metric_key: string;
          label: string;
          unit: string | null;
        };
        if (seen.has(md.metric_key) || v.value_num === null) continue;
        seen.add(md.metric_key);
        rows.push({
          n: rows.length + 1,
          suburb: geo.name,
          sa2_code: geo.sa2_code,
          metric: md.metric_key,
          // Hazard rows bake layer + vintage + caveat into the label (TRI-70,
          // commute row-label precedent) — the model can only cite rows that
          // already carry the framing.
          label: HAZARD_METRIC_KEYS.has(md.metric_key)
            ? hazardRowLabel(md.label, v.as_of_date)
            : md.label,
          value: Number(v.value_num),
          unit: md.unit,
          source: (v.sources as unknown as { name: string } | null)?.name ?? "—",
          as_of: v.as_of_date,
          confidence: v.confidence,
        });
      }
    }
  } else if (plan.intent === "rank") {
    const metric = wantedMetrics[0] ?? "median_rent_weekly";
    const def = registry.find((d) => d.metric_key === metric);
    // A commute constraint filters AFTER ranking — shortlist wider so the
    // one matrix call has candidates to keep.
    const limit =
      plan.commute.destination && plan.commute.max_minutes
        ? 25
        : Math.min(Math.max(plan.limit || 5, 1), 10);
    // TRI-64 — every metric ranks on its own latest vintage (census metrics on
    // census day, NZDep2018 on its date, MBIE rent on the latest quarter), so a
    // multi-vintage series never mixes dates within one ranking.
    const { data: latestVal } = await supabase
      .from("metric_values")
      .select("as_of_date, metric_definitions!inner(metric_key)")
      .is("category", null)
      .eq("metric_definitions.metric_key", metric)
      .order("as_of_date", { ascending: false })
      .limit(1);
    const latestDate = latestVal?.[0]?.as_of_date;
    const { data: vals } = latestDate
      ? await supabase
          .from("metric_values")
          .select(
            "value_num, as_of_date, confidence, geographies!inner(name, sa2_code, is_active), metric_definitions!inner(metric_key,label,unit), sources(name)",
          )
          .is("category", null)
          .eq("metric_definitions.metric_key", metric)
          .eq("geographies.is_active", true)
          .eq("as_of_date", latestDate)
          .not("value_num", "is", null)
          .order("value_num", { ascending: plan.rank_direction === "asc" })
          .limit(limit)
      : { data: [] };
    for (const v of vals ?? []) {
      const g = v.geographies as unknown as { name: string; sa2_code: string };
      rows.push({
        n: rows.length + 1,
        suburb: g.name,
        sa2_code: g.sa2_code,
        metric,
        label: HAZARD_METRIC_KEYS.has(metric)
          ? hazardRowLabel(def?.label ?? metric, v.as_of_date)
          : (def?.label ?? metric),
        value: Number(v.value_num),
        unit: def?.unit ?? null,
        source: (v.sources as unknown as { name: string } | null)?.name ?? "—",
        as_of: v.as_of_date,
        confidence: v.confidence,
      });
    }
  }

  // Commute between two user-specified places (TRI-53) — live-routed, cached.
  if (plan.intent === "commute") {
    const originText = plan.commute.origin ?? plan.suburbs[0] ?? null;
    const destText = plan.commute.destination;
    const origin = originText ? await resolvePlace(supabase, originText, savedPlaces) : null;
    const dest = destText ? await resolvePlace(supabase, destText, savedPlaces) : null;
    if (!origin || !dest) {
      plan.note =
        plan.note ||
        `I couldn't confidently resolve ${!origin ? `the starting point "${originText ?? "?"}"` : `the destination "${destText ?? "?"}"`} to an Auckland suburb or address.`;
    } else {
      const mode = plan.commute.mode;
      const destLabel =
        destText && /^\s*(my\s+)?work(place)?\s*$/i.test(destText)
          ? `${dest.label} (the saved workplace)`
          : dest.label;
      const r = await routedCommute(
        supabase,
        origin.originKey,
        [origin.lng, origin.lat],
        [dest.lng, dest.lat],
        mode,
      );
      if (r.duration_s !== null && !r.fallback) {
        rows.push({
          n: rows.length + 1,
          suburb: origin.label,
          sa2_code: origin.sa2_code ?? "—",
          metric: `commute_${mode}`,
          label: `Typical ${MODE_LABEL[mode]} time, ${origin.label} → ${destLabel} (routed, no live traffic)`,
          value: Math.round(r.duration_s / 6) / 10,
          unit: "min",
          source: "openrouteservice routing (OpenStreetMap)",
          as_of: r.retrieved_at.slice(0, 10),
          confidence: "medium",
        });
      } else {
        rows.push({
          n: rows.length + 1,
          suburb: origin.label,
          sa2_code: origin.sa2_code ?? "—",
          metric: "commute_fallback",
          label: `Straight-line distance, ${origin.label} → ${destLabel} (routing temporarily unavailable — NOT a drive time)`,
          value: Math.round(r.distance_m / 100) / 10,
          unit: "km",
          source: "openrouteservice routing (OpenStreetMap)",
          as_of: r.retrieved_at.slice(0, 10),
          confidence: "derived",
        });
      }
    }
  }

  // Commute-constrained ranking ("under $650 within 30 min of Penrose"):
  // rank rows already hold the metric shortlist; one matrix call filters it.
  if (relaxed.has("commute")) plan.commute.max_minutes = null;
  if (plan.intent === "rank" && plan.commute.destination && plan.commute.max_minutes) {
    const dest = await resolvePlace(supabase, plan.commute.destination, savedPlaces);
    if (dest && rows.length) {
      const codes = rows.map((r) => r.sa2_code);
      const { data: pts } = await supabase
        .from("commute_origin_points")
        .select("sa2_code, lng, lat")
        .in("sa2_code", codes);
      const ptFor = new Map((pts ?? []).map((p) => [p.sa2_code as string, p]));
      const withPts = rows.filter((r) => ptFor.has(r.sa2_code));
      try {
        const secs = await orsMatrixToOne(
          plan.commute.mode,
          withPts.map((r) => {
            const p = ptFor.get(r.sa2_code)!;
            return [p.lng, p.lat] as [number, number];
          }),
          [dest.lng, dest.lat],
        );
        const cap = plan.commute.max_minutes * 60;
        const kept = withPts.filter((_, i) => secs[i] !== null && secs[i]! <= cap);
        const keptSecs = new Map(kept.map((r) => [r.sa2_code, secs[withPts.indexOf(r)]!]));
        rows.length = 0;
        for (const r of kept.slice(0, 8)) {
          rows.push({ ...r, n: rows.length + 1 });
          rows.push({
            n: rows.length + 1,
            suburb: r.suburb,
            sa2_code: r.sa2_code,
            metric: `commute_${plan.commute.mode}`,
            label: `Typical ${MODE_LABEL[plan.commute.mode]} time to ${dest.label} (routed, no live traffic)`,
            value: Math.round(keptSecs.get(r.sa2_code)! / 6) / 10,
            unit: "min",
            source: "openrouteservice routing (OpenStreetMap)",
            as_of: new Date().toISOString().slice(0, 10),
            confidence: "medium",
          });
        }
        if (!rows.length) {
          plan.note = `No ranked suburb was within ${plan.commute.max_minutes} min ${MODE_LABEL[plan.commute.mode]} of ${dest.label}.`;
        }
      } catch (err) {
        // Matrix down → keep the metric ranking, say the constraint was skipped.
        plan.note = `Routing is temporarily unavailable (${err instanceof OrsUnavailableError ? err.message : "error"}) — results are ranked by the metric only, without the commute filter.`;
      }
    } else if (!dest) {
      plan.note = `I couldn't confidently resolve "${plan.commute.destination}" to an Auckland suburb or address, so results are ranked by the metric only.`;
    }
  }

  let similar: { sa2_code: string; name: string; similarity: number }[] = [];
  if (plan.intent === "similar") {
    if (plan.suburbs.length > 0) {
      // "Suburbs like X": nearest neighbours of X's stored profile embedding.
      const { data: geos } = await supabase
        .from("geographies")
        .select("sa2_code, name")
        .eq("geo_type", "SA2")
        .ilike("name", `%${plan.suburbs[0]}%`)
        .limit(1);
      if (geos?.[0]) {
        const { data } = await supabase.rpc("match_suburbs_by_code", {
          p_sa2_code: geos[0].sa2_code,
          p_count: 5,
        });
        similar = (data ?? []) as typeof similar;
      }
    } else {
      // Described criteria: embed the live query with the SAME locked model.
      const [vec] = await getEmbeddings().embed([question]);
      const { data } = await supabase.rpc("match_suburbs_by_vector", {
        p_embedding: `[${vec.join(",")}]`,
        p_count: 5,
      });
      similar = (data ?? []) as typeof similar;
    }
    // TRI-107 — a `similar` answer used to return ONLY cosine scores, so the
    // model had nothing citable and honestly refused ("no figures for any of
    // these suburbs"). Retrieval picked the right suburbs and then starved the
    // answer. Now every retrieved suburb also carries its metric rows, so the
    // answer can actually talk about rent/commute/zoning for them.
    //
    // ONLY the metrics the planner explicitly named. Deliberately no fallback:
    // an earlier cut filled in the persona's top-weighted metrics whenever the
    // planner named none, which pushed open-ended questions ("what matters most
    // and where should I look?") to 16-24 numbered rows. The model then
    // scrambled markers and invented figures — q5/q11/q12 all fell to 1/5 on
    // the judge, worse than the honest refusal they used to give.
    //
    // So the attachment is scoped to what this bug was actually about: a
    // question that names a metric ("cheapest RENT near Takapuna") now gets
    // that metric for the retrieved suburbs. A vibe question still gets
    // similarity rows only, and still says plainly that it has no figures.
    const similarMetrics = plan.metric_keys
      .filter((k) => scalarKeys.includes(k))
      .slice(0, 3);

    // Fewer, fully-described suburbs beat more, thinner ones — every extra row
    // is another chance to mis-cite.
    if (similarMetrics.length && similar.length > 4) similar = similar.slice(0, 4);

    const metricsByCode = new Map<string, SourceRow[]>();
    if (similar.length && similarMetrics.length) {
      const codes = similar.map((s) => s.sa2_code);
      const { data: geoRows } = await supabase
        .from("geographies")
        .select("id, sa2_code, name")
        .eq("geo_type", "SA2")
        .in("sa2_code", codes);
      const codeById = new Map((geoRows ?? []).map((g) => [g.id as number, g]));
      if (codeById.size) {
        const { data: vals } = await supabase
          .from("metric_values")
          .select(
            "geo_id, value_num, category, as_of_date, confidence, metric_definitions!inner(metric_key,label,unit), sources(name)",
          )
          .in("geo_id", [...codeById.keys()])
          .is("category", null)
          .in("metric_definitions.metric_key", similarMetrics)
          .order("as_of_date", { ascending: false });
        const seen = new Set<string>(); // geo_id|metric_key — latest vintage wins
        for (const v of vals ?? []) {
          const md = v.metric_definitions as unknown as {
            metric_key: string;
            label: string;
            unit: string | null;
          };
          const geo = codeById.get(v.geo_id as number);
          if (!geo || v.value_num === null) continue;
          const key = `${v.geo_id}|${md.metric_key}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const list = metricsByCode.get(geo.sa2_code as string) ?? [];
          list.push({
            n: 0, // numbered below, once the final row order is known
            suburb: geo.name as string,
            sa2_code: geo.sa2_code as string,
            metric: md.metric_key,
            label: HAZARD_METRIC_KEYS.has(md.metric_key)
              ? hazardRowLabel(md.label, v.as_of_date)
              : md.label,
            value: Number(v.value_num),
            unit: md.unit,
            source: (v.sources as unknown as { name: string } | null)?.name ?? "—",
            as_of: v.as_of_date,
            confidence: v.confidence,
          });
          metricsByCode.set(geo.sa2_code as string, list);
        }
      }
    }

    // Metric rows first per suburb, similarity last: the result pills and the
    // Results table take the FIRST row per suburb, and a rent figure is more
    // use there than a cosine score. The similarity row stays — it is the
    // honest record of why these suburbs were retrieved at all.
    for (const s of similar) {
      for (const r of metricsByCode.get(s.sa2_code) ?? []) {
        rows.push({ ...r, n: rows.length + 1 });
      }
      rows.push({
        n: rows.length + 1,
        suburb: s.name,
        sa2_code: s.sa2_code,
        metric: "similarity",
        label: "Profile similarity",
        value: s.similarity,
        unit: "cosine",
        source: "Profile embeddings (gemini-embedding-001)",
        as_of: "2023-03-07",
        confidence: "medium",
      });
    }
  }

  // ---- 3. ANSWER (streamed) --------------------------------------------------
  const encoder = new TextEncoder();
  const ndjson = (obj: unknown) => encoder.encode(JSON.stringify(obj) + "\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        ndjson({
          type: "meta",
          intent: plan.intent,
          compare: compareCodes,
          sources: rows,
          persona: personaCfg.key,
          // TRI-83 "How this was matched" — the planner's own decisions, shown
          // verbatim so the user can see what the question was read as (and
          // spot a misreading) rather than trusting the prose blindly. Purely
          // descriptive: no scores, nothing the answer doesn't already act on.
          // TRI-105 — the constraints that actually shaped this answer, so the
          // UI can show them and offer to drop one. Only what was APPLIED is
          // listed; a relaxed constraint is absent, not marked.
          constraints: [
            ...(rentBudget ? [{ key: "budget", label: `rent vs $${rentBudget}/wk` }] : []),
            ...(plan.commute.destination && plan.commute.max_minutes
              ? [
                  {
                    key: "commute",
                    label: `within ${plan.commute.max_minutes} min ${MODE_LABEL[plan.commute.mode]} of ${plan.commute.destination}`,
                  },
                ]
              : []),
          ],
          match: {
            metrics: plan.metric_keys,
            suburbs: plan.suburbs,
            rankDirection: plan.rank_direction,
            limit: plan.limit,
            note: plan.note,
            commute: plan.commute,
          },
          // Which backend/model actually served this request — recorded by the eval.
          provider: chat.name,
          models: { plan: chat.modelFor("reasoning"), answer: chat.modelFor("reasoning") },
        }),
      );
      try {
        if (plan.intent === "unsupported" || rows.length === 0) {
          // Composite-risk refusal (TRI-70) — deterministic text, same path as
          // every other unsupported answer; no new intent, no model wording.
          const msg =
            plan.intent === "unsupported" && /composite-risk/i.test(plan.note)
              ? `I don't produce overall risk scores — the hazard layers are separate council models with different vintages, and combining them would invent a number no source publishes. Here are the individual measured layers I track per suburb: flood plain % (1% AEP), coastal inundation % (present-day and +1 m sea level), overland flow path density, and liquefaction vulnerability. Ask about any of them for a suburb, e.g. "How much of Milford is in the flood plain?". ${HAZARD_CAVEAT}`
              : plan.intent === "unsupported"
              ? `I can't answer that with the data I have. ${plan.note} I cover Auckland suburbs: census demographics and housing, NZDep deprivation, schools, typical drive/cycle/walk times (no public transport times yet), and council hazard and zoning layers.`
              : plan.note ||
                "I couldn't match that question to any suburbs or metrics I track. Try naming an Auckland suburb, or asking for a ranking like “lowest median rent”.";
          controller.enqueue(ndjson({ type: "delta", text: msg }));
        } else {
          const dataBlock = rows
            .map(
              (r) =>
                `[${r.n}] ${r.suburb} — ${r.label}: ${r.value}${r.unit ? ` ${r.unit}` : ""} (${r.source}, ${r.as_of.slice(0, 4)}, confidence ${r.confidence})`,
            )
            .join("\n");
          for await (const delta of chat.stream("reasoning", {
            system: `You answer questions about Auckland suburbs using ONLY the numbered data rows provided. Every factual figure MUST be followed by its citation marker {{cN}} matching the row number — e.g. "median rent is $545/wk {{c3}}". Never state a number that is not in the rows. Keep it to 2-5 sentences, plain prose, no headers or lists unless ranking. Deprivation and ethnicity are information, never "better/worse" verdicts; NZDep2018 decile semantics: 1 = least deprived, 10 = most deprived. Rent rows from MBIE tenancy bonds cover new tenancies across ALL dwelling types — if the question asks about a specific dwelling type or bedroom count, give the all-dwellings figure and say that's what it is; never present it as type-specific. If confidence is medium/low, say "approximately" or note the vintage. Commute rules: every commute figure keeps its caveat — precomputed anchor times and routed times are "typical, no live traffic"; a straight-line row is a distance, never present it as a travel time. When a row shows a resolved address for the origin or destination, state it so the user can spot a wrong interpretation. Hazard rules: hazard rows are separate council model layers with different vintages — cite each with its layer and year as given in the row label, treat hazard exposure as one input among many (never a verdict on a suburb), NEVER combine hazard layers into a single risk figure or score, and when any hazard row is cited end the answer with: "${HAZARD_CAVEAT}". If the question asked whether somewhere is "safe", state that these are hazard-model layers only (crime data is not covered) and give no overall safety verdict. Building-consent rows are consents — intentions to build, not completions; if the question asks how many homes were "built" or "completed", give the consents figure and say that's what it measures. Profile-similarity rows rank suburbs by how alike their overall profiles are (census, rent, commute, hazard and planning facts) — NOT by geographic distance. When similarity rows are present, name that basis, and if the question asked for somewhere "near" or "close to" a place, say plainly that these are profile matches rather than the nearest suburbs by distance. Use the accompanying metric rows to answer what was actually asked about those suburbs.\n${personaLine}${weightNotes.length ? ` Persona emphasis weights: ${weightNotes.join("; ")}.` : ""} When you rank or recommend suburbs, state explicitly which factors this persona weighted more heavily (e.g. "${personaCfg.label} mode weights …"). Transparent emphasis only — NEVER compute or present a combined score or index across metrics.${budgetLine} PREFERENCE TRANSPARENCY: the settings in play for this question are ${preferenceNames.join(", ")}. Where a preference shaped what you emphasised, ordered or pointed out, say which one did — the user must never have to guess why an answer leaned a particular way. Preferences bias emphasis only; they never remove a suburb or a figure from consideration. ${plan.note ? `Context note: ${plan.note}` : ""}`,
            messages: [
              {
                role: "user",
                content: `Question: ${question}\n\nData rows:\n${dataBlock}`,
              },
            ],
            maxTokens: 700,
          })) {
            controller.enqueue(ndjson({ type: "delta", text: delta }));
          }
        }
        controller.enqueue(ndjson({ type: "done" }));
      } catch (err) {
        controller.enqueue(
          ndjson({
            type: "error",
            message: err instanceof Error ? err.message : "answer failed",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
