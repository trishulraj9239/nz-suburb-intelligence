import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getChat, getEmbeddings } from "@/lib/llm";

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
  intent: "lookup" | "rank" | "compare" | "similar" | "unsupported";
  metric_keys: string[];
  suburbs: string[];
  rank_direction: "asc" | "desc";
  limit: number;
  note: string;
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
      enum: ["lookup", "rank", "compare", "similar", "unsupported"],
      description:
        "lookup: facts about named suburb(s). rank: order Auckland suburbs by a metric. compare: 2-3 named suburbs side by side. similar: find suburbs like a named suburb OR matching a described vibe/criteria. unsupported: anything else.",
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
  },
  required: ["intent", "metric_keys", "suburbs", "rank_direction", "limit", "note"],
} as const;

export async function POST(req: NextRequest) {
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim() || question.length > 500) {
    return Response.json({ error: "question required (max 500 chars)" }, { status: 400 });
  }

  const supabase = await createClient();
  const chat = getChat();

  // Metric registry drives the planner prompt — metrics are data, not code.
  const { data: defs } = await supabase
    .from("metric_definitions")
    .select("metric_key,label,dimension,unit,value_type,higher_is_better")
    .eq("is_active", true)
    .order("display_order");
  const registry = defs ?? [];
  const scalarKeys = registry.filter((d) => d.value_type === "scalar").map((d) => d.metric_key);

  // ---- 1. PLAN -------------------------------------------------------------
  const planText = await chat.complete("reasoning", {
    system: `You convert questions about Auckland (NZ) suburbs into a structured query plan. Coverage: Auckland region SA2 areas only; Census 2023/2018/2013, NZDep2018 deprivation, school directory. Metric registry (key | label | unit):\n${registry
      .map((d) => `${d.metric_key} | ${d.label} | ${d.unit ?? "-"}`)
      .join("\n")}\nRules: deprivation and ethnicity have no "better/worse" — a rank by nzdep_decile is allowed but is informational only. Questions needing data we don't have (crime, transport, prices outside rent/income, other cities) are unsupported.`,
    messages: [{ role: "user", content: question }],
    maxTokens: 500,
    jsonSchema: PLAN_SCHEMA as unknown as Record<string, unknown>,
  });
  let plan: Plan;
  try {
    plan = JSON.parse(planText) as Plan;
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
          label: md.label,
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
    const limit = Math.min(Math.max(plan.limit || 5, 1), 10);
    const { data: vals } = await supabase
      .from("metric_values")
      .select(
        "value_num, as_of_date, confidence, geographies!inner(name, sa2_code, is_active), metric_definitions!inner(metric_key,label,unit), sources(name)",
      )
      .is("category", null)
      .eq("metric_definitions.metric_key", metric)
      .eq("geographies.is_active", true)
      .eq("as_of_date", "2023-03-07")
      .not("value_num", "is", null)
      .order("value_num", { ascending: plan.rank_direction === "asc" })
      .limit(limit);
    for (const v of vals ?? []) {
      const g = v.geographies as unknown as { name: string; sa2_code: string };
      rows.push({
        n: rows.length + 1,
        suburb: g.name,
        sa2_code: g.sa2_code,
        metric,
        label: def?.label ?? metric,
        value: Number(v.value_num),
        unit: def?.unit ?? null,
        source: (v.sources as unknown as { name: string } | null)?.name ?? "—",
        as_of: v.as_of_date,
        confidence: v.confidence,
      });
    }
    // NZDep rank for 2023 census date doesn't exist — retry on its own date.
    if (rows.length === 0 && metric.startsWith("nzdep")) {
      const { data: depVals } = await supabase
        .from("metric_values")
        .select(
          "value_num, as_of_date, confidence, geographies!inner(name, sa2_code, is_active), metric_definitions!inner(metric_key,label,unit), sources(name)",
        )
        .is("category", null)
        .eq("metric_definitions.metric_key", metric)
        .eq("geographies.is_active", true)
        .not("value_num", "is", null)
        .order("value_num", { ascending: plan.rank_direction === "asc" })
        .limit(limit);
      for (const v of depVals ?? []) {
        const g = v.geographies as unknown as { name: string; sa2_code: string };
        rows.push({
          n: rows.length + 1,
          suburb: g.name,
          sa2_code: g.sa2_code,
          metric,
          label: def?.label ?? metric,
          value: Number(v.value_num),
          unit: def?.unit ?? null,
          source: (v.sources as unknown as { name: string } | null)?.name ?? "—",
          as_of: v.as_of_date,
          confidence: v.confidence,
        });
      }
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
    for (const s of similar) {
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
        }),
      );
      try {
        if (plan.intent === "unsupported" || rows.length === 0) {
          const msg =
            plan.intent === "unsupported"
              ? `I can't answer that with the data I have. ${plan.note} I cover Auckland suburbs: census demographics and housing, NZDep deprivation, and schools.`
              : "I couldn't match that question to any suburbs or metrics I track. Try naming an Auckland suburb, or asking for a ranking like “lowest median rent”.";
          controller.enqueue(ndjson({ type: "delta", text: msg }));
        } else {
          const dataBlock = rows
            .map(
              (r) =>
                `[${r.n}] ${r.suburb} — ${r.label}: ${r.value}${r.unit ? ` ${r.unit}` : ""} (${r.source}, ${r.as_of.slice(0, 4)}, confidence ${r.confidence})`,
            )
            .join("\n");
          for await (const delta of chat.stream("reasoning", {
            system: `You answer questions about Auckland suburbs using ONLY the numbered data rows provided. Every factual figure MUST be followed by its citation marker {{cN}} matching the row number — e.g. "median rent is $545/wk {{c3}}". Never state a number that is not in the rows. Keep it to 2-5 sentences, plain prose, no headers or lists unless ranking. Deprivation and ethnicity are information, never "better/worse" verdicts. If confidence is medium/low, say "approximately" or note the vintage.`,
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
