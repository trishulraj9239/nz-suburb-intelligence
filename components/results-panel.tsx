"use client";

import { useWorkspace, type AnswerTurn } from "@/lib/workspace";
import { BudgetChip } from "./budget-chip";
import { ConfidenceChip, shortSource } from "./provenance";

/**
 * TRI-104 — the persistent home for a rank answer, beyond the answer strip's
 * pills. Rows come straight from the lifted AnswerState's server rows (TRI-82),
 * in the server's order: this table never re-sorts, so what it shows is exactly
 * what was cited.
 *
 * Framing is stated in the header rather than implied — a rank covers all
 * suburbs that HAVE the metric, which is not always all 633 (suppression and
 * vintage gaps are real), so the row count is named explicitly.
 */

interface Row {
  sa2: string;
  suburb: string;
  value: number;
  unit: string | null;
  label: string;
  source: string;
  as_of: string;
  confidence: string;
}

/** First row per suburb in server order — for a rank that IS the ranking. */
export function rankedRows(turn: AnswerTurn | null): Row[] {
  if (!turn) return [];
  const seen = new Map<string, Row>();
  for (const r of turn.sources) {
    if (!seen.has(r.sa2_code)) {
      seen.set(r.sa2_code, {
        sa2: r.sa2_code,
        suburb: r.suburb,
        value: r.value,
        unit: r.unit,
        label: r.label,
        source: r.source,
        as_of: r.as_of,
        confidence: r.confidence,
      });
    }
  }
  return [...seen.values()];
}

function formatValue(value: number, unit: string | null) {
  const n = value.toLocaleString();
  if (unit === "$/week") return `$${n}/wk`;
  if (unit === "%") return `${n}%`;
  if (unit === "min") return `${n} min`;
  return unit ? `${n} ${unit}` : n;
}

export function ResultsPanel() {
  const { currentTurn, select, setHovered, compare } = useWorkspace();
  const rows = rankedRows(currentTurn);

  if (!rows.length) {
    return (
      <p className="text-sm text-ink/60">
        Ask a ranking question — “lowest median rent”, “most new dwellings consented” — and the
        full ordered list appears here.
      </p>
    );
  }

  const head = rows[0];
  const isRent = head.unit === "$/week";

  return (
    <div className="flex flex-col gap-2" onMouseLeave={() => setHovered(null)}>
      <p className="text-xs text-ink/60">
        {rows.length} covered {rows.length === 1 ? "area" : "areas"}, ranked by{" "}
        <span className="font-medium text-ink/80">{head.label}</span>. Hover a row to highlight it
        on the map; click to open it.
      </p>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-canvas text-left">
              <th scope="col" className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/45">
                #
              </th>
              <th scope="col" className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/45">
                Suburb
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-mono text-[10px] uppercase tracking-wider text-ink/45">
                {head.label}
              </th>
              {isRent && <th scope="col" className="px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.sa2}
                onMouseEnter={() => setHovered(r.sa2)}
                onClick={() => select(r.sa2)}
                className={`cursor-pointer border-b border-hairline/60 last:border-0 transition-colors hover:bg-harbour/8 ${
                  compare.includes(r.sa2) ? "bg-harbour/6" : ""
                }`}
              >
                <td className="px-2 py-1.5 font-mono text-[11px] text-ink/45">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium text-ink">{r.suburb}</td>
                <td className="px-2 py-1.5 text-right font-mono text-ink">
                  {formatValue(r.value, r.unit)}
                </td>
                {isRent && (
                  <td className="px-2 py-1.5 text-right">
                    <BudgetChip rent={r.value} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-ink/45">
        <span>Source:</span>
        {shortSource(head.source)} {head.as_of.slice(0, 4)}
        <ConfidenceChip confidence={head.confidence} />
      </p>
    </div>
  );
}
