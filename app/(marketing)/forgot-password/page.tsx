"use client";

import Link from "next/link";
import { useState } from "react";

type ForgotPasswordResponse = {
  ok?: boolean;
  error?: string;
  resetUrl?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_MS = 5000;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setConfirmOpen(false);

    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail) {
      setError("Email is required.");
      return;
    }
    if (!EMAIL_REGEX.test(nextEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setEmail(nextEmail);
    setConfirmOpen(true);
  }

  async function onAskReset() {
    if (!email || !EMAIL_REGEX.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    setAsking(true);
    setVerifying(true);
    setConfirmOpen(false);
    setProgress(0);

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.max(0, Math.min(1, elapsed / VERIFY_MS));
      setProgress(Math.round(ratio * 100));
    }, 70);

    try {
      const requestPromise = fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const [r] = await Promise.all([
        requestPromise,
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, VERIFY_MS);
        }),
      ]);

      const j = (await r.json().catch(() => ({}))) as ForgotPasswordResponse;

      if (!r.ok) {
        throw new Error(j?.error || "Failed to verify this email.");
      }
      if (!j?.resetUrl) {
        throw new Error("Reset URL is missing. Please try again.");
      }

      window.location.assign(j.resetUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to verify this email.");
      setVerifying(false);
      setProgress(0);
    } finally {
      window.clearInterval(intervalId);
      setProgress(100);
      setAsking(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Forgot Password</h1>
          <p style={styles.sub}>Enter your email to reset your opendex password.</p>

          <form style={styles.form} onSubmit={onSubmit}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={verifying}
            />

            {error ? <div style={styles.errorBox}>{error}</div> : null}

            <button type="submit" disabled={asking || verifying} style={{ ...styles.primaryBtn, opacity: asking || verifying ? 0.7 : 1 }}>
              Continue
            </button>

            <p style={styles.bottomText}>
              Remembered your password?{" "}
              <Link href="/login" style={styles.linkLike}>
                Back to login
              </Link>
            </p>
          </form>

          {confirmOpen ? (
            <div style={styles.confirmBox}>
              <div style={styles.confirmTitle}>Ask confirmation to reset opendex password?</div>
              <div style={styles.confirmEmail}>{email}</div>
              <div style={styles.confirmActions}>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => {
                    if (asking || verifying) return;
                    setConfirmOpen(false);
                  }}
                  disabled={asking || verifying}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  style={{ ...styles.primaryBtn, height: 46, marginTop: 0 }}
                  onClick={() => void onAskReset()}
                  disabled={asking || verifying}
                >
                  Ask
                </button>
              </div>
            </div>
          ) : null}

          {verifying ? (
            <div style={styles.verifyBox} aria-live="polite">
              <div style={styles.verifyTitle}>Verifying...</div>
              <div style={styles.verifyTrack}>
                <div style={{ ...styles.verifyBar, width: `${progress}%` }} />
              </div>
              <div style={styles.verifySub}>Please wait while we prepare your reset session.</div>
            </div>
          ) : null}
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
  confirmBox: {
    marginTop: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    padding: "12px",
    display: "grid",
    gap: 10,
  },
  confirmTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "rgba(255,255,255,0.95)",
  },
  confirmEmail: {
    fontSize: 13,
    opacity: 0.85,
    wordBreak: "break-all",
  },
  confirmActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  secondaryBtn: {
    height: 46,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  verifyBox: {
    marginTop: 14,
    borderRadius: 16,
    border: "1px solid rgba(59,130,246,0.35)",
    background: "rgba(59,130,246,0.12)",
    padding: "12px",
    display: "grid",
    gap: 8,
  },
  verifyTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "rgba(255,255,255,0.96)",
  },
  verifyTrack: {
    height: 8,
    borderRadius: 999,
    background: "rgba(255,255,255,0.14)",
    overflow: "hidden",
  },
  verifyBar: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, rgba(96,165,250,1), rgba(37,99,235,1))",
    transition: "width 80ms linear",
  },
  verifySub: {
    fontSize: 13,
    opacity: 0.88,
  },
};
