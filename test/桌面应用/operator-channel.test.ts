// test/桌面应用/operator-channel.test.ts
// 桌面窗口：操作者确认通道 (a) 的逻辑与 fail-closed 单测 + arm 接缝（不真弹窗、无 electron）。
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
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ShellGate, RuntimeAdapter, SessionEvent, OperatorPrompt, OperatorChannelFn, WriteGate } from "../../src/provider/pi/session.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import { openRoleSession, type RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import { configureDiagnostics, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";
import {
  buildDesktopShellArming,
  buildShellConfirmRequest,
  createDesktopOperatorChannel,
  createShellConfirmPresenter,
  DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS,
  describeShellCommand,
  DESKTOP_SHELL_GATE_ARMED,
  parseSuApprovalTier,
  plainReasonFor,
  shellIntentSummary,
  type DesktopOperatorMetadata,
  type OperatorPresenter,
  type ShellConfirmRequest,
  type ShellJudgeResultPayload,
} from "../../app/desktop/operator-channel.ts";
import type { ShellJudgeFn, ShellJudgeOutcome, ShellJudgeRequest } from "../../src/model/runtime.ts";
// G-2/W5（2026-10-16 客户批准）：恢复确认卡呈现端（与 shell 卡共享 `confirm-card.ts` 通用件——本组钉住
// **恰 allow:true 才为真、等待不设限（裁定 4）、关窗/中止=未获执行** 的卡侧语义；执行桥在 dispatch-delivery 组）。
import { createRecoveryConfirmPresenter } from "../../app/desktop/recovery-channel.ts";

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
    /shellArming !== undefined\s*\? buildDesktopOperatorChannel\(shellConfirm\.presenter(?:,\s*\{[\s\S]*?\})?\)\s*:\s*undefined/.test(mainSrc),
    "main.ts：(c) 实件缺失 ⇒ (a) 通道也不构造（两件同备才 arm——绝不半装；M-1 起 presenter 为应用内卡）"
  );
  assert.ok(mainSrc.includes("shellArming,") && mainSrc.includes("shellOperatorChannel,"), "main.ts 应把两件都注入 Interface");
  const ifaceSrc = fs.readFileSync(path.join(APP_DIR, "desktop", "interface.ts"), "utf8");
  assert.ok(ifaceSrc.includes("shellOperatorChannel: deps.shellOperatorChannel"), "Interface 应把 (a) 通道透传给会话管理器");
  assert.ok(ifaceSrc.includes("shellArming: deps.shellArming"), "Interface 应把 (c) 实件透传给会话管理器");
  const sessSrc = fs.readFileSync(path.join(APP_DIR, "desktop", "session.ts"), "utf8");
  assert.ok(
    /if \(this\.deps\.shellOperatorChannel\) \{/.test(sessSrc),
    "session.ts：**(a) 通道对 su 也构造**（2026-10-17 审批档；不再有 role.builtIn 条件）"
  );
  assert.ok(
    /role\.builtIn === true \? undefined : this\.deps\.shellArming/.test(sessSrc),
    "session.ts：(c) 实件仍只给项目角色三层链（su 不自审）"
  );
  // ——— su 审批档（客户裁定 2026-10-17：「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」）———
  assert.ok(
    /const shellOperatorOnly =\s*role\.builtIn === true && this\.deps\.shellArming && shellOperatorChannel/.test(sessSrc),
    "session.ts：su 审批档 = 内置角色 && (c) 实件 && (a) 通道（缺件不 arm，fail-closed）"
  );
  assert.ok(
    /\.\.\.\(shellOperatorOnly \? \{ shellOperatorOnly \} : \{\}\)/.test(sessSrc),
    "session.ts：`shellOperatorOnly` 经 openRoleSession 透传"
  );
  assert.equal(
    /\.\.\.\(shellReadonly \? \{ shellReadonly \} : \{\}\)/.test(sessSrc),
    false,
    "session.ts：桌面**不再**透传旧只读档 `shellReadonly`（su 改走审批档）"
  );
  assert.ok(
    /import type \{ AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions, RoutineShellPolicy \} from "\.\.\/\.\.\/src\/pipeline\/orchestration\/shell-arming\.ts"/.test(sessSrc),
    "session.ts：审批档/只读档装配选项形状**只读导入自编排**（单一来源；不另立第二形状）"
  );
  assert.ok(
    ifaceSrc.includes('shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions, "project">'),
    "Interface：审批档透传面镜像**同一形状**（`Omit<AssembleOperatorShellGateOptions, \"project\">`）"
  );
  assert.ok(
    ifaceSrc.includes('shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">'),
    "Interface：旧只读档类型保留兼容（桌面不再注入）"
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
  assert.ok(listing.roles.some((r) => r.roleId === "桌面窗口"), "本仓库应有「桌面窗口」角色（集成核查用真实枚举）");
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
  const r = await mgr.open({ projectRoot: listing.projectRoot, roleId: "桌面窗口", runtime: "pi" });
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

test("su 审批档（**真正接通**核查）：真实 openRoleSession + 真实装配——su 会话能力面产出审批档 ShellGate（ls 免审批直放 / rm 出卡经客户批准或拒绝）", async () => {
  // 客户裁定 2026-10-17「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」的**桌面侧端到端核查**：
  // SessionManager（内置治理角色判据）→ 真实 `openRoleSession`（`shellOperatorOnly` arm）→ 真实
  // `assembleOperatorShellGate` + 真实 (c) 实件（`buildDesktopShellArming`）⇒ 能力面 `capabilities.shellGate`
  // 产出：ls 命中白名单 ⇒ 0 卡直放；rm（risky）⇒ 出 1 卡，客户批准 ⇒ 执行、客户拒绝 ⇒ 拒绝。
  // **全程不触网、不真跑命令**（只做闸判定）；项目落在系统临时目录（审计若落盘也只在临时目录，**绝不碰仓库**）。
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
    // (a) 通道桩件：记录每次审批请求；outcome 可由用例切换（批准 → 执行、拒绝 → 不执行）。
    const prompts: OperatorPrompt[] = [];
    let outcome: "allow" | "deny" = "allow";
    const operatorChannel: OperatorChannelFn = async (prompt) => {
      prompts.push(prompt);
      return outcome === "allow"
        ? { outcome: "allow", operatorId: "test" }
        : { outcome: "deny", operatorId: "test", reason: "客户拒绝" };
    };
    const mgr = new SessionManager({
      openRoleSession, // **真实**编排入口：审批档装配真跑（不发模型请求、不执行任何命令）
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
      // 与 main.ts 生产形态同款：(c) 实件（真件——同一函数引用 + 默认规则集）＋ (a) 通道桩件
      // ——su 经 `shellOperatorOnly` 装配审批档（同一份实件，不另造规则集）。
      shellArming: buildDesktopShellArming(),
      shellOperatorChannel: operatorChannel,
      loadEffectiveConfig: loader,
    });

    const r = await mgr.open({ projectRoot: root, roleId: "su", runtime: "pi" });
    assert.equal(r.ok, true, "su 会话应能开启（真实装配；本路径不触网）");
    const caps = captured[0];
    const gate = caps?.shellGate as ShellGate | undefined;
    assert.ok(gate !== undefined, "**接通证据**：su 给审批档 ⇒ 能力面产出 ShellGate（Pi 适配器 run_shell 注册条件成立）");

    // (c)=allow ⇒ 免审批直接放行（**0 次审批卡**）。
    const ls = await gate!({ command: "ls -la", argv: ["ls", "-la"], cwd: root, toolCallId: "call-ls" });
    assert.equal(ls.allow, true, "只读白名单命令（ls）放行——su 审批档的免审批路径");
    assert.equal(prompts.length, 0, "只读白名单 ⇒ 不弹审批卡（0 次通道调用）");
    // (c)=risky ⇒ 出 1 卡；客户批准 ⇒ 执行。
    const rm = await gate!({ command: "rm -rf x", argv: ["rm", "-rf", "x"], cwd: root, toolCallId: "call-rm" });
    assert.equal(prompts.length, 1, "risky（rm）⇒ 出 1 张客户审批卡");
    assert.equal(rm.allow, true, "客户批准 ⇒ 执行");
    assert.match(prompts[0].reason ?? "", /^su-审批档\[(risky|review|deny)\]/, "卡片原因＝审批档固定前缀 + 档位");
    // 客户拒绝 ⇒ 拒绝（fail-closed）。
    outcome = "deny";
    const rmDenied = await gate!({ command: "rm -rf y", argv: ["rm", "-rf", "y"], cwd: root, toolCallId: "call-rm2" });
    assert.equal(rmDenied.allow, false, "客户拒绝 ⇒ 拒绝（fail-closed）");
    assert.equal(prompts.length, 2);
    // (c)=review 同样交客户审批（不是只读档式的直接拒）。
    const nodeTest = await gate!({ command: "node --test", argv: ["node", "--test"], cwd: root, toolCallId: "call-nt" });
    assert.equal(prompts.length, 3, "review ⇒ 同样出卡交客户审批");
    assert.equal(nodeTest.allow, false, "当前桩件答案为拒绝 ⇒ 不执行");
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

  // ——— su 审批档（客户裁定 2026-10-17）：**行首前缀优先**，三档各用其档位名；三条必备披露 ———
  const tierNames = { risky: "风险命令（risky）", review: "未自动判定（review）", deny: "硬拒类（deny）" } as const;
  for (const tier of ["risky", "review", "deny"] as const) {
    const rawReason = `su-审批档[${tier}]：命中规则（ruleset:x）；批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界。`;
    const plain = plainReasonFor(rawReason);
    assert.ok(plain.includes(tierNames[tier]), `${tier} → 使用其档位名`);
    assert.ok(plain.includes("逐条客户批准"), "su 文案含「逐条客户批准」");
    assert.ok(plain.includes("拒绝/超时/通道不可用 = 拒绝"), "su 文案含「拒绝/超时/通道不可用 = 拒绝」");
    assert.ok(plain.includes("批准后可能绕过 ANS 文件写边界"), "su 文案含绕过写边界警告");
    assert.equal(plain.includes("自动审核判定这条命令有风险"), false, `前缀优先：${tier} 不得串到项目角色的 /risky/ 泛匹配文案`);
    assert.equal(plain.includes("su-审批档"), false, "不把内部前缀原样丢给客户");
  }
  // 前缀只在**行首**生效；项目角色原因里偶然出现同文字不得改变 policy。
  assert.equal(parseSuApprovalTier("说明里提到 su-审批档[risky] 但不位于行首"), null);
  assert.equal(parseSuApprovalTier("su-审批档[risky]：x"), "risky");
  assert.equal(parseSuApprovalTier(null), null);

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
  assert.equal(payload.tier, null, "项目角色三层链：tier 恒 null");
  assert.equal(payload.policy, "project", "项目角色三层链：policy=project");
  // su 审批档：三档数据面（tier/policy/plain reason）。
  for (const tier of ["risky", "review", "deny"] as const) {
    const suReason = `su-审批档[${tier}]：命中规则（ruleset:x）；批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界。`;
    const suPayload = buildShellConfirmRequest(`sc-su-${tier}`, describeShellCommand(req("rm -rf build", ["rm", "-rf", "build"], "/proj", suReason)));
    assert.equal(suPayload.tier, tier, `su ${tier}：tier 如实解析`);
    assert.equal(suPayload.policy, "su-approval", `su ${tier}：policy=su-approval`);
    assert.equal(suPayload.reasonRaw, suReason, "原文只进折叠详情（逐字）");
    assert.ok(suPayload.reasonPlain.includes(tier === "deny" ? "硬拒类（deny）" : tier === "risky" ? "风险命令（risky）" : "未自动判定（review）"));
  }
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
  assert.ok(mainSrc.includes("buildDesktopOperatorChannel(shellConfirm.presenter,"), "arm 接线改用应用内卡 presenter");
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
  const captured: {
    roleId: string;
    shellOperatorChannel?: OperatorChannelFn;
    shellArming?: unknown;
    shellOperatorOnly?: { classifyShell?: unknown; rules?: unknown; operatorChannel?: OperatorChannelFn };
    shellReadonly?: unknown;
  }[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      captured.push({
        roleId: input.roleId,
        shellOperatorChannel: input.shellOperatorChannel,
        shellArming: (input as { shellArming?: unknown }).shellArming,
        shellOperatorOnly: (input as { shellOperatorOnly?: { classifyShell?: unknown; rules?: unknown; operatorChannel?: OperatorChannelFn } }).shellOperatorOnly,
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
  // ——— 项目角色：三层链逐字不变 ———
  assert.equal(typeof a!.shellOperatorChannel, "function", "项目角色应收到绑定本会话生命周期的 (a) 通道");
  assert.deepEqual(await a!.shellOperatorChannel!({ command: "fixture", argv: ["fixture"], cwd: "/proj", toolCallId: "D1" }), await channel({ command: "fixture", argv: ["fixture"], cwd: "/proj", toolCallId: "D1" }), "绑定包装仍原样转交通道裁决");
  assert.equal(a!.shellArming, armingStub, "(c) 实件应**原引用**下发给项目角色（装配面不加工——引用同一性）");
  assert.equal(a!.shellOperatorOnly, undefined, "项目角色不走 su 审批档（仍三层链）");
  assert.equal(a!.shellReadonly, undefined, "项目角色不带 shellReadonly（照旧走 (c)/(b)/(a) 三层链，逐字不变）");
  // ——— su 审批档（客户裁定 2026-10-17）：operator-only 注入、**不传** readonly ———
  assert.equal(su!.shellOperatorChannel, undefined, "su 不再直接收 shellOperatorChannel（(a) 通道在 shellOperatorOnly 内）");
  assert.equal(su!.shellArming, undefined, "su 不接三层链（不自审）");
  assert.equal(su!.shellReadonly, undefined, "su **不再**收到旧只读档 shellReadonly（改走审批档）");
  assert.ok(su!.shellOperatorOnly, "su 应收到 shellOperatorOnly（审批档）");
  {
    const only = su!.shellOperatorOnly!;
    assert.equal(only.classifyShell, armingStub.classifyShell, "shellOperatorOnly.classifyShell 恰为 (c) 实件同一函数引用");
    assert.equal(only.rules, armingStub.rules, "shellOperatorOnly.rules 恰为 (c) 实件同一引用");
    assert.equal(typeof only.operatorChannel, "function", "shellOperatorOnly.operatorChannel 应为绑定的 (a) 通道");
    assert.deepEqual(
      await only.operatorChannel!({ command: "fixture", argv: ["fixture"], cwd: "/proj", toolCallId: "D2" }),
      await channel({ command: "fixture", argv: ["fixture"], cwd: "/proj", toolCallId: "D2" }),
      "su 的 (a) 通道同样原样转交裁决",
    );
  }
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
  assert.ok(!("shellOperatorOnly" in (seen as object)), "未配置 ⇒ 审批档字段不出现（不 arm）");
  assert.ok(!("shellReadonly" in (seen as object)), "未配置 ⇒ shellReadonly 字段不出现（项目角色不带——照旧）");
  await mgr.stop(null);
});

test("su 审批档 fail-closed：deps.shellArming 缺省 ⇒ su 连 shellOperatorOnly/shellOperatorChannel/shellReadonly 都不注入（能力缺席 = 不 arm，绝不放宽）", async () => {
  // 「缺省/构造失败 ⇒ 不传」（任务口径：fail-closed）。与上例同款，但开的是**内置治理角色（su）**——
  // 正是审批档的目标会话；缺件时它同样**什么都拿不到**（不降级、不放宽）。
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
    // 刻意不提供 shellArming（(c) 实件构造失败/未接线的主进程形态）——即便通道在场也不得半装。
    shellOperatorChannel: async () => ({ outcome: "deny", operatorId: "test", reason: "替身拒绝" }),
    loadEffectiveConfig: STUB_LOADER,
  });
  await mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "pi" });
  assert.ok(seen, "应开启过一次 su 会话");
  assert.ok(!("shellOperatorOnly" in (seen as object)), "deps.shellArming 缺省 ⇒ su 不注入 shellOperatorOnly（不 arm——绝不半装/放宽）");
  assert.ok(!("shellReadonly" in (seen as object)), "su 不再注入旧只读档 shellReadonly");
  assert.ok(!("shellArming" in (seen as object)), "su 也不收三层链的 (c) 字段（不接 (b)）");
  assert.ok(!("shellOperatorChannel" in (seen as object)), "su 不经 shellOperatorChannel 字段（(a) 通道在 shellOperatorOnly 内）");
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

// ————— F-4（2026-10-16 客户批准）：确认超时与 shell 审核预算对齐 + 超时/中止原因分流 + 诊断补录 —————
// 真机 F-4：闸侧注入了 ANS_PI_SHELL_REVIEW_TIMEOUT_MS=300000，桌面通道内部 120s 独立默认把人工确认窗口
// 静默钳制在 120s（presented→deny 恰 120.000s），超时又被误报成「无人值守？/本轮已结束」。

test("F-4-T1 超时取值链：专用 env 优先 → 未设时**跟随 ANS_PI_SHELL_REVIEW_TIMEOUT_MS**（注入小值断言实际等待随之变化）→ 都未设 120000；非法值沿链回退", async () => {
  // ① 专用 env 优先：40ms 生效（审核预算 5000ms 不生效）。
  {
    const presenter: OperatorPresenter = { present() { return new Promise<{ allow: boolean }>(() => {}); } };
    const ch = createDesktopOperatorChannel({ presenter, operatorId: "t", env: { ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS: "40", ANS_PI_SHELL_REVIEW_TIMEOUT_MS: "5000" } });
    const t0 = Date.now();
    const res = await ch(req("ls", ["ls"]));
    assert.equal(res.outcome, "unavailable", "超时 = 非放行（fail-closed 不变）");
    assert.match((res as { reason: string }).reason, /超时（>40ms）/, "通道 reason 携带生效时限");
    assert.ok(Date.now() - t0 < 2000, "实际等待 ≈40ms（不是 5000、也不是 120000）");
  }
  // ② 未设专用 env ⇒ 跟随 shell 审核预算——「审核预算放宽到 300s」从此真正覆盖人工确认等待。
  {
    const presenter: OperatorPresenter = { present() { return new Promise<{ allow: boolean }>(() => {}); } };
    const ch = createDesktopOperatorChannel({ presenter, operatorId: "t", env: { ANS_PI_SHELL_REVIEW_TIMEOUT_MS: "60" } });
    const t0 = Date.now();
    const res = await ch(req("ls", ["ls"]));
    assert.match((res as { reason: string }).reason, /超时（>60ms）/, "跟随审核预算（>60ms）");
    assert.ok(Date.now() - t0 < 2000, "实际等待 ≈60ms（旧实现：恒 120000 静默钳制）");
  }
  // ③ 都未设 ⇒ 默认 120000（常量如实；即时作答的 presenter 不会真等到超时）。
  {
    assert.equal(DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS, 120000);
    const ch = createDesktopOperatorChannel({ presenter: { async present() { return { allow: true }; } }, operatorId: "t", env: {} });
    assert.equal((await ch(req("ls", ["ls"]))).outcome, "allow", "无超时发生、判定照常");
  }
  // ④ 非法值沿链回退：专用非法 → 落到审核预算；两者皆非法 → 默认；不炸、不放行面变化。
  {
    const presenter: OperatorPresenter = { present() { return new Promise<{ allow: boolean }>(() => {}); } };
    const ch = createDesktopOperatorChannel({ presenter, operatorId: "t", env: { ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS: "nope", ANS_PI_SHELL_REVIEW_TIMEOUT_MS: "35" } });
    const res = await ch(req("ls", ["ls"]));
    assert.match((res as { reason: string }).reason, /超时（>35ms）/, "专用非法 ⇒ 沿链落到审核预算");
  }
  {
    const ch = createDesktopOperatorChannel({ presenter: { async present() { return { allow: false }; } }, operatorId: "t", env: { ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS: "0", ANS_PI_SHELL_REVIEW_TIMEOUT_MS: "-5" } });
    assert.equal((await ch(req("ls", ["ls"]))).outcome, "deny", "非法 env 不炸、判定照常（回退默认）");
  }
  // ⑤ 接线钉：env 名从编排单一来源只读导入（读取用常量、字面量只出现在 import 说明与注释里）；
  // presenter 兜底缺省随同一取值链（+5000 给通道先手）。
  const src = fs.readFileSync(path.join(APP_DIR, "desktop", "operator-channel.ts"), "utf8");
  assert.ok(
    src.includes('import { SHELL_REVIEW_TIMEOUT_ENV } from "../../src/common/编排/shell-deadline.ts"') &&
      src.includes("env[SHELL_REVIEW_TIMEOUT_ENV]"),
    "审核预算 env 名从 shell-deadline.ts 只读导入并用常量读取（单一来源，不自写字面量）"
  );
  assert.ok(/opts\.cleanupAfterMs \?\? readConfirmTimeoutMs\(env\) \+ 5000/.test(src), "presenter 清理兜底缺省随同一取值链（+5000 给通道先手）");
});

test("F-4-T2 到期原因分流：超时中止的失效文案 = 如实超时文案（含时限与恢复指引，不再误报「本轮已结束」）；轮次中止保留原文案（组合信号 reason 驱动，Node 24 传播首验）", async () => {
  // ① 超时：通道在 timeoutMs 处以**带标记 reason** 中止组合信号 ⇒ presenter 的 cancel 按 reason 分流。
  {
    const sent: ShellConfirmRequest[] = [];
    const expired: { reason?: string }[] = [];
    const presenter = createShellConfirmPresenter({ present: (r) => sent.push(r), cleanupAfterMs: 60000, env: {}, onExpired: (p) => expired.push(p as { reason?: string }) });
    const turn = new AbortController();
    const ch = createDesktopOperatorChannel({ presenter: presenter.presenter, operatorId: "op", timeoutMs: 40 });
    const started = ch(req("ls", ["ls"]), { roleId: "A", projectRoot: "/proj", runtime: "pi", signal: turn.signal });
    const res = await started;
    assert.equal(res.outcome, "unavailable", "超时仍落 unavailable（编排据此拒——fail-closed 逐字不变）");
    assert.equal(expired.length, 1, "操作者侧收到失效通知（session:operator-expired 的数据面）");
    assert.equal(expired[0]?.reason, "操作者确认超时（>40ms），未获放行——可让角色重新发起。", "到期文案如实指向**超时**（含实际时限与恢复指引）");
    assert.equal(presenter.pendingCount(), 0, "超时后挂起清空（无泄漏）");
    turn.abort(); // 收尾（此时 listener 已随 finish 移除）
  }
  // ② 轮次中止（无标记 reason ⇒ 默认 AbortError）：保留原文案；结论仍为非放行（deny —— 呈现侧以「不放行」解挂）。
  {
    const expired: { reason?: string }[] = [];
    const presenter = createShellConfirmPresenter({ present: () => {}, cleanupAfterMs: 60000, env: {}, onExpired: (p) => expired.push(p as { reason?: string }) });
    const turn = new AbortController();
    const ch = createDesktopOperatorChannel({ presenter: presenter.presenter, operatorId: "op", timeoutMs: 60000 });
    const started = ch(req("ls", ["ls"]), { roleId: "A", projectRoot: "/proj", runtime: "pi", signal: turn.signal });
    await new Promise((r) => setTimeout(r, 30));
    turn.abort();
    const res = await started;
    assert.equal(res.outcome, "deny", "轮次中止 ⇒ 呈现侧不放行（deny；旧语义逐字保留）");
    assert.equal(expired[0]?.reason, "本轮已结束、停止或会话已重建，旧 shell 确认失效。", "轮次中止保留原文案（分流不误伤）");
  }
});

test("F-4-T3 诊断补录（opt2）：超时 ⇒ shell-confirm.timeout（含时限）；轮次中止 ⇒ shell-confirm.cancelled——presented 之后的每种去向都可判定", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ans-f4-diagnostics-"));
  configureDiagnostics({ directory: dir });
  try {
    {
      const presenter = createShellConfirmPresenter({ present: () => {}, cleanupAfterMs: 60000, env: {} });
      const turn = new AbortController();
      const ch = createDesktopOperatorChannel({ presenter: presenter.presenter, operatorId: "op", timeoutMs: 30 });
      await ch(req("ls", ["ls"]), { roleId: "A", projectRoot: "/proj", runtime: "pi", signal: turn.signal });
      turn.abort();
    }
    {
      const presenter = createShellConfirmPresenter({ present: () => {}, cleanupAfterMs: 60000, env: {} });
      const turn = new AbortController();
      const ch = createDesktopOperatorChannel({ presenter: presenter.presenter, operatorId: "op", timeoutMs: 60000 });
      const p = ch(req("ls", ["ls"]), { roleId: "A", projectRoot: "/proj", runtime: "pi", signal: turn.signal });
      await new Promise((r) => setTimeout(r, 20));
      turn.abort();
      await p;
    }
    await flushDiagnostics();
    const files = await fsp.readdir(dir);
    const records = (await Promise.all(files.map((f) => fsp.readFile(path.join(dir, f), "utf8")))).join("").trim().split("\n").map((line) => JSON.parse(line) as { event: string; requestId?: string; durationMs?: number });
    const timeout = records.find((r) => r.event === "shell-confirm.timeout");
    assert.ok(timeout && typeof timeout.requestId === "string", "超时路径有 shell-confirm.timeout 诊断（含 requestId）");
    assert.equal(timeout?.durationMs, 30, "超时时限如实入诊断（durationMs=实际等待时限）");
    const cancelled = records.find((r) => r.event === "shell-confirm.cancelled");
    assert.ok(cancelled && typeof cancelled.requestId === "string", "轮次中止路径有 shell-confirm.cancelled 诊断");
    assert.ok(records.some((r) => r.event === "shell-confirm.presented"), "既有 presented 记录照旧");
  } finally {
    await disposeDiagnostics();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("F-4-opt1 接线钉与幂等行为：main.ts 在窗口 focus/show 时重推挂起确认卡（与 app:recovery-ready 同款）；replayPending 只推仍挂起者", async () => {
  const mainSrc = fs.readFileSync(path.join(APP_DIR, "main.ts"), "utf8");
  // G-2/W5（2026-10-16）起同一重推点同时覆盖恢复确认卡（recoveryConfirm）——接线形状按现行实文钉住
  // （行为不变：**幂等**重推、只推仍挂起者；新增的 recoveryConfirm.replayPending() 见 recovery 通道用例）。
  assert.ok(/win\.on\("focus", \(\) => \{ shellConfirm\.replayPending\(\); recoveryConfirm\.replayPending\(\); \}\)/.test(mainSrc), "focus ⇒ 幂等重推挂起卡（shell＋恢复；渲染侧丢推的兜底）");
  assert.ok(/win\.on\("show", \(\) => \{ shellConfirm\.replayPending\(\); recoveryConfirm\.replayPending\(\); \}\)/.test(mainSrc), "show ⇒ 幂等重推挂起卡（shell＋恢复）");
  assert.ok(mainSrc.includes("shellConfirm.replayPending()"), "复用既有幂等重推入口");

  // 行为面：只重推**仍挂起**的项；已决项绝不复活（重推不改判定）。
  const sent: ShellConfirmRequest[] = [];
  const presenter = createShellConfirmPresenter({ present: (r) => sent.push(r), cleanupAfterMs: 60000, env: {} });
  const prompt = req("ls", ["ls"], "/proj");
  const d1 = presenter.presenter.present(prompt, describeShellCommand(prompt));
  void presenter.presenter.present(prompt, describeShellCommand(prompt));
  assert.equal(presenter.replayPending(), 2, "两条挂起都重推");
  presenter.respond({ id: sent[0].id, allow: false });
  assert.deepEqual(await d1, { allow: false });
  assert.equal(presenter.replayPending(), 1, "已决项不再重推（只推仍挂起者）");
  presenter.rejectAllPending("清场");
});

// ————————————————— G-2/W5：恢复确认卡（与 shell 卡共享 pending/replay/expire 通用件） —————————————————
//
// 卡侧语义（渲染侧与通道契约）：**恰 `{allow:true}` 才为真**（其余含缺字段/取消/Esc = 不执行）；幂等 by id；
// **等待不设限**（裁定 4——无任何兜底计时器）；关窗 rejectAllPending / 组合信号中止 = **未获执行**；
// 未知/失效 id → `{ok:false, expired:true}`（绝不当执行）。执行动作本身在 SessionManager（W5 执行桥）。

test("G-2/W5 恢复卡：恰 allow:true 才为真；缺字段/取消 → false；未知 id → expired（未获执行文案）；id 前缀 rp-", async () => {
  const sent: import("../../app/desktop/recovery-channel.ts").RecoveryConfirmRequest[] = [];
  const presenter = createRecoveryConfirmPresenter({ present: (r) => sent.push(r), operatorId: "ops" });
  const requestInput = { roleId: "A", action: "abort-turn" as const, evidence: "role_status：A 已 583s 无 settled", reason: "疑似卡死", projectRoot: "/proj", runtime: "demo" as const, requestedBy: "su", requestedAt: new Date(0).toISOString() };
  const d1 = presenter.present(requestInput, { roleId: "su", projectRoot: "/proj", runtime: "demo" });
  assert.equal(sent.length, 1, "推达渲染侧");
  assert.ok(sent[0].id.startsWith("rp-"), "id 前缀 rp-（卡族标识）");
  assert.equal(sent[0].evidence, requestInput.evidence, "证据逐字透传（不加工、不截断）");
  assert.equal(sent[0].requestedBy, "su", "提议者随带（呈现「由 su 提议」）");
  assert.equal(presenter.pendingCount(), 1);
  assert.deepEqual(presenter.pendingRoles(), new Map([["su", 1]]), "按角色 pending 视图（挂在提议者 su 轮内）");
  assert.equal(presenter.respond({ id: sent[0].id, allow: true }).ok, true, "回包受理");
  assert.equal(await d1, true, "恰 allow:true ⇒ 真（＝执行请求；执行由应用侧做）");
  // 缺字段 / allow:false ⇒ false（「未获执行」方向）。
  const d2 = presenter.present(requestInput);
  assert.equal(presenter.respond({ id: sent[1].id }).ok, true, "缺 allow 字段的回包也受理（行为＝false）");
  assert.equal(await d2, false, "缺字段 → 不执行");
  const d3 = presenter.present(requestInput);
  assert.equal(presenter.respond({ id: sent[2].id, allow: false }).ok, true);
  assert.equal(await d3, false, "拒绝 → 不执行");
  // 未知/失效 id：expired（旧回包绝无执行语义）。
  const exp = presenter.respond({ id: "rp-旧回包", allow: true });
  assert.equal(exp.expired, true, "未知 id → expired");
  assert.ok((exp.error ?? "").includes("未获执行"), "如实文案（未获执行——可让 su 重新提议）");
  assert.equal(presenter.pendingCount(), 0);
});

test("G-2/W5 恢复卡：等待不设限（零计时器）；关窗/中止 = 未获执行；replayPending 只推仍挂起者", async () => {
  const sent: import("../../app/desktop/recovery-channel.ts").RecoveryConfirmRequest[] = [];
  const expired: { reason?: string }[] = [];
  const presenter = createRecoveryConfirmPresenter({ present: (r) => sent.push(r), operatorId: "ops", onExpired: (p) => expired.push(p) });
  const input = { roleId: "A", action: "rebuild-session" as const, evidence: "e", requestedBy: "su" };
  // —— 不设限：实现上无兜底计时器（裁定 4）——借源码钉 + 行为钉（推后挂起数保持，不自动清理）。
  const src = fs.readFileSync(path.join(APP_DIR, "desktop", "recovery-channel.ts"), "utf8");
  assert.ok(/present: \(request, metadata\) => core\.mount\(\(id\) => \(\{ id, \.\.\.request \}\), metadata\), \/\/ \*\*不设限\*\*/.test(src), "零计时器：mount 不带 cleanupAfterMs（等待客户不设限，裁定 4）");
  const d1 = presenter.present(input);
  assert.equal(presenter.pendingCount(), 1, "推后保持挂起（无超时清理）");
  assert.equal(presenter.replayPending(), 1, "重推仍挂起者（focus/show/recovery-ready 先例）");
  assert.equal(sent.length, 2, "重推 = 同一请求再推一次");
  // —— 组合信号中止（su 轮次停止/会话重建）⇒ 未获执行 + 如实失效通知。
  const ac = new AbortController();
  const d2 = presenter.present(input, { roleId: "su", projectRoot: "/proj", signal: ac.signal });
  ac.abort(new Error("turn aborted"));
  assert.equal(await d2, false, "轮次中止 ⇒ 未获执行（fail-closed）");
  assert.equal(expired.length, 1, "失效如实通知");
  assert.ok((expired[0].reason ?? "").includes("未获执行") || (expired[0].reason ?? "").includes("失效"), "失效原因如实");
  // —— 关窗 rejectAllPending ⇒ 全部未获执行。
  const d3 = presenter.present(input);
  presenter.rejectAllPending("窗口已关闭，未获执行（fail-closed）");
  assert.equal(await d3, false, "关窗 ⇒ 未获执行");
  assert.equal(presenter.pendingCount(), 0, "关窗后无挂起残留");
  assert.equal(await d1, false, "先前挂起项同样未获执行");
  assert.equal(presenter.respond({ id: sent[0].id, allow: true }).expired, true, "关窗后迟到回包 → expired（绝不当执行）");
});

test("G-2/W5 shell 卡按角色 pending 视图（W1 依赖项）：metadata.roleId 聚合；无 metadata 不计角色", () => {
  const sent: ShellConfirmRequest[] = [];
  const p = createShellConfirmPresenter({ present: (r) => sent.push(r), cleanupAfterMs: 60000, env: {} });
  const prompt = req("ls", ["ls"], "/proj");
  void p.presenter.present(prompt, describeShellCommand(prompt), { roleId: "A", projectRoot: "/proj", runtime: "pi", signal: new AbortController().signal });
  void p.presenter.present(prompt, describeShellCommand(prompt), { roleId: "A", projectRoot: "/proj", runtime: "pi", signal: new AbortController().signal });
  void p.presenter.present(prompt, describeShellCommand(prompt), { roleId: "B", projectRoot: "/proj", runtime: "pi", signal: new AbortController().signal });
  assert.deepEqual(p.pendingRoles(), new Map([["A", 2], ["B", 1]]), "按角色聚合（看护「正确等待不报」排除数据面）");
  assert.equal(p.pendingCount(), 3);
  p.rejectAllPending("清场");
  assert.equal(p.pendingRoles().size, 0, "清场后视图清空");
});

// ————————————————— 2026-10-17「替我审」三态映射（PM 评审 §5.2/§6.5/§8.3/§8.4/§10.4） —————————————————
//
// 纪律：通道**不做命令分类**——这里用**桩 judge**（绝不调真实模型）验证「开关 → 调用 → 三态映射」。
// 结果行是 allow 的放行条件（row-failed ⇒ manual）；deny 档放行只打标记，不转换。

function judgeMetadata(overrides: Partial<DesktopOperatorMetadata> = {}): DesktopOperatorMetadata {
  return {
    roleId: "A",
    projectRoot: "/proj",
    runtime: "claude",
    signal: new AbortController().signal,
    ...overrides,
  };
}

function judgeStub(outcome: ShellJudgeOutcome, seen?: ShellJudgeRequest[]): ShellJudgeFn {
  return async (input) => {
    seen?.push(input);
    return outcome;
  };
}

test("替我审·开关关：不调 judge，presenter 原路径逐字不变（默认手动）", async () => {
  let judgeCalls = 0;
  let presented = 0;
  const ch = createDesktopOperatorChannel({
    presenter: { async present() { presented += 1; return { allow: true }; } },
    operatorId: "alice",
    judge: { isEnabled: () => false },
    emitJudgeResult: () => { throw new Error("开关关时不该发结果行"); },
  });
  const res = await ch(req("ls", ["ls"]), judgeMetadata({ judge: async () => { judgeCalls += 1; return { verdict: "allow", reason: "x", reasonCode: "necessary" }; } }));
  assert.deepEqual(res, { outcome: "allow", operatorId: "alice" }, "开关关 ⇒ 原人工放行");
  assert.equal(judgeCalls, 0, "开关关绝不调用判断");
  assert.equal(presented, 1, "走原确认卡");
});

test("替我审·无 metadata.judge：不调判断，原 present 路径", async () => {
  let presented = 0;
  const ch = createDesktopOperatorChannel({
    presenter: { async present() { presented += 1; return { allow: false, note: "人工拒绝" }; } },
    operatorId: "bob",
    judge: { isEnabled: () => true },
  });
  const res = await ch(req("ls", ["ls"]), judgeMetadata());
  assert.equal(res.outcome, "deny");
  assert.equal((res as { reason?: string }).reason, "人工拒绝");
  assert.equal(presented, 1);
});

test("替我审·signal 已中止：不调判断，原 present 路径（交回既有中止路径）", async () => {
  let judgeCalls = 0;
  let presented = 0;
  const ac = new AbortController();
  ac.abort();
  const ch = createDesktopOperatorChannel({
    presenter: { async present() { presented += 1; return { allow: true }; } },
    operatorId: "carol",
    judge: { isEnabled: () => true },
  });
  const res = await ch(req("ls", ["ls"]), judgeMetadata({ signal: ac.signal, judge: async () => { judgeCalls += 1; return { verdict: "allow", reason: "x", reasonCode: "necessary" }; } }));
  assert.equal(res.outcome, "allow");
  assert.equal(judgeCalls, 0, "已中止 ⇒ 不发起判断");
  assert.equal(presented, 1);
});

test("替我审·allow：请求字段完整、先发结果行，返回 allow + operatorId=judge:<engine> + 审计 judge", async () => {
  const seen: ShellJudgeRequest[] = [];
  const emitted: ShellJudgeResultPayload[] = [];
  let presented = 0;
  const ch = createDesktopOperatorChannel({
    presenter: { async present() { presented += 1; return { allow: false }; } },
    operatorId: "alice",
    judge: { isEnabled: () => true },
    emitJudgeResult: (payload) => emitted.push(payload),
  });
  const res = await ch(
    req("ls -la", ["ls", "-la"], "/proj", "pm 拿不准"),
    judgeMetadata({
      runtime: "pi",
      turnText: "当前轮任务：检查目录",
      judge: judgeStub(
        { verdict: "allow", reason: "只读列目录", reasonCode: "necessary", model: "test-model" },
        seen,
      ),
    }),
  );
  assert.equal(seen.length, 1, "判断被调用一次");
  assert.deepEqual(seen[0], {
    command: "ls -la",
    argv: ["ls", "-la"],
    cwd: "/proj",
    toolCallId: "call-1",
    roleId: "A",
    projectRoot: "/proj",
    runtime: "pi",
    policy: "project",
    tier: null,
    reason: "pm 拿不准",
    turnText: "当前轮任务：检查目录",
  }, "判断入参来自会话闭包（roleId/projectRoot/runtime + 本轮 turnText）");
  assert.equal(emitted.length, 1, "先发结果行");
  assert.equal(emitted[0].verdict, "allow");
  assert.equal(emitted[0].operator, "judge:pi");
  assert.equal(emitted[0].engine, "pi");
  assert.equal(emitted[0].model, "test-model");
  assert.equal(emitted[0].reasonCode, "necessary");
  assert.equal(emitted[0].toolCallId, "call-1");
  assert.equal(emitted[0].summary, shellIntentSummary("ls -la"));
  assert.equal(emitted[0].policy, "project");
  assert.equal(emitted[0].tier, null);
  assert.equal(res.outcome, "allow", "判断放行");
  assert.equal((res as { operatorId?: string }).operatorId, "judge:pi");
  const audit = (res as { judge?: { engine: string; verdict: string; reasonCode: string; model?: string } }).judge;
  assert.equal(audit?.engine, "pi");
  assert.equal(audit?.verdict, "allow");
  assert.equal(audit?.reasonCode, "necessary");
  assert.equal(audit?.model, "test-model");
  assert.equal(presented, 0, "allow 不弹卡");
});

test("替我审·allow 但结果行投达失败 ⇒ manual/row-failed（结果行是放行条件），回落原卡且带 judgeNotice", async () => {
  let presented = 0;
  let notice = "";
  const ch = createDesktopOperatorChannel({
    presenter: {
      async present(_p, display) {
        presented += 1;
        notice = display.judgeNotice ?? "";
        return { allow: true };
      },
    },
    operatorId: "alice",
    judge: { isEnabled: () => true },
    emitJudgeResult: () => { throw new Error("窗口已关闭"); },
  });
  const res = await ch(req("ls", ["ls"]), judgeMetadata({ judge: judgeStub({ verdict: "allow", reason: "必要", reasonCode: "necessary" }) }));
  assert.equal(presented, 1, "回落人工确认");
  assert.ok(notice.includes("结果无法在聊天中显示"), "row-failed 文案：判断已完成但结果无法显示");
  assert.ok(notice.includes("已转你手动确认"));
  assert.equal(res.outcome, "allow", "人工确认后可放行（归因人工）");
  assert.equal((res as { operatorId?: string }).operatorId, "alice", "审计归人工，not judge");
  assert.equal((res as { judge?: unknown }).judge, undefined, "人工手批不写 judge 字段");
});

test("替我审·deny：不调用 presenter；结果行投达 + 格式化原因（说明/原因/替代方案/出路）", async () => {
  const emitted: ShellJudgeResultPayload[] = [];
  let presented = 0;
  const ch = createDesktopOperatorChannel({
    presenter: { async present() { presented += 1; return { allow: true }; } },
    operatorId: "alice",
    judge: { isEnabled: () => true },
    emitJudgeResult: (payload) => emitted.push(payload),
  });
  const outcome: ShellJudgeOutcome = {
    verdict: "deny",
    reasonCode: "safer-alternative",
    reason: "该命令会改写工作区",
    customerMessage: "这条命令会改文件，先看只读结果。",
    alternative: { kind: "command", value: "git status" },
  };
  const res = await ch(req("git checkout .", ["git", "checkout", "."]), judgeMetadata({ runtime: "codex", judge: judgeStub(outcome) }));
  assert.equal(presented, 0, "deny 绝不弹卡");
  assert.equal(emitted.length, 1, "deny 也发结果行");
  assert.equal(emitted[0].verdict, "deny");
  assert.equal(emitted[0].operator, "judge:codex");
  assert.equal(emitted[0].customerMessage, "这条命令会改文件，先看只读结果。");
  assert.equal(res.outcome, "deny");
  assert.equal((res as { operatorId?: string }).operatorId, "judge:codex");
  const reason = (res as { reason?: string }).reason ?? "";
  assert.match(reason, /判断 agent 未放行该命令/);
  assert.match(reason, /请向客户说明：这条命令会改文件/);
  assert.match(reason, /原因：该命令会改写工作区/);
  assert.match(reason, /替代方案（command）：git status/);
  assert.match(reason, /关闭「替我审」后重试/);
  const audit = (res as { judge?: { verdict: string; reasonCode: string; customerMessage?: string } }).judge;
  assert.equal(audit?.verdict, "deny");
  assert.equal(audit?.reasonCode, "safer-alternative");
  assert.equal(audit?.customerMessage, "这条命令会改文件，先看只读结果。");
});

test("替我审·deny 结果行投达失败 ⇒ 仍 deny（拒绝是安全方向），只记诊断、不弹卡", async () => {
  let presented = 0;
  const ch = createDesktopOperatorChannel({
    presenter: { async present() { presented += 1; return { allow: true }; } },
    operatorId: "alice",
    judge: { isEnabled: () => true },
    emitJudgeResult: () => { throw new Error("窗口已关闭"); },
  });
  const res = await ch(req("rm -rf x", ["rm", "-rf", "x"]), judgeMetadata({ judge: judgeStub({ verdict: "deny", reason: "危险", reasonCode: "no-alternative" }) }));
  assert.equal(res.outcome, "deny", "结果行投达失败不翻转 deny");
  assert.equal((res as { operatorId?: string }).operatorId, "judge:claude");
  assert.equal(presented, 0, "仍不弹卡");
});

test("替我审·manual 回落：设置 display.judgeNotice 后走原 present；审计归人工（不写 judge）", async () => {
  let notice = "";
  let presented = 0;
  const ch = createDesktopOperatorChannel({
    presenter: {
      async present(_p, display) {
        presented += 1;
        notice = display.judgeNotice ?? "";
        return { allow: false, note: "人工先拒" };
      },
    },
    operatorId: "dora",
    judge: { isEnabled: () => true },
    emitJudgeResult: () => { throw new Error("manual 不该发结果行"); },
  });
  const res = await ch(req("ls", ["ls"]), judgeMetadata({ judge: judgeStub({ verdict: "manual", reasonCode: "unavailable", reason: "会话不可用" }) }));
  assert.equal(presented, 1);
  assert.match(notice, /判断 agent 未能完成判断/);
  assert.match(notice, /判断服务不可用/);
  assert.match(notice, /已转你手动确认/);
  assert.equal(res.outcome, "deny");
  assert.equal((res as { operatorId?: string }).operatorId, "dora");
  assert.equal((res as { judge?: unknown }).judge, undefined, "manual 后人工手批不写 judge");
});

test("替我审·独立超时：judge 不返回 ⇒ manual/timeout 回落原卡（不占用确认超时）", async () => {
  let notice = "";
  const ch = createDesktopOperatorChannel({
    presenter: { async present(_p, display) { notice = display.judgeNotice ?? ""; return { allow: false }; } },
    operatorId: "eve",
    judge: { isEnabled: () => true, timeoutMs: 25 },
  });
  const hangingJudge: ShellJudgeFn = (_input, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const startedAt = Date.now();
  const res = await ch(req("ls", ["ls"]), judgeMetadata({ judge: hangingJudge }));
  assert.ok(Date.now() - startedAt < 2000, "判断超时应独立生效（不等确认超时）");
  assert.equal(res.outcome, "deny", "回落人工后按人工决定");
  assert.match(notice, /判断超时/);
});

test("替我审·deny 档：judge 放行**不转换**——outcome 仍 allow，只按 tier 置 hardDenyOverride/label（客户 D1）", async () => {
  const seen: ShellJudgeRequest[] = [];
  const emitted: ShellJudgeResultPayload[] = [];
  const ch = createDesktopOperatorChannel({
    presenter: { async present() { throw new Error("deny 档放行不该弹卡"); } },
    operatorId: "alice",
    judge: { isEnabled: () => true },
    emitJudgeResult: (payload) => emitted.push(payload),
  });
  // 桩 judge **故意不**自己设置 hardDenyOverride——通道必须按请求 tier 置（不依赖驱动侧实现）。
  const res = await ch(
    req("git reset --hard", ["git", "reset", "--hard"], "/proj", "su-审批档[deny] 硬拒类"),
    judgeMetadata({ runtime: "claude", judge: judgeStub({ verdict: "allow", reason: "客户明确要求回滚", reasonCode: "necessary" }, seen) }),
  );
  assert.equal(seen[0].tier, "deny", "tier 来自请求（su 审批档原因前缀）");
  assert.equal(seen[0].policy, "su-approval");
  assert.equal(res.outcome, "allow", "照常放行——没有 hard-floor 转换/拦截");
  assert.equal((res as { operatorId?: string }).operatorId, "judge:claude");
  const audit = (res as { judge?: { tier?: string; hardDenyOverride?: true; label?: string } }).judge;
  assert.equal(audit?.tier, "deny");
  assert.equal(audit?.hardDenyOverride, true);
  assert.equal(audit?.label, "deny 档 · judge 放行");
  assert.equal(emitted[0].tier, "deny");
  assert.equal(emitted[0].hardDenyOverride, true);
  assert.equal(emitted[0].label, "deny 档 · judge 放行");
});

test("judgeNotice：buildShellConfirmRequest 原样拷贝、不进入 reasonRaw（§10.4）", () => {
  const display = describeShellCommand(req("ls", ["ls"], "/proj", "普通原因"));
  display.judgeNotice = "判断 agent 未能完成判断：判断超时。已转你手动确认。";
  const built = buildShellConfirmRequest("sc-1", display);
  assert.equal(built.judgeNotice, display.judgeNotice, "judgeNotice 原样拷贝");
  assert.equal(built.reasonRaw, "普通原因", "judgeNotice 不进入 reasonRaw");
  assert.equal(built.reasonPlain, plainReasonFor("普通原因"), "plainReasonFor 映射不受影响");
  assert.equal(buildShellConfirmRequest("sc-2", describeShellCommand(req("ls", ["ls"]))).judgeNotice, undefined, "无值 ⇒ 字段缺省（渲染侧隐藏）");
});

// ————————————————— 2026-10-17「替我审」会话装配（PM 评审 §5.2/§十一） —————————————————

test("替我审·session：每会话构造 judge 闭包（同一份 runtimeOptions/createAdapter）；metadata 注入 turnText（≤4KB）与 judge；dispose 即清", async () => {
  const listing: ProjectListing = {
    projectRoot: "/proj",
    roles: [
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
    primaryRoleId: "A",
  };
  const judge: ShellJudgeFn = async () => ({ verdict: "allow", reason: "桩件", reasonCode: "necessary" });
  const factoryArgs: Record<string, unknown>[] = [];
  const metadataSeen: (DesktopOperatorMetadata | undefined)[] = [];
  const runtimeOptions = {};
  let capturedChannel: OperatorChannelFn | undefined;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      capturedChannel = input.shellOperatorChannel;
      return fakeHandle();
    },
    createPiAdapterFactory: () => () => ({}) as unknown as RuntimeAdapter,
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? listing : undefined),
    emitEvent: () => {},
    shellOperatorChannel: async (_prompt, metadata) => {
      metadataSeen.push(metadata);
      return { outcome: "deny", operatorId: "stub", reason: "替身拒绝" };
    },
    shellArming: buildDesktopShellArming(),
    loadEffectiveConfig: STUB_LOADER,
    runtimeOptions,
    createShellJudge: (opts) => {
      factoryArgs.push(opts as unknown as Record<string, unknown>);
      return judge;
    },
  });
  await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "pi" });
  assert.equal(factoryArgs.length, 1, "每会话构造一次 judge 闭包");
  assert.equal(factoryArgs[0].runtimeOptions, runtimeOptions, "判断用**同一份** runtimeOptions（不另读模型/env）");
  assert.equal(factoryArgs[0].runtime, "pi", "判断跟随请求会话引擎（不跨引擎）");
  assert.equal(typeof factoryArgs[0].createAdapter, "function", "判断用会话同一 createAdapter 工厂");
  assert.equal((factoryArgs[0].project as { projectRoot?: string }).projectRoot, "/proj");

  const prompt = { command: "ls", argv: ["ls"], cwd: "/proj", toolCallId: "t1" };
  await capturedChannel!(prompt);
  assert.equal(metadataSeen[0]?.judge, judge, "metadata 注入每会话 judge 闭包");
  assert.equal(metadataSeen[0]?.turnText, undefined, "尚未投递 ⇒ 无 turnText");

  // 投递一轮超长文本：只留 ≤4KB（内存内），不据此 manual。
  await mgr.send("好".repeat(3000)); // >4096 UTF-8 bytes
  await capturedChannel!(prompt);
  const turnText = metadataSeen[1]?.turnText ?? "";
  assert.ok(Buffer.byteLength(turnText, "utf8") <= 4096, "turnText ≤4KB（超出截断）");
  assert.ok(turnText.length > 0, "turnText 来自本轮投递文本");

  // 会话销毁 ⇒ judge/turnText 即清（通道回到原 present 事实面）。
  await mgr.stop(null);
  await capturedChannel!(prompt);
  assert.equal(metadataSeen.at(-1)?.judge, undefined, "dispose 后不再提供 judge 闭包");
  assert.equal(metadataSeen.at(-1)?.turnText, undefined, "dispose 后不残留 turnText");
});
