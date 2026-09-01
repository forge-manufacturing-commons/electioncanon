// ============================================================
// ELECTIONCANON — RESET PASSWORD  (Pre-launch UX cleanup pass, P1-4)
//
// The landing page for the link Supabase's own resetPasswordForEmail()
// emails out. supabase-js auto-detects the recovery token in the URL and
// establishes a short-lived recovery session before this component ever
// renders — no custom token handling here, no service-role credential,
// no plaintext password ever touches this project's own code beyond the
// one field the user types into. Setting the new password is a single
// call to supabase.auth.updateUser({ password }), the same built-in
// mechanism Supabase's own docs describe.
// ============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIdentity } from "../os/ForgeIdentity.jsx";
import { UI, DISPLAY, BLACK, IVORY, TEAL, AMBER, PINK, MUTED, BORDER } from "./election/shared.jsx";

export default function ResetPassword() {
  const { session, loading: identityLoading, updatePassword } = useIdentity();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    const { error: updateError } = await updatePassword({ password });
    setBusy(false);
    if (updateError) { setError(updateError); return; }
    setDone(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: BLACK, padding: "48px 20px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
          color: TEAL, borderLeft: `2px solid ${PINK}`, paddingLeft: 12, marginBottom: 20 }}>ElectionCanon</div>

        <div style={{ background: "#111418", border: `1px solid ${BORDER}`, borderTop: `2px solid ${TEAL}`, padding: "28px 26px" }}>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 24, color: IVORY, margin: "0 0 18px" }}>
            Set a new password
          </h1>

          {identityLoading ? (
            <div style={{ fontFamily: UI, fontSize: 13, color: MUTED }}>Checking your recovery link…</div>
          ) : !session ? (
            <div style={{ fontFamily: UI, fontSize: 13.5, color: PINK, lineHeight: 1.6 }}>
              This password reset link is invalid or has expired. Request a new one from the sign-in page.
            </div>
          ) : done ? (
            <>
              <div style={{ fontFamily: UI, fontSize: 13.5, color: TEAL, lineHeight: 1.6, marginBottom: 20 }}>
                Your password has been updated.
              </div>
              <button onClick={() => navigate("/election")}
                style={{ fontFamily: UI, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase",
                  padding: "14px 24px", border: "none", background: TEAL, color: BLACK, cursor: "pointer" }}>
                Continue to ElectionCanon →
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <div style={{ display: "grid", gap: 14 }}>
                <label>
                  <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 10, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: TEAL, marginBottom: 7 }}>New password</div>
                  <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required
                    style={{ width: "100%", boxSizing: "border-box", background: BLACK, border: `1px solid ${BORDER}`,
                      color: IVORY, fontFamily: UI, fontSize: 14, padding: "12px 14px", outline: "none" }} />
                </label>
                <label>
                  <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 10, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: TEAL, marginBottom: 7 }}>Confirm new password</div>
                  <input type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                    style={{ width: "100%", boxSizing: "border-box", background: BLACK, border: `1px solid ${BORDER}`,
                      color: IVORY, fontFamily: UI, fontSize: 14, padding: "12px 14px", outline: "none" }} />
                </label>
                {error && <div style={{ fontFamily: UI, fontSize: 12.5, color: PINK }}>{error}</div>}
                <button type="submit" disabled={busy}
                  style={{ fontFamily: UI, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase",
                    padding: "14px 24px", border: "none", background: busy ? BORDER : AMBER, color: BLACK,
                    cursor: busy ? "not-allowed" : "pointer" }}>
                  {busy ? "Updating…" : "Set New Password →"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
