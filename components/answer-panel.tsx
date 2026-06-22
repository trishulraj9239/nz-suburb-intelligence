"use client";

import { Fragment, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace";

/**
 * TRI-29 — the cited answer. Streams NDJSON from /api/ask; renders prose with
 * {{cN}} markers replaced by amber citation chips (the live-wire — the ONLY
 * place amber is used). Chips show source · year and click through to the
 * suburb. The sources footer is the server-known row list, so every citation
 * is traceable by construction.
 */

interface Source {
  n: number;
  suburb: string;
  sa2_code: string;
  label: string;
  value: number;
  unit: string | null;
  source: string;
  as_of: string;
  confidence: string;
}

interface AnswerState {
  key: number;
  text: string;
  sources: Source[];
  status: "streaming" | "done" | "error";
  error?: string;
}

function CitationChip({ s, onSelect }: { s: Source; onSelect: () => void }) {
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
  sources: Source[];
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
  const { question, askSeq, clearAsk, select, setCompareSet } = useWorkspace();
  const [answer, setAnswer] = useState<AnswerState | null>(null);

  useEffect(() => {
    if (!question) return;
    const controller = new AbortController();
    let stale = false;

    (async () => {
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`ask failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        let sources: Source[] = [];

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim() || stale) continue;
            const msg = JSON.parse(line) as {
              type: string;
              text?: string;
              sources?: Source[];
              compare?: string[];
              message?: string;
            };
            if (msg.type === "meta") {
              sources = msg.sources ?? [];
              if (msg.compare && msg.compare.length >= 2) setCompareSet(msg.compare);
              setAnswer({ key: askSeq, text: "", sources, status: "streaming" });
            } else if (msg.type === "delta") {
              text += msg.text ?? "";
              const t = text;
              setAnswer({ key: askSeq, text: t, sources, status: "streaming" });
            } else if (msg.type === "done") {
              const t = text;
              setAnswer({ key: askSeq, text: t, sources, status: "done" });
            } else if (msg.type === "error") {
              setAnswer({
                key: askSeq,
                text,
                sources,
                status: "error",
                error: msg.message,
              });
            }
          }
        }
      } catch (err) {
        if (!stale && !controller.signal.aborted) {
          setAnswer({
            key: askSeq,
            text: "",
            sources: [],
            status: "error",
            error: err instanceof Error ? err.message : "request failed",
          });
        }
      }
    })();

    return () => {
      stale = true;
      controller.abort();
    };
  }, [question, askSeq, setCompareSet]);

  if (!question) return null;
  const current = answer?.key === askSeq ? answer : null;

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
            {current.sources.length > 0 && current.status === "done" && (
              <p className="mt-2 border-t border-hairline pt-2 font-mono text-[10px] text-ink/45">
                Sources:{" "}
                {[...new Set(current.sources.map((s) => `${s.source} ${s.as_of.slice(0, 4)}`))].join(
                  " · ",
                )}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
