-- ============================================================
-- ELECTORAL GEOGRAPHY — INVITATION PREVIEW STATE CONTEXT  (invitation email redesign)
--
-- ADDITIVE ONLY. No table is created, altered, or seeded; no row in any
-- geography_* table is touched; no RLS policy changes. This migration
-- replaces exactly one function's definition —
-- public.get_invitation_preview(text) — so its output additionally
-- carries the canonical state name (and, for ward/polling-unit level
-- invitations, the parent LGA/ward names) an invitation's geography sits
-- under. The invitation email ("Your area: Agege, Lagos State") and
-- AcceptInvite.jsx's own preview both read this function; AcceptInvite.jsx
-- is left rendering exactly what it already rendered (geography_name is
-- UNCHANGED — still the leaf name/code) so this is purely additive from
-- every existing caller's point of view. The email is the only caller
-- that reads the new columns.
--
-- WHY A NEW COLUMN PER ANCESTOR LEVEL, NOT ONE PRE-JOINED STRING. Each
-- caller needs to format the hierarchy differently (the email wants
-- "Ward, LGA, State"; some future caller might want just "State"), and a
-- pre-concatenated string would force every caller to parse it back apart.
-- Returning the real, individual canonical names — resolved via the exact
-- same real FK chain every other geography read in this codebase already
-- walks (geography_polling_units -> geography_wards -> geography_lgas ->
-- geography_states) — lets each caller compose its own display without
-- ever re-deriving or guessing a name.
--
-- CONSTITUENCY: geography_constituencies already carries its own
-- state_code directly (no LGA/ward hop needed) — state context is a
-- direct one-hop join, added "where appropriate" per this pass's own
-- instruction, alongside the existing geography_name (the constituency's
-- own name, unchanged).
-- ============================================================

drop function if exists public.get_invitation_preview(text);

create or replace function public.get_invitation_preview(p_token text)
returns table (
  campaign_id uuid, campaign_name text, invited_name text,
  intended_member_role text, intended_responsibility_role text,
  intended_level text, intended_geography_ref text, geography_name text,
  geography_state_name text, geography_lga_name text, geography_ward_name text,
  status text, expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.campaign_invitations;
  v_campaign_name text;
  v_geo_name text;
  v_state_name text;
  v_lga_name text;
  v_ward_name text;
begin
  select * into v_inv from public.campaign_invitations where token = p_token;
  if not found then
    return;
  end if;

  select c.name into v_campaign_name from public.campaigns c where c.id = v_inv.campaign_id;

  if v_inv.intended_level = 'constituency' then
    select gc.name, gs.name
      into v_geo_name, v_state_name
      from public.geography_constituencies gc
      join public.geography_states gs on gs.code = gc.state_code
      where gc.id::text = v_inv.intended_geography_ref;

  elsif v_inv.intended_level = 'lga' then
    select gl.name, gs.name
      into v_geo_name, v_state_name
      from public.geography_lgas gl
      join public.geography_states gs on gs.code = gl.state_code
      where gl.id::text = v_inv.intended_geography_ref;

  elsif v_inv.intended_level = 'ward' then
    select gw.name, gl.name, gs.name
      into v_geo_name, v_lga_name, v_state_name
      from public.geography_wards gw
      join public.geography_lgas gl on gl.id = gw.lga_id
      join public.geography_states gs on gs.code = gl.state_code
      where gw.id::text = v_inv.intended_geography_ref;

  elsif v_inv.intended_level = 'polling_unit' then
    select gp.code, gw.name, gl.name, gs.name
      into v_geo_name, v_ward_name, v_lga_name, v_state_name
      from public.geography_polling_units gp
      join public.geography_wards gw on gw.id = gp.ward_id
      join public.geography_lgas gl on gl.id = gw.lga_id
      join public.geography_states gs on gs.code = gl.state_code
      where gp.id::text = v_inv.intended_geography_ref;
  end if;

  return query select v_inv.campaign_id, v_campaign_name, v_inv.invited_name, v_inv.intended_member_role,
    v_inv.intended_responsibility_role, v_inv.intended_level, v_inv.intended_geography_ref, v_geo_name,
    v_state_name, v_lga_name, v_ward_name,
    v_inv.status, v_inv.expires_at;
end;
$$;

revoke all on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to authenticated;
grant execute on function public.get_invitation_preview(text) to anon;

comment on function public.get_invitation_preview(text) is
  'Unauthenticated-safe invitation preview, resolved from the real campaign_invitations row and the real canonical geography tables (never fabricated). geography_name is the leaf name/code (unchanged from the original definition); geography_state_name/geography_lga_name/geography_ward_name are additive ancestor context, populated per intended_level via the real geography_polling_units -> geography_wards -> geography_lgas -> geography_states FK chain (or the direct geography_constituencies.state_code hop for constituency-level invitations). Used by the invitation email to show e.g. "Agege, Lagos State"; AcceptInvite.jsx is unaffected, since it only ever read geography_name.';
