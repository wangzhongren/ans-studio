import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { checkEvidence, EVIDENCE_META_SCHEMA, parseCriteriaText, parseEvidenceMeta } from "../../src/common/编排/evidence-check.ts";
import type {
  DurableAcceptancePreparationResult, DurableAcceptanceWorkspaceBinding, DurableAcceptanceWorkspaceBrowserCaptureReceipt,
  DurableAcceptanceWorkspaceEvidenceReceipt, DurableAcceptanceWorkspaceProjection, DurableAcceptanceWorkspaceRunReceipt, DurableEffectIntent, DurableEvidenceRef,
  DurableEvidenceCollectionArtifact, DurableEvidenceCollectionMissing, DurablePendingTask, DurableProjection, DurableResult, DurableTaskBinding,
} from "../../src/model/durable-workflow.ts";
import type { DesktopDurableWorkflow } from "./durable-workflow.ts";
import { prepareAcceptanceEnvironmentDispatch, type VerifiedAcceptanceDependencyProof } from "./durable-acceptance-environment.ts";
import { workflowTaskEffectMatches } from "./durable-workflow-a.ts";
import type { SessionManagerDeps } from "./session/contracts/deps.ts";
import {
  inspectAcceptanceDependencies, readAcceptanceEnvironmentGit, readAcceptanceWorkspaceCandidate,
  type AcceptanceWorkspaceCandidateFile,
} from "./workflow-git.ts";
import { mainT } from "./i18n.ts";
import roleText from "./durable-workflow-role-text.json" with { type: "json" };

type Store = Awaited<ReturnType<DesktopDurableWorkflow["store"]>>;
type DirectoryIdentity = DurableAcceptanceWorkspaceBinding["workspaceIdentity"];

const maxOutputBytes = 48 * 1024 * 1024;
const configFile = "vite-app.config.mjs";
const buildConfig = "export default { envDir: false, publicDir: 'public', css: { postcss: { plugins: [] } }, build: { emptyOutDir: false } };\n";
const registeredFile = "workspace.json";

interface WorkspaceRegistration {
  binding: DurableAcceptanceWorkspaceBinding;
  inputIdentity: DirectoryIdentity;
  outputIdentity: DirectoryIdentity;
  evidenceIdentity: DirectoryIdentity;
  dependenciesSha256?: string;
  dependencyProof?: VerifiedAcceptanceDependencyProof;
}

type StaticRequirements = NonNullable<DurableAcceptanceWorkspaceBinding["staticRequirements"]>;
type PreparationFailure = Extract<DurableAcceptancePreparationResult, { stage: string }>;
type PreparationProblem = Omit<PreparationFailure, "candidate">;
class WorkspacePreparationError extends Error {
  readonly problem: PreparationProblem;
  constructor(problem: PreparationProblem) {
    super(problem.reason);
    this.problem = problem;
  }
}

function preparationProblem(kind: PreparationProblem["kind"], stage: PreparationProblem["stage"], code: string, reason: string,
  paths?: PreparationProblem["paths"]): WorkspacePreparationError {
  return new WorkspacePreparationError({ kind, stage, code, reason, ...(paths ? { paths } : {}) });
}

async function signedPreparationBytes(projectRoot: string, evidence: DurableEvidenceRef, limit: number, kind: "criteria" | "architecture") {
  let bytes: Buffer;
  try {
    bytes = await ordinaryBytes(projectRoot, path.join(projectRoot, evidence.path), limit);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    throw preparationProblem(missing ? "material-conflict" : "unavailable", "materials",
      `workspace-${kind}-${missing ? "missing" : "unreadable"}`,
      mainT("main.durableWorkflow.workspace.signedMaterialUnavailable", { material: kind === "criteria" ? mainT("main.durableWorkflow.workspace.criteria") : mainT("main.durableWorkflow.workspace.architecture"), issue: missing ? mainT("main.durableWorkflow.workspace.materialMissing") : mainT("main.durableWorkflow.workspace.materialUnverified") }),
      [{ path: evidence.path, state: missing ? "missing" : "unverified" }]);
  }
  const observedSha256 = digest(bytes);
  if (observedSha256 !== evidence.sha256) throw preparationProblem("material-conflict", "materials", `workspace-${kind}-drifted`,
    mainT("main.durableWorkflow.workspace.signedMaterialDigestMismatch", { material: kind === "criteria" ? mainT("main.durableWorkflow.workspace.criteria") : mainT("main.durableWorkflow.workspace.architecture") }),
    [{ path: evidence.path, state: "present" }]);
  return bytes;
}
interface StaticCandidate {
  files: readonly AcceptanceWorkspaceCandidateFile[];
  requirements: StaticRequirements;
  classic: boolean;
}

interface StaticOutput {
  files: ReadonlyMap<string, Buffer>;
  sha256: string;
  entrySha256: string;
}

function configuredBrowserChecks(view: DurableProjection): readonly string[] | undefined {
  return view.verificationPlan && [...new Set(view.verificationPlan.requirements.filter(item =>
    item.stage === "A12b" && item.capability === "workspace-browser").map(item => item.id))];
}

const bootElement = String.raw`document\.getElementById\(\s*(?:'[a-zA-Z0-9_.:-]{1,64}'|"[a-zA-Z0-9_.:-]{1,64}")\s*\)`;
const bootProperty = String.raw`[a-zA-Z][a-zA-Z0-9_]{0,31}\s*:\s*${bootElement}`;
const classicBootstrap = new RegExp(String.raw`^\s*(?:window\.)?[a-zA-Z_$][a-zA-Z0-9_$]{0,63}\.(?:mount|start|init|boot)\(\s*(?:${bootElement}|\{\s*${bootProperty}(?:\s*,\s*${bootProperty}){0,3}\s*\})?\s*\)\s*;?\s*$`, "u");

const htmlVoidTags = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
const passiveBodyParents = new Set("body article aside div footer header main nav section".split(" "));

interface StaticEntryDiagnosis {
  nestedNoscriptLine?: number;
  rejectedScript?: true;
  rejectedScriptLine?: number;
}

function htmlLine(html: string, offset: number): number {
  return html.slice(0, offset).split("\n").length;
}

function staticEntryRejection(diagnosis: StaticEntryDiagnosis): string {
  const reasons: string[] = [];
  if (diagnosis.nestedNoscriptLine !== undefined) {
    reasons.push(mainT("main.durableWorkflow.workspace.nestedNoscript", { line: diagnosis.nestedNoscriptLine }));
  }
  if (diagnosis.rejectedScript) {
    const location = diagnosis.rejectedScriptLine === undefined ? "index.html" : mainT("main.durableWorkflow.workspace.indexLine", { line: diagnosis.rejectedScriptLine });
    reasons.push(mainT("main.durableWorkflow.workspace.scriptRejected", { location }));
  }
  return reasons.length ? reasons.join(" ") : mainT("main.durableWorkflow.workspace.staticEntryUnverified");
}

/** Identify explicit, ordinary HTML body context before unmasking the passive noscript exception. */
function withoutBodyNoscript(html: string, diagnosis?: StaticEntryDiagnosis, scriptPositions?: Set<number>): string | undefined {
  const stack: string[] = [];
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  let doctype = false;
  let seenHtml = false;
  let seenHead = false;
  let seenBody = false;
  const open = /<([a-z][a-z0-9:-]*)(?=[\t\n\f />])((?:[\t\n\f ]+[a-z_:][a-z0-9_.:-]*(?:[\t\n\f ]*=[\t\n\f ]*(?:"[^"<>]*"|'[^'<>]*'|[^\t\n\f "'`=<>]+))?)*)[\t\n\f ]*(\/?)>/iy;
  const close = /<\/([a-z][a-z0-9:-]*)[\t\n\f ]*>/iy;
  while (cursor < html.length) {
    const next = html.indexOf("<", cursor);
    const start = next < 0 ? html.length : next;
    const insideBody = stack.includes("body");
    if (!insideBody && !/^[\t\n\f ]*$/.test(html.slice(cursor, start))) return;
    if (next < 0) break;
    cursor = start;
    if (html.startsWith("<!--", cursor)) {
      const end = html.indexOf("-->", cursor + 4);
      const comment = html.slice(cursor + 4, end);
      if (end < 0 || comment.startsWith(">") || comment.startsWith("->") || comment.includes("--")) return;
      cursor = end + 3;
      continue;
    }
    const declaration = /^<!doctype[\t\n\f ]+html[\t\n\f ]*>/i.exec(html.slice(cursor, cursor + 64));
    if (declaration) {
      if (doctype || seenHtml || seenHead || seenBody) return;
      doctype = true;
      cursor += declaration[0].length;
      continue;
    }
    const parent = stack.at(-1);
    close.lastIndex = cursor;
    const ending = close.exec(html);
    if (ending) {
      if (ending[1]!.toLowerCase() !== parent) return;
      stack.pop();
      cursor = close.lastIndex;
      continue;
    }
    open.lastIndex = cursor;
    const tag = open.exec(html);
    if (!tag) return;
    const name = tag[1]!.toLowerCase();
    const attributes = tag[2]!;
    const selfClosing = tag[3] === "/";
    cursor = open.lastIndex;
    if (name === "html") {
      if (seenHtml || seenHead || seenBody || parent || selfClosing) return;
      seenHtml = true;
    } else if (name === "head" || name === "body") {
      if (seenBody || name === "head" && seenHead || parent !== (seenHtml ? "html" : undefined) || selfClosing) return;
      if (name === "head") seenHead = true;
      else seenBody = true;
    } else if (name === "noscript") {
      if (!insideBody || selfClosing || attributes.trim()
        || !stack.every(ancestor => ancestor === "html" || passiveBodyParents.has(ancestor))) return;
      const textEnd = html.indexOf("<", cursor);
      if (textEnd < 0) return;
      close.lastIndex = textEnd;
      if (close.exec(html)?.[1]?.toLowerCase() === "noscript") {
        cursor = close.lastIndex;
      } else {
        open.lastIndex = textEnd;
        if (!diagnosis || !open.exec(html)) return;
        diagnosis.nestedNoscriptLine ??= htmlLine(html, textEnd);
        // Read past the raw-text element only to locate independent script policy failures.
        // A page with this diagnosis is always rejected, even if the later scan is conclusive.
        const rawEnd = /<\/noscript[\t\n\f ]*>/gi;
        rawEnd.lastIndex = textEnd;
        if (!rawEnd.exec(html)) return;
        cursor = rawEnd.lastIndex;
      }
      ranges.push({ start, end: cursor });
      continue;
    } else if (name === "script" || name === "style" || name === "title") {
      if (selfClosing || (parent !== "head" && (!insideBody || name === "title"))) return;
      const end = new RegExp(`</${name}[\\t\\n\\f ]*>`, "gi");
      end.lastIndex = cursor;
      if (!end.exec(html)) return;
      if (name === "script") scriptPositions?.add(start);
      cursor = end.lastIndex;
      continue;
    } else {
      if (!insideBody && (parent !== "head" || !["meta", "link"].includes(name))) return;
      if (name.includes(":") || /^(?:svg|math|foreignobject|frameset|frame|template|textarea|xmp|plaintext|iframe|object|embed|select|option|optgroup|table|tr|td|th|tbody|tfoot|thead|caption|colgroup)$/.test(name)) return;
    }
    if (!htmlVoidTags.has(name)) {
      if (selfClosing || stack.length >= 128) return;
      stack.push(name);
    }
  }
  if (stack.length || !ranges.length || diagnosis?.nestedNoscriptLine !== undefined) return;
  let result = "";
  let start = 0;
  for (const range of ranges) {
    result += html.slice(start, range.start);
    start = range.end;
  }
  return result + html.slice(start);
}

function verifiedHtmlScripts(index: Buffer, allowed: ReadonlySet<string>, allowClassic = false, diagnosis?: StaticEntryDiagnosis,
  originalLines = true): { hashes: readonly string[]; classic: boolean } | undefined {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(index).replace(/\r\n?/g, "\n");
  if (html.includes("\0")) return;
  const local = (source: string) => {
    const name = source.replace(/^\.?\//, "");
    return /^[a-zA-Z0-9_./-]+$/.test(name) && allowed.has(name);
  };
  const hashes: string[] = [];
  let scripts = 0;
  let modules = 0;
  let classicSources = 0;
  let classicBoots = 0;
  let ambiguousPassive = false;
  let invalid = false;
  const rejectedScripts = diagnosis ? new Set<number>() : undefined;
  const passive = html.replace(/<!--[\s\S]*?-->|<(style|title)\b[^>]*>[\s\S]*?<\/\1\s*>|<script\b([^<>]*)>([\s\S]*?)<\/script\s*>/gi,
    (tag: string, passiveTag: string | undefined, attributes: string | undefined, code: string | undefined, offset: number) => {
    if (attributes === undefined || code === undefined) {
      ambiguousPassive ||= passiveTag ? !/^<(?:style|title)\s*>/i.test(tag)
        : tag.slice(4, -3).includes("--") || /^<!---?>/.test(tag);
      return "";
    }
    const rejectScript = () => { invalid = true; rejectedScripts?.add(offset); };
    if (++scripts > 12) rejectScript();
    const typeFirst = /^\s+type\s*=\s*(['"])module\1(?:\s+src\s*=\s*(['"])([a-zA-Z0-9_./-]+)\2)?\s*$/i.exec(attributes);
    const srcFirst = /^\s+src\s*=\s*(['"])([a-zA-Z0-9_./-]+)\1\s+type\s*=\s*(['"])module\3\s*$/i.exec(attributes);
    const external = typeFirst?.[3] ?? srcFirst?.[2];
    if (!typeFirst && !srcFirst) {
      if (!allowClassic) { rejectScript(); return ""; }
      const source = /^\s+src\s*=\s*(['"])((?:\.\/)?(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.m?js)\1\s*$/i.exec(attributes)?.[2];
      if (source && local(source) && !code.trim()) classicSources++;
      else if (!attributes.trim() && classicSources && ++classicBoots === 1 && code.length <= 1024 && classicBootstrap.test(code)) {
        hashes.push(createHash("sha256").update(code, "utf8").digest("base64"));
      } else rejectScript();
      return "";
    }
    modules++;
    if (external ? !/\.m?js$/i.test(external) || !local(external) || !!code.trim() : !code.trim() || /<!--|<script\b/i.test(code)) rejectScript();
    if (typeFirst && !external) {
      for (const match of code.matchAll(/\bimport\s*\(/g)) {
        const literal = /^\s*(['"])([^'"\r\n]+)\1\s*\)/.exec(code.slice(match.index + match[0].length));
        if (!literal || !local(literal[2]!)) rejectScript();
      }
      for (const match of code.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+(?:[^;'"\n]+?\bfrom\s*)?(['"])([^'"\r\n]+)\1/g)) {
        if (!local(match[2]!)) rejectScript();
      }
      hashes.push(createHash("sha256").update(code, "utf8").digest("base64"));
    }
    return "";
  });
  const reportScript = (offset?: number) => {
    if (!diagnosis) return;
    diagnosis.rejectedScript = true;
    if (originalLines && offset !== undefined) diagnosis.rejectedScriptLine = htmlLine(html, offset);
  };
  if (/<\/?noscript\b/i.test(passive)) {
    const scriptPositions = diagnosis ? new Set<number>() : undefined;
    const checked = withoutBodyNoscript(html, diagnosis, scriptPositions);
    const offset = rejectedScripts && [...rejectedScripts].find(candidate => scriptPositions?.has(candidate));
    if (checked === undefined) {
      if (offset !== undefined) reportScript(offset);
      return;
    }
    const verified = verifiedHtmlScripts(Buffer.from(checked, "utf8"), allowed, allowClassic, diagnosis, false);
    if (!verified && diagnosis?.rejectedScript && offset !== undefined) reportScript(offset);
    return verified;
  }
  if (invalid || classicSources && modules !== 0) reportScript(rejectedScripts?.values().next().value);
  if (invalid || !scripts || classicSources && (modules !== 0 || ambiguousPassive || /(?:\s|\/)on[a-z][a-z0-9_-]*\s*=/i.test(html))
    || /<!--|<\/?(?:script|style|title)\b|<(?:base|iframe|object|embed|template|textarea|xmp|plaintext|noscript|math)\b|<meta\b[^<>]*\bhttp-equiv\s*=|<[^<>]+\s+on[a-z]+\s*=/i.test(passive)
    || /<(?:style|title)\b[^<>]*\s+on[a-z]+\s*=/i.test(html)) return;
  for (const [, attrs] of passive.matchAll(/<(?:link|img|source|audio|video)\b([^<>]*)>/gi)) {
    const asset = /(?:^|\s)(?:src|href)\s*=\s*(['"])([^'"]+)\1/i.exec(attrs)?.[2];
    if (asset ? !local(asset) : /(?:^|\s)(?:src|href)\s*=/i.test(attrs)) return;
  }
  return { hashes: [...new Set(hashes)], classic: classicSources > 0 };
}

function digest(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function failure(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code: `acceptance-workspace-${code}`, message };
}

function directoryIdentity(dir: string): DirectoryIdentity | undefined {
  try {
    const identity = lstatSync(dir, { bigint: true });
    if (!identity.isDirectory() || path.relative(dir, realpathSync.native(dir))) return undefined;
    return { dev: identity.dev.toString(), ino: identity.ino.toString() };
  } catch { return undefined; }
}

function sameIdentity(left: DirectoryIdentity | undefined, right: DirectoryIdentity | undefined): boolean {
  return !!left && !!right && left.dev === right.dev && left.ino === right.ino;
}

async function ordinaryBytes(root: string, file: string, limit: number): Promise<Buffer> {
  const relative = path.relative(root, file);
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes("..") || path.relative(file, await realpath(file))) throw new Error(roleText.workspace.unverifiedFilePath);
  const before = await lstat(file);
  if (!before.isFile() || before.nlink !== 1 || before.size > limit) throw new Error(roleText.workspace.unverifiedOrdinaryFile);
  const bytes = await readFile(file);
  const after = await lstat(file);
  if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== bytes.length || after.mtimeMs !== before.mtimeMs
    || after.ctimeMs !== before.ctimeMs) throw new Error(roleText.workspace.fileChangedDuringRead);
  return bytes;
}

function readObject(bytes: Buffer): Record<string, unknown> {
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(roleText.workspace.invalidJsonObject);
  return value as Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stable));
  if (value && typeof value === "object") {
    return JSON.stringify(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  }
  return JSON.stringify(value);
}

/** Reconstruct the frozen launcher bytes for receipt validation. */
function runnerSource(binding: Pick<DurableAcceptanceWorkspaceBinding, "workspaceRoot" | "inputRoot" | "outputRoot">, typescript: boolean,
  dependencyProof?: VerifiedAcceptanceDependencyProof): string {
  const config = path.join(binding.workspaceRoot, configFile);
  const cli = (name: string) => path.join(binding.inputRoot, "node_modules", ...name.split("/"));
  const commands = [
    ...(typescript ? [[cli("typescript/lib/tsc.js"), "--noEmit", "--incremental", "false", "--pretty", "false"]] : []),
    [cli("vite/bin/vite.js"), "build", "--config", config, "--configLoader", "runner", "--outDir", binding.outputRoot],
  ];
  return [
    ...(dependencyProof ? [`// Reviewed dependency source: ${JSON.stringify(dependencyProof)}`] : []),
    'import { spawn } from "node:child_process";',
    'import { readFileSync } from "node:fs";',
    `if (readFileSync(${JSON.stringify(config)}, "utf8") !== ${JSON.stringify(buildConfig)}) throw new Error("Application build config changed.");`,
    `for (const argv of ${JSON.stringify(commands)}) {`,
    '  const child = spawn(process.execPath, argv, { cwd: process.cwd(), env: process.env, shell: false, stdio: "inherit", windowsHide: true });',
    '  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", result => resolve(result ?? 1)); });',
    '  if (code !== 0) process.exit(code);',
    "}",
    "",
  ].join("\n");
}

function staticFiles(files: ReadonlyMap<string, Buffer>): DurableEvidenceRef[] {
  return [...files.keys()].sort().map(name => ({ path: name, sha256: digest(files.get(name)!) }));
}

function staticDigest(files: readonly DurableEvidenceRef[]): string {
  return digest(JSON.stringify(files.map(file => [file.path, file.sha256])));
}

function staticRunner(roots: Pick<DurableAcceptanceWorkspaceBinding, "inputRoot" | "outputRoot">, candidate: StaticCandidate,
  directories: Pick<WorkspaceRegistration, "inputIdentity" | "outputIdentity">): string {
  const files = staticFiles(new Map(candidate.files.map(file => [file.path, file.bytes])));
  return [
    ...(candidate.classic ? ['// Approved classic static browser entry.'] : []),
    'import { createHash } from "node:crypto";',
    'import { lstat, mkdir, readFile, realpath } from "node:fs/promises";',
    'import path from "node:path";',
    `const input = ${JSON.stringify(roots.inputRoot)}, output = ${JSON.stringify(roots.outputRoot)};`,
    'const samePath = async file => path.relative(file, await realpath(file)) === "";',
    'const sameDirectory = async (file, identity) => {',
    '  const stat = await lstat(file, { bigint: true });',
    '  return stat.isDirectory() && await samePath(file) && String(stat.dev) === identity.dev && String(stat.ino) === identity.ino;',
    '};',
    `if (path.relative(input, process.cwd()) || !(await sameDirectory(input, ${JSON.stringify(directories.inputIdentity)}))`,
    `  || !(await sameDirectory(output, ${JSON.stringify(directories.outputIdentity)}))) throw new Error("Static workspace changed.");`,
    `for (const { path: name, sha256 } of ${JSON.stringify(files)}) {`,
    '  const source = path.join(input, name), target = path.join(output, name);',
    '  const stat = await lstat(source);',
    '  if (!stat.isFile() || stat.nlink !== 1 || !(await samePath(source))) throw new Error("Static input changed.");',
    '  const content = await readFile(source);',
    '  if (createHash("sha256").update(content).digest("hex") !== sha256) throw new Error("Static input digest changed.");',
    '  let parent = output;',
    '  for (const segment of name.split("/").slice(0, -1)) {',
    '    parent = path.join(parent, segment);',
    '    await mkdir(parent).catch(error => { if (error.code !== "EEXIST") throw error; });',
    '    if (!(await lstat(parent)).isDirectory() || !(await samePath(parent))) throw new Error("Static output changed.");',
    '  }',
    '  await writeFile(target, content, { flag: "wx" });',
    '}',
    'console.log("Verified static browser files copied to the application output directory.");',
    '',
  ].join("\n");
}

function choseStaticBrowser(approval: DurableProjection["proposalDecision"]): boolean {
  const platforms = Object.entries(approval?.values ?? {}).filter(([field]) => /^(?:runtime-?|delivery-?)?platform$/i.test(field));
  const result = platforms[0]?.[1];
  return platforms.length === 1 && typeof result === "string" && /^(?:desktop-)?static-browser(?:-file|-http)?$/.test(result);
}

function authorizesClassicEntry(architecture: string): boolean {
  const clauses = architecture.split(/[。；;\n]|\.(?=\s|$)/);
  const classic = new RegExp(roleText.workspace.classicScriptPattern, "i");
  if (clauses.some(line => classic.test(line)
    && new RegExp(roleText.workspace.disallowedClassicScriptPattern, "i").test(line))) return false;
  const relative = roleText.workspace.relativeScriptPattern;
  const negated = new RegExp(`${roleText.workspace.negatedRelativeScriptPrefix[0]}${relative}`, "i");
  if (clauses.some(line => negated.test(line))) return false;
  if (new RegExp(roleText.workspace.classicScriptUsePattern, "i").test(architecture)) return true;
  const entry = String.raw`^\s*(?:[-*+]\s+)?\x60index\.html\x60(?:\s*[（(][^()（）\x60]{1,80}[）)])?\s*`;
  const label = roleText.workspace.entryLabelPattern;
  const loads = new RegExp(`${entry}${label}${roleText.workspace.entryLoadsRelativeScript[2]}${relative}`, "i");
  return clauses.some(line => loads.test(line) && !new RegExp(roleText.workspace.obsoleteEntryPattern, "i").test(line));
}

async function decideStaticCandidate(
  store: Store, view: DurableProjection, files: readonly AcceptanceWorkspaceCandidateFile[], criteria: string, criteriaPath: string,
): Promise<StaticCandidate | undefined> {
  const selection = view.proposalDecision;
  const staticChosen = choseStaticBrowser(selection);
  const unavailable = (reason: string, code?: string, stage?: PreparationProblem["stage"]): undefined => {
    if (staticChosen && code && stage && view.acceptanceWorkspace?.preparationGate) {
      throw preparationProblem("unavailable", stage, code, reason);
    }
    if (staticChosen) throw new Error(reason);
  };
  const input = new Map(files.map(file => [file.path, file.bytes]));
  const index = input.get("index.html");
  if (!view.flowId) return unavailable(mainT("main.durableWorkflow.workspace.staticFlowUnverified"), "workspace-flow-unverified", "materials");
  const manifest = input.get("package.json");
  const pkg = manifest ? readObject(manifest) : {};
  const scripts = asObject(pkg.scripts);
  if (["build", "prebuild", "postbuild", "prepare"].some(key => scripts[key] !== undefined)
    || ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundledDependencies", "bundleDependencies", "workspaces"]
      .some(key => pkg[key] !== undefined && (!pkg[key] || typeof pkg[key] !== "object" || Object.keys(pkg[key]!).length))
    || files.some(file => /(?:^|\/)(?:tsconfig|vite\.config\.|webpack\.config\.|rollup\.config\.|babel\.config\.|postcss\.config\.)/i.test(file.path))) {
    return unavailable(mainT("main.durableWorkflow.workspace.staticConfigurationUnsupported"), "workspace-static-configuration-unsupported", "entry");
  }
  const architecturePath = new RegExp(`^docs/contracts/${view.flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-architecture-v[1-9][0-9]*\\.md$`);
  const rows = store.listCapabilityEvents(view.ref).filter(row => row.receipt.state === "consumed" && row.event.flowId === view.flowId);
  const approved = rows.findLast(row => row.event.input.kind === "card-decided" && row.event.input.decision === "approve"
    && rows.some(prepared => {
      const card = prepared.event.input;
      const decision = row.event.input;
      return card.kind === "card-prepared" && card.card.cardKind === "proposal" && decision.kind === "card-decided"
        && card.card.requestId === decision.requestId && card.card.digest === decision.digest && card.card.generation === decision.generation;
    }));
  const decision = approved?.event.input;
  if (decision?.kind !== "card-decided") return unavailable(mainT("main.durableWorkflow.workspace.a6ApprovalUnverified"), "workspace-a6-approval-unverified", "materials");
  const prepared = rows.find(row => row.event.input.kind === "card-prepared" && row.event.input.card.requestId === decision.requestId
    && row.event.input.card.digest === decision.digest && row.event.input.card.generation === decision.generation)?.event.input;
  const architecture = prepared?.kind === "card-prepared" && prepared.card.documents.find(file => architecturePath.test(file.path));
  if (!architecture) return unavailable(mainT("main.durableWorkflow.workspace.staticArchitectureUnverified"), "workspace-architecture-authority-unverified", "materials");
  const architectureBytes = await signedPreparationBytes(view.projectRoot, architecture, 256 * 1024, "architecture");
  const architectureText = architectureBytes.toString("utf8");
  if (!new RegExp(roleText.workspace.browserDeliveryPattern, "i").test(architectureText)) return unavailable(mainT("main.durableWorkflow.workspace.browserDeliveryUndeclared"));
  const declaredPaths = [...architectureText.matchAll(/\x60([a-zA-Z0-9_][a-zA-Z0-9_./-]*)\x60/g)].map(match => match[1]);
  if (!index?.length || index.length > 512 * 1024) {
    if (view.acceptanceWorkspace?.preparationGate && declaredPaths.includes("index.html")) {
      throw preparationProblem("candidate-defect", "entry", index ? "static-entry-size-invalid" : "static-entry-missing",
        index ? mainT("main.durableWorkflow.workspace.staticEntrySizeInvalid") : mainT("main.durableWorkflow.workspace.staticEntryMissing"),
        [{ path: "index.html", state: index ? "present" : "missing" }]);
    }
    return unavailable(mainT("main.durableWorkflow.workspace.staticEntryMissingOrOversize"));
  }
  if (!declaredPaths.includes("index.html")) return unavailable(mainT("main.durableWorkflow.workspace.staticEntryUndeclared"));
  const selected = files.filter(file => file.path === "index.html" || (
    /\.(?:m?js|css|png|jpe?g|svg|webp|ico|woff2?|wasm|mp3|ogg|wav)$/i.test(file.path)
    && file.path.split("/").every(segment => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(segment)
      && !/^(?:docs?|tools?|scripts?|tests?|__tests__|fixtures?|server|configs?|node_modules|env|private|secrets?|credentials?)(?:$|[._-])/i.test(segment)
      && !/\.(?:test|spec|config|secret|private|credential)\./i.test(segment))
    && declaredPaths.some(allowed => allowed.endsWith("/") ? file.path.startsWith(allowed) : file.path === allowed)
  ));
  const selectedNames = new Set(selected.map(file => file.path));
  if (selected.length > 256 || selected.reduce((total, file) => total + file.bytes.length, 0) > maxOutputBytes) {
    return unavailable(mainT("main.durableWorkflow.workspace.staticAssetLimit"));
  }
  const approvedClassic = staticChosen && selection?.requestId === decision.requestId && selection.digest === decision.digest
    && selection.generation === decision.generation && selection.authority === decision.authority
    && stable(selection.values) === stable(decision.decisionValues) && prepared?.kind === "card-prepared"
    && prepared.card.documents.some(file => stable(file) === stable(selection.proposal)) && authorizesClassicEntry(architectureText);
  const parsedCriteria = approvedClassic ? parseCriteriaText(criteria, { flowId: view.flowId, fileName: path.basename(criteriaPath) }) : undefined;
  const classicEligible = !!parsedCriteria?.ok && parsedCriteria.doc.status === "final"
    && new RegExp(roleText.workspace.acceptanceBrowserPattern, "i").test(criteria);
  const diagnosis: StaticEntryDiagnosis = {};
  const scriptsVerified = (() => { try { return verifiedHtmlScripts(index, selectedNames, classicEligible, diagnosis); } catch { return undefined; } })();
  if (!scriptsVerified) {
    if (view.acceptanceWorkspace?.preparationGate) throw preparationProblem("candidate-defect", "entry", "static-entry-rejected",
      staticEntryRejection(diagnosis), [{ path: "index.html", state: "present" }]);
    return unavailable(classicEligible ? mainT("main.durableWorkflow.workspace.sameOriginPreviewUnverified")
      : mainT("main.durableWorkflow.workspace.classicEntryUnverified"));
  }
  const readme = input.get("README.md")?.toString("utf8") ?? "";
  const launch = typeof scripts.start === "string" ? scripts.start.trim() : readme.match(/\bnode [a-zA-Z0-9_./-]+\.m?js\b/)?.[0];
  const deliveryStartup = launch && launch.length <= 120 && !/[\x00-\x1f]/.test(launch) ? launch : undefined;
  const requirements: StaticRequirements = {
    build: view.verificationPlan ? view.verificationPlan.requirements.some(item => item.stage === "A12b" && item.capability === "workspace-build")
      : new RegExp(roleText.workspace.buildRequiredPattern, "im").test(criteria),
    requireDeliveryStartup: new RegExp(roleText.workspace.deliveryStartupRequiredPattern, "i").test(criteria),
    requireLogicTest: new RegExp(roleText.workspace.logicTestRequiredPattern, "i").test(criteria),
    ...(deliveryStartup ? { deliveryStartup } : {}),
  };
  return { files: selected, requirements, classic: scriptsVerified.classic };
}

function assertSupported(files: readonly AcceptanceWorkspaceCandidateFile[]): boolean {
  const inputs = new Map(files.map(file => [file.path, file.bytes]));
  const manifest = inputs.get("package.json");
  if (!manifest) throw new Error(mainT("main.durableWorkflow.workspace.trackedManifestMissing"));
  const scripts = asObject(readObject(manifest).scripts);
  const build = typeof scripts.build === "string" ? scripts.build.trim() : "";
  const typescript = /^tsc[ \t]+--noEmit[ \t]+&&[ \t]+vite[ \t]+build$/.test(build);
  if (!typescript && !/^vite[ \t]+build$/.test(build) || scripts.prebuild !== undefined || scripts.postbuild !== undefined
    || !inputs.has("index.html") || [...inputs.keys()].some(file => /(?:^|\/)(?:vite\.config\.|\.env(?:\.|$)|\.npmrc$|postcss\.config\.|\.postcssrc)/i.test(file))) {
    throw new Error(mainT("main.durableWorkflow.workspace.unsupportedBuildCandidate"));
  }
  if (typescript) {
    const tsconfig = inputs.get("tsconfig.json");
    if (!tsconfig) throw new Error(mainT("main.durableWorkflow.workspace.trackedTsconfigMissing"));
    const data = readObject(tsconfig);
    const compiler = asObject(data.compilerOptions);
    if (data.extends !== undefined || data.references !== undefined || ["plugins", "paths", "rootDirs", "rootDir", "typeRoots", "baseUrl", "outFile",
      "outDir", "tsBuildInfoFile", "generateTrace", "generateCpuProfile", "declarationDir"].some(key => Object.hasOwn(compiler, key))) {
      throw new Error(mainT("main.durableWorkflow.workspace.unsupportedTsconfig"));
    }
    for (const key of ["include", "exclude", "files"]) {
      const values = data[key];
      if (values !== undefined && (!Array.isArray(values) || values.some(item => typeof item !== "string" || path.isAbsolute(item)
        || item.split(/[\\/]/).includes("..")))) throw new Error(mainT("main.durableWorkflow.workspace.typescriptReadScopeUnverified"));
    }
  }
  return typescript;
}

async function recordEffect(store: Store, view: DurableProjection, claim: { key: string; token: string }, body: unknown, evidence: string) {
  const stored = store.storeEvidence(view.ref, body);
  if (!stored.ok) return stored;
  const saved = await store.settleEffect(view.ref, { key: claim.key, token: claim.token, outcome: "succeeded", evidence, result: { receiptId: stored.value.sha256 } });
  return saved.ok ? stored : saved;
}

function effectOf(view: DurableProjection, workspace: DurableAcceptanceWorkspaceProjection, kind: DurableEffectIntent["kind"], key: string): DurableEffectIntent {
  return { key, kind, stepId: view.stepId, attempt: view.attempt, task: workspace.basis.assessmentTask };
}

async function verifyWorkspaceBasis(store: Store, view: DurableProjection, workspace: DurableAcceptanceWorkspaceProjection) {
  const { basis } = workspace;
  const git = await readAcceptanceEnvironmentGit(view.projectRoot, basis.branch, basis.candidateOid);
  if (!git.ok) throw new Error(git.message);
  const approved = await store.readEvidence(view.projectRoot, basis.criteria.path);
  if (!approved.ok || approved.value.sha256 !== basis.criteria.sha256) throw new Error(mainT("main.durableWorkflow.workspace.criteriaChanged"));
  return git.value;
}

async function readWorkspaceCriteria(binding: Pick<DurableAcceptanceWorkspaceBinding, "projectRoot" | "basis">): Promise<string> {
  const bytes = await ordinaryBytes(binding.projectRoot, path.join(binding.projectRoot, binding.basis.criteria.path), 256 * 1024);
  if (digest(bytes) !== binding.basis.criteria.sha256) throw new Error(mainT("main.durableWorkflow.workspace.criteriaChanged"));
  return bytes.toString("utf8");
}

async function readRegistration(binding: DurableAcceptanceWorkspaceBinding): Promise<WorkspaceRegistration> {
  const { workspaceRoot, inputRoot, outputRoot, evidenceRoot, launcherPath } = binding;
  if (!sameIdentity(directoryIdentity(workspaceRoot), binding.workspaceIdentity)) throw new Error(mainT("main.durableWorkflow.workspace.workspaceIdentityChanged"));
  const file = path.join(workspaceRoot, registeredFile);
  const value = JSON.parse((await ordinaryBytes(workspaceRoot, file, 64 * 1024)).toString("utf8")) as WorkspaceRegistration;
  if (stable(value.binding) !== stable(binding) || !sameIdentity(directoryIdentity(inputRoot), value.inputIdentity)
    || !sameIdentity(directoryIdentity(outputRoot), value.outputIdentity) || !sameIdentity(directoryIdentity(evidenceRoot), value.evidenceIdentity)
    || digest(await ordinaryBytes(workspaceRoot, launcherPath, 96 * 1024)) !== binding.launcherSha256
    || (binding.operation !== "static" && (await ordinaryBytes(workspaceRoot, path.join(workspaceRoot, configFile), 2048)).toString("utf8") !== buildConfig)) {
    throw new Error(mainT("main.durableWorkflow.workspace.workspaceBindingChanged"));
  }
  return value;
}

function requiredLegacyWorkspace(view: DurableProjection): boolean {
  return view.verificationPlan?.requirements.some(item => item.stage === "A12b" && item.capability.startsWith("workspace-"))
    ?? !!view.acceptanceWorkspace;
}

export async function prepareDesktopAssessmentDispatch(durable: DesktopDurableWorkflow, view: DurableProjection, taskId: string, _deps: SessionManagerDeps) {
  const task = view.pendingTasks?.find(item => item.taskId === taskId && item.capability === "independent-assessment");
  if (!task) return { hold: true };
  const store = await durable.store();
  if (view.evidenceAuditEnabled) {
    const permit = store.evidenceAuditDispatchPermit(view.ref, task.task);
    return permit.ok && (await store.verifyEvidenceAudit(view.ref, task.task, permit.value.generation)).ok
      ? { hold: false, text: evidenceAuditInstructions(view) } : { hold: true };
  }
  if (requiredLegacyWorkspace(view)) return prepareDesktopAcceptanceWorkspace(store, view, task);
  const preflight = await prepareAcceptanceEnvironmentDispatch(store, view, task);
  if (preflight.hold) return { hold: true };
  const prepared = await prepareDesktopAcceptanceWorkspace(store, view, task);
  return { hold: prepared.hold, text: prepared.text ?? preflight.instructions };
}

export function readCollectionEvidence(references: readonly string[]): {
  artifacts: DurableEvidenceCollectionArtifact[]; missing: DurableEvidenceCollectionMissing[];
} | undefined {
  const artifacts: DurableEvidenceCollectionArtifact[] = [];
  const missing: DurableEvidenceCollectionMissing[] = [];
  for (const reference of references) {
    let row: unknown;
    try { row = JSON.parse(reference); } catch { return undefined; }
    if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
    const fields = row as Record<string, unknown>;
    const { requirementId, path, source, receiptId, reason } = fields;
    if (typeof requirementId !== "string" || !requirementId) return undefined;
    if (typeof reason === "string" && reason.trim() && Object.keys(fields).length === 2) {
      missing.push({ requirementId, reason });
      continue;
    }
    if (typeof path !== "string" || source !== "candidate-file" && source !== "task-command" && source !== "external-session"
      || receiptId !== undefined && typeof receiptId !== "string"
      || Object.keys(fields).some(key => !["requirementId", "path", "source", "receiptId"].includes(key))) return undefined;
    artifacts.push({ requirementId, path, source, ...(receiptId ? { receiptId } : {}) });
  }
  return { artifacts, missing };
}

export function evidenceAuditInstructions(view: DurableProjection): string {
  const audit = view.evidenceAudit;
  if (!audit || audit.state !== "ready" || audit.legacy) return "";
  const records = audit.records.map(row => JSON.stringify(row)).join("\n");
  return `${roleText.workspace.auditInstructions[0]}${audit.basis.candidateOid}${roleText.workspace.auditInstructions[1]}${audit.basis.generation}${roleText.workspace.auditInstructions[2]}${records}${roleText.workspace.auditInstructions[3]}`;
}

export async function refreshDesktopPreparationBlock(durable: DesktopDurableWorkflow, view: DurableProjection, _deps: SessionManagerDeps): Promise<DurableProjection> {
  if (view.status !== "waiting" || view.engine !== "healthy") return view;
  const store = await durable.store();
  if (view.evidenceAuditEnabled || requiredLegacyWorkspace(view) || view.action === "open-environment-recovery"
    || view.action === "operations-environment-recovery") await store.prepareEvidenceAudit(view.ref);
  else if (view.blockedRouting?.a12bPrepareKey) {
    const task = view.pendingTasks?.find(item => item.taskId === view.acceptanceWorkspace?.basis.assessmentTask.taskId && item.state === "pending");
    if (task) await prepareDesktopAcceptanceWorkspace(store, view, task);
  }
  return store.lookup(view.ref) ?? view;
}

export async function desktopAssessmentAdmission(store: Store, view: DurableProjection, task: DurableTaskBinding):
  Promise<{ dedup: string; expected: Record<string, string> } | undefined> {
  if (view.evidenceAuditEnabled) {
    const permit = store.evidenceAuditDispatchPermit(view.ref, task);
    return permit.ok && permit.value.generation !== undefined && (await store.verifyEvidenceAudit(view.ref, task, permit.value.generation)).ok
      ? { dedup: `\0audit:${permit.value.generation}`, expected: { evidenceAuditGeneration: String(permit.value.generation) } }
      : undefined;
  }
  if (!view.acceptanceWorkspace?.preparationGate || view.acceptanceWorkspace.basis.assessmentTask.taskId !== task.taskId) {
    return { dedup: "", expected: {} };
  }
  const permit = store.acceptanceDispatchPermit(view.ref, task);
  return permit.ok && permit.value.prepareKey
    ? { dedup: `\0prepare:${permit.value.generation}`, expected: {
      prepareKey: permit.value.prepareKey, preparationGeneration: String(permit.value.generation),
    } } : undefined;
}

export async function desktopQueuedAcceptanceIsCurrent(durable: DesktopDurableWorkflow, projectRoot: string,
  clientMessageId: string | undefined): Promise<boolean> {
  const delivery = durable.delivery(projectRoot, clientMessageId);
  const task = delivery?.intent.task;
  if (!delivery || task?.stage !== "A12b") return true;
  const store = await durable.store();
  const view = store.lookup(delivery.ref);
  if (!view) return false;
  const expected = delivery.intent.expected;
  if (view.evidenceAuditEnabled) {
    const permit = store.evidenceAuditDispatchPermit(delivery.ref, task);
    return permit.ok && permit.value.generation !== undefined && String(permit.value.generation) === expected?.evidenceAuditGeneration
      && (await store.verifyEvidenceAudit(delivery.ref, task, permit.value.generation)).ok;
  }
  const pending = view.pendingTasks?.find(item => item.taskId === task.taskId && item.state === "pending");
  if (!pending || (await prepareDesktopAcceptanceWorkspace(store, view, pending)).hold) return false;
  if (!expected?.prepareKey && !view.acceptanceWorkspace?.preparationGate) return true;
  const permit = store.acceptanceDispatchPermit(delivery.ref, task);
  return permit.ok && !!permit.value.prepareKey && permit.value.prepareKey === expected?.prepareKey
    && String(permit.value.generation) === expected?.preparationGeneration;
}

/** An upgraded host can inspect previously registered evidence and never launch a frozen workspace. */
export async function prepareDesktopAcceptanceWorkspace(
  store: Store, view: DurableProjection, pending: DurablePendingTask, ..._retiredOptions: unknown[]
): Promise<{ hold: boolean; text?: string }> {
  const workspace = view.acceptanceWorkspace;
  if (!workspace || workspace.basis.assessmentTask.taskId !== pending.taskId || pending.capability !== "independent-assessment") {
    return { hold: requiredLegacyWorkspace(view) };
  }
  const current = () => {
    const now = store.lookup(view.ref);
    return now?.status === "waiting" && now.engine === "healthy" && now.stepId === view.stepId && now.attempt === view.attempt
      && now.acceptanceWorkspace?.prepareKey === workspace.prepareKey
      && now.pendingTasks?.some(task => task.taskId === pending.taskId && task.state === "pending") === true;
  };
  if (!current()) return { hold: true };
  const required = requiredLegacyWorkspace(view);
  if (required && (!workspace.binding || !workspace.receipt || !workspace.runReceiptId || !workspace.closeReceipt
    || workspace.binding.requiresBrowserEvidence && !workspace.browserEvidence)) return { hold: true };
  try {
    await verifyWorkspaceBasis(store, view, workspace);
    if (!required) {
      if (!workspace.preparationGate) return { hold: false };
      const saved = await store.recordAcceptancePreparation(view.ref, { prepareKey: workspace.prepareKey, basis: workspace.basis,
        result: { kind: "not-applicable", authority: "no-workspace-required" } }, current);
      return { hold: !saved.ok || !current() };
    }
    if (!workspace.binding) return { hold: true };
    await readRegistration(workspace.binding);
    for (const artifact of workspace.browserEvidence?.artifacts ?? []) {
      if (digest(await ordinaryBytes(view.projectRoot, path.join(view.projectRoot, artifact.path), 8 * 1024 * 1024)) !== artifact.sha256) {
        return { hold: true };
      }
    }
    return { hold: !current(), text: roleText.workspace.reconcileExistingReceipts };
  } catch {
    return { hold: true };
  }
}

async function readBuiltOutput(outputRoot: string): Promise<StaticOutput> {
  if (!directoryIdentity(outputRoot)) throw new Error(roleText.workspace.buildOutputDirectoryUnverified);
  const files = new Map<string, Buffer>();
  const directories = [""];
  let remaining = maxOutputBytes;
  for (const dir of directories) {
    const location = path.join(outputRoot, dir);
    if (!directoryIdentity(location)) throw new Error(roleText.workspace.redirectedBuildDirectory);
    for (const entry of await readdir(location, { withFileTypes: true })) {
      const name = dir ? `${dir}/${entry.name}` : entry.name;
      if (directories.length + files.size > 2_000 || /[\\\x00-\x1f:]/.test(name)) throw new Error(roleText.workspace.buildOutputPreviewLimit);
      if (entry.isDirectory()) directories.push(name);
      else {
        const bytes = await ordinaryBytes(outputRoot, path.join(outputRoot, name), remaining);
        remaining -= bytes.length;
        files.set(name, bytes);
      }
    }
  }
  const index = files.get("index.html");
  if (!index?.length) throw new Error(roleText.workspace.buildPreviewEntryMissing);
  const summary = [...files].sort(([left], [right]) => left.localeCompare(right)).map(([name, bytes]) => [name, bytes.length, digest(bytes)]);
  return { files, sha256: digest(JSON.stringify(summary)), entrySha256: digest(index) };
}

async function checkStagedInputs(store: Store, view: DurableProjection, binding: DurableAcceptanceWorkspaceBinding, registration: WorkspaceRegistration) {
  const candidate = await readAcceptanceWorkspaceCandidate(binding.projectRoot, binding.basis.candidateOid);
  let files: readonly AcceptanceWorkspaceCandidateFile[] = candidate;
  let classic = false;
  if (binding.operation === "static") {
    const selected = await decideStaticCandidate(store, view, candidate, await readWorkspaceCriteria(binding), binding.basis.criteria.path);
    if (!selected || selected.requirements.build || stable(selected.requirements) !== stable(binding.staticRequirements)
      || digest(staticRunner(binding, selected, registration)) !== binding.launcherSha256) throw new Error(roleText.workspace.staticInputsApprovalMismatch);
    files = selected.files;
    classic = selected.classic;
  } else if ((registration.dependencyProof && registration.dependenciesSha256 !== registration.dependencyProof.sha256)
    || digest(runnerSource(binding, assertSupported(candidate), registration.dependencyProof)) !== binding.launcherSha256) {
    throw new Error(roleText.workspace.dependencySourceBindingMismatch);
  }
  const expected = new Map(files.map(file => [file.path, digest(file.bytes)]));
  const directories = [""];
  let seen = 0;
  for (const dir of directories) {
    for (const entry of await readdir(path.join(binding.inputRoot, dir), { withFileTypes: true })) {
      if (binding.operation !== "static" && dir === "" && entry.name === "node_modules") continue;
      const name = dir ? `${dir}/${entry.name}` : entry.name;
      const absolute = path.join(binding.inputRoot, name);
      if (entry.isDirectory() && directoryIdentity(absolute) && directories.length < 800) directories.push(name);
      else {
        const sha = expected.get(name);
        if (!sha || digest(await ordinaryBytes(binding.inputRoot, absolute, 32 * 1024 * 1024)) !== sha) {
          throw new Error(roleText.workspace.workspaceInputCandidateMismatch);
        }
        seen++;
      }
    }
  }
  if (seen !== files.length || (binding.operation !== "static"
    && (await inspectAcceptanceDependencies(binding.inputRoot)) !== registration.dependenciesSha256)) {
    throw new Error(roleText.workspace.workspaceToolchainBindingMismatch);
  }
  return { classic, files: binding.operation === "static" ? [...expected.keys()].sort().map(name => ({ path: name, sha256: expected.get(name)! })) : [] };
}

function receiptOperation(receipt: DurableAcceptanceWorkspaceRunReceipt) {
  return receipt.kind === "acceptance-workspace-static-run" ? receipt.stage : receipt.build;
}

/** Reuse only an actual archived close receipt. The old process is never probed or closed here. */
export async function closeDesktopAcceptanceWorkspace(
  _store: Store, view: DurableProjection, taskId: string,
): Promise<DurableResult<true>> {
  const workspace = view.acceptanceWorkspace;
  if (!requiredLegacyWorkspace(view) || workspace?.basis.assessmentTask.taskId === taskId && workspace.closeReceipt) {
    return { ok: true, value: true };
  }
  return failure("close-receipt-missing", mainT("main.durableWorkflow.workspace.workspaceCloseReceiptMissing"));
}

/** Re-read the formal report's real artifacts. Metadata and HTTP alone never supply an artifact. */
async function publishEvidenceFile(root: string, file: string, content: Buffer, mtime?: Date): Promise<void> {
  try {
    const handle = await open(file, "wx", 0o600);
    try {
      await handle.writeFile(content);
      if (mtime) await handle.utimes(new Date(), mtime);
    } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST"
      || !(await ordinaryBytes(root, file, content.length)).equals(content)) throw new Error(roleText.workspace.evidenceDestinationOccupied);
  }
}

export async function verifyDesktopAcceptanceWorkspaceEvidence(
  store: Store, view: DurableProjection, pending: DurablePendingTask, turnId: string, references: readonly string[],
): Promise<DurableResult<readonly DurableEvidenceRef[]>> {
  const workspace = store.lookup(view.ref)?.acceptanceWorkspace ?? view.acceptanceWorkspace;
  if (!workspace || workspace.basis.assessmentTask.taskId !== pending.taskId || !workspace.binding) return { ok: true, value: [] };
  const { binding, receipt } = workspace;
  if (!receipt || !workspace.closeReceipt || receiptOperation(receipt).turnId !== turnId || !receiptOperation(receipt).writeAuditPassed
    || (binding.operation === "static") !== (receipt.kind === "acceptance-workspace-static-run")
    || (receipt.kind === "acceptance-workspace-run" && receipt.build.exitCode !== 0)) {
    return failure("evidence-unverified", roleText.workspace.workspaceOperationReceiptMissing);
  }
  let publication: { key: string; token: string } | undefined;
  try {
    const registration = await readRegistration(binding);
    await verifyWorkspaceBasis(store, view, workspace);
    const output = await readBuiltOutput(binding.outputRoot);
    if (receipt.kind === "acceptance-workspace-static-run") {
      const actualInput = await checkStagedInputs(store, view, binding, registration);
      const actualOutput = staticFiles(output.files);
      if (staticDigest(actualInput.files) !== receipt.stage.inputSha256 || staticDigest(actualOutput) !== receipt.stage.outputSha256
        || stable(actualOutput) !== stable(receipt.stage.files)) throw new Error(roleText.workspace.staticFilesChanged);
    } else if (output.sha256 !== receipt.build.outputSha256) throw new Error(roleText.workspace.buildArtifactsChanged);
    if (output.entrySha256 !== receiptOperation(receipt).entrySha256) throw new Error(roleText.workspace.actualEntryChanged);
    if (!binding.requiresBrowserEvidence) return { ok: true, value: [] };
    const text = await ordinaryBytes(view.projectRoot, path.join(view.projectRoot, binding.basis.criteria.path), 256 * 1024);
    const criteria = parseCriteriaText(text.toString("utf8"), { flowId: pending.flowId, fileName: path.basename(binding.basis.criteria.path) });
    if (!criteria.ok) throw new Error(roleText.workspace.browserCriteriaInvalid);
    const browserChecks = configuredBrowserChecks(view);
    const expected = new Set(browserChecks ?? criteria.doc.criteria.filter(item => item.priority === "P0").map(item => item.id));
    const checks = new Set<string>();
    const artifacts: DurableEvidenceRef[] = [];
    const staged: { artifact: string; metaPath: string; bytes: Buffer; meta: Buffer; ids: string[]; mtime: Date }[] = [];
    let observedAt = "";
    const started = Date.parse(receipt.preview.openedAt);
    const ending = Math.min(Date.parse(receipt.preview.expiresAt), workspace.closeReceipt ? Date.parse(workspace.closeReceipt.closedAt) : Date.now());
    const evidenceFolder = path.relative(view.projectRoot, binding.evidenceRoot).split(path.sep).join("/") + "/";
    const names = [...new Set(references)].filter(item => browserChecks && binding.browserEvidenceSource === "application-browser"
      ? item.startsWith(evidenceFolder) && /\.png$/i.test(item)
      : (item.startsWith("docs/verification/") || item.startsWith(evidenceFolder)) && !item.endsWith(".meta.json"));
    const captured: { id: string; body: DurableAcceptanceWorkspaceBrowserCaptureReceipt }[] = [];
    if (binding.browserEvidenceSource === "application-browser") {
      for (const effect of store.listEffects(view.ref, "acceptance-workspace-browser-capture")) {
        const id = effect.result?.result?.receiptId;
        if (typeof id !== "string" || effect.state !== "succeeded" || !workflowTaskEffectMatches(effect, pending)) continue;
        const body = store.getEvidence(view.ref, { path: `ans-evidence/${id}`, sha256: id }) as DurableAcceptanceWorkspaceBrowserCaptureReceipt | undefined;
        if (body?.kind === "acceptance-workspace-browser-capture" && body.turnId === turnId && body.url === receipt.preview.url
          && body.runReceiptId === workspace.runReceiptId && stable(body.binding) === stable(binding)
          && Date.parse(body.startedAt) >= started && Date.parse(body.endedAt) <= ending) captured.push({ id, body });
      }
      if (!captured.length) throw new Error(roleText.workspace.actualCaptureReceiptsMissing);
    }
    if (!expected.size || !names.length || names.length > 16) throw new Error(roleText.workspace.browserEvidenceMetadataMissing);
    for (const artifact of names) {
      if (artifact.split("/").some(part => !part || part === "." || part === "..") || /[\\:\x00-\x1f]/.test(artifact)) throw new Error(roleText.workspace.browserEvidencePathInvalid);
      const metaPath = artifact + ".meta.json";
      const inWorkspace = artifact.startsWith(evidenceFolder);
      const actual = await ordinaryBytes(view.projectRoot, path.join(view.projectRoot, artifact), 8 * 1024 * 1024);
      if (binding.browserEvidenceSource === "application-browser"
        && (!inWorkspace || !captured.some(item => item.body.screenshots.some(shot => shot.path === artifact && shot.sha256 === digest(actual))))) {
        throw new Error(roleText.workspace.reportScreenshotNotCaptured);
      }
      const metaBytes = await ordinaryBytes(view.projectRoot, path.join(view.projectRoot, metaPath), 32 * 1024);
      const parsed = parseEvidenceMeta(metaBytes.toString("utf8"));
      const meta = readObject(metaBytes);
      const provenance = asObject(meta.acceptanceWorkspace);
      const generated = parsed.ok && Date.parse(parsed.meta.generatedAt);
      if (!actual.length || !parsed.ok || "collection" in parsed.meta || parsed.meta.artifact !== artifact
        || provenance.candidateOid !== binding.basis.candidateOid || provenance.criteriaSha256 !== binding.basis.criteria.sha256
        || provenance.taskId !== pending.taskId || provenance.previewUrl !== receipt.preview.url
        || provenance.turnId !== turnId || generated === false || !Number.isFinite(generated) || generated < started || generated > ending
        || binding.browserEvidenceSource === "application-browser"
          && (provenance.runReceiptId !== workspace.runReceiptId || provenance.proposalDecisionDigest !== binding.proposalDecisionDigest)
        || parsed.meta.sha256 !== digest(actual) || parsed.meta.bytes !== actual.length) throw new Error(roleText.workspace.browserAttachmentBindingMismatch);
      const ids = (parsed.meta.acIds ?? []).filter(id => expected.has(id));
      if (!ids.length) throw new Error(roleText.workspace.browserAttachmentRequirementMissing);
      if (inWorkspace) {
        const leaf = artifact.slice(evidenceFolder.length);
        const mtime = (await lstat(path.join(view.projectRoot, artifact))).mtime;
        const text = actual.toString("utf8").replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
        const lines = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(leaf) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(pending.flowId)
          || leaf === "build-output.log" || leaf === "static-stage.log" || parsed.meta.lines !== lines
          || mtime.getTime() < started - 1_000 || generated < mtime.getTime() - 1_000) {
          throw new Error(roleText.workspace.browserAttachmentMetadataUnverified);
        }
        const published = `docs/verification/${pending.flowId}-${pending.taskId}-${leaf}`;
        const publishedMeta = Buffer.from(JSON.stringify({ ...meta, artifact: published }));
        staged.push({ artifact: published, metaPath: published + ".meta.json", bytes: actual, meta: publishedMeta, ids, mtime });
        artifacts.push({ path: published, sha256: digest(actual) }, { path: published + ".meta.json", sha256: digest(publishedMeta) });
      } else {
        for (const acId of ids) {
          const verified = await checkEvidence({ projectRoot: view.projectRoot, acId, criteria: criteria.doc, artifact, metaPath, scopeRoots: ["docs/verification"] });
          if (!verified.ok || !verified.valid) throw new Error(roleText.workspace.browserAttachmentDigestMismatch);
        }
        artifacts.push({ path: artifact, sha256: digest(actual) }, { path: metaPath, sha256: digest(metaBytes) });
      }
      for (const id of ids) checks.add(id);
      const observation = new Date(generated).toISOString();
      if (observation > observedAt) observedAt = observation;
    }
    if ([...expected].some(id => !checks.has(id))) throw new Error(roleText.workspace.requiredBrowserEvidenceMissing);
    if (captured.length) {
      const timelines = [];
      for (const { id, body } of captured) {
        const log = await ordinaryBytes(view.projectRoot, path.join(view.projectRoot, body.events.path), 64 * 1024);
        if (digest(log) !== body.events.sha256) throw new Error(roleText.workspace.browserInputTimelineChanged);
        timelines.push({ captureReceiptId: id, ...body.events, timeline: readObject(log) });
      }
      // Retain the exact application-produced sequence with the formal evidence, without model-written content.
      const timeline = Buffer.from(JSON.stringify({ kind: "acceptance-browser-timeline", runReceiptId: workspace.runReceiptId, timelines }));
      if (timeline.length > 2 * 1024 * 1024) throw new Error(roleText.workspace.browserInputTimelineLimit);
      const published = `docs/verification/${pending.flowId}-${pending.taskId}-browser-timeline.json`;
      const generated = new Date(ending).toISOString();
      const timelineSha = digest(timeline);
      const meta = Buffer.from(JSON.stringify({ schema: EVIDENCE_META_SCHEMA, artifact: published, sha256: timelineSha,
        bytes: timeline.length, lines: 1, generatedAt: generated, acIds: [...checks].sort(),
        acceptanceWorkspace: { candidateOid: binding.basis.candidateOid, criteriaSha256: binding.basis.criteria.sha256,
          taskId: pending.taskId, previewUrl: receipt.preview.url, turnId, runReceiptId: workspace.runReceiptId, proposalDecisionDigest: binding.proposalDecisionDigest } }));
      if (artifacts.length > 30) throw new Error(roleText.workspace.browserFormalEvidenceLimit);
      staged.push({ artifact: published, metaPath: published + ".meta.json", bytes: timeline, meta, ids: [], mtime: new Date(ending) });
      artifacts.push({ path: published, sha256: timelineSha }, { path: published + ".meta.json", sha256: digest(meta) });
    }
    const effect = effectOf(view, workspace, "acceptance-workspace-evidence", workspace.evidenceKey);
    const claimed = await store.claimEffect(view.ref, effect);
    if (!claimed.ok) return claimed;
    if (!claimed.value.execute) {
      return workspace.browserEvidence && stable(artifacts) === stable(workspace.browserEvidence.artifacts)
        ? { ok: true, value: artifacts } : failure("evidence-unverified", roleText.workspace.reconcileBrowserEvidenceEffect);
    }
    publication = { key: effect.key, token: claimed.value.token };
    if (staged.length) {
      const destination = path.join(view.projectRoot, "docs", "verification");
      if (!directoryIdentity(path.dirname(destination))) throw new Error(roleText.workspace.evidenceParentUnverified);
      await mkdir(destination).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
      if (!directoryIdentity(destination)) throw new Error(roleText.workspace.evidenceDirectoryUnverified);
      for (const item of staged) {
        await publishEvidenceFile(view.projectRoot, path.join(view.projectRoot, item.artifact), item.bytes, item.mtime);
        await publishEvidenceFile(view.projectRoot, path.join(view.projectRoot, item.metaPath), item.meta);
        for (const acId of item.ids) {
          const verified = await checkEvidence({ projectRoot: view.projectRoot, acId, criteria: criteria.doc,
            artifact: item.artifact, metaPath: item.metaPath, scopeRoots: ["docs/verification"] });
          if (!verified.ok || !verified.valid) throw new Error(roleText.workspace.publishedBrowserEvidenceInvalid);
        }
      }
    }
    const evidence: DurableAcceptanceWorkspaceEvidenceReceipt = {
      kind: "acceptance-workspace-browser-evidence", binding, url: receipt.preview.url, observedAt, checks: [...checks].sort(), artifacts,
      ...(captured.length ? { captureReceiptIds: captured.map(item => item.id) } : {}),
    };
    const saved = await recordEffect(store, view, publication, evidence, "Re-read the reported browser artifacts and matching current workspace metadata.");
    return saved.ok ? { ok: true, value: artifacts } : saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : roleText.workspace.acceptanceArtifactsUnverified;
    if (publication) await store.settleEffect(view.ref, { ...publication, outcome: "unknown", evidence: message.slice(0, 240) });
    return failure("evidence-unverified", message);
  }
}
