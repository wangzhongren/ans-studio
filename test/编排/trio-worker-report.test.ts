// test/编排/trio-worker-report.test.ts
// 2026-10-29 客户真机缺陷（幕僚派发的内置 worker 不回短报 / 幕僚 sleep 轮询空转）的编排钉子：
//   · `suppressHandback` 语义修正后：trio 五个内置 worker（产品/策划/人事/运营/质检）**注入**
//     `reportHandback`（`submit_report` 据此注册），幕僚（chief，不自我回交）与旧 single/su 模型
//     **不注入**——注入矩阵逐角色断言；
//   · 内置 worker 交报告 → 回交事件取报告值（status/summary/evidence），端到端；
//   · 卡片文本（注册表单一来源）：幕僚卡要求「派发后立即结束本轮 / 不用 run_shell sleep /
//     不连续 role_status 轮询」；五张 worker 卡要求「任务完成必须 submit_report 回短报」。
// 全程桩适配器：不触网、不落盘（persistSession 缺省按夹具走，无真实模型）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import {
  openRoleSession,
  type AdapterCapabilities,
} from "../../src/pipeline/orchestration/run-role.ts";
import type { HandbackEvent, OrchestrationEvent } from "../../src/common/编排/handback.ts";
import { governanceRoleOf } from "../../src/common/门禁引擎/governance-roles.ts";

const WORKER_IDS = ["product", "rapporteur", "nominator", "convener", "verifier"] as const;

/** trio 项目夹具（内置治理角色经 builtInRoles 声明；五个 worker + chief）。 */
function trioProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-trio-report-"));
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  // su（single 旧模型）解析要读治理边界文件；trio 内置角色走注册表不需要。
  fs.mkdirSync(path.join(root, "角色卡"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "governance-boundary.yaml"), "role: governance\nentries: []\n");
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["chief", ...WORKER_IDS],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:trio-worker-report" },
    },
  };
}

function cleanup(project: ProjectConfig): void {
  fs.rmSync(project.projectRoot, { recursive: true, force: true });
}

/** 捕获能力面 + 可脚本化事件流的桩适配器工厂（与 handback.test.ts 同款口径）。 */
function stubAdapter(events: SessionEvent[] = [{ kind: "settled", summary: "会话结束" }]): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    caps: () => captured,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                for (const e of events) yield e;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

function isHandback(ev: OrchestrationEvent): ev is HandbackEvent {
  return ev.kind === "handback";
}

test("submit_report 注入矩阵：trio 五个内建 worker 有；幕僚无；single/su 无", async () => {
  for (const roleId of WORKER_IDS) {
    const project = trioProject();
    try {
      const stub = stubAdapter();
      const handle = await openRoleSession({ roleId, project }, { createAdapter: stub.createAdapter });
      assert.ok(
        stub.caps()?.reportHandback,
        `${roleId}（trio worker）必须注入 reportHandback——否则 submit_report 不注册，worker 无法回短报`,
      );
      await handle.dispose();
    } finally {
      cleanup(project);
    }
  }

  // 幕僚本人不自我回交（无 submit_report）。
  {
    const project = trioProject();
    try {
      const stub = stubAdapter();
      const handle = await openRoleSession({ roleId: "chief", project }, { createAdapter: stub.createAdapter });
      assert.equal(stub.caps()?.reportHandback, undefined, "chief 不注入 reportHandback（不自我回交）");
      await handle.dispose();
    } finally {
      cleanup(project);
    }
  }

  // 旧 single 模型的内置 su：仍不注入（回交主体是 worker，不是治理角色本身）。
  {
    const project = trioProject();
    project.builtInRoles = ["su"];
    project.governanceModel = "single";
    try {
      const stub = stubAdapter();
      const handle = await openRoleSession({ roleId: "su", project }, { createAdapter: stub.createAdapter });
      assert.equal(stub.caps()?.reportHandback, undefined, "su 不注入 reportHandback（single/su 旧模型不变）");
      await handle.dispose();
    } finally {
      cleanup(project);
    }
  }
});

test("内建 worker 交报告：回交事件取报告值（status/summary/evidence），不再标记「未提交正式任务报告」", async () => {
  const project = trioProject();
  try {
    const stub = stubAdapter([
      { kind: "accepted", summary: "write_file 执行完成" },
      { kind: "settled", summary: "会话结束" },
    ]);
    const handle = await openRoleSession({ roleId: "convener", project, taskId: "T-report" }, { createAdapter: stub.createAdapter });
    await handle.send("补交上一轮番茄钟任务的工作短报");
    assert.ok(stub.caps()!.reportHandback!, "convener 应有 reportHandback");
    stub.caps()!.reportHandback!({
      status: "completed",
      summary: "运营短报：已补交并行任务记录",
      evidence: ["docs/scheduling/report.md"],
    });
    const events: OrchestrationEvent[] = [];
    for await (const ev of handle.events()) events.push(ev);
    const handback = (events.find(isHandback) as HandbackEvent).handback;
    assert.equal(handback.roleId, "convener");
    assert.equal(handback.taskId, "T-report");
    assert.equal(handback.status, "completed", "取报告值");
    assert.equal(handback.summary, "运营短报：已补交并行任务记录", "取报告摘要，而非「未提交正式任务报告」");
    assert.deepEqual(handback.evidence, ["docs/scheduling/report.md"], "证据取报告值");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("卡片文本：幕僚卡要求派发后结束本轮、禁止 sleep/轮询空转；五张 worker 卡要求完成任务必须 submit_report", () => {
  const chief = governanceRoleOf("chief");
  assert.ok(chief, "注册表应有 chief");
  assert.match(chief!.cardText, /派发后立即结束本轮/, "幕僚卡必须写明派发后结束本轮");
  assert.match(chief!.cardText, /不要用 `run_shell` sleep/, "幕僚卡必须禁止 run_shell sleep 等待");
  assert.match(chief!.cardText, /连续 `role_status` 轮询/, "幕僚卡必须禁止连续 role_status 轮询空转");
  assert.match(chief!.cardText, /短报\/任务回报会作为新消息送达你并开启新一轮/, "幕僚卡必须说明短报会开启新一轮");
  assert.equal(chief!.cardText.includes("收到幕僚派发的任务"), false, "幕僚卡不得含 worker 专用的「收到幕僚派发的任务」句");

  for (const roleId of WORKER_IDS) {
    const spec = governanceRoleOf(roleId);
    assert.ok(spec, `注册表应有 ${roleId}`);
    assert.match(
      spec!.cardText,
      /收到幕僚派发的任务：完成后\*\*必须\*\*用 `submit_report` 回短报/,
      `${roleId} 卡必须要求完成任务后 submit_report 回短报`,
    );
    assert.equal(spec!.cardText.includes("派发后立即结束本轮"), false, `${roleId} 卡不得混入幕僚的派发纪律`);
  }
});
