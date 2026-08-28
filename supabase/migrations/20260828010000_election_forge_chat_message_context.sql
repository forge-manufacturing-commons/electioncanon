-- ============================================================
-- ELECTIONCANON ALPHA 1.3 — CHAT MESSAGE CONTEXT (REFERENCE ONLY)
--
-- Purely additive: two nullable columns on the existing
-- campaign_chat_messages table. No RLS change is needed at all — every
-- existing policy on this table (see 20260827000000) is column-agnostic
-- (it checks room membership, never inspects individual columns), so a
-- new nullable column is automatically covered by the same read/insert
-- policies with no rewrite.
--
-- `context_kind`/`context_ref` let a message carry a REFERENCE to the
-- operational object a conversation is actually about (a polling unit, an
-- incident, a result, a task) — e.g. context_kind='incident',
-- context_ref=<incident id>. This is deliberately NOT a second write path
-- for Canon facts: it never creates, mutates, or implies an event by
-- itself, it is inert metadata a room can use to show "this message is
-- about incident X" and let a reader jump to it. Any real fact still goes
-- through the normal PREPARE/APPROVE (Election Day) or direct-CRUD-under-
-- RLS (Chat's own, unchanged) discipline.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaign_chat_messages'
  ) then
    raise exception
      'Table public.campaign_chat_messages does not exist. Apply 20260827000000_election_forge_chat_and_studio.sql first.';
  end if;
end $$;

alter table campaign_chat_messages
  add column if not exists context_kind text,
  add column if not exists context_ref  text;

comment on column campaign_chat_messages.context_kind is
  'Optional, caller-supplied reference kind (e.g. ''polling_unit'', ''incident'', ''result'', ''task'') — a REFERENCE only, never a second write path for Canon facts.';
comment on column campaign_chat_messages.context_ref is
  'Optional id the context_kind refers to (e.g. an incident id) — never validated or dereferenced by this table itself; the reading room resolves it against the real folded Canon.';
