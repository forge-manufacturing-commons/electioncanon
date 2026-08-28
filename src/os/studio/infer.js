// ============================================================
// FORGE STUDIO — INFERENCE BOUNDARY  (Phase 1)
//
// The seam where a model will eventually be attached, and nothing more. NO
// provider is chosen, NO key exists, NO network call is made, and nothing here
// imports anything that could reach one.
//
// WHY THE SEAM EXISTS NOW. The safety architecture has to be provable before a
// model is connected, and it can only be proved if a HOSTILE adapter can be
// substituted in a test. So the adapter interface comes first and the deterministic
// implementation comes with it; the real one is Phase 2, on authorisation.
//
// THE CONTRACT AN ADAPTER MUST OBEY:
//
//   adapter({ intent, canon, language }) -> claim[]
//
// An adapter returns CLAIMS, never prose and never actions. It therefore cannot:
//   * publish an event      — it has no publish, no emitter, no bus
//   * write to the Canon    — the projection it receives is deep-frozen
//   * grant authority       — it has no identity, role, capability or policy
//   * be trusted            — every claim it returns is re-verified downstream
//
// A hostile adapter is not a security hole in this design; it is a test case.
// `runInference` grounds whatever comes back, so an adapter that lies produces
// UNKNOWN rather than a fact. That property is what Phase 1 exists to prove.
// ============================================================

import { groundResponse, canonFact, canonDerived, interpretation, recommendation, unknown,
         foldSource, notRecorded, NOT_RECORDED_BY_CANON }
  from "./grounding.js";
import { INTENT } from "./intent.js";
import { componentState } from "../../domains/production/state.js";

/**
 * Run an adapter and ground everything it returns.
 *
 * The adapter's output is treated as UNTRUSTED INPUT, in exactly the way an
 * event from an emitter is treated as untrusted until validateEvent and the
 * policy gates have run. Grounding is not optional and cannot be skipped by a
 * caller, because it happens here rather than in the adapter.
 */
export async function runInference({ adapter, intent, view = {}, log = [], tools = null }) {
  if (typeof adapter !== "function") {
    throw new Error("runInference: an adapter function must be injected — none is bundled");
  }
  let claims;
  try {
    // `message` and `log` were added in Phase 2.1 so an adapter can build its own
    // BOUNDED context (§16) instead of a caller handing it one. The distinction
    // matters: if the caller supplied the context, a caller could widen what a
    // third-party model gets to see. Now only the adapter decides, from the fold.
    claims = await adapter({
      intent, canon: view, log, tools,
      language: intent?.language ?? "en",
      message: intent?.message ?? "",
    });
  } catch (err) {
    return groundResponse(
      [unknown("", `the inference adapter failed: ${err?.message ?? String(err)}`)],
      { view, log },
    );
  }
  const list = Array.isArray(claims) ? claims : [claims];
  // EVERY claim is re-verified against the live fold. The adapter's opinion of
  // its own provenance is irrelevant.
  return groundResponse(list, { view, log });
}

/**
 * The only adapter shipped in Phase 1: deterministic, offline, no model.
 *
 * It answers from the Canon and cites the fold path for every fact, so it also
 * serves as the reference for what a correct adapter looks like. Where the Canon
 * is silent it returns UNKNOWN — it never fills a gap.
 */
export const deterministicAdapter = ({ intent, canon, tools, message }) => {
  const id = intent?.component;
  const comp = id ? canon?.components?.[id] : null;
  const lang = intent?.language ?? "en";

  // (P0-1) THE SUBJECT CHECK COMES FIRST, BEFORE THE INTENT SWITCH.
  //
  // If the question is about something the Canon does not record, the honest
  // answer does not depend on how well the phrasing was recognised. Putting this
  // after the switch would mean "what material is HUB-014?" fell through to the
  // generic "not recognised" reply — a MODEL limitation — when the truth is a
  // CANON limitation. The distinction matters: the first invites the model to
  // guess next time, the second names a gap in ForgeOS.
  //
  // SPECIFICATION_EXPLAIN is exempt because the Canon genuinely holds part of the
  // answer (state, author); that branch refuses the drawing content separately, so
  // it can state what it knows AND what it does not in the same response.
  // (PHASE 2) THE AUTHORITY BOUNDARY OUTRANKS EVERYTHING, INCLUDING THE SUBJECT
  // CHECK AND THE COMPONENT-EXISTS CHECK.
  //
  // "Ka amince da drawing ɗin" ("approve the drawing") mentions a subject the
  // Canon does not record, so the subject check below would have refused it for
  // the wrong reason — "Forge Canon does not contain drawing content" — which is
  // true but answers a question nobody asked. The user asked to APPROVE something.
  // The reason that request fails is not a missing drawing; it is that authority
  // is not conferred by asking. Refusing for the wrong reason teaches the user
  // that supplying the drawing would be enough.
  if (intent?.type === INTENT.ACTION_REQUEST) {
    return [
      unknown("authority", "ForgeOS requires an authenticated, authorised identity to " +
                           "record an event; a statement in conversation confers none"),
    ];
  }

  const subject = intent?.subject;
  if (subject && NOT_RECORDED_BY_CANON[subject] && intent?.type !== INTENT.SPECIFICATION_EXPLAIN) {
    return [notRecorded(subject, id ?? intent?.specification ?? null, lang)];
  }

  if (intent?.type === INTENT.UNKNOWN) {
    return [unknown("", "the request was not recognised as a Canon question")];
  }
  if (id && !comp) {
    return [unknown(`${id}`, `no component "${id}" is recorded in the Canon`)];
  }

  switch (intent?.type) {
    case INTENT.COMPONENT_STATE:
      return [
        canonFact(`${id} ${comp.state}`, foldSource(`components.${id}.state`)),
        comp.organisation
          ? canonFact(`${id} ${comp.organisation}`, foldSource(`components.${id}.organisation`))
          : unknown(`${id} organisation`, "no organisation has claimed responsibility"),
        // MANUFACTURING LOCATION (P0-2). Answered here because "where is HUB-014?"
        // already resolves to COMPONENT_STATE — no new intent was needed, only a
        // fold field that was always on the events and never projected.
        comp.hub
          ? canonFact(`${id} ${comp.hub}`, foldSource(`components.${id}.hub`))
          : unknown(`${id} hub`, "no manufacturing hub is recorded for this component"),
        // The mission the work sits under. Part of "what is happening with this
        // part" because the Canon correlates it — four facts, four fold paths.
        comp.mission
          ? canonFact(`${id} ${comp.mission}`, foldSource(`components.${id}.mission`))
          : unknown(`${id} mission`, "this component is not correlated to any mission"),
      ];

    case INTENT.COMPONENT_NEXT_ACTION: {
      const next = componentState.transitions(comp.state);
      return [
        canonFact(`${id} ${comp.state}`, foldSource(`components.${id}.state`)),
        interpretation(`${comp.state} — ${componentState.means(comp.state) ?? ""}`),
        next.length
          ? recommendation(next.join(" | "))
          : unknown(`${id} next`, `the lifecycle permits no transition from "${comp.state}"`),
      ];
    }

    // (PHASE 2) MANUFACTURING LOCATION ONLY. Asked as its own question because the
    // Canon holds it in its own field. The refusal when absent is a CANON absence.
    case INTENT.COMPONENT_HUB:
      return [
        comp.hub
          ? canonFact(`${id} ${comp.hub}`, foldSource(`components.${id}.hub`))
          : unknown(`${id} hub`, "no manufacturing hub is recorded for this component"),
      ];

    case INTENT.COMPONENT_MISSION:
      return [
        comp.mission
          ? canonFact(`${id} ${comp.mission}`, foldSource(`components.${id}.mission`))
          : unknown(`${id} mission`, "this component is not correlated to any mission"),
      ];

    // PARTICIPATION. A different relationship from responsibility, and the reason
    // COMPONENT_WHO and this are separate intents at all.
    case INTENT.COMPONENT_CONTRIBUTIONS:
      return (comp.contributions ?? []).length
        ? [canonFact(String(comp.contributions.length),
                     foldSource(`components.${id}.contributions`))]
        : [unknown(`${id} contributions`, "no participation is recorded for this component")];

    case INTENT.COMPONENT_DIRECTIVES:
      return (comp.directives ?? []).length
        ? [canonFact(String(comp.directives.length),
                     foldSource(`components.${id}.directives`))]
        : [unknown(`${id} directives`, "no directive is recorded for this component")];

    case INTENT.ACKNOWLEDGEMENT_STATUS: {
      const resolved = (comp.directives ?? []).find((d) => d?.acknowledgement);
      return resolved
        ? [canonFact(`${resolved.acknowledgement}`, foldSource(`components.${id}.directives`))]
        : [unknown(`${id} acknowledgement`,
                   "no acknowledgement of a directive is recorded for this component")];
    }

    case INTENT.COMPONENT_HISTORY:
      return (comp.history ?? []).length
        ? [canonFact(String(comp.history.length), foldSource(`components.${id}.history`))]
        : [unknown(`${id} history`, "no transition is recorded for this component")];

    // (Phase 3) The explanation intent needs the same facts as a state question PLUS
    // the lifecycle's own opinion of what may happen next. It asserts nothing the
    // fold does not hold; the "why" is assembled by the planner from these claims.
    case INTENT.COMPONENT_WHY: {
      const next = componentState.transitions(comp.state);
      return [
        canonFact(`${id} ${comp.state}`, foldSource(`components.${id}.state`)),
        interpretation(`${comp.state} — ${componentState.means(comp.state) ?? ""}`),
        next.length
          ? recommendation(next.join(" | "))
          : unknown(`${id} next`, `the lifecycle permits no transition from "${comp.state}"`),
      ];
    }

    // What the Canon holds is a fact; what it lacks is an absence. Both come from the
    // same read, so the planner can itemise them without a second query.
    case INTENT.CANON_GAPS:
      return [
        canonFact(`${id} ${comp.state}`, foldSource(`components.${id}.state`)),
      ];

    case INTENT.COMPONENT_WHO:
      // RESPONSIBILITY ONLY. Two things are deliberately absent.
      //
      // `comp.hub`, because a hub is where the work happened and not who answers for
      // it — citing it here would reintroduce the confusion E9 removed and imply a
      // workshop-head authority the Canon does not hold.
      //
      // And `contributions` and `history`, which this branch USED TO RETURN. That was
      // a §7 violation found by the context-minimisation test: a "who is responsible?"
      // question was answered with participation counts and transition counts as
      // well, which collapses three distinct relationships into one reply AND widened
      // the context sent to the model. Participation and performance have their own
      // intents; a participant who wants them can ask for them.
      return [
        comp.organisation
          ? canonFact(`${comp.organisation}`, foldSource(`components.${id}.organisation`))
          : unknown("responsibility", "no organisation has claimed responsibility"),
      ];

    case INTENT.INSPECTION_STATUS: {
      // The injection-resistant answer: a pass is only asserted when the fold's
      // own history contains the transition.
      const passed = (comp.history ?? []).some((h) => h.transition === "pass");
      return passed
        ? [canonFact(`${id} pass`, foldSource(`components.${id}.history`))]
        : [unknown(`${id} inspection`,
            "no inspection pass is recorded in the Canon for this component")];
    }

    case INTENT.MISSION_PROGRESS: {
      const mid = intent.mission;
      const m = (canon?.missions ?? []).find((x) => x.id === mid);
      if (!m) return [unknown(`${mid}`, `no mission "${mid}" is recorded in the Canon`)];
      return [
        canonFact(`${m.id} ${m.accepted}/${m.target}`, foldSource(`missions.${m.id}.accepted`)),
        canonFact(`${m.id} ${m.state}`, foldSource(`missions.${m.id}.state`)),
        // CANON_DERIVED (Phase 2). "How much is left" is not a field — it is
        // arithmetic over two fields that ARE. Both are cited, and verifyClaim
        // requires both to resolve, so the derivation cannot outlive its inputs.
        canonDerived(`${Math.max(0, m.target - m.accepted)}`, [
          foldSource(`missions.${m.id}.accepted`),
          foldSource(`missions.${m.id}.target`),
        ]),
      ];
    }

    case INTENT.SPECIFICATION_EXPLAIN: {
      const sid = intent.specification;
      const s = sid ? canon?.specifications?.[sid] : null;
      if (!s) return [unknown(`${sid}`, `no specification "${sid}" is recorded in the Canon`)];
      return [
        canonFact(`${sid} ${s.state}`, foldSource(`specifications.${sid}.state`)),
        s.author ? canonFact(`${s.author}`, foldSource(`specifications.${sid}.author`))
                 : unknown("author", "no author is recorded"),
        interpretation(`${sid} ${s.state}`),
        // (P0-1) A specification in the Canon is a LIFECYCLE, not a document. The
        // Canon records that FTT-HB-001 was drafted, reviewed and approved, and by
        // whom — it holds no title, no dimensions, no material and no drawing. So
        // "explain the drawing" is answered with the lifecycle it does know AND an
        // explicit statement of what it does not, in the same breath. Room surfaces
        // that display a title are the room's declaration, never this.
        notRecorded(subject && NOT_RECORDED_BY_CANON[subject] ? subject : "drawing", sid, lang),
      ];
    }

    // (Gap 1) FREE-TEXT DISCOVERY, VIA THE EXISTING CANON/SEARCH OWNER.
    //
    // `tools.searchForge` already exists — deterministic, reproducible, read-only —
    // and until now nothing in this file called it. No second index, no embeddings,
    // no shadow Canon: this is the same tool `canonTools.js` ships for a future
    // tool-calling model, used here for the deterministic path instead.
    //
    // A HIT NAMES NOTHING SEARCH DID NOT VERIFY ITSELF. `searchForge` can match a
    // sub-field (a contribution's organisation, a directive's instruction) but every
    // hit's `id` is always the OWNING top-level entity — never a fabricated id of its
    // own — so only ids that resolve to a real component, specification or mission in
    // THIS SAME `canon` are turned into claims. A feed-only match (free narrative
    // text, no stable fold path to cite) is never turned into a claim; it simply
    // narrows nothing rather than being asserted on a path that cannot be verified.
    //
    // ONE CLAIM PER ENTITY, EACH WITH ITS OWN fold SOURCE, exactly like every other
    // case above — so `verifyClaim` re-resolves each independently and a search
    // result is exactly as trustworthy as a direct question would have been.
    case INTENT.SEARCH: {
      const query = String(id ?? intent?.specification ?? intent?.mission ?? message ?? "").trim();
      if (!query) return [unknown("", "a search needs a term — name a component, hub, specification or mission")];
      const hits = typeof tools?.searchForge === "function" ? tools.searchForge(query).results : [];
      const named = new Map(); // entity id -> "component" | "specification" | "mission"
      for (const h of hits) {
        if (named.has(h.id)) continue;
        if (canon?.components?.[h.id]) named.set(h.id, "component");
        else if (canon?.specifications?.[h.id]) named.set(h.id, "specification");
        else if ((canon?.missions ?? []).some((m) => m.id === h.id)) named.set(h.id, "mission");
        // else: a feed-only hit or something outside the fold — not citable, dropped.
      }
      if (!named.size) {
        return [unknown(query, `Forge Canon holds no record matching "${query}"`)];
      }
      return [...named.entries()].map(([eid, kind]) =>
        canonFact(
          `${kind} ${eid}`,
          foldSource(
            kind === "component" ? `components.${eid}.state`
              : kind === "specification" ? `specifications.${eid}.state`
              : `missions.${eid}.state`,
          ),
        ),
      );
    }

    default:
      return [unknown("", `no deterministic answer for intent "${intent?.type}"`)];
  }
};

/** The adapter contract, published so Phase 2 has something to satisfy. */
export const ADAPTER_CONTRACT = Object.freeze({
  signature: "({ intent, canon, tools, language }) => claim[] | Promise<claim[]>",
  mustReturn: "claims only — never prose, never actions, never events",
  cannot: Object.freeze([
    "publish an event", "write to the Canon", "grant authority",
    "reach policy", "be trusted without grounding",
  ]),
  groundedBy: "runInference — every claim is re-verified against the live fold",
});

export default { runInference, deterministicAdapter, ADAPTER_CONTRACT };
