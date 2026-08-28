// ============================================================
// FORGE ELECTION — CAMPAIGN STUDIO ASSETS  (Alpha 1.0)
//
// Direct RLS-protected CRUD against campaign_studio_assets — mutable draft
// content, not a Canon fact, so PREPARE/APPROVE is the wrong shape here
// too (same reasoning as chat/api.js). `content` starts pre-filled with the
// campaign's own workspace identity (name/colours) at creation time, per
// the brief's "reusable design engine, not hard-coded to one campaign."
// ============================================================

import { TEMPLATES } from "./templates.js";

export const ASSET_STATUS = Object.freeze({ DRAFT: "draft", PUBLISHED: "published", SCHEDULED: "scheduled" });

export async function createAsset({ client, userId, campaignId, templateId, title, workspaceIdentity = {} }) {
  const template = TEMPLATES[templateId];
  if (!template) return { asset: null, error: `"${templateId}" is not a recognised template` };
  const clean = String(title ?? "").trim() || template.label;

  const content = {
    templateSnapshot: { id: template.id, dimensions: template.dimensions, typography: template.typography },
    text: Object.fromEntries(template.textSlots.map((s) => [s.id, ""])),
    image: Object.fromEntries(template.imageSlots.map((s) => [s.id, null])),
    identity: {
      campaignName: workspaceIdentity.campaignName ?? null,
      primaryColour: workspaceIdentity.primaryColour ?? null,
      secondaryColour: workspaceIdentity.secondaryColour ?? null,
    },
  };

  const { data, error } = await client
    .from("campaign_studio_assets")
    .insert({ campaign_id: campaignId, asset_type: template.id, template_id: template.id, title: clean, content, status: ASSET_STATUS.DRAFT, created_by: userId })
    .select("id, asset_type, template_id, title, content, status, created_at, updated_at")
    .maybeSingle();
  if (error) return { asset: null, error: error.message };
  return { asset: data, error: null };
}

export async function listAssets({ client, campaignId }) {
  const { data, error } = await client
    .from("campaign_studio_assets")
    .select("id, asset_type, template_id, title, content, status, created_at, updated_at")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });
  if (error) return { assets: [], error: error.message };
  return { assets: data ?? [], error: null };
}

export async function getAsset({ client, assetId }) {
  const { data, error } = await client
    .from("campaign_studio_assets")
    .select("id, asset_type, template_id, title, content, status, created_at, updated_at")
    .eq("id", assetId)
    .maybeSingle();
  if (error) return { asset: null, error: error.message };
  return { asset: data, error: null };
}

export async function updateAsset({ client, assetId, title, content, status }) {
  const patch = { updated_at: new Date().toISOString() };
  if (title != null) patch.title = String(title).trim();
  if (content != null) patch.content = content;
  if (status != null) patch.status = status;
  const { data, error } = await client
    .from("campaign_studio_assets")
    .update(patch)
    .eq("id", assetId)
    .select("id, asset_type, template_id, title, content, status, created_at, updated_at")
    .maybeSingle();
  if (error) return { asset: null, error: error.message };
  return { asset: data, error: null };
}

export default { ASSET_STATUS, createAsset, listAssets, getAsset, updateAsset };
