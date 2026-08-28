// ============================================================
// FORGE OS — CANONICAL EVENT SCHEMA
//
// This is the AUTHORING layer for manufacturing events. The Activity
// Engine (bus) and any downstream registry are the CONSUMERS; this
// module is the PRODUCER contract. Direction of dependency is one way.
//
// Why it exists: a producer that writes `spec:` instead of
// `specification:` publishes successfully and creates nothing. The
// event is accepted, the object never appears, and the failure is
// silent. This module removes the guesswork — canonical field names,
// canonical types, canonical statuses, and validation that REFUSES
// malformed domain records rather than warning about them.
//
// SELF-CONTAINED BY DESIGN. It imports only FORGE_OBJECT from
// ForgeRuntime.js. It deliberately does NOT import a registry or a
// studio topology, so it cannot be broken by modules that do not
// exist yet, and it will not need rewriting when they arrive.
// ============================================================

import { FORGE_OBJECT } from "./ForgeRuntime.js";

export const EVENT_SCHEMA_VERSION = "1.1.0";

// ---------- EVENT IDENTITY ----------
// Every event gets a permanent id at creation. Added now rather than later:
// retrofitting identity onto a populated stream is not possible, because the
// events already written have none.
export function makeEventId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  // RFC4122-shaped fallback for environments without WebCrypto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- STATUS VOCABULARY ----------
export const STATUS = Object.freeze({
  RUNNING:     "running",
  IDLE:        "idle",
  FAULT:       "fault",
  MAINTENANCE: "maintenance",
  BLOCKED:     "blocked",
  COMPLETE:    "complete",
  PENDING:     "pending",
  UNKNOWN:     "unknown",
});
const STATUS_VALUES = new Set(Object.values(STATUS));

// ---------- INSPECTION RESULT VOCABULARY (closes C22) ----------
// Previously the factory accepted 'fail'/'failed'/'pass'/'passed' as
// synonyms, so 'reject', 'nok' or 'no-pass' silently resolved to a
// RECORDED event — the wrong type, with no warning. Canonical values
// are defined here, the factory uses them, the validator checks them.
export const INSPECTION_RESULT = Object.freeze({
  PASS:    "pass",
  FAIL:    "fail",
  PENDING: "pending",
});
const RESULT_VALUES = new Set(Object.values(INSPECTION_RESULT));

// ---------- ACKNOWLEDGEMENT OUTCOME (E9.5) ----------
// One event with a canonical outcome, following the `inspection.*` precedent
// where `result` distinguishes pass from fail rather than two unrelated types.
// A rejection is a legitimate response to a directive, not a separate kind of
// fact, so it must not become its own event type.
export const ACKNOWLEDGEMENT = Object.freeze({
  ACCEPTED: "accepted",
  REJECTED: "rejected",
});
const ACKNOWLEDGEMENT_VALUES = new Set(Object.values(ACKNOWLEDGEMENT));

// ---------- EVENT TYPES ----------
export const EVENT_TYPES = Object.freeze({
  MACHINE: Object.freeze({
    START:       "machine.start",
    RUN:         "machine.run",
    COMPLETE:    "machine.complete",
    STOP:        "machine.stop",
    IDLE:        "machine.idle",
    FAULT:       "machine.fault",
    MAINTENANCE: "machine.maintenance",
  }),
  PRODUCTION: Object.freeze({
    COMPONENT_PRODUCED: "production.component.produced",
    STAGE_ADVANCED:     "production.stage.advanced",
    ASSEMBLY_JOINED:    "production.assembly.joined",
    // COORDINATION (E9.3). A two-party fact: someone directed someone else to do
    // something about an artefact. Drives NO lifecycle transition and confers no
    // responsibility — see projections.js and EVENT_CAPABILITY.
    WORK_DIRECTED:      "production.work.directed",
    // The RESPONSE to a specific directive (E9.5). Drives no transition, confers
    // no responsibility, creates no participation, and proves nothing about
    // whether the work was done.
    WORK_ACKNOWLEDGED:  "production.work.acknowledged",
    PROGRAM_STARTED:    "production.program.started",
    PROGRAM_FINISHED:   "production.program.finished",
  }),
  INSPECTION: Object.freeze({
    RECORDED: "inspection.recorded",
    PASSED:   "inspection.passed",
    FAILED:   "inspection.failed",
    REWORKED: "inspection.reworked",
  }),
  ENGINEERING: Object.freeze({
    SPEC_DRAFTED:  "engineering.specification.drafted",
    SPEC_RELEASED: "engineering.specification.released",
    SPEC_REVISED:  "engineering.specification.revised",
    SPEC_APPROVED: "engineering.specification.approved",
  }),
  PERSON: Object.freeze({
    ARRIVED:            "person.arrived",
    COMPETENCY_CLAIMED:  "person.competency.claimed",
    COMPETENCY_VERIFIED: "person.competency.verified",
  }),
  KNOWLEDGE: Object.freeze({
    PUBLISHED:  "knowledge.published",
    TRANSLATED: "knowledge.translated",
    REVIEWED:   "knowledge.reviewed",
  }),
  MISSION: Object.freeze({
    CREATED:    "mission.created",
    AUTHORISED: "mission.authorised",
    CLOSED:     "mission.closed",
  }),
  NAVIGATION: Object.freeze({ ENTER: "navigation.enter" }),
  SYSTEM: Object.freeze({
    LANGUAGE_CHANGED: "system.language.changed",
    BOOTED:           "system.booted",
  }),
});

// ---------- LEGACY BRIDGE ----------
// The live bus in ActivityEngine.jsx derives machine and hub state from
// its own eight event strings. Canonical events do not appear in those
// maps, so a factory event would publish without moving hub state.
// Rather than silently diverge, the equivalence is declared here and
// callers can bridge explicitly via toLegacyType().
export const LEGACY_EVENT = Object.freeze({
  DRAWING_APPROVED:     "drawing.approved",
  COMPONENT_RECEIVED:   "component.received",
  INSPECTION_COMPLETED: "inspection.completed",
  MACHINE_STARTED:      "machine.started",
  MACHINE_STOPPED:      "machine.stopped",
  QUALITY_VERIFIED:     "quality.verified",
  SHIPMENT_DISPATCHED:  "shipment.dispatched",
  MAINTENANCE_OPENED:   "maintenance.opened",
});

const CANONICAL_TO_LEGACY = Object.freeze({
  [EVENT_TYPES.MACHINE.START]:              LEGACY_EVENT.MACHINE_STARTED,
  [EVENT_TYPES.MACHINE.RUN]:                LEGACY_EVENT.MACHINE_STARTED,
  [EVENT_TYPES.MACHINE.STOP]:               LEGACY_EVENT.MACHINE_STOPPED,
  [EVENT_TYPES.MACHINE.IDLE]:               LEGACY_EVENT.MACHINE_STOPPED,
  [EVENT_TYPES.MACHINE.COMPLETE]:           LEGACY_EVENT.MACHINE_STOPPED,
  [EVENT_TYPES.MACHINE.MAINTENANCE]:        LEGACY_EVENT.MAINTENANCE_OPENED,
  [EVENT_TYPES.MACHINE.FAULT]:              LEGACY_EVENT.MAINTENANCE_OPENED,
  [EVENT_TYPES.PRODUCTION.COMPONENT_PRODUCED]: LEGACY_EVENT.COMPONENT_RECEIVED,
  [EVENT_TYPES.INSPECTION.RECORDED]:        LEGACY_EVENT.INSPECTION_COMPLETED,
  [EVENT_TYPES.INSPECTION.PASSED]:          LEGACY_EVENT.QUALITY_VERIFIED,
  [EVENT_TYPES.INSPECTION.FAILED]:          LEGACY_EVENT.INSPECTION_COMPLETED,
  [EVENT_TYPES.ENGINEERING.SPEC_RELEASED]:  LEGACY_EVENT.DRAWING_APPROVED,
  [EVENT_TYPES.ENGINEERING.SPEC_APPROVED]:  LEGACY_EVENT.DRAWING_APPROVED,
});

/** Legacy equivalent of a canonical type, or null when there is none. */
export function toLegacyType(type) {
  return CANONICAL_TO_LEGACY[type] ?? null;
}

// ---------- MACHINE STATUS, DETERMINISTIC (closes C4) ----------
const MACHINE_STATUS_BY_TYPE = Object.freeze({
  [EVENT_TYPES.MACHINE.START]:       STATUS.RUNNING,
  [EVENT_TYPES.MACHINE.RUN]:         STATUS.RUNNING,
  [EVENT_TYPES.MACHINE.COMPLETE]:    STATUS.IDLE,
  [EVENT_TYPES.MACHINE.STOP]:        STATUS.IDLE,
  [EVENT_TYPES.MACHINE.IDLE]:        STATUS.IDLE,
  [EVENT_TYPES.MACHINE.FAULT]:       STATUS.FAULT,
  [EVENT_TYPES.MACHINE.MAINTENANCE]: STATUS.MAINTENANCE,
});

/** The status a type implies, without keyword or regex guessing. */
export function intendedStatus(type) {
  return MACHINE_STATUS_BY_TYPE[type] ?? null;
}

// ---------- FIELD VOCABULARY ----------
// The public producer contract. A consumer registry keeps its own
// internal field list; these are the same vocabulary from the two
// sides of the bus and MUST stay synchronised — see assertVocabulary.
export const CLASS_FIELDS = Object.freeze({
  [FORGE_OBJECT.PERSON]:        ["person", "human", "actor", "operator", "user"],
  [FORGE_OBJECT.WORKSHOP]:      ["workshop", "hub", "room", "studio", "cell"],
  [FORGE_OBJECT.MACHINE]:       ["machine"],
  [FORGE_OBJECT.SPECIFICATION]: ["specification", "spec", "drawing"],
  [FORGE_OBJECT.COMPONENT]:     ["component", "part"],
  [FORGE_OBJECT.ASSEMBLY]:      ["assembly"],
  // program / mission / workPackage are the strategic hierarchy. They are in
  // the vocabulary from the outset even though V1 does not populate them.
  [FORGE_OBJECT.PROGRAM]:       ["program", "mission", "workPackage"],
  [FORGE_OBJECT.KNOWLEDGE]:     ["knowledge", "document"],
  [FORGE_OBJECT.COMPETENCY]:    ["competency", "skill"],
  [FORGE_OBJECT.INSTITUTION]:   ["institution", "organisation", "organization"],
});

/** The one field a producer SHOULD use per class. Aliases are tolerated, not encouraged. */
export const PRIMARY_FIELD = Object.freeze(
  Object.fromEntries(Object.entries(CLASS_FIELDS).map(([cls, fields]) => [cls, fields[0]]))
);

export const FIELD_TO_CLASS = Object.freeze(
  Object.entries(CLASS_FIELDS).reduce((acc, [cls, fields]) => {
    for (const f of fields) acc[f] = cls;
    return acc;
  }, {})
);

// ============================================================
// POLYMORPHIC ENTITY FIELDS  (E9.3)
//
// CLASS_FIELDS maps a field to EXACTLY ONE Forge Object class, which is what
// makes `classForField` answerable. `directedTo` cannot live there: a directive
// may be addressed to a PERSON or to an INSTITUTION, and forcing it into either
// list would make `classForField("directedTo")` wrong half the time.
//
// So it is declared here instead — explicitly, not by surviving `compact()`. The
// class is not guessed from the value; the EVENT declares it in
// `directedToClass`, and validateEvent refuses a target whose class is missing
// or outside the permitted set. That keeps a two-party fact structurally
// addressable without weakening the one-field-one-class rule everywhere else.
//
// `directedTo` is registered as a canonical entity field below so that
// `isEntityField` recognises it and an event carrying only a target still
// attaches to a Forge Object.
// ============================================================
export const DIRECTED_TO_CLASSES = Object.freeze([FORGE_OBJECT.PERSON, FORGE_OBJECT.INSTITUTION]);

export const POLYMORPHIC_FIELDS = Object.freeze({
  // field name -> { classes it may take, the field that declares which }
  directedTo: Object.freeze({ classes: DIRECTED_TO_CLASSES, classField: "directedToClass" }),
});

const ENTITY_FIELD_NAMES = new Set([
  ...Object.keys(FIELD_TO_CLASS),
  ...Object.keys(POLYMORPHIC_FIELDS),
]);

/** The class a polymorphic target declares, or null. Never inferred from the value. */
export const declaredClassOf = (event, field = "directedTo") => {
  const spec = POLYMORPHIC_FIELDS[field];
  if (!spec || !event) return null;
  const declared = event[spec.classField];
  return spec.classes.includes(declared) ? declared : null;
};

export const classForField = (field) => FIELD_TO_CLASS[field] ?? null;
export const isEntityField = (field) => ENTITY_FIELD_NAMES.has(field);

/**
 * Enforcement hook for C19 — the synchronisation gap between this
 * producer vocabulary and a consumer's internal field list. There is
 * no way to enforce it across module boundaries automatically, so a
 * consumer calls this at boot and finds out loudly instead of losing
 * objects silently.
 */
export function assertVocabulary(consumerFieldNames) {
  const consumer = new Set(consumerFieldNames || []);
  const producerOnly = [...ENTITY_FIELD_NAMES].filter((f) => !consumer.has(f));
  const consumerOnly = [...consumer].filter((f) => !ENTITY_FIELD_NAMES.has(f));
  return {
    synchronised: producerOnly.length === 0 && consumerOnly.length === 0,
    // Producers will emit these; the consumer ignores them -> silent object loss.
    producerOnly,
    // The consumer accepts these; no producer emits them -> dead vocabulary.
    consumerOnly,
  };
}

const META_TYPE_PREFIXES = ["navigation.", "system."];

// ---------- REQUIRED FIELDS (closes C21) ----------
// Previously validation was advisory: an inspection record with no
// component produced a warning and published anyway. In a traceability
// system that record is worse than useless, so these are ERRORS.
const REQUIRED_FIELDS_BY_TYPE_PREFIX = Object.freeze({
  "machine.":     ["machine", "summary"],
  "production.":  ["component", "summary"],
  "inspection.":  ["component", "result", "summary"],
  "engineering.": ["specification", "summary"],
  "person.":      ["person", "summary"],
  "knowledge.":   ["knowledge", "summary"],
  "mission.":     ["mission", "summary"],
  "navigation.":  ["studio"],
});

// ---------- MISSION CORRELATION POLICY ----------
// Every canonical event states, explicitly, whether it may belong to a mission.
//
// Correlation must be explicit, never inferred from proximity, sequence, hub,
// component, machine, program or UI context. Before this declaration the system
// could only distinguish "mission.* requires a mission" from "everything else",
// so the difference between an event that MAY carry one and an event for which a
// mission is meaningless existed only in reviewers' heads.
//
// The classification is CAUSAL OWNERSHIP, not usage. The question for each type
// is: if this event happens, does it necessarily describe a change to, or an
// action within, one specific mission?
//
//   REQUIRED   definitionally about a mission
//   OPTIONAL   may serve a mission, or may not — a specification can be authored
//              speculatively and a component produced for stock
//   FORBIDDEN  a mission cannot own it; attaching one would be false
//   UNKNOWN    causal ownership is genuinely undetermined from the domain today.
//              Deliberately NOT folded into OPTIONAL: "we permit this" and "we
//              have not decided" are different facts, and collapsing them would
//              lose the second one.
//
// Keyed by exact type rather than prefix, because a prefix cannot express that
// machine.fault may block a mission while system.booted may not, and because
// per-type keys are what let the audit detect a NEW event type that arrives
// without a classification. Values reference EVENT_TYPES directly so a renamed
// event breaks the policy loudly instead of leaving a stale string behind.
export const MISSION_POLICY_LEVEL = Object.freeze({
  REQUIRED:  "MISSION_REQUIRED",
  OPTIONAL:  "MISSION_OPTIONAL",
  FORBIDDEN: "MISSION_FORBIDDEN",
  UNKNOWN:   "MISSION_UNKNOWN",
});
const _L = MISSION_POLICY_LEVEL;

export const MISSION_POLICY = Object.freeze({
  // REQUIRED — a mission event without a mission names nothing. Already enforced
  // twice before this policy existed: missionEvent() throws, and
  // REQUIRED_FIELDS_BY_TYPE_PREFIX["mission."] raises a validation error. The
  // policy records the intent; it does not add a third enforcement path.
  [EVENT_TYPES.MISSION.CREATED]:    _L.REQUIRED,
  [EVENT_TYPES.MISSION.AUTHORISED]: _L.REQUIRED,
  [EVENT_TYPES.MISSION.CLOSED]:     _L.REQUIRED,

  // OPTIONAL — engineering, production and inspection describe a specification
  // or a component that MAY be serving a mission. Mission-boundness is a
  // property of a work order, and no work-order model exists, so requiring it
  // here would make legitimate uncorrelated work impossible.
  [EVENT_TYPES.ENGINEERING.SPEC_DRAFTED]:  _L.OPTIONAL,
  [EVENT_TYPES.ENGINEERING.SPEC_RELEASED]: _L.OPTIONAL,
  [EVENT_TYPES.ENGINEERING.SPEC_REVISED]:  _L.OPTIONAL,
  [EVENT_TYPES.ENGINEERING.SPEC_APPROVED]: _L.OPTIONAL,

  [EVENT_TYPES.PRODUCTION.COMPONENT_PRODUCED]: _L.OPTIONAL,
  [EVENT_TYPES.PRODUCTION.STAGE_ADVANCED]:     _L.OPTIONAL,
  [EVENT_TYPES.PRODUCTION.ASSEMBLY_JOINED]:    _L.OPTIONAL,
  [EVENT_TYPES.PRODUCTION.WORK_DIRECTED]:      _L.OPTIONAL,
  [EVENT_TYPES.PRODUCTION.WORK_ACKNOWLEDGED]:  _L.OPTIONAL,
  [EVENT_TYPES.PRODUCTION.PROGRAM_STARTED]:    _L.OPTIONAL,
  [EVENT_TYPES.PRODUCTION.PROGRAM_FINISHED]:   _L.OPTIONAL,

  [EVENT_TYPES.INSPECTION.RECORDED]: _L.OPTIONAL,
  [EVENT_TYPES.INSPECTION.PASSED]:   _L.OPTIONAL,
  [EVENT_TYPES.INSPECTION.FAILED]:   _L.OPTIONAL,
  [EVENT_TYPES.INSPECTION.REWORKED]: _L.OPTIONAL,

  // machine.* is OPTIONAL and not FORBIDDEN for one specific reason: causalMap
  // derives machine.fault -> missionImpact "blocked". Forbidding a mission here
  // would make that impact permanently unattributable. Permitted, never
  // required — a mill serves whichever mission a work order gives it, and the
  // story's mill-03 steps stay uncorrelated because nothing states which.
  [EVENT_TYPES.MACHINE.START]:       _L.OPTIONAL,
  [EVENT_TYPES.MACHINE.RUN]:         _L.OPTIONAL,
  [EVENT_TYPES.MACHINE.COMPLETE]:    _L.OPTIONAL,
  [EVENT_TYPES.MACHINE.STOP]:        _L.OPTIONAL,
  [EVENT_TYPES.MACHINE.IDLE]:        _L.OPTIONAL,
  [EVENT_TYPES.MACHINE.FAULT]:       _L.OPTIONAL,
  [EVENT_TYPES.MACHINE.MAINTENANCE]: _L.OPTIONAL,

  [EVENT_TYPES.KNOWLEDGE.PUBLISHED]:  _L.OPTIONAL,
  [EVENT_TYPES.KNOWLEDGE.TRANSLATED]: _L.OPTIONAL,
  [EVENT_TYPES.KNOWLEDGE.REVIEWED]:   _L.OPTIONAL,

  // FORBIDDEN — meta events describe the runtime, not manufacturing. A mission
  // cannot own a boot, a language change or a room navigation. These were
  // accepting a mission field and passing validation before this policy.
  [EVENT_TYPES.NAVIGATION.ENTER]:          _L.FORBIDDEN,
  [EVENT_TYPES.SYSTEM.LANGUAGE_CHANGED]:   _L.FORBIDDEN,
  [EVENT_TYPES.SYSTEM.BOOTED]:             _L.FORBIDDEN,

  // UNKNOWN — a person arriving is not mission work, but a competency verified
  // in order to work on a mission might be. No producer exercises it and the
  // domain does not settle it, so the honest record is "undetermined".
  // Reclassifying these to make an audit greener would be a decision disguised
  // as housekeeping.
  [EVENT_TYPES.PERSON.ARRIVED]:             _L.UNKNOWN,
  [EVENT_TYPES.PERSON.COMPETENCY_CLAIMED]:  _L.UNKNOWN,
  [EVENT_TYPES.PERSON.COMPETENCY_VERIFIED]: _L.UNKNOWN,
});

/** The policy for a type, or null when the type carries no classification. */
export const missionPolicyFor = (type) => MISSION_POLICY[type] ?? null;

// ============================================================
// EVENT CAPABILITY — which events require which authority  (E8)
//
// The vocabulary already separates AUTHORING from APPROVING and both from
// ADVISING: `engineering.author`, `engineering.approve` and `advisory.offer` are
// three distinct capabilities in Roles.js, and `diaspora_expert` holds the first
// and third but deliberately NOT the second. That distinction was data with no
// consequence — nothing consulted it before publishing an event. This map is the
// consequence.
//
// DELIBERATELY TWO ENTRIES. An unmapped event type requires no capability, which
// keeps this a statement about the two relationships E8 proves rather than a
// permissions matrix grown to cover everything.
//
//   engineering.specification.approved -> engineering.approve
//       Approving a design for manufacture is an authority act. It is also in
//       VERIFICATION_GATED, so an unverified engineer cannot do it — that gate
//       already existed and had no enforcement path until now.
//
//   knowledge.reviewed -> advisory.offer
//       Reviewing is advisory. `knowledgeEvent` accepts a `specification`, so a
//       review can attach to a drawing without a document subsystem and without
//       touching the specification's approval state.
//
// PRODUCTION IS DELIBERATELY ABSENT. `production.component.produced` is NOT
// mapped. The only candidate capabilities are `job.accept` (which is
// VERIFICATION_GATED) and `job.track` (which means tracking, not recording).
// Mapping production to either would immediately strip the SOLC pilot — role
// `sme`, verification `unverified` — of the ability E6 and E7 proved it has. The
// manufacturing-entitlement question stays open for a later authority pass.
//
// Capability strings must exist in Roles.js CAPABILITIES; the authority suite
// asserts that, so a typo cannot become a silently unenforceable rule.
// ============================================================
export const EVENT_CAPABILITY = Object.freeze({
  [EVENT_TYPES.ENGINEERING.SPEC_APPROVED]: "engineering.approve",
  [EVENT_TYPES.KNOWLEDGE.REVIEWED]:        "advisory.offer",
  //   production.work.directed -> work.direct
  //       Directing another party's work is an authority act. It is NOT granted
  //       to `sme`, so the responsible organisation cannot direct itself into
  //       coordinating, and NOT to `engineer`, so approval authority does not
  //       leak into coordination authority.
  [EVENT_TYPES.PRODUCTION.WORK_DIRECTED]:  "work.direct",
  //   production.work.acknowledged -> work.acknowledge
  //       Answering a directive is an authority act by the DIRECTED party. It is
  //       deliberately NOT `job.accept`: that capability means "accept
  //       manufacturing work", is verification-gated, and gating acknowledgement
  //       on it would stop the unverified SOLC pilot from answering its own
  //       directive. `job.accept` keeps its meaning and its gate, untouched.
  [EVENT_TYPES.PRODUCTION.WORK_ACKNOWLEDGED]: "work.acknowledge",
});

// Capabilities whose authority is LOCATIONAL as well as functional: holding them
// is not enough, the actor's organisation must operate at the hub named on the
// event. Declared here so the scope rule is data-driven rather than a hardcoded
// list of event types in policy.js.
export const SCOPED_CAPABILITIES = Object.freeze(["work.direct", "work.acknowledge"]);

/** True when an event type's capability is locationally scoped. */
export const isScopedType = (type) => SCOPED_CAPABILITIES.includes(capabilityFor(type));

// ---------- REFERENCE FIELDS (E9.5) ----------
// `inResponseTo` holds the eventId of the exact prior fact being answered. It is
// NOT an entity field — it references an EVENT, not a Forge Object — so it is
// declared here rather than in CLASS_FIELDS, and deliberately not folded into
// ENTITY_FIELD_NAMES.
//
// IT IS NOT correlationId. A correlationId groups a conversation: two directives
// about one component share it, so it cannot say WHICH directive is being
// answered. `inResponseTo` names one event. That distinction is the whole reason
// this field exists.
export const REFERENCE_FIELDS = Object.freeze({
  inResponseTo: Object.freeze({
    on: EVENT_TYPES.PRODUCTION.WORK_ACKNOWLEDGED,
    mustReference: Object.freeze([EVENT_TYPES.PRODUCTION.WORK_DIRECTED]),
  }),
});

/** The capability an event type requires, or null when it requires none. */
export const capabilityFor = (type) => EVENT_CAPABILITY[type] ?? null;

// Preserves 0 and false. Also preserves empty arrays and objects, which
// a future assembly-of-components field will need.
function compact(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

// ---------- CORE FACTORY ----------
export function createEvent({ type, at, eventId, correlationId, ...fields }) {
  if (!type || typeof type !== "string") {
    throw new Error("createEvent: `type` is required and must be a string");
  }
  return {
    type,
    at: at ?? Date.now(),
    eventId: eventId ?? makeEventId(),
    // Explicitly null rather than absent: "not correlated" is a fact, and it
    // lets a consumer distinguish it from an older event that predates the field.
    correlationId: correlationId ?? null,
    schema: EVENT_SCHEMA_VERSION,
    ...compact(fields),
  };
}

// `summary` is the canonical human-readable line. `text` carries the same value
// for V1 only: ForgeRuntime.deriveRecommendations and four UI components read
// e.text today. Remove `text` once those consume `summary`.
function narrate(summary) {
  return { summary, text: summary };
}


const STATUS_WORD = Object.freeze({
  [STATUS.RUNNING]: "running", [STATUS.IDLE]: "idle", [STATUS.FAULT]: "in fault",
  [STATUS.MAINTENANCE]: "under maintenance", [STATUS.BLOCKED]: "blocked",
  [STATUS.COMPLETE]: "complete", [STATUS.PENDING]: "pending", [STATUS.UNKNOWN]: "in an unknown state",
});

// ---------- DOMAIN FACTORIES ----------
export function machineEvent({ machine, hub, type = EVENT_TYPES.MACHINE.RUN, status, summary, ...extra }) {
  if (machine == null) throw new Error("machineEvent: `machine` is required");
  const resolvedStatus = status ?? intendedStatus(type) ?? undefined;
  return createEvent({
    type, machine, hub, status: resolvedStatus,
    ...narrate(summary ?? `${machine} ${STATUS_WORD[resolvedStatus] ?? "reported"}`),
    ...extra,
  });
}

export function productionEvent({
  component, specification, machine, hub, person, assembly, program, summary,
  type = EVENT_TYPES.PRODUCTION.COMPONENT_PRODUCED, ...extra
}) {
  if (component == null) throw new Error("productionEvent: `component` is required");
  return createEvent({
    type, component, specification, machine, hub, person, assembly, program,
    ...narrate(summary ?? `${component} produced`),
    ...extra,
  });
}

export function inspectionEvent({
  component, specification, machine, person, hub, result, type, summary, ...extra
}) {
  if (component == null) throw new Error("inspectionEvent: `component` is required");
  if (result == null) throw new Error("inspectionEvent: `result` is required");
  // Canonical values only — no synonym guessing.
  const resolved =
    type ??
    (result === INSPECTION_RESULT.FAIL
      ? EVENT_TYPES.INSPECTION.FAILED
      : result === INSPECTION_RESULT.PASS
        ? EVENT_TYPES.INSPECTION.PASSED
        : EVENT_TYPES.INSPECTION.RECORDED);
  return createEvent({
    type: resolved, component, specification, machine, person, hub, result,
    ...narrate(summary ?? `${component} inspection ${result}`),
    ...extra,
  });
}

// hub is NOT defaulted (closes C20). Hardcoding 'engineering' invented a
// hub that does not exist in this deployment, where hubs are geographic.
export function engineeringEvent({
  specification, program, person, knowledge, hub, summary,
  type = EVENT_TYPES.ENGINEERING.SPEC_RELEASED, ...extra
}) {
  if (specification == null) throw new Error("engineeringEvent: `specification` is required");
  return createEvent({
    type, specification, program, person, knowledge, hub,
    ...narrate(summary ?? `${specification} ${type.split(".").pop()}`),
    ...extra,
  });
}

export function personEvent({ person, competency, hub, institution, summary,
  type = EVENT_TYPES.PERSON.ARRIVED, ...extra }) {
  if (person == null) throw new Error("personEvent: `person` is required");
  return createEvent({
    type, person, competency, hub, institution,
    ...narrate(summary ?? `${person} ${type.split(".").slice(1).join(" ")}`),
    ...extra,
  });
}

export function knowledgeEvent({ knowledge, language, person, hub, specification, summary,
  type = EVENT_TYPES.KNOWLEDGE.PUBLISHED, ...extra }) {
  if (knowledge == null) throw new Error("knowledgeEvent: `knowledge` is required");
  return createEvent({
    type, knowledge, language, person, hub, specification,
    ...narrate(summary ?? `${knowledge}${language ? ` (${language})` : ""} ${type.split(".").pop()}`),
    ...extra,
  });
}

// hub may legitimately be null when a studio is not in the topology.
export function navigationEvent({ studio, hub = null, from = null, person, ...extra }) {
  if (studio == null) throw new Error("navigationEvent: `studio` is required");
  return createEvent({ type: EVENT_TYPES.NAVIGATION.ENTER, studio, hub, from, person, ...extra });
}

export function missionEvent({ mission, program, person, hub, summary,
  type = EVENT_TYPES.MISSION.CREATED, ...extra }) {
  if (mission == null) throw new Error("missionEvent: `mission` is required");
  return createEvent({
    type, mission, program, person, hub,
    ...narrate(summary ?? `${mission} ${type.split(".").pop()}`),
    ...extra,
  });
}

export function systemEvent({ type = EVENT_TYPES.SYSTEM.BOOTED, ...extra }) {
  return createEvent({ type, ...extra });
}

// ---------- VALIDATION ----------
export function validateEvent(event) {
  const issues = [];
  if (!event || typeof event !== "object") {
    return { valid: false, issues: [{ severity: "error", message: "event is not an object" }] };
  }
  const { type } = event;
  if (!type || typeof type !== "string") {
    issues.push({ severity: "error", message: "event has no `type`; it cannot be normalised" });
  }
  if (event.at != null && !Number.isFinite(event.at)) {
    issues.push({ severity: "error", message: "`at` must be a finite epoch value" });
  }

  const hasEntity = Object.keys(event).some(
    (k) => ENTITY_FIELD_NAMES.has(k) && event[k] != null && event[k] !== ""
  );
  const isMeta = typeof type === "string" && META_TYPE_PREFIXES.some((p) => type.startsWith(p));
  if (!hasEntity && !isMeta) {
    issues.push({
      severity: "warning",
      message: "event references no known entity and is not a meta event; it will not attach to a Forge Object",
    });
  }

  // Domain records must be complete. This is the C21 fix.
  if (typeof type === "string") {
    for (const [prefix, required] of Object.entries(REQUIRED_FIELDS_BY_TYPE_PREFIX)) {
      if (!type.startsWith(prefix)) continue;
      for (const field of required) {
        if (event[field] == null || event[field] === "") {
          issues.push({ severity: "error", message: `event type "${type}" requires field "${field}"` });
        }
      }
    }
  }

  // MISSION CORRELATION — the forbidden half of the policy.
  //
  // REQUIRED is already enforced above by REQUIRED_FIELDS_BY_TYPE_PREFIX, so
  // this adds only the case that had no enforcement: a meta event claiming to
  // belong to a mission. OPTIONAL and UNKNOWN are deliberately silent — both
  // accept the field's presence and its absence, and UNKNOWN must never harden
  // into REQUIRED just because some producer happens to supply one.
  if (event.mission != null && event.mission !== "" &&
      missionPolicyFor(type) === MISSION_POLICY_LEVEL.FORBIDDEN) {
    issues.push({
      severity: "error",
      message: `event type "${type}" is MISSION_FORBIDDEN and must not carry a mission`,
    });
  }

  // TWO-PARTY TARGET (E9.3). A directive must name who was directed, and the
  // target's object class must be declared rather than guessed from the value.
  if (type === EVENT_TYPES.PRODUCTION.WORK_DIRECTED) {
    if (event.directedTo == null || event.directedTo === "") {
      issues.push({ severity: "error",
        message: `"${type}" requires "directedTo" — a directive with no directed party names nobody` });
    } else if (declaredClassOf(event) === null) {
      issues.push({ severity: "error",
        message: `"${type}" requires "directedToClass" to be one of ${DIRECTED_TO_CLASSES.join(", ")}; ` +
                 `received ${JSON.stringify(event.directedToClass)}` });
    }
  }
  // ACKNOWLEDGEMENT (E9.5). It must answer exactly one prior directive and must
  // declare an outcome. Existence of the referenced directive cannot be checked
  // here — validateEvent sees one event, not the log — so that is enforced at the
  // policy gate by requireDirectiveTarget, before publication.
  if (type === EVENT_TYPES.PRODUCTION.WORK_ACKNOWLEDGED) {
    if (event.inResponseTo == null || event.inResponseTo === "") {
      issues.push({ severity: "error",
        message: `"${type}" requires "inResponseTo" — an acknowledgement that names no directive answers nothing` });
    }
    if (!ACKNOWLEDGEMENT_VALUES.has(event.outcome)) {
      issues.push({ severity: "error",
        message: `"${type}" requires "outcome" to be one of ${[...ACKNOWLEDGEMENT_VALUES].join(", ")}; ` +
                 `received ${JSON.stringify(event.outcome)}` });
    }
  }
  // A reply reference outside an acknowledgement is meaningless.
  if (event.inResponseTo != null && event.inResponseTo !== "" &&
      type !== EVENT_TYPES.PRODUCTION.WORK_ACKNOWLEDGED) {
    issues.push({ severity: "error",
      message: `"inResponseTo" is only meaningful on "${EVENT_TYPES.PRODUCTION.WORK_ACKNOWLEDGED}", not on "${type}"` });
  }

  // A target outside a directive is meaningless, and a declared class with no
  // target is a malformed record. Both are refused wherever they appear.
  if (event.directedTo != null && event.directedTo !== "" &&
      type !== EVENT_TYPES.PRODUCTION.WORK_DIRECTED) {
    issues.push({ severity: "error",
      message: `"directedTo" is only meaningful on "${EVENT_TYPES.PRODUCTION.WORK_DIRECTED}", not on "${type}"` });
  }
  if (event.directedToClass != null && (event.directedTo == null || event.directedTo === "")) {
    issues.push({ severity: "error",
      message: `"directedToClass" was declared without a "directedTo" target` });
  }

  if (event.status != null && !STATUS_VALUES.has(event.status)) {
    issues.push({ severity: "warning", message: `status "${event.status}" is not canonical; it will be stored verbatim` });
  }
  if (event.result != null && !RESULT_VALUES.has(event.result)) {
    issues.push({ severity: "warning", message: `result "${event.result}" is not a canonical inspection result` });
  }
  const expected = intendedStatus(type);
  if (expected && event.status != null && event.status !== expected) {
    issues.push({
      severity: "warning",
      message: `type "${type}" implies status "${expected}" but carries "${event.status}"`,
    });
  }

  return { valid: issues.every((i) => i.severity !== "error"), issues };
}

/** Validate and throw. For emitters that must fail loudly at the producer. */
export function assertEvent(event) {
  const { valid, issues } = validateEvent(event);
  if (!valid) {
    throw new Error(
      `Invalid Forge event: ${issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`
    );
  }
  return event;
}

const Events = Object.freeze({
  SCHEMA_VERSION: EVENT_SCHEMA_VERSION,
  makeEventId,
  STATUS,
  INSPECTION_RESULT,
  TYPES: EVENT_TYPES,
  LEGACY: LEGACY_EVENT,
  MISSION_POLICY,
  MISSION_POLICY_LEVEL,
  missionPolicyFor,
  CLASS_FIELDS,
  PRIMARY_FIELD,
  FIELD_TO_CLASS,
  create: createEvent,
  machine: machineEvent,
  production: productionEvent,
  inspection: inspectionEvent,
  engineering: engineeringEvent,
  person: personEvent,
  knowledge: knowledgeEvent,
  navigation: navigationEvent,
  mission: missionEvent,
  system: systemEvent,
  validate: validateEvent,
  assert: assertEvent,
  classForField,
  isEntityField,
  intendedStatus,
  toLegacyType,
  assertVocabulary,
});

export default Events;
