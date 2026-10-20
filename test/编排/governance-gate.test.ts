// test/编排/governance-gate.test.ts
// W2（2026-10-17）三道治理门禁（评审 §6.2）：提案接受门 / 任命写入门 / 派发范围门（五条）。
//
// 覆盖：
//   ① write-flow / write-nomination：无决定、revise/reject/unclassified 拒；accept / accept-quick 放行；
//      普通写盘确认（无 decisionKind）不覆盖此前接受决定；
//   ② write-role-card：最新任命决定的 targetRoleIds 必须含目标；最新任命替换旧任命；
//   ③ dispatch：内置目标拒、来源必须 Convener、提案已接受、任命/快捷路径、flowId+stepId 与流程步骤、
//      重复派发去重；逐条正反例；
//   ④ 账本快照 errors 非空 → 一切动作 fail-closed；single 模型不分流三权门禁；
//   ⑤ 流程单步骤解析（只看结构行首格/首词，不读 status）。
//
// 全部临时目录；不读 `.env`、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateGovernanceGate,
  parseFlowStepIds,
  type GovernanceGateInput,
} from "../../src/common/编排/governance-gate.ts";
import type { GovernanceLedgerEntry, GovernanceLedgerSnapshot } from "../../src/common/编排/governance-ledger.ts";

function withRoot<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "ans-gate-"));
  try {
    return fn(root);
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

let seq = 0;
function decision(over: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  seq += 1;
  return {
    at: `2026-10-17T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    kind: "customer.decision",
    actorRoleId: "rapporteur",
    power: "proposal",
    flowId: "flow-a",
    ...over,
  };
}

function snapshot(entries: GovernanceLedgerEntry[], errors: string[] = []): GovernanceLedgerSnapshot {
  return { entries, errors };
}

function input(over: Partial<GovernanceGateInput> = {}): GovernanceGateInput {
  return {
    projectRoot: "",
    model: "trio",
    roleId: "convener",
    action: "write-flow",
    flowId: "flow-a",
    ...over,
  };
}

function blocked(result: ReturnType<typeof evaluateGovernanceGate>): string {
  assert.equal(result.allowed, false);
  return (result as { code: string }).code;
}

const ACCEPT = decision({ decisionKind: "proposal-accept", customerDecision: "accepted" });
const ACCEPT_QUICK = decision({ decisionKind: "proposal-accept-quick", customerDecision: "accepted-quick" });
const APPOINT_A = decision({
  actorRoleId: "nominator",
  power: "nomination",
  decisionKind: "appointment",
  customerDecision: "appointed",
  targetRoleIds: ["A"],
});

// —————————————————————— ① 提案接受门 ——————————————————————

test("write-flow：无决定 / revise / reject 拒；accept / accept-quick 放行", () => {
  const base = input({ roleId: "convener", action: "write-flow", flowId: "flow-a" });
  assert.equal(blocked(evaluateGovernanceGate(base, snapshot([]))), "proposal-not-accepted");

  for (const kind of ["proposal-revise", "proposal-reject"] as const) {
    const result = evaluateGovernanceGate(base, snapshot([decision({ decisionKind: kind })]));
    assert.equal(blocked(result), "proposal-not-accepted", kind);
  }
  assert.deepEqual(evaluateGovernanceGate(base, snapshot([ACCEPT])), { allowed: true });
  assert.deepEqual(evaluateGovernanceGate(base, snapshot([ACCEPT_QUICK])), { allowed: true });
});

test("旧账本兼容：accept 后的 unclassified/none（无 cardKind 污染）不覆盖真正决定", () => {
  const base = input({ roleId: "convener", action: "write-flow", flowId: "flow-a" });
  const polluted = decision({ decisionKind: "unclassified", customerDecision: "none" });
  assert.deepEqual(evaluateGovernanceGate(base, snapshot([ACCEPT, polluted])), { allowed: true });
  // Crew（Nominator）提名门禁同样可用。
  const nomination = input({ roleId: "nominator", action: "write-nomination", flowId: "flow-a" });
  assert.deepEqual(evaluateGovernanceGate(nomination, snapshot([ACCEPT, polluted])), { allowed: true });
});

test("write-flow：最新提案决定生效——后一次 revise 覆盖此前 accept；普通写盘确认不覆盖", () => {
  const base = input({ roleId: "convener", action: "write-flow", flowId: "flow-a" });
  const revise = decision({ decisionKind: "proposal-revise", customerDecision: "changes-requested" });
  assert.equal(blocked(evaluateGovernanceGate(base, snapshot([ACCEPT, revise]))), "proposal-not-accepted");

  const ordinaryWrite = decision({ decisionKind: undefined, customerDecision: "accepted", paths: ["角色卡/A/role-card.md"] });
  assert.deepEqual(evaluateGovernanceGate(base, snapshot([ACCEPT, ordinaryWrite])), { allowed: true });
});

test("write-nomination：同一提案接受门；来源必须是 Nominator；flowId 必填", () => {
  const base = input({ roleId: "nominator", action: "write-nomination", flowId: "flow-a" });
  assert.deepEqual(evaluateGovernanceGate(base, snapshot([ACCEPT])), { allowed: true });
  assert.equal(
    blocked(evaluateGovernanceGate({ ...base, roleId: "convener" }, snapshot([ACCEPT]))),
    "wrong-role",
  );
  assert.equal(
    blocked(evaluateGovernanceGate({ ...base, flowId: undefined }, snapshot([ACCEPT]))),
    "missing-flow-id",
  );
});

// —————————————————————— ② 任命写入门 ——————————————————————

test("write-role-card：最新任命含目标才放行；未含/无任命拒；最新任命替换旧任命", () => {
  const base = input({ roleId: "nominator", action: "write-role-card", flowId: "flow-a", targetRoleId: "A" });
  assert.equal(blocked(evaluateGovernanceGate(base, snapshot([]))), "appointment-required");
  assert.deepEqual(evaluateGovernanceGate(base, snapshot([APPOINT_A])), { allowed: true });

  const other = evaluateGovernanceGate(
    { ...base, targetRoleId: "B" },
    snapshot([APPOINT_A]),
  );
  assert.equal(blocked(other), "appointment-required");

  const newerOnlyB = decision({
    actorRoleId: "nominator",
    power: "nomination",
    decisionKind: "appointment",
    customerDecision: "appointed",
    targetRoleIds: ["B"],
  });
  assert.equal(
    blocked(evaluateGovernanceGate(base, snapshot([APPOINT_A, newerOnlyB]))),
    "appointment-required",
    "最新任命移除 A 后不得继续写 A",
  );
});

test("write-role-card：无 flowId 时在全部 flow 的任命决定中查找（写卡路径无 flow 上下文）", () => {
  const noFlow = input({ roleId: "nominator", action: "write-role-card", targetRoleId: "A" });
  assert.deepEqual(evaluateGovernanceGate(noFlow, snapshot([APPOINT_A])), { allowed: true });
});

// —————————————————————— ③ 派发范围门（五条） ——————————————————————

/** 流程单：表格首格为步骤 id（`impl`）。 */
function writeFlow(root: string, flowId = "flow-a", stepIds: string[] = ["impl"]): void {
  mkdirSync(join(root, "docs", "flows"), { recursive: true });
  writeFileSync(
    join(root, "docs", "flows", `${flowId}.md`),
    [
      `# 流程 ${flowId}`,
      "",
      "| 步骤 | 主人 | 状态 |",
      "| --- | --- | --- |",
      ...stepIds.map((id) => `| ${id} | 实现者 | pending |`),
      "",
    ].join("\n"),
  );
}

function dispatchInput(root: string, over: Partial<GovernanceGateInput> = {}): GovernanceGateInput {
  return input({
    projectRoot: root,
    roleId: "convener",
    action: "dispatch",
    flowId: "flow-a",
    stepId: "impl",
    targetRoleId: "A",
    ...over,
  });
}

test("dispatch 正例：提案接受 + 任命名单 + 流程步骤 + 未派发 → 放行", () => {
  withRoot((root) => {
    writeFlow(root);
    const result = evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A]));
    assert.deepEqual(result, { allowed: true });
  });
});

test("dispatch：内置目标（三人与 su）一律拒；来源必须是 Convener", () => {
  withRoot((root) => {
    writeFlow(root);
    for (const target of ["rapporteur", "nominator", "convener", "su"]) {
      const result = evaluateGovernanceGate(
        dispatchInput(root, { targetRoleId: target }),
        snapshot([ACCEPT, APPOINT_A]),
      );
      assert.equal(blocked(result), "builtin-target", target);
    }
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root, { roleId: "rapporteur" }), snapshot([ACCEPT, APPOINT_A]))),
      "wrong-role",
    );
  });
});

test("dispatch：flowId/stepId 必填；提案未接受拒；目标不在任命名单拒", () => {
  withRoot((root) => {
    writeFlow(root);
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root, { flowId: undefined }), snapshot([ACCEPT, APPOINT_A]))),
      "missing-flow-id",
    );
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root, { stepId: undefined }), snapshot([ACCEPT, APPOINT_A]))),
      "missing-step-id",
    );
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root), snapshot([APPOINT_A]))),
      "proposal-not-accepted",
    );
    const result = evaluateGovernanceGate(dispatchInput(root, { targetRoleId: "B" }), snapshot([ACCEPT, APPOINT_A]));
    assert.equal(blocked(result), "appointment-required");
  });
});

test("dispatch：快捷路径（accept-quick）可跳过任命复用既有项目角色；非既有角色仍拒", () => {
  withRoot((root) => {
    writeFlow(root);
    mkdirSync(join(root, "角色卡", "A"), { recursive: true });
    writeFileSync(join(root, "角色卡", "A", "role-card.md"), "# A\n");

    const ok = evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT_QUICK]));
    assert.deepEqual(ok, { allowed: true });

    const notExisting = evaluateGovernanceGate(
      dispatchInput(root, { targetRoleId: "B" }),
      snapshot([ACCEPT_QUICK]),
    );
    assert.equal(blocked(notExisting), "quick-target-not-project-role");
  });
});

test("dispatch：流程文件/步骤缺失拒；同一 flowId+stepId 重复派发去重", () => {
  withRoot((root) => {
    // 没有 docs/flows/flow-a.md
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A]))),
      "flow-step-missing",
    );

    writeFlow(root, "flow-a", ["other-step"]);
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A]))),
      "flow-step-missing",
    );

    writeFlow(root);
    const dispatched = decision({
      kind: "dispatch.accepted",
      actorRoleId: "convener",
      power: "schedule",
      decisionKind: undefined,
      stepId: "impl",
      targetRoleId: "A",
    });
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A, dispatched]))),
      "duplicate-dispatch",
    );
  });
});

test("coordinate：仅 Liaison→Convener；flowId 必填、stepId 可选；不要求提案/任命/流程步骤/去重", () => {
  withRoot((root) => {
    const coordinate = (over: Partial<GovernanceGateInput> = {}): GovernanceGateInput =>
      input({
        projectRoot: root,
        action: "coordinate",
        roleId: "liaison",
        targetRoleId: "convener",
        flowId: "flow-a",
        ...over,
      });

    // 空账本 + 没有流程文件/步骤 ⇒ 仍允许（协调消息不是项目步骤派发）。
    assert.deepEqual(evaluateGovernanceGate(coordinate(), snapshot([])), { allowed: true });
    assert.deepEqual(evaluateGovernanceGate(coordinate({ stepId: "delivery-backend" }), snapshot([])), { allowed: true });

    assert.equal(blocked(evaluateGovernanceGate(coordinate({ flowId: undefined }), snapshot([]))), "missing-flow-id");
    assert.equal(blocked(evaluateGovernanceGate(coordinate({ stepId: "Bad_ID" }), snapshot([]))), "missing-step-id");
    assert.equal(blocked(evaluateGovernanceGate(coordinate({ roleId: "convener" }), snapshot([]))), "forbidden");
    assert.equal(blocked(evaluateGovernanceGate(coordinate({ roleId: "backend" }), snapshot([]))), "forbidden");
    assert.equal(blocked(evaluateGovernanceGate(coordinate({ targetRoleId: "backend" }), snapshot([]))), "forbidden");
    assert.equal(blocked(evaluateGovernanceGate(coordinate(), snapshot([], ["坏行"]))), "ledger-corrupt");

    // 既有 dispatch 零放宽：空账本 Convener→项目角色仍 proposal-not-accepted。
    assert.equal(
      blocked(evaluateGovernanceGate(input({ projectRoot: root, action: "dispatch", roleId: "convener", stepId: "impl", targetRoleId: "A" }), snapshot([]))),
      "proposal-not-accepted",
    );
  });
});

// —————————————————————— ④ fail-closed / 旧模型 ——————————————————————

test("账本快照 errors 非空 → 一切门禁动作 fail-closed（文案指向 ledger.jsonl）", () => {
  const broken = snapshot([ACCEPT, APPOINT_A], ["第 1 行不是合法 JSON"]);
  for (const gateInput of [
    input({ roleId: "convener", action: "write-flow" }),
    input({ roleId: "nominator", action: "write-role-card", targetRoleId: "A" }),
    input({ roleId: "convener", action: "dispatch", stepId: "impl", targetRoleId: "A" }),
  ]) {
    const result = evaluateGovernanceGate(gateInput, broken);
    assert.equal(blocked(result), "ledger-corrupt");
    assert.match((result as { message: string }).message, /ledger\.jsonl/);
  }
});

test("single 模型：不分流三权门禁（旧行为逐字不变）", () => {
  const result = evaluateGovernanceGate(
    input({ model: "single", roleId: "su", action: "dispatch", targetRoleId: "convener" }),
    snapshot([], ["坏账本"]),
  );
  assert.deepEqual(result, { allowed: true });
});

// —————————————————————— ⑤ 流程单步骤解析 ——————————————————————

test("parseFlowStepIds：表格首格 / 列表首词；表头/分隔行/正文 token 不算", () => {
  const ids = parseFlowStepIds(
    [
      "# flow",
      "正文提到 impl 但这不是步骤行。",
      "| 步骤 | 主人 | 状态 |",
      "| --- | --- | --- |",
      "| `impl` | 实现者 | pending |",
      "| review-1 | 审查者 | done |",
      "- [ ] dispatch-1：派发",
      "* acceptance：验收",
      "- 不是slug的步骤 名字",
      "",
    ].join("\n"),
  );
  assert.deepEqual(ids, ["impl", "review-1", "dispatch-1", "acceptance"]);
});
