"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "./popover";
import { PersonaToggle } from "./persona-toggle";
import { AnchorsControl } from "./anchors-control";
import { BudgetControl } from "./budget-control";
import { AuthButton } from "./auth-button";
import { ShareLink } from "./share-link";
import { ThemeToggle } from "./theme-toggle";

/**
 * Phone-only "You" menu (TRI-145, Phase A). On a 390 px screen the top bar
 * used to wrap into two rows to fit persona · places · budget · sign-in ·
 * theme; those five now fold into one 40 px button. Desktop keeps them
 * inline (this component is `lg:hidden`, the inline cluster `hidden lg:flex`).
 *
 * The menu's content mounts only while open, so the persona radio group and
 * the "Buying"/"Renting" text exist exactly once in the DOM at any width —
 * the verify scripts that locate them by text keep working.
 *
 * `nzsi:open-places` (dispatched by the Getting Around "Add a place" nudge)
 * opens the menu with the Places control expanded.
 */
export function YouMenu() {
  const [open, setOpen] = useState(false);
  const [openPlaces, setOpenPlaces] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpenPlaces = () => {
      // Only relevant when this (phone) control is visible.
      if (anchorRef.current && getComputedStyle(anchorRef.current).display !== "none") {
        setOpen(true);
        setOpenPlaces(true);
      }
    };
    window.addEventListener("nzsi:open-places", onOpenPlaces);
    return () => window.removeEventListener("nzsi:open-places", onOpenPlaces);
  }, []);

  return (
    <div className="relative lg:hidden">
      <button
        ref={anchorRef}
        type="button"
        aria-label="You — persona, places, budget, sign-in, theme"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpenPlaces(false);
          setOpen((o) => !o);
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-hairline bg-surface text-ink transition-colors hover:border-harbour"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label="You" align="end" width="w-[min(22rem,calc(100vw-1.5rem))]">
        <div className="flex flex-col gap-3">
          <section>
            <h2 className="mb-1.5 text-micro font-semibold uppercase tracking-wider text-ink/55">I am</h2>
            <PersonaToggle />
          </section>
          <section>
            <h2 className="mb-1.5 text-micro font-semibold uppercase tracking-wider text-ink/55">Your places &amp; budget</h2>
            <div className="flex flex-wrap items-center gap-2">
              <AnchorsControl initiallyOpen={openPlaces} />
              <BudgetControl />
            </div>
          </section>
          <section className="flex items-center justify-between gap-2 border-t border-hairline pt-3">
            <ShareLink />
            <AuthButton />
            <ThemeToggle />
          </section>
        </div>
      </Popover>
    </div>
  );
}
