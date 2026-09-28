"use client";

import { useState } from "react";
import { LINK_OUTS } from "@/lib/link-outs";
import { ExtLink, GroupHeading, Note, SubHeading } from "./primitives";

export function CopyAddress({ label }: { label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-testid="copy-address"
      className="inline-flex h-8 items-center rounded-control border border-hairline px-2 font-mono text-micro font-normal text-ink/75 hover:bg-canvas"
      onClick={() => {
        navigator.clipboard?.writeText(label).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => setCopied(false),
        );
      }}
    >
      {copied ? "copied" : "copy address"}
    </button>
  );
}

/**
 * TRI-132 / TRI-150 — what the app deliberately does not hold, and where it
 * is. None of these targets accepts an address in the URL (tested
 * 2026-09-28), so the block offers a copy button instead of a fake deep
 * link. Nothing here is fetched, cached or proxied.
 */
export function LinkOuts({ label }: { label: string }) {
  return (
    <>
      <GroupHeading testId="epistemic-notheld">Not held by this app</GroupHeading>
      <SubHeading note="where each is published, and why it is not here" aside={<CopyAddress label={label} />}>
        Also check
      </SubHeading>
      <ul className="divide-y divide-hairline/60" data-testid="link-outs">
        {LINK_OUTS.map((l) => (
          <li key={l.key} className="py-1.5" data-testid="link-out">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-body text-ink/80">{l.what}</span>
              <ExtLink href={l.url} className="text-label">
                {l.where} ↗
              </ExtLink>
            </div>
            <Note className="mt-0.5">{l.reason}</Note>
          </li>
        ))}
      </ul>
    </>
  );
}
