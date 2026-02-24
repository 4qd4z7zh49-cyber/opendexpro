"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const router = useRouter();
  const params = useSearchParams();
  const created = params.get("created");
  const reset = params.get("reset");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const statusMsg = useMemo(() => {
    if (reset === "1") return "Password reset completed. Please log in with your new password.";
    if (created === "1") return "Account created. Please log in.";
    return "";
  }, [created, reset]);

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");

    if (!email.trim()) return setError("Email is required.");
    if (!pw) return setError("Password is required.");

    try {
      setLoading(true);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pw,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace("/home");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card} className="ob-card">
          <h1 style={styles.h1} className="ob-fadeUp">
            Login
          </h1>
          <p style={styles.sub} className="ob-fadeUp ob-delay1">
            Welcome back to OPENBOOK.
          </p>

          <form style={styles.form} className="ob-fadeUp ob-delay2" onSubmit={handleLogin}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <label style={styles.label}>Password</label>
            <div style={styles.pwRow}>
              <input
                style={{ ...styles.input, paddingRight: 54 }}
                placeholder="••••••••"
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                style={styles.eyeBtn}
                aria-label="Toggle password visibility"
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>

            <div style={styles.forgotRow}>
              <Link href="/forgot-password" style={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>

            {statusMsg ? <div style={styles.infoBox}>{statusMsg}</div> : null}
            {error ? <div style={styles.errorBox}>{error}</div> : null}

            <button
              type="submit"
              style={{ ...styles.primaryBtn, opacity: loading ? 0.7 : 1 }}
              disabled={loading}
            >
              {loading ? "Logging in…" : "Login"}
            </button>

            <p style={styles.bottomText}>
              If you don’t have an account,{" "}
              <Link href="/signup" style={styles.linkLike}>
                create account
              </Link>
              .
            </p>
          </form>
        </div>
      </div>

      <style jsx>{`
        .ob-card {
          animation: obPop 520ms ease both;
        }
        .ob-fadeUp {
          opacity: 0;
          transform: translateY(10px);
          animation: obFadeUp 520ms ease forwards;
        }
        .ob-delay1 {
          animation-delay: 80ms;
        }
        .ob-delay2 {
          animation-delay: 140ms;
        }
        @keyframes obFadeUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes obPop {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ob-card,
          .ob-fadeUp {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
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
    fontSize: "clamp(40px, 10vw, 56px)",
    margin: "0 0 6px",
    letterSpacing: -0.6,
    lineHeight: 1.05,
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
  forgotRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: -4,
  },
  forgotLink: {
    fontSize: 13,
    color: "#93c5fd",
    textDecoration: "underline",
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
