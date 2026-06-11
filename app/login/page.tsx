"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(
    searchParams.get("error") === "invalid-link"
      ? "That sign-in link was invalid or expired — request a new one."
      : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface p-6">
        <h1 className="font-display text-lg font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink/60">
          We&apos;ll email you a magic link — no password needed.
        </p>

        {status === "sent" ? (
          <div className="mt-5 rounded-lg border border-hairline bg-canvas p-4 text-sm text-ink">
            Check your inbox — a sign-in link is on its way to{" "}
            <span className="font-mono">{email}</span>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="h-10 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-ink/40 focus:border-harbour focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="h-10 rounded-lg bg-harbour text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}

        {message && (
          <p className="mt-3 text-sm text-ink/70" role="alert">
            {message}
          </p>
        )}

        <Link
          href="/"
          className="mt-5 inline-block text-sm text-harbour hover:underline"
        >
          ← Back to the map
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
