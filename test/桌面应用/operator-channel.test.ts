// test/桌面应用/operator-channel.test.ts
// 桌面应用：操作者确认通道 (a) 的逻辑与 fail-closed 单测 + arm 接缝（不真弹窗、无 electron）。
//
// 设计依据：§7.3（(a) 是第三闸、兜底，只有当 (b) 拿不准/不可用时才叫人）、§7.4（落点 app/ 对话框）、
// §7.5（fail-closed 三条：拒绝 / 超时 / 不可用）、§7.6（审计 by/branch 归编排）。
//
// 契约（**单一来源 = §4 冻结契约家**）：入参 `OperatorPrompt`、出参 `OperatorOutcome`——T22 起从
// `src/provider/pi/session.ts` **只读导入**（不再逐字镜像；§6 通路已开，详见 app/desktop/operator-channel.ts 顶部）。
//
// 关键纪律：本通道**不做任何命令判定**——命令原文字节级如实呈现、取人选择、不确定即给非放行结论；
// 真正的「恰好 allow:true 才 spawn」在 Pi 适配器的 execute（不在本角色）。故此处用**可注入替身**验证逻辑，
// **绝不真弹窗**（Windows 上无真实用户点击会挂死——e2e/单测一律不碰真实 dialog）。

import test from "node:test";
import assert from "node:assert/strict";

import type { ShellGate, RuntimeAdapter, SessionEvent, OperatorPrompt } from "../../src/provider/pi/session.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import {
  createDesktopOperatorChannel,
  describeShellCommand,
  DESKTOP_SHELL_GATE_ARMED,
  type OperatorPresenter,
} from "../../app/desktop/operator-channel.ts";

/** 造一个请求（`OperatorPrompt`）——命令原文含 shell 元字符（本执行模型下只是普通参数，但人仍应逐字看到）。 */
function req(command: string, argv: string[], cwd = "D:/proj", reason?: string): OperatorPrompt {
  return reason === undefined
    ? { command, argv, cwd, toolCallId: "call-1" }
    : { command, argv, cwd, toolCallId: "call-1", reason };
}

// ————————————————— §7.4/判据：命令原文字节级如实展示 —————————————————

test("describeShellCommand：命令原文逐字呈现（不加工、不截断），argv 逐项、cwd 原样", () => {
  const raw = "git status ; echo hi > out.txt $(rm -rf /)";
  const d = describeShellCommand(req(raw, ["git", "status", "a b", 'q"x']));
  assert.equal(d.command, raw, "命令原文须逐字一致");
  assert.deepEqual(d.argv, ["git", "status", "a b", 'q"x'], "argv 逐项保留（含空格/引号的项）");
  // argv 逐行 JSON 转义显示，便于无歧义核对。
  assert.equal(d.argvLines[2], '[2] "a b"', "含空格项应 JSON 转义显示");
  assert.equal(d.cwd, "D:/proj");
  // 提示正文必须含**逐字**命令原文（避免「糊里糊涂点确定」）。
  assert.ok(d.text.includes(raw), "提示正文须内嵌命令原文");
  assert.ok(d.text.includes("逐字"), "提示应明示「逐字核对」");
  assert.ok(d.text.includes("工作目录 cwd"), "提示应含 cwd 段");
  assert.ok(d.text.includes("不会执行"), "提示应说明拒绝=不执行");
  assert.equal(d.reason, undefined, "无 reason 时不展示升级原因");
});

test("describeShellCommand：reason 有值时被展示（(b) 为何交人确认）", () => {
  const raw = "npm run build";
  const d = describeShellCommand(req(raw, ["npm", "run", "build"], "D:/proj", "pm 拿不准，交操作者"));
  assert.equal(d.reason, "pm 拿不准，交操作者", "reason 应如实带出");
  assert.ok(d.text.includes("升级原因"), "提示应含「升级原因」段");
  assert.ok(d.text.includes("pm 拿不准，交操作者"), "提示正文须内嵌 reason 原文");
});

test("describeShellCommand：对不可信输入稳健（argv 含非字符串项被过滤，缺字段不炸）", () => {
  const d = describeShellCommand({
    command: "ls",
    argv: ["ls", 42, null, undefined, "-la"] as unknown as string[],
    cwd: "",
    toolCallId: "",
  });
  assert.deepEqual(d.argv, ["ls", "-la"], "非字符串项应被过滤");
  assert.equal(d.cwd, "");
});

// ————————————————— 放行 / 拒绝（出参 = OperatorOutcome） —————————————————

test("操作者放行：presenter 返回 allow → {outcome:'allow', operatorId}，且 presenter 收到原文", async () => {
  let got: { prompt: OperatorPrompt; text: string } | undefined;
  const presenter: OperatorPresenter = {
    async present(prompt, display) {
      got = { prompt, text: display.text };
      return { allow: true };
    },
  };
  const ch = createDesktopOperatorChannel({ presenter, operatorId: "alice" });
  const res = await ch(req("npm test", ["npm", "test"]));
  assert.deepEqual(res, { outcome: "allow", operatorId: "alice" });
  assert.ok(got, "presenter 应被调用（人看到原文才点到放行）");
  assert.equal(got!.prompt.command, "npm test", "presenter 收到的命令原文须一致");
  assert.ok(got!.text.includes("npm test"));
});

test("操作者拒绝：presenter 返回 deny → {outcome:'deny', operatorId}，reason 可读", async () => {
  const presenter: OperatorPresenter = { async present() { return { allow: false }; } };
  const ch = createDesktopOperatorChannel({ presenter, operatorId: "bob" });
  const res = await ch(req("rm -rf x", ["rm", "-rf", "x"]));
  assert.equal(res.outcome, "deny");
  assert.equal((res as { operatorId?: string }).operatorId, "bob");
  assert.match((res as { reason: string }).reason, /拒绝/);
});

test("拒绝带上 note（如操作者附言）时如实带出为 reason", async () => {
  const presenter: OperatorPresenter = { async present() { return { allow: false, note: "疑似危险，先别跑" }; } };
  const ch = createDesktopOperatorChannel({ presenter, operatorId: "bob" });
  const res = await ch(req("x", ["x"]));
  assert.equal(res.outcome, "deny");
  assert.equal((res as { reason: string }).reason, "疑似危险，先别跑");
});

test("仅 outcome:'allow' 放行：presenter 返回非布尔/false → 一律 deny（绝不默认放行）", async () => {
  const ch = createDesktopOperatorChannel({
    presenter: { async present() { return { allow: 1 as unknown as boolean }; } },
    operatorId: "z",
  });
  const res = await ch(req("ls", ["ls"]));
  assert.equal(res.outcome, "deny", "allow 字段非 true（非布尔）必须拒绝");
});

// ————————————————— fail-closed 三条（§7.5）：拒绝 / 超时 / 不可用 —————————————————

test("fail-closed·不可用：presenter 抛错 → unavailable（编排据此拒绝）", async () => {
  const presenter: OperatorPresenter = { async present() { throw new Error("窗口已关"); } };
  const ch = createDesktopOperatorChannel({ presenter, operatorId: "carol" });
  const res = await ch(req("ls", ["ls"]));
  assert.equal(res.outcome, "unavailable", "通道抛错必须给非放行结论，绝不默认放行");
  assert.match((res as { reason: string }).reason, /不可用/);
});

test("fail-closed·未配置：无 presenter → unavailable（能力缺席即 fail-closed）", async () => {
  const ch = createDesktopOperatorChannel({ operatorId: "dave" });
  const res = await ch(req("ls", ["ls"]));
  assert.equal(res.outcome, "unavailable");
  assert.match((res as { reason: string }).reason, /未配置/);
});

test("fail-closed·超时：presenter 不返回 → 超时即 unavailable（编排据此拒绝）", async () => {
  const presenter: OperatorPresenter = { present() { return new Promise<{ allow: boolean }>(() => {}); } };
  const ch = createDesktopOperatorChannel({ presenter, operatorId: "erin", timeoutMs: 20 });
  const res = await ch(req("node -e 1", ["node", "-e", "1"]));
  assert.equal(res.outcome, "unavailable", "确认超时 = 非放行（绝不默认放行）");
  assert.match((res as { reason: string }).reason, /超时/);
});

test("超时 env 可覆盖（非法值回退默认，不炸）", async () => {
  // 非数字 → 回退默认（不因坏 env 而改变 fail-closed 行为）。
  const presenter: OperatorPresenter = { async present() { return { allow: true }; } };
  const ch = createDesktopOperatorChannel({
    presenter,
    operatorId: "e",
    env: { ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS: "not-a-number" },
  });
  assert.equal((await ch(req("ls", ["ls"]))).outcome, "allow");
});

// ————————————————— arm 决策（如实标注） —————————————————

test("arm 决策：V1 桌面不 arm shell 闸（DESKTOP_SHELL_GATE_ARMED === false，通道当前未被消费）", () => {
  assert.equal(DESKTOP_SHELL_GATE_ARMED, false, "V1 桌面不 arm（客户已确认；能力缺席 = 最强 fail-closed）");
});

// ————————————————— 会话构造路径的 arm 接缝（可对接、默认不合闸） —————————————————

const FAKE_LISTING: ProjectListing = {
  projectRoot: "/proj",
  roles: [
    {
      roleId: "A",
      cardPath: "角色卡/A/role-card.md",
      boundaryPath: "角色卡/A/boundary.yaml",
      cardText: "# 角色 A",
      boundary: {
        entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }],
        boundarySource: "角色卡/A/boundary.yaml",
        acceptance: { accepted: false, source: "" },
      },
    },
  ],
  warnings: [],
  hasRoles: true,
  primaryRoleId: "A",
};

function fakeHandle(): RoleSessionHandle {
  return {
    async send(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return { async next() { return { value: undefined as unknown as SessionEvent, done: true }; } };
        },
      };
    },
    async dispose(): Promise<void> {},
  };
}

/** 注入确定性载入器（避免命盘 fs）：无 `.ans` → 回退运行期同意（即入参 fallback）。 */
const STUB_LOADER = async (opts: { fallback: import("../../src/model/role.ts").ProjectConfig }) => ({
  project: opts.fallback,
  source: {
    kind: "builtin-fallback" as const,
    path: "",
    acceptance: opts.fallback.governanceBoundary!.acceptance,
    pinPaths: [],
  },
});

test("arm 接缝：不提供 shellGate → pi 工厂收到 undefined（未合闸，run_shell 不注册）", async () => {
  const captured: (ShellGate | undefined)[] = [];
  const mgr = new SessionManager({
    openRoleSession: async () => fakeHandle(),
    createPiAdapterFactory: (_project, shellGate) => {
      captured.push(shellGate);
      return () => ({}) as unknown as RuntimeAdapter;
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === FAKE_LISTING.projectRoot ? FAKE_LISTING : undefined),
    emitEvent: () => {},
    loadEffectiveConfig: STUB_LOADER,
  });
  const r = await mgr.open({ projectRoot: FAKE_LISTING.projectRoot, roleId: "A", runtime: "pi" });
  assert.equal(r.ok, true);
  assert.equal(captured.length, 1, "pi 路径应调用工厂一次");
  assert.equal(captured[0], undefined, "V1 未 arm：不得注入 shellGate（能力缺席 = 最强 fail-closed）");
  await mgr.stop();
});

test("arm 接缝：提供 shellGate → 原样透传给 pi 工厂（接缝可对接，供客户 arm 时用）", async () => {
  const shellGate: ShellGate = async () => ({ allow: true, by: "operator:test" });
  const captured: (ShellGate | undefined)[] = [];
  const mgr = new SessionManager({
    openRoleSession: async () => fakeHandle(),
    createPiAdapterFactory: (_project, sg) => {
      captured.push(sg);
      return () => ({}) as unknown as RuntimeAdapter;
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === FAKE_LISTING.projectRoot ? FAKE_LISTING : undefined),
    emitEvent: () => {},
    shellGate,
    loadEffectiveConfig: STUB_LOADER,
  });
  const r = await mgr.open({ projectRoot: FAKE_LISTING.projectRoot, roleId: "A", runtime: "pi" });
  assert.equal(r.ok, true);
  assert.equal(captured[0], shellGate, "提供时应把门禁原样透传给 Pi 适配器工厂");
  await mgr.stop();
});

test("arm 只影响 pi 路径：demo 路径不构造 pi 工厂（无 shell 入口）", async () => {
  let piCalls = 0;
  const mgr = new SessionManager({
    openRoleSession: async () => fakeHandle(),
    createPiAdapterFactory: () => {
      piCalls += 1;
      return () => ({}) as unknown as RuntimeAdapter;
    },
    createDemoAdapter: () => ({}) as unknown as RuntimeAdapter,
    buildProjectConfig,
    getListing: (root) => (root === FAKE_LISTING.projectRoot ? FAKE_LISTING : undefined),
    emitEvent: () => {},
    loadEffectiveConfig: STUB_LOADER,
  });
  const r = await mgr.open({ projectRoot: FAKE_LISTING.projectRoot, roleId: "A", runtime: "demo" });
  assert.equal(r.ok, true);
  assert.equal(piCalls, 0, "demo 路径不得走 pi 工厂（arm 与 demo 无关）");
  await mgr.stop();
});
