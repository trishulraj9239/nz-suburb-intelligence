"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getPersona, getWorkplace } from "./preferences";

export const COMPARE_LIMIT = 3;

/** A server-known data row behind an answer — the citation chips and the
 *  sources footer both render from these, so citations stay honest by
 *  construction (the client never invents a source). */
export interface AnswerSource {
  n: number;
  suburb: string;
  sa2_code: string;
  /** metric_key — lets the UI map a planner metric back to its human label. */
  metric: string;
  label: string;
  value: number;
  unit: string | null;
  source: string;
  as_of: string;
  confidence: string;
}

/**
 * One question and its answer. Stored as an ARRAY of turns from day one even
 * though the UI shows only the latest — M18's conversational follow-ups
 * (TRI-95) need the history, and retrofitting a thread shape later would mean
 * touching every surface that reads answer state. `key` is the askSeq at
 * submit time and is what the staleness guard matches on.
 */
export interface AnswerTurn {
  key: number;
  question: string;
  text: string;
  sources: AnswerSource[];
  status: "pending" | "streaming" | "done" | "error";
  error?: string;
  /** Plan intent from the meta frame — drives view switching and map
   *  choreography (TRI-89). Streamed by /api/ask since M5, discarded until now. */
  intent: string | null;
  /** Persona the server actually answered as (TRI-61). */
  persona: string | null;
  /** What the planner read the question as — powers "How this was matched"
   *  (TRI-83). Descriptive only; never a score. */
  match: AnswerMatch | null;
}

/** The planner's decisions, surfaced for transparency (TRI-83). */
export interface AnswerMatch {
  metrics: string[];
  suburbs: string[];
  rankDirection: "asc" | "desc";
  limit: number;
  note: string;
  commute: {
    origin: string | null;
    destination: string | null;
    mode: string;
    max_minutes: number | null;
  };
}

interface WorkspaceState {
  /** sa2_code of the suburb shown in the profile panel, if any. */
  selected: string | null;
  select: (sa2: string | null) => void;
  /** sa2_codes pinned for comparison (max COMPARE_LIMIT). */
  compare: string[];
  toggleCompare: (sa2: string) => void;
  clearCompare: () => void;
  setCompareSet: (codes: string[]) => void;
  /** Active natural-language question (M5 ask flow). askSeq bumps per submit. */
  question: string | null;
  askSeq: number;
  ask: (q: string) => void;
  clearAsk: () => void;
  /** Every turn this session, oldest first (M18-ready). */
  turns: AnswerTurn[];
  /** The turn matching the live askSeq — what the answer surfaces render. */
  currentTurn: AnswerTurn | null;
  /** Clear everything — selection, comparison, answer. resetSeq lets the map
   *  re-centre/un-shade in response (the Home button). */
  reset: () => void;
  resetSeq: number;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [askSeq, setAskSeq] = useState(0);
  const [resetSeq, setResetSeq] = useState(0);
  const [turns, setTurns] = useState<AnswerTurn[]>([]);

  const select = useCallback((sa2: string | null) => setSelected(sa2), []);
  const toggleCompare = useCallback((sa2: string) => {
    setCompare((prev) =>
      prev.includes(sa2)
        ? prev.filter((c) => c !== sa2)
        : prev.length >= COMPARE_LIMIT
          ? prev
          : [...prev, sa2],
    );
  }, []);
  const clearCompare = useCallback(() => setCompare([]), []);
  const setCompareSet = useCallback(
    (codes: string[]) => setCompare(codes.slice(0, COMPARE_LIMIT)),
    [],
  );

  // askSeq is also the turn key, so it's minted from a ref rather than read
  // back out of the setState updater — the effect below and the appended turn
  // must agree on the number in the same tick.
  const seqRef = useRef(0);
  const ask = useCallback((q: string) => {
    const key = ++seqRef.current;
    setQuestion(q);
    setAskSeq(key);
    setTurns((prev) => [
      ...prev,
      {
        key,
        question: q,
        text: "",
        sources: [],
        status: "pending",
        intent: null,
        persona: null,
        match: null,
      },
    ]);
  }, []);
  const clearAsk = useCallback(() => setQuestion(null), []);
  const reset = useCallback(() => {
    setSelected(null);
    setCompare([]);
    setQuestion(null);
    setTurns([]);
    setResetSeq((s) => s + 1);
  }, []);

  const patchTurn = useCallback((key: number, patch: Partial<AnswerTurn>) => {
    setTurns((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  // ---- The ask lifecycle (TRI-82) ------------------------------------------
  // Lives here, not in a surface: the desktop strip, the mobile sheet tab and
  // the map choreography all read the SAME in-flight turn, so crossing the lg
  // breakpoint mid-stream re-mounts a frame without aborting or refetching.
  // Neither surface ever calls /api/ask.
  useEffect(() => {
    if (!question || askSeq === 0) return;
    const key = askSeq;
    const controller = new AbortController();
    let stale = false;

    (async () => {
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The saved workplace rides along so "commute to work" resolves
          // server-side (TRI-54), and the active persona steers metric
          // emphasis (TRI-61); both snapshotted here, not reactive.
          body: JSON.stringify({
            question,
            workplace: getWorkplace() ?? undefined,
            persona: getPersona(),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`ask failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        let sources: AnswerSource[] = [];

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
              sources?: AnswerSource[];
              compare?: string[];
              intent?: string;
              persona?: string;
              match?: AnswerMatch;
              message?: string;
            };
            if (msg.type === "meta") {
              sources = msg.sources ?? [];
              if (msg.compare && msg.compare.length >= 2) setCompareSet(msg.compare);
              patchTurn(key, {
                text: "",
                sources,
                status: "streaming",
                intent: msg.intent ?? null,
                persona: msg.persona ?? null,
                match: msg.match ?? null,
              });
            } else if (msg.type === "delta") {
              text += msg.text ?? "";
              patchTurn(key, { text, sources, status: "streaming" });
            } else if (msg.type === "done") {
              patchTurn(key, { text, sources, status: "done" });
            } else if (msg.type === "error") {
              patchTurn(key, { text, sources, status: "error", error: msg.message });
            }
          }
        }
      } catch (err) {
        if (!stale && !controller.signal.aborted) {
          patchTurn(key, {
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
  }, [question, askSeq, setCompareSet, patchTurn]);

  const currentTurn = useMemo(
    () => turns.find((t) => t.key === askSeq) ?? null,
    [turns, askSeq],
  );

  const value = useMemo(
    () => ({
      selected,
      select,
      compare,
      toggleCompare,
      clearCompare,
      setCompareSet,
      question,
      askSeq,
      ask,
      clearAsk,
      turns,
      currentTurn,
      reset,
      resetSeq,
    }),
    [selected, select, compare, toggleCompare, clearCompare, setCompareSet, question, askSeq, ask, clearAsk, turns, currentTurn, reset, resetSeq],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace outside WorkspaceProvider");
  return ctx;
}
