// test/桌面应用/interface.test.ts
// 2026-10-29 客户真机缺陷的桌面 Interface 钉子：
//   ① BUG-2 开关持久化：`setShellJudgeEnabled` / `setDecisionJudgeEnabled` 写应用偏好
//      （`<userData>/ans/preferences.json`），渲染重载（同一主进程开关实例）不再复位，
//      新启动按持久值恢复；非法输入不改状态、`available` 语义不变；写盘不可用时开关仍在本次会话生效。
//   ② 角色状态重放：`requestRoleStates()`（`session:role-states`）把全部在场会话的忙/闲快照经
//      既有 `emitRoleState` 通道重推——晚订阅（界面重载/项目刚导入）的渲染侧不再丢失「工作中」。
//   ③ 接线源码钉：main.ts handler / preload 桥 / 渲染侧主动拉取 / platform 类型（跨层契约）。
// 只跑主进程侧纯逻辑 + 假会话句柄；不启动 Electron、不触网、不写真实 userData。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

import {
  createDesktopInterface,
  createShellJudgeSwitch,
  desktopProjectExecutionInventory,
  type DesktopInterface,
} from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  createPreferencesService,
  preferencesFilePath,
  readPreferences,
} from "../../app/desktop/preferences.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import { inspectRoleSessionOpenFailure, recheckRoleSessionOpenFailure } from "../../src/pipeline/orchestration/run-role.ts";
import { beginGitHostAction, endGitHostAction, inspectGitHostCoordinator } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// ————————————————— ① BUG-2：偏好文件形状 / 合并 / 归一化 —————————————————

test("偏好文件：判断开关持久化（缺失=关、开时写 judgeSwitches、locale 切换不丢、全关回到旧形状）", async () => {
  const t = tempDir("ans-interface-prefs-");
  try {
    const file = preferencesFilePath(t.dir);
    const missing = await readPreferences(file);
    assert.deepEqual(missing.judgeSwitches, { approval: false, decision: false }, "首次启动默认关闭");
    assert.equal(fs.existsSync(file), false, "只读缺失文件不得创建");

    const service = createPreferencesService({ filePath: file, initialLocale: "zh-CN" });
    assert.deepEqual(service.getJudgeSwitches(), { approval: false, decision: false });
    const on = await service.setJudgeSwitch("approval", true);
    assert.deepEqual(on, { ok: true, judgeSwitches: { approval: true, decision: false } });
    assert.equal(
      fs.readFileSync(file, "utf8"),
      `${JSON.stringify({ version: 1, locale: "zh-CN", judgeSwitches: { approval: true, decision: false } })}\n`,
      "开态写入 judgeSwitches",
    );
    const afterOn = await readPreferences(file);
    assert.equal(afterOn.state, "valid");
    assert.deepEqual(afterOn.judgeSwitches, { approval: true, decision: false });

    // 切换 locale 保留开关持久值（同一文件合并写）。
    await service.setJudgeSwitch("decision", true);
    await service.setLocale("en-US");
    const merged = await readPreferences(file);
    assert.equal(merged.locale, "en-US");
    assert.deepEqual(merged.judgeSwitches, { approval: true, decision: true }, "locale 写入不得丢开关");

    // 全关 ⇒ 省略 judgeSwitches，保持旧文件形状 `{version, locale}`（i18n 契约向后兼容）。
    await service.setJudgeSwitch("approval", false);
    await service.setJudgeSwitch("decision", false);
    assert.equal(fs.readFileSync(file, "utf8"), `${JSON.stringify({ version: 1, locale: "en-US" })}\n`);

    // 非法字段：locale 仍按有效值读取，开关回退全关 + 稳定诊断。
    fs.writeFileSync(file, JSON.stringify({ version: 1, locale: "en-US", judgeSwitches: { approval: "yes" } }));
    const malformed = await readPreferences(file);
    assert.equal(malformed.state, "valid");
    assert.equal(malformed.locale, "en-US");
    assert.deepEqual(malformed.judgeSwitches, { approval: false, decision: false });
    assert.deepEqual(
      malformed.diagnostics.map((d) => [d.code, d.reasonCode]),
      [["preferences.judge.invalid", "invalid-judge-switches"]],
    );

    // 连点（并发写）：两次开关写按序串行落盘，最终文件同时含两个开态（后写不会被先写覆盖）。
    const racedFile = preferencesFilePath(path.join(t.dir, "raced"));
    const raced = createPreferencesService({ filePath: racedFile, initialLocale: "zh-CN" });
    await Promise.all([raced.setJudgeSwitch("approval", true), raced.setJudgeSwitch("decision", true)]);
    assert.deepEqual(
      (await readPreferences(racedFile)).judgeSwitches,
      { approval: true, decision: true },
      "并发开关写不得互相覆盖",
    );
  } finally {
    t.cleanup();
  }
});

test("开关持久化：设置→写盘；渲染重载（同主进程实例）保持；新启动按持久值恢复；非法输入/available 语义不变", async () => {
  const t = tempDir("ans-interface-judge-");
  try {
    const file = preferencesFilePath(t.dir);
    const baseDeps = {
      preferencesPath: file,
      pickDirectory: async () => null,
      emitEvent: () => {},
      runtimeStatePath: path.join(t.dir, "runtime-selection.json"),
      envFilePath: path.join(t.dir, ".env"),
      piConfigEnv: {} as Record<string, string | undefined>,
    };

    // 启动 1：无偏好 ⇒ 两个开关都关（main.ts 的共享实例 + Interface 同一实例）。
    const start1 = await readPreferences(file);
    const shellSwitch = createShellJudgeSwitch(start1.judgeSwitches.approval);
    const decisionSwitch = createShellJudgeSwitch(start1.judgeSwitches.decision);
    const desktop1 = createDesktopInterface({
      ...baseDeps,
      initialJudgeSwitches: start1.judgeSwitches,
      shellJudgeSwitch: shellSwitch,
      decisionJudgeSwitch: decisionSwitch,
    });
    assert.equal(desktop1.getShellJudgeState().enabled, false);
    assert.equal(desktop1.getDecisionJudgeState().enabled, false);

    assert.deepEqual(await desktop1.setShellJudgeEnabled({ enabled: true }), {
      version: 1,
      ok: true,
      enabled: true,
      available: true,
    });
    assert.deepEqual(await desktop1.setDecisionJudgeEnabled({ enabled: true }), {
      version: 1,
      ok: true,
      enabled: true,
      available: true,
    });
    const persisted = await readPreferences(file);
    assert.deepEqual(persisted.judgeSwitches, { approval: true, decision: true }, "开关设置必须落盘到应用偏好");

    // 渲染重载：main.ts `loadInterface()` 不再复位；同一实例重建 Interface 后仍为开。
    const desktopReload = createDesktopInterface({
      ...baseDeps,
      shellJudgeSwitch: shellSwitch,
      decisionJudgeSwitch: decisionSwitch,
    });
    assert.equal(desktopReload.getShellJudgeState().enabled, true, "重载后「替我审批」保持开启");
    assert.equal(desktopReload.getDecisionJudgeState().enabled, true, "重载后「替我决策」保持开启");

    // 新启动：从持久值种子（main.ts `createShellJudgeSwitch(initialJudgeSwitches.*)`）。
    const start2 = await readPreferences(file);
    const desktopRestart = createDesktopInterface({ ...baseDeps, initialJudgeSwitches: start2.judgeSwitches });
    assert.equal(desktopRestart.getShellJudgeState().enabled, true, "新启动恢复「替我审批」");
    assert.equal(desktopRestart.getDecisionJudgeState().enabled, true, "新启动恢复「替我决策」");
    assert.equal(desktopRestart.getShellJudgeState().available, true, "available 语义不变（本版本恒 true）");

    // 非法输入：不改状态、不改文件；available 仍 true。
    const beforeInvalid = fs.readFileSync(file, "utf8");
    const invalid = await desktopRestart.setShellJudgeEnabled({ enabled: "yes" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.available, true);
    assert.equal(desktopRestart.getShellJudgeState().enabled, true, "非法输入不得改状态");
    assert.equal(fs.readFileSync(file, "utf8"), beforeInvalid, "非法输入不得改文件");

    // 关闭：写盘为全关（省略字段）。
    await desktopRestart.setShellJudgeEnabled({ enabled: false });
    await desktopRestart.setDecisionJudgeEnabled({ enabled: false });
    assert.deepEqual((await readPreferences(file)).judgeSwitches, { approval: false, decision: false });

    // 持久化不可用（未注入 preferencesPath）：开关仍在本次会话生效，但如实不写盘。
    const memoryOnly = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {} });
    const okMemory = await memoryOnly.setShellJudgeEnabled({ enabled: true });
    assert.equal(okMemory.ok, true, "写盘不可用不得阻止本次会话开关");
    assert.equal(memoryOnly.getShellJudgeState().enabled, true);
  } finally {
    t.cleanup();
  }
});

test("接线源码钉：loadInterface 不再复位开关；新启动从 initialJudgeSwitches 种子", () => {
  const main = read("app/main.ts");
  const loadStart = main.indexOf("const loadInterface");
  assert.ok(loadStart >= 0, "main.ts 应有 loadInterface");
  const loadBody = main.slice(loadStart, main.indexOf("observeWindowDiagnostics(win, mainDiagnostic", loadStart));
  assert.equal(loadBody.includes("shellJudgeSwitch.reset()"), false, "渲染重载不得复位「替我审批」");
  assert.equal(loadBody.includes("decisionJudgeSwitch.reset()"), false, "渲染重载不得复位「替我决策」");
  assert.ok(main.includes("createShellJudgeSwitch(initialJudgeSwitches.approval)"), "新启动按持久值种子（approval）");
  assert.ok(main.includes("createDecisionDelegationSwitch(initialJudgeSwitches.decision)"), "新启动按持久值种子（decision）");
  assert.ok(main.includes("initialJudgeSwitches = preferencesRead.judgeSwitches"), "启动读取偏好后填充开关初值");
});

// ————————————————— ② 角色状态重放（session:role-states） —————————————————

interface FakeHandle extends RoleSessionHandle {
  push(event: OrchestrationEvent): void;
  release(): void;
  sendCalls: string[];
}

function fakeHandle(): FakeHandle {
  const pending: OrchestrationEvent[] = [];
  let closed = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handle: FakeHandle = {
    sendCalls: [],
    async send(text: string): Promise<void> {
      handle.sendCalls.push(text);
      await gate; // 挂起整轮：会话保持 busy，模拟真实长任务
    },
    events(): AsyncIterable<OrchestrationEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              while (pending.length === 0 && !closed) await tick(5);
              if (pending.length > 0) return { value: pending.shift()!, done: false };
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {
      closed = true;
    },
    push(event) {
      pending.push(event);
    },
    release() {
      release();
    },
  };
  return handle;
}

function twoRoleListing(): ProjectListing {
  const role = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: "/proj",
    roles: [role("A"), role("B")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "A",
    governanceModel: "single",
  };
}

test("requestRoleStates：客户仅chief可发；其他角色伪内部来源拒绝，停止/诊断与状态重放仍可用", async () => {
  const t = tempDir("ans-interface-replay-");
  const states: Parameters<NonNullable<Parameters<typeof createDesktopInterface>[0]["emitRoleState"]>>[0][] = [];
  const handles: Record<string, FakeHandle> = { chief: fakeHandle(), B: fakeHandle() };
  const listing = twoRoleListing();
  listing.roles[0] = { ...listing.roles[0]!, roleId: "chief", builtIn: true, governanceFunction: "chief" };
  listing.primaryRoleId = "chief";
  listing.governanceModel = "trio";
  const desktop: DesktopInterface = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    emitRoleState: (state) => states.push(state),
    listProjectFn: async () => listing,
    buildProjectConfigFn: buildProjectConfig,
    openRoleSessionFn: async (input) => handles[input.roleId]!,
    envFilePath: path.join(t.dir, ".env"),
    piConfigEnv: {},
    runtimeStatePath: path.join(t.dir, "runtime-selection.json"),
  });
  try {
    await desktop.listProject({ projectRoot: "/proj" });
    assert.equal((await desktop.openSession({ projectRoot: "/proj", roleId: "chief", runtime: "demo" })).ok, true);
    assert.equal((await desktop.openSession({ projectRoot: "/proj", roleId: "B", runtime: "demo" })).ok, true);
    await tick(30);

    // 两个角色都进入「工作中」（send 挂起未返回）。
    const sendA = desktop.sendSession({ text: "A 的活", target: { roleId: "chief", projectRoot: "/proj", runtime: "demo" } });
    const sendB = await desktop.sendSession({ text: "B 的活", target: { roleId: "B", projectRoot: "/proj", runtime: "demo" }, metadata: { background: true, kind: "system" } });
    assert.equal(sendB.ok, false);
    assert.equal(handles.B.sendCalls.length, 0, "Renderer cannot impersonate an internal dispatch/report origin");
    await tick(40);
    assert.ok(states.some((s) => s.roleId === "chief" && s.busy === true), "A 开跑即外推 busy");
    assert.ok(states.some((s) => s.roleId === "B" && s.busy === false), "Diagnostic session stays idle after denied customer send");

    // 晚订阅的渲染侧：主动拉快照 → 重放两条。
    states.length = 0;
    assert.deepEqual(await desktop.requestRoleStates(), { ok: true });
    assert.equal(states.length, 2, "重放应恰好两条（每个在场会话一条）");
    assert.deepEqual(states.map((s) => s.roleId).sort(), ["B", "chief"]);
    assert.equal(states.find(s => s.roleId === "chief")?.busy, true);
    assert.equal(states.find(s => s.roleId === "B")?.busy, false);
    assert.ok(states.every((s) => s.runtime === "demo" && s.projectRoot === "/proj"));

    // 两轮结束 → 重放为闲。
    handles.chief.release();
    handles.B.release();
    await sendA;
    await sendB;
    handles.chief.push({ kind: "settled", summary: "A 结束" });
    handles.B.push({ kind: "settled", summary: "B 结束" });
    await tick(60);
    states.length = 0;
    await desktop.requestRoleStates();
    assert.equal(states.length, 2);
    assert.ok(states.every((s) => s.busy === false), "结束后重放为空闲");
  } finally {
    await desktop.stopSession();
    t.cleanup();
  }
});

test("接线源码钉：session:role-states handler / preload 桥 / 渲染侧主动拉取 / platform 类型", () => {
  const main = read("app/main.ts");
  assert.ok(
    main.includes('registerHandler("session:role-states", () => desktop.requestRoleStates())'),
    "main.ts 应注册 session:role-states → Interface.requestRoleStates",
  );
  const preload = read("app/preload.cjs");
  assert.ok(preload.includes('requestRoleStates: () => ipcRenderer.invoke("session:role-states")'), "preload 应暴露 requestRoleStates");
  const rendererIpc = read("app/renderer/src/chat/ipc.ts");
  assert.ok(rendererIpc.includes("bridge.onRoleState?.(handleRoleState)"), "渲染侧仍订阅 session:role-state");
  assert.ok(rendererIpc.includes("void bridge.requestRoleStates?.()"), "界面加载后主动拉一次快照重放");
  const platform = read("app/renderer/src/lib/platform.ts");
  assert.ok(platform.includes("requestRoleStates?: () => Promise<{ ok: boolean }>"), "platform 桥类型声明");
  const iface = read("app/desktop/session.ts");
  assert.ok(iface.includes("broadcastRoleStates(): void"), "SessionManager 提供快照重放");
});


test("decision权威revision只由主进程推进，非法set不变，重开旧revision失效", async () => {
  const { createDecisionDelegationSwitch } = await import("../../app/desktop/interface.ts");
  const state = createDecisionDelegationSwitch();
  const initial = state.get(); let updates = 0;
  const unsubscribe = state.subscribe(() => { updates++; });
  assert.equal(initial.enabled, false);
  state.set({ enabled: true }); const enabled = state.get();
  assert.ok(enabled.revision > initial.revision);
  state.set({ enabled: false }); state.set({ enabled: true });
  assert.ok(state.get().revision > enabled.revision);
  const current = state.get().revision;
  assert.equal(state.set({ enabled: true, revision: 0 }).ok, false);
  assert.equal(state.get().revision, current);
  assert.equal(updates, 3);
  unsubscribe(); state.reset();
  assert.equal(updates, 3); assert.ok(state.get().revision > current);
});


test("W13 官方pureChat真实lease-busy失败保同attempt引用，重开不跨host且历史行保留", async () => {
  const { dir: root, cleanup } = tempDir("ans-w13-official-failure-");
  const priorWire = process.env.ANS_CODEX_WIRE_API, priorKey = process.env.ANS_W13_LOCAL_HTTP_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W13_LOCAL_HTTP_KEY = "fixture-only";
  let requests = 0, desktop: DesktopInterface | undefined;
  let held: { leaseId: string } | undefined;
  const server = createServer((_request, response) => { requests++; response.writeHead(500); response.end("unexpected inference"); });
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address !== "string");
    desktop = createDesktopInterface({ pickDirectory: async () => root, emitEvent() {},
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W13_LOCAL_HTTP_KEY",
        modelId: "w13-local-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 1000, turnLastResortMs: 3000 },
      envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json") });
    assert.equal(await desktop.pickProject(), root); await desktop.listProject({ projectRoot: root });
    const beforeRevision = desktopProjectExecutionInventory(root).revision;
    const lease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(lease.ok); held = lease;
    const refused = await desktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" });
    assert.equal(refused.ok, false); assert.match(refused.error ?? "", /git-host-coordinator-busy/);
    const failedInventory = desktopProjectExecutionInventory(root); assert.equal(failedInventory.sessions.length, 1);
    const failed = failedInventory.sessions[0]!;
    assert.equal(failed.phase, "open-failed"); assert.deepEqual(failed.errors, ["partial-construction-closure-unproven"]);
    assert.equal(failed.coreSessionId, undefined); assert.ok(failed.openFailureRef);
    assert.deepEqual(Object.keys(failed.openFailureRef).sort(), ["failureId", "source"]);
    assert.equal(failed.openFailureRef.source, "pipeline-role-open-failure");
    const fresh = recheckRoleSessionOpenFailure({ ref: failed.openFailureRef, hostHandleId: failed.hostHandleId,
      projectRoot: root, roleId: "chief", runtime: "codex" });
    assert.equal(fresh?.status, "never-started");
    assert.equal(recheckRoleSessionOpenFailure({ ref: failed.openFailureRef, hostHandleId: `${failed.hostHandleId}-other`,
      projectRoot: root, roleId: "chief", runtime: "codex" }), undefined);
    assert.equal(await inspectRoleSessionOpenFailure({ error: new Error("unknown same-text error"), hostHandleId: failed.hostHandleId }), undefined);
    const published = inspectGitHostCoordinator({ projectRoot: root });
    assert.equal(published.activeAction, "git-mutation", "Failed open never releases another owner's lease");
    assert.deepEqual(published.inventory?.sessions.find(row => row.hostHandleId === failed.hostHandleId)?.openFailureRef, failed.openFailureRef);
    assert.ok(failedInventory.revision > beforeRevision); assert.equal(requests, 0);
    assert.ok(endGitHostAction({ projectRoot: root, leaseId: held.leaseId }).ok); held = undefined;
    const retry = await desktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" }); assert.ok(retry.ok, retry.error ?? "retry failed");
    const retried = desktopProjectExecutionInventory(root); assert.equal(retried.sessions.length, 2);
    const live = retried.sessions.find(row => row.phase === "live")!; assert.ok(live);
    assert.notEqual(live.hostHandleId, failed.hostHandleId); assert.ok(live.coreSessionId); assert.equal(live.openFailureRef, undefined);
    assert.equal(live.toolSurface?.factoryProvenance, "default-production"); assert.equal(live.toolSurface?.native?.factory, "codex-chat");
    assert.equal(retried.sessions.find(row => row.hostHandleId === failed.hostHandleId)?.phase, "open-failed");
    assert.equal(recheckRoleSessionOpenFailure({ ref: failed.openFailureRef, hostHandleId: live.hostHandleId,
      projectRoot: root, roleId: "chief", runtime: "codex" }), undefined);
    assert.equal(requests, 0, "Pure preparation/retry does not send inference or start a custom provider");
    if (process.env.ANS_W13_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.ANS_W13_EVIDENCE_DIR, "official-failure-ref.json"),
      JSON.stringify({ root, refused, failedInventory, published, fresh, retry, retried, requests }, null, 2));
  } finally {
    if (held) endGitHostAction({ projectRoot: root, leaseId: held.leaseId });
    await desktop?.stopSession(); desktop?.disposeProjectDocuments(); server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (priorWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = priorWire;
    if (priorKey === undefined) delete process.env.ANS_W13_LOCAL_HTTP_KEY; else process.env.ANS_W13_LOCAL_HTTP_KEY = priorKey;
    if (!process.env.ANS_W13_EVIDENCE_DIR) cleanup();
  }
});

test("W13 custom SDK构造真副作用后throw无failureRef，原错误/未知失败库存不变", async () => {
  const { dir: root, cleanup } = tempDir("ans-w13-custom-failure-");
  const marker = path.join(root, "actual-sdk-effect.txt"), original = new Error("owned custom SDK effect then throw");
  let constructions = 0;
  const desktop = createDesktopInterface({ pickDirectory: async () => root, emitEvent() {},
    createRuntimeAdapterFactoryFn: () => () => { constructions++; fs.writeFileSync(marker, "actual custom constructor entered\n"); throw original; },
    envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json") });
  try {
    assert.equal(await desktop.pickProject(), root); await desktop.listProject({ projectRoot: root });
    const result = await desktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" });
    assert.equal(result.ok, false); assert.equal(result.error, original.message); assert.equal(constructions, 1);
    assert.equal(fs.readFileSync(marker, "utf8"), "actual custom constructor entered\n");
    const inventory = desktopProjectExecutionInventory(root); assert.equal(inventory.sessions.length, 1);
    const failed = inventory.sessions[0]!; assert.equal(failed.phase, "open-failed");
    assert.deepEqual(failed.errors, ["partial-construction-closure-unproven"]); assert.equal(failed.openFailureRef, undefined);
    assert.equal(await inspectRoleSessionOpenFailure({ error: original, hostHandleId: failed.hostHandleId }), undefined);
    const published = inspectGitHostCoordinator({ projectRoot: root }).inventory;
    assert.equal(published?.sessions.find(row => row.hostHandleId === failed.hostHandleId)?.openFailureRef, undefined);
    assert.equal(published?.coverage, "unknown");
    if (process.env.ANS_W13_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.ANS_W13_EVIDENCE_DIR, "custom-effect-no-ref.json"),
      JSON.stringify({ root, result, constructions, markerContent: fs.readFileSync(marker, "utf8"), inventory, published }, null, 2));
  } finally { await desktop.stopSession(); desktop.disposeProjectDocuments(); if (!process.env.ANS_W13_EVIDENCE_DIR) cleanup(); }
});
