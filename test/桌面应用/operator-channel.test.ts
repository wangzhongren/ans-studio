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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ShellGate, RuntimeAdapter, SessionEvent, OperatorPrompt, OperatorChannelFn, WriteGate } from "../../src/provider/pi/session.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import { openRoleSession, type RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import {
  buildDesktopShellArming,
  buildShellConfirmRequest,
  createDesktopOperatorChannel,
  createShellConfirmPresenter,
  describeShellCommand,
  DESKTOP_SHELL_GATE_ARMED,
  plainReasonFor,
  shellIntentSummary,
  type OperatorPresenter,
  type ShellConfirmRequest,
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

// ————————————————— arm 决策（I-1，2026-10-12 客户裁定） —————————————————

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "app");

test("arm 决策（I-1 + 补丁）：DESKTOP_SHELL_GATE_ARMED === true——(c) 实件与 (a) 通道**同处接线**（两件同备才 arm）", () => {
  assert.equal(
    DESKTOP_SHELL_GATE_ARMED,
    true,
    "客户已裁定 arm（2026-10-12：「现在开放 shell，然后 shell 需要 su 审核一下。如果 su 觉得危险可以让客户决定」）"
  );
  // 源码钉子：main 按 arm 开关构造 **(c) 实件**（buildDesktopShellArming）+ **(a) 通道**；
  // **两件同备才 arm**——(c) 构造/加载失败 ⇒ 连 (a) 也不注入（run_shell 不注册，fail-closed）。
  const mainSrc = fs.readFileSync(path.join(APP_DIR, "main.ts"), "utf8");
  assert.ok(
    /DESKTOP_SHELL_GATE_ARMED \? buildDesktopShellArming\(\) : undefined/.test(mainSrc),
    "main.ts 应按 arm 开关构造 (c) 实件（未 arm ⇒ undefined，等同不注入）"
  );
  assert.ok(
    /shellArming !== undefined \? buildDesktopOperatorChannel\(shellConfirm\.presenter\) : undefined/.test(mainSrc),
    "main.ts：(c) 实件缺失 ⇒ (a) 通道也不构造（两件同备才 arm——绝不半装；M-1 起 presenter 为应用内卡）"
  );
  assert.ok(mainSrc.includes("shellArming,") && mainSrc.includes("shellOperatorChannel,"), "main.ts 应把两件都注入 Interface");
  const ifaceSrc = fs.readFileSync(path.join(APP_DIR, "desktop", "interface.ts"), "utf8");
  assert.ok(ifaceSrc.includes("shellOperatorChannel: deps.shellOperatorChannel"), "Interface 应把 (a) 通道透传给会话管理器");
  assert.ok(ifaceSrc.includes("shellArming: deps.shellArming"), "Interface 应把 (c) 实件透传给会话管理器");
  const sessSrc = fs.readFileSync(path.join(APP_DIR, "desktop", "session.ts"), "utf8");
  assert.ok(
    /role\.builtIn === true \? undefined : this\.deps\.shellOperatorChannel/.test(sessSrc),
    "session.ts：**仅项目角色**注入 (a)（su 不接 (b)/(a)——审读者不给自己开闸）"
  );
  assert.ok(
    /role\.builtIn === true \? undefined : this\.deps\.shellArming/.test(sessSrc),
    "session.ts：(c) 实件与 (a) 同判据（仅项目角色走三层链）"
  );
  // ——— su 只读档（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）的源码钉子 ———
  assert.ok(
    /role\.builtIn === true \? this\.deps\.shellArming : undefined/.test(sessSrc),
    "session.ts：内置治理角色（su）经 shellReadonly **复用同一份 (c) 实件**（deps.shellArming 原引用——单一来源，与项目角色永不漂移）"
  );
  assert.ok(
    /\.\.\.\(shellReadonly \? \{ shellReadonly \} : \{\}\)/.test(sessSrc),
    "session.ts：shellReadonly 经 openRoleSession 透传（缺省不传 ⇒ su 不 arm——能力缺席即 fail-closed）"
  );
  assert.ok(
    /import type \{ AssembleReadonlyShellGateOptions, RoutineShellPolicy \} from "\.\.\/\.\.\/src\/pipeline\/orchestration\/shell-arming\.ts"/.test(sessSrc),
    "session.ts：只读档装配选项形状**只读导入自编排**（单一来源；不另立第二形状）"
  );
  assert.ok(
    ifaceSrc.includes('shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">'),
    "Interface：透传面镜像**同一形状**（`Omit<AssembleReadonlyShellGateOptions, \"project\">`——不另造第二形状）"
  );
  // 编排消费点只读核查：给出即 arm（**不带 `!suppressHandback` 前缀**——su 会话恒 suppressHandback=true，
  // 带上该前缀 su 永远 arm 不上；只读档分支由 `shellReadonly !== undefined` 单独判）。
  const runRoleSrc = fs.readFileSync(path.resolve(APP_DIR, "..", "src", "pipeline", "orchestration", "run-role.ts"), "utf8");
  assert.ok(
    /if \(input\.shellReadonly !== undefined\) \{/.test(runRoleSrc),
    "run-role：只读档 arm 判据 = 「给出即 arm」（不带 suppressHandback 前缀——su 恒为 true）"
  );
});

test("I-1 补丁：(c) 实件构造——只读导入的两件**引用同一性**（classifyShell 同一函数引用；rules 原样透传）；失败 ⇒ 不 arm", async () => {
  const { classifyShell, defaultShellRules } = await import("../../src/service/gate/shell-rules.ts");
  const arming = buildDesktopShellArming();
  assert.ok(arming, "实件可构造（生产路径）时不应返回 undefined");
  assert.equal(arming.classifyShell, classifyShell, "classifyShell 应是门禁引擎实件的**同一函数引用**（不复制实现、不另立第二份规则集）");
  assert.deepEqual(arming.rules, defaultShellRules(), "rules 应是默认规则集本体（defaultShellRules 的数据）");
  // 桩件（**不真跑命令**）：加载器返回什么就原样带什么（引用同一性——装配面不加工）。
  const sentinel = { version: "桩件-勿跑" };
  const stubbed = buildDesktopShellArming((() => sentinel) as unknown as () => ReturnType<typeof defaultShellRules>);
  assert.equal(stubbed && stubbed.rules, sentinel, "rules 应原样透传加载器结果（引用同一性）");
  // 失败路径：加载抛错 ⇒ undefined = 不 arm（main.ts 据此连 (a) 通道也不注入——run_shell 不注册）。
  const failed = buildDesktopShellArming(() => {
    throw new Error("桩件：规则集加载失败");
  });
  assert.equal(failed, undefined, "构造/加载失败 ⇒ 不 arm（能力缺席即 fail-closed）");
});

test("I-1 补丁（**真正接通**核查）：真实 openRoleSession + 真实装配——(c) 实件在场时能力面产出 ShellGate（Pi 适配器 run_shell 注册条件成立）", async () => {
  const REPO_ROOT = path.resolve(HERE, "..", "..");
  const listing = await listProject(REPO_ROOT);
  assert.ok(listing.roles.some((r) => r.roleId === "桌面应用"), "本仓库应有「桌面应用」角色（集成核查用真实枚举）");
  const captured: (Record<string, unknown> | undefined)[] = [];
  const mgr = new SessionManager({
    openRoleSession, // **真实**编排入口：装配真跑（不发模型请求、不执行任何命令——闸只在被调用时才判定）
    createPiAdapterFactory: () => (gate: WriteGate, capabilities?: unknown) => {
      captured.push(capabilities as Record<string, unknown> | undefined);
      return {
        async composeContext() {
          return { systemPrompt: "测试替身：不触网" };
        },
        async bindRole() {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return {
                [Symbol.asyncIterator]() {
                  return { async next() { return { value: undefined as unknown as SessionEvent, done: true }; } };
                },
              };
            },
            async dispose(): Promise<void> {},
          };
        },
      } as unknown as RuntimeAdapter;
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: () => {},
    // arm 两件同备（与 main.ts 生产形态同款）：(a) 通道（桩件，绝不真弹窗）+ (c) 实件（真件）。
    shellOperatorChannel: async () => ({ outcome: "deny", operatorId: "test", reason: "替身拒绝" }),
    shellArming: buildDesktopShellArming(),
  });
  const r = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面应用", runtime: "pi" });
  assert.equal(r.ok, true, "会话应能开启（真实装配在此路径不触网）");
  assert.ok(
    captured.length >= 1 && captured[0]?.shellGate !== undefined,
    "**(c) 接通证据**：真实装配把 ShellGate 放进能力面——run-role 把 `capabilities.shellGate` 交给 Pi 适配器工厂，run_shell 注册条件成立（「是否真正接通：是」的依据）"
  );
  await mgr.stop();
  // 消费点的**只读核查**（读源码断言编排确实消费该字段；不复制实现；字段名以落定契约为准）。
  const runRoleSrc = fs.readFileSync(path.resolve(APP_DIR, "..", "src", "pipeline", "orchestration", "run-role.ts"), "utf8");
  assert.ok(/\.\.\.\(input\.shellArming \?\? \{\}\)/.test(runRoleSrc), "run-role 应把 input.shellArming 展开进 assembleProjectShellGate 选项");
  assert.ok(
    runRoleSrc.includes("capabilities?.shellGate ?? shellGate"),
    "Pi 适配器工厂应优先吃能力面的 shellGate（装配产物优先于历史接缝）"
  );
});

test("su 只读档（**真正接通**核查）：真实 openRoleSession + 真实装配——su 会话能力面产出**只读档** ShellGate（ls 放行 / rm 拒、不弹框）", async () => {
  // 客户裁定 2026-10-12「su 也要有 shell，但是只读」的**桌面侧端到端核查**：SessionManager（内置治理角色
  // 判据）→ 真实 `openRoleSession`（只读档 arm）→ 真实 `assembleReadonlyShellGate` + 真实 (c) 实件
  // （`buildDesktopShellArming`：门禁引擎同一函数引用 + 默认规则集）⇒ 能力面 `capabilities.shellGate` 产出，
  // 且判定就是**只读档**（ls 放行；rm 拒、理由写明只读档）。**全程不触网、不真跑命令**（只做闸判定）；
  // 项目落在系统临时目录（审计若落盘也只在临时目录，**绝不碰仓库**）。
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-desktop-su-readonly-"));
  try {
    // 临时项目 fixture：治理边界文档（= X 的边界文件，含 docs/audit/ 条件目录——只读档的审计边界经它解析）
    // + su（内置治理角色）+ X（项目角色；本用例不点它，只为枚举真实形态）。
    const xDir = path.join(root, "角色卡", "X");
    fs.mkdirSync(xDir, { recursive: true });
    fs.writeFileSync(path.join(xDir, "role-card.md"), "# 角色 X\n");
    fs.writeFileSync(
      path.join(xDir, "boundary.yaml"),
      [
        "role: X",
        "entries:",
        "  - kind: file",
        "    path: src/x.ts",
        "    purpose: 测试条目",
        "  - kind: conditional-directory",
        "    path: docs/audit/",
        "    condition: shell-gate",
        "    root: project",
        "    purpose: shell 闸审计留痕",
        "",
      ].join("\n")
    );
    const listing: ProjectListing = {
      projectRoot: root,
      roles: [
        {
          roleId: "su",
          cardPath: "",
          boundaryPath: "",
          cardText: "su",
          boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
          builtIn: true,
        },
        {
          roleId: "X",
          cardPath: "角色卡/X/role-card.md",
          boundaryPath: "角色卡/X/boundary.yaml",
          cardText: "# 角色 X",
          boundary: {
            entries: [{ root: "project", path: "src/x.ts", kind: "file", purpose: "测试条目" }],
            boundarySource: "角色卡/X/boundary.yaml",
            acceptance: { accepted: true, source: "test:fixture" },
          },
        },
      ],
      warnings: [],
      hasRoles: true,
      primaryRoleId: "su",
    };
    // 载入器桩件：直给「治理边界覆盖」已接受态（su 的边界 = 治理边界文档——与真实 `.ans` 生效形态同构）。
    const loader = async () => {
      const acceptance = { accepted: true, source: "test:fixture（只读档核查用）" };
      const project = buildProjectConfig(listing, acceptance, undefined, "角色卡/X/boundary.yaml");
      return {
        project,
        source: { kind: "builtin-fallback" as const, path: "", acceptance, pinPaths: [] },
      };
    };
    const captured: (Record<string, unknown> | undefined)[] = [];
    const mgr = new SessionManager({
      openRoleSession, // **真实**编排入口：只读档装配真跑（不发模型请求、不执行任何命令）
      createPiAdapterFactory: () => (gate: WriteGate, capabilities?: unknown) => {
        captured.push(capabilities as Record<string, unknown> | undefined);
        return {
          async composeContext() {
            return { systemPrompt: "测试替身：不触网" };
          },
          async bindRole() {
            return {
              async prompt(): Promise<void> {},
              events(): AsyncIterable<SessionEvent> {
                return {
                  [Symbol.asyncIterator]() {
                    return { async next() { return { value: undefined as unknown as SessionEvent, done: true }; } };
                  },
                };
              },
              async dispose(): Promise<void> {},
            };
          },
        } as unknown as RuntimeAdapter;
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
      buildProjectConfig,
      getListing: (root2) => (root2 === root ? listing : undefined),
      emitEvent: () => {},
      // 与 main.ts 生产形态同款：(c) 实件（真件——同一函数引用 + 默认规则集）——**同一份**也供 su 只读档。
      shellArming: buildDesktopShellArming(),
      loadEffectiveConfig: loader,
    });

    const r = await mgr.open({ projectRoot: root, roleId: "su", runtime: "pi" });
    assert.equal(r.ok, true, "su 会话应能开启（真实装配；本路径不触网）");
    const caps = captured[0];
    const gate = caps?.shellGate as ShellGate | undefined;
    assert.ok(gate !== undefined, "**接通证据**：su 给只读档 ⇒ 能力面产出 ShellGate（Pi 适配器 run_shell 注册条件成立）");

    // 判定即**只读档**（只接 (c)；不接 (b)/(a)——没有审读会话被打开、没有任何对话框被弹）。
    const ls = await gate!({ command: "ls -la", argv: ["ls", "-la"], cwd: root, toolCallId: "call-ls" });
    assert.equal(ls.allow, true, "只读白名单命令（ls）放行——su 只读 shell 的正当用途");
    const rm = await gate!({ command: "rm -rf x", argv: ["rm", "-rf", "x"], cwd: root, toolCallId: "call-rm" });
    assert.equal(rm.allow, false, "risky（rm）→ 只读档一律拒（不交 (b) 审读、不打扰客户）");
    if (!rm.allow) {
      assert.match(rm.reason, /su 只读档/, "拒绝理由写明只读档策略（模型能看懂是策略拒、不是环境故障）");
    }
    const nodeTest = await gate!({ command: "node --test", argv: ["node", "--test"], cwd: root, toolCallId: "call-nt" });
    assert.equal(nodeTest.allow, false, "review（node --test——不在只读白名单，现状）→ 只读档拒");
    await mgr.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ————————————————— M-1（2026-10-12 客户裁定「这个太丑了」）：应用内确认卡 —————————————————

test("M-1 数据面：白话摘要只取命令首词（不编意图）；升级原因译人话（行话不外露）；命令原文逐字", () => {
  // 摘要：取命令**首词**（可执行名）——事实转抄，不替命令「猜意图」；无从概括 ⇒ null。
  assert.equal(shellIntentSummary("ls -la"), "它会在项目里执行：ls");
  assert.equal(shellIntentSummary("  git   commit -m x"), "它会在项目里执行：git");
  assert.equal(shellIntentSummary("\n\nrm -rf build"), "它会在项目里执行：rm", "空行在前的取首个非空行");
  assert.equal(shellIntentSummary(""), null, "空命令 ⇒ null（渲染侧隐藏该行——**绝不编**）");
  assert.equal(shellIntentSummary("   \n  "), null);

  // 升级原因人话映射：截图里的三档行话一律不原样外露（不含 pm/risky/JSON 等内部用语）。
  const risky = plainReasonFor("risky 命令：pm 判放行，仍须操作者确认（pm 不是终审，客户才是）");
  assert.ok(risky.includes("风险") && !risky.includes("pm") && !/risky/i.test(risky), "risky → 人话且无内部用语");
  const timeout = plainReasonFor("pm 审读超时");
  assert.ok(timeout.includes("超时") && timeout.includes("fail-closed") && !timeout.includes("pm"));
  const nonJson = plainReasonFor("pm 判定 JSON 不合法");
  assert.ok(!/json/i.test(nonJson) && nonJson.includes("无法解析"), "non-json → 人话（「无法解析」，不露行话）");
  const unavailable = plainReasonFor("未接入 pm 审读会话");
  assert.ok(unavailable.includes("不可用") && !unavailable.includes("pm"));
  const unsure = plainReasonFor("pm 拿不准，交操作者");
  assert.ok(unsure.includes("拿不准") && !unsure.includes("pm"));
  const unknown = plainReasonFor("某种全新未识别原因-XYZ");
  assert.ok(!unknown.includes("XYZ") && unknown.includes("fail-closed"), "未识别：给通用 fail-closed 句（不把原话丢给客户、不替审核编结论）");
  assert.equal(plainReasonFor(undefined), plainReasonFor(""), "缺省同解（通用句）");

  // 数据面构建：命令**逐字**（含元字符，不改写/不截断）；原文原因只进折叠详情供核查。
  const display = describeShellCommand(
    req("rm -rf build && echo hi", ["rm", "-rf", "build", "&&", "echo", "hi"], "D:/proj", "pm 拿不准，交操作者")
  );
  const payload = buildShellConfirmRequest("sc-1", display);
  assert.equal(payload.command, "rm -rf build && echo hi", "命令原文逐字（含元字符）");
  assert.equal(payload.summary, "它会在项目里执行：rm");
  assert.equal(payload.reasonRaw, "pm 拿不准，交操作者", "原文只进折叠详情（核查用）");
  assert.ok(payload.reasonPlain.includes("拿不准") && !payload.reasonPlain.includes("pm"));
  assert.deepEqual(payload.argvLines, display.argvLines, "argv 逐项行原样转抄");
  assert.equal(payload.cwd, "D:/proj");
});

test("M-1 presenter：恰 allow:true 才放行；拒绝/缺字段 → 不放行；未知 id → expired；关窗 ⇒ 全部不放行", async () => {
  const sent: ShellConfirmRequest[] = [];
  const p = createShellConfirmPresenter({ present: (r) => sent.push(r), cleanupAfterMs: 60000, env: {} });
  const prompt = req("ls -la", ["ls", "-la"], "/proj");

  const d1 = p.presenter.present(prompt, describeShellCommand(prompt));
  assert.equal(sent.length, 1, "应把数据面推给界面");
  assert.equal(sent[0].command, "ls -la");
  assert.equal(p.respond({ id: sent[0].id, allow: true }).ok, true, "回包受理");
  assert.deepEqual(await d1, { allow: true }, "恰 allow:true ⇒ 放行");

  const d2 = p.presenter.present(prompt, describeShellCommand(prompt));
  assert.equal(p.respond({ id: sent[1].id, allow: false }).ok, true);
  assert.deepEqual(await d2, { allow: false }, "拒绝（Esc/关闭同路）⇒ 不放行");

  const d3 = p.presenter.present(prompt, describeShellCommand(prompt));
  assert.equal(p.respond({ id: sent[2].id }).ok, true, "缺 allow 字段的回包也受理");
  assert.deepEqual(await d3, { allow: false }, "缺字段/非布尔一律不放行（**恰 true 才放行**）");

  const d4 = p.presenter.present(prompt, describeShellCommand(prompt));
  p.rejectAllPending("窗口已关闭");
  assert.deepEqual(await d4, { allow: false }, "关窗（rejectAllPending）⇒ 全部不放行（fail-closed）");
  assert.equal(p.pendingCount(), 0, "关窗后无挂起残留");

  const exp = p.respond({ id: "sc-旧回包", allow: true });
  assert.equal(exp.ok, false);
  assert.equal(exp.expired, true, "未知 id（超时/重启后的旧回包）→ expired（**不放行**）");
  assert.equal((exp as { allow?: unknown }).allow, undefined, "失效回包不携带任何放行语义");
});

test("M-1 presenter 兜底与失败：清理兜底解析为不放行（无泄漏）；推送抛错（窗口已关）⇒ 上抛（通道归 unavailable）", async () => {
  const sent: ShellConfirmRequest[] = [];
  const p = createShellConfirmPresenter({ present: (r) => sent.push(r), cleanupAfterMs: 30, env: {} });
  const prompt = req("ls", ["ls"], "/proj");
  const d = p.presenter.present(prompt, describeShellCommand(prompt));
  assert.deepEqual(await d, { allow: false }, "清理兜底 ⇒ 不放行（fail-closed；判定语义仍由通道先到者为准）");
  assert.equal(p.pendingCount(), 0, "兜底后登记清空（无泄漏）");
  assert.equal(p.respond({ id: sent[0].id, allow: true }).expired, true, "兜底后迟到的回包 → expired（绝不放行）");

  const throwing = createShellConfirmPresenter({
    present: () => {
      throw new Error("窗口已关闭，无法呈现 shell 确认请求");
    },
    cleanupAfterMs: 1000,
    env: {},
  });
  await assert.rejects(
    () => throwing.presenter.present(prompt, describeShellCommand(prompt)),
    /窗口已关闭/,
    "推送失败应上抛（createDesktopOperatorChannel 归 unavailable——fail-closed，绝不当「没人问就放行」）"
  );
  assert.equal(throwing.pendingCount(), 0, "抛错路径不得留下挂起登记");
});

test("M-1：shell 确认**不再用原生对话框**——(a) 层为应用内卡（通道两端齐备；旧文本墙路径退役）", () => {
  const mainSrc = fs.readFileSync(path.join(APP_DIR, "main.ts"), "utf8");
  assert.ok(!mainSrc.includes("dialog.showMessageBox"), "main.ts 不得再用原生对话框做 shell 确认（客户：「这个太丑了」）");
  assert.ok(!mainSrc.includes("createElectronOperatorPresenter"), "旧原生 presenter 已退役");
  assert.ok(
    mainSrc.includes('win.webContents.send("shell:confirm-request", request)'),
    "main 应把确认数据面推达渲染侧（应用内卡）"
  );
  assert.ok(mainSrc.includes('registerHandler("shell:confirm-response"'), "main 经窗口作用域注册器受理决定回包");
  assert.ok(mainSrc.includes("rejectAllPending") && mainSrc.includes('win.on("closed"'), "关窗 ⇒ 全部挂起不放行（fail-closed）");
  assert.ok(mainSrc.includes("buildDesktopOperatorChannel(shellConfirm.presenter)"), "arm 接线改用应用内卡 presenter");
  const preloadSrc = fs.readFileSync(path.join(APP_DIR, "preload.cjs"), "utf8");
  assert.ok(preloadSrc.includes('"shell:confirm-request"') && preloadSrc.includes("onShellConfirm"), "preload 应订阅确认请求");
  assert.ok(
    preloadSrc.includes('"shell:confirm-response"') && preloadSrc.includes("shellConfirmRespond"),
    "preload 应暴露决定回包（恰 allow:true 才作为放行）"
  );
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

test("arm 接缝（历史形状）：不提供已装配 shellGate → pi 工厂收到 undefined（该接缝缺省即不合闸）", async () => {
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
  assert.equal(captured[0], undefined, "缺省不提供已装配 gate ⇒ undefined（历史接缝；I-1 的 arm 走 shellOperatorChannel）");
  await mgr.stop();
});

test("arm 接缝（历史形状）：提供已装配 shellGate → 原样透传给 pi 工厂（保留给直接持 gate 的调用方）", async () => {
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

test("I-1 注入判据：**项目角色**会话收到 (a) 通道 + (c) 实件（三层链）；su（内置治理角色）不接 (b)/(a)——改收**只读档**（同一份 (c) 实件）", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "su",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "A",
        boundary: {
          entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/A/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  const channel: OperatorChannelFn = async () => ({ outcome: "deny", operatorId: "test", reason: "替身拒绝" });
  // I-1 补丁：(c) 实件桩件（**引用同一性**断言用；绝不真跑命令）。
  const armingStub = {
    classifyShell: () => "allow" as const,
    rules: { version: "桩件" },
  };
  const captured: { roleId: string; shellOperatorChannel?: OperatorChannelFn; shellArming?: unknown; shellReadonly?: unknown }[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      captured.push({
        roleId: input.roleId,
        shellOperatorChannel: input.shellOperatorChannel,
        shellArming: (input as { shellArming?: unknown }).shellArming,
        shellReadonly: (input as { shellReadonly?: unknown }).shellReadonly,
      });
      return fakeHandle();
    },
    createPiAdapterFactory: () => () => ({}) as unknown as RuntimeAdapter,
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
    shellOperatorChannel: channel,
    shellArming: armingStub as never,
    loadEffectiveConfig: STUB_LOADER,
  });
  await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "pi" });
  await mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "pi" });
  const a = captured.find((c) => c.roleId === "A");
  const su = captured.find((c) => c.roleId === "su");
  assert.equal(a!.shellOperatorChannel, channel, "项目角色应收到 (a) 通道（arm 接线生效）");
  assert.equal(su!.shellOperatorChannel, undefined, "su 不接 (b)/(a)（审读者不给自己开闸：不自审、不弹框）");
  assert.equal(a!.shellArming, armingStub, "(c) 实件应**原引用**下发给项目角色（装配面不加工——引用同一性）");
  assert.equal(su!.shellArming, undefined, "su 不接三层链（其 shell 走只读档）");
  // ——— su 只读档（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）———
  assert.equal(
    su!.shellReadonly,
    armingStub,
    "su 应收到 shellReadonly 且**恰为同一份 (c) 实件**（deps.shellArming 原引用——单一来源，与项目角色永不漂移）"
  );
  {
    const ro = su!.shellReadonly as { classifyShell?: unknown; rules?: unknown };
    assert.equal(typeof ro.classifyShell, "function", "shellReadonly 含 (c) 的 classifyShell（门禁引擎同一函数引用）");
    assert.ok(ro.rules !== undefined, "shellReadonly 含 (c) 的 rules（规则集本体）");
  }
  assert.equal(a!.shellReadonly, undefined, "项目角色不带 shellReadonly（照旧走 (c)/(b)/(a) 三层链，逐字不变）");
  await mgr.stop(null);
});

test("I-1 补丁：未 arm（未配置两件）时**什么都不传**——输入里不出现两个字段（等同不注入）", async () => {
  let seen: Record<string, unknown> | null = null;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      seen = input as unknown as Record<string, unknown>;
      return fakeHandle();
    },
    createPiAdapterFactory: () => () => ({}) as unknown as RuntimeAdapter,
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === FAKE_LISTING.projectRoot ? FAKE_LISTING : undefined),
    emitEvent: () => {},
    loadEffectiveConfig: STUB_LOADER,
  });
  await mgr.open({ projectRoot: FAKE_LISTING.projectRoot, roleId: "A", runtime: "pi" });
  assert.ok(seen, "应开启过一次会话");
  assert.ok(!("shellOperatorChannel" in (seen as object)), "未配置 ⇒ (a) 字段不出现（不注入）");
  assert.ok(!("shellArming" in (seen as object)), "未配置 ⇒ (c) 字段不出现（不注入）");
  assert.ok(!("shellReadonly" in (seen as object)), "未配置 ⇒ shellReadonly 字段不出现（项目角色不带——照旧）");
  await mgr.stop(null);
});

test("su 只读档 fail-closed：deps.shellArming 缺省 ⇒ su 连 shellReadonly 都不注入（能力缺席 = 不 arm，绝不放宽）", async () => {
  // 「缺省/构造失败 ⇒ 不传」（任务口径：fail-closed）。与上例同款，但开的是**内置治理角色（su）**——
  // 正是只读档的目标会话；缺件时它同样**什么都拿不到**（不降级、不放宽）。
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "su",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
  let seen: Record<string, unknown> | null = null;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      seen = input as unknown as Record<string, unknown>;
      return fakeHandle();
    },
    createPiAdapterFactory: () => () => ({}) as unknown as RuntimeAdapter,
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
    // 刻意不提供 shellArming（(c) 实件构造失败/未接线的主进程形态）。
    loadEffectiveConfig: STUB_LOADER,
  });
  await mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "pi" });
  assert.ok(seen, "应开启过一次 su 会话");
  assert.ok(!("shellReadonly" in (seen as object)), "deps.shellArming 缺省 ⇒ su 不注入 shellReadonly（不 arm——绝不半装/放宽）");
  assert.ok(!("shellArming" in (seen as object)), "su 也不收三层链的 (c) 字段（不接 (b)/(a)）");
  assert.ok(!("shellOperatorChannel" in (seen as object)), "su 不收 (a) 字段（不弹框）");
  await mgr.stop(null);
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
