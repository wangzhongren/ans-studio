// B7 接线器：把 session.ts 的 47 个 lifecycle 方法替换为薄委托、11 个状态字段改为 Lifecycle 访问器、
// 构造器顶部装配 Lifecycle（refs + ports）。仅运行一次；幂等保护见文件检测。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const FILE = path.join(root, "app/desktop/session.ts");
let text = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
if (text.includes("this.lifecycle.open(")) { console.log("already wired; abort"); process.exit(0); }
const lines = text.split("\n");
const lineStarts = []; { let o = 0; for (const l of lines) { lineStarts.push(o); o += l.length + 1; } }
const lineOf = (off) => { let n = 0; for (let i = 0; i < lineStarts.length; i += 1) { if (lineStarts[i] <= off) n = i; else break; } return n; };
const data = JSON.parse(fs.readFileSync(path.join(HERE, "methods-current.json"), "utf8"));
const byName = new Map(data.members.filter((m) => !m.isField).map((m) => [m.name, m]));

const NAMES = ["openObservedRoleSession", "ownsControllerDisposal", "disposeObservedHandle", "observeWatchdog", "noteWatchdogActivity", "profileRevision", "profileChanged", "hasBusyRuntime", "hasStaleProfile", "liveSessionViews", "listBackgroundTasks", "readBackgroundTask", "stopBackgroundTask", "healStaleOrigin", "beginDeliveryOrigin", "captureDeliveryOrigin", "sendDelivery", "sendFacts", "trimDeliveryOrigins", "failDeliveryOrigin", "activeEntry", "disposeEntry", "evictBeyondLimit", "isPrimarySession", "open", "openBackground", "sendBackground", "isRoleBusy", "hasLiveSession", "wasLastTurnAborted", "hasPendingDelivery", "waitForRoleSettle", "waitForRoleIdle", "openInternal", "openInternalUnsafe", "consume", "send", "abort", "stop", "isOpen", "openForRoleId", "liveRoleIds", "findLiveRuntime", "ensureFreshRoleSession", "rebuildSession", "rebuildSessionUnsafe", "isCustomerInitiatedTurn"];

function matchBrace(src, open) {
  let depth = 0;
  const stack = [{ kind: "code", expr: false }];
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i], next = src[i + 1];
    const top = stack[stack.length - 1];
    if (top.kind === "template") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "`") { stack.pop(); continue; }
      if (ch === "$" && next === "{") { stack.push({ kind: "code", expr: true }); i += 1; continue; }
      continue;
    }
    if (ch === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; i -= 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1; i += 1; continue; }
    if (ch === "'" || ch === '"') { const q = ch; i += 1; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i += 1; i += 1; } continue; }
    if (ch === "`") { stack.push({ kind: "template" }); continue; }
    if (ch === "{") { top.depth = (top.depth ?? 0) + 1; continue; }
    if (ch === "}") {
      if (top.expr && (top.depth ?? 0) === 0) { stack.pop(); continue; }
      if (top.expr) { top.depth -= 1; continue; }
      top.depth -= 1;
      if (top.depth === 0) return i;
      continue;
    }
  }
  throw new Error("unbalanced");
}

function bodyOpenOffset(m) {
  const startOff = lineStarts[m.startLine - 1];
  const endOff = lineStarts[m.endLine - 1] + lines[m.endLine - 1].length;
  const candidates = [];
  for (let i = startOff; i < endOff; i += 1) {
    if (text[i] !== "{") continue;
    const close = matchBrace(text, i);
    if (lineOf(close) === m.endLine - 1) candidates.push(i);
  }
  if (candidates.length === 0) throw new Error("body open not found: " + m.name);
  return candidates[candidates.length - 1];
}

function parseParamNames(sig) {
  const open = sig.indexOf("(");
  if (open < 0) return [];
  let depth = 0, close = -1;
  for (let i = open; i < sig.length; i += 1) {
    const ch = sig[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") { depth -= 1; if (depth === 0) { close = i; break; } }
  }
  if (close < 0) throw new Error("params unbalanced: " + sig.slice(0, 80));
  const inner = sig.slice(open + 1, close);
  const parts = [];
  let cur = "", pd = 0, bd = 0, cd = 0;
  for (const ch of inner) {
    if (ch === "(") pd += 1; else if (ch === ")") pd -= 1;
    else if (ch === "{") bd += 1; else if (ch === "}") bd -= 1;
    else if (ch === "[") cd += 1; else if (ch === "]") cd -= 1;
    if (ch === "," && pd === 0 && bd === 0 && cd === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts.map((p) => {
    const m = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(p);
    if (!m) throw new Error("param name not found: " + p);
    return m[1];
  });
}

const replacements = [];
for (const name of NAMES) {
  const m = byName.get(name);
  if (!m) throw new Error("method missing: " + name);
  const openOff = bodyOpenOffset(m);
  const sig = text.slice(lineStarts[m.startLine - 1], openOff).trimEnd();
  const params = parseParamNames(sig);
  const delegate = `${sig} { return this.lifecycle.${name}(${params.join(", ")}); }`;
  replacements.push({ start: m.startLine, end: m.endLine, name, text: delegate });
}
replacements.sort((a, b) => b.start - a.start);
for (const r of replacements) {
  const startOff = lineStarts[r.start - 1];
  const endOff = lineStarts[r.end - 1] + lines[r.end - 1].length;
  text = text.slice(0, startOff) + r.text + text.slice(endOff);
  console.error("delegated", r.name, r.start + "-" + r.end);
}

// ——— 状态字段 → Lifecycle 访问器 ———
function mustReplace(oldStr, newStr) {
  if (!text.includes(oldStr)) throw new Error("anchor missing: " + JSON.stringify(oldStr.slice(0, 80)));
  text = text.replace(oldStr, newStr);
}
const stateAccessors = `  private get inventoryRegistration(): boolean { return this.lifecycle.state.inventoryRegistration; }
  private get managerId(): string { return this.lifecycle.state.managerId; }
  private get messageSeq(): number { return this.lifecycle.state.messageSeq; }
  private set messageSeq(value: number) { this.lifecycle.state.messageSeq = value; }
  private get lruClock(): number { return this.lifecycle.state.lruClock; }
  private set lruClock(value: number) { this.lifecycle.state.lruClock = value; }
  private get activeRoleId(): string | null { return this.lifecycle.state.activeRoleId; }
  private set activeRoleId(value: string | null) { this.lifecycle.state.activeRoleId = value; }
  private get selectionVersion(): number { return this.lifecycle.state.selectionVersion; }
  private set selectionVersion(value: number) { this.lifecycle.state.selectionVersion = value; }
  private get selectionTargetRoleId(): string | null { return this.lifecycle.state.selectionTargetRoleId; }
  private set selectionTargetRoleId(value: string | null) { this.lifecycle.state.selectionTargetRoleId = value; }
  private get openChains(): Map<string, Promise<void>> { return this.lifecycle.state.openChains; }
  private get observedHandles(): Map<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }> { return this.lifecycle.state.observedHandles; }
  private get observedHandleIds(): WeakMap<RoleSessionHandle, string> { return this.lifecycle.state.observedHandleIds; }
  private get lastGovernanceRuntime(): Map<string, RuntimeKind> { return this.lifecycle.state.lastGovernanceRuntime; }
  private readonly lifecycle: Lifecycle;`;
mustReplace(`  private readonly inventoryRegistration = (() => { registerDesktopSessionManager(this); return true; })();
  private readonly managerId = randomUUID();`, stateAccessors);
mustReplace(`  private readonly observedHandles = new Map<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }>();
  private readonly observedHandleIds = new WeakMap<RoleSessionHandle, string>();
`, "");
mustReplace(`  /** 客户消息计数（L-1：逐条独立入队键——客户消息**不去重**）。 */
  private messageSeq = 0;
  /** LRU 时钟（单调递增）。 */
  private lruClock = 0;
  /** 最近一次 open 的角色（\`send\` 的目标）。 */
  private activeRoleId: string | null = null;
  /** 用户显式选择/关闭的版本：后台重建只能恢复同一选择，不能抢回用户的新目标。 */
  private selectionVersion = 0;
  private selectionTargetRoleId: string | null = null;
`, "");
mustReplace(`  private readonly openChains = new Map<string, Promise<void>>();
`, "");
mustReplace(`  private readonly lastGovernanceRuntime = new Map<string, RuntimeKind>();
`, "");

// ——— 构造器装配 ———
const refsAndPorts = `    this.lifecycle = new Lifecycle(
      {
        deps,
        registerManager: () => registerDesktopSessionManager(this),
        sessions: this.sessions,
        loadEffectiveConfig: this.loadEffectiveConfig,
        manager: this as unknown as LifecycleManagerPeer,
        maxLiveSessions: MAX_LIVE_SESSIONS,
        profileRevisions: () => this.profileRevisions,
        rebuildChains: () => this.rebuildChains,
        boundaryRefreshVersion: () => this.boundaryRefreshVersion,
        setBoundaryRefreshVersion: (value) => { this.boundaryRefreshVersion = value; },
        lastTurns: () => this.lastTurns,
        lastAssistantText: () => this.lastAssistantText,
        reportStates: () => this.reportStates,
        attemptStates: () => this.attemptStates,
        deliveryQueues: () => this.deliveryQueues,
        activeDeliveries: () => this.activeDeliveries,
        deliveredAppTaskIds: () => this.deliveredAppTaskIds,
        deliveredDeliveryKeys: () => this.deliveredDeliveryKeys,
        stoppedDeliveryKeys: () => this.stoppedDeliveryKeys,
        resumedDeliveryKeys: () => this.resumedDeliveryKeys,
        deliveryKeyStopVersions: () => this.deliveryKeyStopVersions,
        deliveryStopVersion: () => this.deliveryStopVersion,
        setDeliveryStopVersion: (value) => { this.deliveryStopVersion = value; },
        deliveryStoppedAll: () => this.deliveryStoppedAll,
        setDeliveryStoppedAll: (value) => { this.deliveryStoppedAll = value; },
        deferredRunChanges: () => this.deferredRunChanges,
        runChangeOperations: () => this.runChangeOperations,
        inventoryPublicationErrors: () => this.inventoryPublicationErrors,
        directory: {
          governanceOwner: (projectRoot) => this.governanceOwnerRoleId(projectRoot),
          governanceRuntime: (projectRoot) => this.governanceRuntimeFor(projectRoot),
          lastTurn: (projectRoot, roleId, runtime) => this.lastTurnOf(projectRoot, roleId, runtime),
        },
      },
      {
${fs.readFileSync(path.join(HERE, "ports-literal.txt"), "utf8")}
      },
    );
`;
mustReplace(`    this.deps = deps;
    this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig;
`, `    this.deps = deps;
    this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig;
${refsAndPorts}`);

fs.writeFileSync(FILE, text, "utf8");
console.log("wired; replacements:", replacements.length);
