// ============================================================
// FORGE ELECTION — CAMPAIGN STUDIO TEMPLATES  (Alpha 1.0)
//
// Structured, hard-coded template data — REUSABLE ACROSS CAMPAIGNS (not
// campaign-specific, so not database-stored; a campaign's own identity is
// applied at asset-creation time, see design/assets.js). Each template
// declares dimensions/background/typography/slots/exportConfig so the
// design engine renders any of them the same way, rather than one hard-
// coded component per asset type. No AI image-generation engine is wired —
// slots are filled with plain text/colour by the campaign; nothing here
// claims otherwise.
// ============================================================

export const ASSET_TYPE = Object.freeze({
  SOCIAL_POST: "social_post",
  SOCIAL_SQUARE: "social_square",
  SOCIAL_LANDSCAPE: "social_landscape",
  ANNOUNCEMENT: "announcement",
  EVENT_INVITATION: "event_invitation",
  EMAIL: "email",
  BRIEFING: "briefing",
  PRINTABLE_NOTICE: "printable_notice",
  // ALPHA 1.1 — practical templates named directly by both directives'
  // Campaign Studio sections, on top of the 8 generic Alpha 1.0 shapes
  // above. Same rendering engine, same "no AI image generation" honesty —
  // these are just more specific slot layouts for common campaign needs.
  RALLY_ANNOUNCEMENT: "rally_announcement",
  VOLUNTEER_RECRUITMENT: "volunteer_recruitment",
  WARD_MEETING_ANNOUNCEMENT: "ward_meeting_announcement",
  CANDIDATE_INTRODUCTION: "candidate_introduction",
  POLICY_MESSAGE: "policy_message",
  ELECTION_REMINDER: "election_reminder",
  THANK_YOU_MESSAGE: "thank_you_message",
  MESSAGING_GRAPHIC: "messaging_graphic",
  VOTER_EDUCATION: "voter_education",
  POLLING_DAY_REMINDER: "polling_day_reminder",
  INCIDENT_COMMUNICATION: "incident_communication",
  // ALPHA 1.2
  PUBLIC_INFORMATION_NOTICE: "public_information_notice",
  TURNOUT_INFORMATION: "turnout_information",
});

export const TEMPLATES = Object.freeze({
  [ASSET_TYPE.SOCIAL_POST]: Object.freeze({
    id: ASSET_TYPE.SOCIAL_POST, label: "Social Media Post",
    dimensions: { width: 1080, height: 1350 },
    background: { kind: "solid", token: "primary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Photo (optional)" }],
    textSlots: [{ id: "headline", label: "Headline", maxLength: 90 }, { id: "body", label: "Body", maxLength: 240 }],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1350 },
  }),
  [ASSET_TYPE.SOCIAL_SQUARE]: Object.freeze({
    id: ASSET_TYPE.SOCIAL_SQUARE, label: "Square Social Graphic",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "primary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Photo (optional)" }],
    textSlots: [{ id: "headline", label: "Headline", maxLength: 80 }],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
  [ASSET_TYPE.SOCIAL_LANDSCAPE]: Object.freeze({
    id: ASSET_TYPE.SOCIAL_LANDSCAPE, label: "Landscape Social Graphic",
    dimensions: { width: 1200, height: 630 },
    background: { kind: "solid", token: "primary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Photo (optional)" }],
    textSlots: [{ id: "headline", label: "Headline", maxLength: 100 }, { id: "body", label: "Body", maxLength: 180 }],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1200, height: 630 },
  }),
  [ASSET_TYPE.ANNOUNCEMENT]: Object.freeze({
    id: ASSET_TYPE.ANNOUNCEMENT, label: "Announcement",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "accent" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [{ id: "headline", label: "Headline", maxLength: 90 }, { id: "body", label: "Details", maxLength: 320 }],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
  [ASSET_TYPE.EVENT_INVITATION]: Object.freeze({
    id: ASSET_TYPE.EVENT_INVITATION, label: "Event Invitation",
    dimensions: { width: 1080, height: 1350 },
    background: { kind: "solid", token: "secondary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Photo (optional)" }],
    textSlots: [
      { id: "headline", label: "Event name", maxLength: 90 },
      { id: "when", label: "Date & time", maxLength: 80 },
      { id: "where", label: "Location", maxLength: 120 },
      { id: "body", label: "Details", maxLength: 240 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1350 },
  }),
  [ASSET_TYPE.EMAIL]: Object.freeze({
    id: ASSET_TYPE.EMAIL, label: "Email Communication",
    dimensions: { width: 600, height: null },
    background: { kind: "solid", token: "surface" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "banner", label: "Banner image (optional)" }],
    textSlots: [{ id: "subject", label: "Subject line", maxLength: 100 }, { id: "body", label: "Email body", maxLength: 4000 }],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "text", width: 600, height: null },
  }),
  [ASSET_TYPE.BRIEFING]: Object.freeze({
    id: ASSET_TYPE.BRIEFING, label: "Volunteer / Agent Briefing",
    dimensions: { width: 794, height: 1123 },
    background: { kind: "solid", token: "surface" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [{ id: "headline", label: "Briefing title", maxLength: 100 }, { id: "body", label: "Briefing content", maxLength: 6000 }],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "pdf-print", width: 794, height: 1123 },
  }),
  [ASSET_TYPE.PRINTABLE_NOTICE]: Object.freeze({
    id: ASSET_TYPE.PRINTABLE_NOTICE, label: "Printable Notice",
    dimensions: { width: 794, height: 1123 },
    background: { kind: "solid", token: "surface" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [{ id: "headline", label: "Notice title", maxLength: 100 }, { id: "body", label: "Notice text", maxLength: 2000 }],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "pdf-print", width: 794, height: 1123 },
  }),
  [ASSET_TYPE.RALLY_ANNOUNCEMENT]: Object.freeze({
    id: ASSET_TYPE.RALLY_ANNOUNCEMENT, label: "Rally Announcement",
    dimensions: { width: 1080, height: 1350 },
    background: { kind: "solid", token: "accent" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Photo (optional)" }],
    textSlots: [
      { id: "headline", label: "Rally name", maxLength: 90 },
      { id: "when", label: "Date & time", maxLength: 80 },
      { id: "where", label: "Location", maxLength: 120 },
      { id: "body", label: "Details", maxLength: 240 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1350 },
  }),
  [ASSET_TYPE.VOLUNTEER_RECRUITMENT]: Object.freeze({
    id: ASSET_TYPE.VOLUNTEER_RECRUITMENT, label: "Volunteer Recruitment",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "primary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Photo (optional)" }],
    textSlots: [
      { id: "headline", label: "Headline", maxLength: 80 },
      { id: "body", label: "Why join", maxLength: 240 },
      { id: "callToAction", label: "How to sign up", maxLength: 120 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
  [ASSET_TYPE.WARD_MEETING_ANNOUNCEMENT]: Object.freeze({
    id: ASSET_TYPE.WARD_MEETING_ANNOUNCEMENT, label: "Ward Meeting Announcement",
    dimensions: { width: 1080, height: 1350 },
    background: { kind: "solid", token: "secondary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [
      { id: "ward", label: "Ward", maxLength: 60 },
      { id: "when", label: "Date & time", maxLength: 80 },
      { id: "where", label: "Meeting point", maxLength: 120 },
      { id: "body", label: "Agenda", maxLength: 240 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1350 },
  }),
  [ASSET_TYPE.CANDIDATE_INTRODUCTION]: Object.freeze({
    id: ASSET_TYPE.CANDIDATE_INTRODUCTION, label: "Candidate Introduction",
    dimensions: { width: 1080, height: 1350 },
    background: { kind: "solid", token: "primary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Candidate photo" }],
    textSlots: [
      { id: "headline", label: "Candidate name & office", maxLength: 100 },
      { id: "body", label: "Introduction", maxLength: 400 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1350 },
  }),
  [ASSET_TYPE.POLICY_MESSAGE]: Object.freeze({
    id: ASSET_TYPE.POLICY_MESSAGE, label: "Policy Message",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "surface" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [
      { id: "headline", label: "Policy area", maxLength: 90 },
      { id: "body", label: "Position", maxLength: 500 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
  [ASSET_TYPE.ELECTION_REMINDER]: Object.freeze({
    id: ASSET_TYPE.ELECTION_REMINDER, label: "Election Reminder",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "accent" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [
      { id: "headline", label: "Headline", maxLength: 80 },
      { id: "when", label: "Election date", maxLength: 60 },
      { id: "body", label: "What voters need to know", maxLength: 240 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
  [ASSET_TYPE.THANK_YOU_MESSAGE]: Object.freeze({
    id: ASSET_TYPE.THANK_YOU_MESSAGE, label: "Thank-You Message",
    dimensions: { width: 1080, height: 1350 },
    background: { kind: "solid", token: "secondary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Photo (optional)" }],
    textSlots: [
      { id: "headline", label: "Headline", maxLength: 80 },
      { id: "body", label: "Message", maxLength: 300 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1350 },
  }),
  [ASSET_TYPE.MESSAGING_GRAPHIC]: Object.freeze({
    // Rendered exactly like any other image template — sized for sharing
    // through a chat channel. Distribution through a real chat-app channel
    // is documented, not implemented (see docs/electioncanon/ for the
    // channel contract doc and the non-imported stub under channels/) —
    // this label deliberately says nothing about a specific channel, since
    // no channel is actually wired.
    id: ASSET_TYPE.MESSAGING_GRAPHIC, label: "Messaging Graphic",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "primary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [{ id: "photo", label: "Photo (optional)" }],
    textSlots: [{ id: "headline", label: "Headline", maxLength: 70 }, { id: "body", label: "Body", maxLength: 200 }],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
  [ASSET_TYPE.VOTER_EDUCATION]: Object.freeze({
    id: ASSET_TYPE.VOTER_EDUCATION, label: "Voter Education",
    dimensions: { width: 794, height: 1123 },
    background: { kind: "solid", token: "surface" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [
      { id: "headline", label: "Topic", maxLength: 100 },
      { id: "body", label: "Explanation / steps", maxLength: 3000 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "pdf-print", width: 794, height: 1123 },
  }),
  [ASSET_TYPE.POLLING_DAY_REMINDER]: Object.freeze({
    id: ASSET_TYPE.POLLING_DAY_REMINDER, label: "Polling-Day Reminder",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "accent" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [
      { id: "headline", label: "Headline", maxLength: 80 },
      { id: "when", label: "Polling opens/closes", maxLength: 60 },
      { id: "body", label: "What to bring / where to go", maxLength: 240 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
  [ASSET_TYPE.INCIDENT_COMMUNICATION]: Object.freeze({
    id: ASSET_TYPE.INCIDENT_COMMUNICATION, label: "Incident Communication",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "secondary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [
      { id: "headline", label: "Headline", maxLength: 90 },
      { id: "body", label: "What agents/observers/volunteers need to know", maxLength: 400 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
  [ASSET_TYPE.PUBLIC_INFORMATION_NOTICE]: Object.freeze({
    id: ASSET_TYPE.PUBLIC_INFORMATION_NOTICE, label: "Public Information Notice",
    dimensions: { width: 794, height: 1123 },
    background: { kind: "solid", token: "surface" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [
      { id: "headline", label: "Notice title", maxLength: 100 },
      { id: "body", label: "Factual public information", maxLength: 2000 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "pdf-print", width: 794, height: 1123 },
  }),
  [ASSET_TYPE.TURNOUT_INFORMATION]: Object.freeze({
    id: ASSET_TYPE.TURNOUT_INFORMATION, label: "Turnout Information",
    dimensions: { width: 1080, height: 1080 },
    background: { kind: "solid", token: "primary" },
    typography: { heading: "display", body: "ui" },
    imageSlots: [],
    textSlots: [
      { id: "headline", label: "Headline", maxLength: 80 },
      { id: "body", label: "Where and how to vote", maxLength: 240 },
    ],
    logoSlot: { id: "logo", label: "Campaign logo" },
    exportConfig: { format: "png", width: 1080, height: 1080 },
  }),
});

export const TEMPLATE_LIST = Object.freeze(Object.values(TEMPLATES));

export default { ASSET_TYPE, TEMPLATES, TEMPLATE_LIST };
