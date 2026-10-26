// 独立验收：直接调用 DesktopInterface.flowStatus 读取真实项目 docs/flows（不起 Electron、不重启主进程）。
// 只读：调用前后对 docs/flows 文件名与内容做哈希对照，证明无写入。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createDesktopInterface } from "../../../../../app/desktop/interface.ts";
import { flowBadgeView, loadFlowStatus } from "../../../../../app/renderer/src/chat/flow-status.ts";

const projectRoot =
  "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/demos/wukong-2d";
const flowsDir = path.join(projectRoot, "docs", "flows");

function snapshot() {
  try {
    return readdirSync(flowsDir)
      .sort()
      .map((name) => {
        const file = path.join(flowsDir, name);
        const bytes = readFileSync(file);
        return {
          name,
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          mtime: statSync(file).mtime.toISOString(),
        };
      });
  } catch (error) {
    return { error: String(error) };
  }
}

const before = snapshot();
const iface = createDesktopInterface({
  pickDirectory: async () => null,
  emitEvent: () => {},
});
const reply = await iface.flowStatus(projectRoot);
const after = snapshot();

console.log("BEFORE=" + JSON.stringify(before));
console.log("REPLY_OK=" + reply.ok);
if (reply.ok) {
  console.log("FLOW_IDS=" + JSON.stringify(reply.flows.map((f) => f.flowId)));
  for (const flow of reply.flows) {
    console.log(
      "FLOW=" +
        JSON.stringify({
          flowId: flow.flowId,
          revision: flow.revision,
          total: flow.counts.total,
          done: flow.counts.done,
          counts: flow.counts,
          current: flow.current,
          updatedAt: flow.updatedAt,
          steps: flow.steps.map((s) => `${s.id}:${s.status}`),
        }),
    );
  }
  console.log("ERRORS=" + JSON.stringify(reply.errors));
  const model = await loadFlowStatus({ getFlowStatus: async () => reply }, projectRoot, "zh-CN");
  console.log("UI_MODEL_KIND=" + model.kind);
  console.log("UI_BADGE=" + JSON.stringify(flowBadgeView(model, "zh-CN")));
  if (model.kind === "ready") {
    console.log("UI_TOTALS=" + JSON.stringify({ done: model.done, total: model.total }));
    for (const flow of model.flows) {
      console.log(
        "UI_FLOW=" +
          JSON.stringify({
            flowId: flow.flowId,
            progressText: flow.progressText,
            progressPercent: flow.progressPercent,
            visibleSteps: flow.visibleSteps.map((s) => s.id),
            currentSteps: flow.currentSteps.map((s) => s.id),
          }),
      );
    }
  }
} else {
  console.log("REPLY_ERROR=" + JSON.stringify(reply));
}
console.log("AFTER=" + JSON.stringify(after));
console.log("READ_ONLY='" + (JSON.stringify(before) === JSON.stringify(after) ? "UNCHANGED" : "CHANGED") + "'");
