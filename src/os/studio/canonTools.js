// ============================================================
// FORGE STUDIO — CANON TOOLS  (Phase 0)
//
// The read-only surface Forge AI will eventually be given. It answers narrowly
// defined questions about the Canon and can do nothing else.
//
// WHY IT IS READ-ONLY BY CONSTRUCTION, NOT BY CONVENTION. Every tool reads the
// result of `project()`, which is returned deep-frozen. A write through this
// surface throws TypeError under strict mode (every ES module is strict) — the
// guarantee is enforced by the kernel, not promised by this file. There is no
// shadow copy, no second representation, and no re-implementation of the fold.
//
// The AI therefore CANNOT publish an event, change a component state, transfer
// responsibility, add a contribution, resolve a directive, or move a
// specification or mission — not because it is asked not to, but because
// nothing here can write and the data it reads refuses mutation.
//
// ABSENCE IS AN ANSWER. A missing object returns an explicit not-found result.
// It must never return a plausible-looking empty object, because the whole point
// of the grounding layer above is that "we have no record of that" and "that is
// false" are different statements and both are better than invention.
// ============================================================

/** Every tool returns one of these two shapes. Never a bare value, never null. */
export const found = (kind, id, value) => Object.freeze({ found: true, kind, id, value });
export const notFound = (kind, id, reason) =>
  Object.freeze({ found: false, kind, id, value: null, reason });

const NOT_RECORDED = "not recorded in the Canon";

/**
 * Build the tool surface over one projection.
 *
 * @param view the result of project(log, missions) — deep-frozen
 * @param log  the event stream, for event-level lookups only
 */
export function createCanonTools(view, log = []) {
  const V = view ?? {};

  const getComponent = (id) => {
    const c = V.components?.[id];
    return c ? found("component", id, c) : notFound("component", id, NOT_RECORDED);
  };

  const getSpecification = (id) => {
    const s = V.specifications?.[id];
    return s ? found("specification", id, s) : notFound("specification", id, NOT_RECORDED);
  };

  const getMission = (id) => {
    const m = (V.missions ?? []).find((x) => x.id === id);
    return m ? found("mission", id, m) : notFound("mission", id, NOT_RECORDED);
  };

  /**
   * An organisation is not a folded object — the Canon knows it only through
   * what it is responsible for, what it contributed to and what it directed.
   * So this reports RELATIONSHIPS, and says so, rather than pretending to
   * return an organisation record that the fold does not hold.
   */
  const getOrganisation = (id) => {
    const comps = Object.values(V.components ?? {});
    const responsibleFor = comps.filter((c) => c.organisation === id).map((c) => c.id);
    const contributedTo = comps
      .filter((c) => (c.contributions ?? []).some((x) => x.organisation === id))
      .map((c) => c.id);
    const directed = comps
      .filter((c) => (c.directives ?? []).some((x) => x.organisation === id))
      .map((c) => c.id);
    const directedTo = comps
      .filter((c) => (c.directives ?? []).some((x) => x.directedTo === id))
      .map((c) => c.id);

    if (!responsibleFor.length && !contributedTo.length && !directed.length && !directedTo.length) {
      return notFound("organisation", id,
        "no responsibility, contribution or directive in the Canon names this organisation");
    }
    return found("organisation", id,
      Object.freeze({ id, responsibleFor, contributedTo, directed, directedTo }));
  };

  /** Transitions only. Performance, not participation and not coordination. */
  const getEventHistory = (componentId) => {
    const c = V.components?.[componentId];
    return c ? found("history", componentId, c.history ?? [])
             : notFound("history", componentId, NOT_RECORDED);
  };

  const getContributions = (componentId) => {
    const c = V.components?.[componentId];
    return c ? found("contributions", componentId, c.contributions ?? [])
             : notFound("contributions", componentId, NOT_RECORDED);
  };

  const getDirectives = (componentId) => {
    const c = V.components?.[componentId];
    return c ? found("directives", componentId, c.directives ?? [])
             : notFound("directives", componentId, NOT_RECORDED);
  };

  /** One raw event by id, for grounding an event-sourced claim. */
  const getEvent = (eventId) => {
    const e = log.find((x) => x?.eventId === eventId);
    return e ? found("event", eventId, e) : notFound("event", eventId, "not present in this event stream");
  };

  /**
   * Deterministic search. No embeddings, no vector store, no network — a
   * case-insensitive scan of the identifiers and text the Canon already holds.
   * Ranked only by where the match occurred, so the ordering is reproducible.
   */
  const searchForge = (query, { limit = 20 } = {}) => {
    const q = String(query ?? "").trim().toLowerCase();
    if (!q) return Object.freeze({ query: "", results: [] });
    const hits = [];
    const add = (kind, id, field, text, rank) =>
      hits.push({ kind, id, field, text: String(text), rank });

    for (const c of Object.values(V.components ?? {})) {
      if (c.id?.toLowerCase().includes(q)) add("component", c.id, "id", c.id, 0);
      if (c.specification?.toLowerCase().includes(q)) add("component", c.id, "specification", c.specification, 1);
      if (c.mission?.toLowerCase().includes(q)) add("component", c.id, "mission", c.mission, 1);
      if (c.organisation?.toLowerCase().includes(q)) add("component", c.id, "organisation", c.organisation, 1);
      if (c.state?.toLowerCase().includes(q)) add("component", c.id, "state", c.state, 2);
      for (const x of c.contributions ?? []) {
        if (x.person?.toLowerCase().includes(q)) add("contribution", c.id, "person", x.person, 2);
        if (x.organisation?.toLowerCase().includes(q)) add("contribution", c.id, "organisation", x.organisation, 2);
      }
      for (const d of c.directives ?? []) {
        if (d.person?.toLowerCase().includes(q)) add("directive", c.id, "person", d.person, 2);
        if (d.directedTo?.toLowerCase().includes(q)) add("directive", c.id, "directedTo", d.directedTo, 2);
        if (d.instruction?.toLowerCase().includes(q)) add("directive", c.id, "instruction", d.instruction, 3);
      }
      for (const h of c.history ?? []) {
        if (h.by?.toLowerCase().includes(q)) add("performance", c.id, "by", h.by, 2);
      }
    }
    for (const s of Object.values(V.specifications ?? {})) {
      if (s.id?.toLowerCase().includes(q)) add("specification", s.id, "id", s.id, 0);
      if (s.author?.toLowerCase().includes(q)) add("specification", s.id, "author", s.author, 2);
      if (s.state?.toLowerCase().includes(q)) add("specification", s.id, "state", s.state, 2);
    }
    for (const m of V.missions ?? []) {
      if (m.id?.toLowerCase().includes(q)) add("mission", m.id, "id", m.id, 0);
      if (m.title?.toLowerCase().includes(q)) add("mission", m.id, "title", m.title, 1);
    }
    for (const f of V.feed ?? []) {
      if (f.detail?.toLowerCase().includes(q)) add("feed", f.subject ?? f.eventId, "detail", f.detail, 3);
    }

    hits.sort((a, b) => a.rank - b.rank || String(a.id).localeCompare(String(b.id)));
    return Object.freeze({ query, results: Object.freeze(hits.slice(0, limit)) });
  };

  // Frozen so a caller cannot swap a tool for a writer.
  return Object.freeze({
    getComponent, getSpecification, getMission, getOrganisation,
    getEventHistory, getContributions, getDirectives, getEvent, searchForge,
  });
}

/** The tool names Forge AI may be given. Nothing here mutates. */
export const CANON_TOOL_NAMES = Object.freeze([
  "getComponent", "getSpecification", "getMission", "getOrganisation",
  "getEventHistory", "getContributions", "getDirectives", "getEvent", "searchForge",
]);

export default { createCanonTools, found, notFound, CANON_TOOL_NAMES };
