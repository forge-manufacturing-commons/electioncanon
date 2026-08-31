// ============================================================
// FORGE ELECTION — ELECTORAL GEOGRAPHY READS
//
// Plain reads against the geography_* reference tables (supabase/
// migrations/20260829000000_election_geography.sql). This is NOT Canon
// data — it carries no campaign scope, no PREPARE/APPROVE step, because it
// is objective shared reference data, not a fact about any one campaign
// (see that migration's own header). RLS at the database layer (public SELECT
// to any authenticated user) is the entire access-control story here; no
// adapter wrapping is needed, the same precedent Election.jsx already sets
// for a plain `supabase.from("campaigns").select("name")` read.
//
// Every function returns `{ data, error }` verbatim from the underlying
// Supabase call (never throws) so callers can render an honest error state
// rather than a silent empty list.
// ============================================================

export async function listOffices({ client }) {
  return client.from("geography_offices").select("id, name, boundary_level, sort_order").order("sort_order");
}

export async function listStates({ client }) {
  return client.from("geography_states").select("code, name, sort_order").order("sort_order");
}

export async function listConstituencies({ client, officeId, stateCode }) {
  if (!officeId || !stateCode) return { data: [], error: null };
  return client.from("geography_constituencies").select("id, office_id, state_code, name")
    .eq("office_id", officeId).eq("state_code", stateCode).order("name");
}

/** Returns the real LGAs under a constituency, plus the naturally-empty (until
 *  a real import lands) wards/pollingUnits arrays — see supabase/geography-
 *  import/README.md. Never fabricates a row that isn't actually in the table. */
export async function getConstituencyTerritory({ client, constituencyId }) {
  if (!constituencyId) return { data: null, error: null };

  const { data: constituency, error: constituencyError } = await client
    .from("geography_constituencies").select("id, office_id, state_code, name").eq("id", constituencyId).maybeSingle();
  if (constituencyError) return { data: null, error: constituencyError };
  if (!constituency) return { data: null, error: null };

  const { data: lgaLinks, error: lgaLinksError } = await client
    .from("geography_constituency_lgas").select("lga_id, geography_lgas(id, name, state_code)").eq("constituency_id", constituencyId);
  if (lgaLinksError) return { data: null, error: lgaLinksError };

  const lgas = (lgaLinks ?? [])
    .map((row) => row.geography_lgas)
    .filter(Boolean)
    .map((row) => ({ id: row.id, name: row.name, stateCode: row.state_code }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lgaIds = lgas.map((l) => l.id);
  let wards = [];
  if (lgaIds.length > 0) {
    const { data: wardRows, error: wardsError } = await client
      .from("geography_wards").select("id, lga_id, name").in("lga_id", lgaIds).order("name");
    if (wardsError) return { data: null, error: wardsError };
    wards = wardRows ?? [];
  }

  const wardIds = wards.map((w) => w.id);
  let pollingUnits = [];
  if (wardIds.length > 0) {
    const { data: puRows, error: puError } = await client
      .from("geography_polling_units").select("id, ward_id, code, name").in("ward_id", wardIds).order("code");
    if (puError) return { data: null, error: puError };
    pollingUnits = puRows ?? [];
  }

  return { data: { constituency, lgas, wards, pollingUnits }, error: null };
}

export async function listWardsForLga({ client, lgaId }) {
  if (!lgaId) return { data: [], error: null };
  return client.from("geography_wards").select("id, lga_id, name").eq("lga_id", lgaId).order("name");
}

export async function listPollingUnitsForWard({ client, wardId }) {
  if (!wardId) return { data: [], error: null };
  return client.from("geography_polling_units").select("id, ward_id, code, name").eq("ward_id", wardId).order("code");
}

export default {
  listOffices, listStates, listConstituencies, getConstituencyTerritory,
  listWardsForLga, listPollingUnitsForWard,
};
