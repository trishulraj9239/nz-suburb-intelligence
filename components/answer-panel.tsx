"use client";

import { Fragment } from "react";
import { useWorkspace, type AnswerSource } from "@/lib/workspace";
import { ConfidenceChip, shortSource } from "./provenance";

/**
 * TRI-29 — the cited answer (TRI-32: provenance surfaced). Renders prose with
 * {{cN}} markers replaced by amber citation chips (the live-wire — the ONLY
 * place amber is used). Chips show source · year and click through to the
 * suburb. The sources footer is the server-known row list — shown from the
 * moment sources arrive (not just on done) and carrying each source's
 * confidence — so every citation is traceable by construction.
 *
 * TRI-82: this is now a PURE RENDERER. The /api/ask fetch, NDJSON parsing and
 * staleness guard live in WorkspaceProvider so every answer surface reads one
 * in-flight turn. Do not reintroduce fetching or answer state here — a second
 * surface (TRI-83/TRI-84) would fork the stream.
 */

function CitationChip({ s, onSelect }: { s: AnswerSource; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${s.suburb} — ${s.label}: ${s.value}${s.unit ? ` ${s.unit}` : ""} · ${s.source} · ${s.as_of.slice(0, 4)}${s.confidence !== "high" ? ` · confidence ${s.confidence}` : ""}`}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded border border-amber/50 bg-amber/15 px-1 font-mono text-[10px] leading-4 text-ink transition-colors hover:bg-amber/30"
    >
      {s.source.replace("NZDep2018 Deprivation Index", "NZDep2018")} ·{" "}
      {s.as_of.slice(0, 4)}
    </button>
  );
}

function CitedText({ text, sources, onSelect }: {
  text: string;
  sources: AnswerSource[];
  onSelect: (sa2: string) => void;
}) {
  const parts = text.split(/\{\{c(\d+)\}\}/g);
  return (
    <p className="text-sm leading-relaxed text-ink/90">
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const src = sources.find((s) => s.n === Number(part));
        return src ? (
          <CitationChip key={i} s={src} onSelect={() => onSelect(src.sa2_code)} />
        ) : null;
      })}
    </p>
  );
}

export function AnswerPanel() {
  const { question, currentTurn, clearAsk, select } = useWorkspace();

  if (!question) return null;
  // "pending" = submitted, nothing back yet → the Thinking… state.
  const current = currentTurn && currentTurn.status !== "pending" ? currentTurn : null;

  return (
    <section className="rounded-xl border border-hairline bg-canvas p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-wider text-ink/55">
          Answer
        </p>
        <button
          type="button"
          onClick={clearAsk}
          aria-label="Dismiss answer"
          className="text-xs text-ink/40 hover:text-ink"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-xs italic text-ink/50">“{question}”</p>

      <div className="mt-2">
        {!current && <p className="text-sm text-ink/50">Thinking…</p>}
        {current && (
          <>
            <CitedText
              text={current.text}
              sources={current.sources}
              onSelect={(sa2) => select(sa2)}
            />
            {current.status === "streaming" && (
              <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-harbour/60" />
            )}
            {current.status === "error" && (
              <p className="mt-2 text-xs text-ink/60">
                Something went wrong{current.error ? ` — ${current.error}` : ""}. Try again.
              </p>
            )}
            {current.sources.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline pt-2 font-mono text-[10px] text-ink/45">
                <span>Sources:</span>
                {[
                  ...new Map(
                    current.sources.map((s) => [
                      `${s.source}|${s.as_of.slice(0, 4)}|${s.confidence}`,
                      s,
                    ]),
                  ).values(),
                ].map((s) => (
                  <span
                    key={`${s.source}|${s.as_of}|${s.confidence}`}
                    className="inline-flex items-center gap-1"
                  >
                    {shortSource(s.source)} {s.as_of.slice(0, 4)}
                    <ConfidenceChip confidence={s.confidence} />
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
