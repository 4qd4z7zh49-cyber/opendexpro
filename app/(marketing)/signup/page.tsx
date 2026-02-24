"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { buildCountryOptions } from "../_lib/countries";
import { supabase } from "@/lib/supabaseClient";

type InviteValidateResponse = {
  error?: string;
  subAdminId?: string | null;
};

export default function SignupPage() {
  const router = useRouter();

  // Build the country list only on the client to avoid SSR/client Intl differences
  // that can cause Next.js hydration errors.
  const [countries, setCountries] = useState<ReturnType<typeof buildCountryOptions>>([]);

  const [country, setCountry] = useState<string>("US");
  const [dial, setDial] = useState<string>("+1");

  useEffect(() => {
    // Guard just in case, though this component is client-only.
    const list = buildCountryOptions("en");
    setCountries(list);

    // Ensure default dial code is synced with default country once list is ready.
    const us = list.find((c) => c.code === "US");
    if (us) setDial(us.dial);
  }, []);

  const [phoneLocal, setPhoneLocal] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [pw, setPw] = useState<string>("");
  const [pw2, setPw2] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [invitationCode, setInvitationCode] = useState<string>("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  function onCountryChange(next: string) {
    setCountry(next);
    const found = countries?.find?.((c) => c.code === next);
    if (found) setDial(found.dial);
  }

  const localDigits = useMemo(() => phoneLocal.replace(/[^\d]/g, ""), [phoneLocal]);
  const normalizedDial = useMemo(() => {
    const dialDigits = dial.replace(/[^\d]/g, "");
    return dialDigits ? `+${dialDigits}` : "";
  }, [dial]);

  const phoneCheck = useMemo(() => {
    if (!localDigits) {
      return {
        valid: false,
        e164: "",
        reason: "empty" as const,
      };
    }

    const parsed = parsePhoneNumberFromString(localDigits, country as CountryCode);
    if (!parsed || !parsed.isValid()) {
      return {
        valid: false,
        e164: "",
        reason: "invalid_number" as const,
      };
    }

    const parsedDial = `+${parsed.countryCallingCode}`;
    if (normalizedDial && parsedDial !== normalizedDial) {
      return {
        valid: false,
        e164: "",
        reason: "dial_mismatch" as const,
      };
    }

    // Country code field is already separate (`dial`), so local phone input
    // should not include country calling code again (e.g. +1 and 1XXXXXXXXXX).
    const dialDigits = normalizedDial.replace(/[^\d]/g, "");
    const nationalDigits = String(parsed.nationalNumber || "").replace(/[^\d]/g, "");
    if (
      dialDigits &&
      parsed.countryCallingCode === dialDigits &&
      localDigits.startsWith(dialDigits) &&
      localDigits.length > nationalDigits.length
    ) {
      return {
        valid: false,
        e164: "",
        reason: "contains_country_code" as const,
      };
    }

    return {
      valid: true,
      e164: parsed.number,
      reason: "ok" as const,
    };
  }, [country, localDigits, normalizedDial]);

  const fullPhone = phoneCheck.e164 || `${normalizedDial}${localDigits}`;
  const phoneIsValid = phoneCheck.valid;

  const pwMatch = pw.length > 0 && pw === pw2;

  const normalizeInvitationCode = (value: string) =>
    value.trim().replace(/[\s-]+/g, "").toUpperCase();

async function handleSignup(e?: FormEvent) {
    e?.preventDefault();
    setError("");

    if (!username.trim()) return setError("Username is required.");
    if (!email.trim()) return setError("Email is required.");
    if (!pw) return setError("Password is required.");
    if (!pwMatch) return setError("Passwords do not match.");
    if (!phoneIsValid) return setError("Please enter a valid phone number.");

    try {
      setLoading(true);
      const code = normalizeInvitationCode(invitationCode);
      let subAdminId: string | null = null;

      // Validate invitation code only if provided
      if (code) {
        const validateRes = await fetch("/api/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitationCode: code }),
        });

        const validateJson = (await validateRes
          .json()
          .catch(() => ({}))) as InviteValidateResponse;

        if (!validateRes.ok) {
          setError(validateJson?.error || "Invalid invitation code.");
          return;
        }

        subAdminId = validateJson?.subAdminId ?? null;
        if (!subAdminId) {
          setError("Invalid invitation code.");
          return;
        }
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: pw,
        options: {
          data: {
            // Supabase Auth UI “Display name” reads `full_name`/`name` from user_metadata.
            full_name: username.trim(),
            username: username.trim(),
            country,
            dial,
            phone: fullPhone,
            invitation_code: code || null,
            managed_by: subAdminId,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // Send user back to login (or you can route to /trade later after email confirmation)
      router.push("/login?created=1");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card} className="ob-card">
          <h1 style={styles.h1} className="ob-fadeUp">
            Create your account
          </h1>
          <p style={styles.sub} className="ob-fadeUp ob-delay1">
            Sign up to get started with opendex.
          </p>

          <form style={styles.form} className="ob-fadeUp ob-delay2" onSubmit={handleSignup}>
            <label style={styles.label}>Country</label>
            <select
              style={styles.select}
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
              disabled={countries.length === 0}
            >
              {countries.length === 0 ? (
                <option value="US">Loading countries…</option>
              ) : null}
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.dial})
                </option>
              ))}
            </select>

            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              placeholder="your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />

            <label style={styles.label}>Invitation code</label>
            <input
              style={styles.input}
              placeholder="Enter invitation code"
              value={invitationCode}
              onChange={(e) => setInvitationCode(normalizeInvitationCode(e.target.value))}
              autoComplete="one-time-code"
            />

            <label style={styles.label}>Phone number</label>
            <div style={styles.phoneRow}>
              <input style={styles.dial} value={dial} readOnly aria-label="Dial code" />
              <input
                style={styles.phoneInput}
                inputMode="tel"
                placeholder="Phone number"
                value={phoneLocal}
                onChange={(e) => setPhoneLocal(e.target.value)}
                autoComplete="tel"
              />
            </div>

            {phoneLocal.trim() ? (
              <div
                style={{
                  ...styles.hint,
                  color: phoneIsValid ? "rgba(120,255,190,0.92)" : "rgba(255,140,140,0.92)",
                }}
              >
                {phoneIsValid
                  ? "Phone number looks valid."
                  : phoneCheck.reason === "contains_country_code"
                    ? "Do not include country code in the phone number field."
                  : phoneCheck.reason === "dial_mismatch"
                    ? "Country code and phone number do not match."
                    : "Phone number is not valid."}
              </div>
            ) : null}

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
                autoComplete="new-password"
              />
              <button type="button" style={styles.eyeBtn} onClick={() => setShowPw((s) => !s)} aria-label="Toggle password">
                {showPw ? "🙈" : "👁️"}
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
              />
              <button type="button" style={styles.eyeBtn} onClick={() => setShowPw2((s) => !s)} aria-label="Toggle confirm password">
                {showPw2 ? "🙈" : "👁️"}
              </button>
            </div>

            {pw2 ? (
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

            <button type="submit" style={{ ...styles.primaryBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? "Creating…" : "Create account"}
            </button>

            <Link href="/login" style={styles.secondaryBtn}>
              ← Back to Login
            </Link>

            <p style={styles.small}>
              By continuing, you agree to our <span style={styles.linkLike}>Terms</span> &{" "}
              <span style={styles.linkLike}>Privacy Policy</span>.
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

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    padding: "max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom))",
    boxSizing: "border-box",
  },
  shell: {
    width: "100%",
    maxWidth: 560,
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
    fontSize: "clamp(30px, 7.5vw, 40px)",
    margin: "0 0 6px",
    letterSpacing: -0.5,
    lineHeight: 1.08,
  },
  sub: {
    margin: "0 0 18px",
    opacity: 0.75,
    fontSize: "clamp(13px, 3.2vw, 15px)",
    lineHeight: 1.4,
  },
  form: { display: "grid", gap: 12 },
  label: { fontSize: 12, opacity: 0.75, letterSpacing: 1, textTransform: "uppercase" },
  select: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(8,10,14,0.8)",
    color: "white",
    padding: "0 16px",
    outline: "none",
    boxSizing: "border-box",
  },
  input: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(8,10,14,0.8)",
    color: "white",
    padding: "0 16px",
    outline: "none",
    boxSizing: "border-box",
  },
  phoneRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  dial: {
    flex: "0 0 92px",
    minWidth: 84,
    height: 54,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(8,10,14,0.8)",
    color: "rgba(255,255,255,0.85)",
    padding: "0 12px",
    outline: "none",
    boxSizing: "border-box",
  },
  phoneInput: {
    flex: "1 1 180px",
    height: 54,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(8,10,14,0.8)",
    color: "white",
    padding: "0 16px",
    outline: "none",
    boxSizing: "border-box",
  },
  pwRow: { position: "relative" },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    width: 40,
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
  },
  hint: { fontSize: 13, opacity: 0.92, marginTop: 2 },
  errorBox: {
    border: "1px solid rgba(255,120,120,0.35)",
    background: "rgba(255,80,80,0.10)",
    color: "rgba(255,200,200,0.95)",
    padding: "10px 12px",
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 1.35,
  },
  primaryBtn: {
    width: "100%",
    height: 58,
    borderRadius: 18,
    border: "0",
    background: "linear-gradient(180deg, #2f6bff, #1f55d8)",
    color: "white",
    fontWeight: 900,
    fontSize: 20,
    cursor: "pointer",
    marginTop: 4,
  },
  secondaryBtn: {
    width: "100%",
    height: 54,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
    display: "grid",
    placeItems: "center",
    textDecoration: "none",
    fontWeight: 800,
  },
  small: { margin: "8px 0 0", opacity: 0.7, fontSize: 12, textAlign: "center" },
  linkLike: { color: "#6bd1ff", textDecoration: "underline", cursor: "pointer" },
};
