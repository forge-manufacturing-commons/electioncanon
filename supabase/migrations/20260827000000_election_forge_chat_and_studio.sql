-- ============================================================
-- ELECTION FORGE ALPHA 1.0 — CHAT + CAMPAIGN STUDIO
--
-- Mobilization and Election Day simulation need NO migration at all — they
-- are folded from new event types in the existing `election_events` log
-- (see src/domains/election/events.js), reusing 100% of the existing
-- tenant-isolation and RLS machinery.
--
-- Chat and Campaign Studio DO need new tables: chat needs an unread-cursor
-- (campaign_chat_reads) and room-scoped membership an immutable event log
-- cannot cheaply express; Campaign Studio assets are mutable draft content,
-- not immutable Canon facts. Every RLS policy below follows the EXACT
-- pattern 20260823000000_campaign_membership.sql / 20260826000000 already
-- established: a SECURITY DEFINER helper function to avoid the 42P17
-- self-referencing-policy recursion this project has already hit twice.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaigns'
  ) then
    raise exception
      'Table public.campaigns does not exist. Apply 20260823000000_campaign_membership.sql first.';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'is_active_campaign_member'
  ) then
    raise exception
      'Function public.is_active_campaign_member does not exist. Apply 20260826000000_fix_campaign_members_rls_recursion.sql first.';
  end if;
end $$;

-- ---------- Chat ----------

create table if not exists campaign_chat_rooms (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name        text not null,
  scope_type  text not null default 'national',
  scope_ref   text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists campaign_chat_rooms_campaign_idx on campaign_chat_rooms(campaign_id);

create table if not exists campaign_chat_room_members (
  room_id   uuid not null references campaign_chat_rooms(id) on delete cascade,
  person    uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, person)
);

create table if not exists campaign_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references campaign_chat_rooms(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  sender      uuid not null references auth.users(id) on delete restrict,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists campaign_chat_messages_room_idx on campaign_chat_messages(room_id, created_at);

create table if not exists campaign_chat_reads (
  room_id      uuid not null references campaign_chat_rooms(id) on delete cascade,
  person       uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, person)
);

-- Recursion-safe room-membership check — REUSE for any future room-scoped table.
create or replace function public.is_active_chat_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.campaign_chat_room_members m
    where m.room_id = p_room_id and m.person = auth.uid()
  );
$function$;

comment on function public.is_active_chat_room_member(uuid) is
  'Returns whether the CALLING authenticated user (auth.uid()) is a member of the given chat room. SECURITY DEFINER so this check does not re-trigger campaign_chat_room_members'' own RLS policies (the same 42P17 recursion class is_active_campaign_member already exists to avoid).';

revoke all on function public.is_active_chat_room_member(uuid) from public;
grant execute on function public.is_active_chat_room_member(uuid) to authenticated;
revoke execute on function public.is_active_chat_room_member(uuid) from anon;

alter table campaign_chat_rooms enable row level security;
drop policy if exists "chat rooms read own campaign" on campaign_chat_rooms;
create policy "chat rooms read own campaign" on campaign_chat_rooms
  for select using (public.is_active_campaign_member(campaign_chat_rooms.campaign_id));
drop policy if exists "chat rooms insert own campaign" on campaign_chat_rooms;
create policy "chat rooms insert own campaign" on campaign_chat_rooms
  for insert with check (
    created_by = auth.uid() and public.is_active_campaign_member(campaign_chat_rooms.campaign_id)
  );

alter table campaign_chat_room_members enable row level security;
drop policy if exists "chat room members read own campaign" on campaign_chat_room_members;
create policy "chat room members read own campaign" on campaign_chat_room_members
  for select using (
    exists (
      select 1 from campaign_chat_rooms r
      where r.id = campaign_chat_room_members.room_id
        and public.is_active_campaign_member(r.campaign_id)
    )
  );
-- OPEN CAMPAIGN-WIDE MEMBERSHIP (Alpha 1.0 decision) — any active campaign
-- member may self-join any room in their own campaign; no invite step yet.
drop policy if exists "chat room members self-join own campaign" on campaign_chat_room_members;
create policy "chat room members self-join own campaign" on campaign_chat_room_members
  for insert with check (
    person = auth.uid()
    and exists (
      select 1 from campaign_chat_rooms r
      where r.id = campaign_chat_room_members.room_id
        and public.is_active_campaign_member(r.campaign_id)
    )
  );

alter table campaign_chat_messages enable row level security;
drop policy if exists "chat messages read own room" on campaign_chat_messages;
create policy "chat messages read own room" on campaign_chat_messages
  for select using (public.is_active_chat_room_member(campaign_chat_messages.room_id));
drop policy if exists "chat messages insert own room" on campaign_chat_messages;
create policy "chat messages insert own room" on campaign_chat_messages
  for insert with check (
    sender = auth.uid() and public.is_active_chat_room_member(campaign_chat_messages.room_id)
  );

alter table campaign_chat_reads enable row level security;
drop policy if exists "chat reads own row" on campaign_chat_reads;
create policy "chat reads own row" on campaign_chat_reads
  for select using (person = auth.uid());
drop policy if exists "chat reads insert own row" on campaign_chat_reads;
create policy "chat reads insert own row" on campaign_chat_reads
  for insert with check (person = auth.uid() and public.is_active_chat_room_member(campaign_chat_reads.room_id));
drop policy if exists "chat reads update own row" on campaign_chat_reads;
create policy "chat reads update own row" on campaign_chat_reads
  for update using (person = auth.uid()) with check (person = auth.uid());

-- ---------- Campaign Studio assets ----------

create table if not exists campaign_studio_assets (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  asset_type  text not null,
  template_id text not null,
  title       text not null,
  content     jsonb not null default '{}'::jsonb,
  status      text not null default 'draft',
  created_by  uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists campaign_studio_assets_campaign_idx on campaign_studio_assets(campaign_id, updated_at desc);

alter table campaign_studio_assets enable row level security;
drop policy if exists "studio assets read own campaign" on campaign_studio_assets;
create policy "studio assets read own campaign" on campaign_studio_assets
  for select using (public.is_active_campaign_member(campaign_studio_assets.campaign_id));
drop policy if exists "studio assets insert own campaign" on campaign_studio_assets;
create policy "studio assets insert own campaign" on campaign_studio_assets
  for insert with check (
    created_by = auth.uid() and public.is_active_campaign_member(campaign_studio_assets.campaign_id)
  );
-- Drafts are mutable (unlike every immutable event-log table in this
-- project) — a design is edited in place, not corrected via a new row.
drop policy if exists "studio assets update own campaign" on campaign_studio_assets;
create policy "studio assets update own campaign" on campaign_studio_assets
  for update using (public.is_active_campaign_member(campaign_studio_assets.campaign_id))
  with check (public.is_active_campaign_member(campaign_studio_assets.campaign_id));
