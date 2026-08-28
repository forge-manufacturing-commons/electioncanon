// ============================================================
// FORGE ELECTION — CHAT  (Alpha 1.0)
//
// Direct RLS-protected CRUD, deliberately NOT PREPARE/APPROVE. Sending a
// chat message is a real-time coordination act, not a Canon fact requiring
// a manual "Approve" step — the accountability the PREPARE/APPROVE dance
// gives candidate registration or a ward-status report is the wrong shape
// for a message thread. Protection here comes entirely from RLS: every
// function takes `client`/`userId` explicitly (dependency injection, the
// same testability convention every other Election module uses) and never
// imports the `supabase` singleton.
//
// ROOM MEMBERSHIP IS OPEN CAMPAIGN-WIDE FOR ALPHA 1.0 — any active campaign
// member may create a room and any active campaign member may join any
// room in their own campaign (self-insert into campaign_chat_room_members,
// gated only by campaign membership — see the migration's RLS). A real
// invite-only workflow is a documented fast-follow, not built this pass.
// ============================================================

const NATIONAL_ROOM_NAME = "National Coordination";

/** Idempotent: returns the campaign's National Coordination room, creating
 *  and self-joining it on first use. Safe to call on every Chat visit. */
export async function ensureNationalRoom({ client, userId, campaignId }) {
  const { data: existing, error: findError } = await client
    .from("campaign_chat_rooms")
    .select("id, name, scope_type, scope_ref, created_at")
    .eq("campaign_id", campaignId)
    .eq("scope_type", "national")
    .maybeSingle();
  if (findError) return { room: null, error: findError.message };

  let room = existing;
  if (!room) {
    const { data: created, error: createError } = await client
      .from("campaign_chat_rooms")
      .insert({ campaign_id: campaignId, name: NATIONAL_ROOM_NAME, scope_type: "national", created_by: userId })
      .select("id, name, scope_type, scope_ref, created_at")
      .maybeSingle();
    if (createError) {
      // Two callers can race the SELECT-then-INSERT above (e.g. Home and
      // Chat mounting close together) — a partial unique index on
      // (campaign_id) where scope_type='national' makes the loser's insert
      // fail with 23505 rather than silently create a duplicate room. The
      // loser simply re-reads the winner's row, the same "duplicate key is
      // not a failure" discipline executeElectionWrite() already uses.
      if (createError.code === "23505" || /duplicate key/i.test(createError.message ?? "")) {
        const { data: winner, error: reReadError } = await client
          .from("campaign_chat_rooms")
          .select("id, name, scope_type, scope_ref, created_at")
          .eq("campaign_id", campaignId)
          .eq("scope_type", "national")
          .maybeSingle();
        if (reReadError) return { room: null, error: reReadError.message };
        room = winner;
      } else {
        return { room: null, error: createError.message };
      }
    } else {
      room = created;
    }
  }

  await joinRoom({ client, userId, roomId: room.id });
  return { room, error: null };
}

/** Rooms this user has already joined, for this campaign. */
export async function listRooms({ client, campaignId }) {
  const { data, error } = await client
    .from("campaign_chat_rooms")
    .select("id, name, scope_type, scope_ref, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) return { rooms: [], error: error.message };
  return { rooms: data ?? [], error: null };
}

export async function createRoom({ client, userId, campaignId, name, scopeType = "ward", scopeRef = null }) {
  const clean = String(name ?? "").trim();
  if (!clean) return { room: null, error: "a room name is required" };
  const { data, error } = await client
    .from("campaign_chat_rooms")
    .insert({ campaign_id: campaignId, name: clean, scope_type: scopeType, scope_ref: scopeRef, created_by: userId })
    .select("id, name, scope_type, scope_ref, created_at")
    .maybeSingle();
  if (error) return { room: null, error: error.message };
  await joinRoom({ client, userId, roomId: data.id });
  return { room: data, error: null };
}

export async function joinRoom({ client, userId, roomId }) {
  const { error } = await client
    .from("campaign_chat_room_members")
    .upsert({ room_id: roomId, person: userId }, { onConflict: "room_id,person", ignoreDuplicates: true });
  if (error) return { joined: false, error: error.message };
  return { joined: true, error: null };
}

export async function listMessages({ client, roomId, limit = 200 }) {
  const { data, error } = await client
    .from("campaign_chat_messages")
    .select("id, room_id, sender, body, created_at, context_kind, context_ref")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return { messages: [], error: error.message };
  return { messages: data ?? [], error: null };
}

// ALPHA 1.3 — `context` is an OPTIONAL { kind, ref } REFERENCE to the
// operational object this message is about (a polling unit, an incident,
// a result, a task) — never a second write path for Canon facts, and
// never validated against real records here (that is the reading room's
// job, same as any other display-only cross-reference in this codebase —
// see IncidentsTab's `linkedResult`). Omitted entirely when not supplied,
// so an ordinary message never carries stray null-shaped context.
export async function sendMessage({ client, userId, campaignId, roomId, body, context = null }) {
  const clean = String(body ?? "").trim();
  if (!clean) return { message: null, error: "a message cannot be empty" };
  if (clean.length > 2000) return { message: null, error: "a message above 2000 characters is not sendable" };
  const row = { room_id: roomId, campaign_id: campaignId, sender: userId, body: clean };
  if (context?.kind && context?.ref) {
    row.context_kind = String(context.kind).trim().slice(0, 40);
    row.context_ref = String(context.ref).trim().slice(0, 200);
  }
  const { data, error } = await client
    .from("campaign_chat_messages")
    .insert(row)
    .select("id, room_id, sender, body, created_at, context_kind, context_ref")
    .maybeSingle();
  if (error) return { message: null, error: error.message };
  return { message: data, error: null };
}

export async function markRead({ client, userId, roomId }) {
  const { error } = await client
    .from("campaign_chat_reads")
    .upsert({ room_id: roomId, person: userId, last_read_at: new Date().toISOString() }, { onConflict: "room_id,person" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

/** Returns { [roomId]: unreadCount } for every room this user has joined. */
export async function getUnreadCounts({ client, userId, rooms }) {
  if (!rooms?.length) return { counts: {}, error: null };
  const roomIds = rooms.map((r) => r.id);

  const [{ data: reads, error: readsError }, { data: messages, error: messagesError }] = await Promise.all([
    client.from("campaign_chat_reads").select("room_id, last_read_at").eq("person", userId).in("room_id", roomIds),
    client.from("campaign_chat_messages").select("room_id, created_at, sender").in("room_id", roomIds),
  ]);
  if (readsError) return { counts: {}, error: readsError.message };
  if (messagesError) return { counts: {}, error: messagesError.message };

  const lastReadByRoom = Object.fromEntries((reads ?? []).map((r) => [r.room_id, r.last_read_at]));
  const counts = {};
  for (const roomId of roomIds) counts[roomId] = 0;
  for (const m of messages ?? []) {
    if (m.sender === userId) continue;
    const lastRead = lastReadByRoom[m.room_id];
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
      counts[m.room_id] = (counts[m.room_id] ?? 0) + 1;
    }
  }
  return { counts, error: null };
}

export default { ensureNationalRoom, listRooms, createRoom, joinRoom, listMessages, sendMessage, markRead, getUnreadCounts };
