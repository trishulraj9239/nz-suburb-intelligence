import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "./cookie-options";

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server
 * Actions). Wires Supabase auth into Next's cookie store via @supabase/ssr.
 * Still reads the public anon key — the service-role key is never used here and
 * must never reach the client.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore when
            // session refresh is handled by middleware.
          }
        },
      },
    },
  );
}
