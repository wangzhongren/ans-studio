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
import type { CustomerInputFn, CustomerInputRequest } from "../../src/model/runtime.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import {
  openRoleSession,
  type AdapterCapabilities,
} from "../../src/pipeline/orchestration/run-role.ts";
import type { HandbackEvent, OrchestrationEvent } from "../../src/common/编排/handback.ts";
import { governanceCapabilitiesOf, governanceRoleOf } from "../../src/common/门禁引擎/governance-roles.ts";

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


test("v4.1 工作流卡文本：幕僚主链顺序一步一派；产品/策划/人事/运营/质检含各自产物与回报目标；convener 获得 dispatch 能力", () => {
  const chief = governanceRoleOf("chief")!.cardText;
  assert.match(chief, /主链顺序（必须）/);
  assert.match(chief, /①产品出「产品意图文档」/);
  assert.match(chief, /②策划出「方案 \+ 人员名单 \+ 项目架构」/);
  assert.match(chief, /③人事按名单招人写卡/);
  assert.match(chief, /④把项目交付运营/);
  assert.match(chief, /不直接给项目 worker 派实现任务/);
  assert.match(chief, /派人事：应用要求名单存在且合法/);
  assert.match(chief, /派运营：应用要求 D3 选中的角色卡已写好/);

  assert.match(governanceRoleOf("product")!.cardText, /docs\/product\/<flowId>-intent-vN\.md/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /project-roster\/v3/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /<flowId>-roster-vN\.md/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /<flowId>-architecture-vN\.md/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /人员\+模块拓扑图/);
  assert.match(governanceRoleOf("nominator")!.cardText, /cardKind=appointment/);
  assert.match(governanceRoleOf("nominator")!.cardText, /decisionId/);
  assert.match(governanceRoleOf("convener")!.cardText, /D3 选中/);
  assert.match(governanceRoleOf("convener")!.cardText, /不得发 appointment/);
  assert.match(governanceRoleOf("verifier")!.cardText, /发起方/);

  assert.equal(governanceCapabilitiesOf("convener")!.dispatchTask, true, "v4.1：运营拥有 dispatch 能力（作用域由前置校验执行）");
  assert.equal(governanceCapabilitiesOf("nominator")!.dispatchTask, false);
});

test("卡片文本：验收卡发起权归质检——运营只可 dispatch 质检，幕僚不得要求运营提交验收卡", () => {
  const convener = governanceRoleOf("convener")!.cardText;
  const chief = governanceRoleOf("chief")!.cardText;
  const verifier = governanceRoleOf("verifier")!.cardText;
  assert.match(convener, /可发起验收＝用 `dispatch_task` 派质检（verifier）执行核对/, "运营卡必须写明验收由 dispatch 质检发起");
  assert.match(convener, /验收卡（acceptance）由质检发起/, "运营卡必须写明 acceptance 卡由质检发起");
  assert.match(convener, /不得发 acceptance 卡/, "运营卡必须写明自己不得发 acceptance 卡");
  assert.match(convener, /不得代客户验收/, "既有纪律保留：运营不得代客户验收");
  assert.match(chief, /最终验收：由质检（verifier）发起验收卡/, "幕僚卡必须写明最终验收卡由质检发起");
  assert.match(chief, /不要要求运营（convener）提交验收卡/, "幕僚卡必须禁止要求运营提交验收卡");
  assert.match(chief, /让运营 dispatch 质检/, "幕僚卡必须给出需要验收时的调度路线");
  assert.match(verifier, /request_choice\(cardKind=acceptance/, "质检卡原有 acceptance 发起句不得受影响");
});

test("cardKind 越权拒绝：convener 发 acceptance ⇒ 不弹卡，文案指出由质检发起并给出改派办法", async () => {
  const project = trioProject();
  try {
    let rawCalls = 0;
    const raw: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { selected: ["accept"] } };
    };
    const stub = stubAdapter();
    const handle = await openRoleSession(
      { roleId: "convener", project, customerInput: raw },
      { createAdapter: stub.createAdapter },
    );
    const request: CustomerInputRequest = {
      kind: "choice",
      title: "验收核对",
      cardKind: "acceptance",
      flowId: "focus",
      options: [{ id: "accept", label: "通过" }, { id: "reject", label: "不通过" }],
    };
    const outcome = await stub.caps()!.customerInput!(request, { flowId: "focus", cardKind: "acceptance" });
    assert.equal(outcome?.outcome, "declined", "越权 cardKind 必须 fail-closed");
    const reason = outcome?.outcome === "declined" ? outcome.reason ?? "" : "";
    assert.match(reason, /治理角色 convener 不允许 cardKind=acceptance/);
    assert.match(reason, /该类卡由质检 verifier 发起/, "文案必须说明该卡种由谁发起");
    assert.match(reason, /允许：decision/, "既有白名单提示保留");
    assert.match(reason, /请改为 dispatch_task 给 verifier 执行验收，或请幕僚调度质检/, "文案必须给出可操作的改派路线");
    assert.match(reason, /本次未向客户发卡、未写任何记录/, "文案必须说明未发卡、未写记录");
    assert.equal(rawCalls, 0, "未向客户发卡（fail-closed）");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});
