"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  COMPARE_LIMIT,
  useWorkspace,
  type AnswerSource,
  type AnswerTurn,
} from "@/lib/workspace";
import { ConfidenceChip, shortSource } from "./provenance";
import { QuestionChips } from "./question-chips";

/**
 * TRI-83/84 — the ONE answer body. Both frames (desktop strip, mobile sheet
 * tab) render this; it owns everything about how an answer looks and behaves,
 * so the two surfaces cannot drift. The frames own only placement and the
 * max-height NUMBER — the cap MECHANISM (what scrolls, what stays pinned) is
 * here.
 *
 * Fetching lives in WorkspaceProvider (TRI-82). Nothing here talks to the API.
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

/** Suburbs cited by this answer, in the order the server returned them — for a
 *  rank that IS the ranking. Value shown is the first row per suburb, which is
 *  the metric the question was ranked/answered on. Never re-sorted client-side:
 *  the order is the server's, like the citations. */
function resultPills(turn: AnswerTurn) {
  const seen = new Map<string, { sa2: string; suburb: string; value: number; unit: string | null }>();
  for (const r of turn.sources) {
    if (!seen.has(r.sa2_code)) {
      seen.set(r.sa2_code, {
        sa2: r.sa2_code,
        suburb: r.suburb,
        value: r.value,
        unit: r.unit,
      });
    }
  }
  return [...seen.values()];
}

function fmt(value: number, unit: string | null) {
  const n = Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString();
  if (unit === "$/week") return `$${n}/wk`;
  if (unit === "%") return `${n}%`;
  if (unit === "min") return `${n} min`;
  return unit ? `${n} ${unit}` : `${n}`;
}

function ResultPills({ turn }: { turn: AnswerTurn }) {
  const { compare, toggleCompare, select } = useWorkspace();
  const pills = resultPills(turn);
  if (pills.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((p, i) => {
        const pinned = compare.includes(p.sa2);
        const full = !pinned && compare.length >= COMPARE_LIMIT;
        return (
          <span
            key={p.sa2}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas py-0.5 pl-1 pr-1"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-harbour/15 font-mono text-[10px] text-ink/70">
              {i + 1}
            </span>
            <button
              type="button"
              onClick={() => select(p.sa2)}
              className="text-xs font-medium text-ink hover:text-harbour"
            >
              {p.suburb}
            </button>
            <span className="font-mono text-[11px] text-ink/60">{fmt(p.value, p.unit)}</span>
            <button
              type="button"
              disabled={full}
              onClick={() => toggleCompare(p.sa2)}
              title={
                full ? `Comparison is full (max ${COMPARE_LIMIT})` : undefined
              }
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                pinned
                  ? "bg-harbour text-white"
                  : full
                    ? "cursor-not-allowed text-ink/30"
                    : "text-ink/60 hover:bg-harbour/10 hover:text-ink"
              }`}
            >
              {pinned ? "✓ Comparing" : "+ Compare"}
            </button>
          </span>
        );
      })}
    </div>
  );
}

/**
 * TRI-105 — the filters this answer actually applied, each removable. Removing
 * one re-asks the SAME question with that constraint dropped, as a new turn, so
 * the original answer isn't rewritten under the user.
 *
 * Only constraints that were applied appear. A constraint the user already
 * dropped is absent rather than shown struck through — the chips describe this
 * answer, not the history of how it was reached.
 */
function ConstraintChips({ turn }: { turn: AnswerTurn }) {
  const { ask } = useWorkspace();
  if (!turn.constraints.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-ink/45">
        Filters
      </span>
      {turn.constraints.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-hairline bg-canvas py-0.5 pl-2.5 pr-1 text-[11px] text-ink/80"
        >
          {c.label}
          <button
            type="button"
            onClick={() => ask(turn.question, [...turn.relax, c.key])}
            aria-label={`Remove filter: ${c.label}, and ask again`}
            title="Remove this filter and ask again"
            className="rounded-full px-1 text-ink/40 transition-colors hover:bg-harbour/10 hover:text-ink"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

/** Transparency disclosure — what the planner read the question as. Descriptive
 *  only. Metric keys are shown with the human label from the rows when we have
 *  one, so this never displays a name the rest of the UI doesn't use. */
function HowMatched({ turn }: { turn: AnswerTurn }) {
  const [open, setOpen] = useState(false);
  const m = turn.match;
  if (!m) return null;

  // Prefer the label the rest of the UI uses; fall back to a readable form of
  // the key (a "similar" answer cites embedding rows, so the planner's metrics
  // may have no row to borrow a label from).
  const labelFor = (key: string) =>
    turn.sources.find((s) => s.metric === key)?.label ??
    key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  const lines: [string, string][] = [];
  if (turn.intent) lines.push(["Read as", turn.intent]);
  if (m.metrics.length) lines.push(["Metrics", m.metrics.map(labelFor).join(", ")]);
  if (m.suburbs.length) lines.push(["Places named", m.suburbs.join(", ")]);
  if (turn.intent === "rank")
    lines.push([
      "Ordering",
      `${m.rankDirection === "asc" ? "lowest first" : "highest first"}, top ${m.limit}`,
    ]);
  if (m.commute?.destination)
    lines.push([
      "Trip",
      `${m.commute.origin ?? "suburb"} → ${m.commute.destination}${m.commute.max_minutes ? ` (within ${m.commute.max_minutes} min)` : ""}`,
    ]);
  if (turn.persona) lines.push(["Persona weighting", turn.persona]);
  if (m.note) lines.push(["Note", m.note]);
  if (!lines.length) return null;

  return (
    <div className="text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-ink/45 transition-colors hover:text-ink"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        How this was matched
      </button>
      {open && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-hairline bg-canvas p-2">
          {lines.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-ink/45">{k}</dt>
              <dd className="text-ink/75">{v}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

export function AnswerThread({ maxHeight }: { maxHeight?: string }) {
  const { question, currentTurn, select } = useWorkspace();

  // Auto-follow while streaming, but stop the moment the user scrolls up —
  // yanking someone back to the bottom mid-read is the classic chat-UI sin.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const follow = useRef(true);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);
  const streamingText = currentTurn?.status === "streaming" ? currentTurn.text : null;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [streamingText]);
  // A new question always starts pinned to the top of its own answer.
  useEffect(() => {
    follow.current = true;
  }, [currentTurn?.key]);

  if (!question) return null;
  const current = currentTurn && currentTurn.status !== "pending" ? currentTurn : null;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={maxHeight ? { maxHeight } : undefined}
      className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain"
    >
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
            <p className="text-xs text-ink/60">
              Something went wrong{current.error ? ` — ${current.error}` : ""}. Try again.
            </p>
          )}

          <ConstraintChips turn={current} />
          <ResultPills turn={current} />
          <HowMatched turn={current} />
          <QuestionChips variant="follow-up" />

          {current.sources.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline pt-2 font-mono text-[10px] text-ink/45">
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
  );
}
