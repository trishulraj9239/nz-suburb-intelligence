import type { Status } from "@/lib/viz/status";

/**
 * The shared empty state (TRI-147): a hatched track that is exactly as long as
 * a real one, plus the reason in words. Suppressed data is never drawn as a
 * zero-length bar — that would read as "zero".
 */
export function EmptyTrack({ status, reason, label, height = 8, className = "" }: { status: Status; reason?: string; label: string; height?: number; className?: string }) {
  const word = status === "suppressed" ? "not published" : status === "unavailable" ? "not available" : status;
  return (
    <div role="img" aria-label={`${label}, ${status}${reason ? `: ${reason}` : ""}`} data-status={status} className={`flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`}>
      <span className="nzsi-hatch block min-w-0 grow basis-[60%] rounded-chip border border-hairline/70" style={{ height }} aria-hidden />
      <span className="shrink-0 font-mono text-micro text-ink/55">{reason ?? word}</span>
    </div>
  );
}
