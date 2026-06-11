import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Always run on request — this is a live connection probe, never prerendered.
export const dynamic = "force-dynamic";

/**
 * Connection probe. Runs `select count(*) from geographies` through the server
 * Supabase client. Returns 0 until data lands in M3 — that's the expected,
 * healthy state for this milestone.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("geographies")
      .select("*", { count: "exact", head: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, geographies: count ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
