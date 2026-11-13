// B7 生成器：lifecycle/index.ts（Lifecycle 组装/宿主实现/端口面）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const OUT = path.join(root, "app/desktop/session/lifecycle/index.ts");

const SEND = ["send", "sendDelivery", "sendFacts", "beginDeliveryOrigin", "captureDeliveryOrigin", "trimDeliveryOrigins", "failDeliveryOrigin", "healStaleOrigin"];
const CONSUME = ["consume"];
const BACKGROUND = ["listBackgroundTasks", "readBackgroundTask", "stopBackgroundTask"];
const OPEN = ["open", "openInternal", "openInternalUnsafe"];
const OPS = ["openObservedRoleSession", "ownsControllerDisposal", "disposeObservedHandle", "disposeEntry", "evictBeyondLimit", "isPrimarySession", "activeEntry", "observeWatchdog", "noteWatchdogActivity", "profileRevision", "profileChanged", "hasBusyRuntime", "hasStaleProfile", "liveSessionViews", "openBackground", "sendBackground", "isRoleBusy", "hasLiveSession", "wasLastTurnAborted", "hasPendingDelivery", "waitForRoleSettle", "waitForRoleIdle", "abort", "stop", "isOpen", "openForRoleId", "liveRoleIds", "findLiveRuntime", "ensureFreshRoleSession", "rebuildSession", "rebuildSessionUnsafe", "isCustomerInitiatedTurn"];
const ALL_LIFECYCLE = [...SEND, ...CONSUME, ...BACKGROUND, ...OPEN, ...OPS];
const SHARED = ["contextInfo", "emitDeliveryNote", "findListingForFeedback", "now", "queueKey", "readTasks", "isFixedTask", "refreshListingNow", "sessionKey"];
const STATE_NAMES = ["sessions", "messageSeq", "lruClock", "activeRoleId", "selectionVersion", "selectionTargetRoleId", "openChains", "observedHandles", "observedHandleIds", "lastGovernanceRuntime", "profileRevisions", "rebuildChains", "boundaryRefreshVersion", "deliveryQueues", "activeDeliveries", "deliveredAppTaskIds", "deliveredDeliveryKeys", "stoppedDeliveryKeys", "resumedDeliveryKeys", "deliveryKeyStopVersions", "deliveryStopVersion", "deliveryStoppedAll", "lastTurns", "lastAssistantText", "reportStates", "attemptStates", "deferredRunChanges", "runChangeOperations", "inventoryPublicationErrors", "loadEffectiveConfig", "manager", "maxLiveSessions"];
const OWN_STATE = new Set(["messageSeq", "lruClock", "activeRoleId", "selectionVersion", "selectionTargetRoleId", "openChains", "observedHandles", "observedHandleIds", "lastGovernanceRuntime"]);
const REF_STATE = {
  sessions: "this.refs.sessions",
  loadEffectiveConfig: "this.refs.loadEffectiveConfig",
  manager: "this.refs.manager",
  maxLiveSessions: "this.refs.maxLiveSessions",
  profileRevisions: "this.refs.profileRevisions()",
  rebuildChains: "this.refs.rebuildChains()",
  boundaryRefreshVersion: "this.refs.boundaryRefreshVersion()",
  lastTurns: "this.refs.lastTurns()",
  lastAssistantText: "this.refs.lastAssistantText()",
  reportStates: "this.refs.reportStates()",
  attemptStates: "this.refs.attemptStates()",
  deliveryQueues: "this.refs.deliveryQueues()",
  activeDeliveries: "this.refs.activeDeliveries()",
  deliveredAppTaskIds: "this.refs.deliveredAppTaskIds()",
  deliveredDeliveryKeys: "this.refs.deliveredDeliveryKeys()",
  stoppedDeliveryKeys: "this.refs.stoppedDeliveryKeys()",
  resumedDeliveryKeys: "this.refs.resumedDeliveryKeys()",
  deliveryKeyStopVersions: "this.refs.deliveryKeyStopVersions()",
  deliveryStopVersion: "this.refs.deliveryStopVersion()",
  deliveryStoppedAll: "this.refs.deliveryStoppedAll()",
  deferredRunChanges: "this.refs.deferredRunChanges()",
  runChangeOperations: "this.refs.runChangeOperations()",
  inventoryPublicationErrors: "this.refs.inventoryPublicationErrors()",
};
const MUTABLE_STATE = new Set(["messageSeq", "lruClock", "activeRoleId", "selectionVersion", "selectionTargetRoleId", "boundaryRefreshVersion", "deliveryStopVersion", "deliveryStoppedAll"]);
const SETTER_BODY = {
  boundaryRefreshVersion: "this.refs.setBoundaryRefreshVersion(value)",
  deliveryStopVersion: "this.refs.setDeliveryStopVersion(value)",
  deliveryStoppedAll: "this.refs.setDeliveryStoppedAll(value)",
};
const OWNER_FIELD = { send: "sendOps", consume: "consumeOps", background: "backgroundOps", open: "openOps", ops: "ops" };
const OWNER_CLASS = { send: "LifecycleSend", consume: "LifecycleConsume", background: "LifecycleBackground", open: "LifecycleOpen", ops: "LifecycleOps" };
const ownerOf = (n) => (SEND.includes(n) ? "send" : CONSUME.includes(n) ? "consume" : BACKGROUND.includes(n) ? "background" : OPEN.includes(n) ? "open" : "ops");

const hostMethods = fs.readFileSync(path.join(HERE, "host-methods.txt"), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const missing = ALL_LIFECYCLE.filter((n) => !hostMethods.includes(n));
const portMethods = hostMethods.filter((n) => !ALL_LIFECYCLE.includes(n) && !SHARED.includes(n));
const ownKeys = [...new Set([...STATE_NAMES, ...ALL_LIFECYCLE, ...SHARED])];

const lifecycleImpls = ALL_LIFECYCLE.map((n) => {
  const owner = ownerOf(n);
  return `  ${n}(...args: Parameters<${OWNER_CLASS[owner]}["${n}"]>): ReturnType<${OWNER_CLASS[owner]}["${n}"]> { return this.${OWNER_FIELD[owner]}.${n}(...args); }`;
});
const portImpls = portMethods.map((n) => `  ${n}(...args: Parameters<LifecyclePorts["${n}"]>): ReturnType<LifecyclePorts["${n}"]> { return this.ports.${n}(...args); }`);
const sharedImpls = [
  `  sessionKey(...args: Parameters<LifecycleHost["sessionKey"]>): ReturnType<LifecycleHost["sessionKey"]> { return sessionKey(...args); }`,
  `  queueKey(...args: Parameters<LifecycleHost["queueKey"]>): ReturnType<LifecycleHost["queueKey"]> { return queueKey(...args); }`,
  `  now(): number { return now(this.refs.deps); }`,
  `  contextInfo(...args: Parameters<LifecycleHost["contextInfo"]>): ReturnType<LifecycleHost["contextInfo"]> { return contextInfo(...args); }`,
  `  emitDeliveryNote(...args: Parameters<LifecycleHost["emitDeliveryNote"]>): ReturnType<LifecycleHost["emitDeliveryNote"]> { emitDeliveryNote(...args, this.refs.deps); }`,
  `  findListingForFeedback(projectRoot: string): ReturnType<LifecycleHost["findListingForFeedback"]> { return findListingForFeedback(projectRoot, this.refs.deps); }`,
  `  refreshListingNow(projectRoot: string): ReturnType<LifecycleHost["refreshListingNow"]> { return refreshListingNow(projectRoot, this.refs.deps); }`,
  `  readTasks(projectRoot: string): ReturnType<LifecycleHost["readTasks"]> { return readTasks(projectRoot); }`,
  `  isFixedTask(projectRoot: string, taskId: string | undefined): ReturnType<LifecycleHost["isFixedTask"]> { return isFixedTask(projectRoot, taskId); }`,
];
const stateImpls = [];
for (const name of STATE_NAMES) {
  if (OWN_STATE.has(name)) {
    const mutable = ["messageSeq", "lruClock", "activeRoleId", "selectionVersion", "selectionTargetRoleId"].includes(name);
    stateImpls.push(`  get ${name}(): LifecycleHost["${name}"] { return this.state.${name}; }`);
    if (mutable) stateImpls.push(`  set ${name}(value: LifecycleHost["${name}"]) { this.state.${name} = value; }`);
  } else {
    stateImpls.push(`  get ${name}(): LifecycleHost["${name}"] { return ${REF_STATE[name]}; }`);
    if (MUTABLE_STATE.has(name)) stateImpls.push(`  set ${name}(value: LifecycleHost["${name}"]) { ${SETTER_BODY[name]}; }`);
  }
}

const source = `// app/desktop/session/lifecycle/index.ts
// B7（2026-11-13，session.ts 重构；方案 §3.2/§3.3/§3.6/§5 B7、附录 A lifecycle 组）：
// lifecycle 模块的组装面（L6）。职责：
//  · 单 owner 创建/持有方案 §3.6 的 11 个 lifecycle 状态（./state.ts；门面仅保留同一实例访问器）；
//  · 构造 5 个方法子模块（open/send/consume/background/ops）并实现其 \`LifecycleHost\` 宿主面
//    （子模块以同名薄包装调用；宿主方法在此逐名转发——同实例、无第二份状态）；
//  · 对外提供 47 个同名同签名方法（门面 SessionManager 逐一薄委托）、\`SessionControl\` 实现
//    （openInternal/ensureFresh/disposeEntry/abortTurn）与只读 \`SessionDirectory\`（./directory.ts）。
// 端口（方案 §3.3）：跨模块上行调用经 \`LifecyclePorts\`（= LifecycleHost 去掉 lifecycle 自身/状态/
// shared 面），由门面构造以箭头回调注入（运行期调用、参数逐位原样转发）；shared 方法直接调用 L0 实现。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { LifecycleHost } from "./host.ts";
import type { SessionControl, SessionDirectory } from "../contracts/ports.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import { createLifecycleState, type LifecycleState } from "./state.ts";
import { LifecycleOpen } from "./open.ts";
import { LifecycleSend } from "./send.ts";
import { LifecycleConsume } from "./consume.ts";
import { LifecycleBackground } from "./background.ts";
import { LifecycleOps } from "./ops.ts";
import { createLifecycleDirectory } from "./directory.ts";
import { sessionKey, queueKey } from "../shared/keys.ts";
import { now } from "../shared/clock.ts";
import { contextInfo } from "../shared/session-views.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { findListingForFeedback, refreshListingNow } from "../shared/roles.ts";
import { isFixedTask, readTasks } from "../shared/tasks-store.ts";

/** 状态/自身面键（\`LifecyclePorts\` 是 \`LifecycleHost\` 去掉这些键后的端口面）。 */
type LifecycleOwnKey =
${ownKeys.map((k) => `  | "${k}"`).join("\n")};

/** 门面注入的跨模块端口（运行期调用；参数逐位原样转发）。 */
export type LifecyclePorts = Omit<LifecycleHost, LifecycleOwnKey>;

/** 门面构造 Lifecycle 时注入的同一实例状态/引用（方案 §3.6：sessions/deps 留门面，只读暴露）。 */
export interface LifecycleRefs {
  deps: SessionManagerDeps;
  registerManager: () => void;
  sessions: LifecycleHost["sessions"];
  loadEffectiveConfig: LifecycleHost["loadEffectiveConfig"];
  manager: LifecycleHost["manager"];
  maxLiveSessions: LifecycleHost["maxLiveSessions"];
  profileRevisions: () => LifecycleHost["profileRevisions"];
  rebuildChains: () => LifecycleHost["rebuildChains"];
  boundaryRefreshVersion: () => LifecycleHost["boundaryRefreshVersion"];
  setBoundaryRefreshVersion: (value: number) => void;
  lastTurns: () => LifecycleHost["lastTurns"];
  lastAssistantText: () => LifecycleHost["lastAssistantText"];
  reportStates: () => LifecycleHost["reportStates"];
  attemptStates: () => LifecycleHost["attemptStates"];
  deliveryQueues: () => LifecycleHost["deliveryQueues"];
  activeDeliveries: () => LifecycleHost["activeDeliveries"];
  deliveredAppTaskIds: () => LifecycleHost["deliveredAppTaskIds"];
  deliveredDeliveryKeys: () => LifecycleHost["deliveredDeliveryKeys"];
  stoppedDeliveryKeys: () => LifecycleHost["stoppedDeliveryKeys"];
  resumedDeliveryKeys: () => LifecycleHost["resumedDeliveryKeys"];
  deliveryKeyStopVersions: () => LifecycleHost["deliveryKeyStopVersions"];
  deliveryStopVersion: () => LifecycleHost["deliveryStopVersion"];
  setDeliveryStopVersion: (value: number) => void;
  deliveryStoppedAll: () => LifecycleHost["deliveryStoppedAll"];
  setDeliveryStoppedAll: (value: boolean) => void;
  deferredRunChanges: () => LifecycleHost["deferredRunChanges"];
  runChangeOperations: () => LifecycleHost["runChangeOperations"];
  inventoryPublicationErrors: () => LifecycleHost["inventoryPublicationErrors"];
  directory: {
    governanceOwner(projectRoot: string): string | null;
    governanceRuntime(projectRoot: string): RuntimeKind | undefined;
    lastTurn(projectRoot: string, roleId: string, runtime: RuntimeKind): { outcome: import("../../../../src/model/runtime.ts").RuntimeTurnOutcome; at: string; errorCode?: string } | undefined;
  };
}

/** lifecycle 组装面（LifecycleHost 实现 + SessionControl + SessionDirectory）。 */
export class Lifecycle implements LifecycleHost, SessionControl {
  readonly state: LifecycleState;
  private readonly refs: LifecycleRefs;
  private readonly ports: LifecyclePorts;
  private readonly sendOps: LifecycleSend;
  private readonly consumeOps: LifecycleConsume;
  private readonly backgroundOps: LifecycleBackground;
  private readonly openOps: LifecycleOpen;
  private readonly ops: LifecycleOps;
  private readonly directoryPort: SessionDirectory;

  constructor(refs: LifecycleRefs, ports: LifecyclePorts) {
    this.refs = refs;
    this.ports = ports;
    this.state = createLifecycleState(refs.registerManager);
    this.sendOps = new LifecycleSend(this, refs.deps);
    this.consumeOps = new LifecycleConsume(this, refs.deps);
    this.backgroundOps = new LifecycleBackground(this, refs.deps);
    this.openOps = new LifecycleOpen(this, refs.deps);
    this.ops = new LifecycleOps(this, refs.deps);
    this.directoryPort = createLifecycleDirectory(
      {
        key: (projectRoot, roleId, runtime) => sessionKey(projectRoot, roleId, runtime),
        find: (projectRoot, roleId, runtime) => refs.sessions.get(sessionKey(projectRoot, roleId, runtime)),
        activeRoleId: () => this.state.activeRoleId,
        isBusy: (runtime) => this.ops.hasBusyRuntime(runtime),
        views: () => this.ops.liveSessionViews(),
      },
      refs.directory,
    );
  }

${stateImpls.join("\n")}

  /** 只读会话目录（方案 §3.3 SessionDirectory；lifecycle 实现，纯投影）。 */
  directory(): SessionDirectory { return this.directoryPort; }

  /** \`SessionControl.ensureFresh\`（= 原 \`ensureFreshRoleSession\`；同名语义、参数逐位转发）。 */
  ensureFresh(projectRoot: string, roleId: string, runtime: RuntimeKind): ReturnType<LifecycleOps["ensureFreshRoleSession"]> {
    return this.ops.ensureFreshRoleSession(projectRoot, roleId, runtime);
  }

  /** \`SessionControl.abortTurn\`（= 原 \`abort\`；同名语义、参数逐位转发）。 */
  abortTurn(target: Parameters<LifecycleOps["abort"]>[0]): ReturnType<LifecycleOps["abort"]> {
    return this.ops.abort(target);
  }

${lifecycleImpls.join("\n")}

${sharedImpls.join("\n")}

${portImpls.join("\n")}
}
`;
fs.writeFileSync(OUT, source, "utf8");
console.log("index.ts written:", source.split("\n").length, "lines; lifecycle:", ALL_LIFECYCLE.length, "shared:", SHARED.length, "ports:", portMethods.length, "missing-from-host:", missing);
