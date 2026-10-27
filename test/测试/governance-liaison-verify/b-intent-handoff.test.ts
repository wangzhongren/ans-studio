// test/测试/governance-liaison-verify/b-intent-handoff.test.ts
// 独立端到端验收（测试角色，2026-10-18）：`hand_off_intent` 交接闭环、守卫、每轮一次、
// 失败不重试与「交接不是批准」；桌面窗口后台投递 Rapporteur（不切换当前 pane）。
//
// 依据：四角色评审 §5.1–§5.3、§7.2、§十 AC5–AC7/AC18。全部离线（临时目录 + 自建假适配器 /
// 注入式 SessionManager），不读 `.env`、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { buildIntentHandoffMessage } from "../../../app/desktop/governance-advance.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import { readGovernanceLedger } from "../../../src/common/编排/governance-ledger.ts";
import type { HandOffIntentFn } from "../../../src/model/runtime.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import {
  capture,
  consume,
  handoffPayload,
  intentDoc,
  makeRoot,
  seedIntentConfirm,
  sha256,
  toolAdapterFactory,
  trioProject,
  waitForLedger,
  write,
  writeProjectRole,
} from "./fixture.ts";

const FLOW = "flow-a";
const INTENT = "intent-a";

function seedIntent(root: string, overrides: Partial<Parameters<typeof intentDoc>[0]> = {}): { text: string; sha: string } {
  const text = intentDoc({
    intentId: INTENT,
    handoffKind: "initial",
    goal: "离线验收提案",
    scope: "只读分析",
    acceptance: "客户接受提案",
    flowId: FLOW,
    ...overrides,
  });
  write(root, `docs/intents/${overrides.intentId ?? INTENT}.md`, text);
  return { text, sha: sha256(text) };
}

interface HandoffHarness {
  caps: ReturnType<typeof capture>["caps"];
  calls: Array<{ payload: Record<string, unknown>; metadata?: { turnId?: string } }>;
  dispose(): Promise<void>;
}

/** 真实编排会话 + 可注入的投递端（直接调编排包装器，验证校验/去重/账本）。 */
async function openLiaison(
  root: string,
  delivery: "ok" | "fail" | "throw" = "ok",
  roleId: "liaison" | "rapporteur" = "liaison",
): Promise<HandoffHarness> {
  const cap = capture();
  const calls: HandoffHarness["calls"] = [];
  const handOffIntent: HandOffIntentFn = (payload, metadata) => {
    calls.push({ payload: payload as unknown as Record<string, unknown>, metadata });
    if (delivery === "throw") throw new Error("模拟投递端异常");
    if (delivery === "fail") return { ok: false, message: "模拟投递端拒绝" };
    return { ok: true, message: "stub 已投递" };
  };
  const handle = await openRoleSession(
    { roleId, project: trioProject(root), taskId: "T-handoff", handOffIntent },
    { createAdapter: toolAdapterFactory(cap, { root }) },
  );
  await consume(handle, "（验收空脚本）");
  return {
    caps: cap.caps,
    calls,
    dispose: () => handle.dispose(),
  };
}

async function ledgerOf(root: string) {
  return readGovernanceLedger(root);
}

function handoffs(entries: Awaited<ReturnType<typeof ledgerOf>>["entries"]) {
  return entries.filter((entry) => entry.kind === "intent.handed-off");
}

// —————————————————————— 1) 合法交接（编排级） ——————————————————————

test("合法交接：工具调用成功 → 账本 intent.handed-off 字段完整；交接不写客户决定/证据", async () => {
  const { root, cleanup } = makeRoot("handoff-ok");
  try {
    writeProjectRole(root, "A");
    const { sha } = seedIntent(root);
    await seedIntentConfirm(root, { flowId: FLOW });
    const cap = capture();
    const calls: unknown[] = [];
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project: trioProject(root),
        taskId: "T-handoff-tool",
        handOffIntent: (payload) => {
          calls.push(payload);
          return { ok: true, message: "stub 已投递" };
        },
      },
      {
        createAdapter: toolAdapterFactory(cap, {
          root,
          script: [{ name: "hand_off_intent", args: handoffPayload() }],
        }),
      },
    );
    const events = await consume(handle, "请把客户意图交给报告员");
    await handle.dispose();

    assert.equal(calls.length, 1, "投递端恰被调用一次");
    assert.equal(cap.results!.length, 1);
    assert.equal(cap.results![0].name, "hand_off_intent");
    assert.equal(cap.results![0].ok, true, cap.results![0].message);
    assert.ok(events.some((ev) => ev.kind === "settled"));

    const { entries, errors } = await waitForLedger(root, (list) => list.some((e) => e.kind === "intent.handed-off"));
    assert.deepEqual(errors, []);
    const entry = handoffs(entries)[0];
    assert.ok(entry, "成功交接应写 intent.handed-off");
    assert.equal(entry!.actorRoleId, "liaison", "谁转的交 = Liaison");
    assert.equal(entry!.power, "liaison", "power 统一为 liaison（评审 §7.1；AC5 修复后）");
    assert.equal(entry!.intentId, INTENT);
    assert.equal(entry!.handoffKind, "initial");
    assert.equal(entry!.targetRoleId, "rapporteur");
    assert.equal(entry!.flowId, FLOW);
    assert.equal(entry!.artifactPath, `docs/intents/${INTENT}.md`);
    assert.equal(entry!.artifactSha256, sha, "哈希由应用按原始字节计算");
    assert.ok((entry!.messageSummary ?? "").length <= 200);
    const decisions = entries.filter((e) => e.kind === "customer.decision");
    assert.equal(decisions.length, 1, "交接本身不写客户决定（仅种入的需求确认）");
    assert.equal(decisions[0]!.decisionKind, "intent-confirm");
    assert.equal(
      entries.some((e) => e.decisionEvidence !== undefined),
      false,
      "交接不得写 decisionEvidence",
    );
  } finally {
    cleanup();
  }
});

test("AC5 双事件：成功交接同时写 intent.handed-off 与 dispatch.accepted{actor=app, trigger=intent-handoff}", async () => {
  const { root, cleanup } = makeRoot("handoff-dispatch-ledger");
  try {
    writeProjectRole(root, "A");
    write(root, ".ans/project.json", JSON.stringify({ projectRoot: root, roles: {}, governanceModel: "trio" }) + "\n");
    seedIntent(root);
    await seedIntentConfirm(root, { flowId: FLOW });
    const listing = await listProject(root);
    const harness = makeDesktop(root, listing, {
      scriptForRole: (roleId) =>
        roleId === "liaison" ? [{ name: "hand_off_intent", args: handoffPayload() }] : [],
    });
    assert.equal((await harness.manager.open({ projectRoot: root, roleId: "liaison", runtime: "demo" })).ok, true);
    await harness.manager.send("请把意图交给报告员");
    const { entries } = await waitForLedger(
      root,
      (list) =>
        list.some((e) => e.kind === "intent.handed-off") &&
        list.some((e) => e.kind === "dispatch.accepted" && e.trigger === "intent-handoff"),
    );
    await harness.manager.stop(null);
    const handoff = entries.find((e) => e.kind === "intent.handed-off");
    assert.ok(handoff, "应有 intent.handed-off（谁转的交）");
    assert.equal(handoff!.actorRoleId, "liaison");
    const dispatched = entries.find((e) => e.kind === "dispatch.accepted" && e.trigger === "intent-handoff");
    assert.ok(dispatched, "交接成功后应有 dispatch.accepted{trigger:'intent-handoff'}（评审 §7.2/AC5）");
    assert.equal(dispatched!.actorRoleId, "app");
    assert.equal(dispatched!.power, "app");
    assert.equal(dispatched!.targetRoleId, "rapporteur");
    assert.equal(dispatched!.intentId, INTENT);
    assert.equal(dispatched!.customerDecision, undefined, "应用投递不是客户批准");
    assert.equal(entries.filter((e) => e.kind === "intent.handed-off").length, 1, "两份事件各一份");
    assert.equal(
      entries.filter((e) => e.kind === "dispatch.accepted" && e.trigger === "intent-handoff").length,
      1,
      "应用投递账本不重复",
    );
  } finally {
    cleanup();
  }
});

test("需求确认门槛：未确认/最后一条 revise ⇒ hand_off 拒；客户再次确认后 ⇒ 成功", async () => {
  const { root, cleanup } = makeRoot("handoff-intent-confirm-gate");
  try {
    writeProjectRole(root, "A");
    seedIntent(root);

    // 1) 完全未确认 ⇒ 拒、不投递、不写账本。
    let h = await openLiaison(root);
    let receipt = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-1" });
    await h.dispose();
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /尚未经客户确认/);
    assert.equal(h.calls.length, 0, "未确认不得触达投递端");
    assert.equal(handoffs((await ledgerOf(root)).entries).length, 0);

    // 2) 最后一条是 revise（此前即便有 accepted 也不得放行）⇒ 拒。
    await seedIntentConfirm(root, { flowId: FLOW });
    await seedIntentConfirm(root, { flowId: FLOW, decision: "changes-requested" });
    h = await openLiaison(root);
    receipt = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-1" });
    await h.dispose();
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /尚未经客户确认/);
    assert.equal(h.calls.length, 0, "revise 不得触达投递端");

    // 3) 客户再次确认（最后一条 accepted）⇒ 成功交接。
    await seedIntentConfirm(root, { flowId: FLOW });
    h = await openLiaison(root);
    receipt = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-1" });
    await h.dispose();
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.equal(h.calls.length, 1);
    assert.equal(handoffs((await ledgerOf(root)).entries).length, 1);
  } finally {
    cleanup();
  }
});

// —————————————————————— 2) 守卫（全部 fail-closed） ——————————————————————

test("交接守卫：缺文件/缺要素/入参文件不一致/非法 slug/summary 空或超长 → 拒且无账本、不投递", async () => {
  const scenarios: Array<{
    name: string;
    prepare?: (root: string) => void;
    payload: Record<string, unknown>;
    expect: RegExp;
  }> = [
    {
      name: "意图文件缺失",
      payload: handoffPayload(),
      expect: /不存在/,
    },
    {
      name: "goal 为空",
      prepare: (root) => seedIntent(root, { goal: "" }),
      payload: handoffPayload({ goal: "" }),
      expect: /缺少 goal/,
    },
    {
      name: "scope 为空",
      prepare: (root) => seedIntent(root, { scope: "" }),
      payload: handoffPayload({ scope: "" }),
      expect: /缺少 scope/,
    },
    {
      name: "acceptance 为空",
      prepare: (root) => seedIntent(root, { acceptance: "" }),
      payload: handoffPayload({ acceptance: "" }),
      expect: /缺少 acceptance/,
    },
    {
      name: "入参与文件不一致",
      prepare: (root) => seedIntent(root),
      payload: handoffPayload({ goal: "聊天转述覆盖文件" }),
      expect: /不一致|文件是权威/,
    },
    {
      name: "slug 非法",
      prepare: (root) => seedIntent(root),
      payload: handoffPayload({ intentId: "../evil" }),
      expect: /slug/,
    },
    {
      name: "summary 为空",
      prepare: (root) => seedIntent(root),
      payload: handoffPayload({ summary: "" }),
      expect: /summary/,
    },
    {
      name: "summary 超长",
      prepare: (root) => seedIntent(root),
      payload: handoffPayload({ summary: "长".repeat(201) }),
      expect: /超过 200/,
    },
  ];
  for (const s of scenarios) {
    const { root, cleanup } = makeRoot("handoff-guard");
    try {
      writeProjectRole(root, "A");
      s.prepare?.(root);
      const h = await openLiaison(root);
      const receipt = await h.caps!.handOffIntent!(s.payload as never, { turnId: "turn-1" });
      await h.dispose();
      assert.equal(receipt.ok, false, `${s.name}：应拒`);
      assert.match(receipt.message ?? "", s.expect, `${s.name}：${receipt.message}`);
      assert.equal(h.calls.length, 0, `${s.name}：校验失败不得触达投递端`);
      const { entries } = await ledgerOf(root);
      assert.equal(handoffs(entries).length, 0, `${s.name}：不得写成功账本`);
    } finally {
      cleanup();
    }
  }
});

test("去重/initial 一次性/修订引用：重复 hash 拒、initial 第二次拒、clarification 无既有交接拒", async () => {
  const { root, cleanup } = makeRoot("handoff-dedupe");
  try {
    writeProjectRole(root, "A");
    seedIntent(root);
    await seedIntentConfirm(root, { flowId: FLOW });
    const h = await openLiaison(root);
    const first = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-1" });
    assert.equal(first.ok, true, first.message ?? "");
    // 同一 intentId + 同内容 + initial ⇒ 重复。
    const dup = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-2" });
    assert.equal(dup.ok, false);
    assert.match(dup.message ?? "", /已交接|重复/);
    // 改了文件但仍是 initial ⇒ initial 仅一次。
    seedIntent(root, { goal: "修订后的目标" });
    const initialAgain = await h.caps!.handOffIntent!(
      handoffPayload({ goal: "修订后的目标" }) as never,
      { turnId: "turn-3" },
    );
    assert.equal(initialAgain.ok, false);
    assert.match(initialAgain.message ?? "", /initial 仅一次|已有成功交接/);
    // clarification 必须引用既有交接（新 intentId 没有 initial ⇒ 拒）。
    write(
      root,
      "docs/intents/intent-b.md",
      intentDoc({ intentId: "intent-b", handoffKind: "clarification", goal: "新目标", scope: "范围", acceptance: "验收" }),
    );
    const noPrior = await h.caps!.handOffIntent!(
      { intentId: "intent-b", handoffKind: "clarification", goal: "新目标", scope: "范围", acceptance: "验收", summary: "澄清" },
      { turnId: "turn-4" },
    );
    assert.equal(noPrior.ok, false);
    assert.match(noPrior.message ?? "", /还没有成功交接|initial/);
    await h.dispose();
    const { entries } = await ledgerOf(root);
    assert.equal(handoffs(entries).length, 1, "只有第一次成功交接写账本");
  } finally {
    cleanup();
  }
});

test("每轮一次：同一会话同一轮第二次成功交接被拒；下一轮可再交接（新 intentId）", async () => {
  const { root, cleanup } = makeRoot("handoff-turn-limit");
  try {
    writeProjectRole(root, "A");
    seedIntent(root);
    await seedIntentConfirm(root, { flowId: FLOW });
    await seedIntentConfirm(root, { flowId: "intent-b" });
    write(
      root,
      "docs/intents/intent-b.md",
      intentDoc({ intentId: "intent-b", goal: "第二个意图", scope: "范围", acceptance: "验收" }),
    );
    const h = await openLiaison(root);
    const first = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-1" });
    assert.equal(first.ok, true, first.message ?? "");
    const secondSameTurn = await h.caps!.handOffIntent!(
      { intentId: "intent-b", handoffKind: "initial", goal: "第二个意图", scope: "范围", acceptance: "验收", summary: "第二个" },
      { turnId: "turn-1" },
    );
    assert.equal(secondSameTurn.ok, false, "同一轮第二次成功交接应拒");
    assert.match(secondSameTurn.message ?? "", /每轮|同一轮/);
    const nextTurn = await h.caps!.handOffIntent!(
      { intentId: "intent-b", handoffKind: "initial", goal: "第二个意图", scope: "范围", acceptance: "验收", summary: "第二个" },
      { turnId: "turn-2" },
    );
    assert.equal(nextTurn.ok, true, nextTurn.message ?? "");
    await h.dispose();
    const { entries } = await ledgerOf(root);
    assert.equal(handoffs(entries).length, 2, "两轮各一条成功交接");
  } finally {
    cleanup();
  }
});

test("非 Liaison 无交接工具：Rapporteur 会话即便误给 handOffIntent 也不注入", async () => {
  const { root, cleanup } = makeRoot("handoff-wrong-role");
  try {
    writeProjectRole(root, "A");
    seedIntent(root);
    const h = await openLiaison(root, "ok", "rapporteur");
    assert.equal(h.caps!.handOffIntent, undefined, "Rapporteur 不得获得 hand_off_intent 能力");
    await h.dispose();
  } finally {
    cleanup();
  }
});

test("账本不可读：坏行 ⇒ 交接 fail-closed（拒、不投递、不写新行）", async () => {
  const { root, cleanup } = makeRoot("handoff-ledger-bad");
  try {
    writeProjectRole(root, "A");
    seedIntent(root);
    write(root, ".ans/governance/ledger.jsonl", "{坏行\n");
    const h = await openLiaison(root);
    const receipt = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-1" });
    await h.dispose();
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /账本不可读|ledger/);
    assert.equal(h.calls.length, 0, "账本不可读不得触达投递端");
  } finally {
    cleanup();
  }
});

test("投递失败：如实回执、不重试、不写成功账本（下一次成功须由客户新消息触发）", async () => {
  for (const delivery of ["fail", "throw"] as const) {
    const { root, cleanup } = makeRoot(`handoff-delivery-${delivery}`);
    try {
      writeProjectRole(root, "A");
      seedIntent(root);
      await seedIntentConfirm(root, { flowId: FLOW });
      const h = await openLiaison(root, delivery);
      const receipt = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-1" });
      await h.dispose();
      assert.equal(receipt.ok, false, `${delivery}：应如实失败`);
      assert.match(receipt.message ?? "", /未重试/);
      assert.equal(h.calls.length, 1, `${delivery}：不重试（恰一次投递尝试）`);
      const { entries } = await ledgerOf(root);
      assert.equal(handoffs(entries).length, 0, `${delivery}：失败零成功账本`);
    } finally {
      cleanup();
    }
  }
});

test("交接不是批准：交接成功后 Convener 无客户接受仍不能写流程单", async () => {
  const { root, cleanup } = makeRoot("handoff-not-approval");
  try {
    writeProjectRole(root, "A");
    seedIntent(root);
    await seedIntentConfirm(root, { flowId: FLOW });
    const h = await openLiaison(root);
    const receipt = await h.caps!.handOffIntent!(handoffPayload() as never, { turnId: "turn-1" });
    assert.equal(receipt.ok, true, receipt.message ?? "");
    await h.dispose();
    const cap = capture();
    const convener = await openRoleSession(
      { roleId: "convener", project: trioProject(root), taskId: "T-flow" },
      { createAdapter: toolAdapterFactory(cap, { root }) },
    );
    await consume(convener, "（验收空脚本）");
    await convener.dispose();
    const decision = cap.gate!(`docs/flows/${FLOW}.md`);
    assert.equal(decision.allowed, false, "无客户接受提案 ⇒ Convener 写 flow 仍拒");
    assert.match(decision.reason ?? "", /提案|Rapporteur/);
  } finally {
    cleanup();
  }
});

test("Liaison 每轮 settle 观察 docs/intents：artifact.observed（谁写了客户意图，power=沟通权）", async () => {
  const { root, cleanup } = makeRoot("handoff-artifact");
  try {
    writeProjectRole(root, "A");
    await seedIntentConfirm(root, { flowId: FLOW });
    const cap = capture();
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project: trioProject(root),
        taskId: "T-artifact",
        handOffIntent: () => ({ ok: true, message: "stub" }),
      },
      {
        createAdapter: toolAdapterFactory(cap, {
          root,
          script: [
            {
              name: "write_file",
              args: {
                path: `docs/intents/${INTENT}.md`,
                content: intentDoc({
                  intentId: INTENT,
                  handoffKind: "initial",
                  goal: "离线验收提案",
                  scope: "只读分析",
                  acceptance: "客户接受提案",
                  flowId: FLOW,
                }),
              },
            },
            { name: "hand_off_intent", args: handoffPayload() },
          ],
        }),
      },
    );
    await consume(handle, "请写意图并交接");
    await handle.dispose();
    const { entries } = await waitForLedger(root, (list) =>
      list.some((e) => e.kind === "artifact.observed" && e.artifactPath === `docs/intents/${INTENT}.md`),
    );
    const observed = entries.find(
      (e) => e.kind === "artifact.observed" && e.artifactPath === `docs/intents/${INTENT}.md`,
    );
    assert.ok(observed, "Liaison 的预授权目录 docs/intents 应被 settle 观察");
    assert.equal(observed!.actorRoleId, "liaison", "谁写了客户意图 = Liaison");
    assert.equal(observed!.power, "liaison", "意图观察 power 统一为 liaison（评审 §7.1）");
    assert.equal(handoffs(entries).length, 1, "同一轮交接账本一条");
  } finally {
    cleanup();
  }
});

// —————————————————————— 3) 桌面窗口：后台投递 Rapporteur、当前 pane 不变 ——————————————————————

interface DesktopHarness {
  manager: SessionManager;
  events: Array<{ roleId: string; projectRoot: string; runtime: string; event: { kind: string; summary?: string; detail?: unknown } }>;
  prompted: Map<string, string[]>;
  openAttempts: string[];
}

function makeDesktop(
  root: string,
  listing: ProjectListing,
  opts: { failRapporteurOpen?: boolean; scriptForRole?: (roleId: string) => Array<{ name: string; args: Record<string, unknown> }> } = {},
): DesktopHarness {
  const events: DesktopHarness["events"] = [];
  const prompted = new Map<string, string[]>();
  const openAttempts: string[] = [];
  const buildConfig = (l: ProjectListing, acceptance: Parameters<typeof buildProjectConfig>[1], env?: Record<string, string | undefined>, govPath?: string) => {
    const config = buildProjectConfig(l, acceptance, env, govPath);
    return {
      ...config,
      governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:desktop" } },
    };
  };
  const manager = new SessionManager({
    openRoleSession: async (input, deps) => {
      openAttempts.push(input.roleId);
      if (opts.failRapporteurOpen === true && input.roleId === "rapporteur") {
        throw new Error("模拟报告员会话不可用");
      }
      return openRoleSession(input, deps);
    },
    createRuntimeAdapterFactory: () => toolAdapterFactory(capture(), {
      root,
      prompted,
      ...(opts.scriptForRole !== undefined ? { scriptForRole: opts.scriptForRole } : {}),
    }),
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig: buildConfig,
    getListing: (r) => (r === root ? listing : undefined),
    emitEvent: (envelope) => {
      events.push(envelope as unknown as DesktopHarness["events"][number]);
    },
  });
  return { manager, events, prompted, openAttempts };
}

test("桌面交接闭环：后台开 Rapporteur + 恰一条任务；不切换 pane；账本一条 intent.handed-off", async () => {
  const { root, cleanup } = makeRoot("desktop-handoff");
  try {
    writeProjectRole(root, "A");
    write(root, ".ans/project.json", JSON.stringify({ projectRoot: root, roles: {}, governanceModel: "trio" }) + "\n");
    seedIntent(root);
    await seedIntentConfirm(root, { flowId: FLOW });
    const listing = await listProject(root);
    const harness = makeDesktop(root, listing, {
      scriptForRole: (roleId) =>
        roleId === "liaison" ? [{ name: "hand_off_intent", args: handoffPayload() }] : [],
    });
    const { manager, events, prompted, openAttempts } = harness;
    const opened = await manager.open({ projectRoot: root, roleId: "liaison", runtime: "demo" });
    assert.equal(opened.ok, true, opened.error ?? "");
    assert.equal(manager.openForRoleId(), "liaison");
    await manager.send("请把意图交给报告员");
    const { entries } = await waitForLedger(root, (list) => list.some((e) => e.kind === "intent.handed-off"));
    assert.equal(handoffs(entries).length, 1, "恰一条成功交接账本");

    assert.deepEqual(openAttempts.slice(0, 2), ["liaison", "rapporteur"], "客户打开 Lead、后台投递 Rapporteur");
    assert.ok(
      openAttempts.slice(2).every((roleId) => roleId === "liaison"),
      `其余打开只能是治理反馈对 Lead 的（重）打开；实得：${openAttempts.join(" → ")}`,
    );
    assert.deepEqual(
      prompted.get("rapporteur"),
      [buildIntentHandoffMessage(handoffPayload() as never)],
      "Rapporteur 恰收到一条任务消息（模板逐字）",
    );
    // 后台投递（含治理反馈对 Lead 的后台重开）不得把 activeRoleId 切到别的角色；
    // 会话若因边界刷新被重建，active 可能暂为 null（用户重开前不冒充仍在）。
    const activeAfterHandoff = manager.openForRoleId();
    assert.ok(
      activeAfterHandoff === "liaison" || activeAfterHandoff === null,
      `后台投递不得抢 activeRoleId（实得：${String(activeAfterHandoff)}）`,
    );
    const notes = events.filter(
      (envelope) =>
        envelope.roleId === "liaison" &&
        envelope.event.kind === "message" &&
        (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note",
    );
    // 2026-10-18 五角色收口：内部角色 settle 改投 `[系统·治理反馈]` 汇总任务（不是原文 delivery-note）；
    // 因此 Liaison 流里的 delivery-note 只剩交接成功这一条。
    assert.equal(notes.length, 1, `成功系统行恰一条，落 Lead 聊天流（实得：${notes.map((envelope) => envelope.event.summary ?? "").join(" | ")}）`);
    assert.equal(notes[0]?.event.summary, "已交给策划（工作中）");
    // 当前 pane 仍可对 Liaison 发言（投递可能异步入队，轮询到真实 prompt 发生）。
    if (manager.openForRoleId() !== "liaison") {
      const reopened = await manager.open({ projectRoot: root, roleId: "liaison", runtime: "demo" });
      assert.equal(reopened.ok, true, reopened.error ?? "");
    }
    prompted.get("liaison")!.length = 0;
    await manager.send("客户继续说话");
    for (let i = 0; i < 100 && !prompted.get("liaison")!.includes("客户继续说话"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(prompted.get("liaison")!.includes("客户继续说话"), "客户消息仍落 Liaison");
    await manager.stop(null);
  } finally {
    cleanup();
  }
});

test("桌面交接失败：只落失败系统行、无成功账本、不循环重试、不切 pane", async () => {
  const { root, cleanup } = makeRoot("desktop-handoff-fail");
  try {
    writeProjectRole(root, "A");
    write(root, ".ans/project.json", JSON.stringify({ projectRoot: root, roles: {}, governanceModel: "trio" }) + "\n");
    seedIntent(root);
    await seedIntentConfirm(root, { flowId: FLOW });
    const listing = await listProject(root);
    const harness = makeDesktop(root, listing, {
      failRapporteurOpen: true,
      scriptForRole: (roleId) =>
        roleId === "liaison" ? [{ name: "hand_off_intent", args: handoffPayload() }] : [],
    });
    const { manager, events, openAttempts } = harness;
    const opened = await manager.open({ projectRoot: root, roleId: "liaison", runtime: "demo" });
    assert.equal(opened.ok, true, opened.error ?? "");
    await manager.send("请把意图交给报告员");
    assert.deepEqual(openAttempts, ["liaison", "rapporteur"], "失败不循环重试（恰一次投递尝试）");
    const { entries } = await ledgerOf(root);
    assert.equal(handoffs(entries).length, 0, "失败零成功账本");
    assert.equal(manager.openForRoleId(), "liaison", "失败不切 pane");
    const notes = events.filter(
      (envelope) =>
        envelope.roleId === "liaison" &&
        envelope.event.kind === "message" &&
        (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note",
    );
    assert.equal(notes.length, 1, "失败恰一条系统行（不循环重试）");
    assert.match(notes[0]?.event.summary ?? "", /应用无法把意图交给策划：.*；未重试/);
    await manager.stop(null);
  } finally {
    cleanup();
  }
});
