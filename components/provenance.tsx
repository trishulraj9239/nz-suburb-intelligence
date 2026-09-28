/**
 * TRI-147 — provenance primitives now live in source-chip.tsx. This module
 * re-exports them so existing call sites keep working unchanged until each
 * surface moves onto MetricRow (Phases C–E).
 */
export { ConfidenceChip, ConfidenceLegend, Provenance, SourceChip, confidenceLabel, shortSource } from "./source-chip";
