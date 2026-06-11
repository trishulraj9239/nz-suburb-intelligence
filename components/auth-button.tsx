"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Hydration guard without effect-state (see theme-toggle for rationale).
const noopSubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(noopSubscribe, () => true, () => false);

/**
 * Top-bar auth widget: signed-out → "Sign in" link; signed-in → email + sign
 * out. Subscribes to auth state so it updates without a reload after the
 * magic-link round trip.
 */
export function AuthButton() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const mounted = useMounted();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  // Reserve layout space pre-mount to avoid a top-bar shift.
  if (!mounted) return <span className="h-8 w-16" aria-hidden />;

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-8 items-center rounded-md border border-hairline bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-harbour"
      >
        Sign in
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate font-mono text-[11px] text-ink/70 md:inline">
        {user.email}
      </span>
      <button
        type="button"
        onClick={signOut}
        className="inline-flex h-8 items-center rounded-md border border-hairline bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-harbour"
      >
        Sign out
      </button>
    </span>
  );
}
