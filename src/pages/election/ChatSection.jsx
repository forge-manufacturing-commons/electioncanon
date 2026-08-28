// ============================================================
// ELECTION FORGE — CHAT  (Alpha 1.0)
//
// Real, persisted coordination chat — see src/domains/election/chat/api.js.
// Direct RLS-protected CRUD, not PREPARE/APPROVE (see that module's own
// header for why). Polls for new messages/unread counts every 6s while
// open — no websocket/realtime channel this pass, a documented, honest
// simplification rather than a fake "live" indicator.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase.js";
import * as chatApi from "../../domains/election/chat/api.js";
import { Label, Panel, friendlyError, UI, IVORY, MUTED, TEAL, AMBER, PINK, BORDER, BLACK, inputStyle } from "./shared.jsx";

// ALPHA 1.1 — named presets for the coordination-tier hierarchy §7 asks
// for (National/State/LGA/Ward/Team), on top of the same createRoom() API
// Alpha 1.0 already supports (scopeType was always accepted, just never
// exposed as a quick-create choice in this UI until now).
const ROOM_PRESETS = Object.freeze([
  { scopeType: "national", label: "National Coordination" },
  { scopeType: "state", label: "State Coordination" },
  { scopeType: "senatorial_district", label: "Senatorial District" },
  { scopeType: "federal_constituency", label: "Federal Constituency" },
  { scopeType: "state_constituency", label: "State Constituency" },
  { scopeType: "lga", label: "LGA Coordination" },
  { scopeType: "ward", label: "Ward Coordination" },
  { scopeType: "polling_unit", label: "Polling Unit Team" },
  { scopeType: "team", label: "Campaign Team" },
  { scopeType: "operations", label: "Operations" },
  { scopeType: "incident_response", label: "Incident Response" },
  // ALPHA 1.3 — a room for reviewing captured result-sheet evidence
  // (OCR readings, disputed photos) distinct from general Operations.
  { scopeType: "evidence_review", label: "Evidence Review" },
]);

function RoomList({ rooms, activeRoomId, onSelect, unreadCounts, onCreate }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopeType, setScopeType] = useState("ward");
  return (
    <Panel>
      <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em",
        textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>Coordination rooms</div>
      {rooms.map((r) => {
        const active = r.id === activeRoomId;
        const unread = unreadCounts[r.id] ?? 0;
        return (
          <button key={r.id} onClick={() => onSelect(r.id)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
              textAlign: "left", fontFamily: UI, padding: "10px 12px", marginBottom: 6, cursor: "pointer",
              background: active ? "rgba(10,180,160,0.12)" : "transparent",
              border: `1px solid ${active ? TEAL : BORDER}`, color: IVORY }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{r.name}</span>
            {unread > 0 && (
              <span style={{ fontFamily: UI, fontWeight: 800, fontSize: 10, color: BLACK, background: PINK,
                borderRadius: 10, padding: "2px 7px" }}>{unread}</span>
            )}
          </button>
        );
      })}
      {!creating ? (
        <button onClick={() => setCreating(true)}
          style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, color: TEAL, background: "transparent",
            border: "none", cursor: "pointer", padding: "8px 0" }}>+ New room</button>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: UI, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>Room type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {ROOM_PRESETS.map((p) => (
              <button key={p.scopeType} type="button" onClick={() => { setScopeType(p.scopeType); if (!name.trim()) setName(p.label); }}
                style={{ fontFamily: UI, fontWeight: 700, fontSize: 10, padding: "6px 10px", cursor: "pointer",
                  background: scopeType === p.scopeType ? "rgba(10,180,160,0.12)" : "transparent",
                  border: `1px solid ${scopeType === p.scopeType ? TEAL : BORDER}`, color: IVORY }}>
                {p.label}
              </button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ward 3 Coordination"
            aria-label="New room name" style={{ ...inputStyle, marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { onCreate(name, scopeType); setName(""); setCreating(false); }} disabled={!name.trim()}
              style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, padding: "8px 14px", border: "none",
                background: name.trim() ? TEAL : BORDER, color: BLACK, cursor: name.trim() ? "pointer" : "not-allowed" }}>Create</button>
            <button onClick={() => setCreating(false)}
              style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, padding: "8px 14px", background: "transparent",
                border: `1px solid ${BORDER}`, color: MUTED, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </Panel>
  );
}

const CONTEXT_KINDS = Object.freeze(["polling_unit", "incident", "result", "task"]);

function Thread({ room, messages, userId, onSend, error }) {
  const [draft, setDraft] = useState("");
  const [linking, setLinking] = useState(false);
  const [contextKind, setContextKind] = useState(CONTEXT_KINDS[0]);
  const [contextRef, setContextRef] = useState("");
  const send = () => {
    if (!draft.trim()) return;
    const context = linking && contextRef.trim() ? { kind: contextKind, ref: contextRef.trim() } : null;
    onSend(draft, context);
    setDraft(""); setContextRef(""); setLinking(false);
  };
  return (
    <Panel accent={AMBER} style={{ display: "flex", flexDirection: "column", minHeight: 420 }}>
      <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 12, color: IVORY, marginBottom: 10 }}>
        {room ? room.name : "Select a room"}
      </div>
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
        {!room ? null : messages.length === 0 ? (
          <div style={{ fontFamily: UI, fontSize: 12.5, color: MUTED }}>No messages yet — say hello.</div>
        ) : messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: UI, fontSize: 10, color: MUTED, marginBottom: 2 }}>
              {m.sender === userId ? "You" : m.sender.slice(0, 8)} · {new Date(m.created_at).toLocaleString()}
            </div>
            {m.context_kind && m.context_ref && (
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase",
                color: TEAL, border: `1px solid ${TEAL}`, display: "inline-block", padding: "2px 6px", marginBottom: 4 }}>
                re: {m.context_kind.replace(/_/g, " ")} {m.context_ref.slice(0, 8)}
              </div>
            )}
            <div style={{ fontFamily: UI, fontSize: 13, color: IVORY }}>{m.body}</div>
          </div>
        ))}
      </div>
      {room && (
        <>
          <button type="button" onClick={() => setLinking((v) => !v)}
            style={{ fontFamily: UI, fontWeight: 700, fontSize: 10, color: linking ? TEAL : MUTED, background: "transparent",
              border: "none", cursor: "pointer", padding: "0 0 8px", textAlign: "left" }}>
            {linking ? "− remove reference" : "+ reference a polling unit, incident, result, or task"}
          </button>
          {linking && (
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={contextKind} onChange={(e) => setContextKind(e.target.value)} aria-label="Reference type"
                style={{ ...inputStyle, marginBottom: 0, width: 140 }}>
                {CONTEXT_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
              </select>
              <input value={contextRef} onChange={(e) => setContextRef(e.target.value)} placeholder="its id"
                aria-label="Reference id" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Write a message…" aria-label="Message" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
            <button onClick={send} disabled={!draft.trim()}
              style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "11px 18px", border: "none", background: draft.trim() ? TEAL : BORDER, color: BLACK,
                cursor: draft.trim() ? "pointer" : "not-allowed" }}>Send</button>
          </div>
        </>
      )}
      {error && <div style={{ fontFamily: UI, fontSize: 12, color: PINK, marginTop: 10 }}>{friendlyError(error)}</div>}
    </Panel>
  );
}

export default function ChatSection({ campaignId, userId }) {
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const loadRooms = useCallback(async () => {
    const { room, error: ensureError } = await chatApi.ensureNationalRoom({ client: supabase, userId, campaignId });
    if (ensureError) { setError(ensureError); return; }
    const { rooms: list, error: listError } = await chatApi.listRooms({ client: supabase, campaignId });
    if (listError) { setError(listError); return; }
    setRooms(list);
    setActiveRoomId((current) => current ?? room?.id ?? list[0]?.id ?? null);
    const { counts } = await chatApi.getUnreadCounts({ client: supabase, userId, rooms: list });
    setUnreadCounts(counts);
  }, [campaignId, userId]);

  const loadMessages = useCallback(async (roomId) => {
    if (!roomId) { setMessages([]); return; }
    const { messages: list, error: msgError } = await chatApi.listMessages({ client: supabase, roomId });
    if (msgError) { setError(msgError); return; }
    setMessages(list);
    await chatApi.markRead({ client: supabase, userId, roomId });
    setUnreadCounts((c) => ({ ...c, [roomId]: 0 }));
  }, [userId]);

  useEffect(() => { loadRooms(); }, [loadRooms]);
  useEffect(() => { loadMessages(activeRoomId); }, [activeRoomId, loadMessages]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      if (activeRoomId) loadMessages(activeRoomId);
      loadRooms();
    }, 6000);
    return () => clearInterval(pollRef.current);
  }, [activeRoomId, loadMessages, loadRooms]);

  const onSend = async (body, context) => {
    setError(null);
    const { error: sendError } = await chatApi.sendMessage({ client: supabase, userId, campaignId, roomId: activeRoomId, body, context });
    if (sendError) { setError(sendError); return; }
    await loadMessages(activeRoomId);
  };

  const onCreate = async (name, scopeType) => {
    setError(null);
    const { room, error: createError } = await chatApi.createRoom({ client: supabase, userId, campaignId, name, scopeType });
    if (createError) { setError(createError); return; }
    await loadRooms();
    setActiveRoomId(room.id);
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18 }}>
      <div>
        <Label>Rooms</Label>
        <RoomList rooms={rooms} activeRoomId={activeRoomId} onSelect={setActiveRoomId} unreadCounts={unreadCounts} onCreate={onCreate} />
      </div>
      <div>
        <Label>Conversation</Label>
        <Thread room={activeRoom} messages={messages} userId={userId} onSend={onSend} error={error} />
      </div>
    </div>
  );
}
