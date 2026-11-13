// B7 open.ts 生成器：open/openInternal 逐字搬移 + openInternalUnsafe 连续块 builder 分解。
// 规则（记录在 change 文档 §builder 分解）：
//  - 主流程保留原 1986–1993 校验段 + 顺序调用 8 个 builder；
//  - 每个 builder 为**连续代码块**（原行范围见 BLOCKS），块内语句顺序/条件逐字保留；
//  - 跨块局部变量提升为单一显式上下文对象 ctx（OpenContext；同一对象，无第二份状态）；
//  - 局部声明行 `const/let NAME ... =` → `ctx.NAME ... =`；后续标识符引用 → `ctx.NAME`（跳过属性访问/字符串/注释/对象键）。
// 例外：B6 的 `handle` 保持局部（其内部 chiefDecision 闭包另有同名局部 handle，不能混同），块尾补 `ctx.handle = handle;`；
//       `const manager = this` → `const manager = this.host`（下载 presenter 回调门面方法）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const SESSION = path.join(root, "app/desktop/session.ts");
const OUT_DIR = path.join(root, "app/desktop/session/lifecycle");
const text = fs.readFileSync(SESSION, "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const data = JSON.parse(fs.readFileSync(path.join(HERE, "methods-current.json"), "utf8"));
const byName = new Map(data.members.filter((m) => !m.isField).map((m) => [m.name, m]));

const MAIN_FIELDS = ["req", "userInitiated", "selectionVersion", "internalReopen", "lifecycle", "key", "stopped", "stoppedResult"];
const BLOCKS = [
  { name: "resolveWorkflowMode", start: 1994, end: 2060, declares: ["forcedSessionWorkflowMode", "requestedSessionMode", "requestedAssignment"], available: [] },
  { name: "reuseOrRebindEntry", start: 2061, end: 2134, declares: ["listing", "role"], available: ["forcedSessionWorkflowMode", "requestedSessionMode", "requestedAssignment"] },
  { name: "loadAuthorization", start: 2136, end: 2193, declares: ["project", "config", "boundary", "gitBinding", "currentGitRuntime", "routineShellPolicy"], available: ["listing", "role", "requestedSessionMode"] },
  { name: "assembleGovernanceCapabilities", start: 2195, end: 2301, declares: ["governanceModel", "governanceFunction", "sessionWorkflowMode", "legacyOnlyCapabilitiesAllowed", "legacyBuiltIn", "canSchedule", "canNominate", "customerInput", "writeBoundary", "mirrorRoleIdFor", "canDispatch", "dispatchBinding", "planBinding", "dispatchTask", "viewImage", "canInitiateRequirementChange", "canPresentAppRunChange", "versionChangeStack", "direct", "closeCreatedTask", "closeCreatedTaskFixed"], available: ["requestedSessionMode", "project", "role", "config"] },
  { name: "assembleProjectCapabilities", start: 2303, end: 2542, declares: ["submitVersionChangeCapability", "submitRefactorCapability", "reportPlanEscalationCapability", "requestStableWriteCapability", "requestRequirementChange", "roleStatus", "contractCheck", "docFormat", "evidenceCheck", "sessionTail", "roleActivityLog", "terminateRoleRun", "redispatchTaskCapability", "projectStateCapability", "projectNoteCapability", "requestVersionDecisionCapability", "installationBinding", "installSkill", "uninstallSkill", "installMcp", "uninstallMcp", "interactionState", "shellOperatorChannel", "shellArming", "shellEscalationPresenter", "shellOperatorOnly"], available: ["role", "project", "governanceFunction", "legacyBuiltIn", "canNominate", "versionChangeStack", "direct", "canInitiateRequirementChange", "requestRequirementChange", "customerInput", "sessionWorkflowMode"] },
  { name: "assembleToolSurface", start: 2543, end: 2956, declares: ["profileRevision", "shellJudge", "governanceJudge", "downloadRuntime", "buildCustomerInputContext"], available: ["req", "project", "role", "boundary", "governanceModel", "governanceFunction", "sessionWorkflowMode", "legacyOnlyCapabilitiesAllowed", "customerInput", "writeBoundary", "mirrorRoleIdFor", "dispatchTask", "viewImage", "canPresentAppRunChange", "versionChangeStack", "direct", "closeCreatedTask", "closeCreatedTaskFixed", "submitVersionChangeCapability", "submitRefactorCapability", "reportPlanEscalationCapability", "requestStableWriteCapability", "requestRequirementChange", "roleStatus", "contractCheck", "docFormat", "evidenceCheck", "sessionTail", "roleActivityLog", "terminateRoleRun", "redispatchTaskCapability", "projectStateCapability", "projectNoteCapability", "requestVersionDecisionCapability", "installationBinding", "installSkill", "uninstallSkill", "installMcp", "uninstallMcp", "interactionState", "shellOperatorChannel", "shellArming", "shellEscalationPresenter", "shellOperatorOnly", "gitBinding", "planBinding", "routineShellPolicy", "dispatchBinding", "currentGitRuntime", "stopped", "stoppedResult"] },
  { name: "freezeBindings", start: 2958, end: 2980, declares: ["boundaryPaths", "boundaryPrints", "skillPaths"], available: ["stopped", "stoppedResult", "handle", "req", "role", "project"] },
  { name: "postOpenWiring", start: 2982, end: 3063, declares: [], available: ["req", "userInitiated", "selectionVersion", "key", "stopped", "stoppedResult", "role", "project", "config", "requestedAssignment", "governanceModel", "governanceFunction", "sessionWorkflowMode", "customerInput", "canPresentAppRunChange", "versionChangeStack", "interactionState", "profileRevision", "shellJudge", "governanceJudge", "downloadRuntime", "buildCustomerInputContext", "canSchedule", "handle", "boundaryPaths", "boundaryPrints", "skillPaths"] },
];
const ASYNC_BLOCKS = new Set(["resolveWorkflowMode", "reuseOrRebindEntry", "loadAuthorization", "assembleGovernanceCapabilities", "assembleToolSurface", "freezeBindings", "postOpenWiring"]);
const RETURN_BLOCKS = new Set(["resolveWorkflowMode", "reuseOrRebindEntry", "loadAuthorization", "assembleToolSurface", "freezeBindings", "postOpenWiring"]);

// ——— 词法替换：把可提升的标识符改写为 ctx.<name>（跳过字符串/注释/属性访问/对象键） ———
function replaceIdents(src, names) {
  const out = [];
  const stack = [{ kind: "code", expr: false }];
  const closers = [];
  let i = 0;
  let lastSignificant = "";
  const push = (s) => { out.push(s); for (let k = s.length - 1; k >= 0; k -= 1) { if (!/\s/.test(s[k])) { lastSignificant = s[k]; break; } } };
  while (i < src.length) {
    const ch = src[i], next = src[i + 1];
    const top = stack[stack.length - 1];
    if (top.kind === "template") {
      if (ch === "\\") { push(src.slice(i, i + 2)); i += 2; continue; }
      if (ch === "`") { stack.pop(); push(ch); i += 1; continue; }
      if (ch === "$" && next === "{") { stack.push({ kind: "code", expr: true }); push("${"); i += 2; continue; }
      push(ch); i += 1; continue;
    }
    if (ch === "/" && next === "/") { let j = src.indexOf("\n", i); if (j < 0) j = src.length; push(src.slice(i, j)); i = j; continue; }
    if (ch === "/" && next === "*") { let j = src.indexOf("*/", i + 2); j = j < 0 ? src.length : j + 2; push(src.slice(i, j)); i = j; continue; }
    if (ch === "'" || ch === '"') {
      const q = ch; let j = i + 1;
      while (j < src.length && src[j] !== q) { if (src[j] === "\\") j += 1; j += 1; }
      push(src.slice(i, j + 1)); i = j + 1; continue;
    }
    if (ch === "`") { stack.push({ kind: "template" }); push(ch); i += 1; continue; }
    if (top.expr && ch === "}") { stack.pop(); push(ch); i += 1; continue; }
    if (ch === "{") { closers.push("}"); push(ch); i += 1; continue; }
    if (ch === "(") { closers.push(")"); push(ch); i += 1; continue; }
    if (ch === "[") { closers.push("]"); push(ch); i += 1; continue; }
    if (ch === "}" || ch === ")" || ch === "]") { if (closers[closers.length - 1] === ch) closers.pop(); push(ch); i += 1; continue; }
    if (/[A-Za-z_$]/.test(ch) && !/[\w$]/.test(src[i - 1] ?? "")) {
      let j = i + 1;
      while (j < src.length && /[\w$]/.test(src[j])) j += 1;
      const id = src.slice(i, j);
      // 对象键（后面紧跟冒号）不改写；属性访问（前一个有效字符是 .）不改写
      let k = j;
      while (k < src.length && /[ \t]/.test(src[k])) k += 1;
      const nextChar = src[k];
      const isKey = nextChar === ":";
      const afterDot = lastSignificant === "." || (lastSignificant === "?" && out.join("").endsWith("?."));
      if (names.has(id) && !isKey && !afterDot) {
        // 对象字面量 shorthand（`{ X, ... }` / `{ X }`）→ `X: ctx.X`（保持对象值语义）
        const inObject = closers[closers.length - 1] === "}";
        const prevPropPos = lastSignificant === "{" || lastSignificant === ",";
        const nextPropEnd = nextChar === "," || nextChar === "}";
        if (inObject && prevPropPos && nextPropEnd) push(`${id}: ctx.${id}`);
        else push("ctx." + id);
      } else push(id);
      i = j; continue;
    }
    push(ch); i += 1;
  }
  return out.join("");
}

function liftDeclarations(blockSrc, names) {
  let out = blockSrc;
  for (const name of names) {
    const esc = name.replace(/\$/g, "\\$");
    const declRe = new RegExp(`^    (const|let) ${esc}\\b[^\\n]*`, "m");
    const m = declRe.exec(out);
    if (!m) continue;
    const line = m[0];
    const lineStart = m.index;
    const lineEnd = lineStart + line.length;
    if (/=\s*$/.test(line) || /=\s+\S/.test(line)) {
      const init = line.slice(line.indexOf("="));
      out = out.slice(0, lineStart) + `    ctx.${name} ${init}` + out.slice(lineEnd);
    } else {
      out = out.slice(0, lineStart) + `    ctx.${name} = undefined;` + out.slice(lineEnd);
    }
  }
  return out;
}

function blockSource(b) { return lines.slice(b.start - 1, b.end).join("\n"); }

// ——— 生成 builder 方法 ———
function buildBlockMethod(b) {
  // builder 入口：把 ctx 上的**同一批字段**解构为同名局部 const（原方法作用域的等价视图；
  // 仅引用/值别名，不复制任何可变状态），随后**逐字**执行原连续块，块尾把本块产出的变量写回 ctx。
  const src = blockSource(b);
  const aliasNames = [...new Set([...MAIN_FIELDS, ...b.available])].filter((n) => !b.declares.includes(n));
  const head = `    const { ${aliasNames.join(", ")} } = ctx;`;
  const tailLines = b.declares.map((n) => `    ctx.${n} = ${n};`);
  let blockText = src.replace("const manager = this;", "const manager = this.host;");
  // 例外（逐行等价论证记录在案）：B5 的 terminateRoleRun 闭包按原语义读取**外层** handle（B6 成功开会话后
  // 才赋值；闭包运行期读取）——别名会把入口值（undefined）定格，故此处保留 ctx.handle 的运行期读取。
  if (b.name === "assembleProjectCapabilities") blockText = blockText.replace("caller.handle === handle", "caller.handle === ctx.handle");
  return `${head}\n${blockText}${tailLines.length ? "\n" + tailLines.join("\n") : ""}`;
}

// ——— 组装 open.ts ———
const openMethods = ["open", "openInternal"].map((n) => {
  const m = byName.get(n);
  const t = lines.slice(m.startLine - 1, m.endLine).join("\n").replace(/^(  )private /, "$1");
  return `  // —— ${n}（B7 自 session.ts 逐字搬移）——\n${t}`;
}).join("\n\n");

const builderTexts = [];
for (const b of BLOCKS) {
  const asyncKw = ASYNC_BLOCKS.has(b.name) ? "async " : "";
  const ret = b.name === "postOpenWiring" ? "Promise<OpenResult>" : RETURN_BLOCKS.has(b.name) ? "Promise<OpenResult | undefined>" : (ASYNC_BLOCKS.has(b.name) ? "Promise<void>" : "void");
  let body = buildBlockMethod(b);
  if (b.name === "assembleToolSurface") {
    // 局部 handle（其内部 chiefDecision 闭包另有同名局部，不能提升）→ 成功路径末尾交给 ctx。
    body += "\n    ctx.handle = handle;";
  }
  builderTexts.push(`  /** ${b.name}：openInternalUnsafe 连续块（源 ${b.start}–${b.end}；映射见 change 记录）。 */\n  private ${asyncKw}${b.name}(ctx: OpenContext): ${ret} {\n${body}\n  }`);
}

const mainBody = `  async openInternalUnsafe(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion, internalReopen = false,
    lifecycle = this.deliveryLifecycle(this.sessionKey(req.projectRoot, req.roleId, req.runtime))): Promise<OpenResult> {
${lines.slice(1985, 1993).join("\n")}
    const ctx = {
      req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult,
    } as OpenContext;
    const workflow = await this.resolveWorkflowMode(ctx);
    if (workflow !== undefined) return workflow;
    const reuse = await this.reuseOrRebindEntry(ctx);
    if (reuse !== undefined) return reuse;
    const authorization = await this.loadAuthorization(ctx);
    if (authorization !== undefined) return authorization;
    await this.assembleGovernanceCapabilities(ctx);
    this.assembleProjectCapabilities(ctx);
    const surface = await this.assembleToolSurface(ctx);
    if (surface !== undefined) return surface;
    const frozen = await this.freezeBindings(ctx);
    if (frozen !== undefined) return frozen;
    return await this.postOpenWiring(ctx);
  }`;

const body = `${openMethods}

  // —— openInternalUnsafe（B7 builder 分解；主流程 1986–1993 + 8 连续块）——
${mainBody}

${builderTexts.join("\n\n")}`;

// ——— 宿主需要的方法/状态（open/openInternal 原文 + builder 生成文） ———
const thisIds = new Set([...body.matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
thisIds.delete("deps");
const STATE_ACCESSORS = JSON.parse(fs.readFileSync(path.join(HERE, "state-accessors.json"), "utf8"));
const localMethods = new Set(["open", "openInternal", "openInternalUnsafe", "host", ...BLOCKS.map((b) => b.name)]);
const accessors = [];
for (const name of [...thisIds].sort()) {
  const def = STATE_ACCESSORS[name];
  if (!def) continue;
  if (def.mutable && new RegExp(`this\\.${name}\\s*=[^=]|(?:\\+\\+|--)\\s*this\\.${name}\\b`).test(body)) {
    accessors.push(`  private get ${name}(): ${def.type} { return this.host.${name}; }`);
    accessors.push(`  private set ${name}(value: ${def.type}) { this.host.${name} = value; }`);
  } else {
    accessors.push(`  private get ${name}(): ${def.type} { return this.host.${name}; }`);
  }
}
const wrappers = [];
for (const name of [...thisIds].sort()) {
  if (STATE_ACCESSORS[name] || localMethods.has(name)) continue;
  wrappers.push(`  private ${name}(...args: Parameters<LifecycleHost["${name}"]>): ReturnType<LifecycleHost["${name}"]> { return this.host.${name}(...args); }`);
}

// ——— imports（与 generate-lifecycle 同规则：从 session.ts 导入表选入并 rebase） ———
function parseImports(source) {
  const out = [];
  const starts = [];
  const re = /(^|[;\n])[ \t]*import\b/g;
  let m;
  while ((m = re.exec(source)) !== null) starts.push(m.index + (m[1] ? 1 : 0));
  for (const start of starts) {
    let j = start;
    for (; j < source.length; j += 1) {
      const ch = source[j];
      if (ch === '"') { j += 1; while (j < source.length && source[j] !== '"') { if (source[j] === "\\") j += 1; j += 1; } continue; }
      if (ch === ";") break;
    }
    const stmt = source.slice(start, j + 1);
    const specMatch = /from\s+"([^"]+)"/.exec(stmt);
    if (!specMatch) continue;
    const clause = stmt.slice(0, stmt.indexOf("from"));
    const names = new Set();
    const braced = /\{([\s\S]*?)\}/.exec(clause);
    if (braced) for (const part of braced[1].split(",")) {
      const t = part.trim().replace(/^type\s+/, "");
      if (!t) continue;
      const asMatch = /\bas\s+([A-Za-z_$][\w$]*)/.exec(t);
      names.add(asMatch ? asMatch[1] : t.replace(/^[A-Za-z_$][\w$]*\s+/, "").trim());
    }
    const defaultMatch = /^\s*import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/.exec(stmt);
    if (defaultMatch && defaultMatch[1] !== "type") names.add(defaultMatch[1]);
    out.push({ stmt, spec: specMatch[1], names });
  }
  return out;
}
const SESSION_IMPORTS = parseImports(text);
function rebaseSpec(spec) {
  if (!spec.startsWith(".")) return spec;
  const abs = path.resolve(path.join(root, "app/desktop"), spec);
  let rel = path.relative(OUT_DIR, abs).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}
const WHITELIST = ["contracts", "shared", "delivery", "session-env", "tasks", "evidence", "git-ports"];
function allowed(spec) {
  if (!spec.startsWith(".")) return true;
  if (!spec.startsWith("../")) return true;
  if (spec.startsWith("../../")) return true;
  if (spec.startsWith("../contracts/") || spec.startsWith("../shared/")) return true;
  return WHITELIST.some((e) => spec === `../${e}.ts` || spec.startsWith(`../${e}/`));
}
function importBlock(bodyText, always) {
  const selected = [];
  const importedNames = new Set();
  const seenStmts = new Set();
  for (const imp of SESSION_IMPORTS) {
    let hit = false;
    for (const n of imp.names) {
      if (n === "SessionManager") continue;
      if (new RegExp(`(^|[^\\w$.])${n.replace(/\$/g, "\\$")}(?![\\w$])`).test(bodyText)) { hit = true; break; }
    }
    if (!hit) continue;
    const spec = rebaseSpec(imp.spec);
    if (!allowed(spec)) continue;
    if (imp.names.size > 0 && [...imp.names].every((n) => importedNames.has(n))) continue;
    const stmt = imp.stmt.replace(/from\s+"[^"]+"/, `from "${spec}"`);
    if (seenStmts.has(stmt)) continue;
    seenStmts.add(stmt);
    for (const n of imp.names) importedNames.add(n);
    selected.push(stmt);
  }
  for (const stmt of always) {
    const braced = /\{([\s\S]*?)\}/.exec(stmt);
    const names = braced ? braced[1].split(",").map((t) => t.trim()).filter(Boolean) : [];
    if (names.length && names.every((n) => importedNames.has(n))) continue;
    selected.push(stmt);
  }
  return selected.join("\n");
}
const OPEN_CTX = `/** openInternalUnsafe 的**单一**上下文对象：跨 builder 的原局部变量显式传递（无第二份状态）。 */
export interface OpenContext {
${MAIN_FIELDS.map((f) => `  ${f}: ${({ req: "InternalSessionOpenRequest", userInitiated: "boolean", selectionVersion: "number", internalReopen: "boolean", lifecycle: "string", key: "string", stopped: "() => boolean", stoppedResult: "() => OpenResult" })[f]};`).join("\n")}
  forcedSessionWorkflowMode?: WorkflowMode;
  requestedSessionMode: WorkflowMode;
  requestedAssignment: DeliveryAssignment | undefined;
  listing: ProjectListing;
  role: ProjectListing["roles"][number];
  project: ProjectConfig;
  config: EffectiveConfigInfo;
  boundary: BoundarySection1;
  gitBinding: { handle?: RoleSessionHandle };
  currentGitRuntime: ReturnType<typeof createTurnGitRuntime>;
  routineShellPolicy: RoutineShellPolicy | undefined;
  governanceModel: GovernanceModel;
  governanceFunction: ProjectListing["roles"][number]["governanceFunction"];
  sessionWorkflowMode: WorkflowMode;
  legacyOnlyCapabilitiesAllowed: boolean;
  legacyBuiltIn: boolean;
  canSchedule: boolean;
  canNominate: boolean;
  customerInput: SessionManagerDeps["customerInput"];
  writeBoundary: BoundarySection1 | undefined;
  mirrorRoleIdFor: (request: CustomerInputRequest) => string | undefined;
  canDispatch: boolean;
  dispatchBinding: { handle?: RoleSessionHandle };
  planBinding: { handle?: RoleSessionHandle };
  dispatchTask: DispatchTaskFn | undefined;
  viewImage: ViewImageFn;
  canInitiateRequirementChange: boolean;
  canPresentAppRunChange: boolean;
  versionChangeStack: VersionChangeStack | undefined;
  direct: ReturnType<typeof createDirectRoleRuntime> | undefined;
  closeCreatedTask: CloseCreatedTaskFn | undefined;
  closeCreatedTaskFixed: FixedCloseCreatedTaskFn | undefined;
  submitVersionChangeCapability: SubmitVersionChangeFn | undefined;
  submitRefactorCapability: SubmitRefactorFn | undefined;
  reportPlanEscalationCapability: PlanEscalationFn | undefined;
  requestStableWriteCapability: RequestStableWriteFn | undefined;
  requestRequirementChange: RequestRequirementChangeFn | undefined;
  roleStatus: RoleStatusFn | undefined;
  contractCheck: ContractCheckFn | undefined;
  docFormat: DocFormatFn;
  evidenceCheck: EvidenceCheckFn | undefined;
  sessionTail: SessionTailFn | undefined;
  roleActivityLog: RoleActivityLogFn | undefined;
  terminateRoleRun: TerminateRoleRunFn | undefined;
  redispatchTaskCapability: RedispatchTaskFn | undefined;
  projectStateCapability: ProjectStateFn | undefined;
  projectNoteCapability: ProjectNoteFn | undefined;
  requestVersionDecisionCapability: RequestVersionDecisionFn | undefined;
  installationBinding: { handle?: RoleSessionHandle };
  installSkill: InstallSkillFn | undefined;
  uninstallSkill: UninstallSkillFn | undefined;
  installMcp: InstallMcpFn | undefined;
  uninstallMcp: UninstallMcpFn | undefined;
  interactionState: { lifetime: AbortController; turn: AbortController };
  shellOperatorChannel: OperatorChannelFn | undefined;
  shellArming: DesktopShellArming | undefined;
  shellEscalationPresenter: ShellEscalationPresentFn | undefined;
  shellOperatorOnly: { classifyShell: NonNullable<DesktopShellArming>["classifyShell"]; rules: NonNullable<DesktopShellArming>["rules"]; operatorChannel: OperatorChannelFn } | undefined;
  profileRevision: number;
  shellJudge: ShellJudgeFn | undefined;
  governanceJudge: GovernanceJudgeFn | undefined;
  downloadRuntime: DownloadRequestRuntime | undefined;
  buildCustomerInputContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1];
  handle: RoleSessionHandle;
  boundaryPaths: string[];
  boundaryPrints: Record<string, string>;
  skillPaths: string[];
}`;

const imports = importBlock(`${accessors.join("\n")}\n${wrappers.join("\n")}\n${body}`, ['import type { LifecycleHost } from "./host.ts";', 'import type { SessionManagerDeps } from "../contracts/deps.ts";', 'import type { OpenContext } from "./open-context.ts";']);
const ctxImports = importBlock(OPEN_CTX, []);
fs.writeFileSync(path.join(OUT_DIR, "open-context.ts"), `// app/desktop/session/lifecycle/open-context.ts
// B7（2026-11-13）：openInternalUnsafe 的**单一**上下文对象类型（跨 builder 显式传递；无第二份状态）。
// 仅类型面、无运行时；取值/字段由 /open.ts 的主流程与 8 个连续块 builder 填充。
${ctxImports}

${OPEN_CTX}
`, "utf8");
const source = `// app/desktop/session/lifecycle/open.ts
// B7（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.4 / §5 B7、附录 A lifecycle 组）：open/openInternal **逐字搬移**；openInternalUnsafe 按方案
// §3.4 的 8 个 builder 作**连续代码块**分解（源行映射与逐行等价论证见
// 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-lifecycle.md §builder 分解）：
//   resolveWorkflowMode（1994–2060）/ reuseOrRebindEntry（2061–2134）/ loadAuthorization（2136–2193）/
//   assembleGovernanceCapabilities（2195–2301）/ assembleProjectCapabilities（2303–2542）/
//   assembleToolSurface（2543–2956）/ freezeBindings（2958–2980）/ postOpenWiring（2982–3063）。
// 原顺序/条件/工具注册 spread 顺序逐字保留；跨块局部变量提升为**单一** ctx 对象（OpenContext）。
// 主流程保留原前置校验（1986–1993）并顺序调用 builder。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
${imports}

export class LifecycleOpen {
  private readonly host: LifecycleHost;
  private readonly deps: SessionManagerDeps;
  constructor(host: LifecycleHost, deps: SessionManagerDeps) { this.host = host; this.deps = deps; }

${accessors.join("\n")}
${wrappers.join("\n")}

${body}
}
`;
fs.writeFileSync(path.join(OUT_DIR, "open.ts"), source, "utf8");
console.log("open.ts written, lines:", source.split("\n").length, "host ids:", thisIds.size);
