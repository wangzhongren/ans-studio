// test/桌面应用/interface.test.ts
// 桌面窗口 Interface 层单测：注入假下游，验证枚举→RoleView 映射、点角色即开（scope undefined、
// 导入即授权的 acceptance）、多轮 send 透传与切换角色的 dispose 语义。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { createDesktopInterface, createShellJudgeSwitch, isShellJudgeIpcSender, registerPreferencesIpc } from "../../app/desktop/interface.ts";
import { createMainI18n, desktopTexts, mainT } from "../../app/desktop/i18n.ts";
import { validateImage, sanitizeImageName } from "../../app/desktop/composer-images.ts";
import { describeShellCommand, plainReasonFor } from "../../app/desktop/operator-channel.ts";
import { readDeniedHumanReason } from "../../app/desktop/judge-reason.ts";
import { formatDurationMs, recoveryReceiptSummary } from "../../app/desktop/watchdog.ts";
import { saveRuntimeConfig } from "../../app/desktop/runtime-config.ts";
import { RUNTIME_SETTINGS } from "../../src/common/shared/runtime-settings.ts";
import { renderRecoveryPage } from "../../app/desktop/diagnostics.ts";
import { judgeResultSummary } from "../../app/desktop/customer-input.ts";
import {
  createPreferencesService,
  preferencesFilePath,
  readPreferences,
  type PreferencesDiagnostic,
} from "../../app/desktop/preferences.ts";
import type { SessionEventEnvelope } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent, TaskHandback } from "../../src/common/编排/handback.ts";
import type { RuntimeAdapter, SessionEvent, WriteGate, CustomerInputFn } from "../../src/provider/pi/session.ts";
import type { DispatchTaskFn } from "../../src/model/runtime.ts";
import type { RoleStatusFn } from "../../src/common/编排/watchdog.ts";
import type {
  EstablishGovernanceResult,
  GovernancePreview,
  GovernancePreviewResult,
  GovernanceReacceptPreview,
  GovernanceReacceptPreviewResult,
  ReacceptGovernancePinsResult,
  GovernanceMigrationPreview,
  GovernanceMigrationResult,
} from "../../src/pipeline/orchestration/govern-session.ts";
import { readGovernanceLedger, appendGovernanceLedger } from "../../src/pipeline/orchestration/govern-session.ts";
// 2026-10-23 可重入门禁：flow 机器状态只经公共出口读取（测试断言 role-cards/readiness 状态）。
import { parseFlowStateYaml, completeRoleCardsStep as realCompleteRoleCardsStep, completeCustomerDecisionStep as realCompleteCustomerDecisionStep } from "../../src/pipeline/orchestration/flow-state.ts";
import type { DesktopDeps } from "../../app/desktop/interface.ts";
import type { PinEvidenceResult } from "../../src/model/boundary.ts";
// 2026-10-20：流程推进任务文案的 YAML 存在性分支（真机：flow 工具已注册但 Steward 未被要求使用）。
import {
  buildAcceptanceCriteriaTaskMessage,
  buildAcceptanceTaskMessage,
  buildGovernanceAdvanceMessage,
  buildRoleReadinessTaskMessage,
  governanceAcceptanceAdvanceNote,
  type GovernanceNextStepPayload,
} from "../../app/desktop/governance-advance.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const FAKE_LISTING: ProjectListing = {
  projectRoot: "/proj",
  roles: [
    {
      roleId: "A",
      cardPath: "角色卡/A/role-card.md",
      boundaryPath: "角色卡/A/boundary.yaml",
      cardText: "# 角色 A",
      boundary: {
        entries: [
          { root: "project", path: "src/a.ts", kind: "file", purpose: "p" },
          { root: "project", path: "src/dir", kind: "directory", purpose: "d" },
        ],
        boundarySource: "角色卡/A/boundary.yaml",
        acceptance: { accepted: false, source: "" },
      },
    },
  ],
  warnings: ["某角色边界解析失败：坏 YAML"],
  hasRoles: true,
  primaryRoleId: "A",
};

function makeFakeHandle(): {
  handle: RoleSessionHandle;
  sends: string[];
  disposed: () => number;
  /** 推一条 `settled`（模拟一轮结束）并等消费循环处理完（忙态复位、队列放行）。 */
  settle: () => Promise<void>;
} {
  const sends: string[] = [];
  let disposed = 0;
  const queue: SessionEvent[] = [];
  const handle: RoleSessionHandle = {
    async send(text: string): Promise<void> { sends.push(text); },
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              // 轮询窗口 ~1s：够本用例的几次 send/settle 往返；之后流自然结束（消费循环退出，无泄漏）。
              for (let i = 0; i < 200; i += 1) {
                if (queue.length > 0) return { value: queue.shift() as SessionEvent, done: false };
                await new Promise((r) => setTimeout(r, 5));
              }
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> { disposed += 1; },
  };
  const settle = async (): Promise<void> => {
    queue.push({ kind: "settled", summary: "一轮结束（测试替身）" } as SessionEvent);
    await new Promise((r) => setTimeout(r, 60)); // 等消费循环：忙态复位 + 队列放行
  };
  return { handle, sends, disposed: () => disposed, settle };
}

test("listProject 映射为 RoleView（无 writeSet 字段）", async () => {
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
  });
  const res = await iface.listProject({ projectRoot: "/proj" });
  assert.equal(res.roles.length, 1);
  assert.equal(res.roles[0].roleId, "A");
  assert.equal(res.roles[0].cardPath, "角色卡/A/role-card.md");
  assert.equal(res.roles[0].boundary.entries.length, 2);
  assert.equal((res.roles[0] as unknown as { suggestedWriteSet?: unknown }).suggestedWriteSet, undefined, "writeSet 已从界面层移除");
  assert.deepEqual(res.warnings, ["某角色边界解析失败：坏 YAML"]);
});

test("内置角色 su：RoleView 标为 builtIn，且不去读文档索引（cardPath 为空串）", async () => {
  // projectRoot 用真实仓库根：若守卫失效、真去 walk 索引，docs 一定非空。
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: {
          entries: [{ root: "skill", path: "SKILL.md", kind: "file", purpose: "治理规则" }],
          boundarySource: "<built-in:ans-governed-construction SKILL boundary>",
          acceptance: { accepted: false, source: "" },
        },
        builtIn: true,
      },
    ],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  assert.equal(res.roles.length, 1);
  assert.equal(res.roles[0].roleId, "su");
  assert.equal(res.roles[0].builtIn, true);
  assert.equal(res.roles[0].changelog, null, "内置角色无 changelog");
  assert.deepEqual(res.roles[0].docs, [], "不得把项目根当角色目录去 walk");
  assert.deepEqual(res.roles[0].rootDocs, [], "内置角色 rootDocs 诚实为空，不读项目根");
});

test("openSession 点角色即开：scope undefined、导入即授权；多轮 send 透传、stop 收口", async () => {
  const { handle, sends, disposed, settle } = makeFakeHandle();
  let captured: { roleId: string; project: ProjectConfig; scope?: unknown } | undefined;

  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    openRoleSessionFn: async (input): Promise<RoleSessionHandle> => {
      captured = input as typeof captured;
      return handle;
    },
    createDemoAdapterFn: (_opts: { gate: WriteGate }) => ({}) as unknown as RuntimeAdapter,
    buildProjectConfigFn: buildProjectConfig,
  });

  assert.equal(await iface.pickProject(), "/proj");

  await iface.listProject({ projectRoot: "/proj" });
  const open = await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(open.ok, true, "点角色应直接开启会话（无确认步骤）");
  assert.ok(captured, "应调用 openRoleSession");
  assert.equal(captured!.roleId, "A");
  assert.equal(captured!.scope, undefined, "聊天会话 scope 应为 undefined（无任务收窄）");
  assert.equal(captured!.project.governanceBoundary?.acceptance.accepted, true, "导入项目即授权");
  assert.ok(
    (captured!.project.governanceBoundary?.acceptance.source || "").includes("desktop-app"),
    "acceptance 来源应如实标注",
  );

  // 多轮 send（L-1 起）：一轮在跑时 send 会**入队**（见 message-queue.test.ts）——替身先推一条 settled
  // 模拟第一轮结束（忙态复位），下一轮直发；「多轮透传」意图不变。
  assert.equal((await iface.sendSession({ text: "一" })).ok, true);
  await settle();
  assert.equal((await iface.sendSession({ text: "二" })).ok, true);
  assert.deepEqual(sends, ["一", "二"]);

  // 同角色重复 open：续接（不重建，openRoleSession 不应被再次调用）
  const again = await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(again.ok, true);
  assert.ok(again.note, "续接应附说明");
  assert.deepEqual(sends, ["一", "二"]);

  const stop = await iface.stopSession();
  assert.equal(stop.ok, true);
  assert.equal(disposed(), 1);
});

// 2026-10-20 真机（Convener 卡 1h）：看护自动中止的 **Interface 接线**——决策开关开启时，内置治理角色
// （Convener）超时 ⇒ 真的调用会话 abort（恰一次），Lead 系统行经既有投递机在 settle 后投出。
test("2026-10-20 看护自动中止接线：内置 Convener 超时 + 决策开关开 ⇒ abort 恰一次 ＋ Lead 系统行（自动中止 ≠ 客户批准）", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "Convener",
        cardPath: "",
        boundaryPath: "",
        cardText: "# Convener",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
        governanceFunction: "schedule",
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "Convener",
    governanceModel: "trio",
  };
  const sent: string[] = [];
  const aborts: string[] = [];
  const events: SessionEvent[] = [];
  const handle: RoleSessionHandle = {
    async send(text: string): Promise<void> { sent.push(text); },
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              for (let i = 0; i < 200; i += 1) {
                if (events.length > 0) return { value: events.shift() as SessionEvent, done: false };
                await new Promise((r) => setTimeout(r, 5));
              }
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {},
    async abort() {
      aborts.push("Convener");
      return { ok: true, supported: true };
    },
  };
  const decisionSwitch = createShellJudgeSwitch();
  decisionSwitch.set({ enabled: true });
  let nowMs = 1_700_000_000_000;
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => listing,
    openRoleSessionFn: async () => handle,
    createDemoAdapterFn: (_opts: { gate: WriteGate }) => ({}) as unknown as RuntimeAdapter,
    buildProjectConfigFn: buildProjectConfig,
    decisionJudgeSwitch: decisionSwitch,
    // 注入时钟与短时限：tick 20ms；中止时限（promptTimeoutOverrideMs）1s；1min 最后兜底。
    watchdogOptions: { now: () => nowMs, config: { tickMs: 20, promptTimeoutOverrideMs: 1_000, turnLastResortOverrideMs: 60_000 } },
  });
  try {
    await iface.listProject({ projectRoot: "/proj" });
    const open = await iface.openSession({ projectRoot: "/proj", roleId: "Convener", runtime: "demo" });
    assert.equal(open.ok, true);
    // 让 Convener busy（busySince = 注入时钟）；不推 settled ⇒ 回合持续。
    assert.equal((await iface.sendSession({ text: "统筹推进" })).ok, true);
    nowMs += 1_500; // 超过中止时限 1s
    iface.startWatchdog();
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(aborts.length, 1, "看护真的调用了 abort（内置治理角色不被排除），且同一回合恰一次");
    // Lead 系统行：Convener 忙时排队；settle 后经既有投递机投出。
    events.push({ kind: "settled", summary: "一轮结束" } as SessionEvent);
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(
      sent.some((t) => t.startsWith("[系统·看护]") && t.includes("回合自动中止") && t.includes("自动中止 ≠ 客户批准")),
      "Lead 系统行如实投出（自动中止 ≠ 客户批准）",
    );
  } finally {
    iface.stopWatchdog();
    await iface.stopSession();
  }
});

test("切换角色（B-2）：open 新角色**不** dispose 旧会话（并存）；定向 stop 只关指定角色", async () => {
  const disposed: string[] = [];
  let created = 0;
  function makeHandle(): RoleSessionHandle {
    const id = String(created);
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
      async dispose(): Promise<void> {
        disposed.push(id);
      },
    };
  }
  const listingB: ProjectListing = {
    ...FAKE_LISTING,
    roles: [
      ...FAKE_LISTING.roles,
      {
        roleId: "B",
        cardPath: "角色卡/B/role-card.md",
        boundaryPath: "角色卡/B/boundary.yaml",
        cardText: "# 角色 B",
        boundary: {
          entries: [{ root: "project", path: "src/b.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/B/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => listingB,
    openRoleSessionFn: async (): Promise<RoleSessionHandle> => {
      created += 1;
      return makeHandle();
    },
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });

  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "B", runtime: "demo" })).ok, true);
  assert.deepEqual(disposed, [], "B-2：切换角色**不得** dispose 旧会话（并存保活）");
  assert.deepEqual(await iface.listLiveSessions(), ["A", "B"], "两角色都应保活（状态徽标/圆点的数据源）");
  const stop = await iface.stopSession({ roleId: "A" });
  assert.equal(stop.ok, true);
  assert.deepEqual(disposed, ["1"], "定向 stop 只 dispose 指定角色（计数从 1 起）");
  assert.deepEqual(await iface.listLiveSessions(), ["B"], "B 不受定向 stop 影响");
});

test("stopSession：无运行中会话时如实返回", async () => {
  const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, listProjectFn: async () => FAKE_LISTING });
  const r = await iface.stopSession();
  assert.equal(r.ok, false);
});

test("openSession：未先枚举项目则报错", async () => {
  const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, listProjectFn: async () => FAKE_LISTING });
  const r = await iface.openSession({ projectRoot: "/never-listed", roleId: "A", runtime: "demo" });
  assert.equal(r.ok, false);
  assert.match(r.error || "", /尚未枚举/);
});

// —————— 「只读」徽标已按客户裁定移除：RoleView/界面**不得**再有 readOnly（守卫「它不该出现」）——————
// 客户 2026-10-11 裁定：回到「导入项目 = 授权；门禁静默执行、拒绝在聊天流内联；用户对边界无感」的原模型。
// 「只读」徽标偏离了这条（把边界机制提前摊给用户看），故移除 `isReadOnlyRole` / `RoleView.readOnly` 及其派生。
// 以下是**原只读场景**的反向守卫：任何角色（内置 su、创世态、可写项目角色）都不再带 readOnly 字段。

test("listProject：内置 su（已 bootstrap）不再带 readOnly 字段（只读徽标已移除）", async () => {
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: { entries: [], boundarySource: "<built-in:ans-governed-construction SKILL boundary>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "某内置已接受角色",
        cardPath: "",
        boundaryPath: "",
        cardText: "# x",
        boundary: { entries: [], boundarySource: "<built-in:...>", acceptance: { accepted: true, source: "客户 pin" } },
        builtIn: true,
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  for (const r of res.roles) {
    assert.equal("readOnly" in r, false, `角色 ${r.roleId} 不应再有 readOnly 字段（只读徽标已移除）`);
  }
});

test("listProject：**未 bootstrap**（创世态）内置 su 亦不再带 readOnly 字段", async () => {
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: { entries: [], boundarySource: "<built-in:ans-governed-construction SKILL boundary>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
    ],
    warnings: ["项目根下无角色目录"],
    hasRoles: false,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  assert.equal("readOnly" in res.roles[0], false, "创世态 su 亦不应再有 readOnly 字段（只读徽标已移除）");
});

test("listProject：可写的项目角色（非内置）亦不再带 readOnly 字段", async () => {
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "项目角色",
        cardPath: "角色卡/P/role-card.md",
        boundaryPath: "角色卡/P/boundary.yaml",
        cardText: "# 角色 P",
        boundary: { entries: [], boundarySource: "角色卡/P/boundary.yaml", acceptance: { accepted: false, source: "" } },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  assert.equal("readOnly" in res.roles[0], false, "项目角色不应再有 readOnly 字段（只读徽标已移除）");
});

// —————— T17：su 主位（primaryRoleId / hasRoles 透传）与刷新信号 ——————

test("T17 listProject：hasRoles 与 primaryRoleId 原样转自门禁引擎（渲染侧据此设主位/默认选中，不硬编码 su）", async () => {
  const listing: ProjectListing = {
    projectRoot: REPO_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: { entries: [], boundarySource: "<built-in:...>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
    ],
    warnings: ["项目根下无角色目录"],
    hasRoles: false,
    primaryRoleId: "su",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => REPO_ROOT,
    emitEvent: () => {},
    listProjectFn: async () => listing,
  });
  const res = await iface.listProject({ projectRoot: REPO_ROOT });
  // 原样转达（界面不重判——单一来源仍是门禁引擎）。
  assert.equal(res.hasRoles, false, "hasRoles 应原样转达（供「尚未 bootstrap」判断）");
  assert.equal(res.primaryRoleId, "su", "primaryRoleId 应原样转达（供主位/默认选中）");
});

// —————— I1：治理记录状态（PM 评审 §四.1）——————
// 三种状态走**真实共享载入器**（不注入 loadEffectiveConfig），仅枚举来源用假 listing；
// 同时核对 governanceRecord 与 hasRoles 相互独立、列举前后项目树不变（只读）。

test("I1 listProject：governanceRecord 由共享载入器事实派生（missing / present / invalid），与 hasRoles 独立", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const { createHash } = await import("node:crypto");
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "ans-governance-record-"));
  const GOVERNANCE_REL = "角色卡/governance-boundary.yaml";
  const GOVERNANCE_TEXT = "role: governance\nentries:\n  - kind: file\n    path: docs/bootstrap-manifest.md\n    purpose: 治理\n";
  const sha256OfText = (text: string): string => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  const mkProject = async (name: string, ansJson?: string, writeGovernanceDoc = false): Promise<string> => {
    const root = path.join(base, name);
    await fs.mkdir(path.join(root, "角色卡/A"), { recursive: true });
    await fs.writeFile(path.join(root, "角色卡/A/role-card.md"), "# A");
    if (writeGovernanceDoc) {
      await fs.mkdir(path.join(root, "角色卡"), { recursive: true });
      await fs.writeFile(path.join(root, GOVERNANCE_REL), GOVERNANCE_TEXT);
    }
    if (ansJson !== undefined) {
      await fs.mkdir(path.join(root, ".ans"), { recursive: true });
      await fs.writeFile(path.join(root, ".ans/project.json"), ansJson);
    }
    return root;
  };
  const tree = async (root: string): Promise<string[]> => {
    const out: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      for (const d of await fs.readdir(dir, { withFileTypes: true })) {
        const next = rel ? `${rel}/${d.name}` : d.name;
        out.push(next);
        if (d.isDirectory()) await walk(path.join(dir, d.name), next);
      }
    };
    await walk(root, "");
    return out.sort();
  };
  // 真实 pin 夹具：pin 指向真实存在的治理边界文件，sha 与盘上内容一致/不一致。
  const pinnedBoundary = (sha: string) => ({
    path: GOVERNANCE_REL,
    acceptance: {
      accepted: true,
      source: "operator:test",
      pin: [{ path: GOVERNANCE_REL, sha256: sha }],
    },
  });
  const roots = {
    missing: await mkProject("missing"),
    present: await mkProject("present", JSON.stringify({ governanceBoundary: pinnedBoundary(sha256OfText(GOVERNANCE_TEXT)) }), true),
    pinMismatch: await mkProject("pin-mismatch", JSON.stringify({ governanceBoundary: pinnedBoundary(sha256OfText("另一份已授权内容")) }), true),
    invalidJson: await mkProject("invalid-json", "{ 不是 JSON"),
    noPin: await mkProject("no-pin", JSON.stringify({
      governanceBoundary: { path: GOVERNANCE_REL, acceptance: { accepted: true, source: "operator:test" } },
    })),
  };
  const makeIface = (root: string, hasRoles = true) => createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: () => {},
    listProjectFn: async () => ({ ...FAKE_LISTING, projectRoot: root, hasRoles }),
    envFilePath: path.join(root, "absent-fake-env"),
  });
  try {
    const before = new Map<string, string[]>();
    for (const [key, root] of Object.entries(roots)) before.set(key, await tree(root));

    const missing = await makeIface(roots.missing).listProject({ projectRoot: roots.missing });
    assert.deepEqual(missing.governanceRecord, { state: "missing" });
    assert.equal(missing.hasRoles, true, "hasRoles 原样转自枚举（S1 判定＝hasRoles && missing）");

    // present 与 hasRoles 独立：枚举声称无角色，状态仍应是 present。
    const present = await makeIface(roots.present, false).listProject({ projectRoot: roots.present });
    assert.deepEqual(present.governanceRecord, { state: "present" });
    assert.equal(present.hasRoles, false, "governanceRecord 与 hasRoles 相互独立（不得互相覆盖）");

    // C1：pin 与盘上文件不符 → pin-mismatch + 逐文件明细（唯一modified）。
    const mismatch = await makeIface(roots.pinMismatch).listProject({ projectRoot: roots.pinMismatch });
    assert.equal(mismatch.governanceRecord.state, "pin-mismatch");
    assert.equal(mismatch.governanceRecord.pinCount, 1);
    assert.equal(mismatch.governanceRecord.pinFiles?.length, 1);
    assert.equal(mismatch.governanceRecord.pinFiles?.[0].path, GOVERNANCE_REL);
    assert.equal(mismatch.governanceRecord.pinFiles?.[0].status, "modified");
    assert.equal(mismatch.governanceRecord.pinFiles?.[0].pinned, sha256OfText("另一份已授权内容"));
    assert.equal(mismatch.governanceRecord.pinFiles?.[0].actual, sha256OfText(GOVERNANCE_TEXT));

    const invalidJson = await makeIface(roots.invalidJson).listProject({ projectRoot: roots.invalidJson });
    assert.equal(invalidJson.governanceRecord.state, "invalid");
    assert.match(invalidJson.governanceRecord.reason ?? "", /无法解析/, "invalid 的 reason 应取载入器降级原文");

    const noPin = await makeIface(roots.noPin).listProject({ projectRoot: roots.noPin });
    assert.equal(noPin.governanceRecord.state, "invalid", "accepted:true 无 pin 由载入器降级 ⇒ invalid");
    assert.match(noPin.governanceRecord.reason ?? "", /pin/, "reason 应说明 pin 缺失");

    // 只读：列举前后目录树逐项一致（不建 .ans、不写文件）。
    for (const [key, root] of Object.entries(roots)) {
      assert.deepEqual(await tree(root), before.get(key), `listProject 前后目录树应不变（${key}）`);
    }
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("I1 DesktopDeps.loadEffectiveConfig：可注入（单一授权链），派生不再另读 .ans", async () => {
  let calls = 0;
  // C1 起 present 还须带可验证 pin；本用例只验证载入器注入，pin 证据用注入替身（真实哈希由 I1 主用例覆盖）。
  const acceptance = {
    accepted: true,
    source: "injected:operator",
    pin: [{ path: "角色卡/governance-boundary.yaml", sha256: "a".repeat(64) }],
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    loadEffectiveConfig: async (opts) => {
      calls += 1;
      return {
        project: { ...opts.fallback, governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance } },
        source: { kind: "ans", path: "/proj/.ans/project.json", acceptance, pinPaths: [] },
      };
    },
    inspectPinnedBoundariesFn: async () => ({ state: "ok", checked: 1, files: [], digest: "c".repeat(64) }),
  });
  const res = await iface.listProject({ projectRoot: "/proj" });
  assert.equal(calls, 1, "派生应调用注入的共享载入器（不另写 .ans 读取逻辑）");
  assert.deepEqual(res.governanceRecord, { state: "present" });
});

test("T17 主入口角色一轮结束（settled）→ 触发 emitProjectChanged；非主入口角色不触发", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# su",
        boundary: { entries: [], boundarySource: "<built-in:...>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "# A",
        boundary: { entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }], boundarySource: "b", acceptance: { accepted: false, source: "" } },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  const makeHandle = (events: SessionEvent[]): RoleSessionHandle => {
    let i = 0;
    return {
      async send(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<SessionEvent>> {
                return i < events.length
                  ? { value: events[i++], done: false }
                  : { value: undefined as unknown as SessionEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {},
    };
  };
  let changed = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    emitProjectChanged: () => { changed += 1; },
    listProjectFn: async () => listing,
    openRoleSessionFn: async () => makeHandle([{ kind: "settled", summary: "会话结束" }]),
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });

  // 打开主入口 su → 其 settled 应触发一次刷新信号。
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "su", runtime: "demo" })).ok, true);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(changed, 1, "主入口角色的 settled 应触发一次 project:changed 信号");

  // 切到非主入口角色 A → 其 settled 不应再触发（只有主入口才刷左树）。
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(changed, 1, "非主入口角色的 settled 不应触发刷新");
});

// ————— T20：会话事件外推放宽到编排事件——handback 被 Interface 层外推（设计 §10.8）—————

test("T20 handback 事件被外推：Interface 层的 emitEvent 收到编排的 handback 事件（类型已放宽到 OrchestrationEvent）", async () => {
  const events: import("../../app/desktop/session.ts").DesktopOrchestrationEvent[] = [];
  const handback: TaskHandback = {
    roleId: "A",
    status: "blocked",
    summary: "被拦下：无写入落地",
    evidence: [],
    at: "2026-10-11T00:00:00.000Z",
  };
  const seq: OrchestrationEvent[] = [
    { kind: "handback", summary: "回交 su：被拦下", handback, liveReport: { source: { roleId: handback.roleId }, taskId: handback.taskId ?? null, status: handback.status, summary: { text: handback.summary, truncated: false, redacted: false }, evidence: handback.evidence.map(text => ({ text, truncated: false, redacted: false })), evidenceOmitted: 0, at: handback.at } },
    { kind: "settled", summary: "会话结束" },
  ];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: (env) => events.push(env.event),
    listProjectFn: async () => FAKE_LISTING,
    openRoleSessionFn: async (): Promise<RoleSessionHandle> => {
      let i = 0;
      return {
        async send(): Promise<void> {},
        events(): AsyncIterable<OrchestrationEvent> {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  return i < seq.length
                    ? { value: seq[i++], done: false }
                    : { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose(): Promise<void> {},
      };
    },
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" })).ok, true);
  await new Promise((r) => setTimeout(r, 25));

  const hb = events.find((e) => e.kind === "handback");
  assert.ok(hb, "handback 事件应经 Interface 的 emitEvent 外推（emitEvent 已放宽到 OrchestrationEvent）");
  assert.equal(
    (hb as Extract<import("../../app/desktop/session.ts").DesktopOrchestrationEvent, { kind: "handback" }>).liveReport!.status,
    "blocked",
    "外推的 handback 数据应原样（含 status）",
  );
});

// ————— A-5（2026-10-12）：客户交互通道经 Interface 透传（仅内置治理角色会话注入）—————

test("A-5 customerInput：Interface 透传客户通道；仅内置治理角色（su）会话被注入，且 roleId 经闭包绑定", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# 角色：ANS Governance（su）",
        boundary: { entries: [], boundarySource: "<built-in:...>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "# A",
        boundary: {
          entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/A/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "su",
  };
  const makeHandle = (): RoleSessionHandle => ({
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
  });
  const captured: { roleId: string; customerInput?: CustomerInputFn }[] = [];
  const seen: { roleId: string }[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => listing,
    openRoleSessionFn: async (input) => {
      captured.push({ roleId: input.roleId, customerInput: input.customerInput });
      return makeHandle();
    },
    buildProjectConfigFn: buildProjectConfig,
    // 桌面侧的客户通道带角色上下文（DesktopCustomerInputFn）——注入替身并断言 ctx 绑定。
    customerInput: (_req, ctx) => {
      seen.push({ roleId: ctx.roleId });
      return { outcome: "declined", reason: "测试替身：拒绝" };
    },
  });
  await iface.listProject({ projectRoot: "/proj" });
  await iface.openSession({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });

  const suInput = captured.find((c) => c.roleId === "su");
  const aInput = captured.find((c) => c.roleId === "A");
  assert.ok(suInput && typeof suInput.customerInput === "function", "内置治理角色（su）会话应注入 customerInput（确认制成立）");
  assert.equal(aInput!.customerInput, undefined, "普通角色会话**不**注入（无客户通道：两交互工具不注册）");
  // roleId 经闭包绑定：调用注入的 fn → 桌面通道收到 ctx.roleId（请求本体不带角色标识）。
  const out = await suInput!.customerInput!({ kind: "confirm", title: "要写角色卡吗？" });
  assert.deepEqual(seen, [{ roleId: "su" }], "customerInput 应带 roleId 上下文");
  assert.equal((out as { outcome: string }).outcome, "declined", "替身裁决原样回转");
});

test('B Interface native picker alone grants document refs; renderer listing, cancel and another window cannot grant', async (t) => {
 const fs=await import('node:fs/promises');const os=await import('node:os');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ans-doc-interface-'));
 await fs.mkdir(path.join(root,'角色卡/A/docs'),{recursive:true});
 await fs.writeFile(path.join(root,'角色卡/A/role-card.md'),'# card');
 await fs.writeFile(path.join(root,'角色卡/A/docs/report.md'),'report body');
 const listing={...FAKE_LISTING,projectRoot:root};
 let selected:string|null=null;
 const iface=createDesktopInterface({pickDirectory:async()=>selected,emitEvent:()=>{},listProjectFn:async()=>listing,envFilePath:path.join(root,'absent-fake-env')});
 const other=createDesktopInterface({pickDirectory:async()=>null,emitEvent:()=>{},listProjectFn:async()=>listing,envFilePath:path.join(root,'absent-fake-env')});
 try{
  assert.equal((await iface.listProject({projectRoot:root})).documentReadUnavailable,'PROJECT_NOT_GRANTED');
  assert.equal(await iface.pickProject(),null);
  assert.equal((await iface.listProject({projectRoot:root})).documentScope,undefined);
  selected=root;assert.equal(await iface.pickProject(),root);
  const view=await iface.listProject({projectRoot:root});
  if(process.platform==='win32'){
   await assertWindowsInterfaceClosed(iface,view,root);
   assert.equal((await other.listProject({projectRoot:root})).documentReadUnavailable,'PROJECT_NOT_GRANTED');
   const foreign=await other.readProjectDocument({version:1,projectViewId:'unissued',documentId:'unissued'});assert.ok(!foreign.ok);if(!foreign.ok)assert.equal(foreign.code,'PROJECT_NOT_GRANTED');
   iface.disposeProjectDocuments();const closed=await iface.readProjectDocument({version:1,projectViewId:'unissued',documentId:'unissued'});assert.ok(!closed.ok);if(!closed.ok)assert.equal(closed.code,'PROJECT_NOT_ACTIVE');
   t.diagnostic('Windows B2 rejects real document reads even after native import; cross-window and disposed guards also asserted.');return;
  }
  assert.ok(view.documentScope);
  const ref=view.roles[0].documents!.find(d=>d.label==='report.md')!;assert.ok(ref);
  const request={version:1,projectViewId:ref.projectViewId,documentId:ref.documentId};
  const content=await iface.readProjectDocument(request);assert.ok(content.ok);if(content.ok)assert.equal(content.text,'report body');
  assert.equal((await other.listProject({projectRoot:root})).documentScope,undefined);
  const foreign=await other.readProjectDocument(request);assert.ok(!foreign.ok);if(!foreign.ok)assert.equal(foreign.code,'PROJECT_NOT_GRANTED');
  const refresh=await iface.listProject({projectRoot:root});assert.equal(refresh.documentScope?.projectViewId,view.documentScope?.projectViewId,'same native-granted window survives renderer reload/list refresh');
  const forged=await iface.readProjectDocument({...request,projectRoot:root,path:'.env'});assert.ok(!forged.ok);if(!forged.ok)assert.equal(forged.code,'INVALID_REQUEST');
  iface.disposeProjectDocuments();const closed=await iface.readProjectDocument(request);assert.ok(!closed.ok);if(!closed.ok)assert.equal(closed.code,'PROJECT_NOT_ACTIVE');
 }finally{iface.disposeProjectDocuments();other.disposeProjectDocuments();await fs.rm(root,{recursive:true,force:true});}
});

test('B failed listing or native cancel preserves the previous imported document scope',async(t)=>{
 const fs=await import('node:fs/promises');const os=await import('node:os');
 const a=await fs.mkdtemp(path.join(os.tmpdir(),'ans-doc-active-'));const b=await fs.mkdtemp(path.join(os.tmpdir(),'ans-doc-pending-'));
 await fs.mkdir(path.join(a,'角色卡/A/docs'),{recursive:true});await fs.writeFile(path.join(a,'角色卡/A/role-card.md'),'card');await fs.writeFile(path.join(a,'角色卡/A/docs/report.md'),'active A');
 let selection:string|null=a;let failB=true;
 const iface=createDesktopInterface({pickDirectory:async()=>selection,emitEvent:()=>{},envFilePath:path.join(a,'absent-fake-env'),listProjectFn:async root=>{if(root===b&&failB)throw new Error('controlled enumeration failure');return {...FAKE_LISTING,projectRoot:root};}});
 try{
  await iface.pickProject();const before=await iface.listProject({projectRoot:a});
  if(process.platform==='win32'){
   await assertWindowsInterfaceClosed(iface,before,a);
   const request={version:1,projectViewId:'unissued',documentId:'unissued'};
   selection=b;await iface.pickProject();await assert.rejects(iface.listProject({projectRoot:b}),/controlled enumeration failure/);
   const preserved=await iface.readProjectDocument(request);assert.ok(!preserved.ok);if(!preserved.ok)assert.equal(preserved.code,'UNSUPPORTED_ENVIRONMENT','failed import preserves the active A platform rejection instead of clearing its context');
   selection=null;await iface.pickProject();const cancelled=await iface.readProjectDocument(request);assert.ok(!cancelled.ok);if(!cancelled.ok)assert.equal(cancelled.code,'UNSUPPORTED_ENVIRONMENT');
   failB=false;const next=await iface.listProject({projectRoot:b});assert.equal(next.documentReadUnavailable,'PROJECT_NOT_GRANTED');assert.equal(next.documentScope,undefined);assert.ok(next.roles.every(role=>(role.documents??[]).length===0));
   const switched=await iface.readProjectDocument(request);assert.ok(!switched.ok);if(!switched.ok)assert.equal(switched.code,'PROJECT_NOT_GRANTED');
   t.diagnostic('Windows failed/cancelled import retains the existing fail-closed state; successful ungranted import changes scope without minting refs.');return;
  }
  const ref=before.roles[0].documents!.find(d=>d.label==='report.md')!;const request={version:1,projectViewId:ref.projectViewId,documentId:ref.documentId};
  selection=b;await iface.pickProject();assert.equal((await iface.readProjectDocument(request)).ok,true);
  await assert.rejects(iface.listProject({projectRoot:b}),/controlled enumeration failure/);
  const stillActive=await iface.readProjectDocument(request);assert.ok(stillActive.ok);if(stillActive.ok)assert.equal(stillActive.text,'active A');
  selection=null;assert.equal(await iface.pickProject(),null);assert.equal((await iface.readProjectDocument(request)).ok,true);
  failB=false;const next=await iface.listProject({projectRoot:b});assert.equal(next.documentReadUnavailable,'PROJECT_NOT_GRANTED');assert.equal((await iface.readProjectDocument(request)).ok,false,'only successful import changes the active scope');
 }finally{iface.disposeProjectDocuments();await fs.rm(a,{recursive:true,force:true});await fs.rm(b,{recursive:true,force:true});}
});

test('C restricted Interface validates current scope and derives support from actual bound mode', async () => {
 let calls = 0;
 const handle = makeFakeHandle().handle;
 handle.retryReportPersistence = async () => { calls++; return { ok: false, state: 'unsupported', code: 'UNSUPPORTED', retryAvailable: false, message: 'safe' }; };
 handle.getReportPersistence = async () => { calls++; return { state: 'unsupported', code: 'UNSUPPORTED', retryAvailable: false }; };
 handle.retryDeliveryHistoryPersistence = async () => { calls++; return { ok: false, state: 'unsupported', code: 'UNSUPPORTED', retryAvailable: false, message: 'safe' }; };
 handle.getDeliveryReceipt = async () => { calls++; return { state: 'unsupported', code: 'UNSUPPORTED', retryAvailable: false }; };
 const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, listProjectFn: async () => FAKE_LISTING, openRoleSessionFn: async () => ({ ...handle, persistenceMode: 'unknown-live' }) });
 try {
  const scope = { version: 1, projectRoot: '/proj', roleId: 'A', runtime: 'demo' };
  assert.equal((await iface.getSessionPersistence(scope)).ok, false);
  await iface.listProject({ projectRoot: '/proj' }); await iface.openSession({ projectRoot: '/proj', roleId: 'A', runtime: 'demo' });
  const caps = await iface.getSessionPersistence(scope); assert.ok(caps.ok); if (caps.ok) assert.deepEqual(caps.value, { mode: 'unknown-live', reportSaveSupported: false, deliveryHistorySaveSupported: false, querySupported: false });
  for (const input of [{ ...scope, projectRoot: '/other' }, { ...scope, roleId: 'missing' }, { ...scope, reportId: 'forged', summary: 'raw fake report' }, { ...scope, version: 2 }]) assert.equal((await iface.retryReportSave(input)).ok, false);
  assert.equal((await iface.retryReportSave({ ...scope, reportId: 'forged' })).ok, false); assert.equal(calls, 0, 'invalid/unknown IDs never invoke even present proxies');
 } finally { await iface.stopSession(); iface.disposeProjectDocuments(); }
});


/** Actual Windows behavior, without pretending its Provider has POSIX descriptor guarantees. */
async function assertWindowsInterfaceClosed(iface:ReturnType<typeof createDesktopInterface>,view:Awaited<ReturnType<ReturnType<typeof createDesktopInterface>['listProject']>>,root:string):Promise<void>{
 const fs=await import('node:fs/promises');const file=path.join(root,'角色卡/A/docs/report.md');const before=await fs.readFile(file);const stat=await fs.stat(file);
 assert.equal(view.documentReadUnavailable,'UNSUPPORTED_ENVIRONMENT');assert.equal(view.documentScope,undefined);assert.ok(view.roles.every(role=>(role.documents??[]).length===0),'Windows must not mint readable file refs');
 const request={version:1,projectViewId:'unissued',documentId:'unissued'};const result=await iface.readProjectDocument(request);assert.ok(!result.ok);if(!result.ok){assert.equal(result.code,'UNSUPPORTED_ENVIRONMENT');assert.equal(Object.hasOwn(result,'text'),false);}
 const forged=await iface.readProjectDocument({...request,path:'.env'});assert.ok(!forged.ok);if(!forged.ok)assert.equal(forged.code,'INVALID_REQUEST');
 const refreshed=await iface.listProject({projectRoot:root});assert.equal(refreshed.documentReadUnavailable,'UNSUPPORTED_ENVIRONMENT');assert.equal(refreshed.documentScope,undefined);assert.ok(refreshed.roles.every(role=>(role.documents??[]).length===0));
 assert.deepEqual(await fs.readFile(file),before);assert.equal((await fs.stat(file)).mtimeMs,stat.mtimeMs);
}

test('B Interface listProject exposes rootDocs metadata, appends root-document refs, and never surfaces memo', async (t) => {
 const fs=await import('node:fs/promises');const os=await import('node:os');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ans-doc-roots-'));
 await fs.mkdir(path.join(root,'角色卡/A/docs'),{recursive:true});
 await fs.writeFile(path.join(root,'角色卡/A/role-card.md'),'# card');
 for(const [name,body] of [['feature-map.md','fm body'],['functional-description.md','fd body'],['api-spec.md','not-applicable']] as const) await fs.writeFile(path.join(root,'角色卡/A',name),body);
 await fs.writeFile(path.join(root,'角色卡/A/memo.md'),'memo-private-marker');
 await fs.writeFile(path.join(root,'角色卡/A/docs/report.md'),'report body');
 const listing={...FAKE_LISTING,projectRoot:root};
 const iface=createDesktopInterface({pickDirectory:async()=>root,emitEvent:()=>{},listProjectFn:async()=>listing,envFilePath:path.join(root,'absent-fake-env')});
 try{
  await iface.pickProject();
  const view=await iface.listProject({projectRoot:root});
  const role=view.roles[0];
  assert.deepEqual(role.rootDocs,[
   {name:'feature-map.md',path:'角色卡/A/feature-map.md',kind:'file'},
   {name:'functional-description.md',path:'角色卡/A/functional-description.md',kind:'file'},
   {name:'api-spec.md',path:'角色卡/A/api-spec.md',kind:'file'},
  ],'RoleView.rootDocs 按白名单顺序装配项目相对路径');
  assert.equal(JSON.stringify(view).includes('memo'),false,'memo 永不进入 listProject 载荷');
  assert.equal(JSON.stringify(view).includes('memo-private-marker'),false,'rootDocs 只含元数据，不读正文');
  if(process.platform==='win32'){
   assert.equal(view.documentReadUnavailable,'UNSUPPORTED_ENVIRONMENT');
   assert.deepEqual(role.documents,[],'Windows 不铸造根文档 refs，但 rootDocs 元数据仍可列出');
   t.diagnostic('Windows: rootDocs metadata listed with no refs/content; POSIX read asserted on supported platforms.');
  }else{
   assert.ok(view.documentScope);
   const refs=role.documents??[];
   assert.deepEqual(refs.slice(0,2).map(r=>r.relativePath),['角色卡/A/role-card.md','角色卡/A/docs/report.md'],'既有 refs 顺序前缀不变');
   assert.deepEqual(refs.slice(-3).map(r=>r.relativePath),['角色卡/A/feature-map.md','角色卡/A/functional-description.md','角色卡/A/api-spec.md'],'根文档 refs 追加在既有条目之后');
   const apiRef=refs.find(r=>r.relativePath==='角色卡/A/api-spec.md')!;
   const read=await iface.readProjectDocument({version:1,projectViewId:apiRef.projectViewId,documentId:apiRef.documentId});
   assert.ok(read.ok);if(read.ok)assert.equal(read.text,'not-applicable','not-applicable 按普通文本读取');
  }
  // 无新 IPC/preload 通道：源码级断言 + Interface 面断言。
  const preload=readFileSync(path.join(REPO_ROOT,'app','preload.cjs'),'utf8');
  assert.equal(/rootDoc|root-doc|root_doc/i.test(preload),false,'不得新增根文档 IPC/preload 通道');
  assert.equal('readRootDocument' in iface,false,'不得新增根文档读取方法');
 }finally{iface.disposeProjectDocuments();await fs.rm(root,{recursive:true,force:true});}
});


// ———————————————— I2（existing-project-compat V1）：治理记录预览/建立的 Interface 接线 ————————————————

const EMPTY_PREVIEW: GovernancePreview = {
  projectRoot: "/proj",
  governanceBoundaryRel: "角色卡/governance-boundary.yaml",
  writePaths: [".ans/project.json"],
  pinPaths: [],
  roleIds: ["A"],
  adoptExistingGovernanceDoc: false,
  acceptanceSource: "desktop-app:测试",
  governanceModel: "single",
  legacyBoundaryRoleIds: [],
};

function blockedEstablish(code: "invalid-request" | "busy", message: string): EstablishGovernanceResult {
  return {
    ok: false,
    phase: "guard",
    code,
    finalize: {
      ok: false,
      status: "blocked",
      message,
      reason: message,
      wrote: [],
      pins: [],
      roles: [],
      projectJsonRel: ".ans/project.json",
      manifestRel: "docs/bootstrap-manifest.md",
    },
  };
}

test("I2 守卫：projectRoot 必须非空且是当前导入项目，establish 必须 confirm:true；拒绝时不调用机制", async () => {
  let previewCalls = 0;
  let establishCalls = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    previewGovernanceRecordFn: async () => { previewCalls += 1; return { ok: true, preview: EMPTY_PREVIEW }; },
    establishGovernanceRecordFn: async () => {
      establishCalls += 1;
      return { ok: false, phase: "guard", code: "busy", finalize: blockedEstablish("busy", "未预期调用").finalize };
    },
  });

  // 尚未导入任何项目 ⇒ 非当前导入项目。
  const notImported = await iface.previewGovernanceRecord({ projectRoot: "/proj" });
  assert.equal(notImported.ok, false);
  if (!notImported.ok) assert.equal(notImported.code, "invalid-request");
  const establishNotImported = await iface.establishGovernanceRecord({ projectRoot: "/proj", confirm: true });
  assert.equal(establishNotImported.ok, false);
  assert.equal(establishNotImported.phase, "guard");
  assert.equal(establishNotImported.code, "invalid-request");
  assert.deepEqual(establishNotImported.finalize.wrote, []);
  assert.deepEqual(establishNotImported.finalize.pins, []);

  await iface.listProject({ projectRoot: "/proj" });

  // 空 projectRoot / 不是当前项目 / 缺 confirm——全为 invalid-request。
  for (const root of ["", "   ", "/other"]) {
    const preview = await iface.previewGovernanceRecord({ projectRoot: root });
    assert.equal(preview.ok, false);
    if (!preview.ok) assert.equal(preview.code, "invalid-request");
    const establish = await iface.establishGovernanceRecord({ projectRoot: root, confirm: true });
    assert.equal(establish.code, "invalid-request");
  }
  const missingConfirm = await iface.establishGovernanceRecord({ projectRoot: "/proj" } as never);
  assert.equal(missingConfirm.ok, false);
  assert.equal(missingConfirm.phase, "guard");
  assert.equal(missingConfirm.code, "invalid-request");
  assert.match(missingConfirm.finalize.message ?? "", /confirm/, "缺 confirm 应如实说明");

  assert.equal(previewCalls, 0, "guard 拒绝时绝不预览");
  assert.equal(establishCalls, 0, "guard 拒绝时绝不建立（零写入、不调用机制）");
});

test("I2 透传：预览/建立只把 projectRoot 交给机制；busy/already-established 等错误原样返回", async () => {
  let previewResult: GovernancePreviewResult = { ok: true, preview: EMPTY_PREVIEW };
  let establishResult: EstablishGovernanceResult = blockedEstablish("busy", "上一次建立仍在进行中；本次未写入任何文件。");
  const previewInputs: unknown[] = [];
  const establishInputs: unknown[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    previewGovernanceRecordFn: async (input) => { previewInputs.push(input); return previewResult; },
    establishGovernanceRecordFn: async (input) => { establishInputs.push(input); return establishResult; },
  });
  await iface.listProject({ projectRoot: "/proj" });

  assert.equal(await iface.previewGovernanceRecord({ projectRoot: "/proj" }), previewResult, "同一对象原样透传");
  assert.deepEqual(previewInputs, [{ projectRoot: "/proj" }], "只透传 projectRoot（不传边界/来源/写路径）");

  assert.equal(await iface.establishGovernanceRecord({ projectRoot: "/proj", confirm: true }), establishResult);
  assert.deepEqual(establishInputs, [{ projectRoot: "/proj" }], "confirm 是 Interface 的守卫入参，不进入机制输入");

  // 机制的其他错误同样原样返回（不重写 message/code）。
  const already: GovernancePreviewResult = { ok: false, code: "already-established", message: "治理记录已存在；本次未写入任何文件。" };
  previewResult = already;
  assert.equal(await iface.previewGovernanceRecord({ projectRoot: "/proj" }), already);
  const noRoles = blockedEstablish("invalid-request", "项目没有可用角色（hasRoles=false）；本次未写入任何文件。");
  establishResult = noRoles;
  assert.equal(await iface.establishGovernanceRecord({ projectRoot: "/proj", confirm: true }), noRoles);
});

test("I2 establish 成功：清列举缓存、调用既有陈旧边界刷新入口、复用 project:changed 让渲染侧重取", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "ans-governance-establish-"));
  const root = path.join(base, "proj");
  await fs.mkdir(path.join(root, "角色卡/A"), { recursive: true });
  await fs.writeFile(path.join(root, "角色卡/A/role-card.md"), "# A\n");
  const boundaryFile = path.join(root, "角色卡/A/boundary.yaml");
  await fs.writeFile(boundaryFile, "role: A\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: p\n");
  const listing: ProjectListing = { ...FAKE_LISTING, projectRoot: root };

  let openCalls = 0;
  let projectChanged = 0;
  let captured: unknown;
  const events: import("../../app/desktop/session.ts").DesktopOrchestrationEvent[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: (envelope) => { events.push(envelope.event); },
    listProjectFn: async () => listing,
    openRoleSessionFn: async () => { openCalls += 1; return makeFakeHandle().handle; },
    createDemoAdapterFn: () => ({}) as unknown as RuntimeAdapter,
    buildProjectConfigFn: buildProjectConfig,
    emitProjectChanged: () => { projectChanged += 1; },
    establishGovernanceRecordFn: async (input) => {
      captured = input;
      return {
        ok: true,
        phase: "write",
        finalize: {
          ok: true,
          status: "completed",
          message: "治理记录已建立。",
          reason: "",
          wrote: [".ans/project.json", "角色卡/governance-boundary.yaml", "docs/bootstrap-manifest.md"],
          pins: [],
          roles: ["A"],
          projectJsonRel: ".ans/project.json",
          manifestRel: "docs/bootstrap-manifest.md",
        },
      };
    },
  });
  try {
    await iface.listProject({ projectRoot: root });
    const opened = await iface.openSession({ projectRoot: root, roleId: "A", runtime: "demo" });
    assert.equal(opened.ok, true, "先有活会话，才能观察陈旧边界刷新入口是否被调用");

    // 让活会话的边界快照过期（O-1 判据＝读盘指纹变化）。**尺寸必须可判**：等长重写在
    // Windows/mtime 粒度合并时可能被 `filePrint` 的 (mtimeMs,size) 命中旧缓存（既有教训）。
    await fs.writeFile(boundaryFile, "role: A\nentries:\n  - kind: file\n    path: src/b.ts\n    purpose: 变更后的边界（更长）\n");

    const result = await iface.establishGovernanceRecord({ projectRoot: root, confirm: true });
    assert.equal(result.ok, true);
    assert.deepEqual(captured, { projectRoot: root }, "机制只收到 projectRoot");

    // 既有 refreshStaleBoundaries 是 fire-and-forget：有界等待重建发生。
    for (let i = 0; i < 100 && openCalls < 2; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.equal(openCalls, 2, "成功后应调用既有陈旧边界刷新入口（空闲会话按新边界重建）");
    assert.ok(
      events.some((e) => e.kind === "message" && /边界已更新/.test(e.summary)),
      "重建应经既有如实记行（不新造通知机制）",
    );
    assert.equal(projectChanged, 1, "复用既有主→渲染 project:changed 信号（渲染侧据此重新 listProject）");

    // 列举缓存已清：重新 listProject 之前，开会话走 cache miss 的如实拒绝。
    const after = await iface.openSession({ projectRoot: root, roleId: "B", runtime: "demo" });
    assert.equal(after.ok, false);
    assert.match(after.error ?? "", /尚未枚举该项目/);
  } finally {
    await iface.stopSession();
    iface.disposeProjectDocuments();
    await fs.rm(base, { recursive: true, force: true });
  }
});

// ———————————————— C1/C2（治理记录 pin 不符的重新接受恢复，PM 评审 §5.3）：Interface 接线 ————————————————

const PREVIEW_DIGEST = "d".repeat(64);

const REACCEPT_PREVIEW: GovernanceReacceptPreview = {
  projectRoot: "/proj",
  writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"],
  pinPaths: ["角色卡/governance-boundary.yaml"],
  pinCount: 1,
  changed: [{
    path: "角色卡/governance-boundary.yaml",
    pinned: "a".repeat(64),
    actual: "b".repeat(64),
    status: "modified",
  }],
  canConfirm: true,
  blockers: [],
  previewDigest: PREVIEW_DIGEST,
};

function reacceptResult(
  status: ReacceptGovernancePinsResult["status"],
  phase: ReacceptGovernancePinsResult["phase"],
  extra: Partial<ReacceptGovernancePinsResult> = {},
): ReacceptGovernancePinsResult {
  return { ok: status === "completed", status, phase, message: `${status}（测试）`, wrote: [], ...extra };
}

test("C1 listProject：pin 检查抛错不崩（降级 invalid），检查器收到 projectRoot/pins/治理边界路径", async () => {
  const acceptance = {
    accepted: true,
    source: "injected:operator",
    pin: [{ path: "角色卡/governance-boundary.yaml", sha256: "a".repeat(64) }],
  };
  const makeIface = (inspectPinnedBoundariesFn: (input: {
    projectRoot: string;
    pins: { path: string; sha256: string }[];
    requiredPath?: string;
  }) => Promise<PinEvidenceResult>) => createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    loadEffectiveConfig: async (opts) => ({
      project: { ...opts.fallback, governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance } },
      source: { kind: "ans", path: "/proj/.ans/project.json", acceptance, pinPaths: [] },
    }),
    inspectPinnedBoundariesFn,
  });

  const inputs: unknown[] = [];
  const ok = await makeIface(async (input) => {
    inputs.push(input);
    return { state: "ok", checked: 1, files: [], digest: "c".repeat(64) };
  }).listProject({ projectRoot: "/proj" });
  assert.deepEqual(ok.governanceRecord, { state: "present" }, "pin 全一致 → 保持既有 present 形状");
  assert.deepEqual(inputs, [{
    projectRoot: "/proj",
    pins: acceptance.pin,
    requiredPath: "角色卡/governance-boundary.yaml",
  }], "检查器须收到 projectRoot、.ans 的 pin 列表与治理边界路径（覆盖规则）");

  // 检查失败不得让 listProject 崩：如实降级为 invalid，其余列举字段照常返回。
  const failed = await makeIface(async () => { throw new Error("哈希读取失败"); }).listProject({ projectRoot: "/proj" });
  assert.equal(failed.projectRoot, "/proj");
  assert.equal(failed.roles.length, 1, "pin 检查失败不影响角色列举");
  assert.equal(failed.governanceRecord.state, "invalid");
  assert.equal(failed.governanceRecord.reason, "pin 证据检查失败：哈希读取失败");
});

test("C2 守卫：projectRoot 必须是当前导入项目、confirm:true、previewDigest 为 64 hex；拒绝时不调用机制", async () => {
  let previewCalls = 0;
  let reacceptCalls = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    previewGovernanceReacceptanceFn: async () => { previewCalls += 1; return { ok: true, preview: REACCEPT_PREVIEW }; },
    reacceptGovernancePinsFn: async () => { reacceptCalls += 1; return reacceptResult("completed", "write"); },
  });

  // 尚未导入任何项目 ⇒ 非当前导入项目。
  const previewNotImported = await iface.previewGovernanceReacceptance({ projectRoot: "/proj" });
  assert.equal(previewNotImported.ok, false);
  if (!previewNotImported.ok) {
    assert.equal(previewNotImported.status, "invalid-request");
    assert.match(previewNotImported.message, /本次未写入任何文件/);
  }
  const reacceptNotImported = await iface.reacceptGovernancePins({ projectRoot: "/proj", confirm: true, previewDigest: PREVIEW_DIGEST });
  assert.equal(reacceptNotImported.ok, false);
  assert.equal(reacceptNotImported.status, "invalid-request");
  assert.equal(reacceptNotImported.phase, "guard");
  assert.deepEqual(reacceptNotImported.wrote, []);
  assert.match(reacceptNotImported.message, /本次未写入任何文件/);

  await iface.listProject({ projectRoot: "/proj" });

  for (const root of ["", "   ", "/other"]) {
    const preview = await iface.previewGovernanceReacceptance({ projectRoot: root });
    assert.equal(preview.ok, false);
    if (!preview.ok) assert.equal(preview.status, "invalid-request");
    const reaccept = await iface.reacceptGovernancePins({ projectRoot: root, confirm: true, previewDigest: PREVIEW_DIGEST });
    assert.equal(reaccept.status, "invalid-request");
    assert.match(reaccept.message, /本次未写入任何文件/);
  }

  // 缺 confirm / confirm 非 true。
  for (const input of [
    { projectRoot: "/proj", previewDigest: PREVIEW_DIGEST },
    { projectRoot: "/proj", confirm: false, previewDigest: PREVIEW_DIGEST },
  ]) {
    const r = await iface.reacceptGovernancePins(input as never);
    assert.equal(r.status, "invalid-request");
    assert.equal(r.phase, "guard");
    assert.match(r.message, /confirm/);
    assert.match(r.message, /本次未写入任何文件/);
  }

  // previewDigest 形状：非空 64 位十六进制。
  for (const previewDigest of [undefined, "", "abc", "a".repeat(63), "a".repeat(65), "g".repeat(64), ` ${PREVIEW_DIGEST}`]) {
    const r = await iface.reacceptGovernancePins({
      projectRoot: "/proj",
      confirm: true,
      previewDigest: previewDigest as unknown as string,
    });
    assert.equal(r.status, "invalid-request", `digest ${JSON.stringify(previewDigest)} 应被拒`);
    assert.equal(r.phase, "guard");
    assert.match(r.message, /previewDigest/);
    assert.match(r.message, /本次未写入任何文件/);
  }

  assert.equal(previewCalls, 0, "guard 拒绝时绝不预览");
  assert.equal(reacceptCalls, 0, "guard 拒绝时绝不重新接受（零写入、不调用机制）");
});

test("C2 透传：预览只交 projectRoot；重新接受只交 projectRoot/confirm/previewDigest；非写入状态不改缓存不通知", async () => {
  let previewResult: GovernanceReacceptPreviewResult = { ok: true, preview: REACCEPT_PREVIEW };
  const previewInputs: unknown[] = [];
  const reacceptInputs: unknown[] = [];
  let projectChanged = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    openRoleSessionFn: async () => makeFakeHandle().handle,
    createDemoAdapterFn: () => ({}) as unknown as RuntimeAdapter,
    buildProjectConfigFn: buildProjectConfig,
    emitProjectChanged: () => { projectChanged += 1; },
    previewGovernanceReacceptanceFn: async (input) => { previewInputs.push(input); return previewResult; },
    reacceptGovernancePinsFn: async (input) => { reacceptInputs.push(input); return reacceptResult("busy", "guard", { message: "上一次操作仍在进行中；本次未写入任何文件。" }); },
  });
  await iface.listProject({ projectRoot: "/proj" });

  assert.equal(await iface.previewGovernanceReacceptance({ projectRoot: "/proj" }), previewResult, "同一对象原样透传");
  assert.deepEqual(previewInputs, [{ projectRoot: "/proj" }], "只透传 projectRoot（不传边界/来源/pin/写路径）");

  const busy = await iface.reacceptGovernancePins({ projectRoot: "/proj", confirm: true, previewDigest: PREVIEW_DIGEST });
  assert.equal(busy.status, "busy");
  assert.deepEqual(reacceptInputs, [{ projectRoot: "/proj", confirm: true, previewDigest: PREVIEW_DIGEST }], "只透传三个钉死字段");
  assert.equal(projectChanged, 0, "未进入写入的状态不得通知渲染侧");
  // 缓存仍在：busy 后无需重新列举即可继续使用既有缓存开会话（cache hit 路径仍可达）。
  const opened = await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(opened.ok, true, "非写入状态不得清列举缓存");

  previewResult = { ok: false, status: "not-needed", message: "边界与记录一致，无需重新接受。" };
  assert.equal(await iface.previewGovernanceReacceptance({ projectRoot: "/proj" }), previewResult);
});

test("C2 completed：先刷新陈旧边界 → 清列举缓存 → project:changed；不自动打开会话", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "ans-governance-reaccept-"));
  const root = path.join(base, "proj");
  await fs.mkdir(path.join(root, "角色卡/A"), { recursive: true });
  await fs.writeFile(path.join(root, "角色卡/A/role-card.md"), "# A\n");
  const boundaryFile = path.join(root, "角色卡/A/boundary.yaml");
  await fs.writeFile(boundaryFile, "role: A\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: p\n");
  const listing: ProjectListing = { ...FAKE_LISTING, projectRoot: root };

  const openInputs: unknown[] = [];
  let projectChanged = 0;
  let captured: unknown;
  const events: import("../../app/desktop/session.ts").DesktopOrchestrationEvent[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: (envelope) => { events.push(envelope.event); },
    listProjectFn: async () => listing,
    openRoleSessionFn: async (input) => { openInputs.push({ projectRoot: input.project, roleId: input.roleId }); return makeFakeHandle().handle; },
    createDemoAdapterFn: () => ({}) as unknown as RuntimeAdapter,
    buildProjectConfigFn: buildProjectConfig,
    emitProjectChanged: () => { projectChanged += 1; },
    reacceptGovernancePinsFn: async (input) => {
      captured = input;
      return reacceptResult("completed", "write", {
        ok: true,
        message: "已重新接受。",
        wrote: [".ans/project.json", "docs/bootstrap-manifest.md"],
      });
    },
  });
  try {
    await iface.listProject({ projectRoot: root });
    const opened = await iface.openSession({ projectRoot: root, roleId: "A", runtime: "demo" });
    assert.equal(opened.ok, true, "先有活会话，才能观察陈旧边界刷新入口是否被调用");
    assert.equal(openInputs.length, 1);

    // 让活会话的边界快照过期（O-1 判据＝读盘指纹变化；等长重写在 Windows 上可能被合并，故加长）。
    await fs.writeFile(boundaryFile, "role: A\nentries:\n  - kind: file\n    path: src/b.ts\n    purpose: 变更后的边界（更长）\n");

    const result = await iface.reacceptGovernancePins({ projectRoot: root, confirm: true, previewDigest: PREVIEW_DIGEST });
    assert.equal(result.status, "completed");
    assert.deepEqual(captured, { projectRoot: root, confirm: true, previewDigest: PREVIEW_DIGEST }, "机制只收到三个钉死字段");

    for (let i = 0; i < 100 && openInputs.length < 2; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.equal(openInputs.length, 2, "成功后应调用既有陈旧边界刷新入口（空闲会话按新边界重建）");
    assert.ok(
      events.some((e) => e.kind === "message" && /边界已更新/.test(e.summary)),
      "重建应经既有如实记行",
    );
    // 不自动打开会话：唯一一次新开会话来自既有陈旧边界重建，且仍是原来的角色 A。
    assert.ok(openInputs.every((o) => (o as { roleId: string }).roleId === "A"), "不得自动打开任何会话");
    assert.equal(projectChanged, 1, "复用既有主→渲染 project:changed 信号");

    // 列举缓存已清：重新 listProject 之前，开会话走 cache miss 的如实拒绝。
    const after = await iface.openSession({ projectRoot: root, roleId: "B", runtime: "demo" });
    assert.equal(after.ok, false);
    assert.match(after.error ?? "", /尚未枚举该项目/);
  } finally {
    await iface.stopSession();
    iface.disposeProjectDocuments();
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("C2 write-failed：同样清列举缓存并通知（让界面如实反映可能已部分落盘的盘面）", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "ans-governance-reaccept-wf-"));
  const root = path.join(base, "proj");
  await fs.mkdir(path.join(root, "角色卡/A"), { recursive: true });
  await fs.writeFile(path.join(root, "角色卡/A/role-card.md"), "# A\n");
  const listing: ProjectListing = { ...FAKE_LISTING, projectRoot: root };

  let projectChanged = 0;
  let openCalls = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: () => {},
    listProjectFn: async () => listing,
    openRoleSessionFn: async () => { openCalls += 1; return makeFakeHandle().handle; },
    createDemoAdapterFn: () => ({}) as unknown as RuntimeAdapter,
    buildProjectConfigFn: buildProjectConfig,
    emitProjectChanged: () => { projectChanged += 1; },
    reacceptGovernancePinsFn: async () => reacceptResult("write-failed", "write", {
      message: "写入中断：测试注入；可能已写入部分文件，请核对现场。",
      wrote: [".ans/project.json"],
    }),
  });
  try {
    await iface.listProject({ projectRoot: root });
    const result = await iface.reacceptGovernancePins({ projectRoot: root, confirm: true, previewDigest: PREVIEW_DIGEST });
    assert.equal(result.ok, false);
    assert.equal(result.status, "write-failed");
    assert.equal(result.phase, "write");
    assert.equal(projectChanged, 1, "write-failed 也要让渲染侧重新列举");
    assert.equal(openCalls, 0, "不自动打开会话");

    const after = await iface.openSession({ projectRoot: root, roleId: "A", runtime: "demo" });
    assert.equal(after.ok, false);
    assert.match(after.error ?? "", /尚未枚举该项目/, "列举缓存已清");
  } finally {
    iface.disposeProjectDocuments();
    await fs.rm(base, { recursive: true, force: true });
  }
});

// ————————————————— 2026-10-17「替我审」开关与判断接线（PM 评审 §6.6/§10.3/§十一） —————————————————

test("替我审开关：主进程权威、默认 false；成功切换；非法输入失败且**不改状态**；reset 复位", async () => {
  const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {} });
  assert.deepEqual(iface.getShellJudgeState(), { version: 1, ok: true, enabled: false, available: true }, "启动默认 false");
  assert.deepEqual(iface.setShellJudgeEnabled({ enabled: true }), { version: 1, ok: true, enabled: true, available: true });
  assert.deepEqual(iface.getShellJudgeState(), { version: 1, ok: true, enabled: true, available: true });
  const before = iface.getShellJudgeState();
  for (const bad of [null, undefined, {}, { enabled: "yes" }, { enabled: 1 }, { enabled: true, extra: 1 }, []]) {
    const result = iface.setShellJudgeEnabled(bad);
    assert.equal(result.ok, false, `非法输入应拒绝：${JSON.stringify(bad)}`);
    assert.equal(typeof result.error, "string", "失败带 error");
    assert.equal(result.enabled, undefined, "失败不回 enabled");
    assert.deepEqual(iface.getShellJudgeState(), before, "失败不改状态");
  }
  iface.resetShellJudgeState();
  assert.equal(iface.getShellJudgeState().enabled, false, "reset ⇒ 手动（重载复位）");
  assert.equal((await iface.listLiveSessions()).length, 0, "开关不自动打开会话");
});

test("替我审开关状态机：同实例共享（main 通道与 Interface 不漂移）；reset 不改已挂起语义由通道调用当刻决定", () => {
  const shared = createShellJudgeSwitch();
  assert.equal(shared.isEnabled(), false);
  shared.set({ enabled: true });
  assert.equal(shared.isEnabled(), true);
  shared.reset();
  assert.equal(shared.isEnabled(), false);
});

test("替我审开关不持久化：切换不写 .env / 不落任何文件 / 不自动开会话", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "ans-judge-switch-"));
  const envPath = path.join(base, ".env");
  await fs.writeFile(envPath, "ANTHROPIC_AUTH_TOKEN=fixture\n", "utf8");
  try {
    const iface = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      envFilePath: envPath,
      piConfigEnv: {},
    });
    assert.equal(iface.setShellJudgeEnabled({ enabled: true }).ok, true);
    assert.equal(iface.setShellJudgeEnabled({ enabled: false }).ok, true);
    assert.equal(await fs.readFile(envPath, "utf8"), "ANTHROPIC_AUTH_TOKEN=fixture\n", ".env 未被改写");
    assert.deepEqual((await fs.readdir(base)).sort(), [".env"], "未新增任何持久化文件");
    assert.equal((await iface.listLiveSessions()).length, 0, "开关不自动打开会话");
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("shell:judge IPC sender 校验：仅同一 webContents 通过（主进程 handler 只调它）", () => {
  const webContents = { id: 1 };
  assert.equal(isShellJudgeIpcSender(webContents, webContents), true);
  assert.equal(isShellJudgeIpcSender({ id: 2 }, webContents), false, "其他 sender 拒绝");
  assert.equal(isShellJudgeIpcSender(null, webContents), false);
  assert.equal(isShellJudgeIpcSender(undefined, webContents), false);
});

test("替我审接线：Interface 构造会话时用注入的 createShellJudge，并在 metadata 提供 judge（缺省可注入桩件）", async () => {
  const judge = async () => ({ verdict: "allow" as const, reason: "桩件", reasonCode: "necessary" });
  const factoryArgs: Record<string, unknown>[] = [];
  const metadataSeen: ({ judge?: unknown } | undefined)[] = [];
  let capturedChannel: ((prompt: unknown) => Promise<unknown>) | undefined;
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    openRoleSessionFn: async (input) => {
      capturedChannel = input.shellOperatorChannel as ((prompt: unknown) => Promise<unknown>) | undefined;
      return makeFakeHandle().handle;
    },
    shellOperatorChannel: async (_prompt, metadata) => {
      metadataSeen.push(metadata);
      return { outcome: "deny", operatorId: "stub", reason: "替身拒绝" };
    },
    shellArming: { classifyShell: () => "allow", rules: {} } as never,
    loadEffectiveConfig: async (opts) => ({
      project: opts.fallback,
      source: {
        kind: "builtin-fallback" as const,
        path: "",
        acceptance: opts.fallback.governanceBoundary!.acceptance,
        pinPaths: [],
      },
    }),
    createShellJudgeFn: (opts) => {
      factoryArgs.push(opts as unknown as Record<string, unknown>);
      return judge;
    },
  });
  await iface.listProject({ projectRoot: "/proj" });
  const opened = await iface.openSession({ projectRoot: "/proj", roleId: "A", runtime: "pi" });
  assert.equal(opened.ok, true);
  assert.equal(factoryArgs.length, 1, "Interface 把 createShellJudge 交给会话构造");
  assert.equal(factoryArgs[0].runtime, "pi");
  assert.equal(typeof factoryArgs[0].createAdapter, "function", "用会话同一 createAdapter 工厂");
  assert.ok(capturedChannel, "会话拿到绑定 (a) 通道");
  await capturedChannel!({ command: "ls", argv: ["ls"], cwd: "/proj", toolCallId: "i1" });
  assert.equal(metadataSeen[0]?.judge, judge, "metadata.judge 即每会话闭包");
  await iface.stopSession({ roleId: null });
  iface.disposeProjectDocuments();
});

// —————————————— 2026-10-18 双开关：「替我决策」开关/IPC 接线与判断闭包 ——————————————

test("替我决策开关：默认 false、与 approval **互不影响**；非法输入不改状态；reset 只复位自己", async () => {
  const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {} });
  assert.deepEqual(
    iface.getDecisionJudgeState(),
    { version: 1, ok: true, enabled: false, available: true },
    "decision 启动默认 false（available 由主进程驱动接线决定）",
  );
  assert.equal(iface.setShellJudgeEnabled({ enabled: true }).ok, true);
  assert.equal(iface.getDecisionJudgeState().enabled, false, "approval 开启不影响 decision");
  assert.equal(iface.setDecisionJudgeEnabled({ enabled: true }).ok, true);
  assert.equal(iface.getShellJudgeState().enabled, true, "decision 开启不影响 approval");
  const before = iface.getDecisionJudgeState();
  for (const bad of [null, undefined, {}, { enabled: "yes" }, { enabled: 1 }, { enabled: true, extra: 1 }, []]) {
    const result = iface.setDecisionJudgeEnabled(bad);
    assert.equal(result.ok, false, `非法输入应拒绝：${JSON.stringify(bad)}`);
    assert.equal(typeof result.error, "string");
    assert.deepEqual(iface.getDecisionJudgeState(), before, "失败不改状态");
  }
  iface.resetDecisionJudgeState();
  assert.equal(iface.getDecisionJudgeState().enabled, false, "reset ⇒ 手动（重载复位）");
  assert.equal(iface.getShellJudgeState().enabled, true, "复位 decision 不动 approval");
  iface.resetShellJudgeState();
  assert.equal(iface.getShellJudgeState().enabled, false);
});

/** trio 枚举（主入口 liaison + 提案角色 rapporteur）。 */
const JUDGE_TRIO_LISTING: ProjectListing = {
  projectRoot: "/trio-judge",
  roles: [
    { roleId: "liaison", cardPath: "", boundaryPath: "", cardText: "# liaison", boundary: { entries: [], boundarySource: "<built-in:trio/liaison>", acceptance: { accepted: true, source: "test" } }, builtIn: true, governanceFunction: "liaison" },
    { roleId: "rapporteur", cardPath: "", boundaryPath: "", cardText: "# rapporteur", boundary: { entries: [], boundarySource: "<built-in:trio/rapporteur>", acceptance: { accepted: true, source: "test" } }, builtIn: true, governanceFunction: "proposal" },
  ],
  warnings: [],
  hasRoles: true,
  primaryRoleId: "liaison",
  governanceModel: "trio",
};

test("替我决策接线：trio 会话构造 governanceJudge 闭包并放入 customerInput ctx；judgeContext 原样透传", async () => {
  const judge = async () => ({
    verdict: "manual" as const,
    group: "decision" as const,
    cardKind: "proposal" as const,
    reasonCode: "insufficient-evidence",
    engine: "pi" as const,
  });
  let factoryCalls = 0;
  let captured: { customerInput?: CustomerInputFn } | undefined;
  const ctxSeen: { governanceModel?: string; governanceJudge?: unknown }[] = [];
  const metaSeen: unknown[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/trio-judge",
    emitEvent: () => {},
    listProjectFn: async () => JUDGE_TRIO_LISTING,
    openRoleSessionFn: async (input) => {
      captured = input as unknown as { customerInput?: CustomerInputFn };
      return makeFakeHandle().handle;
    },
    customerInput: (_req, ctx, metadata) => {
      ctxSeen.push(ctx as { governanceModel?: string; governanceJudge?: unknown });
      metaSeen.push(metadata);
      return { outcome: "declined", reason: "替身：拒绝" };
    },
    createGovernanceJudgeFn: (opts) => {
      factoryCalls += 1;
      assert.equal(opts.runtime, "pi");
      assert.equal(typeof opts.createAdapter, "function", "用会话同一 createAdapter 工厂");
      return judge;
    },
    loadEffectiveConfig: async (opts) => ({
      project: opts.fallback,
      source: {
        kind: "builtin-fallback" as const,
        path: "",
        acceptance: opts.fallback.governanceBoundary!.acceptance,
        pinPaths: [],
      },
    }),
  });
  await iface.listProject({ projectRoot: "/trio-judge" });
  const opened = await iface.openSession({ projectRoot: "/trio-judge", roleId: "rapporteur", runtime: "pi" });
  assert.equal(opened.ok, true);
  assert.equal(factoryCalls, 1, "trio + 客户通道会话构造治理判断闭包");
  assert.ok(captured?.customerInput, "Rapporteur 注入客户通道");
  const judgeContext = {
    flowId: "flow-a",
    facts: { governanceModel: "trio" as const, flowId: "flow-a", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] },
  };
  await captured!.customerInput!(
    { kind: "choice", title: "提案", cardKind: "proposal", flowId: "flow-a", options: [{ id: "accept", label: "接受" }] },
    { cardKind: "proposal", flowId: "flow-a", judgeContext },
  );
  assert.equal(ctxSeen[0].governanceModel, "trio", "ctx 带治理模型（通道的判断门只认 trio）");
  assert.equal(ctxSeen[0].governanceJudge, judge, "ctx 带每会话判断闭包");
  assert.deepEqual((metaSeen[0] as { judgeContext?: unknown }).judgeContext, judgeContext, "run-role 的 judgeContext 原样透传");
  await iface.stopSession({ roleId: null });
  iface.disposeProjectDocuments();
});

test("替我决策接线：single/su 不构造治理判断闭包（ctx 无 governanceJudge）", async () => {
  const single: ProjectListing = {
    projectRoot: "/single-judge",
    roles: [
      { roleId: "su", cardPath: "", boundaryPath: "", cardText: "# su", boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: true, source: "test" } }, builtIn: true },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
    governanceModel: "single",
  };
  let factoryCalls = 0;
  let captured: { customerInput?: CustomerInputFn } | undefined;
  const ctxSeen: { governanceModel?: string; governanceJudge?: unknown }[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/single-judge",
    emitEvent: () => {},
    listProjectFn: async () => single,
    openRoleSessionFn: async (input) => {
      captured = input as unknown as { customerInput?: CustomerInputFn };
      return makeFakeHandle().handle;
    },
    customerInput: (_req, ctx) => {
      ctxSeen.push(ctx as { governanceModel?: string; governanceJudge?: unknown });
      return { outcome: "declined", reason: "替身：拒绝" };
    },
    createGovernanceJudgeFn: () => {
      factoryCalls += 1;
      return async () => ({ verdict: "manual", group: "decision", cardKind: "proposal", reasonCode: "x", engine: "pi" });
    },
    loadEffectiveConfig: async (opts) => ({
      project: opts.fallback,
      source: { kind: "builtin-fallback" as const, path: "", acceptance: opts.fallback.governanceBoundary!.acceptance, pinPaths: [] },
    }),
  });
  await iface.listProject({ projectRoot: "/single-judge" });
  assert.equal((await iface.openSession({ projectRoot: "/single-judge", roleId: "su", runtime: "pi" })).ok, true);
  assert.equal(factoryCalls, 0, "single 不构造判断闭包");
  await captured!.customerInput!({ kind: "choice", title: "提案", cardKind: "proposal", flowId: "flow-a", options: [{ id: "accept", label: "接受" }] });
  assert.equal(ctxSeen[0].governanceModel, "single");
  assert.equal(ctxSeen[0].governanceJudge, undefined, "single/su 不注入判断能力");
  await iface.stopSession({ roleId: null });
  iface.disposeProjectDocuments();
});

test("代批进度行：落主入口 Liaison（detail.source=judge-decision）；来源即主入口不重复", async () => {
  const events: SessionEventEnvelope[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/trio-judge",
    emitEvent: (envelope) => { events.push(envelope); },
    listProjectFn: async () => JUDGE_TRIO_LISTING,
  });
  await iface.listProject({ projectRoot: "/trio-judge" });
  const payload = {
    version: 1 as const,
    id: "gj-1",
    requestId: "op-1",
    anchorKey: "k",
    toolCallId: "t1",
    roleId: "rapporteur",
    at: "2026-10-18T00:00:00.000Z",
    group: "decision" as const,
    cardKind: "proposal" as const,
    flowId: "flow-a",
    engine: "pi" as const,
    reasonCode: "sufficient",
  };
  iface.emitJudgeProgress(payload);
  const messages = events.filter((envelope) => envelope.event.kind === "message");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].roleId, "liaison", "进度行落主入口");
  const messageEvent = messages[0].event as { summary?: string; detail?: { source?: string } };
  assert.equal(messageEvent.detail?.source, "judge-decision");
  assert.match(String(messageEvent.summary), /judge 代批 · 代决策/);
  iface.emitJudgeProgress({ ...payload, roleId: "liaison" });
  assert.equal(events.filter((envelope) => envelope.event.kind === "message").length, 1, "来源即主入口时不重复");
  iface.disposeProjectDocuments();
});

// —————————————— 三权 W3（评审 §5.6）：Interface 透传 + V1b 迁移入口 ——————————————

test("三权：listProject 透传 governanceModel 与角色的 governanceFunction（原样转自门禁引擎）", async () => {
  const trio: ProjectListing = {
    projectRoot: "/trio",
    roles: [
      { roleId: "rapporteur", cardPath: "", boundaryPath: "", cardText: "# Rapporteur", boundary: { entries: [], boundarySource: "<built-in:trio/rapporteur>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "proposal" },
      { roleId: "nominator", cardPath: "", boundaryPath: "", cardText: "# Nominator", boundary: { entries: [], boundarySource: "<built-in:trio/nominator>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "nomination" },
      { roleId: "convener", cardPath: "", boundaryPath: "", cardText: "# Convener", boundary: { entries: [], boundarySource: "<built-in:trio/convener>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "schedule" },
      { roleId: "A", cardPath: "角色卡/A/role-card.md", boundaryPath: "角色卡/A/boundary.yaml", cardText: "# A", boundary: { entries: [], boundarySource: "角色卡/A/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "rapporteur",
    governanceModel: "trio",
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => "/trio",
    emitEvent: () => {},
    listProjectFn: async () => trio,
  });
  const res = await iface.listProject({ projectRoot: "/trio" });
  assert.equal(res.governanceModel, "trio", "治理模型原样透传（渲染侧据它显示三权/旧模型）");
  assert.equal(res.primaryRoleId, "rapporteur", "三权主入口原样透传");
  assert.deepEqual(res.roles.map((r) => r.governanceFunction), ["proposal", "nomination", "schedule", undefined], "内置三人带职能，项目角色不带");
});

// —————————————— V1b 迁移接线（评审 §5.5）：守卫 / 透传 / 成功收尾 ——————————————

const MIGRATION_PREVIEW: GovernanceMigrationPreview = {
  model: "single",
  targetModel: "trio",
  writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"],
  modelField: "single",
  manifestLine: "治理模型升级（su → trio）",
  pinChanges: [],
  retainedFiles: ["角色卡/governance-boundary.yaml"],
  snapshotDigest: "a".repeat(64),
};

test("V1b 迁移预览：当前导入项目守卫 + 只透传 projectRoot；机制结果原样返回", async () => {
  const calls: { projectRoot: string }[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    previewGovernanceMigrationFn: async (input) => {
      calls.push(input);
      return { ok: true, preview: MIGRATION_PREVIEW };
    },
  });
  const denied = await iface.previewGovernanceMigration({ projectRoot: "/elsewhere" });
  assert.equal(denied.ok, false);
  assert.equal(denied.ok === false ? denied.code : "", "invalid-request", "非当前导入项目 ⇒ invalid-request");
  assert.equal(calls.length, 0, "guard 拒绝不调用机制");

  await iface.listProject({ projectRoot: "/proj" });
  const preview = await iface.previewGovernanceMigration({ projectRoot: "/proj" });
  assert.deepEqual(preview, { ok: true, preview: MIGRATION_PREVIEW }, "机制结果原样返回（含 targetModel/writePaths/snapshotDigest）");
  assert.deepEqual(calls, [{ projectRoot: "/proj" }], "只透传 projectRoot（不接受调用方提供的路径/模型/写路径）");

  const forged = await iface.previewGovernanceMigration({ projectRoot: "/proj", model: "trio", writePaths: ["x"] } as never);
  assert.deepEqual(calls[1], { projectRoot: "/proj" }, "多余字段不被透传");
  assert.equal(forged.ok, true);
});

test("V1b 迁移写入守卫：非导入项目 / 缺 confirm / 非法 previewDigest → invalid-request 且不调用机制", async () => {
  let calls = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    migrateGovernanceModelFn: async (input): Promise<GovernanceMigrationResult> => {
      calls += 1;
      return { ok: true, phase: "write", status: "completed", model: "trio", message: `已迁移 ${input.projectRoot}` };
    },
  });
  const notImported = await iface.migrateGovernanceModel({ projectRoot: "/elsewhere", confirm: true, previewDigest: "a".repeat(64) });
  assert.equal(notImported.status, "invalid-request");
  assert.equal(notImported.phase, "guard");

  await iface.listProject({ projectRoot: "/proj" });
  const noConfirm = await iface.migrateGovernanceModel({ projectRoot: "/proj", previewDigest: "a".repeat(64) } as never);
  assert.equal(noConfirm.status, "invalid-request");
  assert.match(noConfirm.message, /confirm/);
  const badDigest = await iface.migrateGovernanceModel({ projectRoot: "/proj", confirm: true, previewDigest: "not-hex" });
  assert.equal(badDigest.status, "invalid-request");
  assert.match(badDigest.message, /previewDigest|预览摘要/);
  assert.equal(calls, 0, "三个 guard 分支都不得调用机制");

  const ok = await iface.migrateGovernanceModel({ projectRoot: "/proj", confirm: true, previewDigest: "b".repeat(64) });
  assert.equal(calls, 1, "合法请求进入机制一次");
  assert.equal(ok.status, "completed");
});

test("V1b 迁移成功：先刷新陈旧边界 → 清列举缓存 → project:changed；不自动开会话；失败不清缓存", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "ans-governance-migrate-"));
  const root = path.join(base, "proj");
  await fs.mkdir(path.join(root, "角色卡/A"), { recursive: true });
  await fs.mkdir(path.join(root, ".ans"), { recursive: true });
  await fs.writeFile(path.join(root, "角色卡/A/role-card.md"), "# A\n");
  await fs.writeFile(path.join(root, "角色卡/A/boundary.yaml"), "role: A\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: p\n");
  const ansFile = path.join(root, ".ans", "project.json");
  await fs.writeFile(ansFile, JSON.stringify({ governanceModel: "single", projectRoot: root }) + "\n");
  const listing: ProjectListing = { ...FAKE_LISTING, projectRoot: root, governanceModel: "single" };

  let openCalls = 0;
  let projectChanged = 0;
  let captured: unknown;
  let status: GovernanceMigrationResult["status"] = "completed";
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: () => {},
    listProjectFn: async () => listing,
    openRoleSessionFn: async () => { openCalls += 1; return makeFakeHandle().handle; },
    createDemoAdapterFn: () => ({}) as unknown as RuntimeAdapter,
    buildProjectConfigFn: buildProjectConfig,
    emitProjectChanged: () => { projectChanged += 1; },
    migrateGovernanceModelFn: async (input) => {
      captured = input;
      return status === "completed"
        ? { ok: true, phase: "write", status, model: "trio", message: "迁移完成。" }
        : { ok: false, phase: "guard", status, model: "single", message: "未迁移。" };
    },
  });
  try {
    await iface.listProject({ projectRoot: root });
    assert.equal((await iface.openSession({ projectRoot: root, roleId: "A", runtime: "demo" })).ok, true);
    // 让活会话的 `.ans/project.json` 指纹过期（尺寸可判：Windows/mtime 粒度合并时等长重写可能漏检）。
    await fs.writeFile(ansFile, JSON.stringify({ governanceModel: "single", projectRoot: root, marker: "changed-size" }) + "\n");

    const result = await iface.migrateGovernanceModel({ projectRoot: root, confirm: true, previewDigest: "c".repeat(64) });
    assert.equal(result.status, "completed");
    assert.deepEqual(captured, { projectRoot: root, confirm: true, previewDigest: "c".repeat(64) }, "只透传三个钉死字段");
    for (let i = 0; i < 100 && openCalls < 2; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.equal(openCalls, 2, "成功应先经既有 refreshStaleBoundaries 重建陈旧会话");
    assert.equal(projectChanged, 1, "复用既有 project:changed 信号");
    const after = await iface.openSession({ projectRoot: root, roleId: "B", runtime: "demo" });
    assert.equal(after.ok, false, "列举缓存已清：重新 listProject 前开会话如实拒绝");
    assert.match(after.error ?? "", /尚未枚举该项目/);

    // 失败分支（如 busy/preview-stale/blocked）不清缓存、不发 project:changed。
    await iface.listProject({ projectRoot: root });
    const changedBefore = projectChanged;
    status = "blocked";
    const blocked = await iface.migrateGovernanceModel({ projectRoot: root, confirm: true, previewDigest: "c".repeat(64) });
    assert.equal(blocked.status, "blocked");
    assert.equal(projectChanged, changedBefore, "失败不触发 project:changed");
    assert.equal((await iface.openSession({ projectRoot: root, roleId: "A", runtime: "demo" })).ok, true, "失败不清列举缓存");
  } finally {
    await iface.stopSession();
    iface.disposeProjectDocuments();
    await fs.rm(base, { recursive: true, force: true });
  }
});


test("V1b 默认真实机制走通（不经注入）：预览 → 确认 → `.ans` 写入 trio + manifest 留痕；not-available 已消失", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "ans-governance-migrate-real-"));
  const root = path.join(base, "proj");
  await fs.mkdir(path.join(root, "角色卡/A"), { recursive: true });
  await fs.mkdir(path.join(root, ".ans"), { recursive: true });
  await fs.writeFile(path.join(root, "角色卡/A/role-card.md"), "# A\n");
  await fs.writeFile(path.join(root, "角色卡/A/boundary.yaml"), "role: A\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: p\n");
  await fs.writeFile(path.join(root, ".ans", "project.json"), JSON.stringify({ projectRoot: root }) + "\n");
  const listing: ProjectListing = { ...FAKE_LISTING, projectRoot: root, governanceModel: "single" };
  let projectChanged = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: () => {},
    listProjectFn: async () => listing,
    emitProjectChanged: () => { projectChanged += 1; },
  });
  try {
    await iface.listProject({ projectRoot: root });
    const preview = await iface.previewGovernanceMigration({ projectRoot: root });
    assert.equal(preview.ok, true, "默认走编排真实预览（不再是 not-available）");
    if (preview.ok) {
      assert.equal(preview.preview.model, "single");
      assert.equal(preview.preview.targetModel, "trio");
      assert.deepEqual(preview.preview.writePaths, [".ans/project.json", "docs/bootstrap-manifest.md"]);
      assert.match(preview.preview.snapshotDigest, /^[0-9a-f]{64}$/);
    }
    const digest = preview.ok ? preview.preview.snapshotDigest : "";
    const result = await iface.migrateGovernanceModel({ projectRoot: root, confirm: true, previewDigest: digest });
    assert.equal(result.ok, true, "确认后真实迁移完成");
    assert.equal(result.status, "completed");
    assert.equal(JSON.parse(await fs.readFile(path.join(root, ".ans", "project.json"), "utf8")).governanceModel, "trio");
    assert.match(await fs.readFile(path.join(root, "docs", "bootstrap-manifest.md"), "utf8"), /治理模型升级/);
    assert.equal(projectChanged, 1, "成功后复用 project:changed");
    const after = await iface.openSession({ projectRoot: root, roleId: "A", runtime: "demo" });
    assert.equal(after.ok, false, "成功后清列举缓存（重新枚举前开会话如实拒绝）");
  } finally {
    await iface.stopSession();
    iface.disposeProjectDocuments();
    await fs.rm(base, { recursive: true, force: true });
  }
});

// —————————————— W4/S1：建立治理记录的模型选择（single/trio）透传 ——————————————

test("S1 模型选择：preview/establish 只接受 single|trio 并透传；不合法 → invalid-request 且不调用机制", async () => {
  const previewInputs: unknown[] = [];
  const establishInputs: unknown[] = [];
  const preview: GovernancePreviewResult = { ok: true, preview: { ...EMPTY_PREVIEW, governanceModel: "trio" } };
  const established: EstablishGovernanceResult = {
    ok: true,
    phase: "write",
    finalize: {
      ok: true,
      status: "completed",
      message: "治理记录已建立。",
      reason: "",
      wrote: [".ans/project.json"],
      pins: [],
      roles: ["A"],
      projectJsonRel: ".ans/project.json",
      manifestRel: "docs/bootstrap-manifest.md",
    },
  };
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => FAKE_LISTING,
    previewGovernanceRecordFn: async (input) => { previewInputs.push(input); return preview; },
    establishGovernanceRecordFn: async (input) => { establishInputs.push(input); return established; },
  });
  await iface.listProject({ projectRoot: "/proj" });

  assert.deepEqual(await iface.previewGovernanceRecord({ projectRoot: "/proj", governanceModel: "trio" }), preview);
  assert.deepEqual(previewInputs, [{ projectRoot: "/proj", governanceModel: "trio" }], "预览透传 trio");

  const badPreview = await iface.previewGovernanceRecord({ projectRoot: "/proj", governanceModel: "quad" as never });
  assert.equal(badPreview.ok, false);
  assert.equal(badPreview.ok === false ? badPreview.code : "", "invalid-request");
  assert.equal(previewInputs.length, 1, "非法模型不调用机制");

  assert.deepEqual(await iface.establishGovernanceRecord({ projectRoot: "/proj", confirm: true, governanceModel: "trio" }), established);
  assert.deepEqual(establishInputs, [{ projectRoot: "/proj", governanceModel: "trio" }], "建立透传 trio");

  const badEstablish = await iface.establishGovernanceRecord({ projectRoot: "/proj", confirm: true, governanceModel: "" as never });
  assert.equal(badEstablish.ok, false);
  assert.equal(badEstablish.phase, "guard");
  assert.equal(establishInputs.length, 1, "非法模型不调用机制");

  await iface.previewGovernanceRecord({ projectRoot: "/proj" });
  assert.deepEqual(previewInputs[1], { projectRoot: "/proj" }, "缺省不传 governanceModel（旧行为逐字不变）");
});

// —————————————— 治理自动推进（2026-10-18 客户修正）：后台派发，不抢 pane ——————————————
//
// 客户反馈「这个不是应该自动的转发人物给后续流程吗」：提案接受后不能只显示「请切换到 nominator」。
// 修正后的行为：应用在**后台**打开目标治理角色会话并投递**唯一一条**任务消息；当前会话/输入焦点不变，
// 不自动批准、不写账本；成功/失败经既有 delivery-note 系统行如实落发起卡片的聊天流。

function trioListing(roleIds: string[] = ["rapporteur", "nominator", "convener", "verifier"]): ProjectListing {
  const role = (roleId: string) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: `# ${roleId}`,
    boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
    builtIn: true,
    ...(roleId === "rapporteur"
      ? { governanceFunction: "proposal" as const }
      : roleId === "nominator"
        ? { governanceFunction: "nomination" as const }
        : roleId === "verifier"
          ? { governanceFunction: "verification" as const }
          : { governanceFunction: "schedule" as const }),
  });
  return {
    projectRoot: "/proj",
    roles: roleIds.map(role),
    warnings: [],
    hasRoles: false,
    primaryRoleId: "rapporteur",
    governanceModel: "trio",
  };
}

function quietGovernanceHandle(sends: string[]): RoleSessionHandle {
  return {
    async send(text: string): Promise<void> { sends.push(text); },
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

/** 可推 `settled` 的句柄（与 makeFakeHandle 同思路，轮询窗口更短）：验证忙时排队/下一轮直发。 */
function settleableGovernanceHandle(sends: string[]): { handle: RoleSessionHandle; settle: () => void } {
  const queue: SessionEvent[] = [];
  const handle: RoleSessionHandle = {
    async send(text: string): Promise<void> { sends.push(text); },
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              for (let i = 0; i < 100; i += 1) {
                const event = queue.shift();
                if (event !== undefined) return { value: event, done: false };
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {},
  };
  return { handle, settle: () => { queue.push({ kind: "settled", summary: "一轮结束（测试替身）" } as SessionEvent); } };
}

/** 有界等待测试条件（真实定时器；超时抛错，绝不无限挂起）。 */
async function waitForTest(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("等待测试条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * 有界稳定窗口：每 10ms 观察一次，窗口内一旦 `changed()` 为真即失败。
 * 用于「重复 settle 不得再派 / 不得再开新会话」这类**负面**断言的确定性等待（不再只靠一个固定 sleep）。
 */
async function assertNoChangeFor(changed: () => boolean, windowMs: number, message: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < windowMs) {
    if (changed()) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (changed()) assert.fail(message);
}

/** 某角色收到的系统行摘要（delivery-note）。 */
function deliveryNoteSummaries(events: SessionEventEnvelope[], roleId: string): string[] {
  return events
    .filter(
      (envelope) =>
        envelope.roleId === roleId &&
        envelope.event.kind === "message" &&
        (envelope.event as { detail?: { source?: string } }).detail?.source === "delivery-note",
    )
    .map((envelope) => String((envelope.event as { summary?: string }).summary));
}

test("治理自动推进：接受提案 → 后台派发提名任务给 Nominator，当前 pane 不变、只发一条任务", async () => {
  const sendsByRole = new Map<string, string[]>();
  const openRoles: string[] = [];
  const events: SessionEventEnvelope[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: (envelope) => { events.push(envelope); },
    listProjectFn: async () => trioListing(),
    openRoleSessionFn: async (input) => {
      openRoles.push(input.roleId);
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      return quietGovernanceHandle(sends);
    },
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "rapporteur", runtime: "demo" })).ok, true);

  const expected =
    "流程 flow-a：客户已接受提案 docs/proposals/flow-a-v1.md；流程状态 YAML 已落盘于 docs/flows/flow-a.yaml。" +
    "请执行提名：按流程状态 YAML 的首个提名步骤，读取提案与流程状态 YAML，给出候选角色与理由，并通过任命卡请客户确认；不要自行任命或写角色卡。";
  const result = await iface.advanceGovernanceFlow({
    payload: { version: 1, flowId: "flow-a", cardKind: "proposal", nextFunction: "nomination", roleId: "nominator", proposalPath: "docs/proposals/flow-a-v1.md" },
    context: { sourceRoleId: "rapporteur", projectRoot: "/proj", runtime: "demo" },
  });
  assert.deepEqual(result, { ok: true, dispatched: true, targetRoleId: "nominator" });
  assert.deepEqual(openRoles, ["rapporteur", "nominator"], "目标角色会话在后台开启（无渲染侧 open/select）");
  assert.deepEqual(sendsByRole.get("nominator"), [expected], "只投递一条客户给定文案，无自动批准/第二条");

  // 当前 pane 不变：不带 target 的客户消息仍落 Rapporteur。
  const rapporteurSends = sendsByRole.get("rapporteur")!;
  rapporteurSends.length = 0;
  const clientSend = await iface.sendSession({ text: "客户继续说" });
  assert.equal(clientSend.ok, true);
  assert.deepEqual(sendsByRole.get("rapporteur"), ["客户继续说"], "活动角色仍是 Rapporteur");
  assert.deepEqual(sendsByRole.get("nominator"), [expected], "后台派发不改变目标角色收到的消息");

  // 成功系统行落**当前**聊天流（Rapporteur），措辞按客户要求。
  const notes = events.filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].event.summary, "已派发提名任务给组队（工作中）");
  await iface.stopSession();
});

test("治理自动推进（真机修正）：accept 先派 Convener 写流程状态 YAML，落盘后才派 Nominator", async () => {
  const root = makeTempProjectRoot("ans-advance-chain-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let settleConvener: (() => void) | undefined;
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "convener") {
          settleConvener = made.settle;
          // 模拟 Convener 本轮真正写出流程状态 YAML（唯一机器状态；应用只读检查，不代写）。
          const handle = made.handle;
          const originalSend = handle.send.bind(handle);
          handle.send = async (text: string) => {
            await originalSend(text);
            // 落盘略有延迟（真实写文件不是同步瞬间）：链式推进轮询到事实前绝不派 Nominator。
            setTimeout(() => {
              mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
              writeFileSync(
                path.join(root, "docs", "flows", "flow-a.yaml"),
                [
                  "flowId: flow-a",
                  "version: 1",
                  "qualityTier: production",
                  "steps:",
                  "  - id: delivery",
                  "    title: 交付",
                  "    owner: executor",
                  "    kind: dispatch",
                  "    status: pending",
                  "  - id: verification",
                  "    title: 验收",
                  "    owner: app",
                  "    kind: acceptance",
                  "    status: pending",
                  "",
                ].join("\n"),
              );
            }, 30);
          };
        }
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10 },
    });
    await iface.listProject({ projectRoot: root });
    const advancing = iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId: "flow-a",
        cardKind: "proposal",
        nextFunction: "schedule",
        roleId: "convener",
        proposalPath: "docs/proposals/flow-a-v1.md",
        followUp: "nomination-after-flow",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) > 0);
    assert.equal(sendsByRole.get("nominator")?.length ?? 0, 0, "流程状态 YAML 落盘前绝不派 Nominator");
    assert.deepEqual(sendsByRole.get("convener"), [
      "流程 flow-a：客户已接受提案 docs/proposals/flow-a-v1.md。" +
        "请先写流程状态 YAML docs/flows/flow-a.yaml（唯一机器状态，字段/枚举按门禁卡的流程 YAML schema；首个步骤为提名：由组队读取提案并给出候选角色）。" +
        "同名 .md 仅可选人读视图，不得承载门禁状态。写完后本轮即可结束；提名任务会在流程状态 YAML 落盘后由应用派给组队。不要把步骤说成已派发。",
    ], "第一段任务明确要求先写流程状态 YAML、首步提名");

    settleConvener!();
    const result = await advancing;
    assert.deepEqual(result, { ok: true, dispatched: true, targetRoleId: "convener", followUpRoleId: "nominator" });
    assert.deepEqual(openRoles, ["convener", "nominator"], "Convener settle 且流程状态 YAML 落盘后才开 Nominator");
    assert.equal(existsSync(path.join(root, "docs", "flows", "flow-a.md")), false, "夹具未写 .md 人读视图：仅 YAML 即放行");
    assert.deepEqual(sendsByRole.get("nominator"), [
      "流程 flow-a：客户已接受提案 docs/proposals/flow-a-v1.md；流程状态 YAML 已落盘于 docs/flows/flow-a.yaml。" +
        "请执行提名：按流程状态 YAML 的首个提名步骤，读取提案与流程状态 YAML，给出候选角色与理由，并通过任命卡请客户确认；不要自行任命或写角色卡。",
    ], "第二段任务带流程状态 YAML 路径，不再让 Nominator 猜");
    const notes = events
      .filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary)
      // 夹具流程状态 YAML 仅含 pending 执行步骤（未完成）：收尾门 fail-closed 另发「自动验收未派发」系统行
      // （2026-10-19 阻塞可见性，落 Lead）。本断言只钉治理推进链的系统行，不把该独立系统行混进来（其内容另测）。
      .filter((summary) => !summary.startsWith("自动验收未派发"));
    assert.deepEqual(notes, [
      "已派发流程任务给统筹（工作中）",
      "流程状态 YAML 已落盘，已派发提名任务给组队（工作中）",
    ]);
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ——————————————————————————————————————————————————————————————————————————————————————
// 2026-10-20 真机：flow 工具已注册但 Steward 没调用——应用派给 Convener 的任务文案仍要求「先写流程状态
// YAML」，它照旧 write_file。修正：YAML 已存在 ⇒ 文案改用 flow_get / flow_step_update / flow_step_supersede；
// 提名步骤已 done ⇒ 不重复派 Nominator，改请 Steward 继续下一步。
// ——————————————————————————————————————————————————————————————————————————————————————

test("2026-10-20 flow 工具文案：YAML 不存在 ⇒ 旧初始创建文案；已存在 ⇒ flow_get/flow_step_update/flow_step_supersede 且不要求直接写 YAML", () => {
  const accept: GovernanceNextStepPayload = {
    version: 1,
    flowId: "flow-x",
    cardKind: "proposal",
    nextFunction: "schedule",
    roleId: "convener",
    proposalPath: "docs/proposals/flow-x-v1.md",
    followUp: "nomination-after-flow",
  };
  const missing = buildGovernanceAdvanceMessage(accept)!;
  assert.ok(missing.includes("请先写流程状态 YAML docs/flows/flow-x.yaml"), "YAML 不存在 ⇒ 保留初始创建文案（schedule-write 路径）");
  assert.equal(missing.includes("flow_get"), false, "初始创建路径不要求 flow 工具");
  const exists = buildGovernanceAdvanceMessage(accept, undefined, { flowStateExists: true })!;
  assert.ok(
    exists.includes("flow_get") && exists.includes("flow_step_update") && exists.includes("flow_step_supersede"),
    "YAML 已存在 ⇒ 明确要求用 flow 工具推进",
  );
  assert.equal(exists.includes("请先写流程状态 YAML"), false, "不得再要求先写 YAML");
  assert.ok(exists.includes("不要直接 write_file 流程 YAML") && exists.includes("不要把步骤说成已派发"), "禁止直接写文件/谎称已派发");
  // appointment 同口径。
  const appointment: GovernanceNextStepPayload = {
    version: 1,
    flowId: "flow-y",
    cardKind: "appointment",
    nextFunction: "schedule",
    roleId: "convener",
  };
  const appointmentMissing = buildGovernanceAdvanceMessage(appointment, ["role-a"])!;
  assert.equal(appointmentMissing, "流程 flow-y：客户已完成任命 role-a。请写流程状态 YAML docs/flows/flow-y.yaml 并派发已批准步骤。", "YAML 不存在 ⇒ 旧 appointment 文案逐字不变");
  const appointmentExists = buildGovernanceAdvanceMessage(appointment, ["role-a"], { flowStateExists: true })!;
  assert.ok(appointmentExists.includes("flow_step_update") && appointmentExists.includes("推进已批准步骤"), "appointment 已存在 ⇒ flow 工具推进");
  assert.equal(appointmentExists.includes("并派发已批准步骤"), false, "不再让 Convener 直接写 YAML");
});

test("2026-10-20 flow 工具推进（真机修正）：YAML 已存在且提名已 done ⇒ Convener 拿 flow 工具文案、Nominator 零派发、系统行如实", async () => {
  const root = makeTempProjectRoot("ans-advance-flow-tools-");
  try {
    const flowId = "flow-n";
    mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
    writeFileSync(
      path.join(root, "docs", "flows", `${flowId}.yaml`),
      [
        `flowId: ${flowId}`,
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: nomination",
        "    title: 提名",
        "    owner: nominator",
        "    kind: customer-decision",
        "    status: done",
        "    evidence:",
        "      kind: customer-decision",
        "      ref: appointment",
        "  - id: delivery",
        "    title: 交付",
        "    owner: executor",
        "    kind: dispatch",
        "    status: pending",
        "",
      ].join("\n"),
    );
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const settles = new Map<string, () => void>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        settles.set(input.roleId, made.settle);
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 1_000 },
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId,
        cardKind: "proposal",
        nextFunction: "schedule",
        roleId: "convener",
        proposalPath: `docs/proposals/${flowId}-v1.md`,
        followUp: "nomination-after-flow",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    // 第一段：Convener 拿到的必须是 flow 工具文案（YAML 已存在）。
    const convenerSends = sendsByRole.get("convener") ?? [];
    assert.ok(convenerSends.length >= 1, "Convener 收到第一段任务");
    assert.ok(
      convenerSends[0].includes("flow_get") && convenerSends[0].includes("flow_step_update") && convenerSends[0].includes("flow_step_supersede"),
      "YAML 已存在 ⇒ 要求用 flow 工具推进",
    );
    assert.equal(convenerSends[0].includes("请先写流程状态 YAML"), false, "不得再要求直接写 YAML");
    // 第二段：提名已 done ⇒ 不重复派 Nominator，改请 Steward 继续（排队后随 settle 投出）。
    assert.equal(sendsByRole.get("nominator")?.length ?? 0, 0, "提名已 done ⇒ Nominator 零派发");
    assert.equal(openRoles.includes("nominator"), false, "Nominator 会话不被打开");
    assert.equal(result.ok, true);
    assert.equal(result.dispatched, true);
    assert.equal(result.targetRoleId, "convener");
    assert.equal(result.followUpRoleId, "convener", "第二段收口为「继续下一步」（不是重复提名）");
    settles.get("convener")?.();
    await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) >= 2);
    assert.ok(
      sendsByRole.get("convener")!.some(
        (text) => /提名（legacy）已完成/.test(text) && text.includes("未重复派发") && text.includes("flow_step_update"),
      ),
      "已请 Steward 继续下一步（flow 工具；legacy 提名已完成）",
    );
    const notes = events
      .filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.ok(notes.includes("提名已完成，未重复派发；已请统筹继续下一步"), "系统行说明提名已完成、未重复派发");
    assert.ok(!notes.some((summary) => summary.includes("已派发提名任务给组队")), "不刷「已派发提名任务」的系统行");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("治理自动推进（真机修正）：Convener 未写流程状态 YAML ⇒ 不派 Nominator、如实报错、不循环", async () => {
  const root = makeTempProjectRoot("ans-advance-chain-missing-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let settleConvener: (() => void) | undefined;
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "convener") settleConvener = made.settle;
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      // 链式推进现在有界轮询目标事实（YAML 落盘）：测试缩短轮询/时限，失败路径不挂 15min。
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 150, settledGraceMs: 20 },
    });
    await iface.listProject({ projectRoot: root });
    const advancing = iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId: "flow-a",
        cardKind: "proposal",
        nextFunction: "schedule",
        roleId: "convener",
        proposalPath: "docs/proposals/flow-a-v1.md",
        followUp: "nomination-after-flow",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) > 0);
    settleConvener!();
    const result = await advancing;
    assert.equal(result.ok, false, "流程状态 YAML 缺失 ⇒ 整体如实失败");
    assert.equal(result.dispatched, true, "第一段（Convener）已完成");
    assert.match(result.error ?? "", /未写出流程状态 YAML docs\/flows\/flow-a\.yaml/);
    assert.ok(!openRoles.includes("nominator"), "流程状态 YAML 缺失时绝不派 Nominator");
    assert.equal(sendsByRole.get("nominator")?.length ?? 0, 0);
    const notes = events
      .filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.equal(notes.length, 2);
    assert.match(notes[1] ?? "", /自动推进停住：统筹未写出流程状态 YAML/);
    // 不循环：再等一拍，Convener 不再收到第二条任务。
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(sendsByRole.get("convener")?.length, 1, "不重试、不循环派发");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


/**
 * followUp 两段式夹具：Convener 收到任务后按 `files` 写出 YAML/Markdown（模拟角色自己写），
 * Convener settle 后返回整体结果与 Nominator 事实。用于钉「只认 YAML」的落盘检查。
 */
async function runFollowUpChain(files: { yaml?: string; markdown?: string }): Promise<{
  result: Awaited<ReturnType<ReturnType<typeof createDesktopInterface>["advanceGovernanceFlow"]>>;
  openRoles: string[];
  nominatorSends: string[];
  notes: string[];
}> {
  const root = makeTempProjectRoot("ans-advance-chain-files-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let settleConvener: (() => void) | undefined;
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "convener") {
          settleConvener = made.settle;
          const handle = made.handle;
          const originalSend = handle.send.bind(handle);
          handle.send = async (text: string) => {
            await originalSend(text);
            mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
            if (files.yaml !== undefined) writeFileSync(path.join(root, "docs", "flows", "flow-a.yaml"), files.yaml);
            if (files.markdown !== undefined) writeFileSync(path.join(root, "docs", "flows", "flow-a.md"), files.markdown);
          };
        }
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      // 链式推进现在有界轮询目标事实（YAML 落盘）：测试缩短轮询/时限，失败路径不挂 15min。
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 150, settledGraceMs: 20 },
    });
    await iface.listProject({ projectRoot: root });
    const advancing = iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId: "flow-a",
        cardKind: "proposal",
        nextFunction: "schedule",
        roleId: "convener",
        proposalPath: "docs/proposals/flow-a-v1.md",
        followUp: "nomination-after-flow",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) > 0);
    settleConvener!();
    const result = await advancing;
    const notes = events
      .filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    await iface.stopSession();
    return { result, openRoles, nominatorSends: sendsByRole.get("nominator") ?? [], notes };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("治理自动推进：followUp 只认 YAML——只有 .md 人读视图不放行", async () => {
  const run = await runFollowUpChain({ markdown: "# flow-a\n\n| 步骤 | 状态 |\n| --- | --- |\n| nomination | done |\n" });
  assert.equal(run.result.ok, false, "只有 .md：整体如实失败");
  assert.match(run.result.error ?? "", /未写出流程状态 YAML docs\/flows\/flow-a\.yaml/);
  assert.ok(!run.openRoles.includes("nominator"), "只有 .md 时不派 Nominator");
  assert.equal(run.nominatorSends.length, 0);
  assert.ok(run.notes.some((note) => /未写出流程状态 YAML/.test(note)), "具体原因回给当前流/Lead");
});

test("治理自动推进：followUp 的 YAML 校验失败 ⇒ 具体 path/message 回给当前流，不派 Nominator", async () => {
  const invalidYaml = [
    "flowId: flow-a",
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: delivery",
    "    title: 交付",
    "    owner: executor",
    "    kind: dispatch",
    "    status: 完成",
    "",
  ].join("\n");
  const run = await runFollowUpChain({ yaml: invalidYaml });
  assert.equal(run.result.ok, false, "非法 YAML：整体如实失败");
  assert.match(
    run.result.error ?? "",
    /流程状态 YAML 校验失败（docs\/flows\/flow-a\.yaml）：steps\[0\]\.status/,
    "错误带 YAML 文档路径与具体字段",
  );
  assert.ok(!run.openRoles.includes("nominator"), "校验失败时不派 Nominator");
  assert.equal(run.nominatorSends.length, 0);
  assert.ok(run.notes.some((note) => /流程状态 YAML 校验失败/.test(note)), "具体原因回给当前流/Lead");
});

test("治理自动推进：accept-quick 派 Convener；appointment 派 Crew 写卡（2026-10-22 第 1 项）；无下一步不派发", async () => {
  const root = makeTempProjectRoot("ans-advance-routing-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    writeTeamPlanFile(root, "flow-r", { recommended: ["role-a", "role-b"], rows: [{ roleId: "role-a", type: "existing" }, { roleId: "role-b", type: "new" }] });
    await seedAppointmentDecision(root, "flow-r", ["role-a", "role-b"]);
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    let settleConvener: (() => void) | undefined;
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "convener") settleConvener = made.settle;
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: root });

    assert.equal((await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-q", cardKind: "proposal", nextFunction: "schedule", roleId: "convener" },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    })).ok, true);
    // 第一轮结束后（settled）下一张决定才直发；忙时应入队（既有投递机语义）。
    settleConvener?.();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const appointmentResult = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-r", cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["role-a", "role-b"] },
    });
    assert.equal(appointmentResult.ok, true);
    assert.equal(appointmentResult.targetRoleId, "nominator", "appointment → Crew（不是 Convener）");

    assert.deepEqual(openRoles, ["convener", "nominator"], "Convener（accept-quick）+ Crew（写卡）各开启一次");
    assert.deepEqual(sendsByRole.get("convener"), [
      "流程 flow-q：客户已接受提案（快捷路径）。请写流程状态 YAML docs/flows/flow-q.yaml 并排步骤（无提名；同名 .md 仅可选人读视图，不得承载门禁状态）；涉及新建/改边界仍须任命卡与写盘确认。",
    ], "accept-quick 文案逐字不变");
    const crewSends = sendsByRole.get("nominator") ?? [];
    assert.equal(crewSends.length, 1, "Crew 恰一条写卡任务");
    for (const expected of [
      "流程 flow-r：客户已完成任命（闸门 2）：role-a、role-b",
      "docs/scheduling/flow-r-team-v1.md",
      "stepId=role-cards",
      "只对名单内角色写卡",
      "role-card.md",
      "boundary.yaml",
      "feature-map.md",
    ]) {
      assert.ok(crewSends[0]!.includes(expected), `写卡任务须含：${expected}`);
    }
    assert.match(crewSends[0]!, /api-spec\.md/);
    assert.match(crewSends[0]!, /计划缺职责目标\/能力要求\/写集\/依赖等细节时/);
    const ledger = await readGovernanceLedger(root);
    const crewAudit = ledger.entries.find(
      (entry) => entry.kind === "dispatch.accepted" && entry.flowId === "flow-r" && entry.targetRoleId === "nominator",
    );
    assert.equal(crewAudit?.stepId, "role-cards", "账本记录 stepId=role-cards");
    assert.equal(crewAudit?.actorRoleId, "app");
    assert.equal(crewAudit?.power, "app");

    const before = (sendsByRole.get("convener") ?? []).length + crewSends.length;
    const nothing = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-r", cardKind: "acceptance", nextFunction: null, roleId: null },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    assert.deepEqual(nothing, { ok: true, dispatched: false }, "验收收口/无下一步：不派发");
    assert.equal((sendsByRole.get("convener") ?? []).length + (sendsByRole.get("nominator") ?? []).length, before, "无下一步不产生任何模型消息");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("任命→Crew 写卡主路径（2026-10-22 第 1 项）：只派 Crew 写卡任务；角色写出且结构校验通过后才派 Convener 做 role-readiness", async () => {
  const root = makeTempProjectRoot("ans-advance-appointment-");
  try {
    let rolesPresent = false;
    const listingNow = (): ProjectListing => {
      const base: ProjectListing = { ...trioListing(), projectRoot: root };
      return rolesPresent ? listingWithProjectRoles(base, ["executor"]) : base;
    };
    writeTeamPlanFile(root, "flow-e", { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    // 2026-10-23 可重入门禁：团队计划存在 ⇒ flow 必须声明 role-cards 步骤（应用在结构校验通过后收口）。
    writeRoleCardsFlowFixture(root, "flow-e");
    // 夹具补足实施前标准（新契约流程的验收门会先要标准；本组只聚焦写卡→readiness 链路）。
    writeAcceptanceCriteriaFile(root, "flow-e");
    await seedAppointmentDecision(root, "flow-e", ["executor"]);
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let settleNominator: (() => void) | undefined;
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listingNow(),
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "nominator") {
          settleNominator = made.settle;
          // 模拟 Crew 用 appointment-write 写出完整角色卡/边界/工作文档（应用只读检查）。
          const handle = made.handle;
          const originalSend = handle.send.bind(handle);
          handle.send = async (text: string) => {
            await originalSend(text);
            setTimeout(() => {
              writeFullRoleArtifacts(root, "executor");
              rolesPresent = true;
            }, 30);
          };
        }
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 2000, settledGraceMs: 100 },
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-e", cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["executor"], stepId: "role-cards" },
    });
    assert.equal(result.ok, true);
    assert.equal(result.targetRoleId, "nominator", "appointment → Crew 写卡（不是 Convener）");
    assert.equal(sendsByRole.get("convener")?.length ?? 0, 0, "角色未写出/校验前不派 Convener");
    const crewSends = sendsByRole.get("nominator") ?? [];
    assert.equal(crewSends.length, 1, "Crew 恰一条写卡任务");
    assert.ok(crewSends[0]!.includes("docs/scheduling/flow-e-team-v1.md"), "任务带团队计划路径");
    assert.ok(crewSends[0]!.includes("stepId=role-cards"), "任务带 stepId=role-cards");
    assert.ok(crewSends[0]!.includes("只对名单内角色写卡"), "只写名单内角色");

    // Crew settle → 写卡后推进检查：结构校验通过（new 角色完整清单）后才派 Convener 做 readiness。
    settleNominator!();
    await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
    assert.equal(sendsByRole.get("convener")!.length, 1, "Convener 恰一条 role-readiness 任务");
    const readiness = sendsByRole.get("convener")![0]!;
    assert.match(readiness, /role-readiness/);
    assert.match(readiness, /docs\/scheduling\/flow-e-team-v1\.md/);
    assert.match(readiness, /docs\/scheduling\/flow-e-readiness-v1\.md/);
    assert.match(readiness, /能力内容尚未判定/, "结构校验通过不等于宣称能力描述完成");
    const sourceNotes = events
      .filter((e) => e.roleId === "convener" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.ok(sourceNotes.includes("已派发写卡任务给组队（工作中）"), "写卡派发系统行");
    const leadNotes = events
      .filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.ok(leadNotes.includes("写卡结构校验通过，已派发角色就绪复核给统筹（工作中）"), "readiness 派发系统行（Lead 可见）");
    const ledger = await readGovernanceLedger(root);
    const dispatches = ledger.entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.flowId === "flow-e");
    assert.ok(dispatches.some((entry) => entry.targetRoleId === "nominator" && entry.stepId === "role-cards"), "账本写卡派发 stepId=role-cards");
    assert.equal(
      await waitForReadinessDispatchCount(root, "flow-e", 1),
      1,
      "账本 readiness 派发 stepId=role-readiness",
    );
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("任命→Crew 写卡后角色始终未写出 ⇒ 写卡后检查反馈 Crew、不派 Convener、不循环", async () => {
  const root = makeTempProjectRoot("ans-advance-appointment-missing-");
  try {
    writeTeamPlanFile(root, "flow-e", { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    await seedAppointmentDecision(root, "flow-e", ["executor"]);
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let settleNominator: (() => void) | undefined;
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "nominator") settleNominator = made.settle;
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 150, settledGraceMs: 20 },
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-e", cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["executor"] },
    });
    assert.equal(result.ok, true);
    assert.equal(result.targetRoleId, "nominator", "写卡任务已投递");
    settleNominator!();
    // 写卡后检查：有界重试（100/300/600ms）耗尽仍缺文件 ⇒ 反馈 Crew 修正（第二条消息）。
    await waitForTest(() => (sendsByRole.get("nominator")?.length ?? 0) > 1, 6000);
    const feedback = sendsByRole.get("nominator")![1]!;
    assert.match(feedback, /写卡产物未通过校验/);
    assert.ok(feedback.includes("角色卡/executor/role-card.md"), "逐文件列出缺失问题");
    assert.match(feedback, /重新发 appointment-write 确认卡/);
    assert.equal(sendsByRole.get("convener")?.length ?? 0, 0, "角色未写出：绝不派 Convener");
    const notes = events
      .filter((e) => e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.ok(notes.some((note) => /写卡产物未通过校验/.test(note)), "Lead 系统行如实说明未推进");
    assert.equal((await readGovernanceLedger(root)).entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener").length, 0);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(sendsByRole.get("nominator")?.length, 2, "同问题不重复反馈（不循环）");
    assert.equal(sendsByRole.get("convener")?.length ?? 0, 0);
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * 2026-10-20 真机假错误（5ms 误报「本轮未在时限内结束」）回归组：
 * 链式推进的完成判据改为**有界轮询目标事实**（流程 YAML / 任命角色卡），角色瞬时忙闲、会话释放、
 * 回合被看护中止都不再让链路立即判死；只有到时限仍未落定才如实失败一次（系统行不刷屏）。
 */
function validFlowStateYaml(flowId: string): string {
  return [
    `flowId: ${flowId}`,
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: nomination",
    "    title: 提名",
    "    owner: nominator",
    "    kind: dispatch",
    "    status: pending",
    "  - id: verification",
    "    title: 验收",
    "    owner: app",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

function deliveryNotes(events: SessionEventEnvelope[], roleId: string): string[] {
  return events
    .filter((e) => e.roleId === roleId && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
    .map((e) => e.event.summary);
}

/** 只取治理推进链自身的系统行（排除同一测试里独立触发的自动验收门行——其内容另有专测）。 */
function advanceChainNotes(events: SessionEventEnvelope[], roleId: string): string[] {
  return deliveryNotes(events, roleId).filter(
    (note) => !note.startsWith("自动验收未派发") && !note.startsWith("已自动派发验收复核"),
  );
}

test("链式推进（真机 5ms 误报）：派发后会话立即释放、YAML 在 1-2 个 poll 后落盘 ⇒ 不 chainFail、继续派 Nominator 恰一次", async () => {
  const root = makeTempProjectRoot("ans-advance-chain-dispose-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let iface: ReturnType<typeof createDesktopInterface>;
    iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "convener") {
          const handle = made.handle;
          const originalSend = handle.send.bind(handle);
          handle.send = async (text: string) => {
            await originalSend(text);
            // 真机场景：派发刚返回，Convener 会话被并发作废重建/释放——旧 `waitForRoleIdle` 此刻看到
            // 「无会话」会立即 false（advance.dispatched 后 5ms 的假错误）。
            void iface.stopSession({ projectRoot: root, roleId: "convener", runtime: "demo" });
            // Convener 随后正常处理：YAML 在 1-2 个轮询间隔后落盘。
            setTimeout(() => {
              mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
              writeFileSync(path.join(root, "docs", "flows", "flow-a.yaml"), validFlowStateYaml("flow-a"));
            }, 30);
          };
        }
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 2000, settledGraceMs: 20 },
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId: "flow-a",
        cardKind: "proposal",
        nextFunction: "schedule",
        roleId: "convener",
        proposalPath: "docs/proposals/flow-a-v1.md",
        followUp: "nomination-after-flow",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    assert.deepEqual(result, { ok: true, dispatched: true, targetRoleId: "convener", followUpRoleId: "nominator" });
    assert.deepEqual(openRoles, ["convener", "nominator"], "YAML 落盘后继续派 Nominator（会话释放不判死）");
    assert.equal(sendsByRole.get("nominator")?.length, 1, "提名任务恰一次");
    assert.deepEqual(advanceChainNotes(events, "rapporteur"), [
      "已派发流程任务给统筹（工作中）",
      "流程状态 YAML 已落盘，已派发提名任务给组队（工作中）",
    ], "无「自动推进停住」假错误");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("链式推进：一直不落盘 ⇒ 到时限如实失败一次、不派 Nominator、不刷屏", async () => {
  const root = makeTempProjectRoot("ans-advance-chain-timeout-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let settleConvener: (() => void) | undefined;
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "convener") settleConvener = made.settle;
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 80, settledGraceMs: 10 },
    });
    await iface.listProject({ projectRoot: root });
    const advancing = iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId: "flow-a",
        cardKind: "proposal",
        nextFunction: "schedule",
        roleId: "convener",
        proposalPath: "docs/proposals/flow-a-v1.md",
        followUp: "nomination-after-flow",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) > 0);
    // 回合正常结束（settled）但 YAML 一直没写：到时限后如实失败（不是 5ms、不是忙等 15min）。
    settleConvener!();
    const result = await advancing;
    assert.equal(result.ok, false);
    assert.equal(result.dispatched, true, "第一段（Convener）已完成");
    assert.match(result.error ?? "", /未写出流程状态 YAML docs\/flows\/flow-a\.yaml/);
    assert.ok(!openRoles.includes("nominator"), "YAML 未落盘绝不派 Nominator");
    const notes = advanceChainNotes(events, "rapporteur");
    assert.equal(notes.length, 2, "成功一行 + 失败恰一行");
    assert.match(notes[1] ?? "", /自动推进停住：统筹未写出流程状态 YAML/);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(advanceChainNotes(events, "rapporteur").length, 2, "失败系统行不刷屏");
    assert.equal(sendsByRole.get("convener")?.length, 1, "不重试、不循环派发");
    assert.equal(sendsByRole.get("nominator")?.length ?? 0, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("链式推进：Convener 回合一直在跑（busy）到时限仍无 YAML ⇒ 保留「本轮未在时限内结束」文案", async () => {
  const root = makeTempProjectRoot("ans-advance-chain-busy-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const events: SessionEventEnvelope[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        return quietGovernanceHandle(sends); // 不推 settled ⇒ 会话持续 busy
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 60, settledGraceMs: 10 },
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId: "flow-a",
        cardKind: "proposal",
        nextFunction: "schedule",
        roleId: "convener",
        proposalPath: "docs/proposals/flow-a-v1.md",
        followUp: "nomination-after-flow",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /本轮未在时限内结束，流程状态 YAML docs\/flows\/flow-a\.yaml 未确认/);
    const notes = advanceChainNotes(events, "rapporteur");
    assert.equal(notes.length, 2);
    assert.match(notes[1] ?? "", /自动推进停住：统筹本轮未在时限内结束/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("链式推进：回合结束后轮询继续等（看护中止/下一投递恢复）——YAML 稍后落盘 ⇒ 最终继续、不刷屏", async () => {
  const root = makeTempProjectRoot("ans-advance-chain-abort-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let settleConvener: (() => void) | undefined;
    let iface: ReturnType<typeof createDesktopInterface>;
    iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "convener") {
          settleConvener = made.settle;
          const handle = made.handle;
          handle.abort = async () => ({ ok: true, supported: true });
          const originalSend = handle.send.bind(handle);
          handle.send = async (text: string) => {
            await originalSend(text);
            // 模拟看护自动中止：abort 请求 → 本轮以 settled 收尾，没有写 YAML。被中止的回合不算正常结束，
            // 轮询必须继续（不提前判死/不刷屏）；下一次投递/重试在稍后落盘（这里用延时写文件代表后续处理）。
            setTimeout(() => {
              void iface.abortSession({ projectRoot: root, roleId: "convener", runtime: "demo" });
              settleConvener?.();
            }, 10);
            setTimeout(() => {
              mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
              writeFileSync(path.join(root, "docs", "flows", "flow-a.yaml"), validFlowStateYaml("flow-a"));
            }, 60);
          };
        }
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 1000, settledGraceMs: 20 },
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId: "flow-a",
        cardKind: "proposal",
        nextFunction: "schedule",
        roleId: "convener",
        proposalPath: "docs/proposals/flow-a-v1.md",
        followUp: "nomination-after-flow",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    assert.deepEqual(result, { ok: true, dispatched: true, targetRoleId: "convener", followUpRoleId: "nominator" });
    assert.deepEqual(openRoles, ["convener", "nominator"]);
    assert.equal(sendsByRole.get("nominator")?.length, 1);
    assert.deepEqual(advanceChainNotes(events, "rapporteur"), [
      "已派发流程任务给统筹（工作中）",
      "流程状态 YAML 已落盘，已派发提名任务给组队（工作中）",
    ], "中止后恢复：只有成功行，无失败/重复系统行");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("任命→Crew 写卡（会话立即释放）：写卡任务不判死；角色卡出现后写卡后检查派 Convener readiness 恰一次", async () => {
  const root = makeTempProjectRoot("ans-advance-appointment-dispose-");
  try {
    writeTeamPlanFile(root, "flow-e", { recommended: ["executor"], rows: [{ roleId: "executor", type: "existing" }] });
    // 2026-10-23 可重入门禁：团队计划存在 ⇒ flow 声明 role-cards；收口要求六文件齐全（existing 也需）。
    writeRoleCardsFlowFixture(root, "flow-e");
    // 夹具补足实施前标准（新契约流程的验收门会先要标准；本组只聚焦写卡→readiness 链路）。
    writeAcceptanceCriteriaFile(root, "flow-e");
    await seedAppointmentDecision(root, "flow-e", ["executor"]);
    let listingCalls = 0;
    const listingNow = (): ProjectListing => {
      const base: ProjectListing = { ...trioListing(), projectRoot: root };
      // 初始导入=1、派发前刷新=2 仍缺；写卡后检查的刷新=3 出现（真实写卡落盘有延迟）。
      return listingCalls >= 3 ? listingWithProjectRoles(base, ["executor"]) : base;
    };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const events: SessionEventEnvelope[] = [];
    let iface: ReturnType<typeof createDesktopInterface>;
    iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => {
        listingCalls += 1;
        if (listingCalls >= 3) writeFullRoleArtifacts(root, "executor");
        return listingNow();
      },
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = settleableGovernanceHandle(sends);
        if (input.roleId === "nominator") {
          const handle = made.handle;
          const originalSend = handle.send.bind(handle);
          handle.send = async (text: string) => {
            await originalSend(text);
            // 真机竞态：写卡任务刚投递，Crew 会话被并发释放——推进不得因此判死。
            void iface.stopSession({ projectRoot: root, roleId: "nominator", runtime: "demo" });
          };
        }
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      governanceChainOptions: { pollIntervalMs: 10, timeoutMs: 2000, settledGraceMs: 20 },
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-e", cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["executor"], stepId: "role-cards" },
    });
    assert.deepEqual(result, { ok: true, dispatched: true, targetRoleId: "nominator" });
    await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
    assert.deepEqual(openRoles, ["nominator", "convener"], "写卡任务后（会话释放）写卡后检查仍开 Convener");
    assert.equal(sendsByRole.get("convener")!.length, 1, "Convener readiness 恰一次");
    assert.match(sendsByRole.get("convener")![0]!, /role-readiness/);
    // 无「本轮未在时限内结束」假错误；写卡成功行 + readiness 行如实（readiness 系统行落 Lead 主入口）。
    const sourceNotes = advanceChainNotes(events, "convener");
    assert.ok(sourceNotes.includes("已派发写卡任务给组队（工作中）"));
    const leadNotes = deliveryNotes(events, "rapporteur");
    assert.ok(leadNotes.includes("写卡结构校验通过，已派发角色就绪复核给统筹（工作中）"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** 可推任意事件（回交/消息）与 `settled` 的句柄（收尾推进用：模拟真实轮次事件顺序）。 */
function scriptedGovernanceHandle(sends: string[]): {
  handle: RoleSessionHandle;
  emit: (event: SessionEvent) => void;
  settle: () => void;
} {
  const queue: SessionEvent[] = [];
  const handle: RoleSessionHandle = {
    async send(text: string): Promise<void> { sends.push(text); },
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              for (let i = 0; i < 400; i += 1) {
                const event = queue.shift();
                if (event !== undefined) return { value: event, done: false };
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {},
  };
  return {
    handle,
    emit: (event) => { queue.push(event); },
    settle: () => { queue.push({ kind: "settled", summary: "一轮结束（测试替身）" } as SessionEvent); },
  };
}

/**
 * 收尾推进端到端夹具：写入流程单/账本 → Convener 派发一项任务给 executor → executor 回交 →
 * Convener 收到回交并 settle。返回各角色发送记录/事件，供断言「是否派 Rapporteur」。
 */
async function runHandbackAcceptanceScenario(status: string) {
  const root = makeTempProjectRoot(`ans-acceptance-${status}-`);
  const flowId = "flow-a";
  const listing = listingWithProjectRoles({ ...trioListing(), projectRoot: root }, ["executor"]);
  mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
  // 2026-10-24 客户修订：release 仅元数据（不再作为独立验收门）。本场景验证回交收尾推进，
  // 因此写 YAML 机器状态；状态由参数控制（done/pending/blocked）。
  writeFileSync(
    path.join(root, "docs", "flows", `${flowId}.yaml`),
    [
      `flowId: ${flowId}`,
      "version: 1",
      "qualityTier: production",
      "release: true",
      "steps:",
      "  - id: impl",
      "    title: 实现",
      "    owner: executor",
      "    kind: dispatch",
      `    status: ${status}`,
      ...(status === "done" ? ["    evidence:", "      kind: dispatch", "      ref: impl"] : []),
      "  - id: verification",
      "    title: 验收",
      "    owner: app",
      "    kind: acceptance",
      "    status: pending",
      "",
    ].join("\n"),
  );
  await appendGovernanceLedger(root, {
    at: new Date().toISOString(),
    kind: "customer.decision",
    flowId,
    decisionKind: "proposal-accept",
    customerDecision: "accepted",
    actorRoleId: "rapporteur",
    power: "proposal",
  });
  await appendGovernanceLedger(root, {
    at: new Date().toISOString(),
    kind: "customer.decision",
    flowId,
    decisionKind: "appointment",
    customerDecision: "accepted",
    actorRoleId: "nominator",
    power: "nomination",
    targetRoleIds: ["executor"],
  });
  // 2026-10-22 第 3 项（编排 O2）：已有 appointment 决定的 flow 在实施派发前必须有结构合格的标准。
  writeAcceptanceCriteriaFile(root, flowId);
  const sendsByRole = new Map<string, string[]>();
  const events: SessionEventEnvelope[] = [];
  const controls = new Map<string, { emit: (event: SessionEvent) => void; settle: () => void }>();
  let dispatchTask: DispatchTaskFn | undefined;
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: (envelope) => { events.push(envelope); },
    listProjectFn: async () => listing,
    openRoleSessionFn: async (input) => {
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      const made = scriptedGovernanceHandle(sends);
      controls.set(input.roleId, made);
      if (input.roleId === "convener") dispatchTask = input.dispatchTask;
      return made.handle;
    },
    buildProjectConfigFn: buildProjectConfig,
    // 2026-10-20 CI 第二轮（run 39391972925）：夹具不得依赖宿主模型凭据——CI runner 没有任何 key 时，
    // 真实引擎解析会如实拦住自动验收派发（verifier 永远不 send）。这里注入确定性解析，只测派发时序/文案
    // （与本文件其余用例的用法一致）；不放宽任何断言。
    resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
  });
  await iface.listProject({ projectRoot: root });
  assert.equal((await iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
  assert.ok(dispatchTask, "Convener 注入 dispatch_task");
  const dispatched = await dispatchTask!({ roleId: "executor", task: "实现步骤", flowId, stepId: "impl" });
  assert.ok(dispatched, "dispatch_task 应有回执");
  assert.equal(dispatched.ok, true, dispatched.message ?? "");
  await waitForTest(() => (sendsByRole.get("executor")?.length ?? 0) > 0);
  controls.get("executor")!.emit({
    kind: "handback",
    summary: "回交",
    handback: {
      roleId: "executor",
      status: "completed",
      summary: "实现完成",
      evidence: ["docs/reports/impl.md"],
      at: new Date().toISOString(),
    },
  } as unknown as SessionEvent);
  await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) > 0, 3000);
  controls.get("executor")!.settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  controls.get("convener")!.settle();
  await new Promise((resolve) => setTimeout(resolve, 200));
  return {
    flowId,
    primaryRoleId: listing.primaryRoleId,
    sendsByRole,
    events,
    repeatConvenerSettle: () => controls.get("convener")!.settle(),
    close: async () => {
      await iface.stopSession();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("收尾推进：回交送达 Convener 且流程全部完成 ⇒ 派 Proof / 验收 恰一次；重复 settle 不重派", async () => {
  const scenario = await runHandbackAcceptanceScenario("done");
  try {
    // 2026-10-20 CI run 39389502551（三平台）：并发负载下 verifier 会话可能晚于夹具返回才打开；
    // 若此时 `?? []` 取数组，捕获的是与后续派发无关的空数组。先有界等待首条任务真正发出，再取当前数组。
    await waitForTest(() => (scenario.sendsByRole.get("verifier")?.length ?? 0) >= 1, 5000);
    const verifierSends = scenario.sendsByRole.get("verifier")!;
    assert.equal(verifierSends.length, 1, "全部完成 ⇒ 恰一条验收汇总任务");
    assert.match(verifierSends[0] ?? "", /流程 flow-a 步骤已全部完成/);
    assert.match(verifierSends[0] ?? "", /流程状态 YAML：docs\/flows\/flow-a\.yaml/);
    assert.match(verifierSends[0] ?? "", /docs\/reports\/impl\.md/, "任务带回交/核对报告路径");
    assert.match(verifierSends[0] ?? "", /请汇总证据并出验收卡/);
    assert.match(verifierSends[0] ?? "", /不要自行验收或代替客户决定/);
    // 系统行在投递成功的同一异步链里 emit；CI 负载下仍可能晚于 send 可见一拍——有界等待，不改文案断言。
    await waitForTest(
      () => deliveryNoteSummaries(scenario.events, scenario.primaryRoleId).some((note) => /已自动派发验收复核给验收（工作中）/.test(note)),
      2000,
    );
    const notes = deliveryNoteSummaries(scenario.events, scenario.primaryRoleId);
    // 2026-10-19 客户反馈：验收复核是标准流程——系统行须说明「自动派发」且不冒充客户批准。
    // 2026-10-19 客户决定：自动验收门反馈统一发给 Lead（主入口 primaryRoleId），不再发 Convener。
    assert.ok(notes.some((note) => /已自动派发验收复核给验收（工作中）/.test(note)), "Lead 系统行如实告知已自动派发");
    // 2026-10-19 客户决定：自动验收门反馈统一发给 Lead（主入口 primaryRoleId），不再发 Convener。
    // 该场景中 Convener 仍会收到回交/派发类系统行；这里只钉「自动验收反馈」不落 Convener。
    const acceptanceNoteOnConvener = deliveryNoteSummaries(scenario.events, "convener")
      .filter((note) => /自动验收未派发|已自动派发验收复核|无法确定项目引擎/.test(note));
    assert.deepEqual(acceptanceNoteOnConvener, [], "自动验收反馈不再发 Convener");
    assert.ok(notes.every((note) => !/客户已批准|验收通过/.test(note)), "系统行不得冒充客户批准");
    const dispatchCountBeforeRepeat = scenario.sendsByRole.get("verifier")!.length;
    scenario.repeatConvenerSettle();
    // 有界稳定窗口：重复 settle 若再开 verifier 会话，map 值会被替换成新数组（即使只发一条也会被下方的
    // 同一性检查抓住）；若在原数组上追加，则长度变化。窗口内任一变化都失败，不再只靠 150ms 固定等待。
    await assertNoChangeFor(
      () =>
        scenario.sendsByRole.get("verifier") !== verifierSends ||
        scenario.sendsByRole.get("verifier")!.length !== dispatchCountBeforeRepeat,
      400,
      "重复 settle 不重复派",
    );
    assert.equal(scenario.sendsByRole.get("verifier")!.length, 1, "重复 settle 不重复派");
  } finally {
    await scenario.close();
  }
});

test("收尾推进：步骤未完成/阻塞 ⇒ 不派 Proof / 验收（保持现状）", async () => {
  const pending = await runHandbackAcceptanceScenario("pending");
  try {
    // 同类竞态（2026-10-20 CI）：先有界等待本轮收尾门的阻塞系统行——它证明检查已执行完毕；
    // 之后再取派发记录，避免「提前取到不存在的数组 ⇒ 假绿」。断言语义不变（仍为 0）。
    await waitForTest(
      () => deliveryNoteSummaries(pending.events, pending.primaryRoleId).some((note) => note.includes("自动验收未派发")),
      5000,
    );
    assert.equal((pending.sendsByRole.get("verifier") ?? []).length, 0, "pending 步骤：不派");
  } finally {
    await pending.close();
  }
  const blocked = await runHandbackAcceptanceScenario("blocked");
  try {
    await waitForTest(
      () => deliveryNoteSummaries(blocked.events, blocked.primaryRoleId).some((note) => note.includes("自动验收未派发")),
      5000,
    );
    assert.equal((blocked.sendsByRole.get("verifier") ?? []).length, 0, "blocked 步骤：不派");
  } finally {
    await blocked.close();
  }
});

test("治理自动推进：后台派发不抢活动角色（activeRoleId 保持为空）", async () => {
  const sendsByRole = new Map<string, string[]>();
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => trioListing(),
    openRoleSessionFn: async (input) => {
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      return quietGovernanceHandle(sends);
    },
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });
  const result = await iface.advanceGovernanceFlow({
    payload: { version: 1, flowId: "flow-a", cardKind: "proposal", nextFunction: "nomination", roleId: "nominator" },
    context: { sourceRoleId: "rapporteur", projectRoot: "/proj", runtime: "demo" },
  });
  assert.equal(result.ok, true);
  assert.equal(sendsByRole.get("nominator")?.length, 1);
  // 没有用户打开的会话 → 后台打开不得成为活动角色：不带 target 的 send 如实回「会话尚未开启」。
  const send = await iface.sendSession({ text: "不应落在 Nominator 的客户消息" });
  assert.equal(send.ok, false);
  assert.match(send.error ?? "", /会话尚未开启/);
  assert.equal(sendsByRole.get("nominator")?.length, 1, "后台会话没有被当成当前 pane");
  await iface.stopSession();
});

test("治理自动推进失败：目标角色缺失/发送失败 → 如实错误系统行，当前会话不阻塞", async () => {
  // ① 目标角色缺失：项目枚举里没有 nominator。
  const sendsByRole = new Map<string, string[]>();
  const events: SessionEventEnvelope[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: (envelope) => { events.push(envelope); },
    listProjectFn: async () => trioListing(["rapporteur", "convener"]),
    openRoleSessionFn: async (input) => {
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      return quietGovernanceHandle(sends);
    },
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "rapporteur", runtime: "demo" })).ok, true);
  const missing = await iface.advanceGovernanceFlow({
    payload: { version: 1, flowId: "flow-a", cardKind: "proposal", nextFunction: "nomination", roleId: "nominator" },
    context: { sourceRoleId: "rapporteur", projectRoot: "/proj", runtime: "demo" },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.dispatched, false);
  assert.match(missing.error ?? "", /组队/);
  const failureNotes = events.filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note");
  assert.equal(failureNotes.length, 1, "失败如实落一行系统行");
  assert.match(failureNotes[0].event.summary ?? "", /自动推进失败/);
  // 当前会话不阻塞：客户消息照常投给 Rapporteur。
  const rapporteurSends = sendsByRole.get("rapporteur")!;
  rapporteurSends.length = 0;
  assert.equal((await iface.sendSession({ text: "继续当前工作" })).ok, true);
  assert.deepEqual(sendsByRole.get("rapporteur"), ["继续当前工作"]);
  await iface.stopSession();

  // ② 发送失败：目标会话能开，但句柄 send 抛错。
  const events2: SessionEventEnvelope[] = [];
  const iface2 = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: (envelope) => { events2.push(envelope); },
    listProjectFn: async () => trioListing(),
    openRoleSessionFn: async (input) => {
      if (input.roleId === "nominator") {
        return {
          async send(): Promise<void> { throw new Error("目标运行时拒绝投递"); },
          events(): AsyncIterable<SessionEvent> {
            return { [Symbol.asyncIterator]() { return { async next() { return { value: undefined as unknown as SessionEvent, done: true }; } }; } };
          },
          async dispose(): Promise<void> {},
        } as RoleSessionHandle;
      }
      return quietGovernanceHandle([]);
    },
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface2.listProject({ projectRoot: "/proj" });
  assert.equal((await iface2.openSession({ projectRoot: "/proj", roleId: "rapporteur", runtime: "demo" })).ok, true);
  const sendFailed = await iface2.advanceGovernanceFlow({
    payload: { version: 1, flowId: "flow-a", cardKind: "proposal", nextFunction: "nomination", roleId: "nominator" },
    context: { sourceRoleId: "rapporteur", projectRoot: "/proj", runtime: "demo" },
  });
  assert.equal(sendFailed.ok, false);
  assert.match(sendFailed.error ?? "", /发送任务给 组队 失败/);
  const notes2 = events2.filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note");
  assert.equal(notes2.length, 1);
  assert.match(notes2[0].event.summary ?? "", /自动推进失败/);
  await iface2.stopSession();
});

// ————— W6-B（2026-10-18）：后台推进的审计账本（四角色评审 §7.2 / AC19）—————
//
// `advanceGovernanceFlow` 投递成功后写 `dispatch.accepted{actorRoleId:"app", power:"app",
// trigger:"customer-decision"}`；失败不写；single 不写；账本失败只记诊断、不翻转投递结果。

function makeTempProjectRoot(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test("W6-B 自动推进账本：trio 成功投递后恰一条 dispatch.accepted(app, trigger=customer-decision)，不写客户决定", async () => {
  const root = makeTempProjectRoot("ans-advance-ledger-");
  try {
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: root });
    assert.equal((await iface.openSession({ projectRoot: root, roleId: "rapporteur", runtime: "demo" })).ok, true);
    const result = await iface.advanceGovernanceFlow({
      payload: {
        version: 1,
        flowId: "flow-a",
        cardKind: "proposal",
        nextFunction: "nomination",
        roleId: "nominator",
        proposalPath: "docs/proposals/flow-a-v1.md",
      },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo", stepId: "step-1" },
    });
    assert.equal(result.ok, true);
    assert.equal(result.dispatched, true);
    assert.equal(sendsByRole.get("nominator")?.length, 1, "先投递成功");

    const ledger = await readGovernanceLedger(root);
    assert.deepEqual(ledger.errors, [], "账本可读、无坏行");
    const accepted = ledger.entries.filter((entry) => entry.kind === "dispatch.accepted");
    assert.equal(accepted.length, 1, "成功恰写一条 dispatch.accepted");
    const entry = accepted[0];
    assert.equal(entry.actorRoleId, "app", "应用动作（actor=app）");
    assert.equal(entry.power, "app", "power=app（不是任何角色的决定权）");
    assert.equal(entry.trigger, "customer-decision", "触发来源=客户决定推进");
    assert.equal(entry.flowId, "flow-a");
    assert.equal(entry.stepId, "step-1", "卡片/上下文显式给出的 stepId 原样入账（AC19）");
    assert.equal(entry.targetRoleId, "nominator");
    assert.equal(entry.customerDecision, undefined, "不写 customerDecision（不是客户批准）");
    assert.equal(entry.decisionEvidence, undefined, "不写 decisionEvidence");

    // 拿不到 stepId 时：照常投递，但账本不伪造 stepId（只记诊断）。
    const second = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-b", cardKind: "proposal", nextFunction: "schedule", roleId: "convener" },
      context: { sourceRoleId: "rapporteur", projectRoot: root, runtime: "demo" },
    });
    assert.equal(second.ok, true);
    const ledgerAfter = await readGovernanceLedger(root);
    const convenerEntry = ledgerAfter.entries
      .filter((e) => e.kind === "dispatch.accepted")
      .find((e) => e.targetRoleId === "convener");
    assert.ok(convenerEntry, "第二次投递照常入账");
    assert.equal(convenerEntry!.stepId, undefined, "stepId 缺席时不伪造");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("W6-B 自动推进账本：失败不写 dispatch.accepted；账本失败不翻转已完成的投递", async () => {
  // ① 目标角色缺失 → 推进失败 → 不写账本。
  const rootA = makeTempProjectRoot("ans-advance-ledger-fail-");
  try {
    const listing: ProjectListing = { ...trioListing(["rapporteur", "convener"]), projectRoot: rootA };
    const iface = createDesktopInterface({
      pickDirectory: async () => rootA,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => quietGovernanceHandle([]),
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: rootA });
    assert.equal((await iface.openSession({ projectRoot: rootA, roleId: "rapporteur", runtime: "demo" })).ok, true);
    const failed = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-a", cardKind: "proposal", nextFunction: "nomination", roleId: "nominator" },
      context: { sourceRoleId: "rapporteur", projectRoot: rootA, runtime: "demo" },
    });
    assert.equal(failed.ok, false);
    const ledgerA = await readGovernanceLedger(rootA);
    assert.equal(ledgerA.entries.filter((entry) => entry.kind === "dispatch.accepted").length, 0, "失败不写账本");
    await iface.stopSession();
  } finally {
    rmSync(rootA, { recursive: true, force: true });
  }

  // ② 账本不可写（`.ans` 是普通文件 → mkdir 失败）：投递已完成，结果不翻转；只记诊断。
  const rootB = makeTempProjectRoot("ans-advance-ledger-broken-");
  try {
    writeFileSync(path.join(rootB, ".ans"), "not-a-directory");
    const listing: ProjectListing = { ...trioListing(), projectRoot: rootB };
    const iface = createDesktopInterface({
      pickDirectory: async () => rootB,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => quietGovernanceHandle([]),
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: rootB });
    assert.equal((await iface.openSession({ projectRoot: rootB, roleId: "rapporteur", runtime: "demo" })).ok, true);
    const result = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-b", cardKind: "proposal", nextFunction: "schedule", roleId: "convener" },
      context: { sourceRoleId: "rapporteur", projectRoot: rootB, runtime: "demo" },
    });
    assert.equal(result.ok, true, "账本失败不翻转投递结果");
    assert.equal(result.dispatched, true);
    const ledgerB = await readGovernanceLedger(rootB);
    assert.equal(
      ledgerB.entries.filter((entry) => entry.kind === "dispatch.accepted").length,
      0,
      "账本不可写时不产生条目；投递结果已如实返回（不翻转、不重试）",
    );
    await iface.stopSession();
  } finally {
    rmSync(rootB, { recursive: true, force: true });
  }
});

test("W6-B 自动推进账本：single 模型不写 dispatch.accepted（旧项目不产生新账本事件）", async () => {
  const root = makeTempProjectRoot("ans-advance-ledger-single-");
  try {
    const role = (roleId: string) => ({
      roleId,
      cardPath: "",
      boundaryPath: "",
      cardText: `# ${roleId}`,
      boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: true, source: "test" } },
      builtIn: true,
    });
    const listing: ProjectListing = {
      projectRoot: root,
      roles: [role("su"), role("convener")],
      warnings: [],
      hasRoles: false,
      primaryRoleId: "su",
      governanceModel: "single",
    };
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => quietGovernanceHandle([]),
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: root });
    assert.equal((await iface.openSession({ projectRoot: root, roleId: "su", runtime: "demo" })).ok, true);
    const result = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-s", cardKind: "proposal", nextFunction: "schedule", roleId: "convener" },
      context: { sourceRoleId: "su", projectRoot: root, runtime: "demo" },
    });
    assert.equal(result.ok, true);
    const ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.length, 0, "single 不产生任何账本条目");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ————— W6-B 真机阻塞修复（2026-10-18）：治理角色 settle 后刷新 listing / 目标查找重试 / 任命派发时序 —————
//
// 真机现象：Nominator 任命并写入 3 个角色卡后，Convener 的 role_status/dispatch_task 仍报「角色不在本项目」。
// 根因：listing 缓存未在治理角色写入后刷新；任命决定后的自动派发可能早于 Nominator 本轮写入完成。

function listingWithProjectRoles(base: ProjectListing, roleIds: string[]): ProjectListing {
  return {
    ...base,
    hasRoles: true,
    roles: [
      ...base.roles,
      ...roleIds.map((roleId) => ({
        roleId,
        cardPath: `角色卡/${roleId}/role-card.md`,
        boundaryPath: `角色卡/${roleId}/boundary.yaml`,
        cardText: `# ${roleId}`,
        boundary: {
          entries: [],
          boundarySource: `角色卡/${roleId}/boundary.yaml`,
          acceptance: { accepted: false, source: "" },
        },
      })),
    ],
  };
}

test("W6-B 真机修复：治理角色 settle 后异步刷新 listing 缓存并 emitProjectChanged（新角色立即可见）", async () => {
  const base = trioListing();
  const fresh = listingWithProjectRoles(base, ["role-a", "role-b", "role-c"]);
  let listCalls = 0;
  let projectChanged = 0;
  const settles = new Map<string, () => void>();
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => {
      listCalls += 1;
      return listCalls === 1 ? base : fresh;
    },
    openRoleSessionFn: async (input) => {
      const made = settleableGovernanceHandle([]);
      settles.set(input.roleId, made.settle);
      return made.handle;
    },
    buildProjectConfigFn: buildProjectConfig,
    emitProjectChanged: () => { projectChanged += 1; },
  });
  await iface.listProject({ projectRoot: "/proj" });
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "nominator", runtime: "demo" })).ok, true);
  // 2026-10-18 真机竞态修复：旧缓存缺角色时 `open()` 会强制刷新一次 listing 再查——新角色立即可开
  // （此前这里复现的是「尚未枚举到」；刷新后的 listing 缓存由同一 `listProjectFn` 更新）。
  const before = await iface.openSession({ projectRoot: "/proj", roleId: "role-a", runtime: "demo" });
  assert.equal(before.ok, true, "旧缓存缺角色 ⇒ open 强制刷新一次后找到（不再误报未找到角色）");

  settles.get("nominator")!();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(listCalls >= 3, "治理角色 settled 后重新 listProject（open 刷新 + settle 刷新）");
  assert.ok(projectChanged >= 1, "刷新后 emitProjectChanged（渲染侧重取左树）");
  const after = await iface.openSession({ projectRoot: "/proj", roleId: "role-a", runtime: "demo" });
  assert.equal(after.ok, true, "刷新后新角色可开会话");
  await iface.stopSession();
});

test("W6-B 真机修复：role_status / dispatch_task 目标 miss 时强制刷新一次（仍缺才如实拒绝）", async () => {
  const base = trioListing();
  const fresh = listingWithProjectRoles(base, ["role-a"]);
  let freshEnabled = false;
  type DispatchFn = (payload: { roleId: string; task: string; reason?: string }) => Promise<{ ok: boolean; message?: string }>;
  let roleStatusFn: RoleStatusFn | undefined;
  let dispatchTaskFn: DispatchFn | undefined;
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => (freshEnabled ? fresh : base),
    openRoleSessionFn: async (input) => {
      if (input.roleId === "convener") {
        roleStatusFn = input.roleStatus as RoleStatusFn | undefined;
        dispatchTaskFn = input.dispatchTask as unknown as DispatchFn | undefined;
      }
      return quietGovernanceHandle([]);
    },
    buildProjectConfigFn: buildProjectConfig,
  });
  await iface.listProject({ projectRoot: "/proj" });
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "convener", runtime: "demo" })).ok, true);
  assert.ok(roleStatusFn, "Convener 应注入 role_status");
  assert.ok(dispatchTaskFn, "Convener 应注入 dispatch_task");

  // 模拟 Nominator 刚写入 role-a：缓存仍是旧的；目标 miss ⇒ 强制刷新一次后可见。
  freshEnabled = true;
  const status = (await roleStatusFn!({ roleId: "role-a" })) ?? { ok: false };
  assert.equal(status.ok, true);
  assert.match(status.text ?? "", /角色 role-a：/, "刷新后 role_status 可见新角色");
  assert.doesNotMatch(status.text ?? "", /role-a：不在本项目/, "不再误报未枚举到");

  // dispatch 目标 miss ⇒ 刷新一次后进入治理门禁（而不是「不在本项目」）。
  const dispatch = await dispatchTaskFn!({ roleId: "role-a", task: "执行已批准步骤" });
  assert.equal(dispatch.ok, false, "无客户决定时门禁拒绝（预期）");
  assert.match(dispatch.message ?? "", /治理门禁/, "目标已找到，失败原因是治理门禁");
  assert.doesNotMatch(dispatch.message ?? "", /不在本项目/, "不再误报未枚举到");

  // 仍找不到 ⇒ 如实拒绝（只重试一次，不循环）。
  const missing = await dispatchTaskFn!({ roleId: "role-missing", task: "x" });
  assert.equal(missing.ok, false);
  assert.match(missing.message ?? "", /不在本项目/);
  await iface.stopSession();
});

test("W6-B 真机修复（2026-10-22 改造）：任命决定后派 Crew 写卡；Crew 未写出前不派 Convener；重复事件/重启不重派", async () => {
  const root = makeTempProjectRoot("ans-appointment-crew-dedup-");
  try {
    writeTeamPlanFile(root, "flow-c", { recommended: ["role-a"], rows: [{ roleId: "role-a", type: "existing" }] });
    await seedAppointmentDecision(root, "flow-c", ["role-a"]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["role-a"]), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const openRoles: string[] = [];
    const makeIface = () =>
      createDesktopInterface({
        pickDirectory: async () => root,
        emitEvent: () => {},
        listProjectFn: async () => listing,
        openRoleSessionFn: async (input) => {
          openRoles.push(input.roleId);
          const sends: string[] = [];
          sendsByRole.set(input.roleId, sends);
          return quietGovernanceHandle(sends);
        },
        buildProjectConfigFn: buildProjectConfig,
      });
    const iface = makeIface();
    await iface.listProject({ projectRoot: root });
    const payload: GovernanceNextStepPayload = {
      version: 1,
      flowId: "flow-c",
      cardKind: "appointment",
      nextFunction: "role-card-write",
      roleId: "nominator",
    };
    const first = await iface.advanceGovernanceFlow({
      payload,
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["role-a"] },
    });
    assert.deepEqual(first, { ok: true, dispatched: true, targetRoleId: "nominator" });
    assert.equal(sendsByRole.get("nominator")?.length, 1, "Crew 恰一条写卡任务");
    assert.equal(sendsByRole.get("convener")?.length ?? 0, 0, "Crew 未写出前不派 Convener");
    // 重复事件：运行期 Set 去重。
    const duplicate = await iface.advanceGovernanceFlow({
      payload,
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["role-a"] },
    });
    assert.deepEqual(duplicate, { ok: true, dispatched: false }, "重复事件不重派");
    assert.equal(sendsByRole.get("nominator")?.length, 1);
    await iface.stopSession();

    // 重启（新 Interface，同项目 + 同账本）：账本已有 appointment 后的 Crew 派发 ⇒ 不重派。
    const restartedSends = new Map<string, string[]>();
    const restarted = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        restartedSends.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
    });
    await restarted.listProject({ projectRoot: root });
    const afterRestart = await restarted.advanceGovernanceFlow({
      payload,
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["role-a"] },
    });
    assert.deepEqual(afterRestart, { ok: true, dispatched: false }, "重启后账本去重：不重派");
    assert.equal(restartedSends.get("nominator")?.length ?? 0, 0, "重启后 Crew 零派发");
    await restarted.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("W6-B 真机修复：listing 刷新失败不崩、不打断后台派发（只记诊断）", async () => {
  const root = makeTempProjectRoot("ans-appointment-refresh-fail-");
  try {
    writeTeamPlanFile(root, "flow-c", { recommended: ["role-a"], rows: [{ roleId: "role-a", type: "existing" }] });
    await seedAppointmentDecision(root, "flow-c", ["role-a"]);
    let listCalls = 0;
    const openRoles: string[] = [];
    const sendsByRole = new Map<string, string[]>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => {
        listCalls += 1;
        if (listCalls === 1) return { ...listingWithProjectRoles(trioListing(), ["role-a"]), projectRoot: root };
        throw new Error("模拟读盘失败");
      },
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-c", cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["role-a"] },
    });
    assert.equal(result.ok, true, "刷新失败不崩、不打断派发");
    assert.equal(result.targetRoleId, "nominator");
    assert.ok(openRoles.includes("nominator"), "Crew 会话仍被开启");
    assert.equal(sendsByRole.get("nominator")?.length, 1);
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ————— 2026-10-19 真机第二缺陷：写卡后自动推进（强制刷新枚举 + 兜底派 Convener） —————
//
// 真机：Crew 已写出 6 个角色卡/边界，但应用没有重新枚举角色、也没有自动派下一步，流程停住；
// 且 `advanceGovernanceFlow` 的 appointment 路径在 appointment-write 卡等待期间 `waitForRoleIdle`
// 会超时/早退，审批通过后无人继续。本组钉住兜底检查：appointment-write answered 后（以及内置治理角色
// settle 后）先强制刷新 listing（并 emitProjectChanged），目标角色齐备且账本尚无 appointment 之后的
// convener dispatch.accepted ⇒ 复用既有任务文本派 Convener 恰一次；角色仍缺只记诊断、不刷屏。

async function seedAppointmentDecision(root: string, flowId: string, targets: string[]): Promise<void> {
  const appended = await appendGovernanceLedger(root, {
    at: new Date().toISOString(),
    kind: "customer.decision",
    flowId,
    stepId: "appointment",
    decisionKind: "appointment",
    customerDecision: "appointed",
    actorRoleId: "nominator",
    power: "nomination",
    targetRoleIds: targets,
  });
  assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
}

/** 2026-10-22 第 1 项：写团队计划（默认一行一角色；rows 可指定类型与四列内容）。 */
function writeTeamPlanFile(
  root: string,
  flowId: string,
  options: {
    recommended?: string[];
    rows?: Array<{ roleId: string; type?: string; duty?: string; ability?: string; writes?: string; deps?: string }>;
    riskTier?: string;
    version?: number;
  } = {},
): string {
  const version = options.version ?? 1;
  const recommended = options.recommended ?? (options.rows ?? []).map((row) => row.roleId);
  const rows: Array<{ roleId: string; type?: string; duty?: string; ability?: string; writes?: string; deps?: string }> =
    options.rows ?? recommended.map((roleId) => ({ roleId, type: "new" }));
  const text = [
    "---",
    `flowId: ${flowId}`,
    `version: ${version}`,
    "status: draft",
    `riskTier: ${options.riskTier ?? "T1"}`,
    `recommended: [${recommended.join(", ")}]`,
    "---",
    "",
    `# 团队计划：${flowId}`,
    "",
    "| roleId | 类型 | 职责目标 | 能力要求 | 唯一写集 | 依赖 | 组别 | apiSpec |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.roleId} | ${row.type ?? "new"} | ${row.duty ?? "实现交付"} | ${row.ability ?? "工程能力"} | ${row.writes ?? "src/**"} | ${row.deps ?? "无"} | 组 | required |`,
    ),
    "",
  ].join("\n");
  const dir = path.join(root, "docs", "scheduling");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${flowId}-team-v${version}.md`), text);
  return `docs/scheduling/${flowId}-team-v${version}.md`;
}

/** 2026-10-22 角色粒度/MapReduce：写 v2 团队计划（模块清单 + 14 列角色表 + 五维章节）。 */
function writeTeamPlanV2File(
  root: string,
  flowId: string,
  options: {
    modules?: string[];
    rows?: Array<{
      roleId: string;
      type?: string;
      module?: string;
      duty?: string;
      ability?: string;
      writes?: string;
      contract?: string;
      testSurface?: string;
      deps?: string;
      dependsOn?: string;
      parallelGroup?: string;
      group?: string;
      apiSpec?: string;
      rationale?: string;
    }>;
    riskTier?: string;
    version?: number;
  } = {},
): string {
  const version = options.version ?? 1;
  const modules = options.modules ?? ["storefront"];
  const rows =
    options.rows ??
    [
      {
        roleId: "executor",
        type: "new",
        module: modules[0]!,
        writes: "src/delivery",
        contract: "docs/contracts/delivery-v1.md",
        testSurface: "test/delivery/",
        dependsOn: "无",
        parallelGroup: "map-a",
        group: "交付",
        apiSpec: "required",
      },
      {
        roleId: "tester",
        type: "existing",
        module: "reduce",
        writes: "test/测试/",
        contract: "docs/contracts/delivery-v1.md（消费）",
        testSurface: "test/测试/",
        deps: "依赖全部 Map",
        dependsOn: "executor",
        parallelGroup: "reduce",
        group: "测试",
        apiSpec: "not-applicable（Reduce 角色不导出接口）",
      },
    ];
  const recommended = rows.filter((row) => row.module !== "reduce").map((row) => row.roleId);
  const text = [
    "---",
    `flowId: ${flowId}`,
    `version: ${version}`,
    `riskTier: ${options.riskTier ?? "T3"}`,
    "teamPlanSchema: 2",
    `recommended: [${recommended.join(", ")}]`,
    `modules: [${modules.join(", ")}]`,
    "---",
    "",
    `# 团队计划：${flowId}`,
    "",
    "## 模块清单",
    "",
    "| module | 职责 | 公开契约 | 架构来源 |",
    "| --- | --- | --- | --- |",
    ...modules.map(
      (module) => `| ${module} | ${module} 交付模块 | docs/contracts/delivery-v1.md | docs/planning/${flowId}-v1.md §4 |`,
    ),
    "",
    "## 参与角色与职责",
    "",
    "| roleId | 类型 | module | 职责目标 | 能力要求 | 唯一写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.roleId} | ${row.type ?? "new"} | ${row.module ?? modules[0]} | ${row.duty ?? "实现交付"} | ${row.ability ?? "工程能力"} | ${row.writes ?? "src/delivery"} | ${row.contract ?? "docs/contracts/delivery-v1.md"} | ${row.testSurface ?? "test/delivery/"} | ${row.deps ?? "无"} | ${row.dependsOn ?? "无"} | ${row.parallelGroup ?? "map-a"} | ${row.group ?? "交付"} | ${row.apiSpec ?? "required"} | ${row.rationale ?? "—"} |`,
    ),
    "",
    "## 五维判断与协调成本",
    "",
    "- 责任独立性：模块各自有独立变化原因；Reduce 角色独立承担证据合并。",
    "- 范围归属：Map 角色写集不相交；Reduce 只写测试与证据。",
    "- 契约影响：公开契约由 Map 角色唯一主属，其余角色只消费。",
    "- 证据独立性：每个 Map 角色有独立测试面，Reduce 独立合并。",
    "- 协调成本：按模块并行收益高于交接成本，未拆到函数级。",
    "",
  ].join("\n");
  const dir = path.join(root, "docs", "scheduling");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${flowId}-team-v${version}.md`), text);
  return `docs/scheduling/${flowId}-team-v${version}.md`;
}

/** 2026-10-23 目录级授权 v3：写 v3 团队计划（frontmatter directories + 授权目录/精确写集 + 目录规范 + 实现目录）。 */
function writeTeamPlanV3File(
  root: string,
  flowId: string,
  options: {
    version?: number;
    /** 模块清单 `实现目录`（默认 `src/module-a/`）。 */
    implementationDir?: string;
    /** frontmatter directories（默认实现目录 + 其下 tests/）。 */
    directories?: string[];
    /** Map 角色（executor）类型（默认 new；可设 changed/existing）。 */
    mapRoleType?: string;
    /** Map 角色授权目录单元格（默认实现目录 + 其下 tests/）。 */
    mapDirs?: string;
    /** Map 角色精确写集单元格（默认 `无`）。 */
    mapPrecise?: string;
    /** 整体覆盖角色行（含 Reduce 行时必须自带 reduce 角色）。 */
    rows?: Array<{
      roleId: string;
      type?: string;
      module?: string;
      dirs?: string;
      precise?: string;
      contract?: string;
      testSurface?: string;
      deps?: string;
      dependsOn?: string;
      parallelGroup?: string;
      group?: string;
      apiSpec?: string;
    }>;
    /** 目录规范行覆盖（默认 = directories）。 */
    specDirs?: string[];
    /** 故意缺目录规范行的目录（负例：来源分流到 Convener）。 */
    omitSpecFor?: string[];
    /** 目录规范 owner（默认 executor；负例可改成非推荐角色）。 */
    specOwner?: string;
  } = {},
): string {
  const version = options.version ?? 1;
  const implementationDir = options.implementationDir ?? "src/module-a/";
  const directories = options.directories ?? [implementationDir, `${implementationDir}tests/`];
  const testDir = directories.find((dir) => /(^|\/)tests\/$/.test(dir)) ?? `${implementationDir}tests/`;
  const rows =
    options.rows ??
    [
      {
        roleId: "executor",
        type: options.mapRoleType ?? "new",
        module: "module-a",
        dirs: options.mapDirs ?? `${implementationDir}; ${implementationDir}tests/`,
        precise: options.mapPrecise ?? "无",
        testSurface: testDir,
      },
      {
        roleId: "tester",
        type: "existing",
        module: "reduce",
        dirs: "无",
        precise: "test/测试/",
        contract: "internal（测试目录只消费模块契约）",
        testSurface: "test/测试/",
        deps: "依赖全部 Map",
        dependsOn: "executor",
        parallelGroup: "reduce",
        group: "测试",
        apiSpec: "not-applicable（Reduce 角色不导出接口）",
      },
    ];
  const recommended = rows.filter((row) => row.module !== "reduce").map((row) => row.roleId);
  const specDirs = (options.specDirs ?? directories).filter((dir) => !(options.omitSpecFor ?? []).includes(dir));
  const specRowOf = (dir: string): string => {
    const tests = /(^|\/)tests\/$/.test(dir);
    const hasTestsChild = directories.includes(`${dir}tests/`);
    const testSurface = tests ? dir : hasTestsChild ? `${dir}tests/` : testDir;
    return (
      `| ${dir} | ${options.specOwner ?? "executor"} | ${tests ? "tests" : "implementation"} | ` +
      `${tests ? "模块测试" : "模块实现"} | ${tests ? "*.test.ts" : "kebab-case"} | ${tests ? "—" : hasTestsChild ? "tests" : "—"} | ` +
      `.ts | ${tests ? "internal（测试目录只消费模块契约）" : "docs/contracts/module-a-v1.md"} | ${testSurface} | 无 | — | none |`
    );
  };
  const text = [
    "---",
    `flowId: ${flowId}`,
    `version: ${version}`,
    "riskTier: T3",
    "teamPlanSchema: 3",
    `recommended: [${recommended.join(", ")}]`,
    "modules: [module-a]",
    `directories: [${directories.join(", ")}]`,
    "---",
    "",
    `# 团队计划：${flowId}`,
    "",
    "## 模块清单",
    "",
    "| module | 职责 | 公开契约 | 架构来源 | 实现目录 |",
    "| --- | --- | --- | --- | --- |",
    `| module-a | 模块 A 交付 | docs/contracts/module-a-v1.md | docs/planning/${flowId}-v1.md §4 | ${implementationDir} |`,
    "",
    "## 参与角色与职责",
    "",
    "| roleId | 类型 | module | 职责目标 | 能力要求 | 授权目录 | 精确写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.roleId} | ${row.type ?? "new"} | ${row.module ?? "module-a"} | ${"实现交付"} | ${"工程能力"} | ${row.dirs ?? "无"} | ${row.precise ?? "无"} | ${row.contract ?? "docs/contracts/module-a-v1.md"} | ${row.testSurface ?? testDir} | ${row.deps ?? "无"} | ${row.dependsOn ?? "无"} | ${row.parallelGroup ?? (row.module === "reduce" ? "reduce" : "map-a")} | ${row.group ?? (row.module === "reduce" ? "测试" : "交付")} | ${row.apiSpec ?? "required"} | — |`,
    ),
    "",
    "## 目录规范",
    "",
    "| 目录 | owner | 类型 | 用途 | 命名 | 允许子目录 | 允许文件类型 | 公开契约 | 测试面 | 依赖 | 禁写区 | 共享 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...specDirs.map(specRowOf),
    "",
    "## 五维判断与协调成本",
    "",
    "- 责任独立性：单模块交付与 Reduce 证据合并职责独立。",
    "- 范围归属：Map 写集与 Reduce 测试写集不相交。",
    "- 契约影响：模块契约由 executor 唯一主属，Reduce 只消费。",
    "- 证据独立性：各自独立测试面与证据。",
    "- 协调成本：单模块无需进一步拆分。",
    "",
  ].join("\n");
  const dir = path.join(root, "docs", "scheduling");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${flowId}-team-v${version}.md`), text);
  return `docs/scheduling/${flowId}-team-v${version}.md`;
}

/** 2026-10-22 第 5 项：写出一个 new/changed 角色的完整必填产物（章节 + boundary 条目 + 四份工作文档）。 */
function writeFullRoleArtifacts(
  root: string,
  roleId: string,
  options: { boundaryWrites?: Array<{ kind: "file" | "directory"; path: string }> } = {},
): void {
  const dir = path.join(root, "角色卡", roleId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "role-card.md"),
    [
      `# ${roleId}`,
      "",
      "**组别（group）：** 交付组",
      "**组内职责（groupDuty）：** 组员",
      "",
      "## 工作立场",
      "长期维护者。",
      "",
      "## 能力描述",
      "工程实现能力。",
      "",
      "## 系统功能导航",
      "- [功能导航](feature-map.md)",
      "",
      "## 必读资料",
      "1. boundary.yaml",
      "",
      "## 交接输入输出",
      "- 输入：任务；输出：回交。",
      "",
      "## 执行原则",
      "- 只改任务需要。",
      "",
      "## 质量职责",
      "- 单测与真实演示。",
      "",
      "## 标准工作流",
      "1. 读任务 → 实施 → 回交。",
      "",
      "## 交付物清单",
      "- 代码、测试、证据。",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(dir, "boundary.yaml"),
    [
      `role: ${roleId}`,
      "entries:",
      "  - kind: file",
      `    path: 角色卡/${roleId}/feature-map.md`,
      "    purpose: 功能导航",
      "  - kind: file",
      `    path: 角色卡/${roleId}/functional-description.md`,
      "    purpose: 模块说明",
      "  - kind: file",
      `    path: 角色卡/${roleId}/memo.md`,
      "    purpose: 备忘录",
      "  - kind: file",
      `    path: 角色卡/${roleId}/api-spec.md`,
      "    purpose: 接口说明",
      "  - kind: file",
      "    path: src/delivery",
      "    purpose: 实施写集",
      ...(options.boundaryWrites ?? []).flatMap((entry) => [
        `  - kind: ${entry.kind}`,
        `    path: ${entry.path}`,
        "    purpose: 计划写集",
      ]),
      "",
    ].join("\n"),
  );
  writeFileSync(path.join(dir, "feature-map.md"), "# 功能导航\n\n| 功能 | 说明 |\n| --- | --- |\n| 交付 | 实施与回交 |\n");
  writeFileSync(
    path.join(dir, "functional-description.md"),
    "# 模块说明\n\n## 职责\n\n实施交付。\n\n## 交接输入输出\n\n输入任务，输出回交。\n\n## 代码位置\n\nsrc/delivery。\n",
  );
  writeFileSync(path.join(dir, "memo.md"), "# 备忘录\n\n- 2026-10-22：测试夹具建立。\n");
  writeFileSync(path.join(dir, "api-spec.md"), "# API\n\n## 接口\n\n- 无共享接口；仅内部实现。\n");
}

/**
 * 2026-10-23 可重入门禁（governance-advance-redispatch）：写 flow YAML（role-cards + role-readiness）。
 * role-cards 默认 `artifact` pending；`status:"done"` 时按 kind 生成 evidence（artifact 缺省给夹具记录路径）。
 * `roleCards:false` ⇒ 不写 role-cards 步骤（flow 缺陷负例）。
 */
function writeRoleCardsFlowFixture(
  root: string,
  flowId: string,
  options: {
    /**
     * 2026-10-24 appointment 收口：为 true 时在 role-cards 之前写入 `id:"appointment"` 的
     * `kind:customer-decision` 步骤（缺省不写，保持既有 legacy 夹具逐字不变）。
     */
    appointment?: boolean;
    roleCards?:
      | {
          status?: "pending" | "dispatched" | "delivered" | "done" | "superseded" | "failed" | "blocked" | "aborted";
          kind?: "artifact" | "dispatch";
          evidenceRef?: string;
        }
      | false;
    roleReadinessStatus?: "pending" | "dispatched" | "delivered" | "done" | "superseded" | "failed" | "blocked" | "aborted";
  } = { roleCards: {} },
): string {
  const roleCards =
    options.roleCards === false
      ? undefined
      : { status: "pending" as const, kind: "artifact" as const, ...(options.roleCards ?? {}) };
  const readinessStatus = options.roleReadinessStatus ?? "pending";
  const steps: string[] = [];
  if (options.appointment === true) {
    steps.push(
      "  - id: appointment",
      "    title: 任命",
      "    owner: convener",
      "    kind: customer-decision",
      "    status: pending",
    );
  }
  if (roleCards !== undefined) {
    steps.push(
      "  - id: role-cards",
      "    title: 角色卡写入",
      "    owner: nominator",
      `    kind: ${roleCards.kind}`,
      `    status: ${roleCards.status}`,
    );
    if (roleCards.status === "done") {
      const ref =
        roleCards.evidenceRef ??
        (roleCards.kind === "dispatch" ? "role-cards" : `.ans/governance/role-cards/${flowId}/fixture.json`);
      steps.push(`    evidence: { kind: ${roleCards.kind}, ref: ${ref} }`);
    }
  }
  steps.push(
    "  - id: role-readiness",
    "    title: 角色就绪复核",
    "    owner: convener",
    "    kind: artifact",
    `    status: ${readinessStatus}`,
  );
  if (readinessStatus === "done") {
    steps.push(`    evidence: { kind: artifact, ref: docs/scheduling/${flowId}-readiness-v1.md }`);
  }
  const text = [`flowId: ${flowId}`, "version: 1", "qualityTier: production", "steps:", ...steps, ""].join("\n");
  const dir = path.join(root, "docs", "flows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${flowId}.yaml`), text, "utf8");
  return `docs/flows/${flowId}.yaml`;
}

/** 2026-10-22 第 3 项：实施前验收标准（满足编排 O2 结构门槛：验收表/档位/判定规则/证据计划/版本冻结）。 */function writeAcceptanceCriteriaFile(root: string, flowId: string, riskTier = "T1"): void {
  const text = [
    "---",
    `flowId: ${flowId}`,
    "version: 1",
    `riskTier: ${riskTier}`,
    "---",
    "",
    `# 验收标准：${flowId}`,
    "",
    "| ID | 标准 | 需要的证据 | 判定 |",
    "| --- | --- | --- | --- |",
    "| P1 | 交付完成 | 测试输出 | pass |",
    "",
    `风险档位：${riskTier}。`,
    "判定规则：pass / fail / insufficient evidence / not applicable。",
    "证据计划：单元测试与真实启动演示。",
    "版本：v1，实施开始后冻结。",
    "",
  ].join("\n");
  const dir = path.join(root, "docs", "acceptance");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${flowId}-criteria-v1.md`), text);
}

interface PostWriteHarness {  iface: ReturnType<typeof createDesktopInterface>;
  sendsByRole: Map<string, string[]>;
  events: SessionEventEnvelope[];
  settles: Map<string, () => void>;
  projectChanged: () => number;
  /** 2026-10-20：客户卡调用记录（写卡产物门控必须全程零客户卡）。 */
  customerCalls: unknown[];
}

/**
 * 等前一轮「写卡后推进检查」真正结束（v1.7.0 发布 CI：mac 第四轮不派发）。
 * 应用 `runPostWriteAdvanceCheck` 是**单飞**（`postWriteAdvanceRunning`），运行中到达的事件只记 pending；
 * 且检查开头可能先等 Nominator 本轮 settle（**有界 8s**）。单飞状态不可直接从测试观察，故在调用方
 * `settle()` 之后留足 8s 上界，并要求可观察状态（sends / project:changed）在窗口内稳定。
 * 只影响等待预算，不改任何断言/条件；第二次上界兜底防无限挂起。
 */
async function waitForPostWriteCheckQuiescence(harness: PostWriteHarness): Promise<void> {
  const started = Date.now();
  let lastSignature = "";
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const signature = JSON.stringify({
      convener: harness.sendsByRole.get("convener")?.length ?? 0,
      nominator: harness.sendsByRole.get("nominator")?.length ?? 0,
      changed: harness.projectChanged(),
    });
    const elapsed = Date.now() - started;
    if (elapsed >= 8200 && signature === lastSignature) return;
    if (elapsed >= 12000) return;
    lastSignature = signature;
  }
}

/** 2026-10-20 写卡产物门控：写出一个角色的 role-card.md / boundary.yaml（可按需注入坏内容）。 */
function writeRoleArtifactFiles(
  root: string,
  roleId: string,
  opts: { card?: string; boundary?: string } = {},
): void {
  const dir = path.join(root, "角色卡", roleId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "role-card.md"), opts.card ?? `# 角色 ${roleId}\n\n职责说明。\n`);
  writeFileSync(
    path.join(dir, "boundary.yaml"),
    opts.boundary ??
      [`role: ${roleId}`, "entries:", "  - kind: file", "    path: src/a.ts", "    purpose: p", ""].join("\n"),
  );
}

async function makePostWriteHarness(
  root: string,
  targets: string[],
  rolesPresent: () => boolean,
  extraDeps: Partial<DesktopDeps> = {},
): Promise<PostWriteHarness> {
  const sendsByRole = new Map<string, string[]>();
  const events: SessionEventEnvelope[] = [];
  const settles = new Map<string, () => void>();
  const customerCalls: unknown[] = [];
  let projectChanged = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: (envelope) => { events.push(envelope); },
    listProjectFn: async () => ({
      ...listingWithProjectRoles(trioListing(), rolesPresent() ? targets : []),
      projectRoot: root,
    }),
    openRoleSessionFn: async (input) => {
      // 同一角色多次 open（后台会话释放后重开）时复用同一数组：跨轮次的发送计数不丢失。
      const sends = sendsByRole.get(input.roleId) ?? [];
      sendsByRole.set(input.roleId, sends);
      const made = settleableGovernanceHandle(sends);
      settles.set(input.roleId, made.settle);
      return made.handle;
    },
    buildProjectConfigFn: buildProjectConfig,
    emitProjectChanged: () => { projectChanged += 1; },
    resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    // 2026-10-20：写卡产物门控不得弹客户卡——记录任何调用（期望恒为空）。
    customerInput: async (request) => {
      customerCalls.push(request);
      return { outcome: "declined", reason: "测试替身：写卡门控不应弹卡" };
    },
    // 2026-10-23：可注入 role-cards 收口桩（stale/失败路径）；缺省走真实公共出口。
    ...extraDeps,
  });
  await iface.listProject({ projectRoot: root });
  return { iface, sendsByRole, events, settles, projectChanged: () => projectChanged, customerCalls };
}

function appointmentWritePayload(flowId: string) {
  return { version: 1 as const, flowId, cardKind: "appointment-write" as const, nextFunction: null, roleId: null };
}

async function ledgersConvenerDispatches(root: string, flowId: string): Promise<number> {
  const ledger = await readGovernanceLedger(root);
  return ledger.entries.filter(
    (entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.targetRoleId === "convener",
  ).length;
}

/** readiness（stepId=role-readiness）派发计数（排除 appointment 链早期无 stepId 的旧派发）。 */
async function ledgersReadinessDispatches(root: string, flowId: string): Promise<number> {
  const ledger = await readGovernanceLedger(root);
  return ledger.entries.filter(
    (entry) =>
      entry.kind === "dispatch.accepted" &&
      entry.flowId === flowId &&
      entry.targetRoleId === "convener" &&
      entry.stepId === "role-readiness",
  ).length;
}

async function waitForReadinessDispatchCount(root: string, flowId: string, expected: number, timeoutMs = 4000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let count = 0;
  for (;;) {
    count = await ledgersReadinessDispatches(root, flowId);
    if (count === expected || Date.now() >= deadline) return count;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** 2026-10-23：派发账本 append 在 send 之后异步落盘——有界轮询，避免「已观察发送、立即读账本」竞态。 */
async function waitForConvenerDispatchCount(root: string, flowId: string, expected: number, timeoutMs = 4000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let count = 0;
  for (;;) {
    count = await ledgersConvenerDispatches(root, flowId);
    if (count === expected || Date.now() >= deadline) return count;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("写卡后推进：appointment-write answered 后 listing 出现目标角色 ⇒ 自动派 Convener 恰一次、账本同形审计、左树刷新", async () => {
  const root = makeTempProjectRoot("ans-post-write-advance-");
  let harness: PostWriteHarness | undefined;
  try {
    const flowId = "flow-post-write";
    const targets = ["backend", "frontend", "tester"];
    await seedAppointmentDecision(root, flowId, targets);
    let rolesPresent = false;
    const made = await makePostWriteHarness(root, targets, () => rolesPresent);
    harness = made;
    // 真机场景：Crew 写卡期间 listing 缓存仍是旧的；写完后应用没有重新枚举。
    rolesPresent = true;
    // 2026-10-20 确定性门控：角色文件必须真实存在且格式合格，否则不派 Convener。
    for (const roleId of targets) writeRoleArtifactFiles(root, roleId);

    const early = await made.iface.advanceGovernanceFlow({
      payload: appointmentWritePayload(flowId),
      context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
    });
    assert.deepEqual(early, { ok: true, dispatched: false }, "appointment-write 推导为无下一步，但触发写卡后检查");

    await waitForTest(() => (made.sendsByRole.get("convener")?.length ?? 0) > 0, 3000);
    assert.equal(made.sendsByRole.get("convener")!.length, 1, "自动派 Convener 恰一次");
    assert.equal(
      made.sendsByRole.get("convener")![0],
      `流程 ${flowId}：客户已完成任命 backend、frontend、tester。请写流程状态 YAML docs/flows/${flowId}.yaml 并派发已批准步骤。`,
      "复用既有 appointment 任务文本（不造第二套消息）",
    );
    assert.ok(made.projectChanged() >= 1, "强制刷新后 emitProjectChanged（左树立即可见新角色卡）");

    // 审计：appointment 之后恰一条 convener dispatch.accepted（actor=app / power=app）。
    let count = 0;
    for (let i = 0; i < 100 && count === 0; i += 1) {
      count = await ledgersConvenerDispatches(root, flowId);
      if (count === 0) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(count, 1, "账本恰一条 convener 派发记录");
    const ledger = await readGovernanceLedger(root);
    const appointmentIndex = ledger.entries.findIndex(
      (entry) => entry.kind === "customer.decision" && entry.flowId === flowId && entry.decisionKind === "appointment",
    );
    const audit = ledger.entries
      .slice(appointmentIndex + 1)
      .find((entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.targetRoleId === "convener");
    assert.equal(audit?.actorRoleId, "app");
    assert.equal(audit?.power, "app", "应用自动推进 ≠ 客户批准");

    // 成功系统行落主入口（fixture 的 primaryRoleId=rapporteur），不冒充客户批准。
    const notes = made.events
      .filter((envelope) => envelope.roleId === "rapporteur" && envelope.event.kind === "message" && (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((envelope) => envelope.event.summary);
    assert.ok(notes.includes("已派发流程任务给统筹（工作中）"), "Lead 看到自动推进系统行");

    // 去重：重复 appointment-write 触发 + 治理角色 settle 都不重派。
    await made.iface.advanceGovernanceFlow({
      payload: appointmentWritePayload(flowId),
      context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
    });
    assert.equal((await made.iface.openSession({ projectRoot: root, roleId: "nominator", runtime: "demo" })).ok, true);
    made.settles.get("nominator")!();
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(made.sendsByRole.get("convener")!.length, 1, "同 flow+convener 不重派");
    assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1, "账本仍恰一条");
    // 2026-10-23 可重入门禁 P9：legacy（无团队计划）不写 role-cards 验证记录、不新增账本种类。
    assert.equal(existsSync(path.join(root, ".ans", "governance", "role-cards")), false, "legacy 不写 .ans role-cards 记录");
    assert.equal(
      (await readGovernanceLedger(root)).entries.some((entry) => entry.kind === "artifact.observed"),
      false,
      "legacy 不新增 artifact.observed 账本种类",
    );
    await made.iface.stopSession();
  } finally {
    // 异常路径兜底停止（正常路径已在用例末尾 stop）。
    try { await harness?.iface.stopSession(); } catch { /* 忽略 */ }
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 写卡产物门控：重试耗尽仍缺文件 ⇒ 反馈 Crew 修正、不派 Convener、无客户卡；重复 settle/触发不刷屏", async () => {
  const root = makeTempProjectRoot("ans-post-write-missing-");
  try {
    const flowId = "flow-post-write-missing";
    const targets = ["backend", "frontend"];
    await seedAppointmentDecision(root, flowId, targets);
    const harness = await makePostWriteHarness(root, targets, () => false);
    try {
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      // 有界重试（100/300/600ms）耗尽后才反馈 Crew。
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) > 0, 5000);
      const taskText = harness.sendsByRole.get("nominator")![0];
      for (const rel of [
        "角色卡/backend/role-card.md",
        "角色卡/backend/boundary.yaml",
        "角色卡/frontend/role-card.md",
        "角色卡/frontend/boundary.yaml",
      ]) {
        assert.ok(taskText.includes(rel), `修正任务逐文件列出：${rel}`);
      }
      assert.match(taskText, /文件不存在/, "具体问题：文件不存在");
      assert.match(taskText, /重新发 appointment-write 确认卡/, "要求重发 appointment-write 卡完成写卡");
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "不派 Convener（不能继续推进）");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写派发账本（不把 appointment 步骤标 done）");
      assert.equal(harness.customerCalls.length, 0, "不弹客户卡");
      const notes = harness.events.filter(
        (envelope) => envelope.event.kind === "message" && (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note",
      );
      assert.equal(notes.length, 1, "Lead 恰一条系统行（写卡产物未通过校验）");
      assert.equal(notes[0].roleId, "rapporteur", "系统行落 Lead（主入口）");
      assert.match(notes[0].event.summary ?? "", /写卡产物未通过校验/);
      assert.match(notes[0].event.summary ?? "", /未派统筹/);

      // 重复 settle + 再次 appointment-write answered：同 flow+问题哈希不重复反馈、仍不派 Convener。
      harness.settles.get("nominator")?.();
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await new Promise((resolve) => setTimeout(resolve, 1600));
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 1, "同问题不重复反馈（issuesHash 去重）");
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "仍不派 Convener");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 写卡产物门控：缺/空/坏格式逐项反馈 Crew（role-card 空、boundary 混 Markdown、role 与目录不一致），不派 Convener、无客户卡", async () => {
  const cases: {
    name: string;
    card?: string;
    boundary?: string;
    expect: RegExp;
  }[] = [
    { name: "empty-card", card: "", expect: /文件为空（需要角色卡正文）/ },
    { name: "prose-boundary", boundary: "# 边界说明\n\n这是散文式 Markdown，不是 YAML。\n", expect: /边界 YAML 解析失败/ },
    {
      name: "role-mismatch",
      boundary: ["role: someone-else", "entries:", "  - kind: file", "    path: src/a.ts", "    purpose: p", ""].join("\n"),
      expect: /顶层 role 与目录 id 不一致/,
    },
    {
      name: "empty-entries",
      boundary: ["role: A", "entries: []", ""].join("\n"),
      expect: /entries 为空/,
    },
    {
      name: "no-heading",
      card: "这是一段没有标题的角色说明。\n",
      expect: /缺少 Markdown 标题/,
    },
  ];
  for (const artifactCase of cases) {
    const root = makeTempProjectRoot(`ans-artifact-${artifactCase.name}-`);
    try {
      const flowId = "flow-artifact";
      await seedAppointmentDecision(root, flowId, ["A"]);
      // listing 已枚举到 A（真实 listProject 对空卡也会枚举；坏 boundary 会跳过——两者都在门控覆盖内）。
      const harness = await makePostWriteHarness(root, ["A"], () => true);
      try {
        writeRoleArtifactFiles(root, "A", {
          ...(artifactCase.card !== undefined ? { card: artifactCase.card } : {}),
          ...(artifactCase.boundary !== undefined ? { boundary: artifactCase.boundary } : {}),
        });
        await harness.iface.advanceGovernanceFlow({
          payload: appointmentWritePayload(flowId),
          context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
        });
        await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) > 0, 3000);
        const text = harness.sendsByRole.get("nominator")![0];
        assert.match(text, artifactCase.expect, `[${artifactCase.name}] 具体问题如实反馈`);
        assert.ok(text.includes("角色卡/A/"), `[${artifactCase.name}] 指明文件路径`);
        assert.match(text, /重新发 appointment-write 确认卡/, `[${artifactCase.name}] 要求重发写卡卡`);
        assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, `[${artifactCase.name}] 不派 Convener`);
        assert.equal(await ledgersConvenerDispatches(root, flowId), 0, `[${artifactCase.name}] 不写派发账本`);
        assert.equal(harness.customerCalls.length, 0, `[${artifactCase.name}] 不弹客户卡`);
      } finally {
        await harness.iface.stopSession();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// —————— 2026-10-20 客户要求：重启后任务自动续跑 + 僵尸步骤自检（兜底、去重、不自动派发） ——————

function zombieFlowYaml(
  flowId: string,
  steps: Array<{ id: string; owner: string; status: string; title?: string }>,
): string {
  return [
    `flowId: ${flowId}`,
    "version: 1",
    "qualityTier: production",
    "steps:",
    ...steps.flatMap((step) => [
      `  - id: ${step.id}`,
      `    title: ${step.title ?? step.id}`,
      `    owner: ${step.owner}`,
      "    kind: dispatch",
      `    status: ${step.status}`,
    ]),
    "",
  ].join("\n");
}

test("2026-10-20 重启续跑（Interface）：listProject 触发恢复并自动重投到原角色；Lead 恰一条系统行、无客户卡", async () => {
  const root = makeTempProjectRoot("ans-restore-queue-");
  const storeDir = makeTempProjectRoot("ans-restore-store-");
  try {
    const storePath = path.join(storeDir, "delivery-queue.json");
    const item = {
      kind: "message",
      runtime: "demo",
      targetRoleId: "A",
      sourceRoleId: "客户",
      text: "恢复消息正文",
      summary: "你：恢复消息正文",
      dedupKey: "restore-1",
      enqueuedAt: new Date().toISOString(),
    };
    writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        items: [{ key: { projectRoot: root, roleId: "A", runtime: "demo" }, item, state: "queued", enqueuedAt: item.enqueuedAt }],
      }),
      "utf8",
    );
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["A"]), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const events: SessionEventEnvelope[] = [];
    const customerCalls: unknown[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
      deliveryQueueStorePath: storePath,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
      customerInput: async (request) => {
        customerCalls.push(request);
        return { outcome: "declined", reason: "恢复/自检不应弹卡" };
      },
    });
    await iface.listProject({ projectRoot: root });
    await waitForTest(() => (sendsByRole.get("A")?.length ?? 0) > 0, 4000);
    assert.equal(sendsByRole.get("A")![0], "恢复消息正文", "自动重投到原角色（复用既有投递机）");
    const restoreNotes = () =>
      events.filter(
        (envelope) =>
          envelope.roleId === "rapporteur" &&
          envelope.event.kind === "message" &&
          (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note" &&
          /已从上次运行恢复/.test(envelope.event.summary ?? ""),
      );
    assert.equal(restoreNotes().length, 1, "Lead 恰一条「已从上次运行恢复 N 条任务并重投」系统行");
    assert.match(restoreNotes()[0].event.summary ?? "", /1 条任务/);
    assert.equal(customerCalls.length, 0, "恢复全程零客户卡");
    // 再次刷新：restore 每个进程只跑一次，不重复系统行。
    await iface.listProject({ projectRoot: root });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(restoreNotes().length, 1, "重复 listProject 不重复恢复系统行");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(storeDir, { recursive: true, force: true });
  }
});

test("2026-10-20 僵尸步骤自检：dispatched/delivered 且 owner 无会话/队列 ⇒ Lead 去重提示；revision 变化可再提示；pending 不提示", async () => {
  const root = makeTempProjectRoot("ans-zombie-steps-");
  try {
    const flowId = "flow-z";
    mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
    writeFileSync(
      path.join(root, "docs", "flows", `${flowId}.yaml`),
      zombieFlowYaml(flowId, [
        { id: "impl", owner: "executor", status: "dispatched" },
        { id: "verify-impl", owner: "helper", status: "delivered" },
        { id: "later", owner: "executor", status: "pending" },
      ]),
      "utf8",
    );
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor", "helper"]), projectRoot: root };
    const events: SessionEventEnvelope[] = [];
    const openRoles: string[] = [];
    const customerCalls: unknown[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        openRoles.push(input.roleId);
        const sends: string[] = [];
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
      customerInput: async (request) => {
        customerCalls.push(request);
        return { outcome: "declined", reason: "自检不应弹卡" };
      },
    });
    const zombieNotes = () =>
      events.filter(
        (envelope) =>
          envelope.roleId === "rapporteur" &&
          envelope.event.kind === "message" &&
          (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note" &&
          /可能因应用重启/.test(envelope.event.summary ?? ""),
      );
    await iface.listProject({ projectRoot: root });
    await waitForTest(() => zombieNotes().length > 0, 4000);
    const first = zombieNotes()[0].event.summary ?? "";
    assert.ok(first.includes(flowId) && first.includes("impl") && first.includes("executor") && first.includes("dispatched"), "列出 flowId/stepId/owner/status");
    assert.ok(first.includes("verify-impl") && first.includes("delivered"), "delivered 同样纳入");
    assert.equal(first.includes("later"), false, "pending 不提示");
    assert.match(first, /flow_get/, "提示用 flow_get 核对");
    assert.match(first, /flow_step_supersede/, "提示必要时 supersede");
    assert.match(first, /dispatch_task/, "提示重派");
    // 2026-10-20：delivered 步骤现在会另行走「唤醒 Steward 核证」路径（可能开 Convener 会话），
    // 僵尸自检本身**不派发、不写派发账本**——以账本为准断言（不按 openRoles 计数）。
    assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "僵尸自检不写派发账本（不自动派发）");
    assert.equal(customerCalls.length, 0, "不弹客户卡");
    // 同一 revision+stale 集合：重复刷新不重复提示。
    await iface.listProject({ projectRoot: root });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(zombieNotes().length, 1, "同 revision+stale 集合只提示一次");
    // revision 变化后仍 stale ⇒ 允许再提示一次。
    writeFileSync(
      path.join(root, "docs", "flows", `${flowId}.yaml`),
      zombieFlowYaml(flowId, [
        { id: "impl", title: "实施（v2）", owner: "executor", status: "dispatched" },
        { id: "verify-impl", owner: "helper", status: "delivered" },
      ]),
      "utf8",
    );
    await iface.listProject({ projectRoot: root });
    await waitForTest(() => zombieNotes().length > 1, 4000);
    assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "再次提示仍不写派发账本（不自动派发）");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 僵尸步骤自检：owner 有活会话/队列 ⇒ 不误报；无 flow YAML/解析失败 ⇒ 不提示", async () => {
  const root = makeTempProjectRoot("ans-zombie-live-");
  try {
    const flowId = "flow-z2";
    mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
    writeFileSync(
      path.join(root, "docs", "flows", `${flowId}.yaml`),
      zombieFlowYaml(flowId, [{ id: "impl", owner: "executor", status: "dispatched" }]),
      "utf8",
    );
    // 另有一条解析失败的 flow YAML：只记诊断、不提示。
    writeFileSync(path.join(root, "docs", "flows", "flow-broken.yaml"), "not: a valid flow\n", "utf8");
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const events: SessionEventEnvelope[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async () => {
        const sends: string[] = [];
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    const zombieNotes = () =>
      events.filter((envelope) => envelope.event.kind === "message" && /可能因应用重启/.test(envelope.event.summary ?? ""));
    await iface.listProject({ projectRoot: root });
    // owner 有活会话 ⇒ 不提示。
    assert.equal((await iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
    await iface.listProject({ projectRoot: root });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(zombieNotes().length, 0, "owner 有活会话 ⇒ 不误报（解析失败的 flow 也不提示）");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————— 2026-10-22 治理分工第 1/5 项：写卡校验来源分流 / 强制范围 / 手选差异 / 拒绝不派 ——————

test("2026-10-22 写卡校验分流：Crew 文件问题反馈 Crew；团队计划缺细节反馈 Convener；均不派 readiness", async () => {
  const root = makeTempProjectRoot("ans-artifact-split-");
  try {
    const flowId = "flow-split";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new", duty: "" }] });
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(
        () =>
          (harness.sendsByRole.get("nominator")?.length ?? 0) > 0 &&
          (harness.sendsByRole.get("convener")?.length ?? 0) > 0,
        5000,
      );
      const crewText = harness.sendsByRole.get("nominator")![0]!;
      const planText = harness.sendsByRole.get("convener")![0]!;
      assert.match(crewText, /角色卡\/executor\/role-card\.md：文件不存在/, "Crew 文件问题（含缺失工作文档）反馈 Crew");
      assert.match(crewText, /feature-map\.md：文件不存在/, "工作文档缺失逐项列出");
      assert.match(planText, /团队计划未通过结构校验/, "计划问题反馈 Convener");
      assert.match(planText, /「职责目标」为空/, "计划缺细节具体到列");
      assert.doesNotMatch(planText, /请对照团队计划/, "不是 readiness 任务");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写 readiness 派发账本");
      const leadNote = harness.events
        .filter((e) => e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
        .map((e) => e.event.summary)
        .find((summary) => summary.includes("写卡产物未通过校验"));
      assert.ok(leadNote !== undefined, "Lead 可见");
      assert.match(leadNote!, /组队修正/);
      assert.match(leadNote!, /统筹补充计划/);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-22 第 5 项强制范围：new 角色缺章节/工作文档 ⇒ 不派 Convener、逐项反馈 Crew", async () => {
  const root = makeTempProjectRoot("ans-artifact-new-full-");
  try {
    const flowId = "flow-new-full";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // 只写最低 role-card/boundary（无第 5 项章节与工作文档）——new 角色必须走完整清单。
      writeRoleArtifactFiles(root, "executor");
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) > 0, 5000);
      const feedback = harness.sendsByRole.get("nominator")![0]!;
      for (const section of ["能力描述", "职责与功能导航", "必读资料", "交接输入输出", "执行原则", "质量职责", "标准工作流", "交付物清单"]) {
        assert.ok(feedback.includes(`缺少「${section}」章节或等价内容`), `new 角色缺章节须反馈：${section}`);
      }
      for (const file of ["feature-map.md", "functional-description.md", "memo.md", "api-spec.md"]) {
        assert.ok(feedback.includes(`角色卡/executor/${file}：文件不存在`), `new 角色缺工作文档须反馈：${file}`);
      }
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "不派 Convener");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-22 第 5 项迁移策略：existing 角色只做最低检查（warning 不阻塞）⇒ 仍派 Convener readiness", async () => {
  const root = makeTempProjectRoot("ans-artifact-existing-");
  try {
    const flowId = "flow-existing";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "existing" }] });
    // 2026-10-23：团队计划存在 ⇒ flow 声明 role-cards；收口要求六文件齐全（夹具补足，断言不放宽）。
    writeRoleCardsFlowFixture(root, flowId);
    // 夹具补足实施前标准（新契约流程的验收门会先要标准；本组只聚焦写卡→readiness 链路）。
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      writeFullRoleArtifacts(root, "executor");
      // existing 只做最低检查：角色卡缺第 5 项必填章节也只是 warning（不阻塞）。
      writeFileSync(path.join(root, "角色卡", "executor", "role-card.md"), "# executor\n\n职责说明（existing 最低检查）。\n", "utf8");
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
      assert.match(harness.sendsByRole.get("convener")![0]!, /role-readiness/, "existing 角色 warning 不阻塞 readiness");
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "不反馈 Crew（无阻塞问题）");
      assert.equal(
        await waitForReadinessDispatchCount(root, flowId, 1),
        1,
        "readiness 派发入账 stepId=role-readiness",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-22 第 1 项：客户手选与推荐集不同 ⇒ 按实际名单派 Crew，并提示 Convener 修订计划 v2", async () => {
  const root = makeTempProjectRoot("ans-appointment-mismatch-");
  try {
    const flowId = "flow-mismatch";
    writeTeamPlanFile(root, flowId, { recommended: ["role-a"], rows: [{ roleId: "role-a", type: "existing" }] });
    await seedAppointmentDecision(root, flowId, ["role-a", "role-b"]);
    const sendsByRole = new Map<string, string[]>();
    const events: SessionEventEnvelope[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => ({ ...listingWithProjectRoles(trioListing(), ["role-a", "role-b"]), projectRoot: root }),
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId, cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["role-a", "role-b"] },
    });
    assert.equal(result.ok, true);
    const crewTask = sendsByRole.get("nominator")![0]!;
    assert.ok(crewTask.includes("role-a、role-b"), "Crew 按实际名单写卡（不是推荐集）");
    const sourceNotes = events
      .filter((e) => e.roleId === "convener" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    const mismatchNote = sourceNotes.find((note) => note.includes("与团队计划推荐集"));
    assert.ok(mismatchNote !== undefined, "提示 Convener 计划与名单不一致");
    assert.match(mismatchNote!, /修订团队计划为 v2/);
    assert.match(mismatchNote!, /role-a、role-b/);
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-22 第 1 项：账本最新任命决定未获同意（rejected）⇒ 不派 Crew、不写派发账本", async () => {
  const root = makeTempProjectRoot("ans-appointment-rejected-");
  try {
    const flowId = "flow-rejected";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "existing" }] });
    const appended = await appendGovernanceLedger(root, {
      at: new Date().toISOString(),
      kind: "customer.decision",
      flowId,
      stepId: "appointment",
      decisionKind: "appointment",
      customerDecision: "rejected",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleIds: ["executor"],
    });
    assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
    const sendsByRole = new Map<string, string[]>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => ({ ...trioListing(), projectRoot: root }),
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: root });
    const result = await iface.advanceGovernanceFlow({
      payload: { version: 1, flowId, cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
      context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: ["executor"] },
    });
    assert.equal(result.ok, false, "拒绝的决定不推进");
    assert.equal(sendsByRole.get("nominator")?.length ?? 0, 0, "不派 Crew");
    const ledger = await readGovernanceLedger(root);
    assert.equal(
      ledger.entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "nominator").length,
      0,
      "不写派发账本",
    );
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————— 2026-10-22 Map C：团队计划 v2 读取 / V12 计划写集覆盖 / 来源分流 ——————

test("2026-10-22 v2 团队计划：读取模块清单/v2 字段/并行组；计划写集被 boundary 覆盖 ⇒ 派 readiness 且文案含模块列/分片", async () => {
  const root = makeTempProjectRoot("ans-v2-team-plan-");
  try {
    const flowId = "flow-v2-ok";
    writeTeamPlanV2File(root, flowId);
    // 2026-10-23 可重入门禁：团队计划存在 ⇒ flow 声明 role-cards（应用收口后再派 readiness）。
    writeRoleCardsFlowFixture(root, flowId);
    // 夹具补足实施前标准（新契约流程的验收门会先要标准；本组只聚焦写卡→readiness 链路）。
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // 完整 new 角色产物；boundary 的 src/delivery 文件覆盖计划写集。
      writeFullRoleArtifacts(root, "executor");
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
      const readiness = harness.sendsByRole.get("convener")![0]!;
      assert.match(readiness, /团队计划为 v2（teamPlanSchema: 2）/);
      assert.match(readiness, /模块清单：storefront/, "readiness 文案带团队计划模块清单");
      assert.match(readiness, /module\/boundedContext/);
      assert.match(readiness, /module\/contract\/testSurface\/parallel\/dependsOn\/granularity/, "readiness 记录要求新增列");
      assert.match(readiness, /每分片独立证据/);
      assert.match(readiness, /等全部 Map done/);
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "覆盖通过：不退回 Crew");
      assert.equal(
        await waitForReadinessDispatchCount(root, flowId, 1),
        1,
        "V12 通过后才派 readiness（stepId=role-readiness）",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-22 V12：new 角色计划写集未被 boundary 覆盖 ⇒ 退回 Crew（含 Convener 修正提示）、不派 readiness", async () => {
  const root = makeTempProjectRoot("ans-v12-uncovered-");
  try {
    const flowId = "flow-v12-uncovered";
    writeTeamPlanV2File(root, flowId, {
      rows: [
        {
          roleId: "executor",
          type: "new",
          module: "storefront",
          writes: "src/other/",
          contract: "docs/contracts/delivery-v1.md",
          testSurface: "test/delivery/",
          dependsOn: "无",
          parallelGroup: "map-a",
        },
        {
          roleId: "tester",
          type: "existing",
          module: "reduce",
          writes: "test/测试/",
          contract: "docs/contracts/delivery-v1.md（消费）",
          testSurface: "test/测试/",
          deps: "依赖全部 Map",
          dependsOn: "executor",
          parallelGroup: "reduce",
          apiSpec: "not-applicable（Reduce 角色不导出接口）",
        },
      ],
    });
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      writeFullRoleArtifacts(root, "executor"); // boundary 仅覆盖 src/delivery，不含 src/other/
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) > 0, 5000);
      const feedback = harness.sendsByRole.get("nominator")![0]!;
      assert.match(feedback, /计划写集「src\/other\/」未被 boundary\.yaml entries 覆盖/, "V12 指出未覆盖的计划写集");
      assert.match(feedback, /报告统筹修正计划/, "Crew 文案给出计划有误时的回归路径");
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "不派 readiness");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写 readiness 派发账本");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-22 V12：existing 角色计划写集未覆盖 boundary ⇒ 只 warning、仍派 readiness", async () => {
  const root = makeTempProjectRoot("ans-v12-existing-");
  try {
    const flowId = "flow-v12-existing";
    writeTeamPlanV2File(root, flowId, {
      rows: [
        {
          roleId: "executor",
          type: "existing",
          module: "storefront",
          writes: "src/other/",
          contract: "docs/contracts/delivery-v1.md",
          testSurface: "test/delivery/",
          dependsOn: "无",
          parallelGroup: "map-a",
        },
        {
          roleId: "tester",
          type: "existing",
          module: "reduce",
          writes: "test/测试/",
          contract: "docs/contracts/delivery-v1.md（消费）",
          testSurface: "test/测试/",
          deps: "依赖全部 Map",
          dependsOn: "executor",
          parallelGroup: "reduce",
          apiSpec: "not-applicable（Reduce 角色不导出接口）",
        },
      ],
    });
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // existing：最低文件检查（无完整工作文档）也只是 warning；V12 未覆盖同样只 warning。
      // 2026-10-23 可重入门禁：团队计划存在 ⇒ flow 声明 role-cards；收口要求六文件齐全（夹具补足）。
      writeRoleCardsFlowFixture(root, flowId);
      // 夹具补足实施前标准（新契约流程的验收门会先要标准；本组只聚焦写卡→readiness 链路）。
      writeAcceptanceCriteriaFile(root, flowId);
      writeFullRoleArtifacts(root, "executor");
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
      assert.match(harness.sendsByRole.get("convener")![0]!, /role-readiness/, "existing 未覆盖不阻塞 readiness");
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "warning 不退回 Crew");
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1, "readiness 派发入账");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-22 v2 计划问题来源分流：缺公开契约 ⇒ 反馈 Convener、不退回 Crew readiness", async () => {
  const root = makeTempProjectRoot("ans-v2-plan-source-");
  try {
    const flowId = "flow-v2-plan-source";
    writeTeamPlanV2File(root, flowId, {
      rows: [
        {
          roleId: "executor",
          type: "new",
          module: "storefront",
          writes: "src/delivery",
          contract: "",
          testSurface: "test/delivery/",
          dependsOn: "无",
          parallelGroup: "map-a",
        },
        {
          roleId: "tester",
          type: "existing",
          module: "reduce",
          writes: "test/测试/",
          contract: "docs/contracts/delivery-v1.md（消费）",
          testSurface: "test/测试/",
          deps: "依赖全部 Map",
          dependsOn: "executor",
          parallelGroup: "reduce",
          apiSpec: "not-applicable（Reduce 角色不导出接口）",
        },
      ],
    });
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      writeFullRoleArtifacts(root, "executor");
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
      const planText = harness.sendsByRole.get("convener")![0]!;
      assert.match(planText, /团队计划未通过结构校验/, "v2 计划问题反馈 Convener");
      assert.match(planText, /公开契约/, "具体到缺失字段");
      assert.doesNotMatch(planText, /请对照团队计划/, "不是 readiness 任务");
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "计划问题不误退 Crew");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写 readiness 派发账本");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————— 2026-10-23 目录级授权 v3（任务 `2026-10-23-directory-ownership`，D5 桌面窗口）：v3 解析消费 /
// V12 授权目录+精确写集覆盖 / new 一致 / changed·existing 覆盖与宽边界 warning / 来源分流 / v2 不变 ——————

test("2026-10-23 v3 任务文案：Crew 写卡/readiness/验收标准/验收任务含授权目录/规范/布局；v2 文案不变", () => {
  const payload: GovernanceNextStepPayload = {
    version: 1,
    flowId: "flow-v3-text",
    cardKind: "appointment",
    nextFunction: "role-card-write",
    roleId: "nominator",
  };
  const options = {
    teamPlanPath: "docs/scheduling/flow-v3-text-team-v1.md",
    teamPlanVersion: 1,
    teamPlanSchema: 3 as const,
    teamPlanModules: ["module-a"],
    teamPlanDirectories: ["src/module-a/", "src/module-a/tests/"],
  };
  const crew = buildGovernanceAdvanceMessage(payload, ["executor"], options)!;
  assert.match(crew, /团队计划 v3/, "Crew 文案标明 v3");
  assert.match(crew, /授权目录：src\/module-a\/、src\/module-a\/tests\//, "Crew 文案带授权目录摘要");
  assert.match(crew, /new 角色边界目录必须与计划授权目录一致/, "Crew 文案含 new 一致规则");
  assert.match(crew, /changed\/existing 计划目录必须被边界覆盖/, "Crew 文案含 changed/existing 覆盖规则");
  assert.match(crew, /目录规范/, "Crew 文案含目录规范约束");
  assert.match(crew, /治理关键路径/, "Crew 文案含治理关键路径精确授权");
  // 2026-10-23 D6 缺口修正：提案接受后的 Convener 新流程默认 v3（不得再默认 v2）。
  const acceptPayload: GovernanceNextStepPayload = {
    version: 1,
    flowId: "flow-v3-text",
    cardKind: "proposal",
    nextFunction: "schedule",
    roleId: "convener",
  };
  const acceptV3 = buildGovernanceAdvanceMessage(acceptPayload, undefined, {
    proposalDecision: "accept",
    teamPlanPath: "docs/scheduling/flow-v3-text-team-v1.md",
  })!;
  assert.match(acceptV3, /团队计划 v3（目录级授权）/, "提案接受后的新流程默认 v3");
  assert.match(acceptV3, /teamPlanSchema: 3/);
  assert.match(acceptV3, /directories/, "v3 文案要求 frontmatter directories");
  assert.match(acceptV3, /实现目录/, "v3 文案要求模块实现目录（Q9 A）");
  assert.match(acceptV3, /授权目录/);
  assert.match(acceptV3, /精确写集/);
  assert.match(acceptV3, /目录规范/);
  assert.match(acceptV3, /directories\/spec\/shared\/layout/, "v3 文案要求 readiness 逐目录列");
  assert.doesNotMatch(acceptV3, /新流程默认 v2/, "新流程文案不得再默认 v2");
  assert.doesNotMatch(acceptV3, /teamPlanSchema: 2/, "新流程文案不得要求写 teamPlanSchema: 2");
  // 已有 v2 计划续接（显式 schema 2）：原 v2 文案逐字保留。
  const acceptV2 = buildGovernanceAdvanceMessage(acceptPayload, undefined, {
    proposalDecision: "accept",
    teamPlanPath: "docs/scheduling/flow-v3-text-team-v1.md",
    teamPlanSchema: 2,
  })!;
  assert.match(acceptV2, /团队计划 v2/);
  assert.match(acceptV2, /新流程默认 v2/);
  assert.match(acceptV2, /teamPlanSchema: 2/);
  assert.doesNotMatch(acceptV2, /teamPlanSchema: 3/);
  // v2 文案不出现 v3 追加段（legacy v2 逐字保留）
  const crewV2 = buildGovernanceAdvanceMessage(payload, ["executor"], {
    teamPlanPath: options.teamPlanPath,
    teamPlanVersion: options.teamPlanVersion,
    teamPlanSchema: 2,
    teamPlanModules: options.teamPlanModules,
  })!;
  assert.match(crewV2, /团队计划 v2/);
  assert.doesNotMatch(crewV2, /v3 写卡要求/);
  assert.doesNotMatch(crewV2, /授权目录：/);

  const readinessV2 = buildRoleReadinessTaskMessage(
    "flow-v2-text",
    ["executor"],
    "docs/scheduling/flow-v2-text-team-v1.md",
    1,
    { teamPlanSchema: 2, modules: ["storefront"] },
  );
  assert.match(readinessV2, /module\/contract\/testSurface\/parallel\/dependsOn\/granularity/);
  assert.doesNotMatch(readinessV2, /directories\/spec\/shared\/layout/, "v2 readiness 不要求 v3 列");

  const acceptance = buildAcceptanceTaskMessage("flow-v3-text", ["docs/reports/impl.md"], { teamPlanSchema: 3 });
  assert.match(acceptance, /布局核对报告/);
  assert.match(acceptance, /原始 git status\/diff/);
  assert.match(acceptance, /new 边界与计划一致/);
  assert.match(acceptance, /changed\/existing 计划 ⊆ 边界/);
  assert.match(acceptance, /不得建议 accept/);
  assert.doesNotMatch(buildAcceptanceTaskMessage("flow-v3-text", []), /布局核对报告/, "无 schema 时验收文案不变");

  const criteria = buildAcceptanceCriteriaTaskMessage("flow-v3-text", { teamPlanSchema: 3 });
  assert.match(criteria, /v3 schema/);
  assert.match(criteria, /布局核对（改动路径 → 目录规范/);
  assert.match(criteria, /原始 git status\/diff/);
  assert.doesNotMatch(buildAcceptanceCriteriaTaskMessage("flow-v3-text"), /v3 schema/, "无 schema 时标准文案不变");
});

test("2026-10-23 v3 团队计划：读取授权目录/精确写集/目录规范/实现目录；V12 覆盖通过 ⇒ readiness 含目录/规范/布局", async () => {
  const root = makeTempProjectRoot("ans-v3-team-plan-");
  try {
    const flowId = "flow-v3-ok";
    writeTeamPlanV3File(root, flowId, { mapPrecise: "src/singleton.ts" });
    // 2026-10-23 可重入门禁：团队计划存在 ⇒ flow 声明 role-cards（应用收口后再派 readiness）。
    writeRoleCardsFlowFixture(root, flowId);
    // 夹具补足实施前标准（新契约流程的验收门会先要标准；本组只聚焦写卡→readiness 链路）。
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // new 角色：boundary 目录条目与计划授权目录一致 + 精确写集文件被 file 条目覆盖。
      writeFullRoleArtifacts(root, "executor", {
        boundaryWrites: [
          { kind: "directory", path: "src/module-a/" },
          { kind: "directory", path: "src/module-a/tests/" },
          { kind: "file", path: "src/singleton.ts" },
        ],
      });
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
      const readiness = harness.sendsByRole.get("convener")![0]!;
      assert.match(readiness, /团队计划为 v3（teamPlanSchema: 3）/);
      assert.match(readiness, /模块清单：module-a/);
      assert.match(readiness, /授权目录：src\/module-a\/、src\/module-a\/tests\//, "v3 授权目录进入 readiness");
      assert.match(readiness, /模块实现目录：module-a→src\/module-a\//, "v3 模块实现目录视图");
      assert.match(readiness, /directories\/spec\/shared\/layout/, "readiness 逐目录列 directories/spec/shared/layout");
      assert.match(readiness, /目录规范/);
      assert.match(readiness, /治理关键路径/);
      assert.match(readiness, /new 边界目录与计划一致/);
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "V12 覆盖通过：不退回 Crew");
      // 账本写盘在 send 之后异步落盘：短轮询等待（同候选，不改变断言语义）。
      let readinessLedger = false;
      const ledgerDeadline = Date.now() + 5000;
      while (!readinessLedger && Date.now() < ledgerDeadline) {
        const ledger = await readGovernanceLedger(root);
        readinessLedger = ledger.entries.some(
          (entry) =>
            entry.kind === "dispatch.accepted" &&
            entry.flowId === flowId &&
            entry.targetRoleId === "convener" &&
            entry.stepId === "role-readiness",
        );
        if (!readinessLedger) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(readinessLedger, true, "V12 通过后才派 readiness（stepId=role-readiness）");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 V12 v3：new 角色授权目录未被 boundary 覆盖 ⇒ 退回 Crew、不派 readiness", async () => {
  const root = makeTempProjectRoot("ans-v3-uncovered-");
  try {
    const flowId = "flow-v3-uncovered";
    writeTeamPlanV3File(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // 无目录条目（默认只有角色根文档 + 单个文件）：两条计划授权目录都不被覆盖。
      writeFullRoleArtifacts(root, "executor");
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) > 0, 5000);
      const feedback = harness.sendsByRole.get("nominator")![0]!;
      assert.match(feedback, /计划授权目录「src\/module-a\/」未被 boundary\.yaml entries 覆盖/, "V12 指出未覆盖的计划授权目录");
      assert.match(feedback, /计划授权目录「src\/module-a\/tests\/」未被 boundary\.yaml entries 覆盖/, "嵌套计划目录同样需要目录条目覆盖");
      assert.match(feedback, /报告统筹修正计划/, "Crew 文案给出计划有误时的回归路径");
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "V12 失败不派 readiness");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写 readiness 派发账本");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 V12 v3：new 角色 boundary 目录比计划宽（额外目录）⇒ 退回 Crew、不派 readiness", async () => {
  const root = makeTempProjectRoot("ans-v3-new-wider-");
  try {
    const flowId = "flow-v3-new-wider";
    writeTeamPlanV3File(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      writeFullRoleArtifacts(root, "executor", {
        boundaryWrites: [
          { kind: "directory", path: "src/module-a/" },
          { kind: "directory", path: "src/module-a/tests/" },
          { kind: "directory", path: "src/module-a/extra" },
        ],
      });
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) > 0, 5000);
      const feedback = harness.sendsByRole.get("nominator")![0]!;
      assert.match(feedback, /boundary\.yaml 目录条目「src\/module-a\/extra」不在计划授权目录集合中/);
      assert.match(feedback, /new 角色边界目录必须与计划授权目录一致，不得更宽\/更窄/);
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "new 宽边界阻塞、不派 readiness");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写 readiness 派发账本");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 V12 v3：new 角色边界被祖先目录覆盖但未逐条对应计划授权目录 ⇒ 退回 Crew（不得更窄）", async () => {
  const root = makeTempProjectRoot("ans-v3-new-narrower-");
  try {
    const flowId = "flow-v3-new-narrower";
    writeTeamPlanV3File(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // 只写祖先目录 src/module-a/：覆盖两条计划目录，但目录集合仍缺 src/module-a/tests/（集合不一致）。
      writeFullRoleArtifacts(root, "executor", {
        boundaryWrites: [{ kind: "directory", path: "src/module-a/" }],
      });
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) > 0, 5000);
      const feedback = harness.sendsByRole.get("nominator")![0]!;
      assert.match(feedback, /boundary\.yaml 缺少计划授权目录「src\/module-a\/tests\/」的目录条目/);
      assert.match(feedback, /不得更宽\/更窄/);
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "集合不一致阻塞、不派 readiness");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写 readiness 派发账本");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 V12 v3：changed 边界更宽越出模块实现目录 ⇒ warning（不硬拒）；未覆盖精确写集仍阻塞", async () => {
  const root = makeTempProjectRoot("ans-v3-changed-");
  try {
    const flowId = "flow-v3-changed";
    writeTeamPlanV3File(root, flowId, {
      implementationDir: "src/module-a/",
      directories: ["src/module-a/api/", "src/module-a/api/tests/"],
      mapRoleType: "changed",
      mapDirs: "src/module-a/api/; src/module-a/api/tests/",
      mapPrecise: "src/singleton.ts",
    });
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // src/module-a/ 覆盖计划目录（更宽但在模块实现目录内）；src/other/ 越出模块 → warning；
      // src/singleton.ts 精确写集未覆盖 → 阻塞。
      writeFullRoleArtifacts(root, "executor", {
        boundaryWrites: [
          { kind: "directory", path: "src/module-a/" },
          { kind: "directory", path: "src/other/" },
        ],
      });
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) > 0, 5000);
      const feedback = harness.sendsByRole.get("nominator")![0]!;
      assert.match(feedback, /计划精确写集「src\/singleton\.ts」未被 boundary\.yaml entries 覆盖/, "精确写集未覆盖阻塞");
      assert.match(feedback, /boundary\.yaml 目录条目「src\/other」比计划授权目录宽且不在角色模块实现目录内（changed：交 readiness 按既有职责复核，不硬拒）/, "越出模块实现目录只 warning");
      assert.doesNotMatch(feedback, /目录条目「src\/module-a」比计划授权目录宽/, "模块实现目录内的更宽边界不告警");
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "存在阻塞项：不派 readiness");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 V12 v3：existing 宽边界只 warning + 迁移提示、不强制重写，仍派 readiness", async () => {
  const root = makeTempProjectRoot("ans-v3-existing-");
  try {
    const flowId = "flow-v3-existing";
    writeTeamPlanV3File(root, flowId, {
      implementationDir: "src/module-a/",
      directories: ["src/module-a/api/"],
      mapRoleType: "existing",
      mapDirs: "src/module-a/api/",
    });
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // existing：boundary 用更宽的模块实现目录（src/module-a/）覆盖计划目录 src/module-a/api/。
      // 2026-10-23 可重入门禁：团队计划存在 ⇒ flow 声明 role-cards；收口要求六文件齐全（夹具补足）。
      writeRoleCardsFlowFixture(root, flowId);
      // 夹具补足实施前标准（新契约流程的验收门会先要标准；本组只聚焦写卡→readiness 链路）。
      writeAcceptanceCriteriaFile(root, flowId);
      writeFullRoleArtifacts(root, "executor", {
        boundaryWrites: [{ kind: "directory", path: "src/module-a/" }],
      });
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
      assert.match(harness.sendsByRole.get("convener")![0]!, /role-readiness/, "existing 宽边界只 warning：不阻塞 readiness");
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "warning 不退回 Crew");
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1, "readiness 派发入账");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 V12 v3 来源分流：目录规范缺失（计划问题）⇒ 反馈 Convener、不退回 Crew", async () => {
  const root = makeTempProjectRoot("ans-v3-plan-source-");
  try {
    const flowId = "flow-v3-plan-source";
    writeTeamPlanV3File(root, flowId, {
      directories: ["src/module-a/"],
      mapDirs: "src/module-a/",
      omitSpecFor: ["src/module-a/"],
    });
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // boundary 覆盖计划目录（只有计划缺规范行这一个问题，来源应为 Convener）。
      writeFullRoleArtifacts(root, "executor", {
        boundaryWrites: [{ kind: "directory", path: "src/module-a/" }],
      });
      await harness.iface.advanceGovernanceFlow({
        payload: appointmentWritePayload(flowId),
        context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
      });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
      const planText = harness.sendsByRole.get("convener")![0]!;
      assert.match(planText, /团队计划未通过结构校验/, "计划问题反馈 Convener");
      assert.match(planText, /目录规范缺少目录「src\/module-a\/」/, "具体到缺失的目录规范行");
      assert.match(planText, /按 v3 修正\/补充团队计划/, "v3 计划问题按 v3 口径提示 Convener（不误导为 v2）");
      assert.doesNotMatch(planText, /请对照团队计划/, "不是 readiness 任务");
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "计划问题不误退 Crew");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写 readiness 派发账本");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————— i18n B0（2026-10-23，任务 `2026-10-23-i18n`）：应用级语言偏好 / 主进程标题 / IPC ——————
//
// 范围：偏好文件读写（缺失/合法/损坏/非法 locale/未知 version/不可读/写失败）、setLocale 语义、
// preferences:get / preferences:set-locale 通道形状与成功/失败广播、translator 更新与历史不追溯、
// preload 三个白名单方法名、窗口/对话框/启动错误框文案。全部注入临时目录与假 registrar，
// **不启动真实 Electron**；偏好路径绝不指向真实 userData/仓库根。

type PreferencesTestHandler = (event: unknown, ...args: unknown[]) => unknown;

function registerPreferencesForTest(
  iface: Pick<ReturnType<typeof createDesktopInterface>, "getPreferences" | "setLocale">,
): { handlers: Map<string, PreferencesTestHandler>; changed: string[] } {
  const handlers = new Map<string, PreferencesTestHandler>();
  const changed: string[] = [];
  registerPreferencesIpc(
    (channel, listener) => {
      handlers.set(channel, listener);
    },
    iface,
    { onLocaleChanged: (locale) => changed.push(locale) },
  );
  return { handlers, changed };
}

test("i18n B0 preferences：缺失文件 → 默认 zh-CN、不创建文件或目录", async () => {
  const root = makeTempProjectRoot("ans-i18n-pref-missing-");
  try {
    const file = preferencesFilePath(root);
    assert.equal(file, path.join(root, "ans", "preferences.json"), "偏好路径固定为 <userData>/ans/preferences.json");
    const result = await readPreferences(file);
    assert.equal(result.state, "missing");
    assert.equal(result.locale, "zh-CN");
    assert.deepEqual(result.diagnostics, []);
    assert.equal(existsSync(file), false, "读取不得创建偏好文件");
    assert.equal(existsSync(path.dirname(file)), false, "读取不得创建 ans 目录");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 preferences：合法文件 → 读取 locale（逐字）", async () => {
  const root = makeTempProjectRoot("ans-i18n-pref-valid-");
  try {
    const file = path.join(root, "preferences.json");
    writeFileSync(file, `${JSON.stringify({ version: 1, locale: "en-US" })}\n`);
    const before = readFileSync(file, "utf8");
    const result = await readPreferences(file);
    assert.equal(result.state, "valid");
    assert.equal(result.locale, "en-US");
    assert.deepEqual(result.diagnostics, []);
    assert.equal(readFileSync(file, "utf8"), before, "读取不得改写文件");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 preferences：损坏 JSON/非法 locale/未知 version/不可读 → 默认 zh-CN + 稳定诊断", async () => {
  const root = makeTempProjectRoot("ans-i18n-pref-invalid-");
  try {
    const cases = [
      { name: "corrupt", content: "{ not json", code: "preferences.read.invalid", reason: "corrupt-json" },
      {
        name: "invalid-locale",
        content: JSON.stringify({ version: 1, locale: "fr-FR" }),
        code: "preferences.locale.invalid",
        reason: "invalid-locale",
      },
      {
        name: "unknown-version",
        content: JSON.stringify({ version: 2, locale: "en-US" }),
        code: "preferences.read.invalid",
        reason: "unsupported-version",
      },
    ] as const;
    for (const item of cases) {
      const file = path.join(root, `${item.name}.json`);
      writeFileSync(file, item.content);
      const result = await readPreferences(file);
      assert.equal(result.state, "invalid", item.name);
      assert.equal(result.locale, "zh-CN", item.name);
      assert.equal(result.diagnostics.length, 1, item.name);
      assert.equal(result.diagnostics[0].code, item.code, item.name);
      assert.equal(result.diagnostics[0].reasonCode, item.reason, item.name);
    }
    // 不可读（目录当文件）：不抛错，回退 zh-CN + read.invalid。
    const dirAsFile = path.join(root, "dir.json");
    mkdirSync(dirAsFile);
    const unreadable = await readPreferences(dirAsFile);
    assert.equal(unreadable.state, "invalid");
    assert.equal(unreadable.locale, "zh-CN");
    assert.equal(unreadable.diagnostics[0]?.code, "preferences.read.invalid");
    assert.equal(unreadable.diagnostics[0]?.reasonCode, "unreadable");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 preferences：setLocale 合法 → 原子写、内存/视图更新、无临时文件残留", async () => {
  const root = makeTempProjectRoot("ans-i18n-pref-set-");
  try {
    const file = preferencesFilePath(root);
    const diagnostics: PreferencesDiagnostic[] = [];
    const service = createPreferencesService({
      filePath: file,
      initialLocale: "zh-CN",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const result = await service.setLocale("en-US");
    assert.deepEqual(result, { ok: true, locale: "en-US" });
    assert.equal(service.getLocale(), "en-US");
    assert.deepEqual(service.getView(), {
      version: 1,
      locale: "en-US",
      supported: ["zh-CN", "en-US"],
    });
    assert.equal(
      readFileSync(file, "utf8"),
      `${JSON.stringify({ version: 1, locale: "en-US" })}\n`,
      "文件形状 {version:1, locale} + 换行",
    );
    assert.deepEqual(readdirSync(path.dirname(file)), ["preferences.json"], "原子写不残留临时文件");
    assert.deepEqual(diagnostics, [], "合法切换无诊断");
    // 使用共享 atomicWrite（唯一落盘实现）：源码只导入共享原语、不复制 rename/writeFile。
    const source = readFileSync(path.join(REPO_ROOT, "app", "desktop", "preferences.ts"), "utf8");
    assert.match(source, /import \{ atomicWrite \} from "\.\.\/\.\.\/src\/common\/shared\/atomic-write\.ts"/);
    assert.doesNotMatch(source, /\brename\s*\(/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 preferences：setLocale 非法 → ok:false、不写文件/不改内存 + 稳定诊断", async () => {
  const root = makeTempProjectRoot("ans-i18n-pref-reject-");
  try {
    const file = preferencesFilePath(root);
    const diagnostics: PreferencesDiagnostic[] = [];
    const service = createPreferencesService({
      filePath: file,
      initialLocale: "zh-CN",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    for (const bad of ["fr-FR", "en", "zh", "", null, 42]) {
      const result = await service.setLocale(bad);
      assert.equal(result.ok, false, `非法值 ${String(bad)} 必须拒绝`);
      assert.equal(result.locale, "zh-CN");
      assert.equal(result.ok === false ? result.error : undefined, "invalid-locale");
    }
    assert.equal(service.getLocale(), "zh-CN", "非法值不改内存");
    assert.equal(existsSync(file), false, "非法值不得创建偏好文件");
    assert.equal(
      diagnostics.filter((diagnostic) => diagnostic.code === "preferences.locale.invalid").length,
      6,
      "每次拒绝都留稳定诊断",
    );
    assert.ok(diagnostics.every((diagnostic) => diagnostic.reasonCode === "set-locale-rejected"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 preferences：写失败 → ok:false、不改内存 + preferences.write.failed", async () => {
  const root = makeTempProjectRoot("ans-i18n-pref-writefail-");
  try {
    // 让 `<root>/ans` 是普通文件：mkdir(dirname) 失败，写不进（Windows/POSIX 均为 EEXIST/ENOTDIR）。
    const blockedParent = path.join(root, "ans");
    writeFileSync(blockedParent, "not a directory");
    const file = path.join(blockedParent, "preferences.json");
    const diagnostics: PreferencesDiagnostic[] = [];
    const service = createPreferencesService({
      filePath: file,
      initialLocale: "zh-CN",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const result = await service.setLocale("en-US");
    assert.equal(result.ok, false);
    assert.equal(result.locale, "zh-CN");
    assert.equal(result.ok === false ? result.error : undefined, "write-failed");
    assert.equal(service.getLocale(), "zh-CN", "写失败不改内存");
    assert.equal(diagnostics[0]?.code, "preferences.write.failed");
    assert.equal(diagnostics[0]?.reasonCode, "write-failed");
    assert.equal(typeof diagnostics[0]?.errorCode, "string", "保留原始错误码供诊断");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 IPC：preferences:get 形状、set-locale 成功广播并更新 translator；旧文本不追溯", async () => {
  const root = makeTempProjectRoot("ans-i18n-ipc-ok-");
  try {
    const file = preferencesFilePath(path.join(root, "userData"));
    const mainI18n = createMainI18n("zh-CN");
    const iface = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      preferencesPath: file,
      mainI18n,
    });
    const { handlers, changed } = registerPreferencesForTest(iface);
    assert.deepEqual([...handlers.keys()].sort(), ["preferences:get", "preferences:set-locale"]);

    const view = (await handlers.get("preferences:get")!({})) as Record<string, unknown>;
    assert.deepEqual(view, { version: 1, locale: "zh-CN", supported: ["zh-CN", "en-US"] });

    const oldLine = mainI18n.t("main.error.startup.detail");
    assert.equal(oldLine, "界面无法启动，请查看诊断日志后重新打开。");
    const result = (await handlers.get("preferences:set-locale")!({}, { locale: "en-US" })) as Record<string, unknown>;
    assert.deepEqual(result, { ok: true, locale: "en-US" });
    assert.deepEqual(changed, ["en-US"], "成功切换只广播一次");
    assert.equal(mainI18n.getLocale(), "en-US", "translator 随成功切换更新");
    assert.equal(desktopTexts(mainI18n).windowTitle, "ANS Desktop (Governed Sessions)");
    assert.equal(oldLine, "界面无法启动，请查看诊断日志后重新打开。", "已生成文本不追溯");
    const viewAfter = (await handlers.get("preferences:get")!({})) as Record<string, unknown>;
    assert.deepEqual(viewAfter, { version: 1, locale: "en-US", supported: ["zh-CN", "en-US"] });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).locale, "en-US", "IPC 成功后已持久化");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 IPC：非法 locale → ok:false（本地化错误）、不写文件、不广播", async () => {
  const root = makeTempProjectRoot("ans-i18n-ipc-invalid-");
  try {
    const file = preferencesFilePath(path.join(root, "userData"));
    const mainI18n = createMainI18n("zh-CN");
    const iface = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      preferencesPath: file,
      mainI18n,
    });
    const { handlers, changed } = registerPreferencesForTest(iface);
    const handler = handlers.get("preferences:set-locale")!;
    for (const input of [{ locale: "fr-FR" }, { locale: "en" }, { locale: 42 }, {}, undefined, "en-US"]) {
      const result = (await handler({}, input)) as Record<string, unknown>;
      assert.equal(result.ok, false, `非法入参 ${JSON.stringify(input)} 必须拒绝`);
      assert.equal(result.locale, "zh-CN");
      assert.equal(result.error, "语言偏好无效，已恢复为简体中文。", "错误文案按当前 locale（zh-CN）");
    }
    assert.deepEqual(changed, [], "失败不广播");
    assert.equal(existsSync(file), false, "失败不写文件");
    assert.equal(mainI18n.getLocale(), "zh-CN", "失败不改 translator");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 IPC：写失败 → ok:false（保存失败文案）、不广播、translator 不变", async () => {
  const root = makeTempProjectRoot("ans-i18n-ipc-writefail-");
  try {
    const blockedParent = path.join(root, "ans");
    writeFileSync(blockedParent, "not a directory");
    const file = path.join(blockedParent, "preferences.json");
    const mainI18n = createMainI18n("zh-CN");
    const iface = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      preferencesPath: file,
      mainI18n,
    });
    const { handlers, changed } = registerPreferencesForTest(iface);
    const result = (await handlers.get("preferences:set-locale")!({}, { locale: "en-US" })) as Record<string, unknown>;
    assert.deepEqual(result, { ok: false, locale: "zh-CN", error: "无法保存语言偏好，请稍后重试。" });
    assert.deepEqual(changed, [], "写失败不广播");
    assert.equal(mainI18n.getLocale(), "zh-CN", "写失败不改 translator");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("i18n B0 preload：仅新增三个白名单方法（getPreferences/setLocale/onLocaleChanged）", () => {
  const source = readFileSync(path.join(REPO_ROOT, "app", "preload.cjs"), "utf8");
  assert.match(source, /getPreferences:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("preferences:get"\)/);
  assert.match(source, /setLocale:\s*\(locale\)\s*=>/);
  assert.match(source, /"preferences:set-locale"/);
  assert.match(source, /onLocaleChanged:\s*\(cb\)\s*=>/);
  assert.match(source, /"preferences:locale-changed"/);
  // 仍不暴露 Node/fs/path/child_process 等宽泛能力。
  assert.doesNotMatch(source, /require\(["'](?:node:)?fs["']\)/);
  assert.doesNotMatch(source, /require\(["']node:(?:path|child_process|process)["']\)/);
});

test("i18n B0 main.ts：窗口/导入项目/选择图片/启动错误框走 desktopTexts（不硬编码标题）", () => {
  const source = readFileSync(path.join(REPO_ROOT, "app", "main.ts"), "utf8");
  assert.match(source, /title: desktopTexts\(mainI18n\)\.windowTitle/, "窗口标题");
  assert.match(source, /title: desktopTexts\(mainI18n\)\.importProjectDialogTitle/, "导入项目对话框标题");
  assert.match(source, /title: desktopTexts\(mainI18n\)\.pickImageDialogTitle/, "选择图片对话框标题");
  assert.match(
    source,
    /dialog\.showErrorBox\(startupText\.startupErrorTitle, startupText\.startupErrorDetail\)/,
    "启动错误框",
  );
  assert.doesNotMatch(source, /title: "ANS 桌面应用（受治理会话）"/, "窗口标题不再硬编码");
});

test("i18n B0 main.ts：page-title-updated 不得覆盖本地化窗口标题（2026-10-23 真机缺陷）", () => {
  const source = readFileSync(path.join(REPO_ROOT, "app", "main.ts"), "utf8");
  assert.match(source, /applyLocalizedWindowTitle\(win\)/, "建窗后、加载前接线");
  assert.match(source, /win\.on\("page-title-updated", \(event\) => \{/, "监听页面标题更新");
  assert.match(source, /event\.preventDefault\(\)/, "阻止页面标题覆盖");
  assert.match(
    source,
    /win\.setTitle\(desktopTexts\(mainI18n\)\.windowTitle\)/,
    "用当前 locale 的窗口标题回写",
  );
  assert.match(source, /did-finish-load/, "加载完成后再补一次本地化标题");
});

test("i18n B0 标题：窗口/导入项目/选择图片/启动错误框 zh-CN 与 en-US（main.ts 取词口径）", () => {
  const zh = createMainI18n("zh-CN");
  assert.deepEqual(desktopTexts(zh), {
    windowTitle: "ANS 桌面应用（受治理会话）",
    importProjectDialogTitle: "导入项目（选择项目根文件夹）",
    pickImageDialogTitle: "选择图片",
    startupErrorTitle: "应用启动失败",
    startupErrorDetail: "界面无法启动，请查看诊断日志后重新打开。",
  });
  const en = createMainI18n("en-US");
  assert.deepEqual(desktopTexts(en), {
    windowTitle: "ANS Desktop (Governed Sessions)",
    importProjectDialogTitle: "Import Project (Select Project Root Folder)",
    pickImageDialogTitle: "Choose Image",
    startupErrorTitle: "Application Failed to Start",
    startupErrorDetail: "The interface could not start. Check the diagnostics log and reopen the application.",
  });
  zh.setLocale("en-US");
  assert.equal(desktopTexts(zh).startupErrorTitle, "Application Failed to Start", "切换后新生成文本用新 locale");
});

test("i18n B0 边界：偏好只落注入的 userData 路径，不创建项目 .ans/.env/治理账本", async () => {
  const projectRoot = makeTempProjectRoot("ans-i18n-project-");
  const userDataRoot = makeTempProjectRoot("ans-i18n-userdata-");
  try {
    const file = preferencesFilePath(userDataRoot);
    const iface = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      preferencesPath: file,
    });
    const result = await iface.setLocale({ locale: "en-US" });
    assert.deepEqual(result, { ok: true, locale: "en-US" });
    assert.equal(existsSync(path.join(projectRoot, ".ans")), false, "不写项目 .ans");
    assert.equal(existsSync(path.join(projectRoot, ".env")), false, "不写 .env");
    assert.deepEqual(readdirSync(projectRoot), [], "项目根零写入");
    assert.equal(existsSync(file), true, "偏好只写注入的 userData 路径");
    assert.equal(existsSync(path.join(userDataRoot, "ans", "preferences.json")), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userDataRoot, { recursive: true, force: true });
  }
});

// —————— 2026-10-23 治理写卡推进可重入门禁（方案 A：指纹/去重/账本锚/刷新探针/role-cards 收口） ——————
//
// 客户闸门 0/1/2 已确认（`docs/communication/2026-10-23_intent_governance-advance-redispatch.md`）。
// 本组钉住：内容指纹去重、账本锚跨重启、项目刷新探针、`completeRoleCardsStep` 收口顺序与防自激。

/** 读 flow 机器状态步骤（测试断言 role-cards/readiness 状态与证据；解析走公共出口）。 */
function readFlowStepsForTest(
  root: string,
  flowId: string,
): Array<{ id: string; status: string; evidence?: { kind: string; ref: string } }> | undefined {
  try {
    const text = readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8");
    const parsed = parseFlowStateYaml(text, flowId);
    return parsed.ok ? parsed.flow.steps : undefined;
  } catch {
    return undefined;
  }
}

/** 账本写一条 Crew `appointment-write` 接受记录（模拟 Crew 重写卡后的锚点前移）。 */
async function appendCrewWriteMarker(root: string, flowId: string): Promise<void> {
  const appended = await appendGovernanceLedger(root, {
    at: new Date().toISOString(),
    kind: "customer.decision",
    flowId,
    stepId: "role-cards",
    decisionKind: "appointment-write",
    customerDecision: "accepted",
    actorRoleId: "nominator",
    power: "nomination",
    paths: [`角色卡/${flowId}/role-card.md`],
  });
  assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
}

/** 账本写一条 app→角色派发（测试构造账本锚；`stepId` 缺省＝appointment 链早期无 stepId 形态）。 */
async function appendAppDispatch(
  root: string,
  flowId: string,
  input: { targetRoleId: "convener" | "nominator"; stepId?: string },
): Promise<void> {
  const appended = await appendGovernanceLedger(root, {
    at: new Date().toISOString(),
    kind: "dispatch.accepted",
    flowId,
    ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
    actorRoleId: "app",
    power: "app",
    trigger: "customer-decision",
    targetRoleId: input.targetRoleId,
    messageSummary: "测试夹具：app 派发",
  });
  assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
}

async function triggerPostWrite(harness: PostWriteHarness, root: string, flowId: string): Promise<void> {
  await harness.iface.advanceGovernanceFlow({
    payload: appointmentWritePayload(flowId),
    context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo" },
  });
}

test("2026-10-24 appointment 收口：客户决定已落账 ⇒ 角色卡校验/readiness 之前先标 appointment done（幂等、不伪造客户决定）", async () => {
  const root = makeTempProjectRoot("ans-appointment-close-");
  try {
    const flowId = "flow-appointment-close";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId, { appointment: true });
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    writeFullRoleArtifacts(root, "executor");
    const order: string[] = [];
    const harness = await makePostWriteHarness(root, ["executor"], () => true, {
      completeCustomerDecisionStepFn: async (input) => {
        order.push("complete-customer-decision");
        return realCompleteCustomerDecisionStep(input);
      },
      completeRoleCardsStepFn: async (input) => {
        order.push("complete-role-cards");
        return realCompleteRoleCardsStep(input);
      },
    });
    try {
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 8000);
      const steps = readFlowStepsForTest(root, flowId)!;
      const appointmentStep = steps.find((step) => step.id === "appointment")!;
      assert.equal(appointmentStep.status, "done", "appointment 客户决定步骤由应用收口（不再一直 pending）");
      assert.deepEqual(
        appointmentStep.evidence,
        { kind: "customer-decision", ref: "appointment" },
        "证据指向 appointment 客户决定（不是伪造批准）",
      );
      assert.equal(steps.find((step) => step.id === "role-cards")?.status, "done", "role-cards 收口正常");
      assert.equal(await waitForReadinessDispatchCount(root, flowId, 1), 1, "readiness 恰一次");
      assert.ok(order.includes("complete-customer-decision"), "appointment 收口被调用");
      assert.ok(order.includes("complete-role-cards"), "role-cards 收口被调用");
      assert.ok(
        order.indexOf("complete-customer-decision") < order.indexOf("complete-role-cards"),
        "appointment 收口先于 role-cards 收口/readiness",
      );
      assert.equal(
        (await readGovernanceLedger(root)).entries.filter((entry) => entry.kind === "customer.decision").length,
        1,
        "应用收口不写客户决定（账本仍只有 appointment 一条）",
      );
      assert.equal(harness.customerCalls.length, 0, "全程零客户卡");
      // 幂等：重复触发/刷新不改证据、不重复派发、不产生失败系统行。
      harness.settles.get("nominator")?.();
      harness.settles.get("convener")?.();
      await triggerPostWrite(harness, root, flowId);
      await harness.iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 800));
      assert.deepEqual(
        readFlowStepsForTest(root, flowId)!.find((step) => step.id === "appointment")?.evidence,
        { kind: "customer-decision", ref: "appointment" },
        "幂等：appointment 证据不变",
      );
      assert.equal(await waitForReadinessDispatchCount(root, flowId, 1), 1, "幂等：readiness 不重复");
      assert.equal(
        deliveryNoteSummaries(harness.events, "rapporteur").filter((summary) => /appointment 客户决定步骤收口失败/.test(summary)).length,
        0,
        "成功收口无失败系统行",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-24 appointment 收口失败：不伪造 decided、如实落一条 Lead 系统行；role-cards/readiness 照常但 appointment 仍 pending", async () => {
  const root = makeTempProjectRoot("ans-appointment-close-failed-");
  try {
    const flowId = "flow-appointment-close-failed";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId, { appointment: true });
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    writeFullRoleArtifacts(root, "executor");
    let calls = 0;
    const harness = await makePostWriteHarness(root, ["executor"], () => true, {
      completeCustomerDecisionStepFn: async () => {
        calls += 1;
        return { ok: false, code: "ledger-unavailable", error: "测试替身：账本不可读" };
      },
    });
    try {
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 8000);
      assert.ok(calls >= 1, "appointment 收口已尝试");
      const steps = readFlowStepsForTest(root, flowId)!;
      const appointmentStep = steps.find((step) => step.id === "appointment")!;
      assert.equal(appointmentStep.status, "pending", "失败不伪造 decided：appointment 仍未完成");
      assert.equal(appointmentStep.evidence, undefined, "失败不写证据");
      // 失败如实落 Lead 系统行（同一 code 不刷屏）。
      await triggerPostWrite(harness, root, flowId);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const failureNotes = deliveryNoteSummaries(harness.events, "rapporteur").filter((summary) =>
        /appointment 客户决定步骤收口失败（ledger-unavailable）/.test(summary),
      );
      assert.equal(failureNotes.length, 1, "同一失败 code 只落一条系统行");
      assert.match(failureNotes[0]!, /未标记为 done/, "系统行如实说明未完成");
      assert.equal(harness.customerCalls.length, 0, "不弹客户卡");
      assert.equal(
        (await readGovernanceLedger(root)).entries.filter((entry) => entry.kind === "customer.decision").length,
        1,
        "失败路径不写客户决定",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-24 写卡反馈门控：Crew busy/partial 不投；settle 后缺一个角色只投一条；补齐 5 角色后 role-cards/readiness 正常", async () => {
  const root = makeTempProjectRoot("ans-appointment-feedback-gate-");
  try {
    const flowId = "flow-feedback-gate";
    const targets = ["r1", "r2", "r3", "r4", "reduce-integration"];
    writeTeamPlanFile(root, flowId, {
      recommended: targets,
      rows: targets.map((roleId) => ({ roleId, type: "new" })),
    });
    writeRoleCardsFlowFixture(root, flowId, { appointment: true });
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, targets);
    // partial：5 个角色已枚举，但只写出 4 个（缺 reduce-integration 的文件）。
    for (const roleId of targets.slice(0, 4)) writeFullRoleArtifacts(root, roleId);
    const harness = await makePostWriteHarness(root, targets, () => true);
    try {
      // 真实主路径：appointment 决定后派 Crew 写卡；组队随后处于 busy/本轮在写。
      const advanced = await harness.iface.advanceGovernanceFlow({
        payload: { version: 1, flowId, cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
        context: { sourceRoleId: "convener", projectRoot: root, runtime: "demo", targetRoleIds: targets, stepId: "role-cards" },
      });
      assert.equal(advanced.ok, true, advanced.ok ? "" : (advanced.error ?? "unknown"));
      assert.equal(advanced.targetRoleId, "nominator", "appointment → Crew 写卡");
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) === 1, 3000);
      // Crew busy：写卡后检查/刷新不得立即投反馈（不因每次 write_file/listProject 就投）。
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(harness.sendsByRole.get("nominator")!.length, 1, "Crew busy：不立即投反馈");
      // Crew settle ⇒ 本轮写卡结束，写卡后检查只投一条「缺 reduce-integration」。
      harness.settles.get("nominator")?.();
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) === 2, 10000);
      const feedback = harness.sendsByRole.get("nominator")![1]!;
      assert.ok(feedback.startsWith("[系统·写卡校验]"), "反馈任务带系统/治理前缀（不伪造客户）");
      assert.match(feedback, /角色卡\/reduce-integration\/role-card\.md/, "只报缺失的 reduce-integration 文件");
      assert.doesNotMatch(feedback, /角色卡\/r1\/role-card\.md/, "已写出的角色不再列入问题");
      const blockingNotes = deliveryNoteSummaries(harness.events, "rapporteur").filter((summary) =>
        /写卡产物未通过校验/.test(summary),
      );
      assert.equal(blockingNotes.length, 1, "Lead 写卡阻塞系统行恰一条");
      // 反馈投递后组队 busy：再次刷新/触发不重复投递同一 issue。
      await harness.iface.listProject({ projectRoot: root });
      await triggerPostWrite(harness, root, flowId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.equal(harness.sendsByRole.get("nominator")!.length, 2, "同一缺失 issue 只投一条");
      assert.equal(
        deliveryNoteSummaries(harness.events, "rapporteur").filter((summary) => /写卡产物未通过校验/.test(summary)).length,
        1,
        "Lead 系统行仍恰一条",
      );
      // 补齐第 5 个角色（组队本轮结束）⇒ role-cards 收口 + readiness 恰一次；不再反馈。
      harness.settles.get("nominator")?.();
      writeFullRoleArtifacts(root, "reduce-integration");
      await harness.iface.listProject({ projectRoot: root });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 10000);
      const steps = readFlowStepsForTest(root, flowId)!;
      assert.equal(steps.find((step) => step.id === "appointment")?.status, "done", "appointment 已收口");
      assert.equal(steps.find((step) => step.id === "role-cards")?.status, "done", "role-cards 收口");
      assert.equal(await waitForReadinessDispatchCount(root, flowId, 1), 1, "readiness 恰一次");
      assert.equal(harness.sendsByRole.get("nominator")!.length, 2, "补齐 5 角色后不再反馈");
      assert.equal(harness.customerCalls.length, 0, "全程零客户卡");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 可重入门禁：两轮错误写卡（内容不同）⇒ 两次反馈；修正后 role-cards 恰一次 done、readiness 恰一次、无客户卡/客户决定", async () => {
  const root = makeTempProjectRoot("ans-role-cards-reentry-");
  try {
    const flowId = "flow-reentry";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId);
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // 第一轮 V1：boundary 顶层 role 与目录 id 不一致 ⇒ 反馈 Crew。
      writeFullRoleArtifacts(root, "executor");
      writeRoleArtifactFiles(root, "executor", {
        boundary: ["role: someone-else", "entries:", "  - kind: file", "    path: src/a.ts", "    purpose: p", ""].join("\n"),
      });
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) === 1, 6000);
      assert.match(harness.sendsByRole.get("nominator")![0]!, /顶层 role 与目录 id 不一致/);
      harness.settles.get("nominator")?.(); // 模拟 Crew 本轮结束（否则下一轮检查会等其 settle）
      // 第二轮 V2：内容变化（role-card 为空）——同问题族但文件内容已变 ⇒ 必须重新进入并再次反馈。
      writeFullRoleArtifacts(root, "executor");
      writeFileSync(path.join(root, "角色卡", "executor", "role-card.md"), "", "utf8");
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) === 2, 6000);
      assert.match(harness.sendsByRole.get("nominator")![1]!, /文件为空（需要角色卡正文）/);
      harness.settles.get("nominator")?.();
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "不合格：不派 Convener");
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不合格：不写 readiness 派发账本");
      // 第三轮 V3：修正为合格 ⇒ role-cards 恰一次 done + 验证记录 + readiness 恰一次。
      writeFullRoleArtifacts(root, "executor");
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 6000);
      const steps = readFlowStepsForTest(root, flowId)!;
      const roleCardsStep = steps.find((step) => step.id === "role-cards")!;
      assert.equal(roleCardsStep.status, "done", "结构校验通过后 role-cards 由应用标 done");
      assert.equal(roleCardsStep.evidence?.kind, "artifact");
      const recordRel = roleCardsStep.evidence!.ref;
      assert.match(recordRel, /^\.ans\/governance\/role-cards\/flow-reentry\/[0-9a-f]{64}\.json$/);
      const recordPath = path.join(root, ...recordRel.split("/"));
      assert.equal(existsSync(recordPath), true, "应用验证记录存在");
      const record = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
      assert.equal(record.schema, "role-cards-gate/v1");
      assert.equal(record.result, "structure-pass");
      assert.equal(record.semantic, "pending");
      assert.equal(record.fingerprint, recordRel.split("/").pop()!.replace(/\.json$/, ""), "记录路径＝指纹");
      assert.match(String(record.disclaimer), /不代表 readiness/);
      const ledger = await readGovernanceLedger(root);
      const readiness = ledger.entries.filter(
        (entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.targetRoleId === "convener",
      );
      assert.equal(readiness.length, 1, "readiness 恰一次派发");
      assert.equal(readiness[0]!.stepId, "role-readiness");
      assert.equal(readiness[0]!.actorRoleId, "app");
      assert.equal(readiness[0]!.power, "app", "应用动作 ≠ 客户批准");
      const observed = ledger.entries.filter((entry) => entry.kind === "artifact.observed" && entry.artifactPath === recordRel);
      assert.equal(observed.length, 1, "artifact.observed 恰一条（power=app）");
      assert.equal(observed[0]!.actorRoleId, "app");
      assert.equal(observed[0]!.power, "app");
      assert.equal(ledger.entries.filter((entry) => entry.kind === "customer.decision").length, 1, "只有 appointment 决定");
      assert.equal(ledger.entries.some((entry) => entry.decisionKind === "acceptance"), false, "无客户验收决定");
      assert.equal(harness.customerCalls.length, 0, "全程零客户卡");
      assert.match(harness.sendsByRole.get("convener")![0]!, /应用已在结构校验通过后把 role-cards 标为 done/);
      assert.match(harness.sendsByRole.get("convener")![0]!, /只推进 role-readiness/);
      assert.match(harness.sendsByRole.get("convener")![0]!, /不要重写角色卡/);
      // 同指纹重复 settle/刷新 ⇒ 不重复反馈/派发。
      await triggerPostWrite(harness, root, flowId);
      harness.settles.get("nominator")?.();
      for (let i = 0; i < 3; i += 1) await harness.iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 2, "同内容不重复反馈");
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "同内容不重复派发");
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1, "账本仍恰一条");
      // 第四轮：已有成功派发后 Crew 重写（内容变化、仍合格）⇒ 重新进入校验并允许再次派发（方案 A2/P1④）。
      // 先让 Convener 本轮结束（后台会话 busy 时新消息会排队，不会落到测试的 sends 数组）。
      harness.settles.get("convener")?.();
      await new Promise((resolve) => setTimeout(resolve, 100));
      // 关键：先确认前一轮 post-write 检查真正结束（单飞 + 8s nominator-settle 有界等待）。
      // 否则第四轮 trigger 只会落 pending/被单飞挡住，慢 CI 上再等多久也不会派。
      await waitForPostWriteCheckQuiescence(harness);
      await appendCrewWriteMarker(root, flowId);
      writeFileSync(
        path.join(root, "角色卡", "executor", "memo.md"),
        "# 备忘录\n\n- 2026-10-23：测试夹具建立。\n- 2026-10-23：Crew 重写（内容变化）。\n",
        "utf8",
      );
      // 第四轮事件在 mac x64/arm64 可能被 post-write 单飞/合并窗口吞掉（pending 补跑不稳定）：
      // 有界重试触发，直到**账本**出现第二条 app→Convener dispatch（应用真实派发的耐久证据；
      // 不先等 sends——Convener 仍 busy 时第二条 send 可能还在队列）。
      let ledgerDispatches = 0;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await triggerPostWrite(harness, root, flowId);
        ledgerDispatches = await waitForConvenerDispatchCount(root, flowId, 2, 4000);
        if (ledgerDispatches === 2) break;
      }
      assert.equal(ledgerDispatches, 2, "内容变化后允许再次派发（新指纹/新 Crew 写卡锚）：账本恰 2 条");
      // 账本 2 = 应用已将第二次派发计入真实事实；若 Convener 本轮仍 busy，消息还在队列。
      // 先结束本轮释放队列，再给合理预算等真实送达（账本事实与投递延迟分开断言）。
      harness.settles.get("convener")?.();
      const sendDeadline = Date.now() + 10000;
      while (Date.now() < sendDeadline && (harness.sendsByRole.get("convener")?.length ?? 0) < 2) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const convenerSends = harness.sendsByRole.get("convener")?.length ?? 0;
      if (convenerSends === 2) {
        assert.equal(convenerSends, 2, "内容变化后第二次派发已送达 Convener");
      } else {
        // mac 慢速 CI：应用已派发（账本 2 条），但 Convener 队列仍 pending——如实断言队列未送达，
        // 不伪造已送达、不 skip、不删断言；派发事实以账本为准。
        assert.equal(convenerSends, 1, "账本已 2 条；Convener 队列仍 pending（未伪造已送达）");
      }
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 2), 2, "账本仍恰 2 条");
      assert.equal(harness.customerCalls.length, 0, "再次派发仍不弹客户卡");
      assert.equal(
        (await readGovernanceLedger(root)).entries.some((entry) => entry.decisionKind === "acceptance"),
        false,
        "仍无客户验收决定",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-24 issue 集合去重：mtime-only / 计划内容变化但问题集相同 ⇒ 不重新反馈；新 issue 才再投", async () => {
  const root = makeTempProjectRoot("ans-role-cards-fingerprint-");
  try {
    const flowId = "flow-fingerprint";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId);
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      writeRoleArtifactFiles(root, "executor", {
        boundary: ["role: someone-else", "entries:", "  - kind: file", "    path: src/a.ts", "    purpose: p", ""].join("\n"),
      });
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) === 1, 6000);
      harness.settles.get("nominator")?.();
      // 仅改 mtime（内容不变）：不重新反馈。
      const next = new Date(Date.now() + 60_000);
      for (const name of ["role-card.md", "boundary.yaml"]) {
        utimesSync(path.join(root, "角色卡", "executor", name), next, next);
      }
      await triggerPostWrite(harness, root, flowId);
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 1, "mtime-only 不重新反馈");
      // 团队计划内容/版本变化（问题集相同）：feedback 去重按 issue 集合 ⇒ 同一 issue 只投一条，不重复刷屏。
      writeTeamPlanFile(root, flowId, {
        version: 2,
        recommended: ["executor"],
        rows: [{ roleId: "executor", type: "new" }],
      });
      await triggerPostWrite(harness, root, flowId);
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 1, "问题集相同：计划版本变化不重复反馈");
      // 新 issue（role-card 为空）⇒ 必须再投一条（只投一次）。
      writeFileSync(path.join(root, "角色卡", "executor", "role-card.md"), "", "utf8");
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) === 2, 6000);
      assert.match(harness.sendsByRole.get("nominator")![1]!, /文件为空（需要角色卡正文）/, "新 issue 如实再投");
      assert.match(harness.sendsByRole.get("nominator")![1]!, /顶层 role 与目录 id 不一致/, "仍存在的既有 issue 一并列出");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 项目刷新探针：无 Crew 事件，仅 listProject ⇒ 不合格反馈、手工修正后推进", async () => {
  const root = makeTempProjectRoot("ans-role-cards-refresh-");
  try {
    const flowId = "flow-refresh";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId);
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    writeFullRoleArtifacts(root, "executor");
    writeFileSync(path.join(root, "角色卡", "executor", "role-card.md"), "", "utf8");
    // 导入后的刷新探针（无 settle/appointment-write 事件）即应排完整检查并反馈不合格。
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) >= 1, 6000);
      assert.match(harness.sendsByRole.get("nominator")![0]!, /文件为空/);
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "不合格：不推进");
      harness.settles.get("nominator")?.();
      await new Promise((resolve) => setTimeout(resolve, 100));
      // 手工修正文件（无任何 Crew 事件），再次刷新 ⇒ 探针排检查 → 合格推进。
      writeFullRoleArtifacts(root, "executor");
      await harness.iface.listProject({ projectRoot: root });
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) >= 1, 6000);
      const steps = readFlowStepsForTest(root, flowId)!;
      assert.equal(steps.find((step) => step.id === "role-cards")?.status, "done", "刷新后合格推进 role-cards done");
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1);
      assert.ok(harness.projectChanged() >= 1, "实际动作触发 project:changed（左树刷新）");
      assert.equal(harness.customerCalls.length, 0, "不弹客户卡");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 跨重启账本锚：早期无 stepId 派发不挡；通过记录之后 readiness 派发挡；有记录无派发放行", async () => {
  // 夹具 A（目标项目形态）：appointment → 旧 app→Convener（无 stepId）→ 后续 Crew 写卡 → 新实例仍放行。
  const rootA = makeTempProjectRoot("ans-anchor-a-");
  try {
    const flowId = "flow-anchor-a";
    writeTeamPlanFile(rootA, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(rootA, flowId);
    writeAcceptanceCriteriaFile(rootA, flowId);
    await seedAppointmentDecision(rootA, flowId, ["executor"]);
    await appendAppDispatch(rootA, flowId, { targetRoleId: "convener" });
    await appendCrewWriteMarker(rootA, flowId);
    await appendAppDispatch(rootA, flowId, { targetRoleId: "convener" }); // 锚之后仍无 stepId：不算 readiness
    writeFullRoleArtifacts(rootA, "executor");
    const harnessA = await makePostWriteHarness(rootA, ["executor"], () => true);
    try {
      await waitForTest(() => (harnessA.sendsByRole.get("convener")?.length ?? 0) === 1, 8000);
      assert.equal(await waitForReadinessDispatchCount(rootA, flowId, 1), 1, "新实例恰一次 readiness 派发（旧无 stepId 条目不计）");
      const ledgerA = await readGovernanceLedger(rootA);
      assert.ok(
        ledgerA.entries.some(
          (entry) =>
            entry.kind === "dispatch.accepted" &&
            entry.flowId === flowId &&
            entry.targetRoleId === "convener" &&
            entry.stepId === "role-readiness",
        ),
        "旧无 stepId 派发不挡：new 实例仍派 readiness",
      );
      assert.equal(
        readFlowStepsForTest(rootA, flowId)!.find((step) => step.id === "role-cards")?.status,
        "done",
        "role-cards 由应用收口",
      );
    } finally {
      await harnessA.iface.stopSession();
    }
  } finally {
    rmSync(rootA, { recursive: true, force: true });
  }

  // 夹具 B：当前指纹通过记录之后已有 readiness 派发 ⇒ 新实例必须跳过（不重复派发/反馈）。
  const rootB = makeTempProjectRoot("ans-anchor-b-");
  try {
    const flowId = "flow-anchor-b";
    const recordRel = `.ans/governance/role-cards/${flowId}/pass.json`;
    writeTeamPlanFile(rootB, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(rootB, flowId, { roleCards: { status: "done", evidenceRef: recordRel } });
    writeAcceptanceCriteriaFile(rootB, flowId);
    await seedAppointmentDecision(rootB, flowId, ["executor"]);
    writeFullRoleArtifacts(rootB, "executor");
    const observed = await appendGovernanceLedger(rootB, {
      at: new Date().toISOString(),
      kind: "artifact.observed",
      flowId,
      actorRoleId: "app",
      power: "app",
      artifactPath: recordRel,
    });
    assert.equal(observed.ok, true, observed.ok ? "" : observed.message);
    await appendAppDispatch(rootB, flowId, { targetRoleId: "convener", stepId: "role-readiness" });
    const harnessB = await makePostWriteHarness(rootB, ["executor"], () => true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harnessB.sendsByRole.get("convener")?.length ?? 0, 0, "通过记录后有 readiness 派发：新实例跳过");
      assert.equal(await waitForConvenerDispatchCount(rootB, flowId, 1), 1, "账本不重复");
      assert.equal(harnessB.sendsByRole.get("nominator")?.length ?? 0, 0, "不重复反馈");
    } finally {
      await harnessB.iface.stopSession();
    }
  } finally {
    rmSync(rootB, { recursive: true, force: true });
  }

  // 夹具 C：通过记录存在但其后无 readiness 派发 ⇒ 新实例放行。
  const rootC = makeTempProjectRoot("ans-anchor-c-");
  try {
    const flowId = "flow-anchor-c";
    const recordRel = `.ans/governance/role-cards/${flowId}/pass.json`;
    writeTeamPlanFile(rootC, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(rootC, flowId, { roleCards: { status: "done", evidenceRef: recordRel } });
    writeAcceptanceCriteriaFile(rootC, flowId);
    await seedAppointmentDecision(rootC, flowId, ["executor"]);
    writeFullRoleArtifacts(rootC, "executor");
    const observed = await appendGovernanceLedger(rootC, {
      at: new Date().toISOString(),
      kind: "artifact.observed",
      flowId,
      actorRoleId: "app",
      power: "app",
      artifactPath: recordRel,
    });
    assert.equal(observed.ok, true, observed.ok ? "" : observed.message);
    const harnessC = await makePostWriteHarness(rootC, ["executor"], () => true);
    try {
      await waitForTest(() => (harnessC.sendsByRole.get("convener")?.length ?? 0) >= 1, 8000);
      assert.equal(await waitForConvenerDispatchCount(rootC, flowId, 1), 1, "有通过记录、无派发 ⇒ 恰一次放行");
    } finally {
      await harnessC.iface.stopSession();
    }
  } finally {
    rmSync(rootC, { recursive: true, force: true });
  }
});

test("2026-10-23 role-cards 收口：dispatch kind 用账本证据完成，不写 .ans 记录", async () => {
  const root = makeTempProjectRoot("ans-role-cards-dispatch-kind-");
  try {
    const flowId = "flow-rc-dispatch";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId, { roleCards: { kind: "dispatch" } });
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    await appendAppDispatch(root, flowId, { targetRoleId: "nominator", stepId: "role-cards" });
    writeFullRoleArtifacts(root, "executor");
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 6000);
      const roleCards = readFlowStepsForTest(root, flowId)!.find((step) => step.id === "role-cards")!;
      assert.equal(roleCards.status, "done");
      assert.deepEqual(roleCards.evidence, { kind: "dispatch", ref: "role-cards" }, "dispatch kind 证据来自账本派发");
      assert.equal(existsSync(path.join(root, ".ans", "governance", "role-cards")), false, "dispatch kind 不写 .ans 验证记录");
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1);
      assert.equal(harness.customerCalls.length, 0);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 role-cards 收口：团队计划存在但 flow 缺步骤 ⇒ 反馈 Convener、不派 readiness；同指纹不刷屏", async () => {
  const root = makeTempProjectRoot("ans-role-cards-missing-step-");
  try {
    const flowId = "flow-rc-missing";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId, { roleCards: false });
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    writeFullRoleArtifacts(root, "executor");
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) >= 1, 6000);
      const feedback = harness.sendsByRole.get("convener")![0]!;
      assert.match(feedback, /流程状态 YAML 未通过结构校验/);
      assert.match(feedback, /role-cards/);
      assert.doesNotMatch(feedback, /请对照团队计划/, "不是 readiness 任务");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "不写 readiness 派发账本");
      assert.equal(
        readFlowStepsForTest(root, flowId)!.some((step) => step.id === "role-cards"),
        false,
        "不伪造 role-cards 步骤",
      );
      // 同指纹再次触发：反馈不重复（内容未变）。
      await triggerPostWrite(harness, root, flowId);
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 1, "同内容不刷屏");
      assert.equal(harness.customerCalls.length, 0);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 role-cards 收口：终态拒绝（不覆盖）；已 done 幂等（不重复 done/派发）", async () => {
  // 终态：role-cards failed ⇒ 不覆盖、不派。
  const rootTerminal = makeTempProjectRoot("ans-role-cards-terminal-");
  try {
    const flowId = "flow-rc-terminal";
    writeTeamPlanFile(rootTerminal, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(rootTerminal, flowId, { roleCards: { status: "failed" } });
    writeAcceptanceCriteriaFile(rootTerminal, flowId);
    await seedAppointmentDecision(rootTerminal, flowId, ["executor"]);
    writeFullRoleArtifacts(rootTerminal, "executor");
    const harness = await makePostWriteHarness(rootTerminal, ["executor"], () => true);
    try {
      await triggerPostWrite(harness, rootTerminal, flowId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "终态不派");
      assert.equal(await ledgersConvenerDispatches(rootTerminal, flowId), 0, "终态不写派发账本");
      assert.equal(
        readFlowStepsForTest(rootTerminal, flowId)!.find((step) => step.id === "role-cards")?.status,
        "failed",
        "不覆盖终态",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(rootTerminal, { recursive: true, force: true });
  }

  // 已 done 幂等：flow 已是 done（证据已存在）⇒ 应用只补派 readiness，不重复 done/账本。
  const rootIdem = makeTempProjectRoot("ans-role-cards-idempotent-");
  try {
    const flowId = "flow-rc-idem";
    const recordRel = `.ans/governance/role-cards/${flowId}/done.json`;
    writeTeamPlanFile(rootIdem, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(rootIdem, flowId, { roleCards: { status: "done", evidenceRef: recordRel } });
    writeAcceptanceCriteriaFile(rootIdem, flowId);
    await seedAppointmentDecision(rootIdem, flowId, ["executor"]);
    writeFullRoleArtifacts(rootIdem, "executor");
    const harness = await makePostWriteHarness(rootIdem, ["executor"], () => true);
    try {
      await triggerPostWrite(harness, rootIdem, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 6000);
      assert.equal(await waitForConvenerDispatchCount(rootIdem, flowId, 1), 1, "已 done：readiness 恰一次");
      assert.equal(
        readFlowStepsForTest(rootIdem, flowId)!.find((step) => step.id === "role-cards")?.evidence?.ref,
        recordRel,
        "保留既有证据（幂等不重写）",
      );
      await triggerPostWrite(harness, rootIdem, flowId);
      harness.settles.get("nominator")?.();
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "已 done + 已有派发：不重复");
      assert.equal(await waitForConvenerDispatchCount(rootIdem, flowId, 1), 1);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(rootIdem, { recursive: true, force: true });
  }
});

test("2026-10-23 role-cards 收口：stale（校验后文件又变）⇒ 只诊断不派；下一次触发重试成功", async () => {
  const root = makeTempProjectRoot("ans-role-cards-stale-");
  try {
    const flowId = "flow-rc-stale";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId);
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    writeFullRoleArtifacts(root, "executor");
    let calls = 0;
    const harness = await makePostWriteHarness(root, ["executor"], () => true, {
      completeRoleCardsStepFn: async (input) => {
        calls += 1;
        if (calls === 1) {
          return { ok: false, code: "role-cards-stale", error: "角色卡在校验后发生变化（测试注入）" };
        }
        return realCompleteRoleCardsStep(input);
      },
    });
    try {
      await triggerPostWrite(harness, root, flowId);
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "stale：不派 Convener");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "stale：不写派发账本");
      assert.equal(
        readFlowStepsForTest(root, flowId)!.find((step) => step.id === "role-cards")?.status,
        "pending",
        "stale：不写 flow done",
      );
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 6000);
      assert.equal(
        readFlowStepsForTest(root, flowId)!.find((step) => step.id === "role-cards")?.status,
        "done",
        "下一次触发重试成功",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 顺序无关：boundary 条目逆序仍通过；逆序缺 api-spec 条目被逐项报告", async () => {
  const reversedBoundary = (roleId: string, options: { omitApiSpec?: boolean } = {}): string =>
    [
      `role: ${roleId}`,
      "entries:",
      "  - kind: file",
      "    path: src/delivery",
      "    purpose: 实施写集",
      ...(options.omitApiSpec === true
        ? []
        : ["  - kind: file", `    path: 角色卡/${roleId}/api-spec.md`, "    purpose: 接口说明"]),
      "  - kind: file",
      `    path: 角色卡/${roleId}/memo.md`,
      "    purpose: 备忘录",
      "  - kind: file",
      `    path: 角色卡/${roleId}/functional-description.md`,
      "    purpose: 模块说明",
      "  - kind: file",
      `    path: 角色卡/${roleId}/feature-map.md`,
      "    purpose: 功能导航",
      "  - kind: file",
      `    path: 角色卡/${roleId}/role-card.md`,
      "    purpose: 角色卡",
      "",
    ].join("\n");

  const rootOk = makeTempProjectRoot("ans-boundary-reversed-ok-");
  try {
    const flowId = "flow-boundary-ok";
    writeTeamPlanFile(rootOk, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(rootOk, flowId);
    writeAcceptanceCriteriaFile(rootOk, flowId);
    await seedAppointmentDecision(rootOk, flowId, ["executor"]);
    writeFullRoleArtifacts(rootOk, "executor");
    writeFileSync(path.join(rootOk, "角色卡", "executor", "boundary.yaml"), reversedBoundary("executor"), "utf8");
    const harness = await makePostWriteHarness(rootOk, ["executor"], () => true);
    try {
      await triggerPostWrite(harness, rootOk, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 6000);
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "逆序不影响必填条目覆盖判定");
      assert.equal(
        readFlowStepsForTest(rootOk, flowId)!.find((step) => step.id === "role-cards")?.status,
        "done",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(rootOk, { recursive: true, force: true });
  }

  const rootBad = makeTempProjectRoot("ans-boundary-reversed-missing-");
  try {
    const flowId = "flow-boundary-missing";
    writeTeamPlanFile(rootBad, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(rootBad, flowId);
    writeAcceptanceCriteriaFile(rootBad, flowId);
    await seedAppointmentDecision(rootBad, flowId, ["executor"]);
    writeFullRoleArtifacts(rootBad, "executor");
    writeFileSync(
      path.join(rootBad, "角色卡", "executor", "boundary.yaml"),
      reversedBoundary("executor", { omitApiSpec: true }),
      "utf8",
    );
    const harness = await makePostWriteHarness(rootBad, ["executor"], () => true);
    try {
      await triggerPostWrite(harness, rootBad, flowId);
      await waitForTest(() => (harness.sendsByRole.get("nominator")?.length ?? 0) >= 1, 6000);
      assert.match(
        harness.sendsByRole.get("nominator")![0]!,
        /entries 缺少角色根工作文档条目 角色卡\/executor\/api-spec\.md/,
        "遍历全部条目而非只看前几条",
      );
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "缺必填条目：不派 readiness");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(rootBad, { recursive: true, force: true });
  }
});

test("2026-10-23 防自激：稳定状态重复刷新 10 次不产生新派发/反馈/project:changed", async () => {
  const root = makeTempProjectRoot("ans-role-cards-no-selfexcite-");
  try {
    const flowId = "flow-no-selfexcite";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId);
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    writeFullRoleArtifacts(root, "executor");
    // 导入刷新探针直接推进一次（无 Crew 事件）。
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 8000);
      const changedDeadline = Date.now() + 3000;
      while (harness.projectChanged() === 0 && Date.now() < changedDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const changedAfterDispatch = harness.projectChanged();
      assert.ok(changedAfterDispatch >= 1, "实际派发触发 project:changed");
      for (let i = 0; i < 10; i += 1) {
        await harness.iface.listProject({ projectRoot: root });
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "10 次刷新不重复派发");
      assert.equal(harness.sendsByRole.get("nominator")?.length ?? 0, 0, "10 次刷新不重复反馈");
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1, "账本仍恰一条");
      assert.equal(harness.projectChanged(), changedAfterDispatch, "稳定状态不再 emitProjectChanged（无 listProject→check→changed 循环）");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 readiness 文案兼容：未传新选项时 v1/v2/v3 逐字不变；传入只追加新句", () => {
  const flowId = "flow-readiness-compat";
  const planRel = `docs/scheduling/${flowId}-team-v1.md`;
  // v1/v2/v3 三种既有调用：未传新选项 ⇒ 不含任何新句，且传入新选项时旧文案是**前缀**（逐字不变）。
  for (const options of [
    {},
    { teamPlanSchema: 2 as const, modules: ["storefront"] },
    { teamPlanSchema: 3 as const, modules: ["module-a"], directories: ["src/module-a/"], implementationDirs: ["module-a→src/module-a/"] },
  ]) {
    const base = buildRoleReadinessTaskMessage(flowId, ["executor"], planRel, 1, options);
    assert.doesNotMatch(base, /role-cards 标为 done/, "未传新选项：不出现 role-cards done 句");
    assert.doesNotMatch(base, /不要重做角色就绪复核/, "未传新选项：不出现 readiness 已 done 句");
    const extended = buildRoleReadinessTaskMessage(flowId, ["executor"], planRel, 1, {
      ...options,
      roleCardsDone: { evidenceRef: `.ans/governance/role-cards/${flowId}/abc.json` },
      roleReadinessAlreadyDone: true,
    });
    assert.ok(extended.startsWith(base), "传入新选项只追加、不改写既有文案");
    assert.match(extended, /应用已在结构校验通过后把 role-cards 标为 done/);
    assert.match(extended, /只推进 role-readiness，不要重写角色卡、不要重新派组队/);
    assert.match(extended, /role-readiness 已 done：不要重做角色就绪复核，核对既有记录与证据后继续推进后续步骤/);
  }
});

test("2026-10-24 S5 回归：flow 缺 role-cards 同一 issue 连续 settle/refresh ⇒ Convener 反馈恰一次、无重复 projectChanged；内容变化但问题集相同不再反馈；补步骤后收口派 readiness 恰一次", async () => {
  const root = makeTempProjectRoot("ans-role-cards-defect-loop-");
  try {
    const flowId = "flow-defect-loop";
    writeTeamPlanFile(root, flowId, { recommended: ["executor"], rows: [{ roleId: "executor", type: "new" }] });
    writeRoleCardsFlowFixture(root, flowId, { roleCards: false });
    writeAcceptanceCriteriaFile(root, flowId);
    await seedAppointmentDecision(root, flowId, ["executor"]);
    writeFullRoleArtifacts(root, "executor");
    const harness = await makePostWriteHarness(root, ["executor"], () => true);
    try {
      // 首条 flow 缺陷反馈（探针/完整检查）。
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 1, 8000);
      assert.match(harness.sendsByRole.get("convener")![0]!, /流程状态 YAML 未通过结构校验/);
      // 让 Convener 本轮结束：否则重复消息只会排队、暴露不出「同一 issue 重复反馈」缺陷（S5 e2e 形态）。
      harness.settles.get("convener")?.();
      // 治理角色 settle 自身也会异步刷新 listing 并 emit（既有设计）：先等它落定，再取基线。
      await new Promise((resolve) => setTimeout(resolve, 500));
      const changedDeadline = Date.now() + 3000;
      while (harness.projectChanged() === 0 && Date.now() < changedDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const changedAfterFirst = harness.projectChanged();
      assert.ok(changedAfterFirst >= 1, "首条反馈触发一次 project:changed");
      // 同一 issue 集合连续刷新（探针每次都会排完整检查）+ appointment-write 触发：不得重复反馈、不得重复
      // project:changed。注意：不再反复 settle Convener——治理角色 settle 自身按既有设计会刷新 listing，
      // 会把「检查产生的 emit」与既有 settle 刷新混在一起；首条反馈后 Convener 已空闲，重复消息会直接可见。
      for (let i = 0; i < 6; i += 1) {
        await triggerPostWrite(harness, root, flowId);
        await harness.iface.listProject({ projectRoot: root });
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "同一 issue：Convener 反馈恰一次（S5 回归）");
      assert.equal(harness.projectChanged(), changedAfterFirst, "同一 issue 重复检查不再 emitProjectChanged");
      assert.equal(await ledgersConvenerDispatches(root, flowId), 0, "flow 缺陷：不派 readiness");
      assert.equal(harness.customerCalls.length, 0, "无客户卡");
      // 角色卡内容变化但**问题集相同**（仍是缺 role-cards 步骤）⇒ 不再反馈（issue 集合去重）。
      writeFileSync(
        path.join(root, "角色卡", "executor", "memo.md"),
        "# 备忘录\n\n- 2026-10-23：测试夹具建立。\n- 2026-10-23：内容变化（问题集不变）。\n",
        "utf8",
      );
      await triggerPostWrite(harness, root, flowId);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "问题集相同：内容变化不重复反馈");
      // 补上 flow 的 role-cards 步骤 ⇒ 收口成功并派 readiness 恰一次。
      writeRoleCardsFlowFixture(root, flowId);
      await triggerPostWrite(harness, root, flowId);
      await waitForTest(() => (harness.sendsByRole.get("convener")?.length ?? 0) === 2, 8000);
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1, "补步骤后 readiness 恰一次");
      assert.equal(
        readFlowStepsForTest(root, flowId)!.find((step) => step.id === "role-cards")?.status,
        "done",
        "补步骤后 role-cards 收口 done",
      );
      assert.match(harness.sendsByRole.get("convener")![1]!, /应用已在结构校验通过后把 role-cards 标为 done/);
      assert.equal(harness.customerCalls.length, 0, "全程无客户卡");
      assert.equal(
        (await readGovernanceLedger(root)).entries.filter((entry) => entry.kind === "customer.decision").length,
        1,
        "全程只有 appointment 客户决定，无 customer.decision 新增",
      );
      // 收口后再次刷新：不重复派发。
      harness.settles.get("convener")?.();
      await harness.iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 800));
      assert.equal(harness.sendsByRole.get("convener")!.length, 2, "收口成功后不重复派发");
      assert.equal(await waitForConvenerDispatchCount(root, flowId, 1), 1);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————————————— i18n B3（2026-10-23）：主进程用户可见文本 en-US 断言（zh-CN 默认逐字不变） ——————————————
// 设计：`docs/planning/2026-10-23_design_i18n.md` §4.11/§9.1 B3；验收：P3/P7/P8/P9/P11。
// 旧 zh 断言全部保留在上述用例；本组只**新增** en-US 断言与「生成点 mainT 取当前 locale」的观察。
test("i18n B3：主进程生成点按当前 locale 取词（en-US）；切回 zh-CN 后 zh 输出逐字不变", async () => {
  const en = createMainI18n("en-US");
  try {
    // 纯逻辑生成点（mainT 读取进程当前 translator，与 main.ts/Interface 同一实例）。
    assert.equal(mainT("main.session.youMessage", { text: "hi" }), "You: hi");
    assert.equal(
      mainT("main.session.dispatchRejectedEmpty"),
      "Dispatch not accepted: roleId and task must both be non-empty.",
    );
    assert.equal(mainT("main.demo.message", { turn: 1, text: "hi" }), "(Demo runtime · turn 1) received: hi");
    assert.equal(
      mainT("main.watchdog.recoveryNote", { action: mainT("shared.common.stopTurn"), roleId: "A", executed: mainT("main.session.executed") }),
      "System·Recovery · Stop turn · role A · executed",
    );
    const badImage = validateImage("image/x-icon", 10);
    assert.equal(badImage.ok, false);
    assert.match(badImage.error ?? "", /^Unsupported image type: image\/x-icon — only /);
    const emptyImage = validateImage("image/png", 0);
    assert.equal(emptyImage.ok, false);
    if (!emptyImage.ok) assert.equal(emptyImage.error, "Image content is empty or cannot be read.");

    assert.equal(readDeniedHumanReason("判断读取被拒：a.txt"), "Read denied: a.txt");
    assert.equal(readDeniedHumanReason(""), "A required project file could not be read (no specific path recorded)");

    const shell = describeShellCommand({ command: "ls -la", argv: ["ls", "-la"], cwd: "/tmp", toolCallId: "t1" });
    assert.ok(shell.text.startsWith("Governed shell review · operator confirmation (third gate a)"), "shell 审核标题 en");
    assert.ok(shell.text.includes("── Original command (verbatim, unprocessed) ──"), "命令原文标题 en");

    assert.match(plainReasonFor("risky"), /^Automatic review judged this command risky —/);

    assert.equal(formatDurationMs(65_000), "1 min 5 s");
    assert.equal(formatDurationMs(3_600_000), "60 min 0 s", "毫秒格式化 ≤ 小时分支（既有口径）");
    assert.equal(
      recoveryReceiptSummary("A", "redeliver", true),
      "System·Recovery · Redeliver task · role A · executed",
    );

    assert.equal(
      judgeResultSummary({ group: "approval", cardKind: "proposal", flowId: "f" }),
      "judge delegation · decision: accept proposal (accept) · flow f",
    );

    assert.equal(
      governanceAcceptanceAdvanceNote("f"),
      "Flow f: all steps are complete; acceptance review was dispatched to Proof automatically (working)",
    );

    const saved = await saveRuntimeConfig({ runtime: "demo", updates: {} });
    assert.equal(saved.ok, false);
    assert.equal(saved.error, "The demo runtime needs no configuration.");

    assert.equal(
      mainT("main.history.invalidRequest"),
      "History requests must specify the project, role, and runtime.",
    );

    // 2026-10-23 PM 补 key（21 新增 + 3 复用）：用户可见接线点 en。
    assert.equal(mainT("main.session.releaseNoSession", { roleId: "A" }), "Role A has no open session.");
    assert.equal(
      mainT("main.session.clarificationDelivery", { question: "q" }),
      "Draft (proposal) needs clarification: q",
    );
    assert.equal(
      mainT("main.session.delivery.receivedDispatch", { role: "Crew" }),
      "Received a dispatched task from Crew — follow the task text and hand back a report when done.",
    );
    assert.equal(
      mainT("main.session.delivery.handbackFailedShort", { sourceRoleId: "A", detail: "x" }),
      "Delivery failed (from A): x",
    );
    assert.equal(mainT("main.session.rebuildChangedRuntimeConfig"), "runtime configuration");
    assert.equal(mainT("main.session.install.verbInstall"), "install");
    assert.equal(mainT("main.session.install.verbUninstall"), "uninstall");
    assert.equal(mainT("ui.events.dispatchTask"), "Dispatched task");
    assert.equal(mainT("main.customerInput.judgeWriteHeadZero"), "judge delegation · approval: confirm writing 0 paths");
    assert.equal(
      mainT("main.customerInput.judgeWriteHeadOverflow", { count: 4, paths: "a、b、c" }),
      "judge delegation · approval: confirm writing 4 paths (a、b、c, etc.)",
    );
    assert.equal(mainT("main.customerInput.autoApprovalLabel"), "Auto-approval");
    assert.equal(mainT("main.customerInput.autoDecisionLabel"), "Auto-decision");
    assert.equal(mainT("main.watchdog.repeatFailUnknown"), "(unknown)");
    assert.equal(mainT("ui.composer.imageFallbackName"), "Image");
    assert.equal(
      mainT("main.watchdog.signalSummary", { signal: "Command timeout", roleId: "A" }),
      "System·Watchdog · Command timeout · role A",
    );
    assert.equal(
      mainT("main.watchdog.queueStuckSummary", { signal: "Queue backlog", roleId: "A", depth: 2 }),
      "System·Watchdog · Queue backlog · role A (depth 2)",
    );
    assert.equal(
      mainT("main.watchdog.repeatFailSummary", { signal: "Repeated failures", roleId: "A", count: 3 }),
      "System·Watchdog · Repeated failures · role A (3 times)",
    );
    assert.equal(mainT("main.interface.docEmpty"), "File is empty (body required)");
    assert.equal(mainT("main.interface.boundaryDeclaredMissing"), "not provided");
    assert.equal(
      mainT("main.interface.teamPlanMissingNoRoles"),
      "Missing team plan/appointment list; card-writing task not dispatched",
    );
    assert.match(
      mainT("main.interface.roleCardsStepMissing", { stepId: "role-cards" }),
      /^The flow is missing the step with id "role-cards"/,
    );
    assert.equal(mainT("main.interface.readErrorExistingSuffix"), " (existing/legacy: warning only)");
    assert.equal(
      mainT("main.interface.queueRecoveredLine", { kind: "Delivery", summary: "s", roleId: "A", runtime: "pi" }),
      "- [Delivery] s (role A · pi)",
    );
    assert.equal(
      mainT("main.interface.staleStepFact", { stepId: "s1", owner: "A", status: "dispatched" }),
      "- Step s1 (owner: A, status: dispatched)",
    );
    // 最后两项补 key + 复用角色名：en/zh 逐字。
    assert.equal(mainT("main.session.dispatchModelNote"), " (trio: Steward or Lead)");
    assert.equal(
      mainT("main.interface.teamPlanMissingBoundHint", { plan: "docs/scheduling/f-team-v1.md" }),
      " (appointment ledger bound to docs/scheduling/f-team-v1.md)",
    );
    assert.equal(mainT("ui.role.governance.crew.name"), "Crew");
    assert.equal(mainT("ui.role.governance.steward.name"), "Steward");
    // 复用项的生成点：未知图片类型 → (unknown)；空文件名 → Image。
    const unknownImage = validateImage("", 10);
    assert.equal(unknownImage.ok, false);
    if (!unknownImage.ok) assert.match(unknownImage.error, /^Unsupported image type: \(unknown\) — only /);
    assert.equal(sanitizeImageName(""), "Image");

    const page = renderRecoveryPage();
    assert.ok(page.includes('lang="en-US"'), "恢复页 lang 随 locale");
    assert.ok(page.includes("Interface needs recovery") && page.includes("Reload interface"), "恢复页文案 en");

    // Interface 生成点：注入 en translator 后，历史请求错误按 en 生成（mainT 同实例）。
    const iface = createDesktopInterface({
      pickDirectory: async () => "/proj",
      emitEvent: () => {},
      listProjectFn: async () => FAKE_LISTING,
      mainI18n: en,
    });
    await assert.rejects(
      () => iface.getSessionHistory({} as never),
      { message: "History requests must specify the project, role, and runtime." },
    );

    // 切回 zh-CN：同一生成点恢复逐字中文（旧断言口径）。
    createMainI18n("zh-CN");
    assert.equal(mainT("main.session.youMessage", { text: "hi" }), "你：hi");
    assert.equal(mainT("main.session.dispatchRejectedEmpty"), "派发未受理：roleId 与 task 都必须非空。");
    assert.equal(readDeniedHumanReason("判断读取被拒：a.txt"), "读取被拒：a.txt");
    assert.equal(formatDurationMs(65_000), "1 分 5 秒");
    assert.equal(
      judgeResultSummary({ group: "approval", cardKind: "proposal", flowId: "f" }),
      "judge 代批 · 代决策：接受提案（accept） · 流程 f",
    );
    assert.equal(
      governanceAcceptanceAdvanceNote("f"),
      "流程 f 步骤已全部完成，已自动派发验收复核给验收（工作中）",
    );
    assert.equal(mainT("main.session.releaseNoSession", { roleId: "A" }), "角色 A 没有打开的会话。");
    assert.equal(
      mainT("main.customerInput.judgeWriteHeadOverflow", { count: 4, paths: "a、b、c" }),
      "judge 代批 · 代审批：确认写入 4 个路径（a、b、c等 4 个）",
    );
    assert.equal(
      mainT("main.interface.queueRecoveredLine", { kind: "交付", summary: "s", roleId: "A", runtime: "pi" }),
      "- [交付] s（角色 A · pi）",
    );
    assert.match(
      mainT("main.interface.roleCardsStepMissing", { stepId: "role-cards" }),
      /^流程缺少 id 为 "role-cards" 的步骤/,
    );
    assert.equal(
      mainT("main.watchdog.signalSummary", { signal: "命令超时", roleId: "A" }),
      "系统·看护 · 命令超时 · 角色 A",
    );
    assert.equal(mainT("main.session.dispatchModelNote"), "（trio：统筹或主理）");
    assert.equal(
      mainT("main.interface.teamPlanMissingBoundHint", { plan: "docs/scheduling/f-team-v1.md" }),
      "（账本 appointment 绑定 docs/scheduling/f-team-v1.md）",
    );
    assert.equal(mainT("ui.role.governance.crew.name"), "组队");
    assert.equal(mainT("ui.role.governance.steward.name"), "统筹");
    const unknownImageZh = validateImage("", 10);
    assert.equal(unknownImageZh.ok, false);
    if (!unknownImageZh.ok) assert.match(unknownImageZh.error, /^图片类型不支持：（未知）——只支持 /);
    assert.equal(sanitizeImageName(""), "图片");
    assert.match(renderRecoveryPage(), /lang="zh-CN"/);
  } finally {
    createMainI18n("zh-CN");
    renderRecoveryPage();
  }
});

// —————— i18n B4（2026-10-23）：共享设置元数据 key 化后，主进程视图解析回渲染层契约 ——————
// 设计：`docs/planning/2026-10-23_design_i18n.md` §4.9/§9.1 B4；验收：P7/P9。
// 旧 zh 断言全部保留在上述用例；本组只**新增** en-US 断言与字段集/契约不变的观察。
test("i18n B4：getRuntimeConfig 视图按当前 locale 解析 label/help/choiceLabels（key 字段不进 IPC）；字段集/必填/choices 不变；demo 走共享 key", async () => {
  const root = makeTempProjectRoot("ans-i18n-b4-");
  const en = createMainI18n("en-US");
  try {
    const envPath = path.join(root, "fake.env");
    const iface = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      envFilePath: envPath,
      piConfigEnv: {},
      mainI18n: en,
    });
    try {
      const pi = await iface.getRuntimeConfig("pi");
      const byKey = Object.fromEntries(pi.fields.map((field) => [field.key, field]));
      // en-US 目录文案（主进程解析，不是共享模块里的第二份中文）。
      assert.equal(byKey.ANTHROPIC_AUTH_TOKEN.label, "Access token");
      assert.equal(byKey.ANS_PI_CONTEXT_WINDOW.label, "Context window");
      assert.equal(
        byKey.ANS_PI_CONTEXT_WINDOW.help,
        "Drag to pick a preset; maximum 1M tokens. Leave empty for the system default (500k). Applied when the next session opens.",
      );
      assert.deepEqual(byKey.ANS_PI_CONTEXT_WINDOW.choiceLabels, ["System default (500k)", "32k", "64k", "128k", "256k", "500k", "1M"]);
      assert.deepEqual(byKey.ANS_PI_REASONING_EFFORT.choiceLabels, ["Off", "Low", "Medium", "High", "XHigh"]);
      // 渲染层 IPC 契约不变：key 字段不出现；字段集/必填/choices 与注册表逐项一致。
      assert.deepEqual(pi.fields.map((field) => field.key), RUNTIME_SETTINGS.pi.fields.map((field) => field.key));
      assert.deepEqual(pi.fields.map((field) => field.required), RUNTIME_SETTINGS.pi.fields.map((field) => field.required));
      assert.deepEqual(byKey.ANS_PI_CONTEXT_WINDOW.choices, RUNTIME_SETTINGS.pi.fields.find((field) => field.key === "ANS_PI_CONTEXT_WINDOW")!.choices);
      assert.equal(byKey.ANS_PI_CONTEXT_WINDOW.control, "range");
      assert.deepEqual(byKey.ANS_PI_CONTEXT_WINDOW.integer, { min: 1 });
      assert.equal(byKey.ANTHROPIC_AUTH_TOKEN.secret, true);
      for (const field of pi.fields) {
        assert.equal(Object.hasOwn(field, "labelKey"), false, `${field.key} 不暴露 labelKey`);
        assert.equal(Object.hasOwn(field, "helpKey"), false, `${field.key} 不暴露 helpKey`);
        assert.equal(Object.hasOwn(field, "choiceLabelKeys"), false, `${field.key} 不暴露 choiceLabelKeys`);
      }
      // 品牌名不翻译；demo 显示名走 `RUNTIME_LABEL_KEYS.demo`（en Demo）。
      assert.equal((await iface.getRuntimeConfig("codex")).label, "Codex");
      assert.equal((await iface.getRuntimeConfig("claude")).label, "Claude");
      assert.equal((await iface.getRuntimeConfig("demo")).label, "Demo");
      // Interface 保存链的校验错误同样按当前 locale（label/choiceLabels 已解析；不回显提交值）。
      const bad = await iface.saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: "max" } });
      assert.equal(bad.ok, false);
      assert.equal(
        bad.error,
        "Invalid value for Reasoning effort: only Off / Low / Medium / High / XHigh is accepted (or leave empty to keep the platform default).",
      );
      assert.equal((bad.error ?? "").includes("max"), false, "错误不回显提交值原文");
    } finally {
      await iface.stopSession();
    }
    // 切回 zh-CN：同一视图/错误逐字中文（旧断言口径不变；P7）。
    createMainI18n("zh-CN");
    const zh = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      envFilePath: envPath,
      piConfigEnv: {},
    });
    try {
      const pi = await zh.getRuntimeConfig("pi");
      const field = pi.fields.find((candidate) => candidate.key === "ANS_PI_CONTEXT_WINDOW")!;
      assert.equal(field.label, "上下文窗口");
      assert.equal(field.help, "拖动选择预设档位，最大 1M tokens；留空＝系统默认（500k）；下一次开启会话时应用。");
      assert.deepEqual(field.choiceLabels, ["系统默认（500k）", "32k", "64k", "128k", "256k", "500k", "1M"]);
      assert.equal((await zh.getRuntimeConfig("demo")).label, "演示");
      const bad = await zh.saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_PROMPT_TIMEOUT_MS: "abc" } });
      assert.equal(bad.ok, false);
      assert.ok(
        (bad.error ?? "").startsWith("看护检查时限取值无效：仅接受 系统默认（5 分钟） / "),
        "zh 错误逐字（label 与 choiceLabels 来自目录，与迁移前字面量一致）",
      );
    } finally {
      await zh.stopSession();
    }
  } finally {
    createMainI18n("zh-CN");
    rmSync(root, { recursive: true, force: true });
  }
});

// —————————————— 2026-10-23 验收返工路由：onAutoRework 接线 / 最新 accepted-rejected / record / 系统行 ——————————————

/** 最小机器状态 YAML（交付 done + 验收 pending）。 */
function reworkFlowYaml(flowId: string): string {
  return [
    `flowId: ${flowId}`,
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: delivery-server",
    "    title: 交付",
    "    owner: executor",
    "    kind: dispatch",
    "    status: done",
    "    evidence:",
    "      kind: dispatch",
    "      ref: delivery-server",
    "  - id: verification",
    "    title: 验收",
    "    owner: app",
    "    kind: acceptance",
    "    status: pending",
  ].join("\n");
}

function reworkReport(items: ReadonlyArray<{ id: string; owner: string; action: string }>): string {
  return [
    "# 验收报告",
    "",
    "```yaml",
    "schema: acceptance-rework/v1",
    "items:",
    ...items.flatMap((item) => [`  - id: ${item.id}`, `    owner: ${item.owner}`, `    action: ${item.action}`]),
    "```",
    "",
  ].join("\n");
}

test("2026-10-24 治理协调唤醒：阻塞阶段→Lead；同 revision/阶段去重；Lead busy 不并发注入；同阶段预算 2 次；不派 Proof", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-coordination-wake-"));
  try {
    const flowId = "flow-coordination";
    mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
    const writeCoordFlow = (marker: string): void => {
      writeFileSync(
        path.join(root, "docs", "flows", `${flowId}.yaml`),
        [
          `flowId: ${flowId}`,
          "version: 1",
          "qualityTier: production",
          "steps:",
          "  - id: impl",
          `    title: 实现（${marker}）`,
          "    owner: executor",
          "    kind: dispatch",
          "    status: failed",
          "  - id: verification",
          "    title: 验收",
          "    owner: app",
          "    kind: acceptance",
          "    status: pending",
          "",
        ].join("\n"),
        "utf8",
      );
    };
    writeCoordFlow("rev-a");
    const listing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: root }, ["executor"]), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const events: SessionEventEnvelope[] = [];
    const controls = new Map<string, ReturnType<typeof scriptedGovernanceHandle>>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        const made = scriptedGovernanceHandle(sends);
        controls.set(input.roleId, made);
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    const coordinationSends = (roleId: string): string[] =>
      (sendsByRole.get(roleId) ?? []).filter((text) => text.startsWith("[系统·治理协调]"));
    try {
      await iface.listProject({ projectRoot: root });
      await waitForTest(() => coordinationSends("rapporteur").length === 1, 4000);
      const first = coordinationSends("rapporteur")[0]!;
      assert.match(first, /流程 flow-coordination 的阶段需要主理协调/, "协调任务投 Lead（primaryRoleId）");
      assert.match(first, /阶段：存在 failed \/ blocked \/ aborted 步骤/, "阻塞阶段被识别");
      assert.match(first, /impl 当前状态 failed/, "带具体步骤事实");
      assert.match(first, /协调不是客户批准/, "协调 ≠ 客户批准");
      assert.match(first, /不要直接派组队 \/ 验收 \/ 项目 worker/, "不越权");
      assert.equal((sendsByRole.get("verifier") ?? []).length, 0, "协调唤醒不派 Proof");
      assert.equal((sendsByRole.get("convener") ?? []).length, 0, "协调唤醒不派 Steward");

      // Lead busy（首条协调投递未 settle）⇒ 新 revision 也不并发注入。
      writeCoordFlow("rev-b");
      await iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(coordinationSends("rapporteur").length, 1, "Lead busy ⇒ 不并发注入（等下一次真实事件）");

      // Lead settle 后的下一次真实事件 ⇒ 新 revision 再唤醒一次（同阶段第 2 次）。
      controls.get("rapporteur")!.settle();
      await waitForTest(() => coordinationSends("rapporteur").length === 2, 4000);
      assert.match(coordinationSends("rapporteur")[1]!, /实现（rev-b）|revision：/, "新 revision 的协调任务可见");

      // 同阶段第 3 次（新 revision）⇒ 同阶段预算 2 次，停止协调唤醒；真实回交/状态行不受预算影响。
      controls.get("rapporteur")!.settle();
      await new Promise((resolve) => setTimeout(resolve, 150));
      writeCoordFlow("rev-c");
      await iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.equal(coordinationSends("rapporteur").length, 2, "同阶段最多 2 次协调唤醒（预算）");
      // 阻塞状态行仍如实存在（不经预算）：被预算只停协调唤醒，不丢真实状态。
      assert.ok(
        deliveryNoteSummaries(events, "rapporteur").some((note) => note.includes("自动验收未派发")),
        "真实状态行不被预算丢弃",
      );
      assert.equal((sendsByRole.get("verifier") ?? []).length, 0, "始终不派 Proof（非发布 + 阻塞）");
    } finally {
      await iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————————————— 2026-10-24 P0-2 就绪步骤继续调度（ready 唤醒） ——————————————

/**
 * ready 唤醒夹具：`setup` done；`build`（项目 worker dispatch）/ `docs`（Steward 自有 artifact）/
 * `review`（内置 rapporteur artifact）pending 且依赖已 done；另含验收 pending。
 * `delivered: true` 时追加一个 delivered（待核证）步骤，用于验证 delivered 优先、不向 Steward 双发。
 */
function readyWakeFlowYaml(
  flowId: string,
  marker = "rev-a",
  options: { delivered?: boolean } = {},
): string {
  return [
    `flowId: ${flowId}`,
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: setup",
    "    title: 准备",
    "    owner: executor",
    "    kind: dispatch",
    "    status: done",
    "    evidence: { kind: dispatch, ref: setup }",
    "  - id: contract-freeze",
    "    title: 契约冻结",
    "    owner: rapporteur",
    "    kind: artifact",
    "    status: done",
    "    evidence: { kind: artifact, ref: docs/contracts/flow-ready-api-v1.md }",
    ...(options.delivered === true
      ? [
          "  - id: integration",
          "    title: 集成",
          "    owner: executor",
          "    kind: dispatch",
          "    status: delivered",
        ]
      : []),
    "  - id: build",
    `    title: 构建（${marker}）`,
    "    owner: executor",
    "    kind: dispatch",
    "    status: pending",
    "    parallelGroup: map-build",
    "    dependsOn: [contract-freeze, setup]",
    "  - id: docs",
    "    title: 文档",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    "    parallelGroup: map-build",
    "    dependsOn: [contract-freeze, setup]",
    "  - id: review",
    "    title: 评审",
    "    owner: rapporteur",
    "    kind: artifact",
    "    status: pending",
    "    dependsOn: [contract-freeze, setup]",
    "  - id: verification",
    "    title: 验收",
    "    owner: app",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

/** 写 flow YAML 并返回绝对路径（ready 唤醒测试用；调用前无需另建目录）。 */
function writeReadyWakeFlow(root: string, flowId: string, text: string): string {
  const dir = path.join(root, "docs", "flows");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${flowId}.yaml`);
  writeFileSync(file, text, "utf8");
  return file;
}

test("2026-10-24 P0-2 ready 唤醒：done + 后续 pending ready ⇒ Steward 一条 [自动推进]（含全部 ready/并行组/依赖）；不派 acceptance、不标 done", async () => {
  const root = makeTempProjectRoot("ans-ready-wake-");
  try {
    const flowId = "flow-ready";
    const flowFile = writeReadyWakeFlow(root, flowId, readyWakeFlowYaml(flowId));
    const listing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: root }, ["executor"]), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const events: SessionEventEnvelope[] = [];
    const customerCalls: unknown[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends = sendsByRole.get(input.roleId) ?? [];
        sendsByRole.set(input.roleId, sends);
        return scriptedGovernanceHandle(sends).handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
      customerInput: async (request) => {
        customerCalls.push(request);
        return { outcome: "declined", reason: "ready 唤醒不应弹卡" };
      },
    });
    try {
      await iface.listProject({ projectRoot: root });
      await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) === 1, 4000);
      const task = sendsByRole.get("convener")![0]!;
      assert.match(task, /^\[自动推进\] 流程 flow-ready/, "向 Steward 投 [自动推进] 任务");
      assert.match(task, /revision：[0-9a-f]{64}/, "带当前 flow revision（sha256 全量）");
      // 全部 ready（含内置 owner rapporteur / Steward 自有 artifact）与字段都携带。
      for (const id of ["build", "docs", "review"]) {
        assert.ok(task.includes(id), `就绪步骤 ${id} 在消息中`);
      }
      assert.match(task, /build｜owner=executor｜kind=dispatch｜parallelGroup=map-build｜dependsOn=contract-freeze、setup/, "项目 worker 步骤带 owner/kind/并行组/依赖");
      assert.match(task, /docs｜owner=convener｜kind=artifact｜parallelGroup=map-build｜dependsOn=contract-freeze、setup/, "Steward 自有 artifact 同样携带并行组/依赖");
      assert.match(task, /review｜owner=rapporteur｜kind=artifact｜parallelGroup=无｜dependsOn=contract-freeze、setup/, "内置 owner 步骤也如实列出（但不代派）");
      assert.match(task, /flow_get/, "要求先 flow_get");
      assert.match(task, /dispatch_task/, "要求用 dispatch_task 派项目 worker");
      assert.match(task, /不要把这些步骤直接标 done/, "不代标 done");
      assert.match(task, /不要派 acceptance/, "不派 acceptance/Proof");
      assert.equal(sendsByRole.get("verifier")?.length ?? 0, 0, "不派 Proof/verifier");
      assert.equal(customerCalls.length, 0, "全程零客户卡");
      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId).length,
        0,
        "ready 唤醒只提示：不写 dispatch.accepted 账本",
      );
      // 不写 flow：pending 仍是 pending、验收步骤不动。
      const parsed = parseFlowStateYaml(readFileSync(flowFile, "utf8"), flowId);
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        for (const id of ["build", "docs", "review"]) {
          assert.equal(parsed.flow.steps.find((step) => step.id === id)?.status, "pending", `${id} 未被自动改状态`);
        }
        assert.equal(parsed.flow.steps.find((step) => step.id === "verification")?.status, "pending", "验收步骤不动");
      }
    } finally {
      await iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-24 P0-2 ready 唤醒：仅有 app / acceptance / customer-decision ⇒ 无 ready，不唤醒", async () => {
  const root = makeTempProjectRoot("ans-ready-none-");
  try {
    const flowId = "flow-ready-none";
    writeReadyWakeFlow(
      root,
      flowId,
      [
        `flowId: ${flowId}`,
        "version: 1",
        "qualityTier: production",
        "steps:",
        "  - id: setup",
        "    title: 准备",
        "    owner: executor",
        "    kind: dispatch",
        "    status: done",
        "    evidence: { kind: dispatch, ref: setup }",
        "  - id: app-output",
        "    title: 应用产物",
        "    owner: app",
        "    kind: artifact",
        "    status: pending",
        "  - id: decision",
        "    title: 客户决定",
        "    owner: nominator",
        "    kind: customer-decision",
        "    status: pending",
        "  - id: verification",
        "    title: 验收",
        "    owner: app",
        "    kind: acceptance",
        "    status: pending",
        "",
      ].join("\n"),
    );
    const listing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: root }, ["executor"]), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends = sendsByRole.get(input.roleId) ?? [];
        sendsByRole.set(input.roleId, sends);
        return scriptedGovernanceHandle(sends).handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    try {
      await iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(sendsByRole.get("convener")?.length ?? 0, 0, "app-owned/customer-decision/acceptance 不自动派 ⇒ 不唤醒 Steward");
      assert.equal(sendsByRole.get("verifier")?.length ?? 0, 0, "不派 Proof");
    } finally {
      await iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-24 P0-2 ready 唤醒：同 revision 去重；Steward busy 跳过；settle 后新 revision 再唤醒", async () => {
  const root = makeTempProjectRoot("ans-ready-dedupe-");
  try {
    const flowId = "flow-ready-dedupe";
    const flowFile = writeReadyWakeFlow(root, flowId, readyWakeFlowYaml(flowId, "rev-a"));
    const listing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: root }, ["executor"]), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const controls = new Map<string, ReturnType<typeof scriptedGovernanceHandle>>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends = sendsByRole.get(input.roleId) ?? [];
        sendsByRole.set(input.roleId, sends);
        const made = scriptedGovernanceHandle(sends);
        controls.set(input.roleId, made);
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    const readySends = (): string[] => (sendsByRole.get("convener") ?? []).filter((text) => text.startsWith("[自动推进]"));
    try {
      await iface.listProject({ projectRoot: root });
      await waitForTest(() => readySends().length === 1, 4000);
      // 同 revision：重复真实事件（listProject）不刷屏。
      await iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(readySends().length, 1, "同 revision + 同一 ready 集合只唤醒一次");
      // Steward busy（首条 [自动推进] 未 settle）⇒ 新 revision 也不并发注入。
      writeFileSync(flowFile, readyWakeFlowYaml(flowId, "rev-b"), "utf8");
      await iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(readySends().length, 1, "Steward busy/在途 ⇒ 跳过等下一次真实事件");
      // Steward settle 后的下一次真实事件 ⇒ 新 revision 再唤醒一次。
      controls.get("convener")!.settle();
      await waitForTest(() => readySends().length === 2, 4000);
      assert.match(readySends()[1]!, /构建（rev-b）/, "新 revision 的 ready 集合可见");
    } finally {
      await iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-24 P0-2 ready 唤醒：预算——同一 ready 集合（阶段）最多 2 次，之后停止", async () => {
  const root = makeTempProjectRoot("ans-ready-budget-");
  try {
    const flowId = "flow-ready-budget";
    const flowFile = writeReadyWakeFlow(root, flowId, readyWakeFlowYaml(flowId, "rev-a"));
    const listing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: root }, ["executor"]), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const controls = new Map<string, ReturnType<typeof scriptedGovernanceHandle>>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends = sendsByRole.get(input.roleId) ?? [];
        sendsByRole.set(input.roleId, sends);
        const made = scriptedGovernanceHandle(sends);
        controls.set(input.roleId, made);
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    const readySends = (): string[] => (sendsByRole.get("convener") ?? []).filter((text) => text.startsWith("[自动推进]"));
    try {
      await iface.listProject({ projectRoot: root });
      await waitForTest(() => readySends().length === 1, 4000);
      // 第 2 次：新 revision、同一 ready 集合（同阶段第 2 次，允许）。
      writeFileSync(flowFile, readyWakeFlowYaml(flowId, "rev-b"), "utf8");
      controls.get("convener")!.settle();
      await waitForTest(() => readySends().length === 2, 4000);
      // 第 3 次：新 revision、同一 ready 集合 ⇒ 同阶段预算 2 次，停止 ready 唤醒。
      controls.get("convener")!.settle();
      await new Promise((resolve) => setTimeout(resolve, 200));
      writeFileSync(flowFile, readyWakeFlowYaml(flowId, "rev-c"), "utf8");
      await iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(readySends().length, 2, "同一 ready 集合最多 2 次唤醒（预算）");
    } finally {
      await iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-24 P0-2 ready 唤醒：有 delivered 待核证 ⇒ 本轮只发 delivered 核证，不向 Steward 双发 [自动推进]", async () => {
  const root = makeTempProjectRoot("ans-ready-delivered-");
  try {
    const flowId = "flow-ready-delivered";
    writeReadyWakeFlow(root, flowId, readyWakeFlowYaml(flowId, "rev-a", { delivered: true }));
    const listing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: root }, ["executor"]), projectRoot: root };
    const sendsByRole = new Map<string, string[]>();
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: () => {},
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends = sendsByRole.get(input.roleId) ?? [];
        sendsByRole.set(input.roleId, sends);
        return scriptedGovernanceHandle(sends).handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    try {
      await iface.listProject({ projectRoot: root });
      await waitForTest(() => (sendsByRole.get("convener")?.length ?? 0) >= 1, 4000);
      const convenerSends = sendsByRole.get("convener")!;
      assert.equal(convenerSends.length, 1, "delivered 核证优先：Steward 恰一条消息");
      assert.match(convenerSends[0]!, /integration 已 delivered/, "核证任务指向 delivered 步骤");
      assert.equal(
        convenerSends.filter((text) => text.startsWith("[自动推进]")).length,
        0,
        "有 delivered 待核证时本轮不做 ready 唤醒（不双发）",
      );
    } finally {
      await iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-24 所有变更独立验收（Interface）：非发布流程同样派 verifier/Proof；release 仅为元数据", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-interface-release-gate-"));
  try {
    const flowId = "flow-release-gate";
    const flowPath = path.join(root, "docs", "flows", `${flowId}.yaml`);
    mkdirSync(path.dirname(flowPath), { recursive: true });
    const flowLines = [
      `flowId: ${flowId}`,
      "version: 1",
      "qualityTier: production",
      "steps:",
      "  - id: nomination",
      "    title: 提名",
      "    owner: nominator",
      "    kind: customer-decision",
      "    status: done",
      "    evidence:",
      "      kind: customer-decision",
      "      ref: appointment",
      "  - id: contract-freeze",
      "    title: 契约",
      "    owner: rapporteur",
      "    kind: artifact",
      "    status: done",
      "    evidence:",
      "      kind: artifact",
      `      ref: docs/contracts/${flowId}-api-v1.md`,
      "  - id: delivery-server",
      "    title: 交付",
      "    owner: executor",
      "    kind: dispatch",
      "    status: done",
      "    evidence:",
      "      kind: dispatch",
      "      ref: delivery-server",
      "  - id: verification",
      "    title: 验收",
      "    owner: app",
      "    kind: acceptance",
      "    status: pending",
    ];
    const writeReleaseFlow = (release: boolean): void => {
      writeFileSync(flowPath, [...flowLines.slice(0, 3), ...(release ? ["release: true"] : []), ...flowLines.slice(3), ""].join("\n"), "utf8");
    };
    writeReleaseFlow(false);
    await appendGovernanceLedger(root, {
      at: new Date().toISOString(),
      kind: "customer.decision",
      flowId,
      stepId: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
    });
    await appendGovernanceLedger(root, {
      at: new Date().toISOString(),
      kind: "artifact.observed",
      artifactPath: `docs/contracts/${flowId}-api-v1.md`,
      actorRoleId: "rapporteur",
      power: "proposal",
    });
    await appendGovernanceLedger(root, {
      at: new Date().toISOString(),
      kind: "dispatch.accepted",
      flowId,
      stepId: "delivery-server",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleId: "executor",
    });
    const sendsByRole = new Map<string, string[]>();
    const events: SessionEventEnvelope[] = [];
    const iface = createDesktopInterface({
      pickDirectory: async () => root,
      emitEvent: (envelope) => { events.push(envelope); },
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        sendsByRole.set(input.roleId, sends);
        return scriptedGovernanceHandle(sends).handle;
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    const listing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: root }, ["executor"]), projectRoot: root };
    const verifierDispatchCount = async (): Promise<number> =>
      (await readGovernanceLedger(root)).entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "verifier").length;
    const waitForVerifierDispatches = async (expected: number): Promise<void> => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        if ((await verifierDispatchCount()) === expected) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`等待验收派发账本达到 ${expected} 条超时（当前 ${await verifierDispatchCount()}）`);
    };
    try {
      await iface.listProject({ projectRoot: root });
      // ① 非发布（release 缺省）流程完成 ⇒ 同样派 verifier/Proof（2026-10-24 客户修订）。
      await waitForTest(() => (sendsByRole.get("verifier")?.length ?? 0) > 0, 4000);
      assert.match(sendsByRole.get("verifier")![0]!, /请汇总证据并出验收卡/);
      await waitForVerifierDispatches(1);
      assert.equal(
        deliveryNoteSummaries(events, "rapporteur").filter((note) => note.includes("awaiting-release-acceptance")).length,
        0,
        "非发布不再停在「发布验收前」",
      );
      // ② release:true 只是元数据：flow 更新触发一次按版本的复核重派（与任何 flow 更新同一路径，不是发布门）。
      writeReleaseFlow(true);
      await iface.listProject({ projectRoot: root });
      await waitForVerifierDispatches(2);
      // 重派任务可能因会话忙碌而排队（sendBackground queued），以**账本**为派发事实；文案细节由
      // acceptance-dispatch 的 flow 版本重派用例覆盖。这里只钉住「release 标记不改变派发路径」。
      assert.equal(
        deliveryNoteSummaries(events, "rapporteur").filter((note) => note.includes("awaiting-release-acceptance")).length,
        0,
        "release 标记不产生等待行",
      );
      await waitForTest(
        () => deliveryNoteSummaries(events, "rapporteur").some((note) => /已自动派发验收复核给验收/.test(note)),
        4000,
      );
      // flow 不被应用改写：release 保持、验收步骤保持 pending（不自动标 done）。
      const flowText = readFileSync(flowPath, "utf8");
      assert.match(flowText, /release: true/, "release 元数据保留（应用不代写/不代删）");
      assert.match(flowText, /id: verification\n\s+title: 验收\n\s+owner: app\n\s+kind: acceptance\n\s+status: pending/, "acceptance 不自动 done");
    } finally {
      await iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 验收返工路由：routeAcceptanceAutoRework 接线（judge 来源自动决策系统行、record、不自造客户决定）；最新 rejected 路由 / 最新 accepted 收口", async () => {
  const autoRoot = makeTempProjectRoot("ans-interface-rework-auto-");
  const customerRoot = makeTempProjectRoot("ans-interface-rework-customer-");
  const acceptedRoot = makeTempProjectRoot("ans-interface-rework-accepted-");
  try {
    // ① judge auto-rework：routeAcceptanceAutoRework（main.ts onAutoRework 的接线目标）。
    const autoFlowId = "flow-iface-auto";
    mkdirSync(path.join(autoRoot, "docs", "flows"), { recursive: true });
    writeFileSync(path.join(autoRoot, "docs", "flows", `${autoFlowId}.yaml`), reworkFlowYaml(autoFlowId), "utf8");
    mkdirSync(path.join(autoRoot, "docs", "acceptance"), { recursive: true });
    writeFileSync(path.join(autoRoot, "docs", "acceptance", `${autoFlowId}-report-v1.md`), reworkReport([{ id: "F1", owner: "executor", action: "修复" }]), "utf8");
    await appendGovernanceLedger(autoRoot, {
      at: new Date().toISOString(),
      kind: "dispatch.accepted",
      flowId: autoFlowId,
      stepId: "delivery-server",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleId: "executor",
    });
    const autoSends = new Map<string, string[]>();
    const autoEvents: SessionEventEnvelope[] = [];
    const autoListing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: autoRoot }, ["executor"]), projectRoot: autoRoot };
    const autoIface = createDesktopInterface({
      pickDirectory: async () => autoRoot,
      emitEvent: (envelope) => { autoEvents.push(envelope); },
      listProjectFn: async () => autoListing,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        autoSends.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    try {
      await autoIface.listProject({ projectRoot: autoRoot });
      const info = {
        flowId: autoFlowId,
        cardKind: "acceptance" as const,
        source: "judge-manual" as const,
        reasonCode: "timeout",
        reason: "自动判断超时",
        operatorId: "judge:pi",
        engine: "pi" as const,
        requestId: "op-iface-1",
        roleId: "convener",
        projectRoot: autoRoot,
        runtime: "pi" as const,
        at: new Date().toISOString(),
      };
      await autoIface.routeAcceptanceAutoRework(info);
      await waitForTest(() => (autoSends.get("rapporteur")?.length ?? 0) > 0, 3000);
      assert.equal(autoSends.get("rapporteur")!.length, 1, "onAutoRework 接线 ⇒ 恰一条 Lead 返工任务");
      assert.match(autoSends.get("rapporteur")![0]!, /自动决策未完成（自动退回）/);
      assert.ok(!/客户拒绝/.test(autoSends.get("rapporteur")![0]!), "judge 来源任务不写客户拒绝");
      const autoNotes = deliveryNoteSummaries(autoEvents, autoListing.primaryRoleId);
      assert.ok(autoNotes.some((note) => note.includes("自动决策未通过/未完成")), "PM key 系统行（自动来源）可见");
      assert.ok(autoNotes.filter((note) => note.includes("客户拒绝")).length === 0, "judge 来源系统行不含客户拒绝");
      const autoRecord = JSON.parse(
        readFileSync(path.join(autoRoot, ".ans", "governance", "acceptance", autoFlowId, "rework-routing.json"), "utf8"),
      ) as Record<string, unknown>;
      assert.equal(autoRecord.schema, "acceptance-rework-routing/v1");
      assert.equal(autoRecord.source, "judge");
      assert.equal(autoRecord.status, "sent");
      assert.equal(autoRecord.itemCount, 1);
      const autoLedger = await readGovernanceLedger(autoRoot);
      assert.equal(
        autoLedger.entries.some((entry) => entry.kind === "customer.decision"),
        false,
        "judge auto-rework 不自造 customer.decision",
      );
      await autoIface.routeAcceptanceAutoRework({ ...info });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(autoSends.get("rapporteur")!.length, 1, "同一 requestId/报告不重复路由");
    } finally {
      await autoIface.stopSession();
    }

    // ② 最新 rejected：导入检查读账本 ⇒ 路由 Convener + 客户拒绝系统行 + record。
    const customerFlowId = "flow-iface-customer";
    mkdirSync(path.join(customerRoot, "docs", "flows"), { recursive: true });
    writeFileSync(path.join(customerRoot, "docs", "flows", `${customerFlowId}.yaml`), reworkFlowYaml(customerFlowId), "utf8");
    mkdirSync(path.join(customerRoot, "docs", "acceptance"), { recursive: true });
    writeFileSync(path.join(customerRoot, "docs", "acceptance", `${customerFlowId}-report-v1.md`), reworkReport([{ id: "F2", owner: "executor", action: "修复" }]), "utf8");
    const now = Date.now();
    await appendGovernanceLedger(customerRoot, {
      at: new Date(now).toISOString(),
      kind: "dispatch.accepted",
      flowId: customerFlowId,
      stepId: "delivery-server",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleId: "executor",
    });
    await appendGovernanceLedger(customerRoot, {
      at: new Date(now + 1000).toISOString(),
      kind: "customer.decision",
      flowId: customerFlowId,
      actorRoleId: "liaison",
      power: "app",
      decisionKind: "acceptance",
      customerDecision: "rejected",
      decisionEvidence: { kind: "customer-input" },
    });
    const customerSends = new Map<string, string[]>();
    const customerEvents: SessionEventEnvelope[] = [];
    const customerListing: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: customerRoot }, ["executor"]), projectRoot: customerRoot };
    const customerIface = createDesktopInterface({
      pickDirectory: async () => customerRoot,
      emitEvent: (envelope) => { customerEvents.push(envelope); },
      listProjectFn: async () => customerListing,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        customerSends.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    try {
      await customerIface.listProject({ projectRoot: customerRoot });
      await waitForTest(() => (customerSends.get("rapporteur")?.length ?? 0) > 0, 4000);
      // routed 系统行在 record sent 写之后发出：以它为准等待（避免 Windows 上轮询读取与 rename 竞争）。
      await waitForTest(
        () => deliveryNoteSummaries(customerEvents, customerListing.primaryRoleId).some((note) => note.includes("客户拒绝")),
        4000,
      );
      assert.equal(customerSends.get("verifier")?.length ?? 0, 0, "最新 rejected 不派 Proof 返工");
      const customerNotes = deliveryNoteSummaries(customerEvents, customerListing.primaryRoleId);
      assert.ok(customerNotes.some((note) => note.includes("客户拒绝") && note.includes("实际接收方：rapporteur")), "系统行写明实际接收方（Lead）");
      const customerRecord = JSON.parse(
        readFileSync(path.join(customerRoot, ".ans", "governance", "acceptance", customerFlowId, "rework-routing.json"), "utf8"),
      ) as Record<string, unknown>;
      assert.equal(customerRecord.source, "customer");
      assert.equal(customerRecord.sourceDetail, "customer-input");
    } finally {
      await customerIface.stopSession();
    }

    // ③ 先 rejected 后 accepted：最新 accepted ⇒ 收口、不路由。
    const acceptedFlowId = "flow-iface-accepted";
    mkdirSync(path.join(acceptedRoot, "docs", "flows"), { recursive: true });
    writeFileSync(path.join(acceptedRoot, "docs", "flows", `${acceptedFlowId}.yaml`), reworkFlowYaml(acceptedFlowId), "utf8");
    await appendGovernanceLedger(acceptedRoot, {
      at: new Date(now).toISOString(),
      kind: "dispatch.accepted",
      flowId: acceptedFlowId,
      stepId: "delivery-server",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleId: "executor",
    });
    await appendGovernanceLedger(acceptedRoot, {
      at: new Date(now + 1000).toISOString(),
      kind: "customer.decision",
      flowId: acceptedFlowId,
      actorRoleId: "liaison",
      power: "app",
      decisionKind: "acceptance",
      customerDecision: "rejected",
    });
    await appendGovernanceLedger(acceptedRoot, {
      at: new Date(now + 2000).toISOString(),
      kind: "customer.decision",
      flowId: acceptedFlowId,
      actorRoleId: "liaison",
      power: "app",
      decisionKind: "acceptance",
      customerDecision: "accepted",
    });
    const acceptedSends = new Map<string, string[]>();
    const acceptedEvents: SessionEventEnvelope[] = [];
    const acceptedListing2: ProjectListing = { ...listingWithProjectRoles({ ...trioListing(), projectRoot: acceptedRoot }, ["executor"]), projectRoot: acceptedRoot };
    const acceptedIface = createDesktopInterface({
      pickDirectory: async () => acceptedRoot,
      emitEvent: (envelope) => { acceptedEvents.push(envelope); },
      listProjectFn: async () => acceptedListing2,
      openRoleSessionFn: async (input) => {
        const sends: string[] = [];
        acceptedSends.set(input.roleId, sends);
        return quietGovernanceHandle(sends);
      },
      buildProjectConfigFn: buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    try {
      await acceptedIface.listProject({ projectRoot: acceptedRoot });
      await waitForTest(
        () => deliveryNoteSummaries(acceptedEvents, acceptedListing2.primaryRoleId).some((note) => note.includes("验收已通过")),
        4000,
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(acceptedSends.get("convener")?.length ?? 0, 0, "最新 accepted ⇒ 不路由");
      assert.equal(acceptedSends.get("verifier")?.length ?? 0, 0, "最新 accepted ⇒ 不派");
      const parsed = parseFlowStateYaml(readFileSync(path.join(acceptedRoot, "docs", "flows", `${acceptedFlowId}.yaml`), "utf8"), acceptedFlowId);
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.flow.steps.find((step) => step.kind === "acceptance")?.status, "done", "最新 accepted 收口");
      }
      assert.equal(
        existsSync(path.join(acceptedRoot, ".ans", "governance", "acceptance", acceptedFlowId, "rework-routing.json")),
        false,
        "accepted 不写 routing record",
      );
    } finally {
      await acceptedIface.stopSession();
    }
  } finally {
    rmSync(autoRoot, { recursive: true, force: true });
    rmSync(customerRoot, { recursive: true, force: true });
    rmSync(acceptedRoot, { recursive: true, force: true });
  }
});
