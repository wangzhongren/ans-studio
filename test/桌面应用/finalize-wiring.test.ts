// test/桌面应用/finalize-wiring.test.ts
// 桌面应用（T36/T38）：**创世 finalize 接线**的验证——把「完成 bootstrap」从用户入口接通。
//
// 依据：设计 §12.5（su 不会算 hash，pin 只能由代码在 su 写完后算）/ §13（**完成方式重定**：su 提议收口 →
// 客户确认 → 才完成；T38 桌面确认面）/ 派发清单 T36/T38。编排已把能力挂在 `RoleSessionHandle.finalize`
// （经 `openRoleSession` 的 `genesisFinalize: true` 开启）；本层接线为：
//   · `app/desktop/session.ts::SessionManager.open` —— **仅**「未 bootstrap 项目上的内置治理角色（su）会话」
//     经 `openRoleSession` 开 `genesisFinalize: true`，并注入**客户确认通道** `operatorChannel`（T38）；
//     **有角色的普通聊天不开、不传**；
//   · `SessionManager.bootstrapState()` / `finalizeBootstrap()` —— 供界面「完成 bootstrap」入口读状态 / 显式触发。
//
// **T37 语义（本轮更新的关键）**：`finalize()` **不再「调用即完成」**——它是「**su 提议收口 → 挂起等客户
// 确认 → 确认通过才落盘**」（经注入的 `operatorChannel`）。故：
//   · **未接确认通道 / 客户拒绝 / 超时 → 不完成（fail-closed）且零副作用**；
//   · **接上并确认 → 完成**（写出治理边界文档 + `.ans/project.json` + manifest）。
//
// 用例用**系统临时目录**造假项目，跑完清理，**不在仓库里留文件**；确认通道**全用注入替身**（不弹系统对话框）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";

import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { OperatorPrompt, OperatorOutcome } from "../../src/provider/pi/session.ts";
import { openRoleSession, createPiAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { SessionManager } from "../../app/desktop/session.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const TMP = mkdtempSync(join(tmpdir(), "ans-desktop-finalize-"));
after(() => {
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

/** 造一个**空**项目目录（无 角色卡/ ⇒ hasRoles:false，即「未 bootstrap」）。 */
function emptyProject(): string {
  return mkdtempSync(join(TMP, "empty-"));
}

/** 在项目里造一个角色目录（模拟 su 建出角色：role-card.md + boundary.yaml——finalize 的 pin 对象之一）。 */
function writeRole(root: string, id: string, boundaryYaml = "entries:\n  - kind: file\n    path: src/x.ts\n    purpose: t\n"): void {
  const dir = join(root, "角色卡", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "role-card.md"), `# ${id}\n演示用角色。\n`);
  writeFileSync(join(dir, "boundary.yaml"), boundaryYaml);
}

const FAKE_DEMO = (opts: { gate: import("../../src/provider/pi/session.ts").WriteGate }) =>
  createFakeRuntimeAdapter({ gate: opts.gate });

// ——— 客户确认通道替身（T38）：finalize 收口时经它问客户。**不弹系统对话框**（注入替身）——
const allowChannel = async (_p: OperatorPrompt): Promise<OperatorOutcome> => ({ outcome: "allow", operatorId: "测试客户" });
const denyChannel = async (_p: OperatorPrompt): Promise<OperatorOutcome> => ({ outcome: "deny", operatorId: "测试客户", reason: "暂不收口" });
const unavailableChannel = async (_p: OperatorPrompt): Promise<OperatorOutcome> => ({ outcome: "unavailable", reason: "无人值守" });
/** 永不 resolve——配合极短 `confirmTimeoutMs` 测「超时 → 不完成」。 */
const neverChannel = (_p: OperatorPrompt): Promise<OperatorOutcome> => new Promise<OperatorOutcome>(() => {});

interface Opened {
  captured?: {
    roleId: string;
    project: ProjectConfig;
    genesisFinalize?: boolean;
    operatorChannel?: unknown;
    confirmTimeoutMs?: number;
  };
  manager: SessionManager;
}

/** 建一个真实下游的 SessionManager，并记录每次 openRoleSession 的入参（用于断言 genesisFinalize 是否传）。 */
function makeManager(
  listing: ProjectListing,
  opts?: { operatorChannel?: (p: OperatorPrompt) => Promise<OperatorOutcome>; confirmTimeoutMs?: number },
): Opened {
  const rec: Opened = { manager: undefined as unknown as SessionManager };
  rec.manager = new SessionManager({
    openRoleSession: (input, deps) => {
      rec.captured = input as Opened["captured"];
      return openRoleSession(input, deps);
    },
    createPiAdapterFactory,
    createDemoAdapter: FAKE_DEMO,
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: () => {},
    operatorChannel: opts?.operatorChannel,
    confirmTimeoutMs: opts?.confirmTimeoutMs,
  });
  return rec;
}

// ————————————————— ① genesisFinalize 只在创世 su 会话开启 —————————————————

test("创世 su 会话：openRoleSession 收到 genesisFinalize:true（未 bootstrap 项目上的内置治理角色）", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  assert.equal(listing.hasRoles, false, "空项目应为未 bootstrap");

  const rec = makeManager(listing, { operatorChannel: allowChannel });
  const res = await rec.manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  assert.equal(res.ok, true);
  assert.equal(rec.captured!.genesisFinalize, true, "创世 su 会话必须开启 genesisFinalize");
  assert.equal(typeof rec.captured!.operatorChannel, "function", "创世 su 会话必须注入客户确认通道");
  await rec.manager.stop();
});

test("有角色的普通聊天：openRoleSession **不**收到 genesisFinalize（未开启时逐字不传）", async () => {
  const listing = await listProject(REPO_ROOT);
  assert.equal(listing.hasRoles, true, "真实仓库根应有项目角色");

  const rec = makeManager(listing, { operatorChannel: allowChannel });
  const res = await rec.manager.open({ projectRoot: REPO_ROOT, roleId: "桌面应用", runtime: "demo" });
  assert.equal(res.ok, true);
  assert.equal(rec.captured!.genesisFinalize, undefined, "普通角色聊天不得开启 genesisFinalize");
  assert.ok(!("genesisFinalize" in rec.captured!), "键本身也不应出现（而非显式 undefined）");
  assert.ok(!("operatorChannel" in rec.captured!), "普通聊天不得注入客户确认通道（不消费它）");
  await rec.manager.stop();
});

test("有角色项目里的 su：仍是普通聊天 → 不开启 genesisFinalize", async () => {
  const listing = await listProject(REPO_ROOT);
  const rec = makeManager(listing);
  const res = await rec.manager.open({ projectRoot: REPO_ROOT, roleId: listing.primaryRoleId, runtime: "demo" });
  assert.equal(res.ok, true);
  assert.equal(rec.captured!.genesisFinalize, undefined, "已 bootstrap 项目里的 su 走普通边界，不该开启 finalize");
  await rec.manager.stop();
});

// ————————————————— ② bootstrapState：入口可见性 + settled 就绪态 —————————————————

test("bootstrapState：创世 su 会话 available；su 未说话时 settled:false，说过话后 settled:true", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  const { manager } = makeManager(listing);
  await manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  await tick();

  const before = manager.bootstrapState();
  assert.equal(before.available, true, "创世 su 会话应提供「完成 bootstrap」入口");
  assert.equal(before.settled, false, "su 还没说过话 → settled:false（界面据此提示现在点会被拒）");
  assert.equal(before.finalized, false);

  await manager.send("你好，请把角色建出来");
  await tick(80); // 等 settle 事件被 consume 循环消化（fake 适配器 prompt 后即发 settled）

  const afterSend = manager.bootstrapState();
  assert.equal(afterSend.settled, true, "su 说过一轮后 settled 应为真");
  assert.equal(afterSend.available, true, "仍可完成 bootstrap");
  await manager.stop();
});

test("bootstrapState：非创世会话（有角色的普通聊天）available:false（句柄无 finalize 能力）", async () => {
  const listing = await listProject(REPO_ROOT);
  const { manager } = makeManager(listing);
  await manager.open({ projectRoot: REPO_ROOT, roleId: "桌面应用", runtime: "demo" });
  await tick();
  const st = manager.bootstrapState();
  assert.equal(st.available, false, "普通聊天不得提供「完成 bootstrap」入口");
  await manager.stop();
});

test("bootstrapState：未开会话时 available:false", async () => {
  const listing = await listProject(REPO_ROOT);
  const { manager } = makeManager(listing);
  assert.equal(manager.bootstrapState().available, false);
});

// ————————————————— ③ finalize 成功路径（**接上确认通道并确认** → 完成；落盘在**临时目录**） —————————————————

test("finalize 成功：接上确认通道并确认 → 写出治理边界文档 + .ans/project.json + manifest，pin 覆盖角色边界", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  const { manager } = makeManager(listing, { operatorChannel: allowChannel });
  await manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  await tick();
  await manager.send("把角色建出来"); // 先 settle（finalize 的前置守卫）
  await tick(80);
  writeRole(root, "示例角色"); // 模拟 su 写出的角色（含 boundary.yaml——pin 对象）

  const res = await manager.finalizeBootstrap();
  assert.equal(res.ok, true, `finalize 应成功：${res.reason ?? ""}`);
  assert.deepEqual(
    res.wrote,
    ["角色卡/governance-boundary.yaml", ".ans/project.json", "docs/bootstrap-manifest.md"],
    "应写出项目治理边界文档 + 两份治理产物（§13.2：首次确认 finalize 写出治理边界文档）",
  );
  assert.deepEqual(res.roles, ["示例角色"], "应 pin 到被建出的角色");
  assert.ok(res.pins.length >= 1, "应至少 pin 一个边界文件");
  assert.ok(
    res.pins.some((p) => p.path === "角色卡/示例角色/boundary.yaml"),
    "pin 应覆盖新角色的 boundary.yaml",
  );
  assert.ok(res.pins.every((p) => /^[0-9a-f]{64}$/.test(p.sha256)), "每个 pin 应为 SHA-256 十六进制");

  // 落盘确证：文件真写出**临时项目**（绝不写仓库）。
  const ansPath = join(root, ".ans", "project.json");
  const manPath = join(root, "docs", "bootstrap-manifest.md");
  const govPath = join(root, "角色卡", "governance-boundary.yaml");
  assert.ok(existsSync(ansPath), ".ans/project.json 应写出");
  assert.ok(existsSync(manPath), "docs/bootstrap-manifest.md 应写出");
  assert.ok(existsSync(govPath), "角色卡/governance-boundary.yaml 应写出（项目治理边界文档）");
  const ans = JSON.parse(readFileSync(ansPath, "utf8"));
  assert.equal(ans.governanceBoundary.acceptance.accepted, true, ".ans 的 acceptance 应为已接受");
  assert.ok(Array.isArray(ans.governanceBoundary.acceptance.pin), ".ans 应带 pin 数组");
  assert.ok(readFileSync(manPath, "utf8").includes("Bootstrap 留痕"), "manifest 应为留痕文件");

  await manager.stop();
});

test("finalize 成功后：bootstrapState.finalized:true、available:false（入口应隐藏）", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  const { manager } = makeManager(listing, { operatorChannel: allowChannel });
  await manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  await tick();
  await manager.send("建角色");
  await tick(80);
  writeRole(root, "角色甲");
  const res = await manager.finalizeBootstrap();
  assert.equal(res.ok, true);
  const st = manager.bootstrapState();
  assert.equal(st.finalized, true, "已成功 finalize → finalized:true");
  assert.equal(st.available, false, "已 finalize → 入口应隐藏（不再给）");
  await manager.stop();
});

// ————————————————— ④ finalize 被拒路径（如实返回原因，不静默、不假装成功） —————————————————

test("finalize 被拒（未 settle）：su 一个字都没写 → ok:false、reason 点明 settle，且**零副作用**", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  const { manager } = makeManager(listing);
  await manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  await tick();
  // 不 send：会话未 settle（前置守卫应拒）。

  const res = await manager.finalizeBootstrap();
  assert.equal(res.ok, false, "未 settle 必须被拒");
  assert.match(res.reason || "", /settle/i, "原因应点明「未 settle」");
  assert.deepEqual(res.wrote, [], "被拒不得写出任何文件");
  assert.equal(existsSync(join(root, ".ans", "project.json")), false, "被拒零副作用：不得创建 .ans");
  assert.equal(existsSync(join(root, "docs", "bootstrap-manifest.md")), false, "被拒零副作用：不得创建 manifest");
  await manager.stop();
});

test("finalize 被拒（无可 pin 之物）：su 已 settle 但未写出任何边界文件 → ok:false、reason 点明 fail-closed", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  const { manager } = makeManager(listing);
  await manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  await tick();
  await manager.send("随便说点什么"); // settle 了，但没写出角色/治理边界
  await tick(80);

  const res = await manager.finalizeBootstrap();
  assert.equal(res.ok, false, "无可 pin 之物必须被拒（fail-closed）");
  assert.match(res.reason || "", /无可 pin/, "原因应点明「无可 pin 的东西」");
  assert.equal(existsSync(join(root, ".ans", "project.json")), false, "被拒零副作用：不得创建 .ans");
  await manager.stop();
});

test("finalize 被拒（会话不具备能力）：普通聊天 → ok:false，如实说明仅创世 su 会话可完成", async () => {
  const listing = await listProject(REPO_ROOT);
  const { manager } = makeManager(listing);
  await manager.open({ projectRoot: REPO_ROOT, roleId: "桌面应用", runtime: "demo" });
  await tick();
  const res = await manager.finalizeBootstrap();
  assert.equal(res.ok, false, "普通聊天不得 finalize");
  assert.match(res.reason || "", /不支持 finalize|创世/, "应如实说明能力范围");
  await manager.stop();
});

// ————————————————— ③b 确认通道（T38）：未接 / 拒绝 / 超时 → 不完成且零副作用 —————————————————

test("未接确认通道 → 不完成（fail-closed）：ok:false、状态 unavailable，且**零副作用**", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  const { manager } = makeManager(listing); // 不注入 operatorChannel
  await manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  await tick();
  await manager.send("把角色建出来"); // settle（前置守卫通过）
  await tick(80);
  writeRole(root, "示例角色"); // 有可 pin 之物（前置预检也通过）——只剩确认通道这一环

  const res = await manager.finalizeBootstrap();
  assert.equal(res.ok, false, "未接确认通道必须不完成");
  assert.equal(res.status, "unavailable", "状态应为 unavailable（通道缺失 → fail-closed）");
  assert.match(res.reason || "", /确认|通道|接入/, "原因应点明「未接 / 无法确认」");
  assert.deepEqual(res.wrote, [], "不完成不得写出任何文件");
  assert.equal(existsSync(join(root, ".ans", "project.json")), false, "不完成零副作用：不得创建 .ans");
  assert.equal(existsSync(join(root, "docs", "bootstrap-manifest.md")), false, "不完成零副作用：不得创建 manifest");
  assert.equal(existsSync(join(root, "角色卡", "governance-boundary.yaml")), false, "不完成零副作用：不得创建治理边界文档");
  assert.equal(manager.bootstrapState().finalized, false, "未完成 → 未标记 finalized");
  await manager.stop();
});

test("客户拒绝收口 → 不完成（declined）且**零副作用**；su 可继续", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  const { manager } = makeManager(listing, { operatorChannel: denyChannel });
  await manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  await tick();
  await manager.send("把角色建出来");
  await tick(80);
  writeRole(root, "示例角色");

  const res = await manager.finalizeBootstrap();
  assert.equal(res.ok, false, "客户拒绝必须不完成");
  assert.equal(res.status, "declined", "状态应为 declined（客户拒绝）");
  assert.match(res.reason || "", /未获客户确认|拒绝/, "原因应点明「未获确认」");
  assert.equal(existsSync(join(root, ".ans", "project.json")), false, "拒绝零副作用：不得创建 .ans");
  assert.equal(existsSync(join(root, "docs", "bootstrap-manifest.md")), false, "拒绝零副作用：不得创建 manifest");
  await manager.stop();
});

test("确认超时 → 不完成（fail-closed）且**零副作用**", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  // neverChannel 永不 resolve；confirmTimeoutMs 极短 ⇒ 触发硬超时（默认 120000，此处 30ms）。
  const { manager } = makeManager(listing, { operatorChannel: neverChannel, confirmTimeoutMs: 30 });
  await manager.open({ projectRoot: root, roleId: listing.primaryRoleId, runtime: "demo" });
  await tick();
  await manager.send("把角色建出来");
  await tick(80);
  writeRole(root, "示例角色");

  const res = await manager.finalizeBootstrap();
  assert.equal(res.ok, false, "确认超时必须不完成");
  assert.equal(res.status, "unavailable", "状态应为 unavailable（超时 → fail-closed）");
  assert.match(res.reason || "", /超时|确认/, "原因应点明「超时 / 未获确认」");
  assert.equal(existsSync(join(root, ".ans", "project.json")), false, "超时零副作用：不得创建 .ans");
  assert.equal(existsSync(join(root, "角色卡", "governance-boundary.yaml")), false, "超时零副作用：不得创建治理边界文档");
  await manager.stop();
});

// ————————————————— ⑤ 可注入句柄：finalize 结果原样转达（不改写、不伪成功） —————————————————

test("可注入句柄：finalize 结果原样转达（成功与失败都如实带回）", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# su",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
    ],
    warnings: [],
    hasRoles: false,
    primaryRoleId: "su",
  };
  let settled = false;
  const fakeResult = {
    ok: true,
    wrote: [".ans/project.json"],
    pins: [{ path: "角色卡/x/boundary.yaml", sha256: "a".repeat(64) }],
    roles: ["x"],
    projectJsonRel: ".ans/project.json",
    manifestRel: "docs/bootstrap-manifest.md",
  };
  const handle: RoleSessionHandle = {
    async send(): Promise<void> { settled = true; },
    events(): AsyncIterable<never> {
      return { [Symbol.asyncIterator]() { return { async next() { return { value: undefined as never, done: true }; } }; } };
    },
    async dispose(): Promise<void> {},
    get settled(): boolean { return settled; },
    async finalize() { return fakeResult as never; },
  };
  const manager = new SessionManager({
    openRoleSession: async () => handle,
    createPiAdapterFactory: () => { throw new Error("不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
  });
  await manager.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  assert.equal(manager.bootstrapState().available, true, "句柄带 finalize → 入口 available");
  assert.equal(manager.bootstrapState().settled, false);
  const res = await manager.finalizeBootstrap();
  assert.deepEqual(res, fakeResult, "finalize 结果应原样转达（不改写）");
  assert.equal(manager.bootstrapState().finalized, true, "成功后应记 finalized");
  await manager.stop();
});
