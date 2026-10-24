// test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts
// 2026-10-23 S5 终验：治理写卡推进的可重入门禁闭环（governance-advance-redispatch，T3）。
//
// 覆盖（方案 §8.3 验收要点 1–5/7 的 e2e 面；S3 已完成函数级单测）：
//   1. 首次写卡成功并派 Convener 后，Crew **内容变化**重写 ⇒ 以新指纹/新版本化键重新校验并再次派发
//      （旧实现被永久运行期键挡住；这里断言两次 readiness 派发、dedupeKey 不同）。
//   2. 连续两次不同内容的错误写卡 ⇒ 逐次反馈 Crew；修正后 ⇒ role-cards 恰一次 done（artifact 记录 +
//      artifact.observed 恰一条）、readiness 恰一次派发、无客户卡、无应用写 customer.decision。
//   3. 同内容重复 settle/refresh 与 mtime-only 变化 ⇒ 不重复反馈/派发/记录（内容指纹去重）。
//   4. boundary 条目逆序 ⇒ 仍通过并收口（不依赖条目顺序）。
//   5. 团队计划存在但 flow 缺 role-cards 步骤 ⇒ 反馈 Convener、不派 readiness、无客户卡；同指纹不刷屏。
//   6. 手工改文件 + listProject 刷新 ⇒ 探针排检查：不合格反馈 Crew，修正后收口 + 派 readiness（无 Crew 事件）。
//
// 口径：模型为脚本桩；全部离线；不启动真实 Electron；不写目标项目（本文件的刷新用例只用临时夹具）。
// role-cards 步骤使用 **artifact** kind（dispatch kind 由 S3 `test/编排/flow-service.test.ts` 覆盖）。
// 应用侧完成/派发**不得**写 customer.decision、不得弹客户卡；Crew 的 appointment-write 卡（测试 1）
// 由既有判断链自动代批，是本用例用于产生「新 Crew 写卡账本锚」的真实路径。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  FLOW,
  FLOW_REL,
  TEAM_PLAN_REL,
  flowDoc,
  makeHarness,
  makeRoot,
  roleBoundaryDoc,
  roleCardDoc,
  roleWorkDocs,
  seedConfirmedIntent,
  seedLedger,
  seedTrioProject,
  teamPlanV2Doc,
  write,
  writeRoleArtifacts,
  type Harness,
  type ScriptContext,
} from "./fixture.ts";

const ROLE_ID = "executor";
const ROLE_CARD_REL = `角色卡/${ROLE_ID}/role-card.md`;
const ROLE_BOUNDARY_REL = `角色卡/${ROLE_ID}/boundary.yaml`;
const RECORD_DIR_REL = `.ans/governance/role-cards/${FLOW}`;
const ROLE_CARD_FILE_NAMES = [
  "role-card.md",
  "boundary.yaml",
  "feature-map.md",
  "functional-description.md",
  "memo.md",
  "api-spec.md",
] as const;

const CORRECTION_RE = /写卡产物未通过/;
// 只匹配「readiness 任务」本体：反馈文案里也会提到 role-readiness（如「未派 role-readiness」），不能计入。
const READINESS_RE = /逐角色做角色就绪复核/;

/** 任命前种子：trio + flow（role-cards artifact + role-readiness）+ v2 团队计划 + 提案接受/任命 + 意图。 */
async function seedRedispatchProject(
  root: string,
  options: { withRoleCardsStep?: boolean } = {},
): Promise<void> {
  seedTrioProject(root);
  const withRoleCards = options.withRoleCardsStep !== false;
  write(
    root,
    FLOW_REL,
    flowDoc(FLOW, [
      ...(withRoleCards ? [{ id: "role-cards", status: "pending", kind: "artifact", owner: "nominator" }] : []),
      { id: "role-readiness", status: "pending", kind: "dispatch", owner: "convener" },
    ]),
  );
  write(
    root,
    TEAM_PLAN_REL,
    teamPlanV2Doc(FLOW, {
      // v2 角色粒度规则：至少一个 Reduce 角色（module/并行组 reduce、测试面含集成/e2e、dependsOn 覆盖全部 Map）。
      rows: [
        { roleId: ROLE_ID, module: "executor", writes: `src/owned-${ROLE_ID}/` },
        {
          roleId: "reducer",
          module: "reduce",
          type: "new",
          writes: "docs/verification/",
          parallelGroup: "reduce",
          testSurface: "集成 e2e 检查",
          dependsOn: ROLE_ID,
        },
      ],
    }),
  );
  await seedLedger(root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
    {
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: [ROLE_ID],
      artifactPath: TEAM_PLAN_REL,
    },
  ]);
  await seedConfirmedIntent(root);
}

function correctionsOf(h: Harness): string[] {
  return (h.prompts.get("nominator") ?? []).filter((prompt) => CORRECTION_RE.test(prompt));
}

function convenerPrompts(h: Harness): string[] {
  return h.prompts.get("convener") ?? [];
}

function readinessDispatches(entries: readonly { kind: string; targetRoleId?: string; actorRoleId?: string; stepId?: string }[]) {
  return entries.filter(
    (entry) =>
      entry.kind === "dispatch.accepted" &&
      entry.targetRoleId === "convener" &&
      entry.actorRoleId === "app" &&
      entry.stepId === "role-readiness",
  );
}

function artifactObservedEntries(
  entries: readonly { kind: string; actorRoleId?: string; power?: string; artifactPath?: string }[],
) {
  return entries.filter(
    (entry) =>
      entry.kind === "artifact.observed" &&
      entry.actorRoleId === "app" &&
      entry.power === "app" &&
      typeof entry.artifactPath === "string" &&
      entry.artifactPath.startsWith(`.ans/governance/role-cards/${FLOW}/`),
  );
}

function customerDecisions(entries: readonly { kind: string }[]) {
  return entries.filter((entry) => entry.kind === "customer.decision");
}

/** flow YAML 断言：role-cards 步骤存在且 done、证据为 artifact。 */
function assertRoleCardsDone(root: string): string {
  const text = readFileSync(path.join(root, ...FLOW_REL.split("/")), "utf8");
  const block = /- id: role-cards\n([\s\S]*?)(?:\n  - id: |\n*$)/.exec(text);
  assert.ok(block !== null, "flow 应存在 role-cards 步骤");
  assert.match(block![1]!, /status: done/, "role-cards 步骤应为 done");
  assert.match(block![1]!, /kind: artifact/, "role-cards 步骤应为 artifact kind");
  const ref = /ref: (.+)/.exec(block![1]!)?.[1]?.trim();
  assert.ok(ref !== undefined && ref !== "", "role-cards done 应带 evidence.ref");
  return ref!;
}

/** role-cards 验证记录：恰好一条 JSON，结构校验通过、语义仍 pending。 */
function assertRoleCardsRecord(root: string, evidenceRef: string): void {
  const dirAbs = path.join(root, ...RECORD_DIR_REL.split("/"));
  const files = readdirSync(dirAbs).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 1, "role-cards 验证记录应恰一条（同内容幂等）");
  assert.equal(`${RECORD_DIR_REL}/${files[0]}`, evidenceRef, "flow evidence.ref 应指向验证记录");
  const record = JSON.parse(readFileSync(path.join(dirAbs, files[0]!), "utf8")) as {
    schema?: string;
    flowId?: string;
    roleIds?: string[];
    fingerprint?: string;
    result?: string;
    semantic?: string;
    files?: Array<{ path: string; sha256: string }>;
  };
  assert.equal(record.flowId, FLOW);
  assert.deepEqual(record.roleIds, [ROLE_ID]);
  assert.equal(record.result, "structure-pass");
  assert.equal(record.semantic, "pending", "结构校验通过 ≠ readiness/语义通过");
  assert.equal(record.files?.length, ROLE_CARD_FILE_NAMES.length, "六文件哈希应全部记录");
  assert.match(record.fingerprint ?? "", /^[0-9a-f]{64}$/);
}

/** Crew 写卡任务：appointment-write 卡（真实判断链自动代批，产生新 Crew 写卡账本锚）。 */
function appointmentWriteCard(): { name: string; toolCallId: string; args: Record<string, unknown> } {
  const paths = ROLE_CARD_FILE_NAMES.map((name) => `角色卡/${ROLE_ID}/${name}`);
  return {
    name: "request_confirmation",
    toolCallId: "tc-redispatch-appointment-write",
    args: {
      title: `写盘确认 ${FLOW}`,
      paths,
      preview: [
        "将写入以下文件（逐路径正文，redispatch e2e 夹具）：",
        "",
        ...paths.map((rel) => `## ${rel}\n\n（内容由临时项目内的确定性夹具写出）\n`),
      ].join("\n"),
      flowId: FLOW,
      cardKind: "appointment-write",
    },
  };
}

/** 触发一次 nominator 轮次（settle 触发写卡后检查）。 */
async function triggerCrewTurn(h: Harness, text: string): Promise<void> {
  let sent = await h.send("nominator", text);
  if (sent.ok !== true && /会话尚未开启/.test(sent.error ?? "")) {
    await h.open("nominator");
    sent = await h.send("nominator", text);
  }
  assert.equal(sent.ok, true, sent.error ?? "");
}

test("首次通过后 Crew 内容变化重写 ⇒ 新指纹重新校验并再次派 readiness（不被永久运行期键挡住）", async () => {
  const temp = makeRoot("redispatch-reentrant");
  await seedRedispatchProject(temp.root);
  let writeRound = 0;
  const h = await makeHarness({
    tag: "redispatch-reentrant",
    root: temp.root,
    approval: true,
    decision: true,
    onPrompt: (ctx) => {
      if (ctx.roleId !== "nominator" || CORRECTION_RE.test(ctx.prompt)) return;
      if (!/写卡|重写/.test(ctx.prompt)) return;
      writeRound += 1;
      writeRoleArtifacts(temp.root, ROLE_ID);
      if (writeRound >= 2) {
        // 内容变化（不是 mtime）：追加一节，产生新指纹。
        write(temp.root, ROLE_CARD_REL, `${roleCardDoc(ROLE_ID)}\n## 附注\n\n2026-10-23 重写：补充工作立场与交接说明。\n`);
      }
    },
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId !== "nominator" || CORRECTION_RE.test(ctx.prompt)) return [];
      return /写卡|重写/.test(ctx.prompt) ? [appointmentWriteCard()] : [];
    },
  });
  try {
    await h.open("nominator");
    await triggerCrewTurn(h, "请写出 executor 的角色卡与边界（写卡第 1 轮）。");

    const first = await h.waitForLedger((entries) => readinessDispatches(entries).length === 1, 12000);
    assert.equal(first.errors.length, 0, `账本不应有坏行：${first.errors.join("; ")}`);
    assert.equal(convenerPrompts(h).filter((prompt) => READINESS_RE.test(prompt)).length, 1, "首次 readiness 恰一条");
    assert.equal(correctionsOf(h).length, 0, "合法写卡不应反馈 Crew");
    assert.equal(h.presented.length, 0, "自动代批不应弹客户卡");

    // 同内容重复 refresh：不得重复派发（后续断言以第二次重写后的基线为准，这里先确认一次）。
    await h.iface.listProject({ projectRoot: temp.root });
    await h.waitForLedger((entries) => readinessDispatches(entries).length === 1, 3000);

    await triggerCrewTurn(h, "请按最新反馈重写 executor 的角色卡（写卡第 2 轮，内容已更新）。");
    const second = await h.waitForLedger((entries) => readinessDispatches(entries).length === 2, 12000);
    const dispatches = readinessDispatches(second.entries);
    assert.equal(dispatches.length, 2, "内容变化后应再次派发 readiness（新版本化键）");
    // 账本不持久化 dedupeKey；用条目顺序证明第二次派发生效在第二次 Crew 写卡账本锚之后（旧实现被永久键挡住）。
    const secondCrewWriteIndex = second.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.kind === "customer.decision" && entry.decisionKind === "appointment-write")
      .map(({ index }) => index)[1];
    assert.ok(secondCrewWriteIndex !== undefined, "应有第二轮 appointment-write 账本条目");
    const secondDispatchIndex = second.entries.indexOf(dispatches[1]! as never);
    assert.ok(secondDispatchIndex > secondCrewWriteIndex, "第二次 readiness 派发应发生在第二次 Crew 写卡之后");

    // role-cards 已 done ⇒ 幂等复用既有证据，不重复写记录/不重复 done。
    const evidenceRef = assertRoleCardsDone(temp.root);
    assertRoleCardsRecord(temp.root, evidenceRef);
    const observed = artifactObservedEntries(second.entries);
    assert.equal(observed.length, 1, "artifact.observed 恰一条（role-cards 已 done 幂等）");
    const appointmentWrites = second.entries.filter((entry) => entry.decisionKind === "appointment-write");
    assert.equal(appointmentWrites.length, 2, "两轮 Crew 写卡各一条 appointment-write 决定");
    assert.equal(
      second.entries.filter((entry) => entry.kind === "customer.decision" && entry.actorRoleId === "app").length,
      0,
      "应用完成/派发不得写 customer.decision",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("连续两次不同错误写卡 ⇒ 两次反馈；修正后 role-cards 恰一次 done、readiness 恰一次、无客户卡/无 customer.decision", async () => {
  const temp = makeRoot("redispatch-consecutive-bad");
  await seedRedispatchProject(temp.root);
  let correctionRound = 0;
  const h = await makeHarness({
    tag: "redispatch-consecutive-bad",
    root: temp.root,
    approval: true,
    decision: true,
    onPrompt: (ctx) => {
      if (ctx.roleId !== "nominator") return;
      if (CORRECTION_RE.test(ctx.prompt)) {
        correctionRound += 1;
        if (correctionRound === 1) {
          // 错误 B：文件齐全但 boundary 写集与团队计划不一致（仍是 Crew 来源 blocker，指纹不同于 A）。
          writeRoleArtifacts(temp.root, ROLE_ID, { writes: ["src/owned-other/"] });
        } else {
          // 修正：完全合法。
          writeRoleArtifacts(temp.root, ROLE_ID);
        }
        return;
      }
      // 错误 A：role-card 存在但缺第 5 项章节、工作文档缺失（角色仍可枚举）。
      write(temp.root, ROLE_CARD_REL, "# 角色：executor\n\n占位：缺章节与工作文档。\n");
      write(temp.root, ROLE_BOUNDARY_REL, roleBoundaryDoc(ROLE_ID));
    },
  });
  try {
    await h.open("nominator");
    // 种子账本基线（提案接受 + 任命 + 意图确认），后续只能由真实卡片决定增加；应用完成/派发不得增加。
    const seedSnapshot = await h.waitForLedger(() => true, 500);
    const seedDecisionCount = customerDecisions(seedSnapshot.entries).length;
    await triggerCrewTurn(h, "请写出 executor 的角色卡与边界（写卡）。");

    await h.waitFor(() => correctionsOf(h).length >= 2, 12000);
    await h.waitFor(() => convenerPrompts(h).some((prompt) => READINESS_RE.test(prompt)), 12000);
    const ledger = await h.waitForLedger((entries) => readinessDispatches(entries).length >= 1, 8000);

    const corrections = correctionsOf(h);
    assert.equal(corrections.length, 2, `两次不同错误内容应各反馈一次；实际=${corrections.length}`);
    assert.match(corrections[0]!, /缺少「[^」]+」章节或等价内容/, "首次反馈应含缺章节");
    assert.match(corrections[0]!, /feature-map\.md：文件不存在/, "首次反馈应含缺工作文档");
    assert.match(corrections[1]!, /未被 boundary\.yaml entries 覆盖/, "第二次反馈应含 boundary 写集问题");
    assert.match(corrections[1]!, /src\/owned-executor\//);

    assert.equal(readinessDispatches(ledger.entries).length, 1, "readiness 恰一次");
    assert.equal(convenerPrompts(h).filter((prompt) => READINESS_RE.test(prompt)).length, 1);
    assert.equal(h.presented.length, 0, "全程无客户卡");

    const evidenceRef = assertRoleCardsDone(temp.root);
    assertRoleCardsRecord(temp.root, evidenceRef);
    assert.equal(artifactObservedEntries(ledger.entries).length, 1, "artifact.observed 恰一条");

    const decisions = customerDecisions(ledger.entries);
    assert.equal(decisions.length, seedDecisionCount, "账本 customer.decision 不得因应用完成/派发而增加");
    assert.equal(
      ledger.entries.filter((entry) => entry.kind === "customer.decision" && entry.actorRoleId === "app").length,
      0,
      "应用不写 customer.decision",
    );
    assert.equal(
      ledger.entries.filter((entry) => entry.decisionKind === "acceptance").length,
      0,
      "不得伪造验收决定",
    );
    assert.equal(correctionsOf(h).length, 2, "通过后不得再反馈");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("同内容重复 settle/refresh 与 mtime-only 变化 ⇒ 不重复反馈/派发/记录（内容指纹去重、防自激）", async () => {
  const temp = makeRoot("redispatch-idempotent");
  await seedRedispatchProject(temp.root);
  const h = await makeHarness({
    tag: "redispatch-idempotent",
    root: temp.root,
    approval: true,
    decision: true,
    onPrompt: (ctx) => {
      if (ctx.roleId !== "nominator" || CORRECTION_RE.test(ctx.prompt)) return;
      if (/写卡|重写/.test(ctx.prompt)) writeRoleArtifacts(temp.root, ROLE_ID);
    },
  });
  try {
    await h.open("nominator");
    await triggerCrewTurn(h, "请写出 executor 的角色卡与边界（写卡）。");
    const passed = await h.waitForLedger((entries) => readinessDispatches(entries).length === 1, 12000);
    assert.equal(correctionsOf(h).length, 0);
    const evidenceRef = assertRoleCardsDone(temp.root);

    const baseline = {
      dispatches: readinessDispatches(passed.entries).length,
      observed: artifactObservedEntries(passed.entries).length,
      convener: convenerPrompts(h).length,
    };
    assert.equal(baseline.observed, 1);
    assert.equal(baseline.convener, 1);

    // ① 同内容重写（无卡，直接落盘）+ settle：指纹不变 ⇒ 不重复。
    await triggerCrewTurn(h, "请重写 executor 的角色卡（写卡，内容不变）。");
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // ② mtime-only 变化（内容逐字不变）+ 多次 refresh：指纹不含 mtime ⇒ 不重复。
    const cardAbs = path.join(temp.root, ...ROLE_CARD_REL.split("/"));
    const sameBytes = readFileSync(cardAbs);
    writeFileSync(cardAbs, sameBytes);
    const now = new Date();
    utimesSync(cardAbs, now, new Date(now.getTime() + 5000));
    for (let index = 0; index < 3; index += 1) {
      await h.iface.listProject({ projectRoot: temp.root });
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    const after = await h.waitForLedger(() => true, 1500);
    assert.equal(readinessDispatches(after.entries).length, baseline.dispatches, "同内容不得重复派发");
    assert.equal(artifactObservedEntries(after.entries).length, baseline.observed, "同内容不得重复写验证记录");
    assert.equal(convenerPrompts(h).length, baseline.convener, "不得重复派 Convener");
    assert.equal(correctionsOf(h).length, 0, "合格内容不得反馈 Crew");
    assert.equal(h.presented.length, 0, "无客户卡");
    assertRoleCardsRecord(temp.root, evidenceRef);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("boundary 条目逆序 ⇒ 仍通过并收口 role-cards、派 readiness 恰一次", async () => {
  const temp = makeRoot("redispatch-reversed-boundary");
  await seedRedispatchProject(temp.root);
  const reversedBoundary = [
    `role: ${ROLE_ID}`,
    "entries:",
    "  - kind: directory",
    `    path: src/owned-${ROLE_ID}/`,
    "    purpose: 角色代码/测试写集",
    ...["api-spec.md", "memo.md", "functional-description.md", "feature-map.md"].flatMap((file) => [
      "  - kind: file",
      `    path: 角色卡/${ROLE_ID}/${file}`,
      "    purpose: 角色根工作文档",
      "",
    ]),
    "",
  ].join("\n");
  const h = await makeHarness({
    tag: "redispatch-reversed-boundary",
    root: temp.root,
    approval: true,
    decision: true,
    onPrompt: (ctx) => {
      if (ctx.roleId !== "nominator" || CORRECTION_RE.test(ctx.prompt)) return;
      if (!/写卡/.test(ctx.prompt)) return;
      write(temp.root, ROLE_CARD_REL, roleCardDoc(ROLE_ID));
      write(temp.root, ROLE_BOUNDARY_REL, reversedBoundary);
      for (const [file, content] of Object.entries(roleWorkDocs(ROLE_ID))) {
        write(temp.root, `角色卡/${ROLE_ID}/${file}`, content);
      }
    },
  });
  try {
    await h.open("nominator");
    await triggerCrewTurn(h, "请写出 executor 的角色卡与边界（写卡）。");
    const ledger = await h.waitForLedger((entries) => readinessDispatches(entries).length === 1, 12000);
    assert.equal(correctionsOf(h).length, 0, "条目逆序不得被误判");
    assert.equal(readinessDispatches(ledger.entries).length, 1, "readiness 恰一次");
    const evidenceRef = assertRoleCardsDone(temp.root);
    assertRoleCardsRecord(temp.root, evidenceRef);
    assert.equal(h.presented.length, 0);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("团队计划存在但 flow 缺 role-cards 步骤 ⇒ 反馈 Convener、不派 readiness、无客户卡；同指纹不刷屏", async () => {
  const temp = makeRoot("redispatch-missing-step");
  await seedRedispatchProject(temp.root, { withRoleCardsStep: false });
  const h = await makeHarness({
    tag: "redispatch-missing-step",
    root: temp.root,
    approval: true,
    decision: true,
    onPrompt: (ctx) => {
      if (ctx.roleId !== "nominator" || CORRECTION_RE.test(ctx.prompt)) return;
      if (/写卡/.test(ctx.prompt)) writeRoleArtifacts(temp.root, ROLE_ID);
    },
  });
  try {
    await h.open("nominator");
    await triggerCrewTurn(h, "请写出 executor 的角色卡与边界（写卡）。");
    await h.waitFor(
      () => convenerPrompts(h).some((prompt) => /流程状态 YAML 未通过结构校验/.test(prompt)),
      12000,
    );
    const feedback = convenerPrompts(h).filter((prompt) => /流程状态 YAML 未通过结构校验/.test(prompt));
    assert.equal(feedback.length, 1, "缺步骤应恰反馈一次 Convener");
    assert.match(feedback[0]!, /role-cards/);
    assert.match(feedback[0]!, /id:"role-cards"/);
    assert.match(feedback[0]!, /kind 为 artifact 或 dispatch/);

    const ledger = await h.waitForLedger(() => true, 800);
    assert.equal(readinessDispatches(ledger.entries).length, 0, "缺 role-cards 步骤不得派 readiness");
    assert.equal(convenerPrompts(h).filter((prompt) => READINESS_RE.test(prompt)).length, 0);
    assert.equal(h.presented.length, 0, "无客户卡");
    assert.equal(
      readFileSync(path.join(temp.root, ...FLOW_REL.split("/")), "utf8").includes("id: role-cards"),
      false,
      "夹具 flow 确实没有 role-cards 步骤",
    );

    // 同指纹重复 settle：去重，不刷屏。
    await triggerCrewTurn(h, "请保持现有角色卡不变（写卡，同内容）。");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(
      convenerPrompts(h).filter((prompt) => /流程状态 YAML 未通过结构校验/.test(prompt)).length,
      1,
      `同内容重复 settle 不得重复反馈 Convener；prompts=${JSON.stringify(convenerPrompts(h).map((p) => p.slice(0, 60)))}`,
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("手工改文件 + listProject 刷新 ⇒ 不合格反馈 Crew；修正后收口 role-cards 并派 readiness（无 Crew 事件）", async () => {
  const temp = makeRoot("redispatch-refresh");
  await seedRedispatchProject(temp.root);
  const h = await makeHarness({
    tag: "redispatch-refresh",
    root: temp.root,
    approval: true,
    decision: true,
    onPrompt: () => {
      /* 刷新用例不依赖 nominator 轮次写文件。 */
    },
  });
  try {
    // 打开会话提供活跃 runtime（后台反馈/派发需要引擎解析；不发送任何任务）。
    await h.open("nominator");

    // 不合格的手工状态：role-card 为空（角色仍可枚举）+ 合法 boundary，缺工作文档。
    write(temp.root, ROLE_CARD_REL, "\n");
    write(temp.root, ROLE_BOUNDARY_REL, roleBoundaryDoc(ROLE_ID));
    await h.iface.listProject({ projectRoot: temp.root });
    await h.waitFor(() => correctionsOf(h).length >= 1, 12000);
    assert.match(correctionsOf(h)[0]!, /role-card\.md：文件为空/);
    assert.equal(convenerPrompts(h).filter((prompt) => READINESS_RE.test(prompt)).length, 0, "不合格不得派 readiness");

    // 手工修正为完整合法产物，仅刷新项目。
    writeRoleArtifacts(temp.root, ROLE_ID);
    await h.iface.listProject({ projectRoot: temp.root });
    const ledger = await h.waitForLedger((entries) => readinessDispatches(entries).length === 1, 12000);
    assert.equal(readinessDispatches(ledger.entries).length, 1, "刷新后 readiness 恰一次");
    const evidenceRef = assertRoleCardsDone(temp.root);
    assertRoleCardsRecord(temp.root, evidenceRef);
    assert.equal(correctionsOf(h).length, 1, "修正后不得再反馈");
    assert.equal(h.presented.length, 0, "无客户卡");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
