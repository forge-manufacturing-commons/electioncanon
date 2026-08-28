// ============================================================
// ELECTIONCANON — SUPABASE CLIENT
//
// EXTRACTED FROM fatt-app's shared src/lib/supabase.js (Alpha 1.7
// standalone extraction). The original file also exported
// Forge-A-Truck-specific manufacturing seed data (SEED_JOBS) and
// functions (fetchJobs/updateJobStage/submitLead) for tables
// ElectionCanon never reads or writes (component_jobs, diaspora_leads).
// None of that is ElectionCanon's — this file keeps only the Supabase
// client construction and the isConfigured/demo-mode gate every
// ElectionCanon data function actually depends on.
// ============================================================

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// If env vars aren't set yet, the app still runs on seed data (demo mode),
// so you can see it working before wiring Supabase.
export const isConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'))

export const supabase = isConfigured ? createClient(url, key) : null
