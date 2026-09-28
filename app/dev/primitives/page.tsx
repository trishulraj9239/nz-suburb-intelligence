import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

/**
 * /dev/primitives (TRI-147) — every primitive × every status × both themes on
 * one page, so the design verify script can screenshot and assert the
 * grammar (labels, hatch, outlined estimates, contrast, 12 px floor). Dev only.
 */
export const dynamic = "force-static";

export default function PrimitivesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
