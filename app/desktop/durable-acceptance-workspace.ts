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
      `当前签发${kind === "criteria" ? "标准" : "架构"}${missing ? "文件缺失" : "无法核验"}。`,
      [{ path: evidence.path, state: missing ? "missing" : "unverified" }]);
  }
  const observedSha256 = digest(bytes);
  if (observedSha256 !== evidence.sha256) throw preparationProblem("material-conflict", "materials", `workspace-${kind}-drifted`,
    `当前签发${kind === "criteria" ? "标准" : "架构"}与原签发摘要不符。`,
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
    reasons.push(`index.html 第 ${diagnosis.nestedNoscriptLine} 行的正文 noscript 含子标签。保留纯文本提示，移除其中的子标签。`);
  }
  if (diagnosis.rejectedScript) {
    const location = diagnosis.rejectedScriptLine === undefined ? "index.html" : `index.html 第 ${diagnosis.rejectedScriptLine} 行`;
    reasons.push(`${location}的脚本未通过当前签发脚本规则。请使用本轮批准的脚本形式和同源路径。`);
  }
  return reasons.length ? reasons.join(" ") : "当前候选的 index.html 无法按签发静态入口安全核验。请核对入口结构、已批准脚本和同源资源。";
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
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes("..") || path.relative(file, await realpath(file))) throw new Error("文件路径不可核验。");
  const before = await lstat(file);
  if (!before.isFile() || before.nlink !== 1 || before.size > limit) throw new Error("文件不是可核验的普通文件。");
  const bytes = await readFile(file);
  const after = await lstat(file);
  if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== bytes.length || after.mtimeMs !== before.mtimeMs
    || after.ctimeMs !== before.ctimeMs) throw new Error("文件在读取期间发生变化。");
  return bytes;
}

function readObject(bytes: Buffer): Record<string, unknown> {
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("无效的 JSON 对象。");
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
  const classic = /(?:普通)?经典脚本|\bclassic\s+(?:JavaScript\s+)?scripts?\b/i;
  if (clauses.some(line => classic.test(line)
    && /(?:禁止|禁用|不得|不能|不允许|不采用|不使用|不加载)[^，,:：]{0,36}(?:经典脚本)|\b(?:no|disallow(?:s|ed)?|reject(?:s|ed)?|without|avoid)\s+(?:same-origin\s+)?classic\s+(?:JavaScript\s+)?scripts?\b/i.test(line))) return false;
  const relative = String.raw`(?:(?:本地|同源)\s*相对(?:路径)?(?:的)?\s*(?:(?:JavaScript|JS)\s*)?脚本|\b(?:local|same-origin)\s+relative(?:[\s-]+path)?\s+(?:JavaScript\s+)?scripts?\b)`;
  const negated = new RegExp(String.raw`(?:禁止|禁用|不得|不能|不允许|不采用|不使用|不加载|不引用|不应|请勿|\b(?:not|no|disallow|avoid|without)\b)[^，,:：]{0,36}${relative}`, "i");
  if (clauses.some(line => negated.test(line))) return false;
  if (/(?:加载|采用|使用)\s*(?:同源)?\s*(?:普通)?经典脚本|\b(?:use[sd]?|load[sd]?|serve[sd]?)\s+(?:same-origin\s+)?classic\s+(?:JavaScript\s+)?scripts?\b/i.test(architecture)) return true;
  const entry = String.raw`^\s*(?:[-*+]\s+)?\x60index\.html\x60(?:\s*[（(][^()（）\x60]{1,80}[）)])?\s*`;
  const label = String.raw`(?:(?:为|是|作为|\bis\b)\s*[^，,\x60]{0,48}(?:入口|\bentry(?:\s+point)?\b)\s*[，,]\s*|[，,：:]\s*)?`;
  const loads = new RegExp(String.raw`${entry}${label}(?:引用|加载|使用|采用|\b(?:loads?|references?|uses?)\b)\s*${relative}`, "i");
  return clauses.some(line => loads.test(line) && !/不是|不作为|已废弃|\b(?:is\s+not|deprecated|obsolete)\b/i.test(line));
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
  if (!view.flowId) return unavailable("当前静态候选缺少可核验的流程地址。", "workspace-flow-unverified", "materials");
  const manifest = input.get("package.json");
  const pkg = manifest ? readObject(manifest) : {};
  const scripts = asObject(pkg.scripts);
  if (["build", "prebuild", "postbuild", "prepare"].some(key => scripts[key] !== undefined)
    || ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundledDependencies", "bundleDependencies", "workspaces"]
      .some(key => pkg[key] !== undefined && (!pkg[key] || typeof pkg[key] !== "object" || Object.keys(pkg[key]!).length))
    || files.some(file => /(?:^|\/)(?:tsconfig|vite\.config\.|webpack\.config\.|rollup\.config\.|babel\.config\.|postcss\.config\.)/i.test(file.path))) {
    return unavailable("获批静态候选含构建脚本、依赖或配置，无法按已签发静态架构准备预览。", "workspace-static-configuration-unsupported", "entry");
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
  if (decision?.kind !== "card-decided") return unavailable("当前静态交付缺少已消费的 A6 批准记录。", "workspace-a6-approval-unverified", "materials");
  const prepared = rows.find(row => row.event.input.kind === "card-prepared" && row.event.input.card.requestId === decision.requestId
    && row.event.input.card.digest === decision.digest && row.event.input.card.generation === decision.generation)?.event.input;
  const architecture = prepared?.kind === "card-prepared" && prepared.card.documents.find(file => architecturePath.test(file.path));
  if (!architecture) return unavailable("当前静态交付缺少 A6 卡绑定的签发架构。", "workspace-architecture-authority-unverified", "materials");
  const architectureBytes = await signedPreparationBytes(view.projectRoot, architecture, 256 * 1024, "architecture");
  const architectureText = architectureBytes.toString("utf8");
  if (!/\b(?:browser|WebGL)\b|浏览器/i.test(architectureText)) return unavailable("签发架构未声明浏览器交付。");
  const declaredPaths = [...architectureText.matchAll(/\x60([a-zA-Z0-9_][a-zA-Z0-9_./-]*)\x60/g)].map(match => match[1]);
  if (!index?.length || index.length > 512 * 1024) {
    if (view.acceptanceWorkspace?.preparationGate && declaredPaths.includes("index.html")) {
      throw preparationProblem("candidate-defect", "entry", index ? "static-entry-size-invalid" : "static-entry-missing",
        index ? "签发静态入口为空或超出预览大小限制。" : "当前候选缺少签发架构指定的 index.html。",
        [{ path: "index.html", state: index ? "present" : "missing" }]);
    }
    return unavailable("当前静态候选缺少可核验的 index.html 入口或入口超出大小限制。");
  }
  if (!declaredPaths.includes("index.html")) return unavailable("签发架构未声明 index.html 入口。");
  const selected = files.filter(file => file.path === "index.html" || (
    /\.(?:m?js|css|png|jpe?g|svg|webp|ico|woff2?|wasm|mp3|ogg|wav)$/i.test(file.path)
    && file.path.split("/").every(segment => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(segment)
      && !/^(?:docs?|tools?|scripts?|tests?|__tests__|fixtures?|server|configs?|node_modules|env|private|secrets?|credentials?)(?:$|[._-])/i.test(segment)
      && !/\.(?:test|spec|config|secret|private|credential)\./i.test(segment))
    && declaredPaths.some(allowed => allowed.endsWith("/") ? file.path.startsWith(allowed) : file.path === allowed)
  ));
  const selectedNames = new Set(selected.map(file => file.path));
  if (selected.length > 256 || selected.reduce((total, file) => total + file.bytes.length, 0) > maxOutputBytes) {
    return unavailable("获批静态资源超出应用验收文件数量或大小限制。");
  }
  const approvedClassic = staticChosen && selection?.requestId === decision.requestId && selection.digest === decision.digest
    && selection.generation === decision.generation && selection.authority === decision.authority
    && stable(selection.values) === stable(decision.decisionValues) && prepared?.kind === "card-prepared"
    && prepared.card.documents.some(file => stable(file) === stable(selection.proposal)) && authorizesClassicEntry(architectureText);
  const parsedCriteria = approvedClassic ? parseCriteriaText(criteria, { flowId: view.flowId, fileName: path.basename(criteriaPath) }) : undefined;
  const classicEligible = !!parsedCriteria?.ok && parsedCriteria.doc.status === "final"
    && /\b(?:browser|playwright|screenshot)\b|浏览器|实操|截图/i.test(criteria);
  const diagnosis: StaticEntryDiagnosis = {};
  const scriptsVerified = (() => { try { return verifiedHtmlScripts(index, selectedNames, classicEligible, diagnosis); } catch { return undefined; } })();
  if (!scriptsVerified) {
    if (view.acceptanceWorkspace?.preparationGate) throw preparationProblem("candidate-defect", "entry", "static-entry-rejected",
      staticEntryRejection(diagnosis), [{ path: "index.html", state: "present" }]);
    return unavailable(classicEligible ? "当前静态入口含未获准的脚本路径、启动段或执行属性，无法核验同源预览。"
      : "当前静态入口无法按原模块合同核验。经典脚本须匹配本次 A6 的静态决定、签发架构和正式浏览器验收标准。");
  }
  const readme = input.get("README.md")?.toString("utf8") ?? "";
  const launch = typeof scripts.start === "string" ? scripts.start.trim() : readme.match(/\bnode [a-zA-Z0-9_./-]+\.m?js\b/)?.[0];
  const deliveryStartup = launch && launch.length <= 120 && !/[\x00-\x1f]/.test(launch) ? launch : undefined;
  const requirements: StaticRequirements = {
    build: view.verificationPlan ? view.verificationPlan.requirements.some(item => item.stage === "A12b" && item.capability === "workspace-build")
      : /\b(?:npm run|pnpm(?: run)?|yarn(?: run)?)\s+build\b|\b(?:must|required to|run (?:the )?|execute (?:the )?)(?:\s+\w+){0,3}\s+(?:compile|build)(?:\s+(?:command|script))?\b|(?:须|必须|要求|实际|执行|运行)[^。；\n]{0,16}(?:构建|编译)(?:命令|脚本|产物|成功|后|[，。；\n])/im.test(criteria),
    requireDeliveryStartup: /(?:按|依照|依照上述)[^。；\n]{0,24}(?:交付说明|README|启动说明)[^。；\n]{0,28}(?:启动|执行)|(?:执行|运行|记录|实际)[^。；\n]{0,12}(?:启动命令|交付启动器)|\b(?:run|execute|verify|record)\s+(?:the\s+)?(?:documented|delivery|README|startup|launch)\s+(?:start(?:up)?\s+)?(?:command|launcher|script)\b/i.test(criteria),
    requireLogicTest: /(?:执行|运行)[^。；\n]{0,18}(?:测试命令|规则测试|逻辑测试)|\b(?:npm test|node --test)\b|\b(?:run|execute)\s+(?:(?:the|delivered|logic|rule|automated)\s+){0,3}tests?\s+command\b/i.test(criteria),
    ...(deliveryStartup ? { deliveryStartup } : {}),
  };
  return { files: selected, requirements, classic: scriptsVerified.classic };
}

function assertSupported(files: readonly AcceptanceWorkspaceCandidateFile[]): boolean {
  const inputs = new Map(files.map(file => [file.path, file.bytes]));
  const manifest = inputs.get("package.json");
  if (!manifest) throw new Error("缺少已跟踪的依赖清单。");
  const scripts = asObject(readObject(manifest).scripts);
  const build = typeof scripts.build === "string" ? scripts.build.trim() : "";
  const typescript = /^tsc[ \t]+--noEmit[ \t]+&&[ \t]+vite[ \t]+build$/.test(build);
  if (!typescript && !/^vite[ \t]+build$/.test(build) || scripts.prebuild !== undefined || scripts.postbuild !== undefined
    || !inputs.has("index.html") || [...inputs.keys()].some(file => /(?:^|\/)(?:vite\.config\.|\.env(?:\.|$)|\.npmrc$|postcss\.config\.|\.postcssrc)/i.test(file))) {
    throw new Error("候选包含应用工作区无法核验的构建脚本、配置或缺失入口。");
  }
  if (typescript) {
    const tsconfig = inputs.get("tsconfig.json");
    if (!tsconfig) throw new Error("缺少已跟踪的 TypeScript 项目配置。");
    const data = readObject(tsconfig);
    const compiler = asObject(data.compilerOptions);
    if (data.extends !== undefined || data.references !== undefined || ["plugins", "paths", "rootDirs", "rootDir", "typeRoots", "baseUrl", "outFile",
      "outDir", "tsBuildInfoFile", "generateTrace", "generateCpuProfile", "declarationDir"].some(key => Object.hasOwn(compiler, key))) {
      throw new Error("当前 TypeScript 配置含未支持的外部输入、插件或输出。");
    }
    for (const key of ["include", "exclude", "files"]) {
      const values = data[key];
      if (values !== undefined && (!Array.isArray(values) || values.some(item => typeof item !== "string" || path.isAbsolute(item)
        || item.split(/[\\/]/).includes("..")))) throw new Error("TypeScript 读取范围无法核验。");
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
  if (!approved.ok || approved.value.sha256 !== basis.criteria.sha256) throw new Error("当前独立验收标准已变化。");
  return git.value;
}

async function readWorkspaceCriteria(binding: Pick<DurableAcceptanceWorkspaceBinding, "projectRoot" | "basis">): Promise<string> {
  const bytes = await ordinaryBytes(binding.projectRoot, path.join(binding.projectRoot, binding.basis.criteria.path), 256 * 1024);
  if (digest(bytes) !== binding.basis.criteria.sha256) throw new Error("当前独立验收标准已变化。");
  return bytes.toString("utf8");
}

async function readRegistration(binding: DurableAcceptanceWorkspaceBinding): Promise<WorkspaceRegistration> {
  const { workspaceRoot, inputRoot, outputRoot, evidenceRoot, launcherPath } = binding;
  if (!sameIdentity(directoryIdentity(workspaceRoot), binding.workspaceIdentity)) throw new Error("验收工作区目录标识已变化。");
  const file = path.join(workspaceRoot, registeredFile);
  const value = JSON.parse((await ordinaryBytes(workspaceRoot, file, 64 * 1024)).toString("utf8")) as WorkspaceRegistration;
  if (stable(value.binding) !== stable(binding) || !sameIdentity(directoryIdentity(inputRoot), value.inputIdentity)
    || !sameIdentity(directoryIdentity(outputRoot), value.outputIdentity) || !sameIdentity(directoryIdentity(evidenceRoot), value.evidenceIdentity)
    || digest(await ordinaryBytes(workspaceRoot, launcherPath, 96 * 1024)) !== binding.launcherSha256
    || (binding.operation !== "static" && (await ordinaryBytes(workspaceRoot, path.join(workspaceRoot, configFile), 2048)).toString("utf8") !== buildConfig)) {
    throw new Error("验收工作区路径、配置或任务绑定已变化。");
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
  return `\n按本次签发标准逐条只读审计已登记证据。候选 ${audit.basis.candidateOid}，证据代次 ${audit.basis.generation}。不得执行、取证或写入。使用 submit_report 的 evidence 逐条填写 JSON {"requirementId":"条目","evidenceIds":["账本记录 ID"]}；缺项须在结论中明确。\n${records}\n`;
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
    return { hold: !current(), text: "\n仅核对原账本已有工作区、取证与关闭回执。\n" };
  } catch {
    return { hold: true };
  }
}

async function readBuiltOutput(outputRoot: string): Promise<StaticOutput> {
  if (!directoryIdentity(outputRoot)) throw new Error("构建输出目录无法核验。");
  const files = new Map<string, Buffer>();
  const directories = [""];
  let remaining = maxOutputBytes;
  for (const dir of directories) {
    const location = path.join(outputRoot, dir);
    if (!directoryIdentity(location)) throw new Error("构建目录含重解析路径。");
    for (const entry of await readdir(location, { withFileTypes: true })) {
      const name = dir ? `${dir}/${entry.name}` : entry.name;
      if (directories.length + files.size > 2_000 || /[\\\x00-\x1f:]/.test(name)) throw new Error("构建输出超出预览范围。");
      if (entry.isDirectory()) directories.push(name);
      else {
        const bytes = await ordinaryBytes(outputRoot, path.join(outputRoot, name), remaining);
        remaining -= bytes.length;
        files.set(name, bytes);
      }
    }
  }
  const index = files.get("index.html");
  if (!index?.length) throw new Error("构建没有生成可供静态预览的入口。");
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
      || digest(staticRunner(binding, selected, registration)) !== binding.launcherSha256) throw new Error("静态输入与原批准架构或准备范围不一致。");
    files = selected.files;
    classic = selected.classic;
  } else if ((registration.dependencyProof && registration.dependenciesSha256 !== registration.dependencyProof.sha256)
    || digest(runnerSource(binding, assertSupported(candidate), registration.dependencyProof)) !== binding.launcherSha256) {
    throw new Error("工作区依赖来源身份与原绑定不一致。");
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
          throw new Error("验收工作区输入与原候选不一致。");
        }
        seen++;
      }
    }
  }
  if (seen !== files.length || (binding.operation !== "static"
    && (await inspectAcceptanceDependencies(binding.inputRoot)) !== registration.dependenciesSha256)) {
    throw new Error("验收输入或工具链与原绑定不一致。");
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
  return failure("close-receipt-missing", "冻结标准所需的原验收工作区关闭回执缺失，等待按原流程处置。");
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
      || !(await ordinaryBytes(root, file, content.length)).equals(content)) throw new Error("证据位置已有其他内容，不能覆盖。");
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
    return failure("evidence-unverified", "当前正式报告缺少同一实际回合的工作区操作与预览回执。");
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
        || stable(actualOutput) !== stable(receipt.stage.files)) throw new Error("实际验收静态文件已变化。");
    } else if (output.sha256 !== receipt.build.outputSha256) throw new Error("实际验收产物已变化。");
    if (output.entrySha256 !== receiptOperation(receipt).entrySha256) throw new Error("实际验收入口已变化。");
    if (!binding.requiresBrowserEvidence) return { ok: true, value: [] };
    const text = await ordinaryBytes(view.projectRoot, path.join(view.projectRoot, binding.basis.criteria.path), 256 * 1024);
    const criteria = parseCriteriaText(text.toString("utf8"), { flowId: pending.flowId, fileName: path.basename(binding.basis.criteria.path) });
    if (!criteria.ok) throw new Error("当前标准的浏览器验收条目无法解析。");
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
      if (!captured.length) throw new Error("当前正式验收缺少应用浏览器产生的实际操作及截图回执。");
    }
    if (!expected.size || !names.length || names.length > 16) throw new Error("当前报告缺少实际浏览器取证文件及对应元数据。");
    for (const artifact of names) {
      if (artifact.split("/").some(part => !part || part === "." || part === "..") || /[\\:\x00-\x1f]/.test(artifact)) throw new Error("浏览器证据路径不合法。");
      const metaPath = artifact + ".meta.json";
      const inWorkspace = artifact.startsWith(evidenceFolder);
      const actual = await ordinaryBytes(view.projectRoot, path.join(view.projectRoot, artifact), 8 * 1024 * 1024);
      if (binding.browserEvidenceSource === "application-browser"
        && (!inWorkspace || !captured.some(item => item.body.screenshots.some(shot => shot.path === artifact && shot.sha256 === digest(actual))))) {
        throw new Error("正式报告所列截图缺少本次应用浏览器的真实捕获。");
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
        || parsed.meta.sha256 !== digest(actual) || parsed.meta.bytes !== actual.length) throw new Error("浏览器附件元数据与本任务、候选或预览不匹配。");
      const ids = (parsed.meta.acIds ?? []).filter(id => expected.has(id));
      if (!ids.length) throw new Error("浏览器附件未关联当前标准要求实操的验收条目。");
      if (inWorkspace) {
        const leaf = artifact.slice(evidenceFolder.length);
        const mtime = (await lstat(path.join(view.projectRoot, artifact))).mtime;
        const text = actual.toString("utf8").replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
        const lines = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(leaf) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(pending.flowId)
          || leaf === "build-output.log" || leaf === "static-stage.log" || parsed.meta.lines !== lines
          || mtime.getTime() < started - 1_000 || generated < mtime.getTime() - 1_000) {
          throw new Error("本任务浏览器附件名称、实际时间或行数无法核对。");
        }
        const published = `docs/verification/${pending.flowId}-${pending.taskId}-${leaf}`;
        const publishedMeta = Buffer.from(JSON.stringify({ ...meta, artifact: published }));
        staged.push({ artifact: published, metaPath: published + ".meta.json", bytes: actual, meta: publishedMeta, ids, mtime });
        artifacts.push({ path: published, sha256: digest(actual) }, { path: published + ".meta.json", sha256: digest(publishedMeta) });
      } else {
        for (const acId of ids) {
          const verified = await checkEvidence({ projectRoot: view.projectRoot, acId, criteria: criteria.doc, artifact, metaPath, scopeRoots: ["docs/verification"] });
          if (!verified.ok || !verified.valid) throw new Error("浏览器附件的实际内容与证据 metadata 不一致。");
        }
        artifacts.push({ path: artifact, sha256: digest(actual) }, { path: metaPath, sha256: digest(metaBytes) });
      }
      for (const id of ids) checks.add(id);
      const observation = new Date(generated).toISOString();
      if (observation > observedAt) observedAt = observation;
    }
    if ([...expected].some(id => !checks.has(id))) throw new Error("当前正式报告缺少部分规定条目的浏览器取证。");
    if (captured.length) {
      const timelines = [];
      for (const { id, body } of captured) {
        const log = await ordinaryBytes(view.projectRoot, path.join(view.projectRoot, body.events.path), 64 * 1024);
        if (digest(log) !== body.events.sha256) throw new Error("实际浏览器输入时间序列已变化。");
        timelines.push({ captureReceiptId: id, ...body.events, timeline: readObject(log) });
      }
      // Retain the exact application-produced sequence with the formal evidence, without model-written content.
      const timeline = Buffer.from(JSON.stringify({ kind: "acceptance-browser-timeline", runReceiptId: workspace.runReceiptId, timelines }));
      if (timeline.length > 2 * 1024 * 1024) throw new Error("实际浏览器输入时间序列超出有界证据范围。");
      const published = `docs/verification/${pending.flowId}-${pending.taskId}-browser-timeline.json`;
      const generated = new Date(ending).toISOString();
      const timelineSha = digest(timeline);
      const meta = Buffer.from(JSON.stringify({ schema: EVIDENCE_META_SCHEMA, artifact: published, sha256: timelineSha,
        bytes: timeline.length, lines: 1, generatedAt: generated, acIds: [...checks].sort(),
        acceptanceWorkspace: { candidateOid: binding.basis.candidateOid, criteriaSha256: binding.basis.criteria.sha256,
          taskId: pending.taskId, previewUrl: receipt.preview.url, turnId, runReceiptId: workspace.runReceiptId, proposalDecisionDigest: binding.proposalDecisionDigest } }));
      if (artifacts.length > 30) throw new Error("截图与实际浏览器时间序列超出正式证据范围。");
      staged.push({ artifact: published, metaPath: published + ".meta.json", bytes: timeline, meta, ids: [], mtime: new Date(ending) });
      artifacts.push({ path: published, sha256: timelineSha }, { path: published + ".meta.json", sha256: digest(meta) });
    }
    const effect = effectOf(view, workspace, "acceptance-workspace-evidence", workspace.evidenceKey);
    const claimed = await store.claimEffect(view.ref, effect);
    if (!claimed.ok) return claimed;
    if (!claimed.value.execute) {
      return workspace.browserEvidence && stable(artifacts) === stable(workspace.browserEvidence.artifacts)
        ? { ok: true, value: artifacts } : failure("evidence-unverified", "原浏览器证据作用需要核对。");
    }
    publication = { key: effect.key, token: claimed.value.token };
    if (staged.length) {
      const destination = path.join(view.projectRoot, "docs", "verification");
      if (!directoryIdentity(path.dirname(destination))) throw new Error("项目取证目录的上层路径无法核对。");
      await mkdir(destination).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
      if (!directoryIdentity(destination)) throw new Error("项目取证目录无法核对。");
      for (const item of staged) {
        await publishEvidenceFile(view.projectRoot, path.join(view.projectRoot, item.artifact), item.bytes, item.mtime);
        await publishEvidenceFile(view.projectRoot, path.join(view.projectRoot, item.metaPath), item.meta);
        for (const acId of item.ids) {
          const verified = await checkEvidence({ projectRoot: view.projectRoot, acId, criteria: criteria.doc,
            artifact: item.artifact, metaPath: item.metaPath, scopeRoots: ["docs/verification"] });
          if (!verified.ok || !verified.valid) throw new Error("已发布浏览器附件未通过原证据合同。");
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
    const message = error instanceof Error ? error.message : "当前验收工件无法核对。";
    if (publication) await store.settleEffect(view.ref, { ...publication, outcome: "unknown", evidence: message.slice(0, 240) });
    return failure("evidence-unverified", message);
  }
}
