// test/测试/trunk-stable-write-integration.test.ts
// T1（2026-11-05 trunk-amendment Batch 5）：stable 确认即写 / mini re-pin 与 trunk 生命周期的
// 跨层集成——真实 D1 桌面栈（createVersionChangeStack：S1/S2/S4 组合 + 卡通道 + IPC 状态投影）→
// 真实 run-role gate（一次性许可 `stableWriteDecision` 的真实执行点）→ 真实 trunk service
// （apply-journal、derive/verify、refreeze/abandon/history、恢复）→ 真实账本（tasks.jsonl）。
//
// 替身仅限：客户作答（模拟客户本人在确认卡上点选）与通知收集；不启动 Electron、不触网、不改产品代码。
// 覆盖（V1 §4.3 / AC-12/25/27/33–36、PM F15/F16）：
//   · workflow 轻量确认卡（diff/base/target hash）→ 一次性许可 → run-role gate 放行/哈希不符拒绝 →
//     post-write 复核 → mini re-pin（trunkVersion 不变、绑定 decisionId、无 drift）；
//   · 拒绝/无通道/哈希不符/过期许可 fail-closed（许可作废、快照不变、无 stable-repinned）；
//   · appointment-write 钩子（role-card）→ 许可 → gate → mini re-pin roleCards（F15 三类快照载荷）；
//   · apply-journal：提交点/幂等重放/base 不一致/内容哈希不符不改指针；对账两方向/phase 滞后；
//   · refreeze（只更新 stable 快照不升版本、客户归属）/ abandonUpgrade（不改指针）/ history（归档）；
//   · 恢复 tN+1（客户确认）；冻结注册表 corrupt ⇒ 恢复拒绝（fail-closed）。

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  createCustomerInputChannel,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import {
  buildStableWriteCard,
  createVersionChangeStack,
  toStableWriteOutcome,
  type StableWritePreview,
  type VersionChangeStack,
} from "../../app/desktop/version-change.ts";
import {
  installStableWritePermitSnapshot,
  stableWriteDecision,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { appendTaskEvent, readTaskState } from "../../src/common/编排/task-state.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import type { TaskStateEvent } from "../../src/model/runtime.ts";
import type { StableWritePermit, StableWriteRecord } from "../../src/model/version-change.ts";
import type { TrunkApplySnapshot, TrunkManifest } from "../../src/model/trunk.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import type { VersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createRunRepinPort, createTrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { TrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import {
  AT,
  FLOW_ID,
  PATHS,
  createTrunkProject,
  sha256,
  writeProjectFile,
  type TrunkProject,
} from "../编排/fixtures/trunk-project.ts";

const CUSTOMER_CTX = { roleId: "application", governanceModel: "trio" as const };
// stable 许可 TTL 由真实时钟判定（run-role gate 的 `stableWriteDecision` 不注入 now），
// 本文件的事件/许可时间使用真实时钟；固定基线时间（AT）只用于夹具文档。
const AT2 = new Date().toISOString();

async function waitFor<T>(probe: () => T | undefined, label: string, timeoutMs = 3_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

interface LedgerRig {
  events: TaskStateEvent[];
  emit: (event: TaskStateEvent) => Promise<void>;
  ledger: () => Promise<TaskStateEvent[]>;
}

function ledgerRig(projectRoot: string): LedgerRig {
  const events: TaskStateEvent[] = [];
  return {
    events,
    async emit(event) {
      events.push(event);
      const appended = await appendTaskEvent(projectRoot, event);
      assert.equal(appended.ok, true, `账本写入失败：${JSON.stringify(appended)}`);
    },
    async ledger() {
      const state = await readTaskState(projectRoot);
      assert.deepEqual(state.errors, [], `账本事件必须通过 C2a 逐 kind 校验：${JSON.stringify(state.errors)}`);
      return state.events;
    },
  };
}

function eventsOfKind(events: TaskStateEvent[], kind: string): Array<Record<string, unknown>> {
  return events.filter((event) => event.kind === kind) as unknown as Array<Record<string, unknown>>;
}

function eventOf<T extends TaskStateEvent["kind"]>(
  events: TaskStateEvent[],
  kind: T,
): Array<Extract<TaskStateEvent, { kind: T }>> {
  return events.filter((event) => event.kind === kind) as Array<Extract<TaskStateEvent, { kind: T }>>;
}

interface ChannelHarness {
  channel: ReturnType<typeof createCustomerInputChannel>;
  pushed: OperatorRequestPayload[];
}

function makeChannel(): ChannelHarness {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "customer",
  });
  return { channel, pushed };
}

interface StackRig {
  project: TrunkProject;
  stack: VersionChangeStack;
  ledger: LedgerRig;
  channel: ChannelHarness;
}

interface StackOptions {
  withStableChannel?: boolean;
  stableChoice?: "approve-stable-write" | "reject-stable-write";
  migrationCompleted?: () => boolean;
}

async function setupStack(options: StackOptions = {}): Promise<StackRig> {
  const project = await createTrunkProject();
  const ledger = ledgerRig(project.root);
  // 先建立真实 trunk manifest（mini re-pin 需要落盘 manifest，derived 不可续接）。
  await bootstrapThrough(project, ledger.emit);
  const channel = makeChannel();
  const stack = createVersionChangeStack({
    projectRoot: project.root,
    // stable 许可 TTL 由真实时钟判定（run-role gate 的 `stableWriteDecision` 不注入 now）；
    // 测试使用真实时间生成/校验许可，避免固定历史时间导致许可“过期”。
    now: () => new Date(),
    emitEvent: ledger.emit,
    migrationCompleted: options.migrationCompleted ?? (() => true),
    ...(options.withStableChannel === false
      ? {}
      : {
          async presentStableWriteCard(record: StableWriteRecord, preview: StableWritePreview) {
            const built = buildStableWriteCard({ record, preview });
            assert.ok(built !== undefined, "stable 卡组装失败");
            const pending = channel.channel.customerInput(built!.request, CUSTOMER_CTX);
            const payload = await waitFor(() => channel.pushed.shift(), "stable 客户卡呈现");
            const accepted = channel.channel.respond({
              id: payload.id,
              decision: { kind: "choice", selected: [options.stableChoice ?? "approve-stable-write"] },
            });
            assert.equal(accepted.ok, true, accepted.error ?? "");
            const outcome = await pending;
            const withDecision =
              outcome?.outcome === "answered"
                ? { ...outcome, decisionId: `decision-${payload.id}` }
                : outcome;
            return toStableWriteOutcome(withDecision);
          },
        }),
    notify: () => {},
  });
  const initialized = await stack.ensureInitialized();
  assert.equal(initialized.ok, true, `栈初始化失败：${initialized.code ?? ""} ${initialized.message ?? ""}`);
  return { project, stack, ledger, channel };
}

async function bootstrapThrough(
  project: TrunkProject,
  emit: (event: TaskStateEvent) => Promise<void>,
): Promise<{ integration: VersionChangeIntegration; trunkRuntime: TrunkRuntime }> {
  const integration = createVersionChangeIntegration({
    projectRoot: project.root,
    now: () => new Date(AT),
    migrationCompleted: () => true,
    runRepin: createRunRepinPort(project.root),
  });
  const trunkRuntime = createTrunkRuntime({
    projectRoot: project.root,
    service: integration.trunk,
    emitEvent: emit,
    now: () => new Date(AT),
  });
  const boot = await trunkRuntime.bootstrap({
    flowId: FLOW_ID,
    runId: project.runId,
    applicationId: "vc-boot",
    decisionId: "dec-boot",
    target: project.snapshot(),
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
    journalId: "j-boot",
    at: AT2,
  });
  assert.equal(boot.ok, true, boot.ok ? "" : `${boot.code}: ${boot.message ?? ""}`);
  return { integration, trunkRuntime };
}

// ———————————————— run-role gate 夹具（stable 写入真实执行点） ————————————————

const WORKFLOW_OLD = "# workflow\n";

function gateProject(root: string): ProjectConfig {
  const files: Array<[string, string]> = [
    ["角色卡/X/role-card.md", "# 角色 X\n"],
    [
      "角色卡/X/boundary.yaml",
      [
        "role: X",
        "entries:",
        "  - kind: file",
        "    path: docs/workflow.md",
        "    purpose: stable 文件",
        "  - kind: file",
        "    path: 角色卡/impl/role-card.md",
        "    purpose: stable 文件",
        "  - kind: file",
        "    path: 角色卡/impl/boundary.yaml",
        "    purpose: stable 文件",
        "  - kind: directory",
        "    path: docs/proposals/",
        "    purpose: 版本化文档",
        "",
      ].join("\n"),
    ],
  ];
  for (const [rel, text] of files) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text, "utf8");
  }
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:t1" } },
  };
}

interface CapturedGate {
  gate?: WriteGate;
}

function capturingFactory(captured: CapturedGate) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    void caps;
    captured.gate = gate;
    const session: RoleSession = {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return (async function* () {
          yield { kind: "settled" as const, summary: "完成" };
        })();
      },
      async dispose(): Promise<void> {},
    };
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return session;
      },
    };
  };
}

async function openGate(
  project: TrunkProject,
  stablePermitOf: (relPath: string) => StableWritePermit | undefined,
): Promise<{ gate: WriteGate; dispose: () => Promise<void> }> {
  const captured: CapturedGate = {};
  const handle = await openRoleSession(
    {
      roleId: "X",
      project: gateProject(project.root),
      customerInput: () => ({ outcome: "declined" }),
      stablePermitOf,
    },
    { createAdapter: capturingFactory(captured) },
  );
  assert.ok(captured.gate !== undefined, "run-role 应构建 gate");
  return { gate: captured.gate!, dispose: () => handle.dispose() };
}

// ———————————————— 1. stable workflow 全链路 ————————————————

test("stable workflow：确认卡 → 许可安装 → run-role gate 放行/拒绝 → completeWrite → mini re-pin（不升版本、无 drift）", async () => {
  const rig = await setupStack();
  try {
    assert.equal("writeFile" in rig.stack, false, "F16：桌面栈无直接写盘 API");
    assert.equal("write" in rig.stack, false, "F16：桌面栈无直接写盘 API");
    const before = await rig.stack.trunkState();
    assert.equal(before.trunkVersion, 1);
    const oldWorkflowSha = before.stable.workflow?.sha256;
    const content = "# workflow v2 (confirmed)\n";
    const targetSha = sha256(content);

    const requested = await rig.stack.requestWorkflowWrite({
      roleId: "convener",
      content,
      diffPreview: "@@ -1 +1 @@\n-# workflow\n+# workflow v2 (confirmed)",
      at: AT2,
    });
    assert.equal(requested.ok, true, requested.ok ? "" : `${requested.code}: ${requested.message ?? ""}`);
    assert.equal(requested.cardOutcome, "answered");
    // F16：批准只签发许可，桌面栈不写盘 —— 文件仍是旧内容。
    assert.equal(await fs.readFile(path.join(rig.project.root, PATHS.workflow), "utf8"), WORKFLOW_OLD);
    assert.equal(rig.stack.stablePermitOf(PATHS.workflow)?.targetSha256, targetSha);
    assert.equal(rig.stack.stablePermitOf(PATHS.workflow)?.baseSha256, oldWorkflowSha);

    // 许可同步快照（C2b）与判定：缺许可/哈希不符拒绝。
    const { gate, dispose } = await openGate(rig.project, (rel) => rig.stack.stablePermitOf(rel));
    try {
      const noPermitBefore = stableWriteDecision({
        projectRoot: rig.project.root,
        relPath: PATHS.workflow,
        sha256: targetSha,
      });
      assert.equal(noPermitBefore.allowed, false);
      if (!noPermitBefore.allowed) assert.equal(noPermitBefore.code, "stable-write-permit-missing");

      const allowed = gate(PATHS.workflow, { contentSha256: targetSha, operation: "write" });
      assert.equal(allowed.allowed, true, allowed.allowed ? "" : allowed.reason);
      const wrong = gate(PATHS.workflow, { contentSha256: sha256("tampered"), operation: "write" });
      assert.equal(wrong.allowed, false);
      if (!wrong.allowed) assert.equal(wrong.code, "stable-write-hash-mismatch");
      const noContext = gate(PATHS.workflow);
      assert.equal(noContext.allowed, false, "无内容哈希（shell/opaque）⇒ stable 拒绝");
    } finally {
      await dispose();
    }

    // 真实写入（run-role gate 通过后的执行点）+ post-write 复核 + mini re-pin。
    const newSha = await writeProjectFile(rig.project.root, PATHS.workflow, content);
    assert.equal(newSha, targetSha);
    const completed = await rig.stack.completeStableWriteAfterWrite(PATHS.workflow, targetSha);
    assert.equal(completed.ok, true, completed.ok ? "" : `${completed.code}: ${completed.message ?? ""}`);
    assert.equal(completed.skipped, undefined);
    assert.equal(rig.stack.stablePermitOf(PATHS.workflow), undefined, "许可一次性消费");

    const after = await rig.stack.trunkState();
    assert.equal(after.trunkVersion, before.trunkVersion, "mini re-pin 不升 trunkVersion");
    assert.equal(after.stable.workflow?.sha256, targetSha);
    assert.equal(after.stable.workflow?.path, PATHS.workflow);
    assert.equal((after as unknown as Record<string, unknown>).drift, undefined, "P1.6 无 drift 状态");
    // 许可消费后 gate 再写 ⇒ 拒绝（fail-closed）。
    const { gate: gate2, dispose: dispose2 } = await openGate(rig.project, (rel) => rig.stack.stablePermitOf(rel));
    try {
      const consumed = gate2(PATHS.workflow, { contentSha256: targetSha, operation: "write" });
      assert.equal(consumed.allowed, false);
      if (!consumed.allowed) {
        assert.ok(
          consumed.code === "stable-write-permit-missing" || consumed.code === "stable-write-permit-consumed",
          String(consumed.code),
        );
      }
    } finally {
      await dispose2();
    }

    assert.deepEqual(await rig.project.service.verify(), { ok: true, violations: [] });
    const events = await rig.ledger.ledger();
    const stableKinds = events
      .filter((event) => event.kind.startsWith("stable.write."))
      .map((event) => (event as { kind: string }).kind);
    assert.deepEqual(stableKinds, ["stable.write.requested", "stable.write.approved", "stable.write.written"]);
    const approvedEvent = eventsOfKind(events, "stable.write.approved")[0]!;
    assert.equal(approvedEvent.origin, "customer");
    assert.equal(approvedEvent.decidedBy, "customer");
    assert.match(typeof approvedEvent.decisionId === "string" ? approvedEvent.decisionId : "", /^decision-/);
    const repinEvent = eventOf(events, "trunk.state").find((event) => event.op === "stable-repinned")!;
    assert.ok(repinEvent !== undefined, "应写 stable-repinned");
    assert.equal(repinEvent.origin, "customer");
    assert.equal(repinEvent.decidedBy, "customer");
    assert.equal(repinEvent.trunkVersion, before.trunkVersion);
    assert.equal(repinEvent.oldSha, oldWorkflowSha);
    assert.equal(repinEvent.newSha, targetSha);
    assert.ok(!events.some((event) => (event as { op?: string }).op === "drift"));
  } finally {
    rig.channel.channel.rejectAllPending("cleanup");
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// ———————————————— 2. stable 失败/无通道/过期 ————————————————

test("stable 异常：无客户通道不发许可；拒绝不写；哈希不符 failed + 许可作废 + 快照不变；过期许可拒绝", async () => {
  const noChannelRig = await setupStack({ withStableChannel: false });
  try {
    const requested = await noChannelRig.stack.requestWorkflowWrite({
      roleId: "convener",
      content: "# workflow no-channel\n",
      at: AT2,
    });
    assert.equal(requested.ok, false);
    if (!requested.ok) assert.equal(requested.code, "vca-channel-unavailable");
    assert.equal(noChannelRig.stack.stablePermitOf(PATHS.workflow), undefined);
    const records = await noChannelRig.stack.listStableWrites();
    assert.equal(records.find((record) => record.path === PATHS.workflow)?.status, "requested");
    const before = await noChannelRig.stack.trunkState();
    assert.equal(before.stable.workflow?.sha256, sha256("# workflow\n"));
    const events = await noChannelRig.ledger.ledger();
    assert.ok(events.some((event) => event.kind === "stable.write.requested"));
    assert.ok(!events.some((event) => event.kind === "stable.write.approved"));
  } finally {
    noChannelRig.channel.channel.rejectAllPending("cleanup");
    await fs.rm(noChannelRig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  // 拒绝：不写、无许可、无 stable-repinned。
  const rejectRig = await setupStack({ stableChoice: "reject-stable-write" });
  try {
    const rejected = await rejectRig.stack.requestWorkflowWrite({
      roleId: "convener",
      content: "# workflow rejected\n",
      at: AT2,
    });
    // 拒绝路径：运行时正常返回（记录 rejected），但无许可、未写入。
    assert.equal(rejected.ok, true);
    assert.equal(rejected.cardOutcome, "answered");
    assert.equal(rejectRig.stack.stablePermitOf(PATHS.workflow), undefined);
    const records = await rejectRig.stack.listStableWrites();
    assert.equal(records.find((record) => record.path === PATHS.workflow)?.status, "rejected");
    assert.equal(await fs.readFile(path.join(rejectRig.project.root, PATHS.workflow), "utf8"), WORKFLOW_OLD);
    const events = await rejectRig.ledger.ledger();
    assert.ok(events.some((event) => event.kind === "stable.write.rejected"));
    assert.ok(
      !events.some((event) => event.kind === "trunk.state" && event.op === "stable-repinned"),
      "拒绝不触发 mini re-pin",
    );
  } finally {
    rejectRig.channel.channel.rejectAllPending("cleanup");
    await fs.rm(rejectRig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  // 哈希不符：failed + 许可作废 + 快照不变；过期许可被门禁拒绝。
  const rig = await setupStack();
  try {
    const content = "# workflow tampered target\n";
    const requested = await rig.stack.requestWorkflowWrite({ roleId: "convener", content });
    assert.equal(requested.ok, true);
    const before = await rig.stack.trunkState();
    const failed = await rig.stack.completeStableWriteAfterWrite(PATHS.workflow, sha256("tampered"));
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.equal(failed.code, "stable-write-hash-mismatch");
    const after = await rig.stack.trunkState();
    assert.equal(after.stable.workflow?.sha256, before.stable.workflow?.sha256, "失败不更新快照");
    assert.equal(rig.stack.stablePermitOf(PATHS.workflow), undefined, "失败许可作废");
    const events = await rig.ledger.ledger();
    assert.ok(events.some((event) => event.kind === "stable.write.failed"));
    assert.ok(!events.some((event) => event.kind === "trunk.state" && event.op === "stable-repinned"));

    // 过期许可：安装到 C2b 快照后判定拒绝（TTL 30 分钟，不自动补发）。
    const now = Date.now();
    const expired: StableWritePermit = {
      v: 1,
      schema: "stable-write/v1",
      permitId: "sw-expired-1",
      requestId: "sw-expired",
      roleId: "convener",
      path: PATHS.workflow,
      kind: "workflow",
      authority: { decisionId: "dec-expired" },
      baseSha256: before.stable.workflow?.sha256 ?? "",
      targetSha256: sha256("# expired target\n"),
      status: "approved",
      approvedAt: new Date(now - 31 * 60_000).toISOString(),
      expiresAt: new Date(now - 60_000).toISOString(),
      issuedAt: new Date(now - 31 * 60_000).toISOString(),
    };
    installStableWritePermitSnapshot(rig.project.root, [expired]);
    const expiredDecision = stableWriteDecision({
      projectRoot: rig.project.root,
      relPath: PATHS.workflow,
      sha256: expired.targetSha256,
      permit: expired,
    });
    assert.equal(expiredDecision.allowed, false);
    if (!expiredDecision.allowed) assert.equal(expiredDecision.code, "stable-write-permit-expired");
    // 恢复栈的真实许可快照（清掉测试安装的过期许可），避免影响其它断言。
    installStableWritePermitSnapshot(rig.project.root, []);
  } finally {
    rig.channel.channel.rejectAllPending("cleanup");
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// ———————————————— 3. appointment-write（role-card） ————————————————

test("appointment-write：role-card 钩子 → 许可 → gate → mini re-pin roleCards（F15 三类快照、不升版本）", async () => {
  const rig = await setupStack();
  try {
    const before = await rig.stack.trunkState();
    const oldRoleCardSha = before.stable.roleCards["impl"]?.sha256;
    const content = "# role card impl v2 (appointment-write)\n";
    const targetSha = sha256(content);
    const approved = await rig.stack.onAppointmentWriteApproved({
      roleId: "impl",
      kind: "role-card",
      content,
      confirmationId: "conf-appt-1",
      diffPreview: "- old\n+ new",
      at: AT2,
    });
    assert.equal(approved.ok, true, approved.ok ? "" : `${approved.code}: ${approved.message ?? ""}`);
    assert.equal(rig.stack.stablePermitOf(PATHS.roleCard)?.authority.confirmationId, "conf-appt-1");

    const { gate, dispose } = await openGate(rig.project, (rel) => rig.stack.stablePermitOf(rel));
    try {
      const allowed = gate(PATHS.roleCard, { contentSha256: targetSha, operation: "write" });
      assert.equal(allowed.allowed, true, allowed.allowed ? "" : allowed.reason);
    } finally {
      await dispose();
    }
    await writeProjectFile(rig.project.root, PATHS.roleCard, content);
    const completed = await rig.stack.completeStableWriteAfterWrite(PATHS.roleCard, targetSha);
    assert.equal(completed.ok, true);

    const after = await rig.stack.trunkState();
    assert.equal(after.trunkVersion, before.trunkVersion);
    assert.equal(after.stable.roleCards["impl"]?.sha256, targetSha);
    assert.equal(after.stable.roleCards["impl"]?.path, PATHS.roleCard);
    // F15：workflow / roleCards / boundaries 三类同时存在于载荷。
    assert.equal(after.stable.workflow?.kind, "workflow");
    assert.equal(after.stable.roleCards["impl"]?.kind, "role-card");
    assert.equal(after.stable.boundaries["impl"]?.kind, "boundary");
    assert.equal(oldRoleCardSha === targetSha, false);

    assert.deepEqual(await rig.project.service.verify(), { ok: true, violations: [] });
    const events = await rig.ledger.ledger();
    const approvedEvent = eventsOfKind(events, "stable.write.approved")[0]!;
    assert.equal(approvedEvent.confirmationId, "conf-appt-1");
    assert.equal(approvedEvent.origin, "customer");
    const repinEvent = eventOf(events, "trunk.state").find((event) => event.op === "stable-repinned")!;
    assert.equal(repinEvent.path, PATHS.roleCard);
    assert.equal(repinEvent.confirmationId, "conf-appt-1");
    assert.equal(repinEvent.decidedBy, "customer");
  } finally {
    rig.channel.channel.rejectAllPending("cleanup");
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// ———————————————— 4. apply-journal / 对账 ————————————————

function snapshotOfManifest(manifest: TrunkManifest): TrunkApplySnapshot {
  assert.ok(manifest.artifacts.workflow, "This execution fixture has a real workflow; planning-only manifests are not executable");
  const documents: TrunkApplySnapshot["documents"] = {};
  for (const kind of Object.keys(manifest.artifacts.documents)) {
    const ref = manifest.artifacts.documents[kind as keyof typeof manifest.artifacts.documents];
    if (ref !== undefined) documents[kind as keyof TrunkApplySnapshot["documents"]] = { path: ref.path, sha256: ref.sha256 };
  }
  const roleCards: Record<string, { path: string; sha256: string }> = {};
  for (const [roleId, ref] of Object.entries(manifest.artifacts.roleCards ?? {})) {
    roleCards[roleId] = { path: ref.path, sha256: ref.sha256 };
  }
  const boundaries: Record<string, { path: string; sha256: string }> = {};
  for (const [roleId, ref] of Object.entries(manifest.artifacts.boundaries)) {
    boundaries[roleId] = { path: ref.path, sha256: ref.sha256 };
  }
  return {
    trunkVersion: manifest.trunkVersion,
    runId: manifest.runId,
    documents,
    execution: {
      teamPlan:
        manifest.artifacts.execution.teamPlan === null
          ? null
          : { path: manifest.artifacts.execution.teamPlan.path, sha256: manifest.artifacts.execution.teamPlan.sha256 },
      flow:
        manifest.artifacts.execution.flow === null
          ? null
          : {
              path: manifest.artifacts.execution.flow.path,
              sha256: manifest.artifacts.execution.flow.sha256,
              version: manifest.artifacts.execution.flow.version,
            },
    },
    workflow: { path: manifest.artifacts.workflow.path, sha256: manifest.artifacts.workflow.sha256 },
    roleCards,
    boundaries,
  };
}

test("trunk apply-journal：提交点/幂等重放/base 不一致/内容哈希不符不改指针；derive/verify/history 一致", async () => {
  const project = await createTrunkProject();
  const ledger = ledgerRig(project.root);
  try {
    const derived = await project.service.derive();
    assert.equal(derived.ok, true, derived.ok ? "" : `${derived.code}: ${derived.message ?? ""}`);
    if (derived.ok) {
      assert.equal(derived.value.manifest.trunkVersion, 1);
      assert.equal(derived.value.manifest.source, "adopted");
    }
    const { integration, trunkRuntime } = await bootstrapThrough(project, ledger.emit);
    ledger.events.length = 0;
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(project.root, v2, "version: 2\n# proposal v2\n");
    const frozen = await integration.services.freeze.freezeMany([
      {
        path: v2,
        version: 2,
        sha256: v2sha,
        applicationId: "vc-up",
        reason: "version-upgrade-approved",
        decisionId: "dec-up",
        at: AT2,
      },
    ]);
    assert.equal(frozen.ok, true);

    const status = await integration.trunk.status();
    const target = snapshotOfManifest(status.manifest!);
    target.documents = { ...target.documents, proposal: { path: v2, sha256: v2sha } };
    const applied = await trunkRuntime.applyApproved({
      source: "upgrade",
      flowId: FLOW_ID,
      applicationId: "vc-up",
      decisionId: "dec-up",
      runId: project.runId,
      baseTrunkVersion: 1,
      target,
      repin: { runId: project.runId, targets: [{ kind: "proposal", path: v2, sha256: v2sha }] },
      journalId: "j-up",
      at: AT2,
    });
    assert.equal(applied.ok, true, applied.ok ? "" : `${applied.code}: ${applied.message ?? ""}`);
    if (!applied.ok) return;
    assert.equal(applied.value.manifest.trunkVersion, 2);
    assert.equal(applied.value.manifest.artifacts.documents.proposal?.path, v2);
    assert.equal(applied.value.manifest.artifacts.documents.proposal?.sha256, v2sha);
    const journalRead = await project.store.readJournal();
    assert.equal(journalRead.ok, true);
    if (journalRead.ok) {
      assert.equal(journalRead.value.journalId, "j-up");
      assert.equal(journalRead.value.phase, "committed");
      assert.equal(journalRead.value.result, "committed");
    }
    const historyAfter = await integration.trunk.history();
    assert.equal(historyAfter.ok, true);
    if (historyAfter.ok) {
      assert.deepEqual(historyAfter.value.versions, [1], "上一个版本归档到 history");
      assert.equal(historyAfter.value.currentTrunkVersion, 2);
    }
    assert.deepEqual(await integration.trunk.verify(), { ok: true, violations: [] });

    // 幂等重放：同内容 ⇒ alreadyApplied，不升版本。
    const replay = await trunkRuntime.applyApproved({
      source: "upgrade",
      flowId: FLOW_ID,
      applicationId: "vc-up",
      decisionId: "dec-up",
      runId: project.runId,
      baseTrunkVersion: 2,
      target,
      repin: { runId: project.runId, targets: [{ kind: "proposal", path: v2, sha256: v2sha }] },
      journalId: "j-up",
      at: AT2,
    });
    assert.equal(replay.ok, true, JSON.stringify(replay));
    if (replay.ok) {
      assert.equal(replay.value.alreadyApplied, true, JSON.stringify(replay.value.manifest.artifacts.documents));
      assert.equal(replay.value.manifest.trunkVersion, 2);
    }

    // base 不一致：陈旧 base 版本 ⇒ trunk-version-invalid，指针不变。
    const stale = await trunkRuntime.applyApproved({
      source: "upgrade",
      flowId: FLOW_ID,
      applicationId: "vc-stale",
      decisionId: "dec-stale",
      runId: project.runId,
      baseTrunkVersion: 1,
      target,
      journalId: "j-stale",
      at: AT2,
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.code, "trunk-version-invalid");
    assert.equal((await integration.trunk.current())?.trunkVersion, 2);

    // 内容哈希不符：service 以磁盘字节复核 ⇒ trunk-apply-failed，指针不变。
    const badTarget = snapshotOfManifest((await integration.trunk.status()).manifest!);
    badTarget.documents = { ...badTarget.documents, proposal: { path: v2, sha256: "0".repeat(64) } };
    const tampered = await trunkRuntime.applyApproved({
      source: "upgrade",
      flowId: FLOW_ID,
      applicationId: "vc-bad",
      decisionId: "dec-bad",
      runId: project.runId,
      baseTrunkVersion: 2,
      target: badTarget,
      journalId: "j-bad",
      at: AT2,
    });
    assert.equal(tampered.ok, false);
    if (!tampered.ok) assert.equal(tampered.code, "trunk-apply-failed");
    assert.equal((await integration.trunk.current())?.trunkVersion, 2);

    const events = await ledger.ledger();
    const switched = eventOf(events, "trunk.state").filter((event) => event.op === "switched");
    assert.ok(switched.length >= 1);
    assert.ok(switched.every((event) => event.decidedBy === "customer" && event.decisionId !== undefined));
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("trunk 对账：phase 滞后可识别分裂态（内容已过提交点），且补写事件必须通过 C2a 账本校验", async () => {
  const project = await createTrunkProject();
  const ledger = ledgerRig(project.root);
  try {
    const { trunkRuntime } = await bootstrapThrough(project, ledger.emit);
    const journal = await project.store.readJournal();
    assert.equal(journal.ok, true);
    if (!journal.ok) return;
    await project.store.writeJournal({ ...journal.value, phase: "prepared" as const, result: undefined });
    ledger.events.length = 0;
    const reconciled = await trunkRuntime.reconcile();
    assert.equal(reconciled.ok, true);
    if (!reconciled.ok) return;
    assert.equal(reconciled.value.state, "committed");
    assert.equal(reconciled.value.recordedPhase, "prepared");
    assert.equal(reconciled.value.contentPhase, "committed");
    assert.equal(reconciled.value.split, true);
    // AC-12/AC-31：补写事件也是账本事件，必须通过 C2a 逐 kind 归属校验（readTaskState 不得报错）。
    await ledger.ledger();

    // 反向：journal phase 领先于磁盘内容 ⇒ split，如实报告，不自动修指针。
    const journalAgain = await project.store.readJournal();
    assert.equal(journalAgain.ok, true);
    if (!journalAgain.ok) return;
    const target = journalAgain.value.target;
    const documents = Object.fromEntries(
      Object.entries(target.documents).map(([kind, ref]) => [
        kind,
        { path: ref.path, sha256: kind === "proposal" ? "1".repeat(64) : ref.sha256 },
      ]),
    );
    await project.store.writeJournal({
      ...journalAgain.value,
      phase: "run-manifest-written" as const,
      result: undefined,
      target: { ...target, documents },
    });
    const eventsBefore = ledger.events.length;
    const reverse = await trunkRuntime.reconcile();
    assert.equal(reverse.ok, true);
    if (!reverse.ok) return;
    assert.equal(reverse.value.split, true);
    assert.equal(reverse.value.contentPhase, "prepared");
    assert.equal(reverse.value.recordedPhase, "run-manifest-written");
    assert.equal(ledger.events.length, eventsBefore, "反向分裂态不补写事件/不改指针");
    assert.equal((await project.service.status()).manifest?.trunkVersion, 1);
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// ———————————————— 5. refreeze / abandon / history ————————————————

test("trunk 客户动作：refreeze 只续接 stable 快照（不升版本、客户归属）；abandon 不改指针；history 归档", async () => {
  const project = await createTrunkProject();
  const ledger = ledgerRig(project.root);
  try {
    const derived = await project.service.derive();
    assert.equal(derived.ok, true, derived.ok ? "" : `${derived.code}: ${derived.message ?? ""}`);
    if (derived.ok) {
      assert.equal(derived.value.manifest.trunkVersion, 1);
      assert.equal(derived.value.manifest.source, "adopted");
    }
    const { integration, trunkRuntime } = await bootstrapThrough(project, ledger.emit);
    // 先完成一次 upgrade（t2），让 history 有归档。
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(project.root, v2, "version: 2\n# proposal v2\n");
    const frozen = await integration.services.freeze.freezeMany([
      {
        path: v2,
        version: 2,
        sha256: v2sha,
        applicationId: "vc-up",
        reason: "version-upgrade-approved",
        decisionId: "dec-up",
        at: AT2,
      },
    ]);
    assert.equal(frozen.ok, true);
    const target = snapshotOfManifest((await integration.trunk.status()).manifest!);
    target.documents = { ...target.documents, proposal: { path: v2, sha256: v2sha } };
    assert.equal(
      (
        await trunkRuntime.applyApproved({
          source: "upgrade",
          flowId: FLOW_ID,
          applicationId: "vc-up",
          decisionId: "dec-up",
          runId: project.runId,
          baseTrunkVersion: 1,
          target,
          repin: { runId: project.runId, targets: [{ kind: "proposal", path: v2, sha256: v2sha }] },
          journalId: "j-up",
          at: AT2,
        })
      ).ok,
      true,
    );
    ledger.events.length = 0;

    // 栈（D1 组合）在同一项目上初始化并在内存中加载最新 manifest。
    const stack = createVersionChangeStack({
      projectRoot: project.root,
      now: () => new Date(AT),
      emitEvent: ledger.emit,
      migrationCompleted: () => true,
      notify: () => {},
    });
    const initialized = await stack.ensureInitialized();
    assert.equal(initialized.ok, true);

    const workflowContent = "# workflow refrozen\n";
    const workflowSha = await writeProjectFile(project.root, PATHS.workflow, workflowContent);
    const refrozen = await stack.refreeze({ reason: "stable 快照续接（测试）", acknowledged: true });
    assert.equal(refrozen.ok, true, refrozen.ok ? "" : `${refrozen.code}: ${refrozen.error ?? ""}`);
    assert.equal(refrozen.trunkVersion, 2, "refreeze 不升 trunkVersion");
    assert.deepEqual(refrozen.changed, ["workflow"]);
    const statusAfterRefreeze = await stack.trunkState();
    assert.equal(statusAfterRefreeze.stable.workflow?.sha256, workflowSha);
    assert.equal(statusAfterRefreeze.trunkVersion, 2);

    const noAck = await stack.refreeze({ reason: "缺高危确认", acknowledged: false });
    assert.equal(noAck.ok, false);
    if (!noAck.ok) assert.equal(noAck.code, "trunk-high-risk-unacknowledged");

    const abandoned = await stack.abandonUpgrade({ reason: "取消升级窗口（测试）", acknowledged: true });
    assert.equal(abandoned.ok, true);
    assert.equal(abandoned.trunkVersion, 2, "放弃升级不改指针");

    const history = await stack.history();
    assert.equal(history.ok, true);
    assert.deepEqual(history.versions, [1]);
    assert.equal(history.currentTrunkVersion, 2);

    // trunk 升级确认 = 客户本人显式高危确认（IPC preview → confirm）；未勾选 acknowledged ⇒ 拒绝。
    const preview = await stack.requestTrunkUpgrade({ reason: "emergency", scope: ["workflow"] });
    assert.equal(preview.ok, true, preview.ok ? "" : `${preview.code}: ${preview.error ?? ""}`);
    assert.ok(preview.previewId !== undefined);
    const unacknowledged = await stack.confirmTrunkUpgrade({ previewId: preview.previewId!, acknowledged: false });
    assert.equal(unacknowledged.ok, false);
    if (!unacknowledged.ok) assert.equal(unacknowledged.code, "trunk-high-risk-unacknowledged");

    const events = await ledger.ledger();
    const refrozenEvent = eventOf(events, "trunk.state").find((event) => event.op === "refrozen")!;
    assert.equal(refrozenEvent.decidedBy, "customer");
    assert.equal(refrozenEvent.origin, "customer");
    const cancelledEvent = eventOf(events, "trunk.state").find((event) => event.op === "refrozen-cancelled")!;
    assert.equal(cancelledEvent.decidedBy, "customer");
    assert.deepEqual(await project.service.verify(), { ok: true, violations: [] });
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// ———————————————— 6. 恢复 ————————————————

test("trunk 恢复：manifest 损坏 ⇒ 客户确认后 tN+1（recovered）；冻结注册表 corrupt ⇒ 恢复拒绝", async () => {
  const project = await createTrunkProject();
  const ledger = ledgerRig(project.root);
  try {
    const { integration } = await bootstrapThrough(project, ledger.emit);
    await fs.writeFile(path.join(project.root, ".ans/trunk/manifest.json"), "{broken", "utf8");
    ledger.events.length = 0;
    const stack = createVersionChangeStack({
      projectRoot: project.root,
      now: () => new Date(AT),
      emitEvent: ledger.emit,
      migrationCompleted: () => true,
      notify: () => {},
    });
    const recovered = await stack.recoverTrunk({ reason: "manifest-corrupt", acknowledged: true });
    assert.equal(recovered.ok, true, recovered.ok ? "" : `${recovered.code}: ${recovered.error ?? ""}`);
    assert.equal(recovered.status, "recovered");
    assert.equal(recovered.trunkVersion, 2);
    const status = await integration.trunk.status();
    assert.equal(status.manifest?.source, "recovery");
    assert.equal(status.manifest?.trunkVersion, 2);
    const events = await ledger.ledger();
    const recoveredEvent = eventOf(events, "trunk.state").find((event) => event.op === "recovered")!;
    assert.equal(recoveredEvent.decidedBy, "customer");
    assert.equal(recoveredEvent.origin, "customer");
    assert.match(recoveredEvent.reason ?? "", /manifest-corrupt/);
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  // 冻结注册表 corrupt ⇒ fail-closed，恢复拒绝（不自动重建）。
  const corrupt = await createTrunkProject();
  try {
    await fs.writeFile(path.join(corrupt.root, ".ans/state/versions.jsonl"), "not-json\n", "utf8");
    await fs.writeFile(path.join(corrupt.root, ".ans/state/versions.initialized"), "{}\n", "utf8");
    const stack = createVersionChangeStack({
      projectRoot: corrupt.root,
      now: () => new Date(AT),
      migrationCompleted: () => true,
      notify: () => {},
    });
    const refused = await stack.recoverTrunk({ reason: "manifest-corrupt", acknowledged: true });
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.code, "trunk-recovery-invalid");
  } finally {
    await fs.rm(corrupt.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// ———————————————— 7. 栈初始化健康（迁移/fail-closed） ————————————————

test("栈初始化：missing 基线 ⇒ 迁移后 ready；corrupt 基线 ⇒ corrupt-failclosed 且入口禁用", async () => {
  const project = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    const stack = createVersionChangeStack({
      projectRoot: project.root,
      now: () => new Date(AT),
      notify: () => {},
    });
    const initial = await stack.ensureInitialized();
    assert.equal(initial.ok, true);
    assert.equal(initial.cacheHealth, "ok");
    const state = await stack.trunkState();
    assert.equal(state.freezes.cacheHealth, "ok");
    assert.equal(state.disables.versionChange, null);
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  const corrupt = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    await fs.mkdir(path.join(corrupt.root, ".ans/state"), { recursive: true });
    await fs.writeFile(path.join(corrupt.root, ".ans/state/versions.jsonl"), "not-json\n", "utf8");
    await fs.writeFile(path.join(corrupt.root, ".ans/state/versions.initialized"), "{}\n", "utf8");
    const stack = createVersionChangeStack({
      projectRoot: corrupt.root,
      now: () => new Date(AT),
      notify: () => {},
    });
    const initial = await stack.ensureInitialized();
    assert.equal(initial.ok, false);
    assert.equal(initial.cacheHealth, "corrupt-failclosed");
    const state = await stack.trunkState();
    assert.equal(state.freezes.cacheHealth, "corrupt-failclosed");
    assert.notEqual(state.disables.versionChange, null, "冻结缓存损坏 ⇒ 版本变更入口 fail-closed");
    assert.notEqual(state.disables.stableWrite, null);
  } finally {
    await fs.rm(corrupt.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
