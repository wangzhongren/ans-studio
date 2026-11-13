import fs from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const headText = execSync("git show HEAD:app/desktop/session.ts", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const srcLines = headText.split(/\r?\n/);
const queueText = fs.readFileSync("app/desktop/session/delivery/queue.ts", "utf8");
const storeText = fs.readFileSync("app/desktop/session/delivery/store.ts", "utf8");
const facadeText = fs.readFileSync("app/desktop/session.ts", "utf8");

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const METHODS = [
  ["deliveryIsStopped", "delivery/queue", 761, 763],
  ["deliveryLifecycle", "delivery/queue", 764, 766],
  ["resumeDelivery", "delivery/queue", 767, 769],
  ["queueDirectNotification", "delivery/queue", 1651, 1668],
  ["forceResetDeliveryState", "delivery/queue", 4094, 4147],
  ["appTaskClientMessageId", "delivery/queue", 6151, 6157],
  ["appTaskClientMessageIdFromSeed", "delivery/queue", 6159, 6163],
  ["appDispatchClientMessageId", "delivery/queue", 6165, 6169],
  ["rememberAppTaskDelivered", "delivery/queue", 6171, 6180],
  ["pendingAppTaskDelivery", "delivery/queue", 6182, 6197],
  ["enqueueDelivery", "delivery/queue", 6199, 6218],
  ["withdraw", "delivery/queue", 6521, 6570],
  ["notifyRoleState", "delivery/queue", 6572, 6622],
  ["broadcastRoleStates", "delivery/queue", 6624, 6629],
  ["redeliverNudge", "delivery/queue", 9422, 9460],
  ["drainAllQueuesFor", "delivery/queue", 9563, 9574],
  ["drainPiQueuesAcrossProjects", "delivery/queue", 9576, 9584],
  ["waitForRunStopDeliveryClaims", "delivery/queue", 9586, 9615],
  ["drainQueue", "delivery/queue", 9617, 9641],
  ["drainQueueUnsafe", "delivery/queue", 9643, 10251],
  ["persistableDeliveryItem", "delivery/store", 6222, 6252],
  ["deliveryStoreItems", "delivery/store", 6254, 6274],
  ["deliveryQueuePersistenceFacts", "delivery/store", 6276, 6281],
  ["finishStopPersistence", "delivery/store", 6283, 6293],
  ["persistDeliveryQueues", "delivery/store", 6295, 6322],
  ["parsePersistedDeliveryItem", "delivery/store", 6324, 6398],
  ["restorePersistedDeliveries", "delivery/store", 6400, 6519],
];

/** 归一化（记录化适配）：
 *  1) 声明行 `private ` 前缀移除（模块内 public，供门面委托调用；门面/公开可见性不变）；
 *  2) 方法体内联 `import("…src/model/trunk.ts")` 相对深度规范化（模块目录多一层：../../ → ../../../；语义同一模块）。 */
function normalize(text) {
  let done = false;
  return text
    .split("\n")
    .map((line) => {
      if (!done && /^\s+private (async )?[A-Za-z0-9_$]+[<(]/.test(line)) {
        done = true;
        return line.replace(/^(\s+)private /, "$1");
      }
      return line;
    })
    .join("\n")
    .replace(/"\.\.\/(?:\.\.\/)*src\/model\/trunk\.ts"/g, '"<src>/model/trunk.ts"');
}

function extractBody(text) {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(?:private )?(?:async )?(?:[A-Za-z0-9_$]+)[<(]/.test(lines[i])) {
      for (let j = i; j < lines.length; j += 1) {
        if (lines[j].trimEnd().endsWith("{")) {
          start = j;
          break;
        }
      }
      break;
    }
  }
  if (start < 0) return text;
  const braceIndex = lines[start].lastIndexOf("{");
  const bodyLines = [lines[start].slice(braceIndex), ...lines.slice(start + 1)];
  return bodyLines.join("\n");
}

const reports = [];
for (const [name, target, start, end] of METHODS) {
  const sourceText = srcLines.slice(start - 1, end).join("\n") + "\n";
  const targetLines = (target === "delivery/queue" ? queueText : storeText).split("\n");
  const marker = `  // —— ${name}（B4 自 session.ts 逐字搬移）——`;
  const markerIndex = targetLines.indexOf(marker);
  if (markerIndex < 0) throw new Error(`marker not found for ${name}`);
  const targetText = targetLines.slice(markerIndex + 1, markerIndex + 1 + (end - start + 1)).join("\n") + "\n";
  const sourceNormalized = normalize(sourceText);
  const targetNormalized = normalize(targetText);
  const sourceBody = extractBody(sourceNormalized);
  const targetBody = extractBody(targetNormalized);
  const facadeDelegation = name === "waitForRunStopDeliveryClaims" || name === "withdraw" || name === "broadcastRoleStates" || name === "restorePersistedDeliveries" || name === "queueDirectNotification" || name === "redeliverNudge"
    ? new RegExp(`^  (?:async )?${name}\\(`, "m").test(facadeText)
    : new RegExp(`^  private (?:async )?${name}\\(`, "m").test(facadeText);
  reports.push({
    name,
    group: "delivery",
    target: target === "delivery/queue" ? "app/desktop/session/delivery/queue.ts" : "app/desktop/session/delivery/store.ts",
    sourceStartLine: start,
    sourceEndLine: end,
    targetStartLine: markerIndex + 2,
    targetEndLine: markerIndex + 1 + (end - start + 1),
    adaptations: [
      "visibility: private -> module public (declaration prefix only)",
      ...(name === "queueDirectNotification" ? ["inline import depth: ../../src -> ../../../src (module directory is one level deeper)"] : []),
    ],
    sourceTextSha256: sha(sourceText),
    targetTextSha256: sha(targetText),
    sourceNormalizedSha256: sha(sourceNormalized),
    targetNormalizedSha256: sha(targetNormalized),
    identicalUnderDocumentedAdaptations: sourceNormalized === targetNormalized,
    sourceBodySha256: sha(sourceBody),
    targetBodySha256: sha(targetBody),
    bodyIdentical: sourceBody === targetBody,
    facadeDelegationPresent: facadeDelegation,
  });
}

const allIdentical = reports.every((r) => r.identicalUnderDocumentedAdaptations && r.bodyIdentical && r.facadeDelegationPresent);
const out = {
  generatedAt: new Date().toISOString(),
  source: "git show HEAD:app/desktop/session.ts (e9d5783 = origin/main, contains B0-B3)",
  adaptations: [
    "receiver/state: 类外壳同名成员重建 this 面（delivery 单 owner 状态 / shared 同名同义委托 / 未迁出门面方法端口 / DeliverySink 发送端口）",
    "visibility: private -> 模块内 public（仅门面委托可调用；不进入公开导出面）",
    "inline import depth: queueDirectNotification 的 Extract<import(\"...src/model/trunk.ts\")> 相对路径随模块目录深度调整（../../ -> ../../../）",
  ],
  methodCount: reports.length,
  allIdenticalUnderDocumentedAdaptations: allIdentical,
  methods: reports,
};
fs.writeFileSync("角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b4-delivery_evidence/moved-methods.json", JSON.stringify(out, null, 2), "utf8");

const rows = reports.map((r) => `| \`${r.name}\` | \`${r.target}\` | ${r.sourceStartLine}-${r.sourceEndLine} | ${r.targetStartLine}-${r.targetEndLine} | ${r.identicalUnderDocumentedAdaptations && r.bodyIdentical ? "✅" : "❌"} \`${r.targetNormalizedSha256.slice(0, 16)}…\` |`);
const summary = `# B4 搬出方法摘要（27 方法，逐字移动证明）

- 源：git show HEAD:app/desktop/session.ts（e9d5783 = origin/main，含 B0–B3；10,252 行）
- 方法数：27（delivery/queue 20 / delivery/store 7）；全部在记录化适配下逐字节相等：**${reports.every((r) => r.identicalUnderDocumentedAdaptations) ? "true" : "false"}**；方法体 sha256 全部相等：**${reports.every((r) => r.bodyIdentical) ? "true" : "false"}**
- 归一化：仅（1）声明行 \`private \` 前缀去掉（模块内 public，供门面委托调用；门面侧可见性逐字不变）；（2）\`queueDirectNotification\` 的内联 \`import("…src/model/trunk.ts")\` 相对深度随模块目录调整（\`../../\` → \`../../../\`；同一模块）。方法体（含 JSDoc）零改动。

| 方法 | 模块 | HEAD 源行 | 目标行 | sha256(源归一化)=sha256(目标) |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
`;
fs.writeFileSync("角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b4-delivery_evidence/moved-methods-summary.md", summary, "utf8");
console.log(JSON.stringify({ methodCount: reports.length, allIdentical, failures: reports.filter((r) => !r.identicalUnderDocumentedAdaptations || !r.bodyIdentical || !r.facadeDelegationPresent).map((r) => r.name) }));
