// test/桌面应用/interface.test.ts
// 桌面窗口 Interface 层单测：注入假下游，验证枚举→RoleView 映射、点角色即开（scope undefined、
// 导入即授权的 acceptance）、多轮 send 透传与切换角色的 dispose 语义。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { createDesktopInterface, createShellJudgeSwitch, isShellJudgeIpcSender } from "../../app/desktop/interface.ts";
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
import type { PinEvidenceResult } from "../../src/model/boundary.ts";

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

function trioListing(roleIds: string[] = ["rapporteur", "nominator", "convener"]): ProjectListing {
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
    "流程 flow-a：客户已接受提案 docs/proposals/flow-a-v1.md；流程单已落盘于 docs/flows/flow-a.md。" +
    "请执行提名：按流程单的首个提名步骤，读取提案与流程单，给出候选角色与理由，并通过任命卡请客户确认；不要自行任命或写角色卡。";
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
  assert.equal(notes[0].event.summary, "已派发提名任务给 Nominator（工作中）");
  await iface.stopSession();
});

test("治理自动推进（真机修正）：accept 先派 Convener 写流程单，落盘后才派 Nominator", async () => {
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
          // 模拟 Convener 本轮真正写出流程单（应用只读检查，不代写）。
          const handle = made.handle;
          const originalSend = handle.send.bind(handle);
          handle.send = async (text: string) => {
            await originalSend(text);
            mkdirSync(path.join(root, "docs", "flows"), { recursive: true });
            writeFileSync(path.join(root, "docs", "flows", "flow-a.md"), "# flow-a\n");
          };
        }
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
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
    assert.equal(sendsByRole.get("nominator")?.length ?? 0, 0, "流程单落盘前绝不派 Nominator");
    assert.deepEqual(sendsByRole.get("convener"), [
      "流程 flow-a：客户已接受提案 docs/proposals/flow-a-v1.md。" +
        "请先写流程单 docs/flows/flow-a.md（步骤表；首个步骤为提名：由 Nominator 读取提案并给出候选角色）。" +
        "写完后本轮即可结束；提名任务会在流程单落盘后由应用派给 Nominator。不要把步骤说成已派发。",
    ], "第一段任务明确要求先写流程单、首步提名");

    settleConvener!();
    const result = await advancing;
    assert.deepEqual(result, { ok: true, dispatched: true, targetRoleId: "convener", followUpRoleId: "nominator" });
    assert.deepEqual(openRoles, ["convener", "nominator"], "Convener settle 且流程单落盘后才开 Nominator");
    assert.deepEqual(sendsByRole.get("nominator"), [
      "流程 flow-a：客户已接受提案 docs/proposals/flow-a-v1.md；流程单已落盘于 docs/flows/flow-a.md。" +
        "请执行提名：按流程单的首个提名步骤，读取提案与流程单，给出候选角色与理由，并通过任命卡请客户确认；不要自行任命或写角色卡。",
    ], "第二段任务带流程路径，不再让 Nominator 猜");
    const notes = events
      .filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.deepEqual(notes, [
      "已派发流程任务给 Convener（工作中）",
      "流程单已落盘，已派发提名任务给 Nominator（工作中）",
    ]);
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("治理自动推进（真机修正）：Convener 未写流程单 ⇒ 不派 Nominator、如实报错、不循环", async () => {
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
    assert.equal(result.ok, false, "流程单缺失 ⇒ 整体如实失败");
    assert.equal(result.dispatched, true, "第一段（Convener）已完成");
    assert.match(result.error ?? "", /未写出流程单 docs\/flows\/flow-a\.md/);
    assert.ok(!openRoles.includes("nominator"), "流程单缺失时绝不派 Nominator");
    assert.equal(sendsByRole.get("nominator")?.length ?? 0, 0);
    const notes = events
      .filter((e) => e.roleId === "rapporteur" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.equal(notes.length, 2);
    assert.match(notes[1] ?? "", /自动推进停住：Convener 未写出流程单/);
    // 不循环：再等一拍，Convener 不再收到第二条任务。
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(sendsByRole.get("convener")?.length, 1, "不重试、不循环派发");
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("治理自动推进：accept-quick 与 appointment 都派发给 Convener；无下一步不派发", async () => {
  const sendsByRole = new Map<string, string[]>();
  const openRoles: string[] = [];
  let settleConvener: (() => void) | undefined;
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => listingWithProjectRoles(trioListing(), ["role-a", "role-b"]),
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
  await iface.listProject({ projectRoot: "/proj" });

  assert.equal((await iface.advanceGovernanceFlow({
    payload: { version: 1, flowId: "flow-q", cardKind: "proposal", nextFunction: "schedule", roleId: "convener" },
    context: { sourceRoleId: "rapporteur", projectRoot: "/proj", runtime: "demo" },
  })).ok, true);
  // 第一轮结束后（settled）下一张客户决定才直发；忙时应入队（既有投递机语义）。
  settleConvener?.();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal((await iface.advanceGovernanceFlow({
    payload: { version: 1, flowId: "flow-r", cardKind: "appointment", nextFunction: "schedule", roleId: "convener" },
    context: { sourceRoleId: "nominator", projectRoot: "/proj", runtime: "demo", targetRoleIds: ["role-a", "role-b"] },
  })).ok, true);

  assert.deepEqual(openRoles, ["convener"], "Convener 会话后台开启一次、后续续接（不重建）");
  assert.deepEqual(sendsByRole.get("convener"), [
    "流程 flow-q：客户已接受提案（快捷路径）。请写流程单 docs/flows/flow-q.md 并排步骤（无提名）；涉及新建/改边界仍须任命卡与写盘确认。",
    "流程 flow-r：客户已完成任命 role-a、role-b。请写流程单并派发已批准步骤。",
  ]);

  const before = (sendsByRole.get("convener") ?? []).length;
  const nothing = await iface.advanceGovernanceFlow({
    payload: { version: 1, flowId: "flow-r", cardKind: "acceptance", nextFunction: null, roleId: null },
    context: { sourceRoleId: "rapporteur", projectRoot: "/proj", runtime: "demo" },
  });
  assert.deepEqual(nothing, { ok: true, dispatched: false }, "验收收口/无下一步：不派发");
  assert.equal((sendsByRole.get("convener") ?? []).length, before, "无下一步不产生任何模型消息");
  await iface.stopSession();
});

test("治理自动推进（真机修正）：任命后角色未写出 ⇒ 先派 Nominator 写卡，角色出现后才派 Convener", async () => {
  const root = makeTempProjectRoot("ans-advance-appointment-");
  try {
    let rolesPresent = false;
    const listingNow = (): ProjectListing => {
      const base: ProjectListing = { ...trioListing(), projectRoot: root };
      return rolesPresent ? listingWithProjectRoles(base, ["executor"]) : base;
    };
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
          // 模拟 Nominator 用 appointment-write 写出角色卡（应用只读检查 listing）。
          const handle = made.handle;
          const originalSend = handle.send.bind(handle);
          handle.send = async (text: string) => {
            await originalSend(text);
            rolesPresent = true;
          };
        }
        return made.handle;
      },
      buildProjectConfigFn: buildProjectConfig,
    });
    await iface.listProject({ projectRoot: root });
    const advancing = iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-e", cardKind: "appointment", nextFunction: "schedule", roleId: "convener" },
      context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo", targetRoleIds: ["executor"], stepId: "step-appoint" },
    });
    await waitForTest(() => (sendsByRole.get("nominator")?.length ?? 0) > 0);
    assert.ok(!openRoles.includes("convener"), "角色未写出前绝不派 Convener");
    assert.deepEqual(sendsByRole.get("nominator"), [
      "流程 flow-e：客户已完成任命 executor，但角色卡/边界尚未写出（项目中尚未枚举到这些角色）。" +
        "请用 appointment-write 确认卡逐路径完成写卡与边界写入；写完后本轮结束，不要自行任命、不要派发。",
    ], "先派 Nominator 写卡，不派 Convener");
    settleNominator!();
    const result = await advancing;
    assert.deepEqual(result, { ok: true, dispatched: true, targetRoleId: "nominator", followUpRoleId: "convener" });
    assert.deepEqual(openRoles, ["nominator", "convener"], "Nominator settle、角色出现后才开 Convener");
    assert.deepEqual(sendsByRole.get("convener"), [
      "流程 flow-e：客户已完成任命 executor。请写流程单并派发已批准步骤。",
    ]);
    const notes = events
      .filter((e) => e.roleId === "nominator" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.deepEqual(notes, [
      "已派发写卡任务给 Nominator（工作中）",
      "已派发流程任务给 Convener（工作中）",
    ]);
    await iface.stopSession();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("治理自动推进（真机修正）：任命后角色始终未写出 ⇒ 不派 Convener、如实报错、不循环", async () => {
  const root = makeTempProjectRoot("ans-advance-appointment-missing-");
  try {
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
    });
    await iface.listProject({ projectRoot: root });
    const advancing = iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: "flow-e", cardKind: "appointment", nextFunction: "schedule", roleId: "convener" },
      context: { sourceRoleId: "nominator", projectRoot: root, runtime: "demo", targetRoleIds: ["executor"] },
    });
    await waitForTest(() => (sendsByRole.get("nominator")?.length ?? 0) > 0);
    settleNominator!();
    const result = await advancing;
    assert.equal(result.ok, false);
    assert.equal(result.dispatched, true, "第一段写卡任务已投递");
    assert.equal(result.targetRoleId, "nominator");
    assert.match(result.error ?? "", /角色卡\/边界仍未写出（executor 未枚举到）/);
    assert.ok(!openRoles.includes("convener"), "角色仍未写出时绝不派 Convener");
    assert.equal(sendsByRole.get("convener")?.length ?? 0, 0);
    const notes = events
      .filter((e) => e.roleId === "nominator" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note")
      .map((e) => e.event.summary);
    assert.equal(notes.length, 2);
    assert.match(notes[1] ?? "", /自动推进停住：角色卡\/边界仍未写出/);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(sendsByRole.get("nominator")?.length, 1, "不重试、不循环");
    assert.equal(sendsByRole.get("convener")?.length ?? 0, 0);
    await iface.stopSession();
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
  writeFileSync(
    path.join(root, "docs", "flows", `${flowId}.md`),
    `| 步骤 | 状态 |\n| --- | --- |\n| impl | ${status} |\n`,
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
    sendsByRole,
    events,
    repeatConvenerSettle: () => controls.get("convener")!.settle(),
    close: async () => {
      await iface.stopSession();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("收尾推进：回交送达 Convener 且流程全部完成 ⇒ 派 Rapporteur 恰一次；重复 settle 不重派", async () => {
  const scenario = await runHandbackAcceptanceScenario("done");
  try {
    const rapporteurSends = scenario.sendsByRole.get("rapporteur") ?? [];
    assert.equal(rapporteurSends.length, 1, "全部完成 ⇒ 恰一条验收汇总任务");
    assert.match(rapporteurSends[0] ?? "", /流程 flow-a 步骤已全部完成/);
    assert.match(rapporteurSends[0] ?? "", /流程单：docs\/flows\/flow-a\.md/);
    assert.match(rapporteurSends[0] ?? "", /docs\/reports\/impl\.md/, "任务带回交/核对报告路径");
    assert.match(rapporteurSends[0] ?? "", /请汇总证据并出验收卡/);
    assert.match(rapporteurSends[0] ?? "", /不要自行验收或代替客户决定/);
    const notes = scenario.events
      .filter((envelope) => envelope.roleId === "convener" && envelope.event.kind === "message" && (envelope.event as { detail?: { source?: string } }).detail?.source === "delivery-note")
      .map((envelope) => String((envelope.event as { summary?: string }).summary));
    assert.ok(notes.some((note) => /已派发验收汇总任务给 Rapporteur/.test(note)), "系统行如实告知已派发");
    scenario.repeatConvenerSettle();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(rapporteurSends.length, 1, "重复 settle 不重复派");
  } finally {
    await scenario.close();
  }
});

test("收尾推进：步骤未完成/阻塞 ⇒ 不派 Rapporteur（保持现状）", async () => {
  const pending = await runHandbackAcceptanceScenario("pending");
  try {
    assert.equal((pending.sendsByRole.get("rapporteur") ?? []).length, 0, "pending 步骤：不派");
  } finally {
    await pending.close();
  }
  const blocked = await runHandbackAcceptanceScenario("blocked");
  try {
    assert.equal((blocked.sendsByRole.get("rapporteur") ?? []).length, 0, "blocked 步骤：不派");
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
  assert.match(missing.error ?? "", /Nominator/);
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
  assert.match(sendFailed.error ?? "", /发送任务给 Nominator 失败/);
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

test("W6-B 真机修复：任命决定后等 Nominator 本轮 settle 再派 Convener（写入前不派）", async () => {
  const listing = listingWithProjectRoles(trioListing(), ["role-a"]);
  const settles = new Map<string, () => void>();
  const openRoles: string[] = [];
  const sendsByRole = new Map<string, string[]>();
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
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
  });
  await iface.listProject({ projectRoot: "/proj" });
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "nominator", runtime: "demo" })).ok, true);
  assert.equal((await iface.sendSession({
    text: "任命已确认，请写角色卡",
    target: { projectRoot: "/proj", roleId: "nominator", runtime: "demo" },
  })).ok, true, "Nominator 本轮开跑（写入尚未完成）");

  const advancing = iface.advanceGovernanceFlow({
    payload: {
      version: 1,
      flowId: "flow-c",
      cardKind: "appointment",
      nextFunction: "schedule",
      roleId: "convener",
    },
    context: { sourceRoleId: "nominator", projectRoot: "/proj", runtime: "demo", targetRoleIds: ["role-a"] },
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(!openRoles.includes("convener"), "Nominator 未 settle 前不得派 Convener（写入未完成）");
  assert.equal(sendsByRole.get("convener")?.length ?? 0, 0);

  settles.get("nominator")!();
  const result = await advancing;
  assert.equal(result.ok, true, "settle 后派发成功");
  assert.equal(result.dispatched, true);
  assert.ok(openRoles.includes("convener"), "settle 后后台开 Convener");
  assert.deepEqual(sendsByRole.get("convener"), [
    "流程 flow-c：客户已完成任命 role-a。请写流程单并派发已批准步骤。",
  ], "settle 后恰一条任务");
  await iface.stopSession();
});

test("W6-B 真机修复：listing 刷新失败不崩、不打断会话/派发（只记诊断）", async () => {
  const base = listingWithProjectRoles(trioListing(), ["role-a"]);
  let listCalls = 0;
  let projectChanged = 0;
  const settles = new Map<string, () => void>();
  const openRoles: string[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => "/proj",
    emitEvent: () => {},
    listProjectFn: async () => {
      listCalls += 1;
      if (listCalls === 1) return base;
      throw new Error("模拟读盘失败");
    },
    openRoleSessionFn: async (input) => {
      openRoles.push(input.roleId);
      const made = settleableGovernanceHandle([]);
      settles.set(input.roleId, made.settle);
      return made.handle;
    },
    buildProjectConfigFn: buildProjectConfig,
    emitProjectChanged: () => { projectChanged += 1; },
  });
  await iface.listProject({ projectRoot: "/proj" });
  assert.equal((await iface.openSession({ projectRoot: "/proj", roleId: "nominator", runtime: "demo" })).ok, true);
  settles.get("nominator")!();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(projectChanged, 0, "刷新失败不 emitProjectChanged");

  // 刷新失败后仍可按旧缓存推进（目标 Convener 是内置、旧缓存里就有）；不抛、不循环。
  const result = await iface.advanceGovernanceFlow({
    payload: { version: 1, flowId: "flow-c", cardKind: "appointment", nextFunction: "schedule", roleId: "convener" },
    context: { sourceRoleId: "nominator", projectRoot: "/proj", runtime: "demo", targetRoleIds: ["role-a"] },
  });
  assert.equal(result.ok, true);
  assert.ok(openRoles.includes("convener"));
  await iface.stopSession();
});
