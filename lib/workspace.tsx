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
import { getAnchors, getPersona, getRentBudget, getWorkplace } from "./preferences";
import { hasUrlState, parseUrlState, writeUrlState } from "./url-state";

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
  /** Constraints that actually shaped this answer (TRI-105), each removable. */
  constraints: AnswerConstraint[];
  /** Constraint keys the user dropped for this turn. */
  relax: string[];
}

/** A filter the answer applied, shown so it can be seen and removed (TRI-105). */
export interface AnswerConstraint {
  key: string;
  label: string;
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

/** TRI-122 — an address the user searched for. It is a pin and a banner only:
 *  the profile shown is the containing SA2's, and no figure ever attaches to
 *  the address itself. The label is what the geocoder resolved, so a wrong
 *  interpretation is visible, never silent. */
export interface AddressPin {
  label: string;
  lng: number;
  lat: number;
  sa2_code: string;
  sa2_name: string | null;
}

interface WorkspaceState {
  /** sa2_code of the suburb shown in the profile panel, if any. */
  selected: string | null;
  select: (sa2: string | null) => void;
  /** TRI-141 — the shortlist: every address the user picked this session,
   *  oldest first, capped at COMPARE_LIMIT (the oldest drops off). Pins carry
   *  no data of their own; Home clears them. */
  pins: AddressPin[];
  /** The pin whose SA2 is the selected suburb (TRI-122 banner + facts); null
   *  when the selection came from a suburb name or a map click. Derived. */
  pin: AddressPin | null;
  /** Append to the shortlist and select its SA2. With two or more pins the
   *  SA2s join the compare set, so the Compare panel shows a column per
   *  address (same-SA2 pins share one column). */
  selectAddress: (pin: AddressPin) => void;
  removePin: (label: string) => void;
  /** sa2_codes pinned for comparison (max COMPARE_LIMIT). */
  compare: string[];
  toggleCompare: (sa2: string) => void;
  clearCompare: () => void;
  setCompareSet: (codes: string[]) => void;
  /** Active natural-language question (M5 ask flow). askSeq bumps per submit. */
  question: string | null;
  askSeq: number;
  ask: (q: string, relax?: string[]) => void;
  clearAsk: () => void;
  /** Transient row-hover from the Results table (TRI-104) — the map paints an
   *  emphasis for it. Not selection: hovering never opens a profile. */
  hovered: string | null;
  setHovered: (sa2: string | null) => void;
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [pins, setPins] = useState<AddressPin[]>([]);
  // The banner/facts pin is whichever shortlisted address sits in the
  // selected SA2 (the most recent if several) — so selecting another suburb
  // never shows an address in an area it isn't in, and the shortlist stays.
  const pin = useMemo(() => [...pins].reverse().find((p) => p.sa2_code === selected) ?? null, [pins, selected]);

  const select = useCallback((sa2: string | null) => {
    setSelected(sa2);
  }, []);
  const selectAddress = useCallback((p: AddressPin) => {
    setPins((prev) => {
      const rest = prev.filter((x) => x.label !== p.label);
      const next = [...rest, p];
      const capped = next.length > COMPARE_LIMIT ? next.slice(next.length - COMPARE_LIMIT) : next;
      // Two or more pins: their areas become the comparison (one column per
      // SA2 — two addresses in one SA2 share a column, never two identical ones).
      if (capped.length >= 2) {
        setCompare((c) => {
          const codes = [...new Set([...c, ...capped.map((x) => x.sa2_code)])];
          return codes.slice(Math.max(0, codes.length - COMPARE_LIMIT));
        });
      }
      return capped;
    });
    setSelected(p.sa2_code);
  }, []);
  const removePin = useCallback((label: string) => {
    setPins((prev) => prev.filter((x) => x.label !== label));
  }, []);
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
  // `relax` carries constraint keys the user dismissed on the previous
  // answer (TRI-105). Held on the turn so a re-run is a new turn, not a mutation
  // of the old one — the original answer stays in the thread, as asked.
  const relaxRef = useRef<string[]>([]);
  const ask = useCallback((q: string, relax: string[] = []) => {
    const key = ++seqRef.current;
    relaxRef.current = relax;
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
        constraints: [],
        relax,
      },
    ]);
  }, []);
  const clearAsk = useCallback(() => setQuestion(null), []);
  const reset = useCallback(() => {
    setSelected(null);
    setPins([]);
    setCompare([]);
    setQuestion(null);
    setTurns([]);
    setHovered(null);
    setResetSeq((s) => s + 1);
  }, []);

  // ---- URL state (TRI-97) ---------------------------------------------------
  // Read once after hydration (the server renders an empty workspace, so a
  // lazy initialiser would mismatch), restore selection + compare directly and
  // re-run the question through the ONE ask path — exactly one /api/ask.
  // Scheduled as a task so the restore is not a synchronous setState in an
  // effect. Writes start only after the restore has been applied, so an empty
  // first render never wipes the link the reader arrived with.
  const urlReadyRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const s = parseUrlState(window.location.search);
      if (hasUrlState(s)) {
        if (s.sa2) setSelected(s.sa2);
        if (s.compare.length >= 2) setCompare(s.compare);
        if (s.q) ask(s.q);
      }
      urlReadyRef.current = true;
    }, 0);
    return () => clearTimeout(t);
    // ask is stable (useCallback with no deps); this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!urlReadyRef.current) return;
    writeUrlState({ sa2: selected, compare: compare.length >= 2 ? compare : [], q: question });
  }, [selected, compare, question]);

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
          // Preferences ride along so the server can resolve "to work" and
          // state what it weighted (TRI-54 → TRI-92). All snapshotted at submit
          // time, not reactive: an answer should reflect the settings the
          // question was asked under, even if the user changes them mid-stream.
          // `workplace` stays for compatibility; anchors supersede it.
          body: JSON.stringify({
            question,
            workplace: getWorkplace() ?? undefined,
            anchors: getAnchors(),
            budget: getRentBudget() ?? undefined,
            persona: getPersona(),
            relax: relaxRef.current,
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
              constraints?: AnswerConstraint[];
              message?: string;
            };
            if (msg.type === "meta") {
              sources = msg.sources ?? [];
              if (msg.compare && msg.compare.length >= 2) setCompareSet(msg.compare);
              // TRI-89 — the planner's intent drives the map, not just the
              // panel. A lookup/commute answer about ONE suburb opens it (the
              // answer and the map agree on what's being discussed); a rank
              // deliberately does NOT select, so the map stays at coverage and
              // the whole ranked field remains visible. Only ever a suburb the
              // server actually cited.
              if (msg.intent === "lookup" || msg.intent === "commute") {
                const codes = [...new Set(sources.map((s) => s.sa2_code))];
                if (codes.length === 1) setSelected(codes[0]);
              }
              patchTurn(key, {
                text: "",
                sources,
                status: "streaming",
                intent: msg.intent ?? null,
                persona: msg.persona ?? null,
                match: msg.match ?? null,
                constraints: msg.constraints ?? [],
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
      pins,
      pin,
      selectAddress,
      removePin,
      compare,
      toggleCompare,
      clearCompare,
      setCompareSet,
      question,
      askSeq,
      ask,
      clearAsk,
      hovered,
      setHovered,
      turns,
      currentTurn,
      reset,
      resetSeq,
    }),
    [selected, select, pins, pin, selectAddress, removePin, compare, toggleCompare, clearCompare, setCompareSet, question, askSeq, ask, clearAsk, hovered, turns, currentTurn, reset, resetSeq],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace outside WorkspaceProvider");
  return ctx;
}
