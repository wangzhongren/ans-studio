// B0 基线：方案附录 B 清单 vs 源码实测导出集合的逐名比对。
// 运行：node tools-compare-appendix-b.mjs <repo-root>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".";
const actual = JSON.parse(
  readFileSync(join(root, "角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence/01-exports-actual.json"), "utf8"),
);

const appendixB = {
  "值/类（6）": [
    "SessionManager", "MAX_LIVE_SESSIONS", "CAPABILITY_INSTALL_SYSTEM_PREFIX",
    "desktopProjectExecutionInventory", "subscribeDesktopExecutionInventory", "shouldSuppressStarTaskReport",
  ],
  "会话/事件/运行（13）": [
    "RuntimeKind", "SessionEventEnvelope", "DesktopOrchestrationEvent", "SessionOpenRequest", "OpenResult",
    "SendResult", "StopResult", "WithdrawResult", "SessionTarget", "SessionMessageMetadata", "ActiveRunView",
    "RunChangeMode", "EffectiveConfigInfo",
  ],
  "持久化（9）": [
    "PersistenceScope", "PersistenceReply", "PersistenceCapabilities", "PersistenceValues", "PersistenceUpdated",
    "DeliveryQueuePersistenceOutcome", "DeliveryQueuePersistenceFacts", "DeliveryQueueRestoreReport",
    "PersistedDeliveryItemV1",
  ],
  "后台任务（6）": [
    "BackgroundTaskView", "BackgroundTasksListReply", "BackgroundTaskReadInput", "BackgroundTaskReadReply",
    "BackgroundTaskStopInput", "BackgroundTaskStopReply",
  ],
  "任务/终止（10）": [
    "TaskListView", "TaskRestoreReport", "TerminateRoleRunInput", "TerminateRoleRunResult", "RedispatchTaskInput",
    "RedispatchTaskResult", "CloseTaskInput", "CloseTaskResult", "RebuildSessionResult", "RedeliverResult",
  ],
  "治理/安装/库存/登记（7）": [
    "GovernanceClientProjectionV1", "SessionManagerDeps", "NativeProjectRegistration", "InstallationCapabilityTool",
    "InstallationEffectRefusalObservation", "DesktopSessionInventoryFact", "DesktopProjectExecutionInventory",
  ],
};

const declared = Object.values(appendixB).flat();
const actualSet = new Set(actual.symbols);
const declaredSet = new Set(declared);

const onlyInPlan = declared.filter((s) => !actualSet.has(s));
const onlyInSource = actual.symbols.filter((s) => !declaredSet.has(s));
const valueSet = new Set(actual.values);
const declaredValueSet = new Set(appendixB["值/类（6）"]);
const valueMismatch = {
  planValueNotRuntimeValue: appendixB["值/类（6）"].filter((s) => !valueSet.has(s)),
  runtimeValueNotPlanValue: actual.values.filter((s) => !declaredValueSet.has(s)),
};

const categoryCounts = Object.fromEntries(
  Object.entries(appendixB).map(([k, v]) => [k, v.length]),
);

console.log(JSON.stringify({
  appendixBDeclaration: `6+13+9+6+10+7 = ${declared.length}（附录 B 逐类计数 ${JSON.stringify(categoryCounts)}）`,
  appendixBDeclaredCount: declared.length,
  appendixBDedupedCount: declaredSet.size,
  actualSymbolCount: actual.symbols.length,
  actualValueCount: actual.values.length,
  actualTypeCount: actual.types.length,
  onlyInPlan,
  onlyInSource,
  valueMismatch,
  setEqual: onlyInPlan.length === 0 && onlyInSource.length === 0 && declaredSet.size === actual.symbols.length,
}, null, 2));
