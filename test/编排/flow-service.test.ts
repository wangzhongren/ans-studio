// test/编排/flow-service.test.ts
// 2026-10-20 Flow 文件方法化（编排侧核心）：应用是 docs/flows/<flowId>.yaml 唯一写者。
// 覆盖：get revision/canUpdate、版本冲突、Steward 全步更新、owner 限制、非法迁移、done 证据对账、
// 幂等、supersede（旧/新/验收保留 id）、原子写失败不破坏原文件、并发串行恰一成功。
// 纯离线：临时目录 + 内存/临时账本；不读 .env、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFlowService,
  ensureFlowSkeleton,
  validateReleaseOnlyExtension,
  type FlowService,
  type FlowToolViewWithRelease,
} from "../../src/common/编排/flow-service.ts";
import {
  completeAcceptanceCriteriaStep,
  completeAcceptanceStep,
  completeCustomerDecisionStep,
  completeRoleCardsStep,
  observeFlowArtifacts,
  reopenAcceptanceStepForRework,
} from "../../src/pipeline/orchestration/flow-state.ts";
import { parseFlowStateYaml, type FlowState } from "../../src/common/编排/flow-state.ts";
import { readGovernanceLedger, type GovernanceLedgerEntry } from "../../src/common/编排/governance-ledger.ts";

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-flow-service-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

function writeFile(root: string, rel: string, content: string | Buffer): void {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

const FLOW_REL = "docs/flows/flow-a.yaml";

function flowYaml(over: { implStatus?: string; includeNomination?: boolean } = {}): string {
  return [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "status: in-progress",
    "steps:",
    ...(over.includeNomination === false ? [] : [
      "  - id: nomination",
      "    title: 提名",
      "    owner: Crew",
      "    kind: customer-decision",
      "    status: done",
      "    evidence: { kind: customer-decision, ref: appointment }",
    ]),
    "  - id: impl",
    "    title: 实现",
    "    owner: backend",
    "    kind: dispatch",
    `    status: ${over.implStatus ?? "pending"}`,
    "  - id: delivery",
    "    title: 前端交付",
    "    owner: frontend",
    "    kind: dispatch",
    "    status: dispatched",
    "  - id: contract-freeze",
    "    title: 冻结契约",
    "    owner: Steward",
    "    kind: artifact",
    "    status: delivered",
    "  - id: verification",
    "    title: 验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

function ledgerEntry(partial: Partial<GovernanceLedgerEntry> & Pick<GovernanceLedgerEntry, "kind">): GovernanceLedgerEntry {
  return {
    at: "2026-10-20T00:00:00.000Z",
    actorRoleId: "app",
    power: "app",
    ...partial,
  };
}

function writeLedger(root: string, entries: GovernanceLedgerEntry[]): void {
  writeFile(root, ".ans/governance/ledger.jsonl", entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function steward(root: string, over: Partial<Parameters<typeof createFlowService>[0]> = {}): FlowService {
  return createFlowService({ projectRoot: root, actorRoleId: "convener", actorPower: "schedule", ...over });
}

function owner(root: string, actorRoleId: string): FlowService {
  return createFlowService({ projectRoot: root, actorRoleId, actorPower: "project" });
}

function readFlow(root: string): { text: string; flow: FlowState } {
  const text = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
  const parsed = parseFlowStateYaml(text, "flow-a");
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return { text, flow: parsed.flow };
}

function stepOf<T extends { steps: Array<{ id: string }> }>(flow: T, id: string): T["steps"][number] {
  const step = flow.steps.find((item) => item.id === id);
  assert.ok(step, `步骤 ${id} 应存在`);
  return step!;
}

test("get：revision=文件 sha256；Steward/owner/stranger 的 canUpdate 投影", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const bytes = readFileSync(join(root, ...FLOW_REL.split("/")));

    const asSteward = await steward(root).get({ flowId: "flow-a" });
    assert.equal(asSteward.ok, true);
    assert.equal(asSteward.revision, sha256(bytes));
    assert.equal(asSteward.flow?.flowId, "flow-a");
    assert.equal(asSteward.flow?.qualityTier, "production");
    assert.deepEqual(stepOf(asSteward.flow!, "impl"), {
      id: "impl",
      title: "实现",
      owner: "backend",
      kind: "dispatch",
      status: "pending",
    });
    assert.deepEqual(asSteward.flow?.canUpdate, ["impl", "delivery", "contract-freeze", "verification"], "Steward=全部未终态");

    const asOwner = await owner(root, "backend").get({ flowId: "flow-a" });
    assert.deepEqual(asOwner.flow?.canUpdate, ["impl"], "owner=自己的未终态步骤");

    const asStranger = await owner(root, "nobody").get({ flowId: "flow-a" });
    assert.deepEqual(asStranger.flow?.canUpdate, []);
  });
});

test("release（P0-1）：flow_get 视图带 release（缺省 false）；update 保留 release: true", async () => {
  await withRoot(async (root) => {
    const releasedYaml = flowYaml().replace("qualityTier: production", "qualityTier: production\nrelease: true");
    writeFile(root, FLOW_REL, releasedYaml);

    const released = await steward(root).get({ flowId: "flow-a" });
    assert.equal(released.ok, true);
    assert.equal((released.flow as FlowToolViewWithRelease).release, true, "release: true 透出到 flow 视图");

    writeFile(root, "docs/flows/flow-b.yaml", flowYaml().replace(/flow-a/g, "flow-b"));
    const plain = await steward(root).get({ flowId: "flow-b" });
    assert.equal(((plain.flow as FlowToolViewWithRelease) ?? {}).release, false, "缺省 release = false（非发布）");

    const updated = await steward(root).update({
      flowId: "flow-a",
      stepId: "impl",
      status: "dispatched",
      expectedRevision: released.revision!,
    });
    assert.equal(updated.ok, true, updated.error ?? "");
    assert.equal((updated.flow as FlowToolViewWithRelease).release, true, "回执视图保留 release");
    const text = readFlow(root).text;
    assert.match(text, /^release: true$/m, "serialize 保留 release: true（步骤更新不清除）");
  });
});

test("validateReleaseOnlyExtension（P0-1）：只约束 release 标记；双方非发布按普通 flow 写卡放行", () => {
  const base = flowYaml();
  const released = base.replace("qualityTier: production", "qualityTier: production\nrelease: true");

  assert.deepEqual(validateReleaseOnlyExtension({ flowId: "flow-a", previousText: base, nextText: released }), {
    ok: true,
  });
  assert.deepEqual(
    validateReleaseOnlyExtension({ flowId: "flow-a", previousText: released, nextText: released }),
    { ok: true },
    "release true→true 且其余不变（幂等重发）放行",
  );

  // 双方都非发布：普通流程扩展/字段写卡（如修 dependsOn、改步骤）不施加 release-only 限制。
  const normalExtension = base.replace("status: pending", "status: dispatched");
  assert.deepEqual(
    validateReleaseOnlyExtension({ flowId: "flow-a", previousText: base, nextText: normalExtension }),
    { ok: true },
    "release 缺省的普通 flow 扩展仍通过（按既有 YAML 校验）",
  );
  assert.deepEqual(validateReleaseOnlyExtension({ flowId: "flow-a", previousText: base, nextText: base }), {
    ok: true,
  });

  const changedStep = released.replace("status: pending", "status: dispatched");
  const otherChanges = validateReleaseOnlyExtension({
    flowId: "flow-a",
    previousText: base,
    nextText: changedStep,
  });
  assert.equal(otherChanges.ok, false);
  assert.equal(otherChanges.code, "release-other-changes", "false→true 带其它变化拒绝");

  const trueWithChange = validateReleaseOnlyExtension({
    flowId: "flow-a",
    previousText: released,
    nextText: changedStep,
  });
  assert.equal(trueWithChange.ok, false);
  assert.equal(trueWithChange.code, "release-other-changes", "true/true 带其它变化拒绝");

  const downgrade = validateReleaseOnlyExtension({
    flowId: "flow-a",
    previousText: released,
    nextText: base,
  });
  assert.equal(downgrade.ok, false);
  assert.equal(downgrade.code, "release-downgrade");

  const invalidNext = validateReleaseOnlyExtension({
    flowId: "flow-a",
    previousText: base,
    nextText: "flowId: flow-a\n",
  });
  assert.equal(invalidNext.ok, false);
  assert.equal(invalidNext.code, "invalid-flow");

  const invalidPrevious = validateReleaseOnlyExtension({
    flowId: "flow-a",
    previousText: "flowId: flow-a\n",
    nextText: released,
  });
  assert.equal(invalidPrevious.ok, false);
  assert.equal(invalidPrevious.code, "previous-invalid");
});

test("get：defaultFlowId / 缺失 flowId / 不存在 / 非法 YAML", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const withDefault = createFlowService({
      projectRoot: root,
      actorRoleId: "convener",
      actorPower: "schedule",
      defaultFlowId: "flow-a",
    });
    assert.equal((await withDefault.get({})).ok, true);
    const noDefault = await steward(root).get({});
    assert.equal(noDefault.ok, false);
    assert.equal(noDefault.code, "missing-flow-id");

    const missing = await steward(root).get({ flowId: "flow-missing" });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "not-found");

    writeFile(root, FLOW_REL, "flowId: flow-a\nversion: 1\nqualityTier: production\nsteps: []\n");
    const invalid = await steward(root).get({ flowId: "flow-a" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, "invalid-flow");
    assert.match(invalid.error ?? "", /steps/);
  });
});

test("update：revision 过期且当前状态不允许该迁移 ⇒ 仍 revision-conflict（带当前 revision/flow，不写盘）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml({ implStatus: "delivered" }));
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    const service = steward(root);
    const current = await service.get({ flowId: "flow-a" });
    // delivered → dispatched 不是合法迁移 ⇒ P1-6 不重试，保持真实冲突。
    const result = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "dispatched",
      expectedRevision: "deadbeef",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "revision-conflict");
    assert.equal(result.revision, current.revision);
    assert.equal(result.flow?.flowId, "flow-a");
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, "冲突不得写盘");
  });
});

test("P1-6：stale revision + 目标步骤仍可迁移 ⇒ 重读当前 revision 重试一次成功", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    const stale = (await service.get({ flowId: "flow-a" })).revision!;
    // 模拟 schedule-write：flow 被合法改写（目标步骤 impl 仍 pending），旧 revision 过期。
    const rewritten = flowYaml().replace("title: 前端交付", "title: 前端交付（改写）");
    writeFile(root, FLOW_REL, rewritten);

    const result = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "dispatched",
      expectedRevision: stale,
    });
    assert.equal(result.ok, true, result.error ?? "");
    assert.notEqual(result.revision, stale, "重试使用当前 revision 写盘");
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "dispatched");
    assert.equal(stepOf(readFlow(root).flow, "delivery").title, "前端交付（改写）", "并发写入的其它字段保留");
  });
});

test("P1-6：并发改到不可迁移 ⇒ 仍 conflict（不掩盖真实冲突、不写盘）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    const stale = (await service.get({ flowId: "flow-a" })).revision!;
    // 模拟并发：impl 已被改为 delivered；delivered → dispatched 不允许。
    writeFile(root, FLOW_REL, flowYaml({ implStatus: "delivered" }));
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const result = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "dispatched",
      expectedRevision: stale,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "revision-conflict", "不可迁移 ⇒ 如实返回冲突");
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "delivered", "并发状态不被覆盖");
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, "冲突不得写盘");
  });
});

test("P1-6：stale revision + done 证据在当前账本无效 ⇒ 不重试、如实失败", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml({ implStatus: "delivered" }));
    const service = steward(root);
    const stale = (await service.get({ flowId: "flow-a" })).revision!;
    // 旧 revision 过期（无关字段改写），但账本没有 dispatch.accepted ⇒ done 证据无效。
    writeFile(root, FLOW_REL, flowYaml({ implStatus: "delivered" }).replace("title: 实现", "title: 实现（改写）"));
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const result = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "done",
      evidence: { kind: "dispatch", ref: "impl" },
      expectedRevision: stale,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "revision-conflict", "证据不足不触发重试，保留原始冲突");
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "delivered", "不标 done");
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, "不写盘");
  });
});

test("P1-6：stale revision + done 证据在当前账本有效 ⇒ 重试一次成功", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml({ implStatus: "delivered" }));
    writeLedger(root, [ledgerEntry({ kind: "dispatch.accepted", flowId: "flow-a", stepId: "impl" })]);
    const service = steward(root);
    const stale = (await service.get({ flowId: "flow-a" })).revision!;
    writeFile(root, FLOW_REL, flowYaml({ implStatus: "delivered" }).replace("title: 实现", "title: 实现（改写）"));

    const result = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "done",
      evidence: { kind: "dispatch", ref: "impl" },
      expectedRevision: stale,
    });
    assert.equal(result.ok, true, result.error ?? "");
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "done");
    assert.deepEqual(stepOf(readFlow(root).flow, "impl").evidence, { kind: "dispatch", ref: "impl" });
  });
});

test("Steward：pending→dispatched；P1-7 delivered 仅 owner；delivered→done 仅管理者（dispatch 证据对账）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    let revision = (await service.get({ flowId: "flow-a" })).revision!;

    const dispatched = await service.update({ flowId: "flow-a", stepId: "impl", status: "dispatched", expectedRevision: revision });
    assert.equal(dispatched.ok, true, dispatched.error ?? "");
    revision = dispatched.revision!;
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "dispatched");

    // P1-7：Steward 是 manager，但步骤 owner 是 backend ⇒ 不得代标 delivered。
    const stewardDelivered = await service.update({ flowId: "flow-a", stepId: "impl", status: "delivered", expectedRevision: revision });
    assert.equal(stewardDelivered.ok, false);
    assert.equal(stewardDelivered.code, "invalid-transition");
    assert.match(stewardDelivered.error ?? "", /owner/);
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "dispatched", "manager 代标不得落盘");

    const backend = owner(root, "backend");
    const delivered = await backend.update({ flowId: "flow-a", stepId: "impl", status: "delivered", expectedRevision: revision });
    assert.equal(delivered.ok, true, delivered.error ?? "");
    revision = delivered.revision!;

    // worker 不能 done（delivered→done 仅管理者）。
    const workerDone = await backend.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "done",
      evidence: { kind: "dispatch", ref: "impl" },
      expectedRevision: revision,
    });
    assert.equal(workerDone.ok, false);
    assert.equal(workerDone.code, "invalid-transition", "worker 不能标 done");

    const missingEvidence = await service.update({ flowId: "flow-a", stepId: "impl", status: "done", expectedRevision: revision });
    assert.equal(missingEvidence.ok, false);
    assert.equal(missingEvidence.code, "insufficient-evidence");
    assert.ok((missingEvidence.issues ?? []).some((issue) => /steps\[\d+\]\.evidence/.test(issue)));

    const wrongKind = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "done",
      evidence: { kind: "artifact", ref: "docs/x.md" },
      expectedRevision: revision,
    });
    assert.equal(wrongKind.ok, false);
    assert.equal(wrongKind.code, "insufficient-evidence");

    const noLedger = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "done",
      evidence: { kind: "dispatch", ref: "impl" },
      expectedRevision: revision,
    });
    assert.equal(noLedger.ok, false);
    assert.equal(noLedger.code, "insufficient-evidence");
    assert.ok((noLedger.issues ?? []).some((issue) => /dispatch\.accepted/.test(issue)));

    writeLedger(root, [ledgerEntry({ kind: "dispatch.accepted", flowId: "flow-a", stepId: "impl" })]);
    const done = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "done",
      evidence: { kind: "dispatch", ref: "impl" },
      expectedRevision: revision,
    });
    assert.equal(done.ok, true, done.error ?? "");
    assert.notEqual(done.revision, revision);
    const flow = readFlow(root).flow;
    assert.equal(stepOf(flow, "impl").status, "done");
    assert.deepEqual(stepOf(flow, "impl").evidence, { kind: "dispatch", ref: "impl" });
  });
});

test("owner：只能更新自己的步骤、只能 dispatched→delivered 或 dispatched|delivered→failed|blocked；done 仅 Steward", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const backend = owner(root, "backend");
    let revision = (await backend.get({ flowId: "flow-a" })).revision!;

    const pendingToDispatched = await backend.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "dispatched",
      expectedRevision: revision,
    });
    assert.equal(pendingToDispatched.ok, false);
    assert.equal(pendingToDispatched.code, "invalid-transition", "pending→dispatched 仅 Steward");

    const otherOwner = await backend.update({ flowId: "flow-a", stepId: "delivery", status: "delivered", expectedRevision: revision });
    assert.equal(otherOwner.ok, false);
    assert.equal(otherOwner.code, "forbidden");

    // Steward 把 impl 派发出去，owner 才能 delivered。
    const dispatched = await steward(root).update({
      flowId: "flow-a",
      stepId: "impl",
      status: "dispatched",
      expectedRevision: revision,
    });
    assert.equal(dispatched.ok, true, dispatched.error ?? "");
    revision = dispatched.revision!;

    const idempotent = await backend.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "dispatched",
      expectedRevision: revision,
    });
    assert.equal(idempotent.ok, true);
    assert.equal(idempotent.idempotent, true, "同 status/evidence ⇒ 幂等，不触发迁移检查");

    const delivered = await backend.update({ flowId: "flow-a", stepId: "impl", status: "delivered", expectedRevision: revision });
    assert.equal(delivered.ok, true, delivered.error ?? "");
    revision = delivered.revision!;

    const done = await backend.update({ flowId: "flow-a", stepId: "impl", status: "done", expectedRevision: revision });
    assert.equal(done.ok, false);
    assert.equal(done.code, "invalid-transition", "delivered→done 仅 Steward");

    const failed = await backend.update({ flowId: "flow-a", stepId: "impl", status: "failed", expectedRevision: revision });
    assert.equal(failed.ok, true, failed.error ?? "");
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "failed");
  });
});

test("Lead（liaison）作为工作流管理者：canUpdate 全部未终态，可 update/supersede；P1-7 不代标 delivered；证据/revision 校验不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const lead = createFlowService({ projectRoot: root, actorRoleId: "liaison", actorPower: "liaison" });
    const view = await lead.get({ flowId: "flow-a" });
    assert.equal(view.ok, true);
    assert.deepEqual(view.flow?.canUpdate, ["impl", "delivery", "contract-freeze", "verification"], "Lead=全部未终态");

    let revision = view.revision!;
    // Lead 可更新他人 owner 的步骤（管理者）：pending→dispatched 放行。
    const dispatched = await lead.update({ flowId: "flow-a", stepId: "impl", status: "dispatched", expectedRevision: revision });
    assert.equal(dispatched.ok, true, dispatched.error ?? "");
    revision = dispatched.revision!;

    // P1-7：Lead 不能代标 delivered（delivery 的 owner 是 frontend）。
    const delivered = await lead.update({ flowId: "flow-a", stepId: "delivery", status: "delivered", expectedRevision: revision });
    assert.equal(delivered.ok, false);
    assert.equal(delivered.code, "invalid-transition", "Lead 不能代标 delivered");
    assert.match(delivered.error ?? "", /owner/);

    // Lead 可 supersede。
    const superseded = await lead.supersede({
      flowId: "flow-a",
      oldStepId: "impl",
      newStepId: "impl-2",
      title: "重做实现",
      owner: "backend",
      kind: "dispatch",
      expectedRevision: revision,
    });
    assert.equal(superseded.ok, true, superseded.error ?? "");
    revision = superseded.revision!;

    // 证据/revision 校验不因管理者身份放宽。
    const insufficient = await lead.update({
      flowId: "flow-a",
      stepId: "contract-freeze",
      status: "done",
      evidence: { kind: "artifact", ref: "docs/x.md" },
      expectedRevision: revision,
    });
    assert.equal(insufficient.ok, false);
    assert.equal(insufficient.code, "insufficient-evidence");
  });
});

test("非法迁移：pending→done / dispatched→done / superseded 经 update 设置", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    let revision = (await service.get({ flowId: "flow-a" })).revision!;

    for (const status of ["done", "delivered"] as const) {
      const result = await service.update({
        flowId: "flow-a",
        stepId: "impl",
        status,
        ...(status === "done" ? { evidence: { kind: "dispatch" as const, ref: "impl" } } : {}),
        expectedRevision: revision,
      });
      assert.equal(result.ok, false, `pending→${status} 应拒绝`);
      assert.equal(result.code, "invalid-transition");
    }

    const superseded = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "superseded",
      expectedRevision: revision,
    });
    assert.equal(superseded.ok, false);
    assert.equal(superseded.code, "invalid-transition");
    assert.match(superseded.error ?? "", /flow_step_supersede/);
  });
});

test("幂等：同 status/evidence 重放 ⇒ ok/idempotent，不写盘", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    const initial = await service.get({ flowId: "flow-a" });
    const first = await service.update({ flowId: "flow-a", stepId: "impl", status: "dispatched", expectedRevision: initial.revision! });
    assert.equal(first.ok, true);
    const textAfterFirst = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    const second = await service.update({
      flowId: "flow-a",
      stepId: "impl",
      status: "dispatched",
      expectedRevision: first.revision!,
      idempotencyKey: "retry-1",
    });
    assert.equal(second.ok, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.revision, first.revision);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), textAfterFirst, "幂等不得写盘");
  });
});

test("artifact 证据：delivered→done 需账本 artifact.observed 对账", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    writeLedger(root, [ledgerEntry({
      kind: "artifact.observed",
      flowId: "flow-a",
      artifactPath: "docs/contracts/c-v1.md",
    })]);
    const done = await service.update({
      flowId: "flow-a",
      stepId: "contract-freeze",
      status: "done",
      evidence: { kind: "artifact", ref: "docs/contracts/c-v1.md" },
      expectedRevision: revision,
    });
    assert.equal(done.ok, true, done.error ?? "");
    assert.equal(stepOf(readFlow(root).flow, "contract-freeze").status, "done");
    // A2（2026-10-23 观测时序修复）：已有同 path observation ⇒ 不重复追加（文件缺失也不补观测）。
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.length, 1, "已有 observation 不重复追加");
    assert.equal(ledger.entries.filter((entry) => entry.kind === "artifact.observed").length, 1);
  });
});

test("supersede：旧步骤转 superseded + 新步骤 pending/supersedes；重复幂等；验收保留 id/已存在 id 拒绝", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    let revision = (await service.get({ flowId: "flow-a" })).revision!;

    const superseded = await service.supersede({
      flowId: "flow-a",
      oldStepId: "impl",
      newStepId: "impl-2",
      title: "重新实现",
      owner: "backend",
      kind: "dispatch",
      expectedRevision: revision,
      reason: "首版口径变更",
    });
    assert.equal(superseded.ok, true, superseded.error ?? "");
    revision = superseded.revision!;
    const flow = readFlow(root).flow;
    const oldStep = stepOf(flow, "impl");
    const newStep = stepOf(flow, "impl-2");
    assert.equal(oldStep.status, "superseded");
    assert.equal(oldStep.supersededBy, "impl-2");
    assert.equal(newStep.status, "pending");
    assert.deepEqual(newStep.supersedes, ["impl"]);
    assert.equal(newStep.kind, "dispatch");
    assert.equal(newStep.owner, "backend");

    const repeat = await service.supersede({
      flowId: "flow-a",
      oldStepId: "impl",
      newStepId: "impl-2",
      title: "重新实现",
      owner: "backend",
      kind: "dispatch",
      expectedRevision: revision,
    });
    assert.equal(repeat.ok, true);
    assert.equal(repeat.idempotent, true);

    const existing = await service.supersede({
      flowId: "flow-a",
      oldStepId: "delivery",
      newStepId: "impl-2",
      title: "重复 id",
      owner: "frontend",
      kind: "dispatch",
      expectedRevision: revision,
    });
    assert.equal(existing.ok, false);
    assert.equal(existing.code, "step-exists");

    const acceptance = await service.supersede({
      flowId: "flow-a",
      oldStepId: "verification",
      newStepId: "verification-2",
      title: "重验",
      owner: "verifier",
      kind: "acceptance",
      expectedRevision: revision,
    });
    assert.equal(acceptance.ok, false);
    assert.equal(acceptance.code, "invalid-supersede");

    const asOwner = await owner(root, "backend").supersede({
      flowId: "flow-a",
      oldStepId: "delivery",
      newStepId: "delivery-2",
      title: "重派",
      owner: "backend",
      kind: "dispatch",
      expectedRevision: revision,
    });
    assert.equal(asOwner.ok, false);
    assert.equal(asOwner.code, "forbidden");
  });
});

test("原子写失败：返回 write-failed，原文件字节不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    const service = steward(root, {
      writeFile: async () => {
        throw new Error("disk full");
      },
    });
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const result = await service.update({ flowId: "flow-a", stepId: "impl", status: "dispatched", expectedRevision: revision });
    assert.equal(result.ok, false);
    assert.equal(result.code, "write-failed");
    assert.match(result.error ?? "", /disk full/);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, "写失败不得破坏原文件");
  });
});

test("并发：两个同 revision 更新经串行队列 ⇒ 恰一成功、一 revision-conflict", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const [first, second] = await Promise.all([
      service.update({ flowId: "flow-a", stepId: "impl", status: "dispatched", expectedRevision: revision }),
      service.update({ flowId: "flow-a", stepId: "impl", status: "dispatched", expectedRevision: revision }),
    ]);
    const results = [first, second];
    assert.equal(results.filter((result) => result.ok).length, 1, "恰一成功");
    assert.equal(results.filter((result) => result.code === "revision-conflict").length, 1, "恰一冲突");
    const winner = results.find((result) => result.ok)!;
    const loser = results.find((result) => !result.ok)!;
    assert.equal(loser.revision, winner.revision, "冲突方看到胜者的 revision");
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "dispatched");
  });
});

// —————————————————————— 应用专用：completeAcceptanceStep ——————————————————————

const ACCEPTED_LEDGER = [
  ledgerEntry({
    kind: "customer.decision",
    flowId: "flow-a",
    actorRoleId: "verifier",
    power: "acceptance",
    decisionKind: "acceptance",
    customerDecision: "accepted",
  }),
];

test("completeAcceptanceStep：accepted + pending ⇒ done + acceptance 证据；重复调用幂等", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    writeLedger(root, ACCEPTED_LEDGER);
    const beforeRevision = (await steward(root).get({ flowId: "flow-a" })).revision!;

    const completed = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(completed.ok, true, completed.error ?? "");
    assert.notEqual(completed.revision, beforeRevision);
    const flow = readFlow(root).flow;
    const verification = stepOf(flow, "verification");
    assert.equal(verification.status, "done");
    assert.deepEqual(verification.evidence, { kind: "acceptance", ref: "acceptance" });
    assert.equal(stepOf(flow, "impl").status, "pending", "其他步骤保持不变");
    assert.equal(stepOf(flow, "delivery").status, "dispatched");
    assert.equal(stepOf(flow, "contract-freeze").status, "delivered");

    const again = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(again.ok, true);
    assert.equal(again.idempotent, true);
    assert.equal(again.revision, completed.revision);
  });
});

test("completeAcceptanceStep：无 accepted / rejected ⇒ acceptance-not-accepted，文件不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    writeLedger(root, [ledgerEntry({
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "verifier",
      power: "acceptance",
      decisionKind: "acceptance",
      customerDecision: "rejected",
    })]);
    const rejected = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "acceptance-not-accepted");
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before);

    rmSync(join(root, ".ans"), { recursive: true, force: true });
    const missing = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "acceptance-not-accepted");
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before);
  });
});

test("completeAcceptanceStep：账本坏行 ⇒ ledger-unavailable；无效 flow ⇒ invalid-flow，均不写盘", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    writeFile(root, ".ans/governance/ledger.jsonl", "{bad json\n");
    const badLedger = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(badLedger.ok, false);
    assert.equal(badLedger.code, "ledger-unavailable");
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before);

    writeFile(root, FLOW_REL, "flowId: flow-a\nversion: 1\nqualityTier: production\nsteps: []\n");
    const invalidBefore = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    const invalid = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, "invalid-flow");
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), invalidBefore);
  });
});

test("completeAcceptanceStep：原子写失败 ⇒ write-failed，原文件不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    writeLedger(root, ACCEPTED_LEDGER);
    const flowAbs = join(root, ...FLOW_REL.split("/"));
    const before = readFileSync(flowAbs, "utf8");
    const flowsDir = join(root, "docs", "flows");
    // 平台真值（Windows CI 实测：目录 chmod 0o500 不阻止写入，用例在 windows-2025 上得到 ok=true）：
    //  · POSIX：rename 只要求**目录**可写（文件自身权限不阻止替换）⇒ 用目录 0o500 让同目录建临时文件失败；
    //  · win32：目录 mode 不阻止写入 ⇒ 把目标 flow-a.yaml 设为只读（0o444）。atomic-write 先在同目录
    //    建临时文件再 rename 覆盖目标，MoveFileExW 覆盖只读目标返回 ERROR_ACCESS_DENIED ⇒ Node EACCES/EPERM
    //    （均在 atomic-write 的瞬时重试集合内，只读属性持续存在 ⇒ 重试上界耗尽后抛错）⇒ write-failed，
    //    目标文件未被触碰。finally 恢复 0o644。
    const readonlyTarget = process.platform === "win32";
    if (readonlyTarget) chmodSync(flowAbs, 0o444);
    else chmodSync(flowsDir, 0o500);
    try {
      const result = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
      assert.equal(result.ok, false);
      assert.equal(result.code, "write-failed");
      assert.equal(readFileSync(flowAbs, "utf8"), before);
    } finally {
      if (readonlyTarget) chmodSync(flowAbs, 0o644);
      else chmodSync(flowsDir, 0o700);
    }
    // 恢复权限后可正常再写一次：失败路径未留下半写/坏状态（断言不放宽）。
    const retry = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(retry.ok, true, retry.error ?? "");
    assert.equal(stepOf(readFlow(root).flow, "verification").status, "done");
  });
});

test("completeAcceptanceStep：并发两调用经串行队列 ⇒ 一完成一幂等，最终 revision 一致", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    writeLedger(root, ACCEPTED_LEDGER);
    const [first, second] = await Promise.all([
      completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" }),
      completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" }),
    ]);
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(second.ok, true, second.error ?? "");
    assert.equal([first, second].filter((result) => result.idempotent === true).length, 1, "恰一幂等");
    assert.equal(first.revision, second.revision);
    assert.equal(stepOf(readFlow(root).flow, "verification").status, "done");
  });
});

// —————————————————————— 应用专用：observeFlowArtifacts ——————————————————————

function observeFlowYaml(): string {
  return [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: integration-e2e",
    "    title: 全栈端到端",
    "    owner: tester",
    "    kind: artifact",
    "    status: delivered",
    "    evidence: { kind: artifact, ref: test/e2e-fullstack.test.js }",
    "  - id: verification-evidence",
    "    title: 证据整理",
    "    owner: backend",
    "    kind: artifact",
    "    status: delivered",
    "    evidence: { kind: artifact, ref: README.md }",
    "  - id: contract-freeze",
    "    title: 契约冻结",
    "    owner: convener",
    "    kind: artifact",
    "    status: delivered",
    "    evidence: { kind: artifact, ref: docs/contracts/c-v1.md }",
    "  - id: verification",
    "    title: 验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

test("observeFlowArtifacts：.js/README/契约补记 artifact.observed；owner/power/sha/flowId；幂等", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, observeFlowYaml());
    writeFile(root, "test/e2e-fullstack.test.js", "// e2e fullstack\n");
    writeFile(root, "README.md", "# readme\n");
    writeFile(root, "docs/contracts/c-v1.md", "# contract\n");

    // 账本已有 .js 的同 path+sha 观察 ⇒ 本次不重复追加。
    const jsSha = sha256(readFileSync(join(root, "test", "e2e-fullstack.test.js")));
    writeLedger(root, [ledgerEntry({
      kind: "artifact.observed",
      actorRoleId: "tester",
      power: "project",
      artifactPath: "test/e2e-fullstack.test.js",
      artifactSha256: jsSha,
      flowId: "flow-a",
    })]);

    const first = await observeFlowArtifacts({ projectRoot: root, flowId: "flow-a" });
    assert.equal(first.ok, true, first.error ?? "");
    assert.deepEqual(first.observed.sort(), ["README.md", "docs/contracts/c-v1.md"], "已有同 path+sha 的 .js 不重复");
    assert.deepEqual(first.skipped, []);

    const ledger = await readGovernanceLedger(root);
    const observed = ledger.entries.filter((entry) => entry.kind === "artifact.observed");
    assert.equal(observed.length, 3, "js 原有 1 + 本次 README/契约 2");
    const byPath = new Map(observed.map((entry) => [entry.artifactPath, entry]));
    assert.equal(byPath.get("README.md")?.actorRoleId, "backend");
    assert.equal(byPath.get("README.md")?.power, "project");
    assert.equal(byPath.get("README.md")?.flowId, "flow-a");
    assert.equal(byPath.get("README.md")?.artifactSha256, sha256(readFileSync(join(root, "README.md"))));
    assert.equal(byPath.get("docs/contracts/c-v1.md")?.actorRoleId, "convener");
    assert.equal(byPath.get("docs/contracts/c-v1.md")?.power, "schedule", "内置角色按 function");
    assert.equal(byPath.get("test/e2e-fullstack.test.js")?.artifactSha256, jsSha);

    // 重复调用幂等。
    const second = await observeFlowArtifacts({ projectRoot: root, flowId: "flow-a" });
    assert.deepEqual(second.observed, []);
    assert.equal((await readGovernanceLedger(root)).entries.filter((entry) => entry.kind === "artifact.observed").length, 3);

    // 内容变化 ⇒ 新观察。
    writeFile(root, "README.md", "# readme v2\n");
    const third = await observeFlowArtifacts({ projectRoot: root, flowId: "flow-a" });
    assert.deepEqual(third.observed, ["README.md"]);
    assert.equal((await readGovernanceLedger(root)).entries.filter((entry) => entry.kind === "artifact.observed").length, 4);

    // 不写客户决定账本。
    assert.equal((await readGovernanceLedger(root)).entries.filter((entry) => entry.kind === "customer.decision").length, 0);
  });
});

test("observeFlowArtifacts（2026-10-22）：团队计划/标准/变更包作为普通 artifact 可观察；不观察 角色卡/", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, [
      "flowId: flow-a",
      "version: 1",
      "qualityTier: production",
      "steps:",
      "  - id: team-plan",
      "    title: 团队计划",
      "    owner: convener",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: docs/scheduling/flow-a-team-v1.md }",
      "  - id: role-readiness",
      "    title: 角色就绪复核",
      "    owner: convener",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: docs/scheduling/flow-a-readiness-v1.md }",
      "  - id: acceptance-criteria",
      "    title: 实施前完成标准",
      "    owner: verifier",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: docs/acceptance/flow-a-criteria-v1.md }",
      "  - id: change-package",
      "    title: 变更包",
      "    owner: convener",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: docs/scheduling/flow-a-change-v1.md }",
      "  - id: verification",
      "    title: 验收",
      "    owner: verifier",
      "    kind: acceptance",
      "    status: pending",
      "",
    ].join("\n"));
    writeFile(root, "docs/scheduling/flow-a-team-v1.md", "# 团队计划\n");
    writeFile(root, "docs/scheduling/flow-a-readiness-v1.md", "# readiness\n");
    writeFile(root, "docs/acceptance/flow-a-criteria-v1.md", "# 标准\n");
    writeFile(root, "docs/scheduling/flow-a-change-v1.md", "# 变更包\n");
    // 角色卡/ 永不观察（即使 flow 步骤指向它）。
    writeFile(root, "角色卡/A/role-card.md", "# A\n");

    const result = await observeFlowArtifacts({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, true, result.error ?? "");
    assert.deepEqual(result.observed.sort(), [
      "docs/acceptance/flow-a-criteria-v1.md",
      "docs/scheduling/flow-a-change-v1.md",
      "docs/scheduling/flow-a-readiness-v1.md",
      "docs/scheduling/flow-a-team-v1.md",
    ]);
    const ledger = await readGovernanceLedger(root);
    const byPath = new Map(
      ledger.entries
        .filter((entry) => entry.kind === "artifact.observed")
        .map((entry) => [entry.artifactPath, entry]),
    );
    assert.equal(byPath.get("docs/scheduling/flow-a-team-v1.md")?.power, "schedule");
    assert.equal(byPath.get("docs/scheduling/flow-a-readiness-v1.md")?.power, "schedule");
    assert.equal(byPath.get("docs/acceptance/flow-a-criteria-v1.md")?.power, "verification");
    assert.equal(byPath.get("docs/scheduling/flow-a-change-v1.md")?.power, "schedule");
    assert.equal(byPath.has("角色卡/A/role-card.md"), false, "不观察 角色卡/");
  });
});

test("observeFlowArtifacts：缺失/超限/二进制/路径越界 ⇒ skipped；不写客户决定", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, [
      "flowId: flow-a",
      "version: 1",
      "qualityTier: production",
      "steps:",
      "  - id: missing",
      "    title: 缺失",
      "    owner: tester",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: missing.md }",
      "  - id: huge",
      "    title: 超大",
      "    owner: tester",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: test/huge.js }",
      "  - id: binary",
      "    title: 二进制",
      "    owner: tester",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: test/binary.md }",
      "  - id: private-ans",
      "    title: 私有",
      "    owner: tester",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: .ans/secret.md }",
      "  - id: private-role",
      "    title: 角色卡",
      "    owner: tester",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: 角色卡/x.md }",
      "  - id: private-git",
      "    title: git",
      "    owner: tester",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: .git/config }",
      "  - id: private-node",
      "    title: node_modules",
      "    owner: tester",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: node_modules/dep/index.js }",
      "  - id: verification",
      "    title: 验收",
      "    owner: verifier",
      "    kind: acceptance",
      "    status: pending",
      "",
    ].join("\n"));
    writeFile(root, "test/huge.js", "x".repeat(2 * 1024 * 1024 + 1));
    writeFile(root, "test/binary.md", Buffer.from([0x23, 0x00, 0x01]));

    const result = await observeFlowArtifacts({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, true, result.error ?? "");
    assert.deepEqual(result.observed, []);
    const reasons = new Map(result.skipped.map((item) => [item.path, item.reason]));
    assert.equal(reasons.get("missing.md"), "missing");
    assert.equal(reasons.get("test/huge.js"), "too-large");
    assert.equal(reasons.get("test/binary.md"), "binary");
    assert.equal(reasons.get(".ans/secret.md"), "path-invalid");
    assert.equal(reasons.get("角色卡/x.md"), "path-invalid");
    assert.equal(reasons.get(".git/config"), "path-invalid");
    assert.equal(reasons.get("node_modules/dep/index.js"), "path-invalid");

    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.filter((entry) => entry.kind === "artifact.observed").length, 0);
    assert.equal(ledger.entries.filter((entry) => entry.kind === "customer.decision").length, 0);
  });
});

test("observeFlowArtifacts：`..`/绝对路径在 flow YAML 校验阶段 fail-closed", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, [
      "flowId: flow-a",
      "version: 1",
      "qualityTier: production",
      "steps:",
      "  - id: outside",
      "    title: 项目外",
      "    owner: tester",
      "    kind: artifact",
      "    status: delivered",
      "    evidence: { kind: artifact, ref: ../outside.md }",
      "  - id: verification",
      "    title: 验收",
      "    owner: verifier",
      "    kind: acceptance",
      "    status: pending",
      "",
    ].join("\n"));
    const result = await observeFlowArtifacts({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /evidence\.ref|项目相对路径/);
    assert.deepEqual(result.observed, []);
  });
});

test("slug 收紧（S2/T10）：get/update/supersede/completeAcceptanceStep/observeFlowArtifacts 对尾连字符 id 显式拒绝，不写盘", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    const original = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const get = await service.get({ flowId: "flow-" });
    assert.equal(get.ok, false);
    assert.equal(get.code, "missing-flow-id");

    const update = await service.update({
      flowId: "flow-a",
      stepId: "impl-",
      status: "dispatched",
      expectedRevision: sha256(original),
    });
    assert.equal(update.ok, false);
    assert.equal(update.code, "missing-step-id");

    const supersedeOld = await service.supersede({
      flowId: "flow-a",
      oldStepId: "impl-",
      newStepId: "impl2",
      title: "重做",
      owner: "backend",
      kind: "dispatch",
      expectedRevision: sha256(original),
    });
    assert.equal(supersedeOld.ok, false);
    assert.equal(supersedeOld.code, "missing-step-id");

    const supersedeNew = await service.supersede({
      flowId: "flow-a",
      oldStepId: "impl",
      newStepId: "impl-",
      title: "重做",
      owner: "backend",
      kind: "dispatch",
      expectedRevision: sha256(original),
    });
    assert.equal(supersedeNew.ok, false);
    assert.equal(supersedeNew.code, "missing-step-id");

    const complete = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-" });
    assert.equal(complete.ok, false);
    assert.equal(complete.code, "missing-flow-id");

    const observe = await observeFlowArtifacts({ projectRoot: root, flowId: "flow-" });
    assert.equal(observe.ok, false);
    assert.match(observe.error ?? "", /合法 flowId/);

    // 合法值零回归：flow-a/impl 照常可读；文件未被上述拒绝写坏。
    const legal = await service.get({ flowId: "flow-a" });
    assert.equal(legal.ok, true);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), original, "拒绝路径不得写盘");
  });
});

// —————————————————————— 2026-10-22 MapReduce 方案 A：可选字段视图/序列化/supersede ——————————————————————

const MAP_OPTIONAL_FLOW_REL = "docs/flows/flow-a.yaml";

function mapOptionalFlow(): string {
  return [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: publish",
    "    title: 发布",
    "    owner: integration",
    "    kind: artifact",
    "    status: pending",
    "    parallelGroup: reduce",
    "  - id: impl",
    "    title: 实现",
    "    owner: backend",
    "    kind: dispatch",
    "    status: pending",
    "  - id: acceptance",
    "    title: 验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

test("可选字段：get 视图携带 parallelGroup/dependsOn；旧 flow 视图不凭空出现字段", async () => {
  await withRoot(async (root) => {
    writeFile(root, MAP_OPTIONAL_FLOW_REL, mapOptionalFlow());
    const service = steward(root);
    const view = await service.get({ flowId: "flow-a" });
    assert.equal(view.ok, true, view.error ?? "");
    const publish = view.flow!.steps.find((step) => step.id === "publish")!;
    assert.equal(publish.parallelGroup, "reduce");
    assert.equal("dependsOn" in publish, false);
    const impl = view.flow!.steps.find((step) => step.id === "impl")!;
    assert.equal("parallelGroup" in impl, false);
    assert.equal("dependsOn" in impl, false);

    // 旧 flow（无任何可选字段）：视图逐字不含新字段。
    const legacyRoot = mkdtempSync(join(tmpdir(), "ans-flow-service-legacy-"));
    try {
      writeFile(legacyRoot, MAP_OPTIONAL_FLOW_REL, flowYaml());
      const legacyView = await steward(legacyRoot).get({ flowId: "flow-a" });
      assert.equal(legacyView.ok, true, legacyView.error ?? "");
      for (const step of legacyView.flow!.steps) {
        assert.equal("parallelGroup" in step, false);
        assert.equal("dependsOn" in step, false);
      }
    } finally {
      rmSync(legacyRoot, { recursive: true, force: true });
    }
  });
});

test("supersede 新步骤携带 parallelGroup/dependsOn；幂等比较含字段；旧 flow 序列化逐字不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, MAP_OPTIONAL_FLOW_REL, mapOptionalFlow());
    const service = steward(root);
    let revision = (await service.get({ flowId: "flow-a" })).revision!;

    const superseded = await service.supersede({
      flowId: "flow-a",
      oldStepId: "impl",
      newStepId: "impl-2",
      title: "重新实现",
      owner: "integration",
      kind: "dispatch",
      expectedRevision: revision,
      parallelGroup: "reduce",
      dependsOn: ["publish"],
    });
    assert.equal(superseded.ok, true, superseded.error ?? "");
    revision = superseded.revision!;
    const newView = superseded.flow!.steps.find((step) => step.id === "impl-2")!;
    assert.equal(newView.parallelGroup, "reduce");
    assert.deepEqual(newView.dependsOn, ["publish"]);
    const written = readFileSync(join(root, ...MAP_OPTIONAL_FLOW_REL.split("/")), "utf8");
    assert.match(written, /parallelGroup: reduce/);
    assert.match(written, /publish/);

    const repeat = await service.supersede({
      flowId: "flow-a",
      oldStepId: "impl",
      newStepId: "impl-2",
      title: "重新实现",
      owner: "integration",
      kind: "dispatch",
      expectedRevision: revision,
      parallelGroup: "reduce",
      dependsOn: ["publish"],
    });
    assert.equal(repeat.ok, true);
    assert.equal(repeat.idempotent, true);

    const changed = await service.supersede({
      flowId: "flow-a",
      oldStepId: "impl",
      newStepId: "impl-2",
      title: "重新实现",
      owner: "integration",
      kind: "dispatch",
      expectedRevision: revision,
      parallelGroup: "reduce",
      dependsOn: [],
    });
    assert.equal(changed.ok, false);
    assert.equal(changed.code, "step-exists");
  });

  // 旧 flow 序列化：不因新增可选字段改变输出（逐字对照）。
  await withRoot(async (root) => {
    const minimal = [
      "flowId: flow-a",
      "version: 1",
      "qualityTier: production",
      "steps:",
      "  - id: impl",
      "    title: 实现",
      "    owner: backend",
      "    kind: dispatch",
      "    status: pending",
      "  - id: acceptance",
      "    title: 验收",
      "    owner: verifier",
      "    kind: acceptance",
      "    status: pending",
      "",
    ].join("\n");
    writeFile(root, MAP_OPTIONAL_FLOW_REL, minimal);
    let captured: string | undefined;
    const service = createFlowService({
      projectRoot: root,
      actorRoleId: "convener",
      actorPower: "schedule",
      writeFile: async (_abs, data) => {
        captured = data;
      },
    });
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const updated = await service.update({ flowId: "flow-a", stepId: "impl", status: "dispatched", expectedRevision: revision });
    assert.equal(updated.ok, true, updated.error ?? "");
    assert.equal(
      captured,
      [
        "flowId: flow-a",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: impl",
        "    title: 实现",
        "    owner: backend",
        "    kind: dispatch",
        "    status: dispatched",
        "  - id: acceptance",
        "    title: 验收",
        "    owner: verifier",
        "    kind: acceptance",
        "    status: pending",
        "",
      ].join("\n"),
      "旧 flow 序列化必须逐字不变（不出现新字段/不改顺序）",
    );
  });
});

// —————————————————————— 2026-10-23 应用专用：completeRoleCardsStep ——————————————————————

const ROLE_CARD_NAMES = [
  "role-card.md",
  "boundary.yaml",
  "feature-map.md",
  "functional-description.md",
  "memo.md",
  "api-spec.md",
] as const;

const ROLE_CARDS_FP = sha256("role-cards-gate-v1:flow-a");
const ROLE_CARDS_RECORD_REL = `.ans/governance/role-cards/flow-a/${ROLE_CARDS_FP}.json`;

interface RoleCardsRecordShape {
  schema: string;
  flowId: string;
  at: string;
  roleIds: string[];
  appointmentArtifactPath: string | null;
  teamPlan: unknown;
  fingerprint: string;
  files: Array<{ path: string; sha256: string }>;
  result: string;
  semantic: string;
  disclaimer: string;
}

function sortValidatedFiles<T extends { path: string }>(files: readonly T[]): T[] {
  return [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/** 写入某角色六文件并返回桌面会传入的 validatedFiles（含真实 sha256）。 */
function roleCardFiles(
  root: string,
  roleId: string,
  overrides: Record<string, string> = {},
): Array<{ path: string; sha256: string }> {
  return ROLE_CARD_NAMES.map((name) => {
    const content = overrides[name] ?? `# ${roleId} / ${name}\n`;
    const rel = `角色卡/${roleId}/${name}`;
    writeFile(root, rel, content);
    return { path: rel, sha256: sha256(content) };
  });
}

function roleCardsFlow(
  over: {
    kind?: "artifact" | "dispatch" | "customer-decision";
    status?: string;
    includeRoleCards?: boolean;
    roleCardsId?: string;
  } = {},
): string {
  const kind = over.kind ?? "artifact";
  const status = over.status ?? "dispatched";
  const roleCardsId = over.roleCardsId ?? "role-cards";
  const doneEvidence =
    status === "done"
      ? kind === "dispatch"
        ? "    evidence: { kind: dispatch, ref: role-cards }"
        : "    evidence: { kind: artifact, ref: .ans/governance/role-cards/flow-a/existing.json }"
      : undefined;
  return [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "steps:",
    ...(over.includeRoleCards === false
      ? []
      : [
          `  - id: ${roleCardsId}`,
          "    title: 角色卡结构校验",
          "    owner: app",
          `    kind: ${kind}`,
          `    status: ${status}`,
          ...(doneEvidence !== undefined ? [doneEvidence] : []),
        ]),
    "  - id: role-readiness",
    "    title: 角色就绪复核",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    "  - id: verification",
    "    title: 验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

function callCompleteRoleCards(
  root: string,
  validatedFiles: ReadonlyArray<{ path: string; sha256: string }>,
  over: Partial<Parameters<typeof completeRoleCardsStep>[0]> = {},
) {
  return completeRoleCardsStep({
    projectRoot: root,
    flowId: "flow-a",
    roleIds: ["A"],
    validatedFiles,
    fingerprint: ROLE_CARDS_FP,
    ...over,
  });
}

function readRoleCardsRecord(root: string, fingerprint: string = ROLE_CARDS_FP): RoleCardsRecordShape {
  const rel = `.ans/governance/role-cards/flow-a/${fingerprint}.json`;
  return JSON.parse(readFileSync(join(root, ...rel.split("/")), "utf8")) as RoleCardsRecordShape;
}

test("completeRoleCardsStep（artifact）：done + 记录 + artifact.observed(power=app)；不写 customer.decision", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow());
    const files = roleCardFiles(root, "A");
    const beforeRevision = (await steward(root).get({ flowId: "flow-a" })).revision!;

    const result = await callCompleteRoleCards(root, files, {
      appointmentArtifactPath: "docs/scheduling/flow-a-team-v1.md",
    });
    assert.equal(result.ok, true, result.error ?? "");
    assert.notEqual(result.revision, beforeRevision);
    assert.deepEqual(result.evidence, { kind: "artifact", ref: ROLE_CARDS_RECORD_REL });
    assert.equal(result.recordPath, ROLE_CARDS_RECORD_REL);

    const flow = readFlow(root).flow;
    const step = stepOf(flow, "role-cards");
    assert.equal(step.status, "done");
    assert.deepEqual(step.evidence, { kind: "artifact", ref: ROLE_CARDS_RECORD_REL });
    assert.equal(stepOf(flow, "role-readiness").status, "pending", "其他步骤保持不变");
    assert.equal(stepOf(flow, "verification").status, "pending");

    const record = readRoleCardsRecord(root);
    assert.equal(record.schema, "role-cards-gate/v1");
    assert.equal(record.flowId, "flow-a");
    assert.equal(record.fingerprint, ROLE_CARDS_FP);
    assert.deepEqual(record.roleIds, ["A"]);
    assert.equal(record.appointmentArtifactPath, "docs/scheduling/flow-a-team-v1.md");
    assert.equal(record.teamPlan, null);
    assert.equal(record.result, "structure-pass");
    assert.equal(record.semantic, "pending");
    assert.match(record.disclaimer, /结构校验通过，不代表 readiness\/验收/);
    assert.match(record.at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(record.files, sortValidatedFiles(files), "记录文件清单与桌面输入一致（确定性排序）");
    for (const file of record.files) {
      assert.equal(sha256(readFileSync(join(root, ...file.path.split("/")))), file.sha256, `${file.path} 可独立复算`);
    }

    const ledger = await readGovernanceLedger(root);
    const observed = ledger.entries.filter((entry) => entry.kind === "artifact.observed");
    assert.equal(observed.length, 1, "artifact.observed 恰一条");
    assert.equal(observed[0]?.actorRoleId, "app");
    assert.equal(observed[0]?.power, "app");
    assert.equal(observed[0]?.artifactPath, ROLE_CARDS_RECORD_REL);
    assert.equal(
      observed[0]?.artifactSha256,
      sha256(readFileSync(join(root, ...ROLE_CARDS_RECORD_REL.split("/")))),
      "账本 sha256 = 记录文件实际 sha256",
    );
    assert.equal(observed[0]?.flowId, "flow-a");
    assert.equal(ledger.entries.filter((entry) => entry.kind === "customer.decision").length, 0, "不写客户决定");
  });
});

test("completeRoleCardsStep（artifact）：重复调用幂等；同 path+sha 不重复观察；记录/账本各恰一条", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow());
    const files = roleCardFiles(root, "A");
    const first = await callCompleteRoleCards(root, files);
    assert.equal(first.ok, true, first.error ?? "");
    const flowAbs = join(root, ...FLOW_REL.split("/"));
    const flowAfterFirst = readFileSync(flowAbs, "utf8");
    const recordAbs = join(root, ...ROLE_CARDS_RECORD_REL.split("/"));
    const recordAfterFirst = readFileSync(recordAbs, "utf8");

    const second = await callCompleteRoleCards(root, files);
    assert.equal(second.ok, true, second.error ?? "");
    assert.equal(second.idempotent, true);
    assert.equal(second.revision, first.revision, "已 done ⇒ 不写盘");
    assert.equal(readFileSync(flowAbs, "utf8"), flowAfterFirst);
    assert.equal(readFileSync(recordAbs, "utf8"), recordAfterFirst, "重复调用不重写记录");

    // 模拟「记录/账本已写、flow 写失败」后的重试：把 flow 复位为 dispatched，再完成一次。
    writeFile(root, FLOW_REL, roleCardsFlow());
    const retry = await callCompleteRoleCards(root, files);
    assert.equal(retry.ok, true, retry.error ?? "");
    assert.notEqual(retry.idempotent, true);
    assert.equal(readFileSync(recordAbs, "utf8"), recordAfterFirst, "同指纹同内容复用既有记录（不换 sha）");
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.filter((entry) => entry.kind === "artifact.observed").length, 1, "同 path+sha 不重复追加");
    assert.equal(stepOf(readFlow(root).flow, "role-cards").status, "done");
  });
});

test("completeRoleCardsStep（dispatch）：账本有 dispatch.accepted{stepId:role-cards} ⇒ done + dispatch 证据；不写 .ans 记录", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow({ kind: "dispatch" }));
    const files = roleCardFiles(root, "A");
    writeLedger(root, [ledgerEntry({ kind: "dispatch.accepted", flowId: "flow-a", stepId: "role-cards" })]);

    const result = await callCompleteRoleCards(root, files);
    assert.equal(result.ok, true, result.error ?? "");
    assert.deepEqual(result.evidence, { kind: "dispatch", ref: "role-cards" });
    assert.equal(result.recordPath, undefined);
    const step = stepOf(readFlow(root).flow, "role-cards");
    assert.equal(step.status, "done");
    assert.deepEqual(step.evidence, { kind: "dispatch", ref: "role-cards" });
    assert.equal(existsSync(join(root, ".ans", "governance", "role-cards")), false, "dispatch kind 不写应用记录");
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.length, 1, "不追加账本条目");
    assert.equal(ledger.entries.filter((entry) => entry.kind === "customer.decision").length, 0);
  });
});

test("completeRoleCardsStep（dispatch）：缺 dispatch.accepted ⇒ insufficient-evidence，不写盘", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow({ kind: "dispatch" }));
    const files = roleCardFiles(root, "A");
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const result = await callCompleteRoleCards(root, files);
    assert.equal(result.ok, false);
    assert.equal(result.code, "insufficient-evidence");
    assert.match(result.error ?? "", /dispatch\.accepted/);
    assert.ok((result.issues ?? []).some((issue) => /dispatch\.accepted/.test(issue)));
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, "flow 不变");
    assert.equal(existsSync(join(root, ".ans", "governance", "role-cards")), false);
  });
});

test("completeRoleCardsStep：缺 role-cards 步骤 ⇒ role-cards-step-missing，不写盘", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow({ includeRoleCards: false }));
    const files = roleCardFiles(root, "A");
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const result = await callCompleteRoleCards(root, files);
    assert.equal(result.ok, false);
    assert.equal(result.code, "role-cards-step-missing");
    assert.match(result.error ?? "", /role-cards/);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before);
    assert.equal(existsSync(join(root, ".ans")), false);
  });
});

test("completeRoleCardsStep：已 done ⇒ ok/idempotent，不新增记录/账本，revision 不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow({ status: "done" }));
    const files = roleCardFiles(root, "A");
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    const revision = (await steward(root).get({ flowId: "flow-a" })).revision!;

    const result = await callCompleteRoleCards(root, files);
    assert.equal(result.ok, true, result.error ?? "");
    assert.equal(result.idempotent, true);
    assert.equal(result.revision, revision);
    assert.deepEqual(result.evidence, {
      kind: "artifact",
      ref: ".ans/governance/role-cards/flow-a/existing.json",
    });
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before);
    assert.equal(existsSync(join(root, ".ans")), false, "不新增 .ans 记录/账本");
  });
});

test("completeRoleCardsStep：终态（superseded/failed/blocked/aborted）⇒ role-cards-step-terminal，不覆盖", async () => {
  await withRoot(async (root) => {
    const files = roleCardFiles(root, "A");
    for (const status of ["superseded", "failed", "blocked", "aborted"]) {
      writeFile(root, FLOW_REL, roleCardsFlow({ status }));
      const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
      const result = await callCompleteRoleCards(root, files);
      assert.equal(result.ok, false, status);
      assert.equal(result.code, "role-cards-step-terminal", status);
      assert.match(result.error ?? "", new RegExp(status));
      assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, `${status} 不得被覆盖`);
    }
    assert.equal(existsSync(join(root, ".ans")), false);
  });
});

test("completeRoleCardsStep：未知 kind ⇒ role-cards-kind-unsupported，不写盘", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow({ kind: "customer-decision", status: "pending" }));
    const files = roleCardFiles(root, "A");
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const result = await callCompleteRoleCards(root, files);
    assert.equal(result.ok, false);
    assert.equal(result.code, "role-cards-kind-unsupported");
    assert.match(result.error ?? "", /customer-decision/);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before);
    assert.equal(existsSync(join(root, ".ans")), false);
  });
});

test("completeRoleCardsStep：校验后文件又变/缺失 ⇒ role-cards-stale，flow/账本/记录零写入", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow());
    const files = roleCardFiles(root, "A");
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    // 内容变化（同长度也拒绝：按内容哈希，不看 mtime）。
    writeFile(root, "角色卡/A/memo.md", "# A / memo.md changed\n");
    const changed = await callCompleteRoleCards(root, files);
    assert.equal(changed.ok, false);
    assert.equal(changed.code, "role-cards-stale");
    assert.match(changed.error ?? "", /memo\.md/);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, "flow 未写");
    assert.equal(existsSync(join(root, ".ans")), false, "记录/账本零写入");

    // 删除文件同样是 stale。
    rmSync(join(root, "角色卡", "A", "boundary.yaml"));
    const removed = await callCompleteRoleCards(root, files);
    assert.equal(removed.ok, false);
    assert.equal(removed.code, "role-cards-stale");
    assert.match(removed.error ?? "", /boundary\.yaml/);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before);
    assert.equal(existsSync(join(root, ".ans")), false);
  });
});

test("completeRoleCardsStep：validatedFiles 越界（他人角色/../绝对路径/非六文件/缺件/重复/坏哈希）⇒ 拒绝且零写入", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow());
    const files = roleCardFiles(root, "A");
    const roleCardSha = files.find((file) => file.path.endsWith("/role-card.md"))!.sha256;
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const cases: Array<{ name: string; validatedFiles: Array<{ path: string; sha256: string }> }> = [
      {
        name: "他人角色",
        validatedFiles: [
          ...files.filter((file) => !file.path.endsWith("/role-card.md")),
          { path: "角色卡/B/role-card.md", sha256: roleCardSha },
        ],
      },
      {
        name: "../ 穿越",
        validatedFiles: files.map((file) =>
          file.path.endsWith("/role-card.md") ? { ...file, path: "角色卡/A/../A/role-card.md" } : file,
        ),
      },
      {
        name: "Windows 绝对路径",
        validatedFiles: files.map((file) =>
          file.path.endsWith("/role-card.md") ? { ...file, path: "C:/tmp/role-card.md" } : file,
        ),
      },
      {
        name: "POSIX 绝对路径",
        validatedFiles: files.map((file) =>
          file.path.endsWith("/role-card.md") ? { ...file, path: "/tmp/role-card.md" } : file,
        ),
      },
      {
        name: "非六文件",
        validatedFiles: files.map((file) =>
          file.path.endsWith("/role-card.md") ? { ...file, path: "角色卡/A/notes.txt" } : file,
        ),
      },
      {
        name: "缺件",
        validatedFiles: files.filter((file) => !file.path.endsWith("/memo.md")),
      },
      {
        name: "重复",
        validatedFiles: [...files, files[0]!],
      },
      {
        name: "坏哈希",
        validatedFiles: files.map((file, index) => (index === 0 ? { ...file, sha256: "z".repeat(64) } : file)),
      },
    ];

    for (const item of cases) {
      const result = await callCompleteRoleCards(root, item.validatedFiles);
      assert.equal(result.ok, false, item.name);
      assert.equal(result.code, "invalid-validated-files", item.name);
      assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, `${item.name} 不得写 flow`);
      assert.equal(existsSync(join(root, ".ans")), false, `${item.name} 不得写 .ans`);
    }
  });
});

test("completeRoleCardsStep：roleIds/fingerprint/appointmentArtifactPath 非法 ⇒ 明确错误码且零写入", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow());
    const files = roleCardFiles(root, "A");
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const emptyRoleIds = await callCompleteRoleCards(root, files, { roleIds: [] });
    assert.equal(emptyRoleIds.code, "invalid-role-ids");

    const duplicateRoleIds = await callCompleteRoleCards(root, files, { roleIds: ["A", "a"] });
    assert.equal(duplicateRoleIds.code, "invalid-role-ids");
    assert.match(duplicateRoleIds.error ?? "", /重复/);

    const badFingerprint = await callCompleteRoleCards(root, files, { fingerprint: "abc" });
    assert.equal(badFingerprint.code, "invalid-fingerprint");

    const badAppointment = await callCompleteRoleCards(root, files, { appointmentArtifactPath: "../outside.md" });
    assert.equal(badAppointment.code, "invalid-appointment-artifact-path");

    const absoluteAppointment = await callCompleteRoleCards(root, files, {
      appointmentArtifactPath: "C:/tmp/appointment.md",
    });
    assert.equal(absoluteAppointment.code, "invalid-appointment-artifact-path");

    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before);
    assert.equal(existsSync(join(root, ".ans")), false);
  });
});

test("completeRoleCardsStep（artifact）：flow 原子写失败 ⇒ write-failed、原文件不变；恢复后重试不重复记录/账本", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow());
    const files = roleCardFiles(root, "A");
    const flowAbs = join(root, ...FLOW_REL.split("/"));
    const before = readFileSync(flowAbs, "utf8");
    const flowsDir = join(root, "docs", "flows");
    const readonlyTarget = process.platform === "win32";
    if (readonlyTarget) chmodSync(flowAbs, 0o444);
    else chmodSync(flowsDir, 0o500);
    const failed = await (async () => {
      try {
        return await callCompleteRoleCards(root, files);
      } finally {
        if (readonlyTarget) chmodSync(flowAbs, 0o644);
        else chmodSync(flowsDir, 0o700);
      }
    })();
    assert.equal(failed.ok, false);
    assert.equal(failed.code, "write-failed");
    assert.equal(readFileSync(flowAbs, "utf8"), before, "写失败不得破坏原 flow");
    const recordAfterFailure = readFileSync(join(root, ...ROLE_CARDS_RECORD_REL.split("/")), "utf8");

    const retry = await callCompleteRoleCards(root, files);
    assert.equal(retry.ok, true, retry.error ?? "");
    assert.equal(readFileSync(join(root, ...ROLE_CARDS_RECORD_REL.split("/")), "utf8"), recordAfterFailure);
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.filter((entry) => entry.kind === "artifact.observed").length, 1, "重试不重复观察");
    assert.equal(stepOf(readFlow(root).flow, "role-cards").status, "done");
  });
});

test("completeRoleCardsStep：并发两调用经串行队列 ⇒ 一完成一幂等，记录/账本恰一条", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, roleCardsFlow());
    const files = roleCardFiles(root, "A");
    const [first, second] = await Promise.all([callCompleteRoleCards(root, files), callCompleteRoleCards(root, files)]);
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(second.ok, true, second.error ?? "");
    assert.equal([first, second].filter((result) => result.idempotent === true).length, 1, "恰一幂等");
    assert.equal(first.revision, second.revision);
    assert.equal(stepOf(readFlow(root).flow, "role-cards").status, "done");
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.filter((entry) => entry.kind === "artifact.observed").length, 1);
    assert.equal(readdirSync(join(root, ".ans", "governance", "role-cards", "flow-a")).length, 1);
  });
});

test("completeRoleCardsStep 不注册为角色工具：AdapterCapabilities/run-role 无该能力，公共出口存在", () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const runRoleSource = readFileSync(join(repoRoot, "src", "pipeline", "orchestration", "run-role.ts"), "utf8");
  const runtimeSource = readFileSync(join(repoRoot, "src", "model", "runtime.ts"), "utf8");
  const publicExit = readFileSync(join(repoRoot, "src", "pipeline", "orchestration", "flow-state.ts"), "utf8");

  assert.doesNotMatch(runRoleSource, /completeRoleCardsStep/, "run-role 不得注册/引用应用专用完成函数");
  assert.doesNotMatch(runtimeSource, /completeRoleCardsStep/, "model/runtime 不得承载该能力");
  assert.match(runRoleSource, /flowGet\?: FlowGetFn/);
  assert.match(runRoleSource, /flowStepUpdate\?: FlowStepUpdateFn/);
  assert.match(runRoleSource, /flowStepSupersede\?: FlowStepSupersedeFn/);
  assert.match(publicExit, /completeRoleCardsStep/, "桌面公共出口必须再导出");
});

// —————————————————————— 2026-10-23 验收返工路由：completeAcceptanceStep 最新决定 ——————————————————————

test("completeAcceptanceStep（2026-10-23）：accepted 后又 rejected ⇒ 只认最新决定，acceptance-not-accepted，文件不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    writeLedger(root, [
      ...ACCEPTED_LEDGER,
      ledgerEntry({
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "verifier",
        power: "acceptance",
        decisionKind: "acceptance",
        customerDecision: "rejected",
      }),
    ]);
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    const result = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "acceptance-not-accepted");
    assert.match(result.error ?? "", /rejected/);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, "最新 rejected 不得写 flow");
    assert.equal(stepOf(readFlow(root).flow, "verification").status, "pending");
  });
});

test("completeAcceptanceStep（2026-10-23）：rejected 后又 accepted ⇒ 按最新决定收口（done + acceptance 证据）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    writeLedger(root, [
      ledgerEntry({
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "verifier",
        power: "acceptance",
        decisionKind: "acceptance",
        customerDecision: "rejected",
      }),
      ...ACCEPTED_LEDGER,
    ]);
    const result = await completeAcceptanceStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, true, result.error ?? "");
    const verification = stepOf(readFlow(root).flow, "verification");
    assert.equal(verification.status, "done");
    assert.deepEqual(verification.evidence, { kind: "acceptance", ref: "acceptance" });
  });
});

// —————————————————————— 2026-10-23 验收返工路由：reopenAcceptanceStepForRework ——————————————————————

const REOPEN_REJECTED_LEDGER = [
  ledgerEntry({
    kind: "customer.decision",
    flowId: "flow-a",
    actorRoleId: "verifier",
    power: "acceptance",
    decisionKind: "acceptance",
    customerDecision: "rejected",
  }),
];

const REOPEN_ACCEPTED_LEDGER = [
  ledgerEntry({
    kind: "customer.decision",
    flowId: "flow-a",
    actorRoleId: "verifier",
    power: "acceptance",
    decisionKind: "acceptance",
    customerDecision: "accepted",
  }),
];

interface ReopenFlowOverrides {
  verificationStatus?: string;
  verificationEvidence?: string;
  extraVerificationLines?: string[];
  omitVerification?: boolean;
}

/** 返工重开夹具：一个已完成的执行步骤 + 可定制的验收步骤（其他字段可按需追加）。 */
function reopenFlowYaml(over: ReopenFlowOverrides = {}): string {
  const lines = [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: delivery-old",
    "    title: 旧交付",
    "    owner: backend",
    "    kind: dispatch",
    "    status: done",
    "    evidence: { kind: dispatch, ref: delivery-old }",
  ];
  if (over.omitVerification !== true) {
    lines.push(
      "  - id: verification",
      "    title: 验收",
      "    owner: verifier",
      "    kind: acceptance",
      `    status: ${over.verificationStatus ?? "pending"}`,
      ...(over.verificationEvidence !== undefined ? [over.verificationEvidence] : []),
      ...(over.extraVerificationLines ?? []),
    );
  }
  return `${lines.join("\n")}\n`;
}

function flowBytes(root: string): string {
  return readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
}

test("reopenAcceptanceStepForRework：rejected + pending 无证据 ⇒ ok/idempotent，不写盘", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, reopenFlowYaml());
    writeLedger(root, REOPEN_REJECTED_LEDGER);
    const before = flowBytes(root);
    const beforeRevision = (await steward(root).get({ flowId: "flow-a" })).revision!;

    const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, true, result.error ?? "");
    assert.equal(result.idempotent, true);
    assert.equal(result.revision, beforeRevision);
    assert.equal(flowBytes(root), before, "幂等命中不得重写文件");
  });
});

test("reopenAcceptanceStepForRework：pending 带旧证据 ⇒ 清空旧证据并写盘（避免旧证据冒充新复核）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, reopenFlowYaml({ verificationEvidence: "    evidence: { kind: acceptance, ref: acceptance }" }));
    writeLedger(root, REOPEN_REJECTED_LEDGER);
    const before = flowBytes(root);

    const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, true, result.error ?? "");
    assert.notEqual(result.idempotent, true);
    assert.notEqual(flowBytes(root), before, "清空证据必须写盘");
    const verification = stepOf(readFlow(root).flow, "verification");
    assert.equal(verification.status, "pending");
    assert.equal(verification.evidence, undefined);

    // 再调用一次：现在 pending 无证据 ⇒ 幂等。
    const again = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(again.ok, true);
    assert.equal(again.idempotent, true);
  });
});

test("reopenAcceptanceStepForRework：dispatched/delivered ⇒ pending + 清空证据，保留 dependsOn/parallelGroup/supersedes", async () => {
  for (const status of ["dispatched", "delivered"]) {
    await withRoot(async (root) => {
      writeFile(
        root,
        FLOW_REL,
        reopenFlowYaml({
          verificationStatus: status,
          verificationEvidence: "    evidence: { kind: acceptance, ref: acceptance }",
          extraVerificationLines: [
            "    supersedes: [delivery-old]",
            "    dependsOn: [delivery-old]",
            "    parallelGroup: reduce",
          ],
        }),
      );
      writeLedger(root, REOPEN_REJECTED_LEDGER);

      const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
      assert.equal(result.ok, true, result.error ?? "");
      const verification = stepOf(readFlow(root).flow, "verification");
      assert.equal(verification.status, "pending");
      assert.equal(verification.evidence, undefined, "旧证据必须清空");
      assert.deepEqual(verification.supersedes, ["delivery-old"]);
      assert.deepEqual(verification.dependsOn, ["delivery-old"]);
      assert.equal(verification.parallelGroup, "reduce");
    });
  }
});

test("reopenAcceptanceStepForRework：done ⇒ acceptance-already-done，不自动重开，文件不变", async () => {
  await withRoot(async (root) => {
    writeFile(
      root,
      FLOW_REL,
      reopenFlowYaml({
        verificationStatus: "done",
        verificationEvidence: "    evidence: { kind: acceptance, ref: acceptance }",
      }),
    );
    writeLedger(root, [...REOPEN_ACCEPTED_LEDGER, ...REOPEN_REJECTED_LEDGER]);
    const before = flowBytes(root);
    const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "acceptance-already-done");
    assert.equal(flowBytes(root), before);
  });
});

test("reopenAcceptanceStepForRework：failed/blocked/aborted ⇒ acceptance-step-terminal，文件不变", async () => {
  for (const status of ["failed", "blocked", "aborted"]) {
    await withRoot(async (root) => {
      writeFile(root, FLOW_REL, reopenFlowYaml({ verificationStatus: status }));
      writeLedger(root, REOPEN_REJECTED_LEDGER);
      const before = flowBytes(root);
      const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
      assert.equal(result.ok, false, `${status} 应拒绝`);
      assert.equal(result.code, "acceptance-step-terminal");
      assert.equal(flowBytes(root), before);
    });
  }
});

test("reopenAcceptanceStepForRework：无 rejected/无 auto-rework 记录 ⇒ acceptance-not-rejected（accepted/未结算同样拒绝）", async () => {
  // 无决定。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, reopenFlowYaml());
    const before = flowBytes(root);
    const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "acceptance-not-rejected");
    assert.equal(flowBytes(root), before);
  });
  // 最新 accepted（即使曾 rejected）。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, reopenFlowYaml());
    writeLedger(root, [...REOPEN_REJECTED_LEDGER, ...REOPEN_ACCEPTED_LEDGER]);
    const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "acceptance-not-rejected");
    assert.match(result.error ?? "", /accepted/);
  });
  // 最新未结算（changes-requested）⇒ fail-closed。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, reopenFlowYaml());
    writeLedger(root, [
      ledgerEntry({
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "verifier",
        power: "acceptance",
        decisionKind: "acceptance",
        customerDecision: "changes-requested",
      }),
    ]);
    const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "acceptance-not-rejected");
    assert.match(result.error ?? "", /未结算|异常/);
  });
  // autoRework 只放行「无 rejected 决定」的情形；accepted 仍拒绝。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, reopenFlowYaml());
    const allowed = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a", autoRework: true });
    assert.equal(allowed.ok, true, allowed.error ?? "");
    assert.equal(allowed.idempotent, true);

    writeLedger(root, REOPEN_ACCEPTED_LEDGER);
    const rejected = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a", autoRework: true });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "acceptance-not-rejected");
  });
});

test("reopenAcceptanceStepForRework：账本坏行 ⇒ ledger-unavailable；缺验收步骤 ⇒ acceptance-step-missing；文件不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, reopenFlowYaml());
    writeFile(root, ".ans/governance/ledger.jsonl", "{bad json\n");
    const before = flowBytes(root);
    const badLedger = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(badLedger.ok, false);
    assert.equal(badLedger.code, "ledger-unavailable");
    assert.equal(flowBytes(root), before);

    rmSync(join(root, ".ans"), { recursive: true, force: true });
    writeFile(root, FLOW_REL, reopenFlowYaml({ omitVerification: true }));
    const missingBefore = flowBytes(root);
    const missing = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "acceptance-step-missing");
    assert.equal(flowBytes(root), missingBefore);
  });
});

test("reopenAcceptanceStepForRework：无效 flowId / 流程不存在 / 非法 YAML ⇒ 既有读取错误码，不写盘", async () => {
  await withRoot(async (root) => {
    const invalidId = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-" });
    assert.equal(invalidId.ok, false);
    assert.equal(invalidId.code, "missing-flow-id");

    const missing = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "not-found");

    writeFile(root, FLOW_REL, "flowId: flow-a\nversion: 1\nqualityTier: production\nsteps: []\n");
    const invalid = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, "invalid-flow");
  });
});

test("reopenAcceptanceStepForRework：原子写失败 ⇒ write-failed，原文件不变；恢复后重试成功", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, reopenFlowYaml({ verificationEvidence: "    evidence: { kind: acceptance, ref: acceptance }" }));
    writeLedger(root, REOPEN_REJECTED_LEDGER);
    const flowAbs = join(root, ...FLOW_REL.split("/"));
    const before = readFileSync(flowAbs, "utf8");
    const flowsDir = join(root, "docs", "flows");
    const readonlyTarget = process.platform === "win32";
    if (readonlyTarget) chmodSync(flowAbs, 0o444);
    else chmodSync(flowsDir, 0o500);
    try {
      const result = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
      assert.equal(result.ok, false);
      assert.equal(result.code, "write-failed");
      assert.equal(readFileSync(flowAbs, "utf8"), before, "写失败不得破坏原文件");
    } finally {
      if (readonlyTarget) chmodSync(flowAbs, 0o644);
      else chmodSync(flowsDir, 0o700);
    }
    const retry = await reopenAcceptanceStepForRework({ projectRoot: root, flowId: "flow-a" });
    assert.equal(retry.ok, true, retry.error ?? "");
    const verification = stepOf(readFlow(root).flow, "verification");
    assert.equal(verification.status, "pending");
    assert.equal(verification.evidence, undefined);
  });
});

test("reopenAcceptanceStepForRework 不注册为角色工具：run-role/model 无该能力，公共出口再导出", () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const runRoleSource = readFileSync(join(repoRoot, "src", "pipeline", "orchestration", "run-role.ts"), "utf8");
  const runtimeSource = readFileSync(join(repoRoot, "src", "model", "runtime.ts"), "utf8");
  const publicExit = readFileSync(join(repoRoot, "src", "pipeline", "orchestration", "flow-state.ts"), "utf8");

  assert.doesNotMatch(runRoleSource, /reopenAcceptanceStepForRework/, "run-role 不得注册应用专用的重开函数");
  assert.doesNotMatch(runtimeSource, /reopenAcceptanceStepForRework/, "model/runtime 不得承载该能力");
  assert.match(publicExit, /reopenAcceptanceStepForRework/, "桌面公共出口必须再导出");
});

// —————————————————————— 2026-10-23 artifact 观测时序修复（方案 A：done 时单 ref 补观测） ——————————————————————
//
// 现场：artifact 步骤写盘后立刻 done，而 run-role 的 artifact.observed 在 settle 后才扫描 ⇒
// update 对账时账本尚无 observation，被拒为 insufficient-evidence。方案 A：update done 时按观察
// 安全规则补一次单 ref 观测再对账；不安全的路径/文件/账本失败一律 fail-closed（不伪造 done）。

const DONE_ARTIFACT_REF = "docs/scheduling/flow-a-change-v5.md";

function doneArtifactFlow(over: { ref?: string; owner?: string } = {}): string {
  const ref = over.ref ?? DONE_ARTIFACT_REF;
  const owner = over.owner ?? "convener";
  return [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: change-package",
    "    title: 变更包",
    `    owner: ${owner}`,
    "    kind: artifact",
    "    status: delivered",
    `    evidence: { kind: artifact, ref: ${JSON.stringify(ref)} }`,
    "  - id: verification",
    "    title: 验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

function doneUpdate(service: FlowService, ref: string, expectedRevision: string) {
  return service.update({
    flowId: "flow-a",
    stepId: "change-package",
    status: "done",
    evidence: { kind: "artifact", ref },
    expectedRevision,
  });
}

async function artifactObservations(root: string): Promise<GovernanceLedgerEntry[]> {
  const ledger = await readGovernanceLedger(root);
  return ledger.entries.filter((entry) => entry.kind === "artifact.observed");
}

test("A1（2026-10-23）done 补观测：文件存在、账本无 observation ⇒ done + 恰一条 artifact.observed（owner/power/sha/flowId）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, DONE_ARTIFACT_REF, "# change package v5\n");
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;

    const done = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(done.ok, true, done.error ?? "");
    assert.equal(stepOf(readFlow(root).flow, "change-package").status, "done");

    const observed = await artifactObservations(root);
    assert.equal(observed.length, 1, "补观测恰一条");
    const entry = observed[0]!;
    assert.equal(entry.actorRoleId, "convener", "actorRoleId = step.owner");
    assert.equal(entry.power, "schedule", "power = artifactPowerOf(owner)");
    assert.equal(entry.artifactPath, DONE_ARTIFACT_REF);
    assert.equal(entry.artifactSha256, sha256(readFileSync(join(root, ...DONE_ARTIFACT_REF.split("/")))));
    assert.equal(entry.flowId, "flow-a");
    assert.equal(entry.stepId, undefined, "不写 stepId");
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.filter((item) => item.kind === "customer.decision").length, 0, "不写客户决定");
  });
});

test("A2（2026-10-23）幂等：已有同 path observation（不同 sha）⇒ 不重复、不读文件，更新照常成功", async () => {
  // 文件缺失 + 已观察（无 sha）：不补观测也能对账。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeLedger(root, [
      ledgerEntry({
        kind: "artifact.observed",
        actorRoleId: "convener",
        power: "schedule",
        artifactPath: DONE_ARTIFACT_REF,
      }),
    ]);
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const done = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(done.ok, true, done.error ?? "");
    const observed = await artifactObservations(root);
    assert.equal(observed.length, 1, "条数不变");
    assert.equal(observed[0]!.artifactSha256, undefined, "既有条目原样保留");
  });
  // 文件存在但内容与既有 sha 不同：仍不追加（已有同 path observation 即不再读文件）。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, DONE_ARTIFACT_REF, "# new content\n");
    writeLedger(root, [
      ledgerEntry({
        kind: "artifact.observed",
        actorRoleId: "convener",
        power: "schedule",
        artifactPath: DONE_ARTIFACT_REF,
        artifactSha256: "0".repeat(64),
      }),
    ]);
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const done = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(done.ok, true, done.error ?? "");
    const observed = await artifactObservations(root);
    assert.equal(observed.length, 1, "不追加新 observation");
    assert.equal(observed[0]!.artifactSha256, "0".repeat(64), "不读文件、不换 sha");
  });
});

test("A3（2026-10-23）并发 observeFlowArtifacts + done 补观测 ⇒ 不死锁，最终恰一条同 path+sha", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, DONE_ARTIFACT_REF, "# change package v5\n");
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;

    const [done, observed] = await Promise.all([
      doneUpdate(service, DONE_ARTIFACT_REF, revision),
      observeFlowArtifacts({ projectRoot: root, flowId: "flow-a" }),
    ]);
    assert.equal(done.ok, true, done.error ?? "");
    assert.equal(observed.ok, true, observed.error ?? "");
    const entries = await artifactObservations(root);
    assert.equal(entries.length, 1, "最终恰一条同 path+sha observation");
    assert.equal(entries[0]!.artifactPath, DONE_ARTIFACT_REF);
    assert.equal(entries[0]!.artifactSha256, sha256(readFileSync(join(root, ...DONE_ARTIFACT_REF.split("/")))));
  });
});

test("A4（2026-10-23）文件缺失 ⇒ insufficient-evidence（error 带补观测原因），flow 不变、零新 observation", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    const before = flowBytes(root);
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const result = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(result.ok, false);
    assert.equal(result.code, "insufficient-evidence");
    assert.match(result.error ?? "", /artifact\.observed/);
    assert.match(result.error ?? "", /无法安全补观测（missing）/);
    const issues = result.issues ?? [];
    assert.ok(issues.length > 0, "issues 保留");
    for (const issue of issues) assert.match(issue, /^steps\[\d+\]\.evidence: /, "issues 形状不变");
    assert.equal(flowBytes(root), before, "flow 不写");
    assert.equal((await artifactObservations(root)).length, 0, "零新 observation");
  });
});

test("A5（2026-10-23）非普通文件（目录）⇒ insufficient-evidence，零新 observation", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    mkdirSync(join(root, ...DONE_ARTIFACT_REF.split("/")), { recursive: true });
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const before = flowBytes(root);
    const result = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(result.ok, false);
    assert.equal(result.code, "insufficient-evidence");
    assert.match(result.error ?? "", /无法安全补观测（missing）/);
    assert.equal(flowBytes(root), before);
    assert.equal((await artifactObservations(root)).length, 0);
  });
});

test("A5b（2026-10-23）符号链接（项目内/外）⇒ insufficient-evidence，零新 observation（无权限创建时 skip）", async (t) => {
  const createSymlink = (target: string, link: string): boolean => {
    try {
      symlinkSync(target, link, "file");
      return true;
    } catch {
      return false;
    }
  };
  let skipReason: string | undefined;
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, "docs/scheduling/real-target.md", "# real\n");
    const linkAbs = join(root, ...DONE_ARTIFACT_REF.split("/"));
    if (!createSymlink(join(root, "docs", "scheduling", "real-target.md"), linkAbs)) {
      skipReason = "当前平台/权限无法创建符号链接";
      return;
    }
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const before = flowBytes(root);
    const result = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(result.ok, false);
    assert.equal(result.code, "insufficient-evidence");
    assert.match(result.error ?? "", /无法安全补观测（missing）/);
    assert.equal(flowBytes(root), before);
    assert.equal((await artifactObservations(root)).length, 0);
  });
  if (skipReason !== undefined) {
    t.skip(skipReason);
    return;
  }
  await withRoot(async (root) => {
    const outsideRoot = mkdtempSync(join(tmpdir(), "ans-flow-service-outside-"));
    try {
      writeFileSync(join(outsideRoot, "outside.md"), "# outside\n");
      writeFile(root, FLOW_REL, doneArtifactFlow());
      mkdirSync(join(root, "docs", "scheduling"), { recursive: true });
      const linkAbs = join(root, ...DONE_ARTIFACT_REF.split("/"));
      if (!createSymlink(join(outsideRoot, "outside.md"), linkAbs)) {
        t.skip("当前平台/权限无法创建符号链接");
        return;
      }
      const service = steward(root);
      const revision = (await service.get({ flowId: "flow-a" })).revision!;
      const before = flowBytes(root);
      const result = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
      assert.equal(result.ok, false);
      assert.equal(result.code, "insufficient-evidence");
      assert.equal(flowBytes(root), before);
      assert.equal((await artifactObservations(root)).length, 0);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

test("A6（2026-10-23）排除段（.ans/角色卡/.git/node_modules）⇒ insufficient-evidence，零新 observation", async () => {
  for (const ref of [".ans/secret.md", "角色卡/x.md", ".git/config", "node_modules/dep/index.js"]) {
    await withRoot(async (root) => {
      writeFile(root, FLOW_REL, doneArtifactFlow({ ref }));
      writeFile(root, ref, "x");
      const service = steward(root);
      const revision = (await service.get({ flowId: "flow-a" })).revision!;
      const result = await doneUpdate(service, ref, revision);
      assert.equal(result.ok, false, ref);
      assert.equal(result.code, "insufficient-evidence", ref);
      assert.match(result.error ?? "", /无法安全补观测（path-invalid）/, ref);
      assert.equal((await artifactObservations(root)).length, 0, `${ref} 零新 observation`);
    });
  }
});

test("A7（2026-10-23）超过 2 MiB ⇒ insufficient-evidence，零新 observation", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, DONE_ARTIFACT_REF, "x".repeat(2 * 1024 * 1024 + 1));
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const before = flowBytes(root);
    const result = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(result.ok, false);
    assert.equal(result.code, "insufficient-evidence");
    assert.match(result.error ?? "", /无法安全补观测（too-large）/);
    assert.equal(flowBytes(root), before);
    assert.equal((await artifactObservations(root)).length, 0);
  });
});

test("A8（2026-10-23）非图片扩展含 NUL（二进制）⇒ insufficient-evidence，零新 observation", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, DONE_ARTIFACT_REF, Buffer.from([0x23, 0x00, 0x01]));
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const before = flowBytes(root);
    const result = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(result.ok, false);
    assert.equal(result.code, "insufficient-evidence");
    assert.match(result.error ?? "", /无法安全补观测（binary）/);
    assert.equal(flowBytes(root), before);
    assert.equal((await artifactObservations(root)).length, 0);
  });
});

test("A9（2026-10-23）账本只读 append 失败 ⇒ ledger-write-failed；恢复后重试成功且不重复", async (t) => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, DONE_ARTIFACT_REF, "# change package v5\n");
    writeLedger(root, []);
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const before = flowBytes(root);
    const ledgerAbs = join(root, ".ans", "governance", "ledger.jsonl");

    chmodSync(ledgerAbs, 0o444);
    const failed = await (async () => {
      try {
        return await doneUpdate(service, DONE_ARTIFACT_REF, revision);
      } finally {
        chmodSync(ledgerAbs, 0o644);
      }
    })();
    if (failed.ok) {
      t.skip("当前宿主无法制造账本只读失败（如 root 运行）");
      return;
    }
    assert.equal(failed.code, "ledger-write-failed");
    assert.match(failed.error ?? "", /治理账本追加失败/);
    assert.equal(flowBytes(root), before, "flow 不写");
    assert.equal((await artifactObservations(root)).length, 0, "append 失败零 observation");

    const retry = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(retry.ok, true, retry.error ?? "");
    assert.equal((await artifactObservations(root)).length, 1, "恢复后恰一条");
    assert.equal(stepOf(readFlow(root).flow, "change-package").status, "done");
  });
});

test("A10（2026-10-23）补观测成功但 flow 写失败 ⇒ write-failed；重试成功且不重复追加", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, DONE_ARTIFACT_REF, "# change package v5\n");
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const before = flowBytes(root);
    const failing = steward(root, {
      writeFile: async () => {
        throw new Error("disk full");
      },
    });
    const failed = await doneUpdate(failing, DONE_ARTIFACT_REF, revision);
    assert.equal(failed.ok, false);
    assert.equal(failed.code, "write-failed");
    assert.equal(flowBytes(root), before);
    assert.equal((await artifactObservations(root)).length, 1, "账本已记录事实（append-only）");

    const retry = await doneUpdate(service, DONE_ARTIFACT_REF, revision);
    assert.equal(retry.ok, true, retry.error ?? "");
    assert.equal((await artifactObservations(root)).length, 1, "重试不重复追加");
    assert.equal(stepOf(readFlow(root).flow, "change-package").status, "done");
  });
});

test("A11（2026-10-23）dispatch/customer-decision/acceptance 的 done 不触发补观测", async () => {
  await withRoot(async (root) => {
    writeFile(
      root,
      FLOW_REL,
      [
        "flowId: flow-a",
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: impl",
        "    title: 实现",
        "    owner: backend",
        "    kind: dispatch",
        "    status: delivered",
        "    evidence: { kind: dispatch, ref: impl }",
        "  - id: appointment-gate",
        "    title: 任命",
        "    owner: convener",
        "    kind: customer-decision",
        "    status: delivered",
        "    evidence: { kind: customer-decision, ref: appointment }",
        "  - id: verification",
        "    title: 验收",
        "    owner: verifier",
        "    kind: acceptance",
        "    status: delivered",
        "    evidence: { kind: acceptance, ref: acceptance }",
        "",
      ].join("\n"),
    );
    writeLedger(root, [
      ledgerEntry({ kind: "dispatch.accepted", flowId: "flow-a", stepId: "impl" }),
      ledgerEntry({
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "convener",
        power: "schedule",
        decisionKind: "appointment",
        customerDecision: "appointed",
      }),
      ledgerEntry({
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "verifier",
        power: "acceptance",
        decisionKind: "acceptance",
        customerDecision: "accepted",
      }),
    ]);
    const service = steward(root);
    for (const stepId of ["impl", "appointment-gate", "verification"]) {
      const revision = (await service.get({ flowId: "flow-a" })).revision!;
      const evidence = stepOf(readFlow(root).flow, stepId).evidence!;
      const result = await service.update({
        flowId: "flow-a",
        stepId,
        status: "done",
        evidence: { kind: evidence.kind, ref: evidence.ref },
        expectedRevision: revision,
      });
      assert.equal(result.ok, true, `${stepId}: ${result.error ?? ""}`);
    }
    assert.equal((await artifactObservations(root)).length, 0, "非 artifact 步骤不补观测");
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.length, 3, "账本条目数不变");
    assert.equal(ledger.entries.filter((entry) => entry.kind === "customer.decision").length, 2);
  });
});

test("A13（2026-10-23）不可对账 ref（首尾空格）⇒ insufficient-evidence，零新 observation；../ 在解析阶段拒绝", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    writeFile(root, DONE_ARTIFACT_REF, "# change package v5\n");
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const before = flowBytes(root);
    const padded = ` ${DONE_ARTIFACT_REF} `;
    const result = await doneUpdate(service, padded, revision);
    assert.equal(result.ok, false);
    assert.equal(result.code, "insufficient-evidence");
    assert.match(result.error ?? "", /无法安全补观测（path-invalid）/);
    assert.equal(flowBytes(root), before);
    assert.equal((await artifactObservations(root)).length, 0, "不追加对不上账的记录");
  });
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, doneArtifactFlow());
    const service = steward(root);
    const revision = (await service.get({ flowId: "flow-a" })).revision!;
    const before = flowBytes(root);
    const result = await doneUpdate(service, "../outside.md", revision);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-flow", "项目外路径在候选 flow 解析阶段即拒绝");
    assert.equal(flowBytes(root), before);
    assert.equal((await artifactObservations(root)).length, 0);
  });
});

// —————————————————————— 2026-10-24 应用专用：completeCustomerDecisionStep ——————————————————————
//
// 现场：从零项目 demos/bookmark-manager 的 flow 里 appointment（owner=convener，
// kind=customer-decision）一直 pending；账本已有客户/判断 agent 的 appointment 决定。
// 角色工具按状态机不能把 pending 直接标 done（服务端拒绝，正确）；应用缺少 app-only 收口，
// 导致 dependsOn appointment 的 role-cards / readiness 卡住。本函数只依据账本已结算决定收口。

function customerDecisionFlow(
  over: {
    id?: string;
    status?: string;
    kind?: string;
    /** 完整 YAML evidence 行（如 `{ kind: customer-decision, ref: appointment }`）。 */
    evidence?: string;
    dependsOn?: string[];
    includeStep?: boolean;
  } = {},
): string {
  const id = over.id ?? "appointment";
  const lines = ["flowId: flow-a", "version: 1", "qualityTier: production", "steps:"];
  if (over.includeStep !== false) {
    lines.push(
      `  - id: ${id}`,
      "    title: 客户决定任命名单（任命卡）",
      "    owner: convener",
      `    kind: ${over.kind ?? "customer-decision"}`,
      `    status: ${over.status ?? "pending"}`,
      ...(over.evidence !== undefined ? [`    evidence: ${over.evidence}`] : []),
    );
  }
  lines.push(
    "  - id: role-cards",
    "    title: 角色卡",
    "    owner: nominator",
    "    kind: dispatch",
    "    status: pending",
    ...(over.dependsOn !== undefined
      ? ["    dependsOn:", ...over.dependsOn.map((dep) => `      - ${dep}`)]
      : []),
    "  - id: verification",
    "    title: 验收",
    "    owner: app",
    "    kind: acceptance",
    "    status: pending",
    "",
  );
  return lines.join("\n");
}

/** appointment 已结算账本（stepId 故意与 flow 步骤 id 不同：匹配只看 flowId + decisionKind）。 */
function appointmentDecisionLedger(over: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry[] {
  return [
    ledgerEntry({
      kind: "customer.decision",
      flowId: "flow-a",
      stepId: "role-cards",
      actorRoleId: "convener",
      power: "schedule",
      decisionKind: "appointment",
      customerDecision: "appointed",
      ...over,
    }),
  ];
}

test("completeCustomerDecisionStep：pending appointment + 最新 appointed ⇒ done + customer-decision 证据；其他步骤/字段不变；重复幂等", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ dependsOn: ["appointment"] }));
    writeLedger(root, appointmentDecisionLedger());
    const flowAbs = join(root, ...FLOW_REL.split("/"));
    const beforeRevision = (await steward(root).get({ flowId: "flow-a" })).revision!;
    const beforeLedger = (await readGovernanceLedger(root)).entries.length;

    const completed = await completeCustomerDecisionStep({
      projectRoot: root,
      flowId: "flow-a",
      stepId: "appointment",
      decisionKind: "appointment",
    });
    assert.equal(completed.ok, true, completed.error ?? "");
    assert.notEqual(completed.idempotent, true);
    assert.notEqual(completed.revision, beforeRevision);

    const flow = readFlow(root).flow;
    const appointment = stepOf(flow, "appointment");
    assert.equal(appointment.status, "done");
    assert.deepEqual(appointment.evidence, { kind: "customer-decision", ref: "appointment" });
    assert.equal(appointment.owner, "convener", "owner 不变");
    assert.equal(appointment.kind, "customer-decision", "kind 不变");
    assert.equal(appointment.title, "客户决定任命名单（任命卡）", "title 不变");
    assert.equal(stepOf(flow, "role-cards").status, "pending", "其他步骤 status 不变");
    assert.deepEqual(stepOf(flow, "role-cards").dependsOn, ["appointment"], "dependsOn 保留");
    assert.equal(stepOf(flow, "verification").status, "pending");
    assert.equal(flow.version, 1, "flow schema/顶层字段不变");
    assert.equal(flow.qualityTier, "production");
    assert.equal("release" in flow, false);

    const afterFirst = readFileSync(flowAbs, "utf8");
    assert.equal(
      (await readGovernanceLedger(root)).entries.length,
      beforeLedger,
      "不写客户决定账本、不伪造客户批准",
    );

    // 幂等：不带 decisionKind（从步骤 evidence.ref 解析）重放。
    const again = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(again.ok, true, again.error ?? "");
    assert.equal(again.idempotent, true);
    assert.equal(again.revision, completed.revision);
    assert.equal(readFileSync(flowAbs, "utf8"), afterFirst, "幂等不得写盘");
  });
});

test("completeCustomerDecisionStep：无决定 / 未结算 / 最新非已结算 ⇒ fail-closed，flow 字节不变", async () => {
  // 无任何 appointment 决定。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ dependsOn: ["appointment"] }));
    const before = flowBytes(root);
    const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "customer-decision-missing");
    assert.match(result.error ?? "", /appointment/);
    assert.equal(flowBytes(root), before, "无决定不得写 flow");
  });

  // 最新 customerDecision=none（未结算）。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ dependsOn: ["appointment"] }));
    writeLedger(root, appointmentDecisionLedger({ customerDecision: "none" }));
    const before = flowBytes(root);
    const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "customer-decision-not-resolved");
    assert.match(result.error ?? "", /none/);
    assert.equal(flowBytes(root), before);
  });

  // 曾 appointed，但最新一条 appointment 决定 rejected ⇒ 只认最新，fail-closed。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ dependsOn: ["appointment"] }));
    writeLedger(root, [
      ...appointmentDecisionLedger(),
      ...appointmentDecisionLedger({ customerDecision: "rejected" }),
    ]);
    const before = flowBytes(root);
    const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "customer-decision-not-resolved");
    assert.match(result.error ?? "", /rejected/);
    assert.equal(flowBytes(root), before, "最新 rejected 不得写 flow");
    assert.equal(stepOf(readFlow(root).flow, "appointment").status, "pending");
  });
});

test("completeCustomerDecisionStep：已 done 且证据相同 ⇒ ok/idempotent，不读账本、不写盘", async () => {
  await withRoot(async (root) => {
    writeFile(
      root,
      FLOW_REL,
      customerDecisionFlow({
        status: "done",
        evidence: "{ kind: customer-decision, ref: appointment }",
        dependsOn: ["appointment"],
      }),
    );
    // 故意不写账本：已 done 同证据必须幂等，不能被账本缺失反转为失败。
    const before = flowBytes(root);
    const revision = (await steward(root).get({ flowId: "flow-a" })).revision!;

    const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(result.ok, true, result.error ?? "");
    assert.equal(result.idempotent, true);
    assert.equal(result.revision, revision);
    assert.equal(flowBytes(root), before);

    const explicit = await completeCustomerDecisionStep({
      projectRoot: root,
      flowId: "flow-a",
      stepId: "appointment",
      decisionKind: "appointment",
    });
    assert.equal(explicit.ok, true);
    assert.equal(explicit.idempotent, true);
  });
});

test("completeCustomerDecisionStep：错 kind / 终态 / 缺步骤 ⇒ 明确错误码，不写盘", async () => {
  // 非 customer-decision 步骤。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ kind: "dispatch", dependsOn: ["appointment"] }));
    writeLedger(root, appointmentDecisionLedger());
    const before = flowBytes(root);
    const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "customer-decision-kind-unsupported");
    assert.match(result.error ?? "", /dispatch/);
    assert.equal(flowBytes(root), before);
  });

  // 终态：superseded / failed / blocked / aborted。
  for (const status of ["superseded", "failed", "blocked", "aborted"]) {
    await withRoot(async (root) => {
      writeFile(root, FLOW_REL, customerDecisionFlow({ status, dependsOn: ["appointment"] }));
      writeLedger(root, appointmentDecisionLedger());
      const before = flowBytes(root);
      const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
      assert.equal(result.ok, false, status);
      assert.equal(result.code, "customer-decision-step-terminal", status);
      assert.match(result.error ?? "", new RegExp(status));
      assert.equal(flowBytes(root), before, `${status} 不得被覆盖`);
    });
  }

  // 步骤不存在。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ includeStep: false }));
    writeLedger(root, appointmentDecisionLedger());
    const before = flowBytes(root);
    const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "customer-decision-step-missing");
    assert.equal(flowBytes(root), before);
  });

  // flowId / stepId 形状。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ dependsOn: ["appointment"] }));
    const badFlow = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-", stepId: "appointment" });
    assert.equal(badFlow.code, "missing-flow-id");
    const badStep = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment-" });
    assert.equal(badStep.code, "missing-step-id");
    const noRoot = await completeCustomerDecisionStep({ projectRoot: "  ", flowId: "flow-a", stepId: "appointment" });
    assert.equal(noRoot.code, "invalid-input");
  });
});

test("completeCustomerDecisionStep：decisionKind 解析（evidence.ref 优先 / 非法 / 冲突 / 无法解析）", async () => {
  // 无显式输入、无 evidence 时，stepId 本身是合法 decisionKind ⇒ appointment。
  // （主用例已覆盖。）带 evidence.ref 时按 evidence.ref 匹配账本。
  await withRoot(async (root) => {
    writeFile(
      root,
      FLOW_REL,
      customerDecisionFlow({
        evidence: "{ kind: customer-decision, ref: appointment-write }",
        dependsOn: ["appointment"],
      }),
    );
    writeLedger(root, [
      ledgerEntry({
        kind: "customer.decision",
        flowId: "flow-a",
        stepId: "role-cards",
        actorRoleId: "nominator",
        power: "nomination",
        decisionKind: "appointment-write",
        customerDecision: "accepted",
      }),
    ]);
    const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(result.ok, true, result.error ?? "");
    assert.deepEqual(stepOf(readFlow(root).flow, "appointment").evidence, {
      kind: "customer-decision",
      ref: "appointment-write",
    });
  });

  // 非法 decisionKind。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ dependsOn: ["appointment"] }));
    writeLedger(root, appointmentDecisionLedger());
    const before = flowBytes(root);
    const invalid = await completeCustomerDecisionStep({
      projectRoot: root,
      flowId: "flow-a",
      stepId: "appointment",
      decisionKind: "unclassified",
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, "invalid-decision-kind");
    assert.equal(flowBytes(root), before);
  });

  // 显式 decisionKind 与步骤 evidence.ref 冲突。
  await withRoot(async (root) => {
    writeFile(
      root,
      FLOW_REL,
      customerDecisionFlow({
        evidence: "{ kind: customer-decision, ref: appointment }",
        dependsOn: ["appointment"],
      }),
    );
    writeLedger(root, appointmentDecisionLedger());
    const before = flowBytes(root);
    const mismatch = await completeCustomerDecisionStep({
      projectRoot: root,
      flowId: "flow-a",
      stepId: "appointment",
      decisionKind: "appointment-write",
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "decision-kind-mismatch");
    assert.equal(flowBytes(root), before);
  });

  // 既无 evidence.ref，stepId 也不是合法 decisionKind ⇒ 无法解析。
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ id: "decision-gate" }));
    writeLedger(root, appointmentDecisionLedger());
    const before = flowBytes(root);
    const unresolved = await completeCustomerDecisionStep({
      projectRoot: root,
      flowId: "flow-a",
      stepId: "decision-gate",
    });
    assert.equal(unresolved.ok, false);
    assert.equal(unresolved.code, "decision-kind-unresolved");
    assert.equal(flowBytes(root), before);
  });
});

test("completeCustomerDecisionStep：账本坏行 ⇒ ledger-unavailable，flow 不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ dependsOn: ["appointment"] }));
    writeFile(root, ".ans/governance/ledger.jsonl", "{bad json\n");
    const before = flowBytes(root);
    const result = await completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "ledger-unavailable");
    assert.equal(flowBytes(root), before);
    assert.equal(stepOf(readFlow(root).flow, "appointment").status, "pending");
  });
});

test("completeCustomerDecisionStep：并发两调用经串行队列 ⇒ 一完成一幂等，最终 revision 一致", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, customerDecisionFlow({ dependsOn: ["appointment"] }));
    writeLedger(root, appointmentDecisionLedger());
    const [first, second] = await Promise.all([
      completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" }),
      completeCustomerDecisionStep({ projectRoot: root, flowId: "flow-a", stepId: "appointment" }),
    ]);
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(second.ok, true, second.error ?? "");
    assert.equal([first, second].filter((result) => result.idempotent === true).length, 1, "恰一幂等");
    assert.equal(first.revision, second.revision);
    assert.equal(stepOf(readFlow(root).flow, "appointment").status, "done");
  });
});

test("completeCustomerDecisionStep 不注册为角色工具：AdapterCapabilities/run-role/model/provider 无该能力，公共出口再导出", () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const runRoleSource = readFileSync(join(repoRoot, "src", "pipeline", "orchestration", "run-role.ts"), "utf8");
  const runtimeSource = readFileSync(join(repoRoot, "src", "model", "runtime.ts"), "utf8");
  const providerToolsSource = readFileSync(join(repoRoot, "src", "provider", "runtime", "tools.ts"), "utf8");
  const publicExit = readFileSync(join(repoRoot, "src", "pipeline", "orchestration", "flow-state.ts"), "utf8");

  assert.doesNotMatch(runRoleSource, /completeCustomerDecisionStep/, "run-role 不得注册/引用应用专用收口函数");
  assert.doesNotMatch(runtimeSource, /completeCustomerDecisionStep/, "model/runtime 不得承载该能力");
  assert.doesNotMatch(providerToolsSource, /completeCustomerDecisionStep/, "provider 工具不得暴露该能力");
  assert.match(publicExit, /completeCustomerDecisionStep/, "桌面公共出口必须再导出");
  assert.match(publicExit, /CompleteCustomerDecisionStepInput/);
  assert.match(runRoleSource, /flowGet\?: FlowGetFn/);
  assert.match(runRoleSource, /flowStepUpdate\?: FlowStepUpdateFn/);
  assert.match(runRoleSource, /flowStepSupersede\?: FlowStepSupersedeFn/);
});

// —————————————————————— 2026-10-25 应用专用：completeAcceptanceCriteriaStep ——————————————————————

function acceptanceCriteriaFlow(
  over: {
    status?: string;
    kind?: string;
    includeCriteria?: boolean;
    criteriaId?: string;
  } = {},
): string {
  const status = over.status ?? "pending";
  const kind = over.kind ?? "artifact";
  const criteriaId = over.criteriaId ?? "acceptance-criteria";
  return [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "status: in-progress",
    "steps:",
    ...(over.includeCriteria === false
      ? []
      : [
          `  - id: ${criteriaId}`,
          "    title: 实施前完成标准",
          "    owner: app",
          `    kind: ${kind}`,
          `    status: ${status}`,
          ...(status === "done" ? ["    evidence: { kind: artifact, ref: docs/acceptance/flow-a-criteria-v1.md }"] : []),
        ]),
    "  - id: role-readiness",
    "    title: 角色就绪复核",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    "  - id: verification",
    "    title: 验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

test("completeAcceptanceCriteriaStep：最新标准存在 ⇒ done + app/app artifact.observed；只改目标步骤、不写 customer.decision", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, acceptanceCriteriaFlow());
    writeFile(root, "docs/acceptance/flow-a-criteria-v1.md", "# v1\n");
    writeFile(root, "docs/acceptance/flow-a-criteria-v2.md", "# v2\n");
    const beforeRevision = (await steward(root).get({ flowId: "flow-a" })).revision!;

    const result = await completeAcceptanceCriteriaStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, true, result.error ?? "");
    assert.deepEqual(result.evidence, { kind: "artifact", ref: "docs/acceptance/flow-a-criteria-v2.md" });
    assert.equal(result.criteriaPath, "docs/acceptance/flow-a-criteria-v2.md", "最高版本优先（不回退 v1）");
    assert.notEqual(result.revision, beforeRevision);

    const flow = readFlow(root).flow;
    const step = stepOf(flow, "acceptance-criteria");
    assert.equal(step.status, "done");
    assert.deepEqual(step.evidence, { kind: "artifact", ref: "docs/acceptance/flow-a-criteria-v2.md" });
    assert.equal(step.owner, "app", "不改 owner");
    assert.equal(step.kind, "artifact", "不改 kind");
    assert.equal(stepOf(flow, "role-readiness").status, "pending", "其它步骤保持不变");
    assert.equal(stepOf(flow, "verification").status, "pending");

    const ledger = await readGovernanceLedger(root);
    const observed = ledger.entries.filter((entry) => entry.kind === "artifact.observed");
    assert.equal(observed.length, 1, "artifact.observed 恰一条");
    assert.equal(observed[0]?.actorRoleId, "app");
    assert.equal(observed[0]?.power, "app");
    assert.equal(observed[0]?.artifactPath, "docs/acceptance/flow-a-criteria-v2.md");
    assert.equal(observed[0]?.artifactSha256, sha256("# v2\n"), "账本 sha256 = 标准文件实际 sha256");
    assert.equal(observed[0]?.flowId, "flow-a");
    assert.equal(ledger.entries.filter((entry) => entry.kind === "customer.decision").length, 0, "不写客户决定");
  });
});

test("completeAcceptanceCriteriaStep：已 done ⇒ ok/idempotent/already-done，不读标准、不写账本/flow", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, acceptanceCriteriaFlow({ status: "done" }));
    const before = flowBytes(root);
    const beforeRevision = (await steward(root).get({ flowId: "flow-a" })).revision!;

    const first = await completeAcceptanceCriteriaStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(first.idempotent, true);
    assert.equal(first.alreadyDone, true);
    assert.equal(first.code, "already-done");
    assert.equal(first.revision, beforeRevision);
    assert.deepEqual(first.evidence, { kind: "artifact", ref: "docs/acceptance/flow-a-criteria-v1.md" });
    assert.equal(flowBytes(root), before, "幂等命中不得重写文件");

    const second = await completeAcceptanceCriteriaStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(second.ok, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.revision, beforeRevision);
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.length, 0, "已 done 不读/写账本");
  });
});

test("completeAcceptanceCriteriaStep：标准缺失 ⇒ acceptance-criteria-missing，flow/账本零写入", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, acceptanceCriteriaFlow());
    const before = flowBytes(root);

    const result = await completeAcceptanceCriteriaStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "acceptance-criteria-missing");
    assert.match(result.error ?? "", /flow-a-criteria-vN\.md/);
    assert.equal(flowBytes(root), before, "flow 不变");
    assert.equal(stepOf(readFlow(root).flow, "acceptance-criteria").status, "pending");
    assert.equal((await readGovernanceLedger(root)).entries.length, 0, "不补观测");
  });
});

test("completeAcceptanceCriteriaStep：非 acceptance-criteria flow/步骤 ⇒ 明确失败且零写入", async () => {
  await withRoot(async (root) => {
    // 1) 流程没有 acceptance-criteria 步骤。
    writeFile(root, FLOW_REL, acceptanceCriteriaFlow({ includeCriteria: false }));
    writeFile(root, "docs/acceptance/flow-a-criteria-v1.md", "# v1\n");
    const missingBefore = flowBytes(root);
    const missing = await completeAcceptanceCriteriaStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "acceptance-criteria-step-missing");
    assert.equal(flowBytes(root), missingBefore);
    assert.equal((await readGovernanceLedger(root)).entries.length, 0);

    // 2) 有同名步骤但 kind 不是 artifact。
    writeFile(root, FLOW_REL, acceptanceCriteriaFlow({ kind: "customer-decision" }));
    const kindBefore = flowBytes(root);
    const unsupported = await completeAcceptanceCriteriaStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(unsupported.ok, false);
    assert.equal(unsupported.code, "acceptance-criteria-kind-unsupported");
    assert.equal(flowBytes(root), kindBefore);
    assert.equal((await readGovernanceLedger(root)).entries.length, 0);
  });
});

test("completeAcceptanceCriteriaStep：非 pending/dispatched（delivered）⇒ 终态拒绝，不覆盖状态", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, acceptanceCriteriaFlow({ status: "delivered" }));
    writeFile(root, "docs/acceptance/flow-a-criteria-v1.md", "# v1\n");
    const before = flowBytes(root);
    const result = await completeAcceptanceCriteriaStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "acceptance-criteria-step-terminal");
    assert.match(result.error ?? "", /delivered/);
    assert.equal(flowBytes(root), before);
    assert.equal((await readGovernanceLedger(root)).entries.length, 0);
  });
});

test("completeAcceptanceCriteriaStep：已有同 path+sha 观测 ⇒ 不重复追加；flow 复位后可重试收口", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, acceptanceCriteriaFlow());
    writeFile(root, "docs/acceptance/flow-a-criteria-v1.md", "# v1\n");
    writeLedger(root, [
      ledgerEntry({
        kind: "artifact.observed",
        actorRoleId: "app",
        power: "app",
        artifactPath: "docs/acceptance/flow-a-criteria-v1.md",
        artifactSha256: sha256("# v1\n"),
        flowId: "flow-a",
      }),
    ]);

    const result = await completeAcceptanceCriteriaStep({ projectRoot: root, flowId: "flow-a" });
    assert.equal(result.ok, true, result.error ?? "");
    const ledger = await readGovernanceLedger(root);
    assert.equal(
      ledger.entries.filter((entry) => entry.kind === "artifact.observed").length,
      1,
      "同 path+sha 不重复追加",
    );
    assert.equal(stepOf(readFlow(root).flow, "acceptance-criteria").status, "done");
  });
});

test("completeAcceptanceCriteriaStep 不注册为角色工具：run-role/model/provider 无该能力，公共出口再导出", () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const runRoleSource = readFileSync(join(repoRoot, "src", "pipeline", "orchestration", "run-role.ts"), "utf8");
  const runtimeSource = readFileSync(join(repoRoot, "src", "model", "runtime.ts"), "utf8");
  const providerToolsSource = readFileSync(join(repoRoot, "src", "provider", "runtime", "tools.ts"), "utf8");
  const publicExit = readFileSync(join(repoRoot, "src", "pipeline", "orchestration", "flow-state.ts"), "utf8");

  assert.doesNotMatch(runRoleSource, /completeAcceptanceCriteriaStep/, "run-role 不得注册/引用应用专用收口函数");
  assert.doesNotMatch(runtimeSource, /completeAcceptanceCriteriaStep/, "model/runtime 不得承载该能力");
  assert.doesNotMatch(providerToolsSource, /completeAcceptanceCriteriaStep/, "provider 工具不得暴露该能力");
  assert.match(publicExit, /completeAcceptanceCriteriaStep/, "桌面公共出口必须再导出");
  assert.match(publicExit, /CompleteAcceptanceCriteriaStepInput/);
  assert.match(publicExit, /CompleteAcceptanceCriteriaStepResult/);
});

test("ensureFlowSkeleton：意图交接时创建通用流程骨架（status: skeleton；全部 pending；不含项目角色/交付步骤）", async () => {
  await withRoot(async (root) => {
    const result = await ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "prototype" });
    assert.equal(result.ok, true, result.error ?? "");
    assert.equal(result.created, true);
    const text = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    assert.equal(
      result.revision,
      createHash("sha256").update(text).digest("hex"),
      "revision 与文件字节 sha256 同口径",
    );
    const parsed = parseFlowStateYaml(text, "flow-a");
    assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
    if (!parsed.ok) return;
    assert.equal(parsed.flow.version, 1);
    assert.equal(parsed.flow.qualityTier, "prototype");
    assert.equal(parsed.flow.status, "skeleton");
    assert.deepEqual(
      parsed.flow.steps.map((step) => [step.id, step.kind, step.owner, step.status]),
      [
        ["contract-freeze", "artifact", "rapporteur", "pending"],
        ["team-plan", "artifact", "convener", "pending"],
        ["appointment", "customer-decision", "convener", "pending"],
        ["role-cards", "dispatch", "nominator", "pending"],
        ["role-readiness", "artifact", "convener", "pending"],
        ["acceptance-criteria", "artifact", "verifier", "pending"],
        ["change-package", "artifact", "convener", "pending"],
        ["verification", "acceptance", "app", "pending"],
      ],
    );
    // 不预写项目角色 / 交付步骤 / gate：骨架只保证「文件已存在、通用步骤可登记」
    assert.equal(text.includes("delivery-"), false, "骨架不得预写项目交付步骤");
    assert.equal(text.includes("gateKind"), false, "骨架不得预写 gate");
    assert.equal(text.includes("build-scaffold"), false, "骨架不得预写项目脚手架步骤");
    // dependsOn 只表达标准工作流顺序（通用，不猜项目信息）；保留验收步骤无额外依赖
    assert.deepEqual(
      parsed.flow.steps.filter((step) => step.dependsOn !== undefined).map((step) => [step.id, step.dependsOn]),
      [
        ["team-plan", ["contract-freeze"]],
        ["appointment", ["team-plan"]],
        ["role-cards", ["appointment"]],
        ["role-readiness", ["role-cards"]],
        ["acceptance-criteria", ["role-readiness"]],
        ["change-package", ["acceptance-criteria"]],
      ],
    );
    // 只写 YAML：不写账本、不写客户决定、不预建 .ans
    assert.equal(existsSync(join(root, ".ans")), false, "骨架创建不得触碰 .ans");
  });
});

test("ensureFlowSkeleton：已存在任何流程（骨架 / 完整流程 / 非法 YAML）绝不覆盖", async () => {
  await withRoot(async (root) => {
    const first = await ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "production" });
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(first.created, true);
    const skeletonText = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    const again = await ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "prototype" });
    assert.equal(again.ok, true, again.error ?? "");
    assert.equal(again.created, false);
    assert.equal(again.revision, undefined, "未新建时不给 revision");
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), skeletonText, "已存在骨架不得改写（含 qualityTier）");

    const fullFlow = flowYaml();
    writeFile(root, FLOW_REL, fullFlow);
    const onFullFlow = await ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "prototype" });
    assert.equal(onFullFlow.ok, true, onFullFlow.error ?? "");
    assert.equal(onFullFlow.created, false);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), fullFlow, "完整流程不得被骨架覆盖");

    const broken = "flowId: [unterminated";
    writeFile(root, FLOW_REL, broken);
    const onBroken = await ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "prototype" });
    assert.equal(onBroken.ok, true, onBroken.error ?? "");
    assert.equal(onBroken.created, false);
    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), broken, "非法既有内容也不覆盖（交既有校验报错）");
  });
});

test("ensureFlowSkeleton：flowId / qualityTier / projectRoot 非法 ⇒ fail-closed 且零写盘", async () => {
  await withRoot(async (root) => {
    for (const flowId of ["", "../evil", "Flow-A", "flow-", "flow a", "a"]) {
      const result = await ensureFlowSkeleton({ projectRoot: root, flowId, qualityTier: "production" });
      assert.equal(result.ok, false, `flowId=${JSON.stringify(flowId)} 应拒绝`);
      assert.equal(result.created, false);
      assert.match(result.error ?? "", /flowId 非法/);
    }
    const badTier = await ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "fast" as never });
    assert.equal(badTier.ok, false);
    assert.equal(badTier.created, false);
    assert.match(badTier.error ?? "", /qualityTier/);
    const noRoot = await ensureFlowSkeleton({ projectRoot: "  ", flowId: "flow-a", qualityTier: "production" });
    assert.equal(noRoot.ok, false);
    assert.equal(noRoot.created, false);
    assert.match(noRoot.error ?? "", /projectRoot/);
    assert.equal(existsSync(join(root, "docs/flows/flow-a.yaml")), false, "非法输入不得落盘");
  });
});

test("ensureFlowSkeleton：目标被目录占用 / docs/flows 不可建 ⇒ 明确失败、不抛、不破坏现场", async () => {
  await withRoot(async (root) => {
    const target = join(root, ...FLOW_REL.split("/"));
    mkdirSync(target, { recursive: true });
    const blocked = await ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "production" });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.created, false);
    assert.match(blocked.error ?? "", /流程骨架检查失败/);
    assert.equal(lstatSync(target).isDirectory(), true, "占位目录不得被文件替换");
  });
  await withRoot(async (root) => {
    const flowsPath = join(root, "docs", "flows");
    writeFile(root, "docs/flows", "not a directory");
    const result = await ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "production" });
    assert.equal(result.ok, false);
    assert.equal(result.created, false);
    assert.equal(readFileSync(flowsPath, "utf8"), "not a directory", "既有文件不得被破坏");
  });
});

test("ensureFlowSkeleton：同一项目并发调用恰一个 created（与 flow 写入共用串行队列）", async () => {
  await withRoot(async (root) => {
    const [first, second] = await Promise.all([
      ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "production" }),
      ensureFlowSkeleton({ projectRoot: root, flowId: "flow-a", qualityTier: "prototype" }),
    ]);
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(second.ok, true, second.error ?? "");
    assert.equal([first.created, second.created].filter(Boolean).length, 1, "并发下恰一个新建，另一个视为已存在");
    const parsed = parseFlowStateYaml(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), "flow-a");
    assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  });
});
