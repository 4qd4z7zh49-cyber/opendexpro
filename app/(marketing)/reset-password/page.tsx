"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const pwMatch = useMemo(() => pw.length > 0 && pw === pw2, [pw, pw2]);

  useEffect(() => {
    let cancelled = false;

    const prepareRecoverySession = async () => {
      setCheckingSession(true);
      setError("");
      setReady(false);

      try {
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) throw exchangeErr;
        } else if (typeof window !== "undefined") {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const hashType = hash.get("type");
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");

          if (hashType === "recovery" && accessToken && refreshToken) {
            const { error: sessionErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionErr) throw sessionErr;
          }
        }

        const { data, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;
        if (!data?.session) {
          throw new Error("Reset link is invalid or expired. Please request a new one.");
        }

        if (!cancelled) setReady(true);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Reset link is invalid or expired. Please request a new one.";
        if (!cancelled) {
          setError(message);
          setReady(false);
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    };

    void prepareRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setInfo("");

    if (!ready) {
      setError("Reset session is not ready.");
      return;
    }

    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!pwMatch) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const { error: updateErr } = await supabase.auth.updateUser({ password: pw });
      if (updateErr) throw updateErr;

      await supabase.auth.signOut();
      setInfo("Password updated successfully. Redirecting to login...");

      window.setTimeout(() => {
        router.replace("/login?reset=1");
      }, 900);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Reset Password</h1>
          <p style={styles.sub}>Set your new password to continue.</p>

          {checkingSession ? (
            <div style={styles.infoBox}>Validating reset link...</div>
          ) : null}

          <form style={styles.form} onSubmit={onSubmit}>
            <label style={styles.label}>New password</label>
            <div style={styles.pwRow}>
              <input
                style={{ ...styles.input, paddingRight: 54 }}
                placeholder="••••••••"
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                disabled={!ready || checkingSession}
              />
              <button
                type="button"
                style={styles.eyeBtn}
                onClick={() => setShowPw((s) => !s)}
                aria-label="Toggle password visibility"
                disabled={!ready || checkingSession}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>

            <label style={styles.label}>Confirm password</label>
            <div style={styles.pwRow}>
              <input
                style={{ ...styles.input, paddingRight: 54 }}
                placeholder="••••••••"
                type={showPw2 ? "text" : "password"}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                disabled={!ready || checkingSession}
              />
              <button
                type="button"
                style={styles.eyeBtn}
                onClick={() => setShowPw2((s) => !s)}
                aria-label="Toggle confirm password visibility"
                disabled={!ready || checkingSession}
              >
                {showPw2 ? "Hide" : "Show"}
              </button>
            </div>

            {pw2 && !checkingSession ? (
              <div
                style={{
                  ...styles.hint,
                  color: pwMatch ? "rgba(120,255,190,0.92)" : "rgba(255,140,140,0.92)",
                }}
              >
                {pwMatch ? "Passwords match." : "Passwords do not match."}
              </div>
            ) : null}

            {error ? <div style={styles.errorBox}>{error}</div> : null}
            {info ? <div style={styles.infoBox}>{info}</div> : null}

            <button
              type="submit"
              disabled={loading || !ready || checkingSession}
              style={{ ...styles.primaryBtn, opacity: loading || !ready || checkingSession ? 0.7 : 1 }}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

            <p style={styles.bottomText}>
              Need another link?{" "}
              <Link href="/forgot-password" style={styles.linkLike}>
                Request again
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordFallback() {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Reset Password</h1>
          <div style={styles.infoBox}>Loading reset page...</div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    padding: "max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom))",
    boxSizing: "border-box",
  },
  shell: {
    width: "100%",
    maxWidth: 520,
  },
  card: {
    width: "100%",
    borderRadius: 22,
    background: "rgba(16, 18, 22, 0.72)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 20px 70px rgba(0,0,0,0.55)",
    padding: "clamp(16px, 3.5vw, 22px)",
    backdropFilter: "blur(14px)",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  h1: {
    fontSize: "clamp(30px, 8vw, 40px)",
    margin: "0 0 6px",
    letterSpacing: -0.4,
    lineHeight: 1.1,
  },
  sub: {
    margin: "0 0 18px",
    opacity: 0.75,
    fontSize: "clamp(14px, 3.2vw, 16px)",
    lineHeight: 1.4,
  },
  form: { display: "grid", gap: 12 },
  label: { fontSize: 12, opacity: 0.75, letterSpacing: 1, textTransform: "uppercase" },
  input: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
    padding: "0 16px",
    boxSizing: "border-box",
  },
  pwRow: { position: "relative" },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: 9,
    width: 40,
    height: 36,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    cursor: "pointer",
  },
  hint: {
    fontSize: 13,
    opacity: 0.92,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(180deg, rgba(59,130,246,1), rgba(37,99,235,1))",
    color: "white",
    fontWeight: 800,
    fontSize: 18,
    cursor: "pointer",
    marginTop: 6,
  },
  infoBox: {
    borderRadius: 14,
    padding: "10px 12px",
    border: "1px solid rgba(59,130,246,0.35)",
    background: "rgba(59,130,246,0.12)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
  },
  errorBox: {
    borderRadius: 14,
    padding: "10px 12px",
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.12)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
  },
  bottomText: { margin: "8px 0 0", opacity: 0.85, fontSize: 14 },
  linkLike: { color: "#93c5fd", textDecoration: "underline" },
};
