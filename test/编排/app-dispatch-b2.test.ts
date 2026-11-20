// test/编排/app-dispatch-b2.test.ts
// 2026-11-17（v2.2 第一步测试批 T2，测试角色；建议项）：**B2 应用确定性派生的边界/歧义 fail-closed**。
//
// 依据：设计 §三 3.2（B2 说明）、§7.2（`b-change-scope-invalid` 阻塞、不猜范围）、Q4；v3 资源「路径 B 要点」。
// 覆盖：
//   1. 无名单且无 `角色卡/<role>/boundary.*` ⇒ `b-change-scope-invalid`（不猜属主）；
//   2. 同一路径被两个角色边界声明 ⇒ 属主不唯一 ⇒ fail-closed；
//   3. 治理文档属主不是策划/产品 ⇒ `b-change-scope-requires-rapporteur`；
//   4. `.ans/**`、`角色卡/**` 永不进入实现写集；
//   5. 影响面报告字节 hash 漂移 ⇒ `b-change-scope-invalid`；
//   6. 合法边界派生（单属主）⇒ effectiveWritesets 精确（scope ∩ 角色边界属主）。
//
// 夹具：临时目录 + 真实 `角色卡/<role>/boundary.yaml`；无 Git/端口/网络/.env。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  appendWorkflowEvent,
  derivePathBWriteSets,
  readWorkflowLedger,
  recordChangeScopeDecision,
  selectWorkflow,
} from "../../src/common/编排/workflow-service.ts";
import { WORKFLOW_LEDGER_SCHEMA } from "../../src/model/runtime.ts";

const FLOW = "snake";
const AT = "2026-11-18T03:00:00.000Z";

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

async function makeRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-app-dispatch-b2-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeFile(root: string, rel: string, text: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, "utf8");
}

/** 角色边界夹具（`角色卡/<role>/boundary.yaml`；无名单时 B2 按项目边界派生属主）。 */
async function writeBoundary(root: string, roleId: string, entries: Array<{ path: string; kind?: "directory" | "file" }>): Promise<void> {
  const lines: string[] = ["entries:"];
  for (const entry of entries) {
    lines.push(`  - root: project`, `    path: ${entry.path}`, `    kind: ${entry.kind ?? "directory"}`, "    purpose: fixture");
  }
  await writeFile(root, `角色卡/${roleId}/boundary.yaml`, `${lines.join("\n")}\n`);
}

async function startB(root: string): Promise<string> {
  const selected = await selectWorkflow({
    projectRoot: root, flowId: FLOW, workflowPath: "B", sourceTaskId: "turn-b2-1",
  });
  assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
  if (!selected.ok) throw new Error("unreachable");
  return selected.workflowId;
}

/** 夹具：workflow.started + B1 completed（B2 派生窗口）。 */
async function seedB1Completed(root: string, workflowId: string): Promise<void> {
  const at = new Date(AT).toISOString();
  const requested = await appendWorkflowEvent(root, {
    v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
    workflowId, flowId: FLOW, path: "B", idempotencyKey: `seed-request:${workflowId}:B1`,
    stage: "B1", requestTaskId: "seed-task:B1", requestDigest: sha("b1"), attempt: 1,
  });
  assert.equal(requested.ok, true);
  const completed = await appendWorkflowEvent(root, {
    v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
    workflowId, flowId: FLOW, path: "B", idempotencyKey: `seed-complete:${workflowId}:B1`,
    stage: "B1", cause: { kind: "task-closed", ref: "seed-task:B1" }, artifacts: [],
  });
  assert.equal(completed.ok, true);
}

test("B2 派生 fail-closed：无名单/无边界 ⇒ b-change-scope-invalid；歧义属主/治理文档属主/应用与角色卡路径全部拒绝", async () => {
  const root = await makeRoot();
  try {
    const WF = await startB(root);
    await seedB1Completed(root, WF);
    // 无名单且无角色卡边界 ⇒ 不猜属主。
    const none = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WF, scopeFiles: ["src/core/snake.ts"],
    });
    assert.equal(none.ok, false);
    if (!none.ok) {
      assert.equal(none.code, "b-change-scope-invalid");
      assert.match(none.message, /无名单且未找到/);
    }
    // 应用写区/角色卡写区永不进入实现写集。
    const appPath = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WF, scopeFiles: [".ans/state/tasks.jsonl"],
    });
    assert.equal(appPath.ok, false);
    if (!appPath.ok) assert.match(appPath.message, /\.ans\/\*\* 属应用写区/);
    const rolePath = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WF, scopeFiles: ["角色卡/worker/boundary.yaml"],
    });
    assert.equal(rolePath.ok, false);
    if (!rolePath.ok) assert.match(rolePath.message, /角色卡\/\*\* 属角色\/人事写区/);

    // 歧义属主：两个角色的边界都覆盖同一路径 ⇒ 不唯一 ⇒ fail-closed。
    await writeBoundary(root, "alpha", [{ path: "src/core/" }]);
    await writeBoundary(root, "beta", [{ path: "src/core/" }]);
    const ambiguous = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WF, scopeFiles: ["src/core/snake.ts"],
    });
    assert.equal(ambiguous.ok, false);
    if (!ambiguous.ok) {
      assert.equal(ambiguous.code, "b-change-scope-invalid");
      assert.match(ambiguous.message, /属主不唯一/);
    }

    // 治理文档由实现角色属主 ⇒ 要求策划/产品出新（b-change-scope-requires-rapporteur）。
    await writeBoundary(root, "worker", [{ path: "docs/governance/" }]);
    const governance = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WF, scopeFiles: ["docs/governance/worker/snake-impact-v1.md"],
    });
    assert.equal(governance.ok, false);
    if (!governance.ok) assert.equal(governance.code, "b-change-scope-requires-rapporteur");
  } finally {
    await cleanup(root);
  }
});

test("B2 派生正例与 hash 漂移：单属主 ⇒ effectiveWritesets 精确；影响面字节漂移 ⇒ 拒绝且不写 change.scope-decided", async () => {
  const root = await makeRoot();
  try {
    const WF = await startB(root);
    await seedB1Completed(root, WF);
    await writeBoundary(root, "worker", [{ path: "src/core/" }]);
    await writeBoundary(root, "analyst", [{ path: "src/cli/" }]);
    const derived = await derivePathBWriteSets({
      projectRoot: root, flowId: FLOW, workflowId: WF,
      scopeFiles: ["src/core/snake.ts", "src/cli/main.ts", "src/core/food.ts"],
    });
    assert.equal(derived.ok, true, derived.ok === false ? `${derived.code}: ${derived.message}` : "");
    if (derived.ok) {
      assert.equal(derived.source, "boundary");
      assert.deepEqual(derived.writesets, [
        { roleId: "analyst", paths: ["src/cli/main.ts"] },
        { roleId: "worker", paths: ["src/core/food.ts", "src/core/snake.ts"] },
      ], "写集按角色排序、路径排序（应用派生，不采信模型自报）");
    }
    // 影响面报告真实文件 + hash ⇒ change.scope-decided 写入（B2 完成）。
    await writeFile(root, "docs/governance/rapporteur/snake-impact-v1.md", "# 影响面\n\ncore/cli 修复。\n");
    const impactPath = "docs/governance/rapporteur/snake-impact-v1.md";
    const impactSha = sha(await fs.readFile(path.join(root, "docs", "governance", "rapporteur", "snake-impact-v1.md")));
    const decided = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId: WF, operationId: "op-b2-1",
      impactReport: { path: impactPath, sha256: impactSha },
      scope: { summary: "B2 派生", files: ["src/core/snake.ts", "src/cli/main.ts"] },
      requestTaskId: "seed-task:B1",
    });
    assert.equal(decided.ok, true, decided.ok === false ? `${decided.code}: ${decided.message}` : "");
    if (decided.ok) {
      assert.deepEqual(decided.writesets, [
        { roleId: "analyst", paths: ["src/cli/main.ts"] },
        { roleId: "worker", paths: ["src/core/snake.ts"] },
      ]);
      assert.equal(decided.replay, false);
    }
    // 幂等重放：同影响面/同 scope ⇒ 同事件，不重复写。
    const replay = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId: WF, operationId: "op-b2-2",
      impactReport: { path: impactPath, sha256: impactSha },
      scope: { summary: "B2 派生", files: ["src/core/snake.ts", "src/cli/main.ts"] },
      requestTaskId: "seed-task:B1",
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);
    assert.equal((await readWorkflowLedger(root)).events.filter((event) =>
      event.workflowId === WF && event.kind === "change.scope-decided").length, 1);
  } finally {
    await cleanup(root);
  }
});

test("B2 hash 漂移：声明 hash 与真实字节不一致 ⇒ b-change-scope-invalid（零事件写入）", async () => {
  const root = await makeRoot();
  try {
    const WF = await startB(root);
    await seedB1Completed(root, WF);
    await writeBoundary(root, "worker", [{ path: "src/core/" }]);
    await writeFile(root, "docs/governance/rapporteur/snake-impact-v1.md", "# 影响面\n\n真实字节。\n");
    const before = (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF).length;
    const drifted = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId: WF, operationId: "op-b2-drift",
      impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: "a".repeat(64) },
      scope: { summary: "漂移", files: ["src/core/snake.ts"] },
      requestTaskId: "seed-task:B1",
    });
    assert.equal(drifted.ok, false);
    if (!drifted.ok) {
      assert.equal(drifted.code, "b-change-scope-invalid");
      assert.match(drifted.message, /字节 hash 不一致/);
    }
    const after = (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF).length;
    assert.equal(after, before, "hash 漂移不得写 change.scope-decided");
  } finally {
    await cleanup(root);
  }
});
