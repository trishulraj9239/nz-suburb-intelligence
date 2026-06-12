/**
 * Shared auth-cookie posture (security hardening pass):
 *  - secure: cookies only travel over HTTPS in production (Vercel is
 *    HTTPS-only; localhost dev stays plain-HTTP workable).
 *  - sameSite lax: blocks cross-site POST replay of the session cookie while
 *    keeping the magic-link redirect flow working.
 * Note on "encryption": the session cookie carries Supabase-signed JWTs
 * (tamper-proof, not secret-encrypted) — transport encryption is TLS, and the
 * magic-link token itself is stored only as a hash on Supabase's side and is
 * single-use with a short TTL. The cookie is intentionally not httpOnly
 * because the browser client must read it; XSS exposure is mitigated by no
 * dangerouslySetInnerHTML / no third-party scripts in this app.
 */
export const authCookieOptions = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};
