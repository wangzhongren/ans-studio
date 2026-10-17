// test/测试/g2-verify/contract-freeze.test.ts —— G-2 独立复验「契约冻结核对」域。
//
// 关键静默失效面（PM 收口登记的集成收敛点）：
//   ① 三能力字段名 `roleStatus` / `sessionTail` / `proposeRecovery` 全链一致（改名 = 工具静默零注册）；
//   ② 三文首标记 `[系统·看护]` / `[系统·收束]` / `[系统·恢复]` 字节级一致（ASCII 括号＋U+00B7 中点；
//      改形态 = system 类静默回落普通气泡）；
//   ③ 渲染侧归类（tool-rows.js）与编排三前缀常量、渲染器输出三方逐字节对齐。
//
// 独立构造：不复用实施方断言；以 ①源码精确钉 ②真实 openRoleSession 桩适配器捕获 ③真实
// SessionManager 桌面注入输入捕获 ④真实 Service 装配＋演示替身（providerFactories.demo）端到端
// 四条独立证据链交叉核对。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ProjectConfig } from "../../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, WriteGate } from "../../../src/provider/pi/session.ts";
import type { RuntimeProviderFactory, RuntimeProviderOptions, ToolResult } from "../../../src/model/runtime.ts";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities } from "../../../src/pipeline/orchestration/run-role.ts";
import {
  WATCHDOG_ALERT_PREFIX,
  WATCHDOG_CLOSURE_PREFIX,
  WATCHDOG_RECOVERY_PREFIX,
  renderClosurePrompt,
  renderRecoveryReceipt,
  renderWatchdogAlert,
  type ProposeRecoveryFn,
  type RoleStatusFn,
  type SessionTailFn,
} from "../../../src/common/编排/watchdog.ts";
import { makeG2Harness } from "./fixture.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), "utf8");

// 加载渲染侧 tool-rows.js（经典脚本挂 globalThis.ANSToolRows；与渲染侧同一文件、同一实现）。
await import(new URL("../../../app/renderer/tool-rows.js", import.meta.url).href);
const ToolRows = (globalThis as unknown as { ANSToolRows: { classifyInjectedMessage(raw: unknown): { kind: string; label: string; sourceRoleId: string; body: string } | null } }).ANSToolRows;

// ————————————————————— ① 三文首标记：字节级 —————————————————————

test("G-2 契约①：三前缀逐字节＝ASCII `[`＋`系统`＋U+00B7 中点＋子类＋ASCII `]`", () => {
  const U00B7 = String.fromCharCode(0x00b7);
  assert.equal(WATCHDOG_ALERT_PREFIX, `[系统${U00B7}看护]`, "看护前缀逐字节");
  assert.equal(WATCHDOG_CLOSURE_PREFIX, `[系统${U00B7}收束]`, "收束前缀逐字节");
  assert.equal(WATCHDOG_RECOVERY_PREFIX, `[系统${U00B7}恢复]`, "恢复前缀逐字节");
  for (const [name, p] of [["看护", WATCHDOG_ALERT_PREFIX], ["收束", WATCHDOG_CLOSURE_PREFIX], ["恢复", WATCHDOG_RECOVERY_PREFIX]] as const) {
    assert.equal(p.charCodeAt(0), 0x5b, `${name}：首字符＝ASCII [`);
    assert.equal(p.charCodeAt(3), 0x00b7, `${name}：第 4 码点＝U+00B7（不是 U+30FB/全角）`);
    assert.equal(p.charCodeAt(p.length - 1), 0x5d, `${name}：末字符＝ASCII ]`);
    assert.ok(!p.includes("］") && !p.includes("【"), `${name}：不含全角括号`);
  }
});

test("G-2 契约①：四渲染器输出恒以「前缀＋一个 ASCII 空格」起始（U1 归类判据依赖）", () => {
  const outs: [string, string, string][] = [
    ["告警", WATCHDOG_ALERT_PREFIX, renderWatchdogAlert({ signal: "queue-stuck", roleId: "X", facts: ["队首已排队 12 分 0 秒（队列深度 3）"] })],
    // 复裁后渲染器收毫秒（`renderClosurePrompt(silentMs)`）；30_000＝批准默认（静默 30s）——真实投递形态。
    ["收束", WATCHDOG_CLOSURE_PREFIX, renderClosurePrompt(30_000)],
    ["恢复回执", WATCHDOG_RECOVERY_PREFIX, renderRecoveryReceipt({ outcome: "declined", action: "abort-turn", targetRoleId: "X", message: "客户取消" })],
  ];
  for (const [name, prefix, text] of outs) {
    assert.ok(text.startsWith(`${prefix} `), `${name}：首行必须「前缀＋ASCII 空格」起始——实际 ${JSON.stringify(text.slice(0, 14))}`);
    assert.equal(text.charCodeAt(prefix.length), 0x20, `${name}：前缀后是一个 ASCII 空格`);
  }
});

test("G-2 契约①：渲染侧 tool-rows.js 归类面——三前缀＋扩充子类均为 system；形态变体不误归类", () => {
  const U00B7 = String.fromCharCode(0x00b7);
  // 三真实前缀 + 编排注释声明的可扩充子类：全部归 system，label 带子类原文，来源恒空。
  for (const sub of ["看护", "收束", "恢复", "新子类甲"]) {
    const body = `[系统${U00B7}${sub}] 正文\n第二行`;
    const r = ToolRows.classifyInjectedMessage(body);
    assert.ok(r, `[系统·${sub}] 应归 system 类`);
    assert.equal(r!.kind, "system");
    assert.equal(r!.label, `系统消息 · ${sub}`);
    assert.equal(r!.sourceRoleId, "", "来源恒空（系统非角色）");
  }
  // 真实渲染输出（含「用户指令：」回显前缀）也归 system。
  const echoed = ToolRows.classifyInjectedMessage(`用户指令：${renderClosurePrompt(30_000)}`);
  assert.equal(echoed?.kind, "system", "回显前缀剥离后按标记归类");
  // 不误伤矩阵（独立构造）：全角括号/无闭合/空子类/无空白衔接/超长子类/U+30FB 冒牌中点 ⇒ null（回落普通气泡）。
  const negatives = [
    `【系统${U00B7}看护】正文`, // 全角方头括号
    `[系统${U00B7}看护正文`, // 未闭合
    `[系统${U00B7}] 正文`, // 空子类
    `[系统${U00B7}看护]正文`, // ] 后不是空白/文末
    `[系统${U00B7}${"甲".repeat(13)}] 正文`, // 子类超长
    `[系统${U00B7}看[护] ] 正文`, // 子类内括号
    `[系统・看护] 正文`, // U+30FB 片假名中点（变体必须不归类）
    `[系统 ${U00B7}看护] 正文`, // 多一个空格
  ];
  for (const neg of negatives) {
    assert.equal(ToolRows.classifyInjectedMessage(neg), null, `不得归类：${JSON.stringify(neg.slice(0, 16))}`);
  }
  // 既有两类不回归（[回交]/[派发] 照旧——只读引用渲染侧实现，独立重测）。
  assert.equal(ToolRows.classifyInjectedMessage("[回交] 来自 X 的报告：…")?.kind, "handback");
  assert.equal(ToolRows.classifyInjectedMessage("[派发] 来自 su 的任务：…")?.kind, "dispatch");
  // 前缀字节级：tool-rows.js 的 SYSTEM_HEAD 常量与编排前缀同构（源码精确钉）。
  const tr = read("app/renderer/tool-rows.js");
  assert.ok(tr.includes(`var SYSTEM_HEAD = "[系统${U00B7}";`), "tool-rows.js SYSTEM_HEAD 使用 U+00B7");
});

// ————————————————————— ② 三能力字段名：源码精确钉（全链五面） —————————————————————

test("G-2 契约②：字段名 roleStatus/sessionTail/proposeRecovery 五面同名的源码精确钉", () => {
  const model = read("src/model/runtime.ts");
  assert.ok(/roleStatus\?: RoleStatusFn;/.test(model), "model/runtime.ts GovernedToolsOptions.roleStatus");
  assert.ok(/sessionTail\?: SessionTailFn;/.test(model), "model/runtime.ts GovernedToolsOptions.sessionTail");
  assert.ok(/proposeRecovery\?: ProposeRecoveryFn;/.test(model), "model/runtime.ts GovernedToolsOptions.proposeRecovery");

  const runRole = read("src/pipeline/orchestration/run-role.ts");
  assert.ok(/roleStatus\?: RoleStatusFn;/.test(runRole), "run-role.ts AdapterCapabilities.roleStatus");
  assert.ok(/sessionTail\?: SessionTailFn;/.test(runRole), "run-role.ts AdapterCapabilities.sessionTail");
  assert.ok(/proposeRecovery\?: ProposeRecoveryFn;/.test(runRole), "run-role.ts AdapterCapabilities.proposeRecovery");
  // 2026-10-17（三权 V1，评审 §5.6）：判据由 `suppressHandback` 改为能力矩阵
  // `capabilities.roleStatus/sessionTail/proposeRecovery`（trio=Convener；su 旧能力由注册表给出）。
  assert.ok(/const roleStatus = cap\?\.roleStatus === true \? input\.roleStatus : undefined;/.test(runRole), "能力矩阵判据（roleStatus）");
  assert.ok(/const sessionTail = cap\?\.sessionTail === true \? input\.sessionTail : undefined;/.test(runRole), "能力矩阵判据（sessionTail）");
  assert.ok(/const proposeRecovery = cap\?\.proposeRecovery === true \? input\.proposeRecovery : undefined;/.test(runRole), "能力矩阵判据（proposeRecovery）");
  assert.ok(/roleStatus: capabilities\?\.roleStatus,/.test(runRole), "createRuntimeAdapter 选项并入 roleStatus");
  assert.ok(/sessionTail: capabilities\?\.sessionTail,/.test(runRole), "createRuntimeAdapter 选项并入 sessionTail");
  assert.ok(/proposeRecovery: capabilities\?\.proposeRecovery,/.test(runRole), "createRuntimeAdapter 选项并入 proposeRecovery");

  const tools = read("src/provider/runtime/tools.ts");
  assert.ok(/const roleStatus = options\?\.roleStatus;/.test(tools), "tools.ts 读取 options.roleStatus");
  assert.ok(/const sessionTail = options\?\.sessionTail;/.test(tools), "tools.ts 读取 options.sessionTail");
  assert.ok(/const proposeRecovery = options\?\.proposeRecovery;/.test(tools), "tools.ts 读取 options.proposeRecovery");
  for (const [name, maker] of [["role_status", "makeRoleStatusTool"], ["session_tail", "makeSessionTailTool"], ["propose_recovery", "makeProposeRecoveryTool"]] as const) {
    assert.ok(new RegExp(`tools\\.push\\(${maker}\\(`).test(tools), `tools.ts 注入才注册（${name}）`);
    assert.ok(tools.includes(`"${name}"`) || new RegExp(`= "${name}";`).test(tools), `tools.ts 工具名常量 ${name}`);
  }

  // 承载契约物理单一来源：编排 watchdog.ts 只 re-export model/runtime.ts 同名符号（无第二份形状）；
  // run-role.ts 的 Fn 类型同样从契约家导入。
  const o1 = read("src/common/编排/watchdog.ts");
  // 行尾兼容：Windows 工作树（core.autocrlf）下源文件为 CRLF——结构断言允许 `\r?\n`。
  assert.ok(/export type \{\r?\n([\s\S]*?)\} from "\.\.\/\.\.\/model\/runtime\.ts";/.test(o1), "编排 watchdog.ts re-export 契约家符号");
  for (const sym of ["ProposeRecoveryFn", "RecoveryReceipt", "RoleStatusFn", "SessionTailFn", "WatchdogToolResult"]) {
    assert.ok(new RegExp(`export type \\{[\\s\\S]*?\\b${sym}\\b[\\s\\S]*?\\} from`).test(o1), `转发符号 ${sym}`);
    assert.ok(!new RegExp(`(interface|type) ${sym}\\b`).test(o1), `不得在编排另立第二份 ${sym}`);
  }
  const importBlocks = [...runRole.matchAll(/import type \{([\s\S]*?)\} from "([^"]+)";/g)].map((mm) => ({ syms: mm[1], from: mm[2] }));
  const contractImport = importBlocks.find((b) => /\bRoleStatusFn\b/.test(b.syms));
  assert.ok(contractImport, "run-role.ts 导入 RoleStatusFn");
  assert.equal(contractImport!.from, "../../model/runtime.ts", "Fn 类型来自契约家（非第二份形状）");
  for (const sym of ["SessionTailFn", "ProposeRecoveryFn"]) {
    assert.ok(new RegExp(`\\b${sym}\\b`).test(contractImport!.syms), `同一契约家导入块含 ${sym}`);
  }

  const session = read("app/desktop/session.ts");
  assert.ok(/\.\.\.\(proposeRecovery \? \{ proposeRecovery \} : \{\}\),/.test(session), "桌面注入 proposeRecovery（构造处）");
  assert.ok(/\.\.\.\(roleStatus \? \{ roleStatus \} : \{\}\),/.test(session), "桌面注入 roleStatus");
  assert.ok(/\.\.\.\(sessionTail \? \{ sessionTail \} : \{\}\),/.test(session), "桌面注入 sessionTail");
  // 2026-10-17（三权 V1，评审 §5.6）：判据由 `role.builtIn === true` 改为能力矩阵
  // `canSchedule = governanceFunction === "schedule" || legacyBuiltIn`；legacyBuiltIn 仅在
  // single 模型的内置角色（su）上成立——旧能力集逐字保留，trio 三人按职能分配。
  assert.ok(
    /const legacyBuiltIn = role\.builtIn === true && governanceFunction === undefined && governanceModel === "single";/.test(session),
    "legacyBuiltIn 判据（single/su 旧能力集）",
  );
  assert.ok(/const canSchedule = governanceFunction === "schedule" \|\| legacyBuiltIn;/.test(session), "canSchedule 判据");
  assert.ok(/canSchedule \? \(d: ProposeRecoveryPayload\) => this\.proposeRecovery\(/.test(session), "桌面 proposeRecovery 随 canSchedule");
  assert.ok(/canSchedule \? \(query: RoleStatusPayload\) => this\.roleStatusText\(/.test(session), "桌面 roleStatus 随 canSchedule");
  assert.ok(/canSchedule \? \(query: SessionTailPayload\) => this\.sessionTailText\(/.test(session), "桌面 sessionTail 随 canSchedule");
});

// ————————————————————— ③ 编排承载：真实 openRoleSession 桩适配器捕获 —————————————————————

function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-g2-freeze-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(path.join(dir, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 复验\n");
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:g2-verify" } },
  };
}

function capturingAdapter(events: SessionEvent[] = [{ kind: "settled", summary: "会话结束" }]): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    caps: () => captured,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                for (const e of events) yield e;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

test("G-2 契约③：openRoleSession——su 拿三能力原引用；项目角色即便误给也零注入；未给零注入", async () => {
  const project = makeTempProject();
  try {
    const roleStatus: RoleStatusFn = async () => ({ ok: true, text: "s" });
    const sessionTail: SessionTailFn = async () => ({ ok: true, text: "t" });
    const proposeRecovery: ProposeRecoveryFn = async () => ({ outcome: "declined" } as const);

    const su = capturingAdapter();
    const suHandle = await openRoleSession({ roleId: "su", project, roleStatus, sessionTail, proposeRecovery }, { createAdapter: su.createAdapter });
    assert.equal(su.caps()?.roleStatus, roleStatus, "su：roleStatus 原引用透传");
    assert.equal(su.caps()?.sessionTail, sessionTail, "su：sessionTail 原引用透传");
    assert.equal(su.caps()?.proposeRecovery, proposeRecovery, "su：proposeRecovery 原引用透传");
    await suHandle.dispose();

    const x = capturingAdapter();
    const xHandle = await openRoleSession({ roleId: "X", project, roleStatus, sessionTail, proposeRecovery }, { createAdapter: x.createAdapter });
    assert.equal(x.caps()?.roleStatus, undefined, "项目角色：零注入（roleStatus）");
    assert.equal(x.caps()?.sessionTail, undefined, "项目角色：零注入（sessionTail）");
    assert.equal(x.caps()?.proposeRecovery, undefined, "项目角色：零注入（proposeRecovery）");
    await xHandle.dispose();

    const bare = capturingAdapter();
    const bareHandle = await openRoleSession({ roleId: "su", project }, { createAdapter: bare.createAdapter });
    assert.equal(bare.caps()?.roleStatus, undefined, "未给能力：零注入（fail-closed）");
    assert.equal(bare.caps()?.sessionTail, undefined, "未给能力：零注入");
    assert.equal(bare.caps()?.proposeRecovery, undefined, "未给能力：零注入");
    await bareHandle.dispose();
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

// ————————————————————— ④ 桌面 → 编排 → 运行时核心：端到端（真实装配＋演示替身） —————————————————————

function demoProvider(work?: (call: (name: string, args: Record<string, unknown>) => Promise<ToolResult>) => Promise<void>): {
  factory: RuntimeProviderFactory;
  tools(): string[];
} {
  let captured: RuntimeProviderOptions | undefined;
  const factory: RuntimeProviderFactory = (options) => {
    captured = options;
    options.registerToolDisplayProfile?.({ credentials: [] });
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        let controller = new AbortController();
        return {
          runtime: options.runtime,
          get contextSource() {
            return "in-memory" as const;
          },
          async prompt(): Promise<void> {
            controller = new AbortController();
            // 工具必须**在本轮内**调用（服务层按 currentTurnId 守门）——沿真实适配器语义。
            if (work !== undefined) {
              await work(async (name, args) => {
                const tool = options.tools.find((t) => t.name === name);
                assert.ok(tool, `工具 ${name} 应已注册`);
                return tool!.handler({ name, args, toolCallId: name, signal: controller.signal });
              });
            }
          },
          events(): AsyncIterable<SessionEvent> {
            return (async function* () {
              yield { kind: "settled", summary: "引擎结算", detail: { outcome: "completed" } } as SessionEvent;
            })();
          },
          async dispose(): Promise<void> {},
        } satisfies RoleSession;
      },
    } satisfies RuntimeAdapter;
  };
  return {
    factory,
    tools: () => captured?.tools.map((t) => t.name) ?? [],
  };
}

test("G-2 契约④：桌面注入闭包经 真 openRoleSession＋真 createRuntimeAdapter 端到端连通（handler 直达 manager 数据面）", async () => {
  const h = await makeG2Harness();
  try {
    // 1) 桌面层：开 su 会话（fixture 捕获桌面传入 openRoleSession 的输入——含三能力闭包）。
    const opened = await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
    assert.equal(opened.ok, true, `su 会话应开：${opened.error ?? ""}`);
    await new Promise((r) => setTimeout(r, 40));
    const suInput = h.openedInputs.find((i) => i.roleId === "su");
    assert.ok(suInput, "应捕获桌面 openRoleSession 输入");
    assert.equal(typeof suInput!.roleStatus, "function", "输入带 roleStatus 闭包");
    assert.equal(typeof suInput!.sessionTail, "function", "输入带 sessionTail 闭包");
    assert.equal(typeof suInput!.proposeRecovery, "function", "输入带 proposeRecovery 闭包");

    // 2) 把桌面构建的输入对象原样交给真 openRoleSession（真 O1 → 真 createRuntimeAdapterFactory →
    //    真 createRuntimeAdapter → 真 buildGovernedTools）——只替换引擎为演示替身。
    const results: ToolResult[] = [];
    const provider = demoProvider(async (call) => {
      results.push(await call("role_status", {}));
      results.push(await call("session_tail", { roleId: "X", lines: 5 }));
      results.push(await call("propose_recovery", { roleId: "X", action: "abort-turn", evidence: "端到端证据" }));
    });
    const handle = await openRoleSession(suInput!, {
      runtimeOptions: { providerFactories: { demo: provider.factory }, persistSession: false },
    });
    const names = provider.tools();
    for (const n of ["role_status", "session_tail", "propose_recovery"]) assert.ok(names.includes(n), `端到端注册 ${n}`);
    await handle.send("看护自查");
    for await (const ev of handle.events()) if (ev.kind === "settled") break;

    assert.equal(results[0].ok, true, `role_status 经全链调用成功：${results[0].message}`);
    assert.ok(results[0].message.includes(h.root), `文本来自桌面 manager 数据面（应含项目根）：${results[0].message.slice(0, 80)}`);

    assert.equal(results[1].ok, false, "无会话历史应如实 ok:false（不抛、不猜）");
    assert.ok(/无会话历史|读取未完成|不存在/.test(results[1].message), `如实原因：${results[1].message.slice(0, 80)}`);

    assert.equal(results[2].ok, false, "通道未接线（fixture 未注入 recoveryConfirm）⇒ 未获执行");
    assert.ok(/未获执行|未获确认/.test(results[2].message), `fail-closed 如实：${results[2].message.slice(0, 120)}`);
    await handle.dispose();

    // 3) 项目角色会话：即便输入对象误带能力也不注册（只 su）。
    const xOpened = await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
    assert.equal(xOpened.ok, true);
    await new Promise((r) => setTimeout(r, 40));
    const xInput = h.openedInputs.find((i) => i.roleId === "X")!;
    assert.equal(xInput.roleStatus, undefined, "桌面注入面：X 零注入");
    const xProvider = demoProvider();
    const xHandle = await openRoleSession(xInput, { runtimeOptions: { providerFactories: { demo: xProvider.factory }, persistSession: false } });
    await xHandle.send("干活");
    for await (const ev of xHandle.events()) if (ev.kind === "settled") break;
    for (const n of ["role_status", "session_tail", "propose_recovery"]) {
      assert.ok(!xProvider.tools().includes(n), `项目角色不得注册 ${n}`);
    }
    await xHandle.dispose();
  } finally {
    await h.mgr.stop(null).catch(() => undefined);
    h.cleanup();
  }
});
