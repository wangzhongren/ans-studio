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
import { fileURLToPath } from "node:url";

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

/** 仓库根（本文件位于 test/编排/）：chief 流程资源是卡文的单一来源。 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readChiefResource = (name: "chief-workflow.md" | "chief-workflow-v2.md"): string =>
  fs.readFileSync(path.join(REPO_ROOT, "src/common/门禁引擎/workflows/chief", name), "utf8");

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

// 冻结名保留（历史标题「幕僚卡要求…」）。现行模型（e71501c）：chief 卡只委派流程给应用注入的
// `chief-workflow.md` 资源（不使用卡内副本）；纪律正文在资源中，worker 卡的 submit_report 要求不变。
test("卡片文本：幕僚卡要求派发后结束本轮、禁止 sleep/轮询空转；五张 worker 卡要求完成任务必须 submit_report", () => {
  const chief = governanceRoleOf("chief");
  assert.ok(chief, "注册表应有 chief");
  assert.match(chief!.cardText, /Chief自身流程以实际注入的独立 chief-workflow\.md 为准/, "幕僚卡必须委派流程资源");
  assert.match(chief!.cardText, /不使用卡内另一份流程副本/, "幕僚卡不得保留第二份流程副本");
  const workflow = readChiefResource("chief-workflow.md");
  assert.match(workflow, /完成本轮必要的派发后结束本轮/, "流程资源必须写明派发后结束本轮");
  assert.match(workflow, /不要 sleep、连续轮询 role_status 或空转/, "流程资源必须禁止 sleep/轮询空转");
  assert.match(workflow, /等待真实回报或系统巡检输入/, "流程资源必须说明由真实回报驱动下一轮");
  assert.equal(chief!.cardText.includes("派发后立即结束本轮"), false, "卡内不再复制流程纪律（资源单一来源）");
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


// 冻结名保留（历史 v4.1 标题）。现行资源驱动：主链顺序/一步一派被 `chief-workflow.md` 的
// 「按缺口选择责任者」与同轮并行纪律取代；五角色产物/回报责任与 convener dispatch 能力仍成立。
test("v4.1 工作流卡文本：幕僚主链顺序一步一派；产品/策划/人事/运营/质检含各自产物与回报目标；convener 获得 dispatch 能力", () => {
  const chief = governanceRoleOf("chief")!.cardText;
  assert.match(chief, /chief-workflow\.md/);
  assert.match(chief, /不使用卡内另一份流程副本/);
  const workflow = readChiefResource("chief-workflow.md");
  assert.match(workflow, /按缺口选择责任者/, "流程资源按真实缺口选择责任者（不固定角色顺序）");
  assert.match(workflow, /Product 补产品目标、范围和验收依据/, "产品产物/责任保留");
  assert.match(workflow, /Rapporteur 契约\/名单缺项或 run 切换未就绪/, "策划契约/名单责任保留");
  assert.match(workflow, /Nominator 的 plan\/D3\/三文档或范围错误/, "人事计划/D3/三文档责任保留");
  assert.match(workflow, /Verifier 缺标准、候选或物证/, "质检标准/候选/物证责任保留");
  assert.match(workflow, /独立任务可在同一轮并行派发/, "现行派发纪律允许同轮并行（不再强制一步一派）");

  assert.match(governanceRoleOf("product")!.cardText, /docs\/product\/<flowId>-intent-vN\.md/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /project-roster\/v3/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /<flowId>-roster-vN\.md/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /<flowId>-architecture-vN\.md/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /人员\+模块拓扑图/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /contract_check/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /topic:"modules"/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /publicContract.*非空字符串/);
  assert.match(governanceRoleOf("rapporteur")!.cardText, /management.*扁平数组/);
  assert.match(governanceRoleOf("nominator")!.cardText, /cardKind=appointment/);
  assert.match(governanceRoleOf("nominator")!.cardText, /decisionId/);
  assert.match(governanceRoleOf("convener")!.cardText, /D3 选中/);
  assert.match(governanceRoleOf("convener")!.cardText, /不得发 appointment/);
  assert.match(governanceRoleOf("verifier")!.cardText, /request_choice\(cardKind=acceptance/);

  assert.equal(governanceCapabilitiesOf("convener")!.dispatchTask, true, "v4.1：运营拥有 dispatch 能力（作用域由前置校验执行）");
  assert.equal(governanceCapabilitiesOf("nominator")!.dispatchTask, false);
});

// 冻结名保留（历史标题「验收卡发起权归质检」）。现行 fixed 模型：验收 = 独立质检报告 + Chief
// 业务决策 + 应用归档 `docs/acceptance/`；固定路径不发 acceptance 卡（chief-workflow-v2.md），
// Chief 直接创建 Verifier 任务（运营不派新质检、不发 acceptance 卡）。
test("卡片文本：验收卡发起权归质检——运营只可 dispatch 质检，幕僚不得要求运营提交验收卡", () => {
  const convener = governanceRoleOf("convener")!.cardText;
  const verifier = governanceRoleOf("verifier")!.cardText;
  const fixed = readChiefResource("chief-workflow-v2.md");
  assert.match(convener, /由 Chief 创建 Verifier 任务、接收报告并收口/, "运营卡：质检任务由 Chief 创建");
  assert.match(convener, /你不派新质检、不发 acceptance 卡、不代客户验收/, "运营卡：不派新质检/不发 acceptance/不代客户验收");
  assert.match(fixed, /固定路径.*不发 acceptance 卡/, "fixed 资源：固定路径不发 acceptance 卡");
  assert.match(fixed, /验收 = 独立质检报告 \+ 你的业务决策 \+ 应用写 `docs\/acceptance\/` 归档/, "fixed 资源：验收由质检报告+Chief 决策+应用归档构成");
  assert.match(fixed, /你只发 stage-request，或直接创建 verifier\/验收角色的独立验收任务/, "fixed 资源：Chief 直接创建验收任务，不经运营发验收卡");
  assert.match(verifier, /request_choice\(cardKind=acceptance/, "质检卡原有 acceptance 发起句不得受影响");
  assert.equal(convener.includes("可发起验收＝用 `dispatch_task` 派质检"), false, "旧「运营 dispatch 质检」文案已退役");
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
