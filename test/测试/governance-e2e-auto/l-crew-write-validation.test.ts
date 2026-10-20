// test/测试/governance-e2e-auto/l-crew-write-validation.test.ts
// 2026-10-20 客户要求：Crew 的 appointment-write 写出角色卡/边界后，应用做**确定性门控**——
//   · role-card.md 存在、可读、非空且至少一个 Markdown 标题；
//   · boundary.yaml 存在、可读、可解析；顶层 role 与目录 id 一致；entries 非空；
//   · 有问题 ⇒ 不派 Convener、不把 appointment 步骤标 done、不弹客户卡；把具体路径/错误退回 Crew 修正
//     （同 flow+问题哈希去重，重复 settle 不刷屏）；
//   · 修正后重新写卡并通过校验 ⇒ 继续派 Convener 恰一次。
//
// 本文件走真实桌面 Interface + 真实 run-role/listing/账本；Crew 的写盘用直接文件写入模拟
// （boundary 非法内容会被 write_file 的写前格式校验拒绝；门控必须能拦住任何来源的坏文件）。
// 模型为脚本桩，判断开关全开（appointment-write 卡的真实代批路径由 c-appointment-timing 覆盖）。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  FLOW,
  FLOW_REL,
  flowDoc,
  makeHarness,
  makeRoot,
  seedConfirmedIntent,
  seedLedger,
  seedTrioProject,
  write,
  type Harness,
} from "./fixture.ts";

const ROLE_ID = "executor";
const ROLE_DIR = `角色卡/${ROLE_ID}`;
const ROLE_CARD_REL = `${ROLE_DIR}/role-card.md`;
const ROLE_BOUNDARY_REL = `${ROLE_DIR}/boundary.yaml`;
const VALID_CARD = "# 角色：executor\n\n由 Crew 写出。\n";
const VALID_BOUNDARY = [
  "role: executor",
  "entries:",
  "  - kind: directory",
  "    path: src/owned-executor/",
  "    purpose: 角色代码",
  "",
].join("\n");

function writeAbs(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

/** 前置：trio 项目 + 流程状态 YAML + 提案接受 + 任命 executor；目标角色卡/边界由用例写入。 */
async function seedAppointment(root: string): Promise<void> {
  seedTrioProject(root);
  write(root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "pending" }]));
  await seedLedger(root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
    {
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: [ROLE_ID],
    },
  ]);
  await seedConfirmedIntent(root);
}

// 修正任务/系统行的稳定片段（产品文案为「写卡产物未通过确定性校验」，系统行为「写卡产物未通过校验」）。
const CORRECTION_RE = /写卡产物未通过/;

function correctionsOf(h: Harness): string[] {
  return (h.prompts.get("nominator") ?? []).filter((prompt) => CORRECTION_RE.test(prompt));
}

function leadValidationNotes(h: Harness): string[] {
  return h.events.flatMap((envelope) => {
    if (envelope.roleId !== "liaison") return [];
    const event = envelope.event as { detail?: { source?: string }; summary?: string };
    if (event.detail?.source !== "delivery-note") return [];
    const summary = event.summary ?? "";
    return CORRECTION_RE.test(summary) ? [summary] : [];
  });
}

interface BadCase {
  name: string;
  apply(root: string): void;
  expected: RegExp;
}

const BAD_CASES: BadCase[] = [
  {
    name: "缺 role-card.md",
    apply: (root) => writeAbs(root, ROLE_BOUNDARY_REL, VALID_BOUNDARY),
    expected: /角色卡\/executor\/role-card\.md：文件不存在/,
  },
  {
    name: "缺 boundary.yaml",
    apply: (root) => writeAbs(root, ROLE_CARD_REL, VALID_CARD),
    expected: /角色卡\/executor\/boundary\.yaml：文件不存在/,
  },
  {
    name: "空 role-card",
    apply: (root) => {
      writeAbs(root, ROLE_CARD_REL, "\n");
      writeAbs(root, ROLE_BOUNDARY_REL, VALID_BOUNDARY);
    },
    expected: /角色卡\/executor\/role-card\.md：文件为空/,
  },
  {
    name: "boundary 混入 Markdown",
    apply: (root) => {
      writeAbs(root, ROLE_CARD_REL, VALID_CARD);
      writeAbs(
        root,
        ROLE_BOUNDARY_REL,
        ["```yaml", "role: executor", "entries:", "  - kind: directory", "    path: src/owned-executor/", "```", ""].join("\n"),
      );
    },
    expected: /角色卡\/executor\/boundary\.yaml：边界 YAML 解析失败/,
  },
  {
    name: "role 与目录不一致",
    apply: (root) => {
      writeAbs(root, ROLE_CARD_REL, VALID_CARD);
      writeAbs(root, ROLE_BOUNDARY_REL, VALID_BOUNDARY.replace("role: executor", "role: other"));
    },
    expected: /角色卡\/executor\/boundary\.yaml：顶层 role 与目录 id 不一致/,
  },
];

test("正常写卡 ⇒ 确定性校验通过，继续派 Convener 恰一次", async () => {
  const temp = makeRoot("crew-write-valid");
  await seedAppointment(temp.root);
  const h = await makeHarness({
    tag: "crew-write-valid",
    root: temp.root,
    approval: true,
    decision: true,
    onPrompt: (ctx) => {
      if (ctx.roleId !== "nominator" || CORRECTION_RE.test(ctx.prompt)) return;
      writeAbs(temp.root, ROLE_CARD_REL, VALID_CARD);
      writeAbs(temp.root, ROLE_BOUNDARY_REL, VALID_BOUNDARY);
    },
  });
  try {
    await h.open("nominator");
    const sent = await h.send("nominator", "请写出 executor 的角色卡与边界。");
    assert.equal(sent.ok, true, sent.error ?? "");

    await h.waitFor(() => (h.prompts.get("convener")?.length ?? 0) === 1, 5000);
    assert.equal(correctionsOf(h).length, 0, "校验通过不得退回 Crew 修正");
    assert.equal(h.prompts.get("convener")!.length, 1, "Convener 恰一次");
    assert.match(h.prompts.get("convener")![0]!, /客户已完成任命 executor/);
    assert.equal(h.presented.length, 0, "正常写卡全程 0 张客户卡");

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener"),
      3000,
    );
    assert.equal(
      ledger.entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener").length,
      1,
      "Convener 派发账本恰一条",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

for (const bad of BAD_CASES) {
  test(`写卡校验失败（${bad.name}）⇒ 不派 Convener、Crew 收到具体修正任务、无客户卡、重复 settle 不刷屏`, async () => {
    const temp = makeRoot(`crew-write-bad-${BAD_CASES.indexOf(bad)}`);
    await seedAppointment(temp.root);
    const h = await makeHarness({
      tag: "crew-write-bad",
      root: temp.root,
      approval: true,
      decision: true,
      onPrompt: (ctx) => {
        if (ctx.roleId !== "nominator") return;
        if (CORRECTION_RE.test(ctx.prompt)) return; // 本用例不修正：验证去重/不刷屏
        bad.apply(temp.root);
      },
    });
    try {
      await h.open("nominator");
      const sent = await h.send("nominator", "请写出 executor 的角色卡与边界。");
      assert.equal(sent.ok, true, sent.error ?? "");

      await h.waitFor(() => correctionsOf(h).length > 0, 5000);
      const first = correctionsOf(h);
      assert.equal(first.length, 1, "首次校验失败恰一条修正任务");
      assert.match(first[0]!, bad.expected, `修正任务须含具体路径/错误（${bad.name}）`);
      assert.match(first[0]!, /重新发 appointment-write 确认卡/, "修正任务须要求重发 appointment-write 卡");
      assert.equal(h.prompts.get("convener")?.length ?? 0, 0, "校验失败不得派 Convener");
      assert.equal(h.presented.length, 0, "校验失败不得弹客户卡");

      // 修正任务本身会跑一轮并 settle，触发重复检查；同 flow+问题哈希必须去重。
      await new Promise((resolve) => setTimeout(resolve, 1200));
      assert.equal(correctionsOf(h).length, 1, "同问题重复 settle 不得重复反馈");
      assert.equal(leadValidationNotes(h).length, 1, "Lead 系统行同问题不刷屏");
      assert.equal(h.prompts.get("convener")?.length ?? 0, 0, "重复 settle 仍不得派 Convener");
    } finally {
      await h.stop();
      h.cleanup();
      temp.cleanup();
    }
  });
}

test("Crew 修正后重新写卡 ⇒ 校验通过并继续派 Convener 恰一次", async () => {
  const temp = makeRoot("crew-write-corrected");
  await seedAppointment(temp.root);
  const h = await makeHarness({
    tag: "crew-write-corrected",
    root: temp.root,
    approval: true,
    decision: true,
    onPrompt: (ctx) => {
      if (ctx.roleId !== "nominator") return;
      if (CORRECTION_RE.test(ctx.prompt)) {
        // 修正：补上缺失的 role-card（boundary 保持合法）。
        writeAbs(temp.root, ROLE_CARD_REL, VALID_CARD);
        writeAbs(temp.root, ROLE_BOUNDARY_REL, VALID_BOUNDARY);
        return;
      }
      // 初次写卡：只写 boundary，缺 role-card ⇒ 触发门控。
      writeAbs(temp.root, ROLE_BOUNDARY_REL, VALID_BOUNDARY);
    },
  });
  try {
    await h.open("nominator");
    const sent = await h.send("nominator", "请写出 executor 的角色卡与边界。");
    assert.equal(sent.ok, true, sent.error ?? "");

    await h.waitFor(() => correctionsOf(h).length > 0, 5000);
    assert.equal(correctionsOf(h).length, 1, "首次失败恰一条修正任务");
    assert.match(correctionsOf(h)[0]!, /role-card\.md：文件不存在/);

    await h.waitFor(() => (h.prompts.get("convener")?.length ?? 0) === 1, 5000);
    assert.equal(h.prompts.get("convener")!.length, 1, "修正通过后 Convener 恰一次");
    assert.equal(correctionsOf(h).length, 1, "修正通过后不再重复反馈");
    assert.equal(h.presented.length, 0, "全程 0 张客户卡");

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener"),
      3000,
    );
    assert.equal(
      ledger.entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener").length,
      1,
      "Convener 派发账本恰一条",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
