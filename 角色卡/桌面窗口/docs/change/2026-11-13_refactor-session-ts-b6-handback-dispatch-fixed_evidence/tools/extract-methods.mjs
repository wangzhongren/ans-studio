// B6 取证工具：从 b5901ac 的 session.ts 提取 26 个方法的行范围/原文/refs，输出 methods-source.json。
// 复跑一次后再跑 moved-methods-sha.mjs 即可重建哈希证据（工具自身不写仓库其他位置）。
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(HERE, "../../../../../.."));
const text = execSync("git show HEAD:app/desktop/session.ts", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lines = text.split(/\r?\n/);
const NAMES = [
  "displayHandback", "handbackFlowId", "isTaskHandbackShape", "handleHandback", "commitHandback",
  "routeDispatch", "chainDispatchFacts", "captureChiefDispatchSource", "resumeChiefController", "routeStarDispatch",
  "inspectFixedHandbackChild", "routeFixedPathDispatch", "completeTeamPlanFixedForHandle", "closeCreatedTaskFixedForSession",
  "verifyFixedReviewCloseBasis", "prepareFixedAppointmentCardRequest", "recordFixedCardWorkflowResolution",
  "ensurePathBStartForDispatch", "checkPathBWriteSetForDispatch", "presentMergeMainCard", "runFixedReleaseMerge",
  "settleMergeMainCard", "autoPresentFixedReleaseMerge", "noteFixedReleaseAutoTrigger", "fixedPanelState", "dispatchAdvisorySummary",
];
const declRes = NAMES.map((name) => new RegExp(`^  (?:private |public |protected )?(?:async )?${name}[<(]`));
const startLineByName = new Map();
for (let i = 0; i < lines.length; i += 1) for (let k = 0; k < NAMES.length; k += 1)
  if (declRes[k].test(lines[i]) && !startLineByName.has(NAMES[k])) startLineByName.set(NAMES[k], i + 1);
function findBlockEnd(src, offset) {
  let depth = 0, state = "code", started = false;
  for (let i = offset; i < src.length; i += 1) {
    const ch = src[i], next = src[i + 1];
    if (state === "line") { if (ch === "\n") state = "code"; continue; }
    if (state === "block") { if (ch === "*" && next === "/") { state = "code"; i += 1; } continue; }
    if (state === "single") { if (ch === "\\") i += 1; else if (ch === "'") state = "code"; continue; }
    if (state === "double") { if (ch === "\\") i += 1; else if (ch === '"') state = "code"; continue; }
    if (state === "template") { if (ch === "\\") i += 1; else if (ch === "`") state = "code"; continue; }
    if (ch === "/" && next === "/") { state = "line"; i += 1; continue; }
    if (ch === "/" && next === "*") { state = "block"; i += 1; continue; }
    if (ch === "'") { state = "single"; continue; }
    if (ch === '"') { state = "double"; continue; }
    if (ch === "`") { state = "template"; continue; }
    if (ch === "{") { depth += 1; started = true; continue; }
    if (ch === "}" && --depth === 0 && started) return i;
  }
  throw new Error("unbalanced block");
}
const lineOf = (offset) => text.slice(0, offset).split("\n").length;
const lineOffsets = []; { let offset = 0; for (const line of lines) { lineOffsets.push(offset); offset += line.length + 1; } }
const methods = [];
for (const name of NAMES) {
  const declStartLine = startLineByName.get(name);
  if (!declStartLine) throw new Error(`method not found: ${name}`);
  let bodyOpenLine = -1, endLine = -1;
  for (let i = declStartLine - 1; i < Math.min(lines.length, declStartLine + 60); i += 1) {
    const trimmed = lines[i].trimEnd();
    if (!trimmed.endsWith("{")) continue;
    const braceIndex = lineOffsets[i] + trimmed.lastIndexOf("{");
    const candidateEndLine = lineOf(findBlockEnd(text, braceIndex));
    if (lines[candidateEndLine - 1] === "  }") { bodyOpenLine = i + 1; endLine = candidateEndLine; break; }
  }
  if (bodyOpenLine < 0) throw new Error(`body not found: ${name}`);
  let startLine = declStartLine;
  let i = declStartLine - 2;
  while (i >= 0 && lines[i].trim() === "") i -= 1;
  if (i >= 0 && lines[i].trimEnd().endsWith("*/")) {
    let j = i; while (j >= 0 && !lines[j].trimStart().startsWith("/**")) j -= 1;
    if (j >= 0 && j < i) startLine = j + 1;
  }
  const methodText = lines.slice(startLine - 1, endLine).join("\n") + "\n";
  methods.push({ name, startLine, endLine, declStartLine, bodyOpenLine, text: methodText });
}
fs.writeFileSync(path.join(HERE, "methods-source.json"), JSON.stringify({ totalLines: lines.length, methods }, null, 2), "utf8");
console.log("methods-source.json:", methods.length, "methods, totalLines", lines.length);
