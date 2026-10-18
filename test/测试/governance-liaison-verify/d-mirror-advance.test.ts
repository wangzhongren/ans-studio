// test/测试/governance-liaison-verify/d-mirror-advance.test.ts
// 独立端到端验收（测试角色，2026-10-18）：决定卡镜像（同一请求 id / 两侧呈现 / 只答一次 /
// 两侧冻结 / single 不镜像 / 排队聚合）与自动推进（accept→Nominator、quick/任命→Convener，
// 账本 dispatch.accepted{actor=app, trigger=customer-decision}）。
//
// 依据：四角色评审 §6.1–§6.4、§9.3、§十 AC8–AC11/AC19。全部离线，不读 `.env`、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCustomerInputChannel,
  type OperatorRequestPayload,
} from "../../../app/desktop/customer-input.ts";
import { createDesktopInterface } from "../../../app/desktop/interface.ts";
import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import {
  buildGovernanceAdvanceMessage,
  deriveGovernanceNextStep,
  isMirroredGovernanceCard,
} from "../../../app/desktop/governance-advance.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import { readGovernanceLedger } from "../../../src/common/编排/governance-ledger.ts";
import type {
  CustomerInputRequest,
  GovernanceCardKind,
  SessionEvent,
} from "../../../src/model/runtime.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import {
  capture,
  makeRoot,
  toolAdapterFactory,
  waitForLedger,
  write,
  writeProjectRole,
} from "./fixture.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const readRepo = (rel: string): string => fs.readFileSync(path.join(REPO, rel), "utf8");

await import(new URL("../../../app/renderer/ui-labels.js", import.meta.url).href);
const Labels = (globalThis as unknown as {
  ANSUiLabels: {
    governanceMirrorSourceLabel: (name: unknown) => string;
    governanceQueueAggregateText: (count: unknown) => string;
    GOVERNANCE_MIRROR_BADGE: string;
  };
}).ANSUiLabels;

// —————————————————————— 1) 镜像载荷：同一请求 id、只答一次、下一步恰一次 ——————————————————————

function choiceRequest(cardKind: GovernanceCardKind | undefined, title = "提案 flow-a"): CustomerInputRequest {
  return {
    kind: "choice",
    title,
    ...(cardKind !== undefined ? { cardKind } : {}),
    flowId: "flow-a",
    options: [
      { id: "accept", label: "接受" },
      { id: "reject", label: "拒绝" },
    ],
  };
}

test("镜像通道：同一请求 id 的镜像面；两侧共享一份 pending；第一次作答结算、第二次 expired；onNextStep 恰一次", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const expired: string[] = [];
  let nextSteps = 0;
  const channel = createCustomerInputChannel({
    operatorId: "test:op",
    presenter: (payload) => pushed.push(payload),
    onExpired: (payload) => expired.push(payload.id),
    onNextStep: () => {
      nextSteps += 1;
    },
    nextId: (() => {
      let i = 0;
      return () => `op-${++i}`;
    })(),
  });
  const ctx = { roleId: "rapporteur", projectRoot: "/p", runtime: "demo" as const, mirrorRoleId: "liaison" };
  const pending = channel.customerInput(choiceRequest("proposal"), ctx);
  assert.equal(pushed.length, 1, "请求到达即呈现一次（同一请求，不建第二份）");
  assert.equal(pushed[0].id, "op-1");
  assert.equal(pushed[0].roleId, "rapporteur", "来源角色仍是发起卡的角色");
  assert.equal(pushed[0].mirrorRoleId, "liaison", "镜像面 = 主入口 Liaison");

  assert.equal(channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.equal(nextSteps, 1, "客户决定后下一步推导恰一次");
  assert.equal(pushed.length, 1, "作答不产生第二张卡");

  const second = channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } });
  assert.equal(second.ok, false, "同一 id 第二次作答应拒");
  assert.equal(second.expired, true, "第二次按终态 expired 拒绝");
  assert.equal(nextSteps, 1, "第二次作答不得触发第二次下一步");
  assert.equal(expired.length, 0, "正常作答不是失效");
  assert.equal(channel.pendingCount(), 0);
});

test("镜像排队：第二张不呈现可操作卡、只进聚合；第一张结算后第二张呈现并带镜像面", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const queued: Array<{ id: string; waitingFor: string }> = [];
  const channel = createCustomerInputChannel({
    operatorId: "test:op",
    presenter: (payload) => pushed.push(payload),
    onQueued: (payload, waitingFor) => queued.push({ id: payload.id, waitingFor }),
    nextId: (() => {
      let i = 0;
      return () => `op-${++i}`;
    })(),
  });
  const ctx = { roleId: "rapporteur", projectRoot: "/p", runtime: "demo" as const, mirrorRoleId: "liaison" };
  const first = channel.customerInput(choiceRequest("proposal", "第一张"), ctx);
  const second = channel.customerInput(choiceRequest("appointment", "第二张"), ctx);
  assert.deepEqual(pushed.map((p) => p.id), ["op-1"], "只呈现第一张（排队卡不物化）");
  assert.deepEqual(queued, [{ id: "op-2", waitingFor: "op-1" }], "第二张只给聚合行事实");
  channel.respond({ id: "op-1", decision: { kind: "choice", selected: ["accept"] } });
  await first;
  assert.deepEqual(pushed.map((p) => p.id), ["op-1", "op-2"], "第一张结算后按序呈现第二张");
  assert.equal(pushed[1].mirrorRoleId, "liaison", "第二张同样镜像到主入口");
  channel.respond({ id: "op-2", decision: { kind: "choice", selected: ["accept"] } });
  await second;
});

test("write 卡镜像：同一请求 id 带镜像面、只答一次（第二次 expired）、下一步回调不重复", async () => {
  const pushed: OperatorRequestPayload[] = [];
  let nextSteps = 0;
  const channel = createCustomerInputChannel({
    operatorId: "test:op",
    presenter: (payload) => pushed.push(payload),
    onNextStep: () => {
      nextSteps += 1;
    },
    nextId: (() => {
      let i = 0;
      return () => `w-${++i}`;
    })(),
  });
  const ctx = { roleId: "rapporteur", projectRoot: "/p", runtime: "demo" as const, mirrorRoleId: "liaison" };
  const pending = channel.customerInput(choiceRequest("write", "普通写盘确认"), ctx);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].id, "w-1");
  assert.equal(pushed[0].mirrorRoleId, "liaison", "普通 write 卡也镜像到主入口");
  assert.equal(channel.respond({ id: "w-1", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  await pending;
  assert.equal(nextSteps, 1, "write 卡无下一步，但回调恰一次（明确无下一步）");
  const second = channel.respond({ id: "w-1", decision: { kind: "choice", selected: ["accept"] } });
  assert.equal(second.ok, false);
  assert.equal(second.expired, true, "同一 id 第二次按终态拒绝");
  assert.equal(nextSteps, 1, "第二次不得触发第二次回调");
});

// —————————————————————— 2) 桌面窗口计算镜像面（三类治理卡 + single 不镜像） ——————————————————————

const EMPTY_BOUNDARY = {
  entries: [],
  boundarySource: "<built-in:trio/>",
  acceptance: { accepted: false, source: "" },
};

function listingOf(root: string, model: "trio" | "single"): ProjectListing {
  const builtIn = (roleId: string, fn: "liaison" | "proposal" | "nomination" | "schedule") => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: `# ${roleId}`,
    boundary: { ...EMPTY_BOUNDARY, boundarySource: `<built-in:trio/${roleId}>` },
    builtIn: true,
    governanceFunction: fn,
  });
  if (model === "single") {
    return {
      projectRoot: root,
      roles: [
        {
          roleId: "su",
          cardPath: "",
          boundaryPath: "",
          cardText: "# su",
          boundary: { ...EMPTY_BOUNDARY, boundarySource: "<built-in:single/su>" },
          builtIn: true,
        },
      ],
      warnings: [],
      hasRoles: true,
      primaryRoleId: "su",
      governanceModel: "single",
    };
  }
  return {
    projectRoot: root,
    roles: [
      builtIn("liaison", "liaison"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
    ],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "liaison",
    governanceModel: "trio",
  };
}

function fakeQuietHandle(): RoleSessionHandle {
  return {
    async send(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {},
  };
}

test("桌面镜像面：proposal/appointment/acceptance/write 带 mirrorRoleId=liaison；无 cardKind/single 不镜像", async () => {
  const root = "/proj-mirror";
  const listing = listingOf(root, "trio");
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({
    operatorId: "test:op",
    presenter: (payload) => pushed.push(payload),
    nextId: (() => {
      let i = 0;
      return () => `op-${++i}`;
    })(),
  });
  const captured = new Map<string, { customerInput?: (req: CustomerInputRequest, ctx: Record<string, unknown>) => Promise<unknown> }>();
  const manager = new SessionManager({
    openRoleSession: async (input) => {
      captured.set(input.roleId, input as unknown as { customerInput?: (req: CustomerInputRequest, ctx: Record<string, unknown>) => Promise<unknown> });
      return fakeQuietHandle();
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing : undefined),
    emitEvent: () => {},
    customerInput: channel.customerInput as never,
  });

  const cases: Array<{ roleId: string; cardKind?: GovernanceCardKind; expected: string | undefined }> = [
    { roleId: "rapporteur", cardKind: "proposal", expected: "liaison" },
    { roleId: "nominator", cardKind: "appointment", expected: "liaison" },
    { roleId: "nominator", cardKind: "appointment-write", expected: "liaison" },
    { roleId: "convener", cardKind: "schedule-write", expected: "liaison" },
    { roleId: "rapporteur", cardKind: "acceptance", expected: "liaison" },
    { roleId: "rapporteur", cardKind: "write", expected: "liaison" },
    { roleId: "rapporteur", cardKind: undefined, expected: undefined },
  ];
  for (const [index, c] of cases.entries()) {
    const opened = await manager.open({ projectRoot: root, roleId: c.roleId, runtime: "demo" });
    assert.equal(opened.ok, true, opened.error ?? "");
    const fn = captured.get(c.roleId)!.customerInput!;
    const req = choiceRequest(c.cardKind, `卡-${index}`);
    void fn(req, { roleId: c.roleId, projectRoot: root, runtime: "demo" });
    const payload = pushed[pushed.length - 1];
    if (c.expected === undefined) {
      assert.equal(payload.mirrorRoleId, undefined, `${c.cardKind ?? "无 cardKind"} 不镜像`);
    } else {
      assert.equal(payload.mirrorRoleId, c.expected, `${c.cardKind} 应镜像到主入口`);
      assert.equal(payload.roleId, c.roleId, "来源角色不变");
    }
    // 结算，避免下一张被「一项目一卡」排队。
    assert.equal(channel.respond({ id: payload.id, decision: { kind: "choice", selected: ["accept"] } }).ok, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await manager.stop(null);

  // single：同一路径不镜像。
  const singleRoot = "/proj-single-mirror";
  const singleListing = listingOf(singleRoot, "single");
  const singlePushed: OperatorRequestPayload[] = [];
  const singleChannel = createCustomerInputChannel({
    operatorId: "test:op",
    presenter: (payload) => singlePushed.push(payload),
    nextId: (() => {
      let i = 0;
      return () => `s-${++i}`;
    })(),
  });
  let singleInput: { customerInput?: (req: CustomerInputRequest, ctx: Record<string, unknown>) => Promise<unknown> } | undefined;
  const singleManager = new SessionManager({
    openRoleSession: async (input) => {
      singleInput = input as unknown as typeof singleInput;
      return fakeQuietHandle();
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (r) => (r === singleRoot ? singleListing : undefined),
    emitEvent: () => {},
    customerInput: singleChannel.customerInput as never,
  });
  assert.equal((await singleManager.open({ projectRoot: singleRoot, roleId: "su", runtime: "demo" })).ok, true);
  void singleInput!.customerInput!(choiceRequest("appointment", "single 任命"), { roleId: "su", projectRoot: singleRoot, runtime: "demo" });
  assert.equal(singlePushed.length, 1);
  assert.equal(singlePushed[0].mirrorRoleId, undefined, "single 不镜像（无 Liaison 主入口）");
  await singleManager.stop(null);
});

// —————————————————————— 3) 渲染侧：两面物化/冻结/排队聚合/镜像标识 ——————————————————————

test("渲染源码钉：同一请求登记一次、surfaces 列表、两面物化/冻结、徽标与来源标签、排队聚合行", () => {
  const r = readRepo("app/renderer/renderer.js");
  assert.ok(r.includes("var mirrorRoleId = typeof payload.mirrorRoleId === \"string\""), "镜像面只信主进程载荷");
  assert.ok(r.includes("var surfaces = [roleId];"), "呈现面由来源角色起始");
  assert.ok(r.includes("if (mirrorRoleId !== null) surfaces.push(mirrorRoleId);"), "镜像面追加为第二呈现面");
  assert.equal(
    (r.match(/opRequests\[requestId\] = entry = \{/g) ?? []).length,
    1,
    "同一请求只登记一次（镜像不是第二个请求）",
  );
  assert.ok(r.includes("function requestSurfaces(entry)"), "呈现面单一读取函数");
  assert.ok(
    /function openRequestIdsFor\(roleId\)[\s\S]{0,400}requestSurfaces\(entry\)\.indexOf\(roleId\) >= 0/.test(r),
    "未作答列表按 surfaces 命中（源面与镜像面同源）",
  );
  assert.ok(r.includes("requestSurfaces(entry).forEach(function (surfaceRoleId) { materializeOperatorCard(requestId, surfaceRoleId); });"), "每个呈现面各自幂等物化");
  assert.ok(r.includes('card.className = "op-request " + variantClass + (isMirror ? " is-mirror" : "")'), "镜像卡样式标识");
  assert.ok(r.includes('card.dataset.surfaceRoleId = surface'), "卡面带呈现面 roleId（读数/测试）");
  assert.ok(r.includes("op-mirror-badge") && r.includes("UiLabels.GOVERNANCE_MIRROR_BADGE"), "镜像徽标（文案来自 ui-labels）");
  assert.ok(r.includes("op-mirror-source") && r.includes("UiLabels.governanceMirrorSourceLabel(sourceName)"), "镜像来源标签（来自发起角色）");
  assert.ok(r.includes("function freezeEntryCards(entry)") && r.includes("entryCardsOf(entry).forEach"), "冻结遍历全部呈现面");
  assert.ok(
    /function onOperatorExpired\(payload\)[\s\S]{0,700}var entry = payload && opRequests\[payload\.id\];/.test(r),
    "失效按请求 id 查找（不依赖 payload.roleId 等于来源）",
  );
  assert.ok(r.includes("function renderQueueAggregate()") && r.includes("UiLabels.governanceQueueAggregateText(n)"), "主入口排队聚合行（只有数量）");
  assert.ok(r.includes("pane.appendChild(el); // 聚合行始终停在最新处"), "聚合行落主入口 pane");
  assert.ok(r.includes("if (entry.queued === true) { setEntryNote(entry, UiLabels.GOVERNANCE_QUEUE_NOTE"), "排队卡不可作答");
  const css = readRepo("app/renderer/styles.css");
  for (const cls of [".op-request.is-mirror", ".op-mirror-badge", ".op-mirror-source", ".op-queue-aggregate"]) {
    assert.ok(css.includes(cls), `styles.css 应有 ${cls}`);
  }
});

test("ui-labels：镜像徽标/来源标签/排队聚合文案逐字；单模型不出现这些行由渲染侧模型判据保证", () => {
  assert.equal(Labels.GOVERNANCE_MIRROR_BADGE, "镜像 · 主入口");
  assert.equal(
    Labels.governanceMirrorSourceLabel("报告员 Rapporteur"),
    "来自 报告员 Rapporteur 的治理决定 · 客户最终批准",
  );
  assert.equal(Labels.governanceMirrorSourceLabel(""), "来自 发起角色 的治理决定 · 客户最终批准");
  assert.equal(Labels.governanceQueueAggregateText(2), "还有 2 个决定等待前一个决定");
  assert.equal(Labels.governanceQueueAggregateText(0), "");
  const r = readRepo("app/renderer/renderer.js");
  assert.ok(
    /function onOperatorQueued\(payload\)[\s\S]{0,200}state\.governanceModel !== "trio"/.test(r),
    "single 不出现排队聚合行（模型判据）",
  );
});

// —————————————————————— 4) 自动推进推导与账本 ——————————————————————

test("下一步推导：accept→Nominator、accept-quick→Convener、任命→Convener、其余无下一步；镜像范围判据", () => {
  const accept = deriveGovernanceNextStep(choiceRequest("proposal"), {
    outcome: "answered",
    value: { selected: ["accept"] },
    operatorId: "op",
  });
  assert.deepEqual(accept, {
    version: 1,
    cardKind: "proposal",
    nextFunction: "nomination",
    roleId: "nominator",
    flowId: "flow-a",
  });
  const quick = deriveGovernanceNextStep(choiceRequest("proposal"), {
    outcome: "answered",
    value: { selected: ["accept-quick"] },
    operatorId: "op",
  });
  assert.equal(quick?.nextFunction, "schedule");
  assert.equal(quick?.roleId, "convener");
  const appointment = deriveGovernanceNextStep(choiceRequest("appointment"), {
    outcome: "answered",
    value: { selected: ["A"] },
    operatorId: "op",
  });
  assert.equal(appointment?.nextFunction, "schedule");
  assert.equal(appointment?.roleId, "convener");
  const acceptance = deriveGovernanceNextStep(choiceRequest("acceptance"), {
    outcome: "answered",
    value: { selected: ["accept"] },
    operatorId: "op",
  });
  assert.equal(acceptance?.nextFunction, null, "验收收口：无下一步");
  const revise = deriveGovernanceNextStep(choiceRequest("proposal"), {
    outcome: "answered",
    value: { selected: ["revise"] },
    operatorId: "op",
  });
  assert.equal(revise?.nextFunction, null, "修订：无下一步");
  const declined = deriveGovernanceNextStep(choiceRequest("proposal"), {
    outcome: "declined",
    operatorId: "op",
    reason: "客户拒绝",
  });
  assert.equal(declined, null, "未答不推导");
  const noKind = deriveGovernanceNextStep(choiceRequest(undefined), {
    outcome: "answered",
    value: { selected: ["accept"] },
    operatorId: "op",
  });
  assert.equal(noKind, null, "旧调用（无 cardKind）零行为变化");

  // 镜像范围（2026-10-18 契约更新）：五类治理决定卡 + 普通 `write` 均镜像；未给 cardKind 不镜像。
  for (const kind of ["proposal", "appointment", "appointment-write", "schedule-write", "acceptance", "write"] as const) {
    assert.equal(isMirroredGovernanceCard(kind), true, `${kind} 应镜像`);
  }
  assert.equal(isMirroredGovernanceCard(undefined), false);

  // 任务消息：三类都有；任命缺名单 ⇒ 不裸发。
  assert.ok(
    buildGovernanceAdvanceMessage(
      { version: 1, cardKind: "proposal", nextFunction: "nomination", roleId: "nominator", flowId: "flow-a" },
    )?.includes("请执行提名"),
  );
  assert.ok(
    buildGovernanceAdvanceMessage(
      { version: 1, cardKind: "proposal", nextFunction: "schedule", roleId: "convener", flowId: "flow-a" },
    )?.includes("快捷路径"),
  );
  assert.ok(
    buildGovernanceAdvanceMessage(
      { version: 1, cardKind: "appointment", nextFunction: "schedule", roleId: "convener", flowId: "flow-a" },
      ["A"],
    )?.includes("客户已完成任命 A"),
  );
  assert.equal(
    buildGovernanceAdvanceMessage(
      { version: 1, cardKind: "appointment", nextFunction: "schedule", roleId: "convener", flowId: "flow-a" },
      [],
    ),
    null,
    "任命名单缺失不猜测、不裸发",
  );
});

test("自动推进账本：accept→Nominator、accept-quick/任命→Convener；dispatch.accepted{app, customer-decision} 逐次一条、不写客户决定", async () => {
  const { root, cleanup } = makeRoot("advance-ledger");
  try {
    writeProjectRole(root, "A");
    write(root, ".ans/project.json", JSON.stringify({ projectRoot: root, roles: {}, governanceModel: "trio" }) + "\n");
    const prompted = new Map<string, string[]>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      createRuntimeAdapterFactoryFn: () =>
        toolAdapterFactory(capture(), { root, prompted, scriptForRole: () => [] }),
      createPiAdapterFactoryFn: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapterFn: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
    });
    await iface.listProject({ projectRoot: root });

    const advance = (
      payload: Parameters<typeof iface.advanceGovernanceFlow>[0]["payload"],
      options: { targetRoleIds?: string[]; stepId?: string } = {},
    ) =>
      iface.advanceGovernanceFlow({
        payload,
        context: {
          projectRoot: root,
          sourceRoleId: "rapporteur",
          runtime: "demo",
          ...(options.targetRoleIds !== undefined ? { targetRoleIds: options.targetRoleIds } : {}),
          ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
        },
      });

    // AC19：卡片/上下文显式给出 stepId 时逐条记入账本；未给时不伪造。
    const first = await advance(
      { version: 1, cardKind: "proposal", nextFunction: "nomination", roleId: "nominator", flowId: "flow-a" },
      { stepId: "impl" },
    );
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(first.dispatched, true);
    assert.equal(first.targetRoleId, "nominator");
    assert.ok(prompted.get("nominator")!.some((m) => m.includes("请执行提名")), "Nominator 收到提名任务");

    const quick = await advance({ version: 1, cardKind: "proposal", nextFunction: "schedule", roleId: "convener", flowId: "flow-b" });
    assert.equal(quick.ok, true);
    assert.equal(quick.targetRoleId, "convener");

    const appointment = await advance(
      { version: 1, cardKind: "appointment", nextFunction: "schedule", roleId: "convener", flowId: "flow-a" },
      { targetRoleIds: ["A"] },
    );
    assert.equal(appointment.ok, true);
    const { entries } = await waitForLedger(
      root,
      (list) => list.filter((e) => e.kind === "dispatch.accepted").length === 3,
    );
    const dispatched = entries.filter((e) => e.kind === "dispatch.accepted");
    assert.equal(dispatched.length, 3, "三次客户决定各写一条 dispatch.accepted（无重复事件）");
    assert.deepEqual(
      dispatched.map((e) => `${e.targetRoleId}:${e.flowId}`),
      ["nominator:flow-a", "convener:flow-b", "convener:flow-a"],
    );
    assert.equal(dispatched[0].stepId, "impl", "AC19：显式 stepId 记入账本");
    assert.equal(dispatched[1].stepId, undefined, "缺席时不伪造 stepId（如实诊断）");
    assert.equal(dispatched[2].stepId, undefined, "缺席时不伪造 stepId（如实诊断）");
    for (const entry of dispatched) {
      assert.equal(entry.actorRoleId, "app", "应用推进 = app");
      assert.equal(entry.power, "app");
      assert.equal(entry.trigger, "customer-decision");
      assert.equal(entry.customerDecision, undefined, "应用推进不写客户决定");
      assert.equal(entry.decisionEvidence, undefined);
      assert.ok((entry.messageSummary ?? "").length <= 200);
    }
    assert.equal(entries.some((e) => e.kind === "customer.decision"), false, "自动推进不伪造客户决定");
    await iface.stopSession();
  } finally {
    cleanup();
  }
});
