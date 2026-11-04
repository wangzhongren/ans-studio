// test/门禁引擎/stable-write-guard.test.ts
// 2026-11-04（trunk-amendment-model C2b / F13）：stable 写入一次性许可判定——
// C1 `StableWritePermit` 唯一 permit 形状；路径/kind/roleId 绑定；快照同源防伪造；
// status approved；未过期（TTL 30 分钟）；未消费；hash==targetSha；baseSha 与当前文件一致；
// denied ⇒ 可直接返回的 WriteDecision 拒绝（allowedByRoot 空集 + code/rejection）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  installStableWritePermitSnapshot,
  invalidateStableWritePermitSnapshot,
  noteStableWritePermitConsumed,
  stableWriteDecision,
  stableWritePathOf,
  type StableWritePermitView,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { StableWritePermit } from "../../src/model/version-change.ts";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const NOW = () => new Date("2026-11-04T00:10:00.000Z");

function makePermit(overrides: Partial<StableWritePermit> = {}): StableWritePermit {
  const base = {
    v: 1 as const,
    schema: "stable-write/v1" as const,
    permitId: "permit-1",
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    kind: "workflow" as const,
    authority: { decisionId: "decision-1" },
    baseSha256: "",
    targetSha256: sha("# workflow target\n"),
    status: "approved" as const,
    approvedAt: "2026-11-04T00:00:00.000Z",
    expiresAt: "2026-11-04T00:20:00.000Z",
    issuedAt: "2026-11-04T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function setupRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-stable-write-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "角色卡", "designer"), { recursive: true });
  return root;
}

test("stableWritePathOf：workflow / role-card / boundary 识别；内置角色与治理边界不匹配；规范化", () => {
  assert.deepEqual(stableWritePathOf("docs/workflow.md"), { kind: "workflow", roleId: "convener", path: "docs/workflow.md" });
  assert.deepEqual(stableWritePathOf("docs\\workflow.md"), { kind: "workflow", roleId: "convener", path: "docs/workflow.md" });
  assert.deepEqual(stableWritePathOf("./docs/WORKFLOW.md"), { kind: "workflow", roleId: "convener", path: "docs/workflow.md" });
  assert.deepEqual(stableWritePathOf("角色卡/designer/role-card.md"), { kind: "role-card", roleId: "designer", path: "角色卡/designer/role-card.md" });
  assert.deepEqual(stableWritePathOf("角色卡/designer/boundary.yaml"), { kind: "boundary", roleId: "designer", path: "角色卡/designer/boundary.yaml" });
  assert.deepEqual(stableWritePathOf("角色卡/designer/ROLE-CARD.MD"), { kind: "role-card", roleId: "designer", path: "角色卡/designer/role-card.md" });
  // 内置角色（应用管理）不得走 stable-write。
  assert.equal(stableWritePathOf("角色卡/chief/role-card.md"), undefined);
  assert.equal(stableWritePathOf("角色卡/convener/boundary.yaml"), undefined);
  // 应用治理边界不是项目角色 stable 文件。
  assert.equal(stableWritePathOf("角色卡/governance-boundary.yaml"), undefined);
  // 逃逸/绝对/多余层级。
  assert.equal(stableWritePathOf("../docs/workflow.md"), undefined);
  assert.equal(stableWritePathOf("/docs/workflow.md"), undefined);
  assert.equal(stableWritePathOf("docs/workflow.md/extra"), undefined);
  assert.equal(stableWritePathOf("docs/other.md"), undefined);
});

test("F13 形状：StableWritePermitView 是 C1 StableWritePermit 的类型别名（无第二套状态枚举）", () => {
  const permit = makePermit();
  const view: StableWritePermitView = permit;
  const back: StableWritePermit = view;
  assert.equal(back.permitId, "permit-1");
  assert.equal("v" in view, true);
});

test("无许可 ⇒ permit-missing；denied 携带可直接返回的 WriteDecision（allowedByRoot 空集 + code/rejection）", () => {
  const root = setupRoot();
  try {
    const decision = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), now: NOW });
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.code, "stable-write-permit-missing");
      assert.equal(decision.writeDecision.allowed, false);
      assert.deepEqual(decision.writeDecision.allowedByRoot, { skill: [], project: [] });
      assert.equal(decision.writeDecision.code, decision.code);
      assert.equal(decision.writeDecision.rejection?.code, decision.code);
      assert.match(decision.reason, /stable-write-permit-missing/);
    }
    // 快照未安装 ⇒ fail-closed（unavailable）
    const uninstalled = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: makePermit(), now: NOW });
    assert.equal(uninstalled.allowed, false);
    if (!uninstalled.allowed) assert.equal(uninstalled.code, "stable-write-invalid");
  } finally {
    invalidateStableWritePermitSnapshot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("许可放行：新文件 base=\"\" ⇒ allowed，返回 permitId/requestId/decisionId", () => {
  const root = setupRoot();
  try {
    const permit = makePermit();
    installStableWritePermitSnapshot(root, [permit]);
    const decision = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit, now: NOW });
    assert.equal(decision.allowed, true, JSON.stringify(decision));
    if (decision.allowed) {
      assert.equal(decision.permitId, "permit-1");
      assert.equal(decision.requestId, "sw-1");
      assert.equal(decision.decisionId, "decision-1");
    }
  } finally {
    invalidateStableWritePermitSnapshot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("伪造/陈旧/未签发许可：不在快照或与快照字段不一致 ⇒ permit-invalid（不采信调用方对象）", () => {
  const root = setupRoot();
  try {
    const permit = makePermit();
    installStableWritePermitSnapshot(root, [permit]);
    // 未签发：permitId 不在快照。
    const forged = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: makePermit({ permitId: "permit-x" }), now: NOW });
    assert.equal(forged.allowed, false);
    if (!forged.allowed) assert.equal(forged.code, "stable-write-permit-invalid");
    // 快照中存在同 id，但调用方对象 targetSha 被篡改 ⇒ 与快照不一致。
    const tampered = stableWriteDecision({
      projectRoot: root,
      relPath: "docs/workflow.md",
      sha256: sha("# other\n"),
      permit: makePermit({ targetSha256: sha("# other\n") }),
      now: NOW,
    });
    assert.equal(tampered.allowed, false);
    if (!tampered.allowed) assert.equal(tampered.code, "stable-write-permit-invalid");
  } finally {
    invalidateStableWritePermitSnapshot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("status / 一次性：consumed / failed / 过期 status / noteConsumed 后均拒绝", () => {
  const root = setupRoot();
  try {
    const consumed = makePermit({ status: "consumed", consumedAt: "2026-11-04T00:05:00.000Z" });
    installStableWritePermitSnapshot(root, [consumed]);
    const consumedDecision = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: consumed, now: NOW });
    assert.equal(consumedDecision.allowed, false);
    if (!consumedDecision.allowed) assert.equal(consumedDecision.code, "stable-write-permit-consumed");

    const failed = makePermit({ status: "failed" });
    installStableWritePermitSnapshot(root, [failed]);
    const failedDecision = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: failed, now: NOW });
    assert.equal(failedDecision.allowed, false);
    if (!failedDecision.allowed) assert.equal(failedDecision.code, "stable-write-permit-invalid");

    const expiredStatus = makePermit({ status: "expired" });
    installStableWritePermitSnapshot(root, [expiredStatus]);
    const expiredStatusDecision = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: expiredStatus, now: NOW });
    assert.equal(expiredStatusDecision.allowed, false);
    if (!expiredStatusDecision.allowed) assert.equal(expiredStatusDecision.code, "stable-write-permit-expired");

    // post-write 消费后同步内存快照 ⇒ 同一许可不可复用。
    const approved = makePermit();
    installStableWritePermitSnapshot(root, [approved]);
    noteStableWritePermitConsumed(root, "permit-1", "2026-11-04T00:06:00.000Z");
    const reused = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: approved, now: NOW });
    assert.equal(reused.allowed, false);
    if (!reused.allowed) assert.equal(reused.code, "stable-write-permit-consumed");
  } finally {
    invalidateStableWritePermitSnapshot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("过期 / TTL 30 分钟：now ≥ expiresAt ⇒ expired；有效期超 TTL ⇒ invalid", () => {
  const root = setupRoot();
  try {
    const permit = makePermit();
    installStableWritePermitSnapshot(root, [permit]);
    const expired = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit, now: () => new Date("2026-11-04T00:20:00.000Z") });
    assert.equal(expired.allowed, false);
    if (!expired.allowed) assert.equal(expired.code, "stable-write-permit-expired");
    // 31 分钟有效期 ⇒ 超 TTL 上限。
    const longPermit = makePermit({ expiresAt: "2026-11-04T00:31:00.000Z" });
    installStableWritePermitSnapshot(root, [longPermit]);
    const longDecision = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: longPermit, now: NOW });
    assert.equal(longDecision.allowed, false);
    if (!longDecision.allowed) assert.equal(longDecision.code, "stable-write-permit-invalid");
  } finally {
    invalidateStableWritePermitSnapshot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("hash/base 绑定：写入 sha 必须等于 targetSha；baseSha 必须等于当前文件（\"\"=不存在）", () => {
  const root = setupRoot();
  try {
    const existing = "# workflow base\n";
    fs.writeFileSync(path.join(root, "docs/workflow.md"), existing, "utf8");
    const target = "# workflow target\n";
    const permit = makePermit({ baseSha256: sha(existing), targetSha256: sha(target) });
    installStableWritePermitSnapshot(root, [permit]);
    // 内容 hash 不符 ⇒ hash-mismatch。
    const mismatch = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# other\n"), permit, now: NOW });
    assert.equal(mismatch.allowed, false);
    if (!mismatch.allowed) assert.equal(mismatch.code, "stable-write-hash-mismatch");
    // base 一致 + target 一致 ⇒ allowed。
    const allowed = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha(target), permit, now: NOW });
    assert.equal(allowed.allowed, true, JSON.stringify(allowed));
    // 批准后文件被改 ⇒ base 不一致 ⇒ 拒绝。
    fs.writeFileSync(path.join(root, "docs/workflow.md"), "# workflow changed after approval\n", "utf8");
    const drift = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha(target), permit, now: NOW });
    assert.equal(drift.allowed, false);
    if (!drift.allowed) assert.equal(drift.code, "stable-write-permit-invalid");
    // 文件不存在但许可要求既有 base ⇒ 拒绝。
    fs.rmSync(path.join(root, "docs/workflow.md"));
    const missingButBase = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha(target), permit, now: NOW });
    assert.equal(missingButBase.allowed, false);
    if (!missingButBase.allowed) assert.equal(missingButBase.code, "stable-write-permit-invalid");
  } finally {
    invalidateStableWritePermitSnapshot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("路径/kind/roleId 绑定：workflow 只允许 convener；role-card/boundary roleId 必须等于目录名", () => {
  const root = setupRoot();
  try {
    // workflow 许可 roleId 非 convener ⇒ path-mismatch。
    const wrongWorkflowRole = makePermit({ roleId: "nominator" });
    installStableWritePermitSnapshot(root, [wrongWorkflowRole]);
    const wrongWorkflow = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: wrongWorkflowRole, now: NOW });
    assert.equal(wrongWorkflow.allowed, false);
    if (!wrongWorkflow.allowed) assert.equal(wrongWorkflow.code, "stable-write-path-mismatch");
    // 许可指向 workflow，却用于 role-card ⇒ path-mismatch。
    const workflowPermit = makePermit();
    installStableWritePermitSnapshot(root, [workflowPermit]);
    const wrongPath = stableWriteDecision({ projectRoot: root, relPath: "角色卡/designer/role-card.md", sha256: sha("# workflow target\n"), permit: workflowPermit, now: NOW });
    assert.equal(wrongPath.allowed, false);
    if (!wrongPath.allowed) assert.equal(wrongPath.code, "stable-write-path-mismatch");
    // 合法 role-card 许可。
    const cardTarget = "# role card target\n";
    fs.writeFileSync(path.join(root, "角色卡/designer/role-card.md"), cardTarget, "utf8");
    const cardPermit = makePermit({
      permitId: "permit-card",
      requestId: "sw-2",
      roleId: "designer",
      path: "角色卡/designer/role-card.md",
      kind: "role-card",
      authority: { confirmationId: "appointment-1" },
      baseSha256: sha(cardTarget),
      targetSha256: sha(cardTarget),
    });
    installStableWritePermitSnapshot(root, [cardPermit]);
    const cardDecision = stableWriteDecision({ projectRoot: root, relPath: "角色卡/designer/role-card.md", sha256: sha(cardTarget), permit: cardPermit, now: NOW });
    assert.equal(cardDecision.allowed, true, JSON.stringify(cardDecision));
    if (cardDecision.allowed) assert.equal(cardDecision.confirmationId, "appointment-1");
    // roleId 不匹配 ⇒ path-mismatch。
    const wrongRole = makePermit({ ...cardPermit, permitId: "permit-card-2", roleId: "someone-else" });
    installStableWritePermitSnapshot(root, [wrongRole]);
    const wrongRoleDecision = stableWriteDecision({ projectRoot: root, relPath: "角色卡/designer/role-card.md", sha256: sha(cardTarget), permit: wrongRole, now: NOW });
    assert.equal(wrongRoleDecision.allowed, false);
    if (!wrongRoleDecision.allowed) assert.equal(wrongRoleDecision.code, "stable-write-path-mismatch");
  } finally {
    invalidateStableWritePermitSnapshot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("authority：decisionId / confirmationId 至少一个；空 authority 许可不入快照 ⇒ permit-invalid", () => {
  const root = setupRoot();
  try {
    // C1 类型不允许空 authority；运行期伪造对象（as unknown）⇒ 快照过滤后不在快照。
    const emptyAuthority = { ...makePermit(), authority: {} } as unknown as StableWritePermit;
    installStableWritePermitSnapshot(root, [emptyAuthority]);
    const decision = stableWriteDecision({ projectRoot: root, relPath: "docs/workflow.md", sha256: sha("# workflow target\n"), permit: emptyAuthority, now: NOW });
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.code, "stable-write-permit-invalid");
  } finally {
    invalidateStableWritePermitSnapshot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
