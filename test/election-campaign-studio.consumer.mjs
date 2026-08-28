// ============================================================
// ELECTION FORGE ALPHA 1.0 — CAMPAIGN STUDIO  (MOCK evidence)
//
// A fake Supabase query-builder client exercising
// src/domains/election/design/assets.js directly — no live database.
// Proves: create/list/get/update asset, and that workspace identity
// (campaign name/colours) is applied into a new asset's content at
// creation time, per the brief's "reusable design engine, not hard-coded
// to one campaign."
// ============================================================

import { createAsset, listAssets, getAsset, updateAsset, ASSET_STATUS } from "../src/domains/election/design/assets.js";
import { ASSET_TYPE, TEMPLATES } from "../src/domains/election/design/templates.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTION FORGE ALPHA — Campaign Studio\n");

function fakeClient() {
  const assets = [];
  function builder(rows) {
    const api = {
      select: () => api,
      eq: (col, val) => builder(rows.filter((r) => r[col] === val)),
      order: () => builder([...rows].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve) => resolve({ data: rows, error: null }),
      insert: (row) => {
        const created = { id: `asset-${assets.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
        assets.push(created);
        return builder([created]);
      },
      update: (patch) => ({
        eq: (col, val) => {
          const row = assets.find((a) => a[col] === val);
          if (row) Object.assign(row, patch);
          return builder(row ? [row] : []);
        },
      }),
    };
    return api;
  }
  return { assets, from: () => builder(assets) };
}

const CAMPAIGN = "camp-studio";
const USER = "designer-1";

// ---------- Create ----------
{
  const client = fakeClient();
  const { asset, error } = await createAsset({
    client, userId: USER, campaignId: CAMPAIGN, templateId: ASSET_TYPE.SOCIAL_SQUARE,
    title: "Launch announcement", workspaceIdentity: { campaignName: "Ada for LG Chair", primaryColour: "#0AB4A0" },
  });
  ok("A1. createAsset succeeds with no error", !error && asset?.id);
  ok("A2. the asset starts as a draft", asset.status === ASSET_STATUS.DRAFT);
  ok("A3. the asset's content is pre-filled with the workspace identity (reusable engine, not campaign-hard-coded)",
     asset.content.identity.campaignName === "Ada for LG Chair" && asset.content.identity.primaryColour === "#0AB4A0");
  ok("A4. the asset's text slots are initialised from the TEMPLATE's own slot list",
     Object.keys(asset.content.text).sort().join(",") === TEMPLATES[ASSET_TYPE.SOCIAL_SQUARE].textSlots.map((s) => s.id).sort().join(","));

  const badTemplate = await createAsset({ client, userId: USER, campaignId: CAMPAIGN, templateId: "not_a_real_template", title: "x" });
  ok("A5. an unrecognised templateId is refused, not silently defaulted", badTemplate.asset === null && Boolean(badTemplate.error));
}

// ---------- List / get / update ----------
{
  const client = fakeClient();
  const { asset } = await createAsset({ client, userId: USER, campaignId: CAMPAIGN, templateId: ASSET_TYPE.ANNOUNCEMENT, title: "Rally" });

  const { assets } = await listAssets({ client, campaignId: CAMPAIGN });
  ok("B1. listAssets returns the created asset", assets.length === 1 && assets[0].id === asset.id);

  const { asset: fetched } = await getAsset({ client, assetId: asset.id });
  ok("B2. getAsset retrieves the same asset by id", fetched?.id === asset.id && fetched.title === "Rally");

  const newContent = { ...asset.content, text: { ...asset.content.text, headline: "Join us Saturday" } };
  const { asset: updated } = await updateAsset({ client, assetId: asset.id, content: newContent, status: ASSET_STATUS.PUBLISHED });
  ok("B3. updateAsset persists edited content and a status change (drafts are mutable, unlike the Canon event log)",
     updated.content.text.headline === "Join us Saturday" && updated.status === ASSET_STATUS.PUBLISHED);

  const { asset: refetched } = await getAsset({ client, assetId: asset.id });
  ok("B4. the update is durable — a fresh read shows the same edited content", refetched.content.text.headline === "Join us Saturday");
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
