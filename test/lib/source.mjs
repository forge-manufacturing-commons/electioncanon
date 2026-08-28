// ============================================================
// FORGE OS — CANONICAL CODE-ONLY SOURCE EXTRACTION
//
// One mechanism, shared by every audit. It exists because three separate
// audits were each satisfiable by prose, and the failures were only found by
// accident:
//
//   1. The InspectionHangar dead-code check matched the very comment that
//      documented the removal ("CTRL_MACHINE_COLOR ... removed").
//   2. DemoStudio's comment "buildRuntime is NOT interchangeable with
//      project()" satisfied /project\(/ and would have made a FALSE claim of
//      projection:"manufacturing" pass the contract audit.
//   3. ArrivalDockRoom's comment explaining why it declares roomShell:false
//      counted it as a RoomShell adopter, inflating the adoption metric 9 -> 10.
//
// Documentation must never be able to earn a capability. An audit that reads
// comments measures intent; only executable text is evidence. R7.
//
// Why a scanner and not a regex: a regex that strips `//` to end-of-line also
// destroys "https://..." inside string literals, which would make the audit
// wrong in the opposite direction. This tracks string and template state so
// quoted content survives intact.
// ============================================================

/**
 * Remove everything that cannot execute, preserving line structure so that
 * reported line numbers still line up with the original file.
 *
 * @param {string} src
 * @param {{ css?: boolean }} [opts]  css:true disables `//` line comments,
 *        which are not comments in CSS and may appear in url() values.
 * @returns {string} code-only source
 */
export function stripComments(src, { css = false } = {}) {
  let out = "";
  let state = "code"; // code | line | block | sq | dq | tpl
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];

    if (state === "code") {
      if (!css && c === "/" && d === "/") { state = "line"; i++; continue; }
      if (c === "/" && d === "*") { state = "block"; i++; continue; }
      if (c === "'")  { state = "sq";  out += c; continue; }
      if (c === '"')  { state = "dq";  out += c; continue; }
      if (c === "`")  { state = "tpl"; out += c; continue; }
      out += c;
      continue;
    }

    if (state === "line") {
      if (c === "\n") { state = "code"; out += c; }
      continue;
    }

    if (state === "block") {
      if (c === "*" && d === "/") { state = "code"; i++; }
      else if (c === "\n") { out += c; }   // keep line numbers stable
      continue;
    }

    // inside a string or template literal — preserve verbatim
    if (c === "\\") { out += c; if (d !== undefined) { out += d; i++; } continue; }
    if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) {
      state = "code";
    }
    out += c;
  }
  return out;
}

/** True when the path should be treated as CSS for comment purposes. */
export const isCss = (path) => /\.css$/i.test(path);

/**
 * Attach a code-only view to each { path, text } record. Audits should read
 * `.code` for every evidence check and `.text` only when the raw file itself
 * is the subject (for example, counting documentation).
 */
export const withCode = (files) =>
  files.map((f) => ({ ...f, code: stripComments(f.text, { css: isCss(f.path) }) }));

// ---------- ADVERSARIAL SELF-TEST ----------
// The helper is the foundation every other audit now rests on, so it has to be
// able to fail. Returns [] when sound, or a list of case names that misbehaved.
export function selfTestStripComments() {
  const wrong = [];
  const check = (name, input, mustContain, mustNotContain, opts) => {
    const got = stripComments(input, opts);
    for (const s of mustNotContain) if (got.includes(s)) wrong.push(`${name}: leaked ${JSON.stringify(s)}`);
    for (const s of mustContain)    if (!got.includes(s)) wrong.push(`${name}: lost ${JSON.stringify(s)}`);
  };

  // ---- prose must NOT survive ----
  check("identifier only in a line comment",
    "// we removed CTRL_MACHINE_COLOR here\nconst live = 1;", ["const live"], ["CTRL_MACHINE_COLOR"]);
  check("identifier only in a block comment",
    "/* buildRuntime is not project() */\nconst live = 1;", ["const live"], ["project("]);
  check("hex colour only in a comment",
    "// brand used to be #2ecc71\ncolor: var(--forge-teal);", ["--forge-teal"], ["#2ecc71"]);
  check("fake export only in a comment",
    "// export function GhostPrimitive() {}\nexport function Real() {}", ["export function Real"], ["GhostPrimitive"]);
  check("fake RoomShell reference only in a comment",
    "// wrapping in RoomShell would add a second header\nroomShell: false,", ["roomShell: false"], ["RoomShell"]);
  check("prose inside a JSX comment",
    "{/* uses OperationsFeed elsewhere */}\n<Panel />", ["<Panel />"], ["OperationsFeed"]);
  check("trailing comment after real code",
    "const a = 1; // mentions RoomShell\n", ["const a = 1;"], ["RoomShell"]);

  // ---- code must survive (guards against over-stripping) ----
  check("protocol slashes inside a string are not a comment",
    'const u = "https://example.com/a"; const k = 2;', ['https://example.com/a', "const k = 2"], []);
  check("comment markers inside a string literal survive",
    'const s = "/* not a comment */"; const k = 3;', ["/* not a comment */", "const k = 3"], []);
  check("template literal content survives",
    "const t = `border: 1px solid ${T.teal}`;", ["border: 1px solid"], []);
  check("code after a block comment survives",
    "/* header */ export function Kept() {}", ["export function Kept"], ["header"]);
  check("escaped quote does not end the string early",
    'const s = "a\\"// still string"; const k = 4;', ["still string", "const k = 4"], []);
  check("CSS keeps url() double slashes",
    "a{ background:url(https://x/y.png); }", ["https://x/y.png"], [], { css: true });
  check("CSS block comment still stripped",
    "/* old: #2ecc71 */ a{ color:#0A7F73; }", ["#0A7F73"], ["#2ecc71"], { css: true });

  return wrong;
}
