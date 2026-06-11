import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Reads only NEXT_PUBLIC_ vars, so nothing
 * server-only is ever shipped to the client.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
