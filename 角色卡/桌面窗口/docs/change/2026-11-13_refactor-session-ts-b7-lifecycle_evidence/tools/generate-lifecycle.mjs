// B7 生成器 v2：逐字搬移 46 个 lifecycle 方法 + 生成 lifecycle/host.ts。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const SESSION = path.join(root, "app/desktop/session.ts");
const OUT_DIR = path.join(root, "app/desktop/session/lifecycle");
const text = fs.readFileSync(SESSION, "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const lineStarts = []; { let o = 0; for (const l of lines) { lineStarts.push(o); o += l.length + 1; } }
const lineOf = (off) => { let n = 0; for (let i = 0; i < lineStarts.length; i += 1) { if (lineStarts[i] <= off) n = i; else break; } return n; };
const data = JSON.parse(fs.readFileSync(path.join(HERE, "methods-current.json"), "utf8"));
const members = data.members.filter((m) => !m.isField);
const byName = new Map(members.map((m) => [m.name, m]));

const ALLOC = {
  send: ["send", "sendDelivery", "sendFacts", "beginDeliveryOrigin", "captureDeliveryOrigin", "trimDeliveryOrigins", "failDeliveryOrigin", "healStaleOrigin"],
  consume: ["consume"],
  background: ["listBackgroundTasks", "readBackgroundTask", "stopBackgroundTask"],
  ops: ["openObservedRoleSession", "ownsControllerDisposal", "disposeObservedHandle", "disposeEntry", "evictBeyondLimit", "isPrimarySession", "activeEntry", "observeWatchdog", "noteWatchdogActivity", "profileRevision", "profileChanged", "hasBusyRuntime", "hasStaleProfile", "liveSessionViews", "openBackground", "sendBackground", "isRoleBusy", "hasLiveSession", "wasLastTurnAborted", "hasPendingDelivery", "waitForRoleSettle", "waitForRoleIdle", "abort", "stop", "isOpen", "openForRoleId", "liveRoleIds", "findLiveRuntime", "ensureFreshRoleSession", "rebuildSession", "rebuildSessionUnsafe", "isCustomerInitiatedTurn"],
};
const HOST_ONLY_METHODS = ["open", "openInternal", "openInternalUnsafe"];

const STATE_ACCESSORS = {
  sessions: { type: "Map<string, LiveSession>", mutable: false },
  messageSeq: { type: "number", mutable: true },
  lruClock: { type: "number", mutable: true },
  activeRoleId: { type: "string | null", mutable: true },
  selectionVersion: { type: "number", mutable: true },
  selectionTargetRoleId: { type: "string | null", mutable: true },
  openChains: { type: "Map<string, Promise<void>>", mutable: false },
  observedHandles: { type: "Map<string, ObservedHandleRecord>", mutable: false },
  observedHandleIds: { type: "WeakMap<RoleSessionHandle, string>", mutable: false },
  lastGovernanceRuntime: { type: "Map<string, RuntimeKind>", mutable: false },
  profileRevisions: { type: "Map<RuntimeKind, number>", mutable: false },
  rebuildChains: { type: "Map<string, Promise<void>>", mutable: false },
  boundaryRefreshVersion: { type: "number", mutable: true },
  deliveryQueues: { type: "Map<string, DeliveryItem[]>", mutable: false },
  activeDeliveries: { type: "Map<string, DeliveryItem>", mutable: false },
  deliveredAppTaskIds: { type: "Set<string>", mutable: false },
  deliveredDeliveryKeys: { type: "Set<string>", mutable: false },
  stoppedDeliveryKeys: { type: "Set<string>", mutable: false },
  resumedDeliveryKeys: { type: "Set<string>", mutable: false },
  deliveryKeyStopVersions: { type: "Map<string, number>", mutable: false },
  deliveryStopVersion: { type: "number", mutable: true },
  deliveryStoppedAll: { type: "boolean", mutable: true },
  lastTurns: { type: "Map<string, { outcome: RuntimeTurnOutcome; at: string; errorCode?: string }>", mutable: false },
  lastAssistantText: { type: "Map<string, { turnId?: string; text: string }>", mutable: false },
  reportStates: { type: "Map<string, { owner?: LiveSession; event?: HandbackEvent; state?: ReportSaveStateV1; queued: boolean; inFlight?: boolean }>", mutable: false },
  attemptStates: { type: "Map<string, { owner?: LiveSession; receipt: RuntimeDeliveryReceiptV1 }>", mutable: false },
  deferredRunChanges: { type: "Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }>", mutable: false },
  runChangeOperations: { type: "Map<string, { plan: RunChangeHostPlan; controller: AbortController }>", mutable: false },
  inventoryPublicationErrors: { type: "Map<string, string>", mutable: false },
  loadEffectiveConfig: { type: "(opts: LoadConfigOptions) => Promise<LoadedConfig>", mutable: false },
};

// ——— 通用小词法器：找 `{` 的配对 close ———
function matchBrace(src, open) {
  const stack = [{ kind: "code", expr: false, depth: 0 }];
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i], next = src[i + 1];
    const top = stack[stack.length - 1];
    if (top.kind === "template") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "`") { stack.pop(); continue; }
      if (ch === "$" && next === "{") { stack.push({ kind: "code", expr: true, depth: 0 }); i += 1; continue; }
      continue;
    }
    if (ch === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; i -= 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1; i += 1; continue; }
    if (ch === "'" || ch === '"') { const q = ch; i += 1; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i += 1; i += 1; } continue; }
    if (ch === "`") { stack.push({ kind: "template" }); continue; }
    if (ch === "{") { top.depth += 1; continue; }
    if (ch === "}") {
      if (top.expr && top.depth === 0) { stack.pop(); continue; }
      if (top.expr) { top.depth -= 1; continue; }
      top.depth -= 1;
      if (top.depth === 0) return i;
      continue;
    }
  }
  throw new Error("unbalanced");
}
const IDENT_SKIP = new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof", "new"]);

function bodyOpenOffset(m) {
  const startOff = lineStarts[m.startLine - 1];
  const endOff = lineStarts[m.endLine - 1] + lines[m.endLine - 1].length;
  const candidates = [];
  for (let i = startOff; i < endOff; i += 1) {
    if (text[i] !== "{") continue;
    // 跳过字符串/注释中的括号：用 matchBrace 的返回值行判断即可（误命中会被行条件过滤）
    const close = matchBrace(text, i);
    if (lineOf(close) === m.endLine - 1) candidates.push(i);
  }
  if (candidates.length === 0) throw new Error(`body open not found: ${m.name}`);
  return candidates[candidates.length - 1];
}

// ——— 签名抽取（默认参数改可选） ———
const SIG_OVERRIDES = new Map([
  ["openInternal", "openInternal(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion?: number): Promise<OpenResult>;"],
  ["openInternalUnsafe", "openInternalUnsafe(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion?: number, internalReopen?: boolean, lifecycle?: string): Promise<OpenResult>;"],
  ["rebuildIfBoundaryStale", "rebuildIfBoundaryStale(roleId: string, userInitiated: boolean, selectionVersion?: number, forcedWorkflowMode?: WorkflowMode): Promise<{ changed: string; reopened: OpenResult } | undefined>;"],
  ["waitForRoleSettle", "waitForRoleSettle(projectRoot: string, roleId: string, runtime: RuntimeKind, timeoutMs?: number): Promise<boolean>;"],
  ["waitForRoleIdle", "waitForRoleIdle(projectRoot: string, roleId: string, runtime: RuntimeKind, timeoutMs?: number): Promise<boolean>;"],
]);
function optionalizeDefaults(sig) {
  return sig
    .replace(/(\b[A-Za-z_$][\w$]*)(\?)?: ([^=,()]+?) = [^,)]+/g, "$1?: $3")
    .replace(/(\b[A-Za-z_$][\w$]*) = (false|true)\b/g, "$1?: boolean")
    .replace(/(\b[A-Za-z_$][\w$]*) = ([0-9_]+)\b/g, "$1?: number");
}
function signatureOf(name) {
  if (SIG_OVERRIDES.has(name)) return SIG_OVERRIDES.get(name);
  const m = byName.get(name);
  if (!m) throw new Error(`signature: member not found ${name}`);
  const open = bodyOpenOffset(m);
  const startOff = lineStarts[m.startLine - 1];
  let sig = text.slice(startOff, open).trim();
  sig = sig.replace(/^(?:private |public |protected )/, "").replace(/^async /, "");
  sig = optionalizeDefaults(sig);
  return sig + ";";
}

// ——— session.ts 导入表（供模块/host 自动选入） ———
function parseImports(source) {
  const out = [];
  let i = 0;
  const starts = [];
  const re = /(^|[;\n])[ \t]*import\b/g;
  let m;
  while ((m = re.exec(source)) !== null) starts.push(m.index + (m[1] ? 1 : 0));
  for (const start of starts) {
    let depth = 0, j = start;
    for (; j < source.length; j += 1) {
      const ch = source[j];
      if (ch === '"') { const q = j; j += 1; while (j < source.length && source[j] !== '"') { if (source[j] === "\\") j += 1; j += 1; } continue; }
      if (ch === ";") break;
    }
    const stmt = source.slice(start, j + 1);
    const specMatch = /from\s+"([^"]+)"/.exec(stmt);
    if (!specMatch) continue;
    const spec = specMatch[1];
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
    out.push({ stmt, spec, names });
  }
  return out;
}
const SESSION_IMPORTS = parseImports(text);
const HERE_DIR = path.join(root, "app/desktop/session/lifecycle");
function rebaseSpec(spec) {
  if (!spec.startsWith(".")) return spec;
  const abs = path.resolve(path.join(root, "app/desktop"), spec);
  let rel = path.relative(HERE_DIR, abs).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}
const LIFECYCLE_WHITELIST = ["contracts", "shared", "delivery", "session-env", "tasks", "evidence", "git-ports"];
function allowedSpec(rebase) {
  const norm = rebase.replace(/\\/g, "/");
  if (!norm.startsWith(".")) return true; // 包
  if (!norm.startsWith("../")) return true; // 同模块
  if (norm.startsWith("../../")) return true; // 仓库根 src / app/desktop 外部模块
  if (norm.startsWith("../contracts/") || norm.startsWith("../shared/")) return true;
  return LIFECYCLE_WHITELIST.some((entry) => norm === `../${entry}.ts` || norm.startsWith(`../${entry}/`));
}
function importBlockFor(bodyText, always = []) {
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
    if (!allowedSpec(spec)) continue;
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

// ——— host 体 ———
const HOST_COLLECT = { ...ALLOC, open: HOST_ONLY_METHODS };
const hostMethodNames = new Set();
for (const names of Object.values(HOST_COLLECT)) for (const name of names) {
  const mt = lines.slice(byName.get(name).startLine - 1, byName.get(name).endLine).join("\n");
  for (const mm of mt.matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g)) {
    if (mm[1] === "deps" || STATE_ACCESSORS[mm[1]]) continue;
    hostMethodNames.add(mm[1]);
  }
}
for (const n of HOST_ONLY_METHODS) hostMethodNames.add(n);
for (const extra of ["requestIdFor", "appendRoleActivity"]) hostMethodNames.add(extra);

const hostPropLines = Object.entries(STATE_ACCESSORS).map(([name, def]) => def.mutable && name !== "messageSeq" && name !== "lruClock" && name !== "activeRoleId" && name !== "selectionVersion" && name !== "selectionTargetRoleId" && name !== "boundaryRefreshVersion" && name !== "deliveryStopVersion" && name !== "deliveryStoppedAll"
  ? `  readonly ${name}: ${def.type};`
  : `  ${name}: ${def.type};`);
const hostBody = `/** 管理器注册表元素（跨实例协调只读面；门面实例实现）。 */
export interface LifecycleManagerPeer {
  readonly runChangeOperations: Map<string, { plan: RunChangeHostPlan; controller: AbortController }>;
  readonly controllerDisposalOwners: Set<ControllerDisposalLease>;
}

/** lifecycle 子模块可见的宿主面：Lifecycle 实例实现（同实例、无第二份状态）。 */
export interface LifecycleHost {
${hostPropLines.join("\n")}
  readonly maxLiveSessions: number;
  /**
   * 门面实例引用（逐字保留 \`stop\` 的跨实例协调语义：\`manager !== this\` 比较的是门面实例）。
   * 与 \`managerId\` 不同：这是对象身份，不是事实键。
   */
  readonly manager: LifecycleManagerPeer;
${[...hostMethodNames].sort().map((n) => "  " + signatureOf(n)).join("\n")}
}
`;
function rebaseInlineImports(src) {
  return src.replace(/import\("([^"]+)"\)/g, (all, spec) => {
    if (!spec.startsWith(".")) return all;
    const abs = path.resolve(path.join(root, "app/desktop"), spec);
    let rel = path.relative(HERE_DIR, abs).split(path.sep).join("/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return `import("${rel}")`;
  });
}
const hostImports = importBlockFor(hostBody, ['import type { ObservedHandleRecord } from "./state.ts";']);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "host.ts"), rebaseInlineImports(`// app/desktop/session/lifecycle/host.ts
// B7（2026-11-13）：lifecycle 子模块的宿主接口（由 \`Lifecycle\`（./index.ts）实现）。
// 方法签名逐字取自门面 SessionManager 的现行声明（仅去可见性/async 修饰、默认参数改为可选——
// 调用语义由实现侧默认值保持）；状态访问器与门面同名同实例（方案 §3.6）。仅类型面，无运行时。
${hostImports}

${hostBody}`), "utf8");

// ——— 46 方法模块 ———
function thisIdents(mt) { return new Set([...mt.matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])); }
function mutates(mt, name) { const n = name.replace(/\$/g, "\\$"); return new RegExp(`this\\.${n}\\s*=[^=]|(?:\\+\\+|--)\\s*this\\.${n}\\b|this\\.${n}\\s*(?:\\+\\+|--)`).test(mt); }
function methodTextOf(name) { const m = byName.get(name); if (!m) throw new Error("method not found: " + name); return { m, text: lines.slice(m.startLine - 1, m.endLine).join("\n") }; }

function buildModule(file, names) {
  const methodTexts = names.map((n) => ({ name: n, ...methodTextOf(n) }));
  const union = new Set();
  for (const { text: mt } of methodTexts) for (const id of thisIdents(mt)) union.add(id);
  union.delete("deps");
  const localNames = new Set(names);
  const accessors = [];
  for (const name of [...union].sort()) {
    const def = STATE_ACCESSORS[name];
    if (!def) continue;
    if (def.mutable && mutates(methodTexts.map((x) => x.text).join("\n"), name)) {
      accessors.push(`  private get ${name}(): ${def.type} { return this.host.${name}; }`);
      accessors.push(`  private set ${name}(value: ${def.type}) { this.host.${name} = value; }`);
    } else {
      accessors.push(`  private get ${name}(): ${def.type} { return this.host.${name}; }`);
    }
  }
  const wrappers = [];
  for (const name of [...union].sort()) {
    if (STATE_ACCESSORS[name] || localNames.has(name)) continue;
    wrappers.push(`  private ${name}(...args: Parameters<LifecycleHost["${name}"]>): ReturnType<LifecycleHost["${name}"]> { return this.host.${name}(...args); }`);
  }
  const body = methodTexts.map(({ name, text: mt }) => {
    const t = mt.replace(/^(  )private /, "$1");
    return `  // —— ${name}（B7 自 session.ts 逐字搬移）——\n${t}`;
  }).join("\n\n");
  const imports = importBlockFor(`${accessors.join("\n")}\n${wrappers.join("\n")}\n${body}`, ['import type { LifecycleHost } from "./host.ts";', 'import type { SessionManagerDeps } from "../contracts/deps.ts";']);
  return `// app/desktop/session/lifecycle/${file}.ts
// B7（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B7、附录 A lifecycle 组）：${names.length} 个方法自 app/desktop/session.ts **逐字搬移**
// （含 JSDoc）：方法体零改动（仅声明行 \`private \` 前缀移除——模块内 public 仅为门面委托可调用；
// 门面保留同名同签名同可见性的薄委托）。类外壳重建原 receiver 面：
//  · 本文件使用到的跨方法/跨模块调用以同名同签名薄包装指向 \`LifecycleHost\`（方法体文本保持
//    \`this.<name>(...)\` 原样；包装为运行期直转发，不加异步层）；
//  · 状态字段（方案 §3.6 的 11 个 lifecycle 字段）与只读引用经宿主访问器暴露（同一实例，无第二份状态）。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
${imports}

export class Lifecycle${file[0].toUpperCase()}${file.slice(1)} {
  private readonly host: LifecycleHost;
  private readonly deps: SessionManagerDeps;
  constructor(host: LifecycleHost, deps: SessionManagerDeps) { this.host = host; this.deps = deps; }

${accessors.join("\n")}
${wrappers.join("\n")}

${body}
}
`;
}
for (const [file, names] of Object.entries(ALLOC)) {
  let src = buildModule(file, names);
  src = src.replace('import type { LifecycleHost } from "./host.ts";', 'import type { LifecycleHost } from "./host.ts";\nimport type { ObservedHandleRecord } from "./state.ts";');
  if (file === "ops") {
    src = src.replace('import type { LifecycleHost } from "./host.ts";', 'import type { LifecycleHost, LifecycleManagerPeer } from "./host.ts";');
    if (!src.includes("desktopSessionManagers as inventorySessionManagers")) {
      src = src.replace('import type { LifecycleHost, LifecycleManagerPeer } from "./host.ts";', 'import type { LifecycleHost, LifecycleManagerPeer } from "./host.ts";\nimport { desktopSessionManagers as inventorySessionManagers } from "../shared/inventory.ts";');
    }
    src = src.replace('import type { ObservedHandleRecord } from "./state.ts";', 'import type { ObservedHandleRecord } from "./state.ts";\n\n/** 管理器注册表（与 barrel/run-change 同一单例 Set；元素为门面实例，见 host.LifecycleManagerPeer）。 */\nconst desktopSessionManagers = inventorySessionManagers as unknown as Set<LifecycleManagerPeer>;');
    src = src.replace("this.sessions.size > MAX_LIVE_SESSIONS", "this.sessions.size > this.host.maxLiveSessions");
    src = src.replace("if (manager !== this && !members.length)", "if (manager !== this.host.manager && !members.length)");
  }
  fs.writeFileSync(path.join(OUT_DIR, `${file}.ts`), src, "utf8");
}
fs.writeFileSync(path.join(HERE, "host-methods.txt"), [...hostMethodNames].sort().join("\n") + "\n", "utf8");
console.log("generated:", Object.keys(ALLOC).join(","), "host methods:", hostMethodNames.size);
