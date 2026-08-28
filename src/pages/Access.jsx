// ============================================================
// ELECTIONCANON — ACCESS (sign in / register)
//
// EXTRACTED FROM fatt-app's shared Access.jsx (Alpha 1.7 standalone
// extraction). The original file served BOTH Forge-A-Truck manufacturing
// registration and ElectionCanon registration from one component,
// branched on a `?product=election` query parameter — because it also
// used a single shared Supabase project's `profiles`/`forge_role`
// schema. This is the Election-only path of that file, with the
// manufacturing branch (the twelve-actor-kind picker, the
// "Join the manufacturing network" copy, the discipline/sector field)
// removed entirely rather than carried in as dead code — every field,
// every validation, every submit behavior on the Election path is
// UNCHANGED from the original.
//
// `role: "engineer"` is still sent on every registration. This is not
// an ElectionCanon concept — it satisfies a Postgres `forge_role` enum
// constraint on the shared `profiles` table this identity system was
// built against (see supabase/migrations/20260813000200_identity.sql in
// the source monorepo this was extracted from). ElectionCanon's own
// actor kind (candidate_campaign / observer_organisation) is a
// completely separate choice, made post-auth in the Welcome screen and
// stored on `campaigns.actor_kind`, never on this shared `profiles` row
// — this fixed value is invisible to a registrant and was invisible in
// the original file too.
// ============================================================

import { useState } from "react";
import { T } from "../os/forge.js";
import { useNavigate } from "react-router-dom";
import { useIdentity } from "../os/ForgeIdentity.jsx";
import { FORGE_CLIPS } from "../os/geometry.js";

const { black:BLACK, ivory:IVORY, teal:TEAL, amber:AMBER, pink:PINK,
        surface:SURFACE_T, border:BORDER_T, grey:GREY_T } = T;
const SURFACE=SURFACE_T, BORDER=BORDER_T, MUTED=GREY_T;
const UI="var(--forge-brand-font, 'Poppins', system-ui, sans-serif)";
const DISPLAY="var(--forge-display-font, 'Poppins', system-ui, sans-serif)";
const NG_STATES=["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT Abuja","Gombe","Imo","Jigawa",
  "Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo",
  "Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara","Outside Nigeria"];

const label = { fontFamily:UI, fontWeight:600, fontSize:10, letterSpacing:"0.18em",
  textTransform:"uppercase", color:TEAL, display:"block", marginBottom:7 };
const field = { width:"100%", background:BLACK, border:`1px solid ${BORDER}`, color:IVORY,
  fontFamily:UI, fontSize:14, padding:"12px 14px", clipPath:FORGE_CLIPS.buttonSm, outline:"none" };

export default function Access() {
  const { configured, register, signIn, session } = useIdentity();
  const navigate = useNavigate();
  const [mode, setMode] = useState("register");
  const [role] = useState("engineer");
  const [form, setForm] = useState({ email:"", password:"", displayName:"", state:"" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    const res = mode === "register"
      ? await register({ ...form, role })
      : await signIn({ email: form.email, password: form.password });
    setBusy(false);
    if (res?.error) { setErr(res.error); return; }
    if (mode === "register") {
      setMsg("Registration submitted. Check your email to confirm the address, then sign in.");
      setMode("signin");
    } else {
      navigate("/election");
    }
  }

  return (
    <div className="forge-brand" style={{ background:BLACK, color:IVORY, minHeight:"100vh",
      padding:"clamp(28px,5vw,64px)", fontFamily:UI }}>
      <div style={{ maxWidth:1080, margin:"0 auto" }}>

        <div style={{ fontFamily:UI, fontWeight:600, fontSize:10, letterSpacing:"0.2em",
          textTransform:"uppercase", color:TEAL, borderLeft:`2px solid ${TEAL}`,
          paddingLeft:12, marginBottom:18 }}>ElectionCanon · Identity</div>

        <h1 style={{ fontFamily:DISPLAY, fontWeight:900, fontSize:"clamp(30px,4.6vw,50px)",
          letterSpacing:"-0.03em", lineHeight:0.95, margin:"0 0 12px" }}>
          Sign in to <span style={{ color:PINK }}>ElectionCanon</span>.
        </h1>
        <p style={{ color:"rgba(245,241,233,0.70)", fontSize:15, maxWidth:620, lineHeight:1.6, margin:"0 0 12px" }}>
          ElectionCanon coordinates real election-preparation work. Registration establishes
          who is accountable for that work — the capability you declare here is what your
          campaign or organisation will hold you to.
        </p>
        <p style={{ fontFamily:UI, fontWeight:600, fontSize:11, letterSpacing:"0.06em",
          color:MUTED, maxWidth:620, lineHeight:1.6, margin:"0 0 26px" }}>
          Registration is self-declared. Your workspace and readiness data are visible only to
          your own campaign or organisation, never to another tenant.
        </p>

        {!configured && (
          <div style={{ clipPath:FORGE_CLIPS.panelBR, background:"rgba(255,46,99,0.08)",
            border:`1px solid ${PINK}`, padding:"14px 16px", marginBottom:24, maxWidth:720 }}>
            <b style={{ color:PINK, fontSize:12, letterSpacing:"0.1em" }}>DATABASE NOT REACHABLE</b>
            <div style={{ color:"rgba(245,241,233,.8)", fontSize:13, marginTop:6, lineHeight:1.55 }}>
              This deployment has no Supabase credentials, so accounts cannot be created here.
              The form is shown so the flow can be reviewed, but it will not submit.
            </div>
          </div>
        )}

        <div style={{ display:"flex", gap:8, marginBottom:26 }}>
          {["register","signin"].map(m => (
            <button key={m} type="button" onClick={() => { setMode(m); setErr(null); setMsg(null); }}
              style={{ fontFamily:UI, fontWeight:700, fontSize:11, letterSpacing:"0.14em",
                textTransform:"uppercase", padding:"11px 20px", cursor:"pointer",
                clipPath:FORGE_CLIPS.button, border:"none",
                background: mode===m ? AMBER : "transparent",
                color: mode===m ? BLACK : MUTED,
                boxShadow: mode===m ? "none" : `inset 0 0 0 1px ${BORDER}` }}>
              {m === "register" ? "Register" : "Sign in"}
            </button>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))", gap:28 }}>
          {mode === "register" && (
            <div>
              <span style={label}>What you are registering</span>
              <div style={{ clipPath:FORGE_CLIPS.panelBR, background:SURFACE,
                borderTop:`2px solid ${TEAL}`, padding:"14px 16px" }}>
                <div style={{ fontFamily:UI, fontSize:13, color:"rgba(245,241,233,.82)", lineHeight:1.55 }}>
                  A candidate campaign or an observer/monitoring organisation — you choose which,
                  and set up your workspace, on the next screen once you are signed in.
                </div>
              </div>
            </div>
          )}

          <form onSubmit={submit}>
            <span style={label}>{mode !== "register" ? "Sign in" : "Your details"}</span>
            <div style={{ display:"grid", gap:14, maxWidth:420 }}>
              {mode === "register" && (
                <label>
                  <span style={label}>Campaign / organisation name</span>
                  <input style={field} value={form.displayName} onChange={set("displayName")} required />
                </label>
              )}
              <label>
                <span style={label}>Email</span>
                <input style={field} type="email" value={form.email} onChange={set("email")} required />
              </label>
              <label>
                <span style={label}>Password</span>
                <input style={field} type="password" minLength={8} value={form.password}
                  onChange={set("password")} required />
              </label>
              {mode === "register" && (
                <label>
                  <span style={label}>State</span>
                  <select style={field} value={form.state} onChange={set("state")} required>
                    <option value="">Select…</option>
                    {NG_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              )}

              {err && <div style={{ color:PINK, fontSize:12.5, fontFamily:UI }}>{err}</div>}
              {msg && <div style={{ color:TEAL, fontSize:12.5, fontFamily:UI }}>{msg}</div>}

              <button type="submit" disabled={busy || !configured}
                style={{ fontFamily:UI, fontWeight:700, fontSize:12.5, letterSpacing:"0.12em",
                  textTransform:"uppercase", padding:"14px 26px", border:"none",
                  clipPath:FORGE_CLIPS.button,
                  background: (busy || !configured) ? BORDER : AMBER,
                  color: (busy || !configured) ? MUTED : BLACK,
                  cursor: (busy || !configured) ? "not-allowed" : "pointer" }}>
                {busy ? "Working…" : mode === "register" ? "Register →" : "Sign in →"}
              </button>
              {session && (
                <button type="button" onClick={() => navigate("/election")}
                  style={{ fontFamily:UI, fontWeight:700, fontSize:11, letterSpacing:"0.12em",
                    textTransform:"uppercase", padding:"12px 22px", cursor:"pointer",
                    background:"transparent", color:TEAL, border:`1px solid ${TEAL}`,
                    clipPath:FORGE_CLIPS.button }}>
                  Go to ElectionCanon →
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
