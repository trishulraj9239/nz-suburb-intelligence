"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSuburbs, type Suburb } from "@/lib/suburb-data";
import { useWorkspace } from "@/lib/workspace";

/** Name search over the 627 active suburbs — the picker half of "map + picker". */
export function SuburbSearch() {
  const { select } = useWorkspace();
  const [all, setAll] = useState<Suburb[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSuburbs().then(setAll).catch(() => setAll([]));
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const matches = q.trim()
    ? all.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

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
        placeholder="Find a suburb…"
        aria-label="Find a suburb"
        className="h-9 w-full rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-ink/40 focus:border-harbour focus:outline-none"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg">
          {matches.map((s) => (
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
        </ul>
      )}
    </div>
  );
}
