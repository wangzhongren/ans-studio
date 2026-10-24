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
  validateAcceptanceCriteriaText,
  acceptanceCriteriaRelPath,
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
  // 2026-10-22 第 1 项：任命由 Convener 发起（power=schedule）；旧 Nominator 存量条目仍可读。
  actorRoleId: "convener",
  power: "schedule",
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
    actorRoleId: "convener",
    power: "schedule",
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

/** 结构合格的实施前验收标准（O2 派发门槛用）。 */
function acceptanceCriteriaText(flowId = "flow-a"): string {
  return [
    `# 验收完成标准：${flowId}`,
    "",
    "| ID | 标准 | 需要的证据 | 结果 |",
    "| --- | --- | --- | --- |",
    "| P1 | 示例标准 | 测试输出 | 待判定 |",
    "",
    "风险档位：T3（治理/权限变更）。",
    "",
    "判定规则：pass / fail / insufficient evidence / not applicable。",
    "",
    "证据计划：单测原始输出与全量回归记录。",
    "",
    "版本冻结：v1 写盘后冻结。",
    "",
  ].join("\n");
}

function writeAcceptanceCriteria(
  root: string,
  flowId = "flow-a",
  text = acceptanceCriteriaText(flowId),
  version = 1,
): void {
  mkdirSync(join(root, "docs", "acceptance"), { recursive: true });
  writeFileSync(join(root, "docs", "acceptance", `${flowId}-criteria-v${version}.md`), text, "utf8");
}

/**
 * 结构化 flow YAML（2026-10-24 修订：criteria 门槛对所有**声明了 `acceptance-criteria` 步骤**的
 * 新契约 flow 生效，含非发布；`release` 只是可选发布元数据）。默认带新契约的 `acceptance-criteria`
 * 步骤；`criteriaStep: false` ⇒ 旧式 YAML（无该步骤，模拟迁移期流程）。
 * `impl` 步骤 owner 与派发目标 A 一致。
 */
function writeFlowYaml(
  root: string,
  options: { flowId?: string; stepId?: string; owner?: string; release?: boolean; criteriaStep?: boolean } = {},
): void {
  const flowId = options.flowId ?? "flow-a";
  const stepId = options.stepId ?? "impl";
  const owner = options.owner ?? "A";
  mkdirSync(join(root, "docs", "flows"), { recursive: true });
  writeFileSync(
    join(root, "docs", "flows", `${flowId}.yaml`),
    [
      `flowId: ${flowId}`,
      "version: 1",
      "qualityTier: production",
      ...(options.release === true ? ["release: true"] : []),
      "steps:",
      `  - id: ${stepId}`,
      "    title: 实现",
      `    owner: ${owner}`,
      "    kind: dispatch",
      "    status: pending",
      ...(options.criteriaStep === false
        ? []
        : [
            "  - id: acceptance-criteria",
            "    title: 实施前完成标准",
            "    owner: verifier",
            "    kind: artifact",
            "    status: pending",
          ]),
      "",
    ].join("\n"),
    "utf8",
  );
}

test("write-team-plan：Convener 在提案接受后放行；其他角色/缺 flowId 拒；旧 write-nomination 仍 legacy", () => {
  const teamPlan = input({ roleId: "convener", action: "write-team-plan", flowId: "flow-a" });
  assert.deepEqual(evaluateGovernanceGate(teamPlan, snapshot([ACCEPT])), { allowed: true });
  assert.deepEqual(evaluateGovernanceGate(teamPlan, snapshot([ACCEPT_QUICK])), { allowed: true });
  assert.equal(blocked(evaluateGovernanceGate(teamPlan, snapshot([]))), "proposal-not-accepted");
  assert.equal(
    blocked(evaluateGovernanceGate({ ...teamPlan, roleId: "nominator" }, snapshot([ACCEPT]))),
    "wrong-role",
  );
  assert.equal(
    blocked(evaluateGovernanceGate({ ...teamPlan, roleId: "rapporteur" }, snapshot([ACCEPT]))),
    "wrong-role",
  );
  assert.equal(
    blocked(evaluateGovernanceGate({ ...teamPlan, flowId: undefined }, snapshot([ACCEPT]))),
    "missing-flow-id",
  );
  // legacy：提名文件仍由 Nominator 在提案接受后写（迁移兼容）。
  const legacy = input({ roleId: "nominator", action: "write-nomination", flowId: "flow-a" });
  assert.deepEqual(evaluateGovernanceGate(legacy, snapshot([ACCEPT])), { allowed: true });
});

test("dispatch 正例：提案接受 + 任命名单 + 新契约流程标准存在 + 流程步骤 + 未派发 → 放行", () => {
  withRoot((root) => {
    writeFlowYaml(root, { release: true });
    writeAcceptanceCriteria(root);
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

test("dispatch 验收标准门槛（2026-10-24 修订：所有变更）：新契约 flow（含非发布）缺/坏标准一律拒；legacy 无 YAML/无 criteria 步骤豁免；accept-quick 豁免", () => {
  // 新契约非发布 flow（release 缺省）：缺 criteria ⇒ 拒绝——所有变更都要独立验收标准。
  withRoot((root) => {
    writeFlowYaml(root);
    const result = evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A]));
    assert.equal(blocked(result), "acceptance-criteria-missing", "非发布（release 缺省）同样要求验收标准文件");
    assert.match((result as { message: string }).message, /所有变更/, "文案改为所有变更口径");
    assert.doesNotMatch((result as { message: string }).message, /发布版本/, "文案不再以发布版本为前提");
  });

  // release: true 只是可选发布元数据：新契约 flow 缺 criteria 同样拒（口径与是否发布无关）。
  withRoot((root) => {
    writeFlowYaml(root, { release: true });
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A]))),
      "acceptance-criteria-missing",
      "release: true 不是启动条件，标准缺失同样拒绝",
    );
  });

  // 非发布新契约 flow + 最新标准存在且合格 ⇒ 放行。
  withRoot((root) => {
    writeFlowYaml(root);
    writeAcceptanceCriteria(root);
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A])),
      { allowed: true },
      "非发布（release 缺省）+ 标准合格 ⇒ 放行",
    );
  });

  // legacy Markdown（无 YAML）：没有机器状态可定位标准步骤，保留原放行。
  withRoot((root) => {
    writeFlow(root);
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A])),
      { allowed: true },
      "legacy .md 无 YAML ⇒ 豁免标准门（不新增不可满足的硬门）",
    );
  });

  // 旧式 YAML（无 acceptance-criteria 步骤）：同样保留原放行。
  withRoot((root) => {
    writeFlowYaml(root, { criteriaStep: false });
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A])),
      { allowed: true },
      "YAML 未声明 acceptance-criteria 步骤 ⇒ 豁免标准门",
    );
  });

  // legacy/无 appointment：标准门豁免，仍按既有任命门拒非快捷派发。
  withRoot((root) => {
    writeFlow(root);
    mkdirSync(join(root, "角色卡", "A"), { recursive: true });
    writeFileSync(join(root, "角色卡", "A", "role-card.md"), "# A\n");
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT]))),
      "appointment-required",
      "无 appointment 的旧流程不得先报标准缺失（显式豁免）",
    );
  });

  // 新契约 flow（非发布）+ 最新标准结构不合格 ⇒ 拒绝。
  withRoot((root) => {
    writeFlowYaml(root);
    writeAcceptanceCriteria(root, "flow-a", "# 只有标题\n");
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A]))),
      "acceptance-criteria-invalid",
    );
  });

  // v2 生效：只有 v2、结构合格 ⇒ 放行。
  withRoot((root) => {
    writeFlowYaml(root);
    writeAcceptanceCriteria(root, "flow-a", acceptanceCriteriaText("flow-a"), 2);
    assert.deepEqual(evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A])), { allowed: true });
  });

  // v1+v2：取 v2（v1 合格、v2 不合格 ⇒ 拒绝，不回退 v1）。
  withRoot((root) => {
    writeFlowYaml(root, { release: true });
    writeAcceptanceCriteria(root, "flow-a");
    writeAcceptanceCriteria(root, "flow-a", "# 只有标题\n", 2);
    assert.equal(
      blocked(evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A]))),
      "acceptance-criteria-invalid",
      "存在 v2 时必须校验 v2，不能回退合格的 v1",
    );
  });

  // v1+v2：取 v2（v1 不合格、v2 合格 ⇒ 放行）。
  withRoot((root) => {
    writeFlowYaml(root, { release: true });
    writeAcceptanceCriteria(root, "flow-a", "# 只有标题\n");
    writeAcceptanceCriteria(root, "flow-a", acceptanceCriteriaText("flow-a"), 2);
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A])),
      { allowed: true },
      "v2 合格即可，旧 v1 不影响",
    );
  });

  // accept-quick 快捷路径显式豁免（新契约 flow + 账本存在 appointment 决定也不要求标准）。
  withRoot((root) => {
    writeFlowYaml(root, { release: true });
    mkdirSync(join(root, "角色卡", "A"), { recursive: true });
    writeFileSync(join(root, "角色卡", "A", "role-card.md"), "# A\n");
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT_QUICK, APPOINT_A])),
      { allowed: true },
    );
  });
});

test("validateAcceptanceCriteriaText：flowId/验收表/档位/判定/证据计划/冻结缺一即不合格", () => {
  const valid = acceptanceCriteriaText("flow-a");
  assert.deepEqual(validateAcceptanceCriteriaText(valid, "flow-a"), { ok: true, issues: [] });
  assert.equal(validateAcceptanceCriteriaText("", "flow-a").ok, false);
  assert.deepEqual(validateAcceptanceCriteriaText(valid, "flow-b").ok, false, "flowId 不一致");

  const withoutTable = valid.replace("| ID | 标准 | 需要的证据 | 结果 |", "| 编号 | 标准 | 需要的证据 | 结果 |");
  assert.ok(validateAcceptanceCriteriaText(withoutTable, "flow-a").issues.some((issue) => issue.includes("验收表")));

  const withoutTier = valid.replace("风险档位：T3", "档位：高");
  assert.ok(validateAcceptanceCriteriaText(withoutTier, "flow-a").issues.some((issue) => issue.includes("风险档位")));

  const withoutRules = valid.replace("判定规则：pass / fail / insufficient evidence / not applicable。", "判定规则：看情况。");
  assert.ok(validateAcceptanceCriteriaText(withoutRules, "flow-a").issues.some((issue) => issue.includes("判定规则")));

  const withoutEvidencePlan = valid
    .replace("| ID | 标准 | 需要的证据 | 结果 |", "| ID | 标准 | 说明 | 结果 |")
    .replace("证据计划：单测原始输出与全量回归记录。", "证据：略。");
  assert.ok(validateAcceptanceCriteriaText(withoutEvidencePlan, "flow-a").issues.some((issue) => issue.includes("证据计划")));

  const withoutFreeze = valid.replace("版本冻结：v1 写盘后冻结。", "后续可改。");
  assert.ok(validateAcceptanceCriteriaText(withoutFreeze, "flow-a").issues.some((issue) => issue.includes("版本")));

  assert.equal(acceptanceCriteriaRelPath("flow-a"), "docs/acceptance/flow-a-criteria-v1.md");
  assert.equal(acceptanceCriteriaRelPath("flow-a", 2), "docs/acceptance/flow-a-criteria-v2.md");
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
    writeAcceptanceCriteria(root);
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

test("coordinate（2026-10-24 闸门 1）：仅 Liaison→Convener + 最新提案接受；flowId 必填、stepId 可选；不要求任命/步骤/去重", () => {
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

    // 2026-10-24 收紧（设计 v1 §6.4 闸门 1）：空账本/提案未接受 ⇒ 拒绝协调。
    assert.equal(blocked(evaluateGovernanceGate(coordinate(), snapshot([]))), "proposal-not-accepted");
    assert.equal(
      blocked(evaluateGovernanceGate(coordinate(), snapshot([decision({ decisionKind: "proposal-revise" })]))),
      "proposal-not-accepted",
    );
    // 提案接受/快捷接受后放行；不要求任命、步骤存在或未派发（没有流程文件也允许）。
    assert.deepEqual(evaluateGovernanceGate(coordinate(), snapshot([ACCEPT])), { allowed: true });
    assert.deepEqual(evaluateGovernanceGate(coordinate({ stepId: "delivery-backend" }), snapshot([ACCEPT])), {
      allowed: true,
    });
    assert.deepEqual(evaluateGovernanceGate(coordinate(), snapshot([ACCEPT_QUICK])), { allowed: true });

    assert.equal(blocked(evaluateGovernanceGate(coordinate({ flowId: undefined }), snapshot([ACCEPT]))), "missing-flow-id");
    assert.equal(blocked(evaluateGovernanceGate(coordinate({ stepId: "Bad_ID" }), snapshot([ACCEPT]))), "missing-step-id");
    assert.equal(blocked(evaluateGovernanceGate(coordinate({ roleId: "convener" }), snapshot([ACCEPT]))), "forbidden");
    assert.equal(blocked(evaluateGovernanceGate(coordinate({ roleId: "backend" }), snapshot([ACCEPT]))), "forbidden");
    assert.equal(
      blocked(evaluateGovernanceGate(coordinate({ targetRoleId: "backend" }), snapshot([ACCEPT]))),
      "forbidden",
    );
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

// —————————————————————— ⑥ slug 收紧（2026-10-22，S2/T7/T8） ——————————————————————

test("slug 收紧：尾连字符在 coordinate/dispatch 被拒，文案展示新正则；旧合法值零回归", () => {
  withRoot((root) => {
    writeFlow(root);

    const coordinate = (over: Partial<GovernanceGateInput> = {}): GovernanceGateInput =>
      input({
        projectRoot: root,
        action: "coordinate",
        roleId: "liaison",
        targetRoleId: "convener",
        flowId: "flow-a",
        ...over,
      });

    const badCoordinateFlow = evaluateGovernanceGate(coordinate({ flowId: "flow-" }), snapshot([ACCEPT]));
    assert.equal(blocked(badCoordinateFlow), "missing-flow-id");
    assert.match((badCoordinateFlow as { message: string }).message, /0,62/, "文案必须插值现行正则");
    const badCoordinateStep = evaluateGovernanceGate(coordinate({ stepId: "impl-" }), snapshot([ACCEPT]));
    assert.equal(blocked(badCoordinateStep), "missing-step-id");

    const badDispatchFlow = evaluateGovernanceGate(
      input({ projectRoot: root, action: "dispatch", flowId: "flow-", stepId: "impl", targetRoleId: "A" }),
      snapshot([ACCEPT, APPOINT_A]),
    );
    assert.equal(blocked(badDispatchFlow), "missing-flow-id");
    assert.match((badDispatchFlow as { message: string }).message, /0,62/);
    const badDispatchStep = evaluateGovernanceGate(
      input({ projectRoot: root, action: "dispatch", flowId: "flow-a", stepId: "impl-", targetRoleId: "A" }),
      snapshot([ACCEPT, APPOINT_A]),
    );
    assert.equal(blocked(badDispatchStep), "missing-step-id");

    // 旧合法值仍放行：含连续连字符（coordinate 不要求流程步骤存在；该 flow 的提案已接受即可）。
    const acceptDashed = decision({ flowId: "a--b", decisionKind: "proposal-accept", customerDecision: "accepted" });
    assert.deepEqual(evaluateGovernanceGate(coordinate({ flowId: "a--b" }), snapshot([acceptDashed])), { allowed: true });
    assert.deepEqual(evaluateGovernanceGate(coordinate({ stepId: "a--b" }), snapshot([ACCEPT])), { allowed: true });
  });
});

test("parseFlowStepIds：尾连字符步骤行不再被识别（fail-closed），连续连字符仍合法", () => {
  const ids = parseFlowStepIds(
    [
      "| stepId | 步骤 | 状态 |",
      "| --- | --- | --- |",
      "| impl- | 尾连字符 | pending |",
      "| impl | 合法 | pending |",
      "- a-：尾连字符列表行",
      "- a--b：连续连字符合法",
      "",
    ].join("\n"),
  );
  assert.deepEqual(ids, ["impl", "a--b"]);
});

// —————————————————————— 2026-10-22 MapReduce 方案 A：dispatch dependsOn 前置 done ——————————————————————

function writeYamlFlow(root: string, text: string, flowId = "flow-a"): void {
  mkdirSync(join(root, "docs", "flows"), { recursive: true });
  writeFileSync(join(root, "docs", "flows", `${flowId}.yaml`), text, "utf8");
}

function mapFlow(dependencyStatus: "done" | "pending"): string {
  return [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: contract-freeze",
    "    title: 冻结契约",
    "    owner: convener",
    "    kind: artifact",
    dependencyStatus === "done" ? "    status: done" : "    status: pending",
    ...(dependencyStatus === "done" ? ["    evidence: { kind: artifact, ref: docs/contracts/flow-a-v1.md }"] : []),
    "  - id: delivery-api",
    "    title: Map A｜api",
    "    owner: A",
    "    kind: dispatch",
    "    status: pending",
    "    parallelGroup: map-a",
    "    dependsOn: [contract-freeze]",
    "",
  ].join("\n");
}

test("dispatch dependsOn：前置全部 done ⇒ 放行；前置未 done ⇒ 拒（不改变派发权）", () => {
  withRoot((root) => {
    writeAcceptanceCriteria(root);
    writeYamlFlow(root, mapFlow("done"));
    const allowed = evaluateGovernanceGate(
      dispatchInput(root, { stepId: "delivery-api" }),
      snapshot([ACCEPT, APPOINT_A]),
    );
    assert.deepEqual(allowed, { allowed: true });

    writeYamlFlow(root, mapFlow("pending"));
    const blockedResult = evaluateGovernanceGate(
      dispatchInput(root, { stepId: "delivery-api" }),
      snapshot([ACCEPT, APPOINT_A]),
    );
    assert.equal(blocked(blockedResult), "dependencies-not-done");
    assert.match((blockedResult as { message: string }).message, /contract-freeze（pending）/);
    assert.match((blockedResult as { message: string }).message, /前置依赖尚未全部 done/);
  });
});

test("dispatch dependsOn：旧 flow（无 dependsOn）不新增检查；YAML 坏行仍 fail-closed", () => {
  withRoot((root) => {
    writeAcceptanceCriteria(root);
    // 旧版 .md 流程（无 dependsOn 概念）保持既有放行行为。
    writeFlow(root, "flow-a", ["impl"]);
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A])),
      { allowed: true },
    );

    // 无 dependsOn 的 YAML 步骤同样不新增前置检查。
    writeYamlFlow(
      root,
      [
        "flowId: flow-a",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: impl",
        "    title: 实现",
        "    owner: A",
        "    kind: dispatch",
        "    status: pending",
        "",
      ].join("\n"),
    );
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, APPOINT_A])),
      { allowed: true },
    );
  });
});

// —————————————————————— 2026-10-24 P0-3：dependsOn 解析 supersededBy 链 ——————————————————————

/** 返工替代链 flow：目标步骤 dependsOn 一个被 superseded 的旧步骤。 */
function supersedeChainFlow(lines: {
  middle?: "done" | "pending" | "superseded";
  final?: "done" | "pending";
  /** 第二跳：middle 再被 final 取代。 */
  twoHops?: boolean;
} = {}): string {
  const middle = lines.middle ?? "superseded";
  const final = lines.final ?? "done";
  const steps = [
    "  - id: delivery-persistence",
    "    title: 旧持久化",
    "    owner: A",
    "    kind: dispatch",
    "    status: superseded",
    ...(lines.twoHops === false ? [] : ["    supersededBy: delivery-persistence-rework"]),
    "  - id: delivery-persistence-rework",
    "    title: 返工持久化",
    "    owner: A",
    "    kind: dispatch",
    `    status: ${middle}`,
    ...(middle === "done"
      ? ["    evidence: { kind: dispatch, ref: delivery-persistence-rework }"]
      : []),
    ...(middle === "superseded" ? ["    supersededBy: delivery-persistence-final"] : []),
    ...(lines.twoHops === true
      ? [
          "  - id: delivery-persistence-final",
          "    title: 二次返工",
          "    owner: A",
          "    kind: dispatch",
          `    status: ${final}`,
          ...(final === "done" ? ["    evidence: { kind: dispatch, ref: delivery-persistence-final }"] : []),
        ]
      : []),
    "  - id: integration-e2e",
    "    title: 集成与演示",
    "    owner: A",
    "    kind: dispatch",
    "    status: pending",
    "    dependsOn: [delivery-persistence]",
  ];
  return ["flowId: flow-a", "version: 1", "qualityTier: production", "steps:", ...steps, ""].join("\n");
}

test("dispatch P0-3：前置 superseded ⇒ 解析到最终非 superseded 步骤判 done（单跳/链式均放行）", () => {
  withRoot((root) => {
    writeAcceptanceCriteria(root);
    writeYamlFlow(root, supersedeChainFlow({ middle: "done" }));
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root, { stepId: "integration-e2e" }), snapshot([ACCEPT, APPOINT_A])),
      { allowed: true },
      "单跳：旧步骤 superseded 但替代步骤 done ⇒ 放行",
    );

    writeYamlFlow(root, supersedeChainFlow({ twoHops: true, final: "done" }));
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root, { stepId: "integration-e2e" }), snapshot([ACCEPT, APPOINT_A])),
      { allowed: true },
      "链式：superseded → superseded → done ⇒ 解析到最终步骤放行",
    );
  });
});

test("dispatch P0-3：替代链最终步骤未 done ⇒ dependencies-not-done（文案给出解析后的步骤）", () => {
  withRoot((root) => {
    writeAcceptanceCriteria(root);
    writeYamlFlow(root, supersedeChainFlow({ middle: "pending" }));
    const result = evaluateGovernanceGate(
      dispatchInput(root, { stepId: "integration-e2e" }),
      snapshot([ACCEPT, APPOINT_A]),
    );
    assert.equal(blocked(result), "dependencies-not-done");
    assert.match((result as { message: string }).message, /delivery-persistence→delivery-persistence-rework（pending）/);
  });
});

test("dispatch P0-3：superseded 缺少 supersededBy ⇒ dependencies-unresolved（不按未 done 混同）", () => {
  withRoot((root) => {
    writeAcceptanceCriteria(root);
    writeYamlFlow(
      root,
      [
        "flowId: flow-a",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: delivery-persistence",
        "    title: 旧持久化",
        "    owner: A",
        "    kind: dispatch",
        "    status: superseded",
        "  - id: integration-e2e",
        "    title: 集成与演示",
        "    owner: A",
        "    kind: dispatch",
        "    status: pending",
        "    dependsOn: [delivery-persistence]",
        "",
      ].join("\n"),
    );
    const result = evaluateGovernanceGate(
      dispatchInput(root, { stepId: "integration-e2e" }),
      snapshot([ACCEPT, APPOINT_A]),
    );
    assert.equal(blocked(result), "dependencies-unresolved");
    assert.match((result as { message: string }).message, /缺少 supersededBy/);
    assert.doesNotMatch((result as { message: string }).message, /尚未全部 done/);
  });
});

test("dispatch P0-3：supersededBy 未知/成环的坏 flow ⇒ fail-closed（解析拒绝，不按未 done 混同）", () => {
  withRoot((root) => {
    writeAcceptanceCriteria(root);
    // supersededBy 指向不存在的步骤：parse 拒绝 ⇒ 门禁 fail-closed（flow-step-missing）。
    writeYamlFlow(
      root,
      [
        "flowId: flow-a",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: old-step",
        "    title: 旧步骤",
        "    owner: A",
        "    kind: dispatch",
        "    status: superseded",
        "    supersededBy: ghost-step",
        "  - id: integration-e2e",
        "    title: 集成",
        "    owner: A",
        "    kind: dispatch",
        "    status: pending",
        "    dependsOn: [old-step]",
        "",
      ].join("\n"),
    );
    assert.equal(
      blocked(
        evaluateGovernanceGate(dispatchInput(root, { stepId: "integration-e2e" }), snapshot([ACCEPT, APPOINT_A])),
      ),
      "flow-step-missing",
    );

    // 替代环：parse 拒绝 ⇒ 同样 fail-closed。
    writeYamlFlow(
      root,
      [
        "flowId: flow-a",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: step-a",
        "    title: A",
        "    owner: A",
        "    kind: dispatch",
        "    status: superseded",
        "    supersededBy: step-b",
        "  - id: step-b",
        "    title: B",
        "    owner: A",
        "    kind: dispatch",
        "    status: superseded",
        "    supersededBy: step-a",
        "  - id: integration-e2e",
        "    title: 集成",
        "    owner: A",
        "    kind: dispatch",
        "    status: pending",
        "    dependsOn: [step-a]",
        "",
      ].join("\n"),
    );
    assert.equal(
      blocked(
        evaluateGovernanceGate(dispatchInput(root, { stepId: "integration-e2e" }), snapshot([ACCEPT, APPOINT_A])),
      ),
      "flow-step-missing",
    );
  });
});

// —————————————————————— 2026-10-24 P1-4：dispatch 校验 step.owner === targetRoleId ——————————————————————

test("dispatch P1-4：owner 与目标一致放行；owner 非空且错配 ⇒ owner-mismatch；legacy .md 不新增检查", () => {
  withRoot((root) => {
    writeAcceptanceCriteria(root);
    writeYamlFlow(
      root,
      [
        "flowId: flow-a",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: impl",
        "    title: 实现",
        "    owner: B",
        "    kind: dispatch",
        "    status: pending",
        "",
      ].join("\n"),
    );
    // 任命名单含 A 与 B；步骤 owner=B，派给 A ⇒ owner-mismatch（不改变任命/标准门）。
    const appointmentAB = decision({
      actorRoleId: "convener",
      power: "schedule",
      decisionKind: "appointment",
      customerDecision: "appointed",
      targetRoleIds: ["A", "B"],
    });
    const mismatch = evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, appointmentAB]));
    assert.equal(blocked(mismatch), "owner-mismatch");
    assert.match((mismatch as { message: string }).message, /owner 是 B/);
    assert.match((mismatch as { message: string }).message, /派发目标 A/);

    // owner=B 且目标 B：owner 一致，放行（任命名单含 B、标准已存在）。
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root, { targetRoleId: "B" }), snapshot([ACCEPT, appointmentAB])),
      { allowed: true },
    );

    // 旧版 .md（无结构化 owner）保持既有行为，不新增 owner 检查。
    // 删除同名 YAML：YAML 存在即唯一机器状态，会遮蔽旧版 .md 回落。
    rmSync(join(root, "docs", "flows", "flow-a.yaml"), { force: true });
    writeFlow(root, "flow-a", ["impl"]);
    writeAcceptanceCriteria(root);
    assert.deepEqual(
      evaluateGovernanceGate(dispatchInput(root), snapshot([ACCEPT, appointmentAB])),
      { allowed: true },
    );
  });
});
