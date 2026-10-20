// test/编排/flow-service.test.ts
// 2026-10-20 Flow 文件方法化（编排侧核心）：应用是 docs/flows/<flowId>.yaml 唯一写者。
// 覆盖：get revision/canUpdate、版本冲突、Steward 全步更新、owner 限制、非法迁移、done 证据对账、
// 幂等、supersede（旧/新/验收保留 id）、原子写失败不破坏原文件、并发串行恰一成功。
// 纯离线：临时目录 + 内存/临时账本；不读 .env、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFlowService, type FlowService } from "../../src/common/编排/flow-service.ts";
import { completeAcceptanceStep, observeFlowArtifacts } from "../../src/pipeline/orchestration/flow-state.ts";
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

test("update：expectedRevision 不匹配 ⇒ revision-conflict（带当前 revision/flow，不写盘）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    const service = steward(root);
    const current = await service.get({ flowId: "flow-a" });
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

test("Steward：pending→dispatched→delivered→done（dispatch 证据对账）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const service = steward(root);
    let revision = (await service.get({ flowId: "flow-a" })).revision!;

    const dispatched = await service.update({ flowId: "flow-a", stepId: "impl", status: "dispatched", expectedRevision: revision });
    assert.equal(dispatched.ok, true, dispatched.error ?? "");
    revision = dispatched.revision!;
    assert.equal(stepOf(readFlow(root).flow, "impl").status, "dispatched");

    const delivered = await service.update({ flowId: "flow-a", stepId: "impl", status: "delivered", expectedRevision: revision });
    assert.equal(delivered.ok, true, delivered.error ?? "");
    revision = delivered.revision!;

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

test("Lead（liaison）作为工作流管理者：canUpdate 全部未终态，可 update/supersede；证据/revision 校验不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml());
    const lead = createFlowService({ projectRoot: root, actorRoleId: "liaison", actorPower: "liaison" });
    const view = await lead.get({ flowId: "flow-a" });
    assert.equal(view.ok, true);
    assert.deepEqual(view.flow?.canUpdate, ["impl", "delivery", "contract-freeze", "verification"], "Lead=全部未终态");

    let revision = view.revision!;
    // Lead 可更新他人 owner 的步骤（管理者）。
    const delivered = await lead.update({ flowId: "flow-a", stepId: "delivery", status: "delivered", expectedRevision: revision });
    assert.equal(delivered.ok, true, delivered.error ?? "");
    revision = delivered.revision!;

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
