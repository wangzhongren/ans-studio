// test/编排/session-handle.test.ts
// 会话句柄式接口（openRoleSession）测试：
//   - 多轮：同一会话 send 两次都生效，且底层会话**只建一次**（bindRole 调用 1 次）；
//   - 收口：结束时 dispose 被调用，且 dispose 幂等；
//   - scope 可选：无 scope = 只用角色边界（不做任务收窄），有 scope 才做 F4 收窄——原样透传 resolveWrite；
//   - 失败即抛错（未知角色）；
//   - su 预授权（客户裁定 2026-10-16）：docs/su/**、docs/contracts/** 与 docs/skills/**
//     （第三棵＝G-4 角色能力安装 V1 裁定扩列）与 docs/mcp/**（第四棵＝G-4 V2 裁定扩列，
//     2026-10-16 批准）属**初始 writeSet**——确认制下开局即可写（免确认，含子路径/绝对路径）、
//     会话重建后仍可写；su 边界内其余路径（docs/ 其它、角色卡/ …）未确认仍被 F4 拒。
//   - Section 1 写入预授权（客户 2026-10-25）按**各角色自己的边界**生效：项目角色边界内直接放行，
//     边界外照拒；任务 writeSet 收窄时不扩张——详见 section1-write-preauthorization.test.ts。
// 全程用桩适配器，不触网。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import type {
  BackgroundTaskReadOptions,
  BackgroundTaskReadResult,
  BackgroundTaskSnapshot,
  BackgroundTaskStopOptions,
  BackgroundTaskStopResult,
} from "../../src/model/runtime.ts";
import type { CustomerInputFn, RuntimeAdapter, RoleSession, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import {
  openRoleSession,
  runRole,
  REBUILT_SESSION_WRITE_PERMITS_NOTICE,
} from "../../src/pipeline/orchestration/run-role.ts";
import { EXIT_USAGE } from "../../src/common/编排/exit-codes.ts";

// —— 夹具：临时项目（角色 X + 边界条目 src/thing.ts）——
function makeTempProject(entryPath = "src/thing.ts"): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-handle-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    `role: X\nentries:\n  - kind: file\n    path: ${entryPath}\n    purpose: 测试条目\n`
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:fixture" },
    },
  };
}

// —— 桩：记录 bindRole/send/dispose 次数，并捕获 gate ——
interface ProbeState {
  binds: number;
  sends: number;
  disposes: number;
  gate?: WriteGate;
}
function makeDeps(): { deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }; state: ProbeState } {
  const state: ProbeState = { binds: 0, sends: 0, disposes: 0 };
  const session: RoleSession = {
    async prompt(): Promise<void> {
      state.sends += 1;
    },
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        /* 桩不产出事件 */
      })();
    },
    async dispose(): Promise<void> {
      state.disposes += 1;
    },
  };
  const adapter: RuntimeAdapter = {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
      state.binds += 1;
      return session; // 底层同一会话对象
    },
  };
  const createAdapter = (gate: WriteGate): RuntimeAdapter => {
    state.gate = gate;
    return adapter;
  };
  return { deps: { createAdapter }, state };
}

const scopeX = (): TaskScope => ({ writeSet: ["src/thing.ts"], conditions: [] });
const cleanup = (p: ProjectConfig): void => fs.rmSync(p.projectRoot, { recursive: true, force: true });

test("openRoleSession：send 两次都生效，底层会话只建一次，dispose 收口且幂等", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps();
  try {
    const handle = await openRoleSession({ roleId: "X", project, taskId: "T-1", scope: scopeX() }, deps);
    await handle.send("第一轮");
    await handle.send("第二轮");
    assert.equal(state.sends, 2); // 两轮都送到同一会话
    assert.equal(state.binds, 1); // 会话只创建一次，不按轮重建

    await handle.dispose();
    assert.equal(state.disposes, 1);
    await handle.dispose(); // 幂等
    assert.equal(state.disposes, 1);
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：未知角色 → 抛错（句柄式接口无退出码）", async () => {
  const project = makeTempProject();
  const { deps } = makeDeps();
  try {
    await assert.rejects(
      openRoleSession({ roleId: "不存在的角色", project, scope: scopeX() }, deps),
      /未知角色/
    );
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：scope 可选——无 scope 仅按角色边界（允许），有 scope 才做 F4 收窄", async () => {
  const project = makeTempProject("src/thing.ts");
  try {
    // 无 scope：src/thing.ts 命中边界条目 → 允许（不做任务收窄）。
    const a = makeDeps();
    await openRoleSession({ roleId: "X", project }, a.deps);
    const noScope = a.state.gate!("src/thing.ts");
    assert.equal(noScope.allowed, true);

    // 有 scope 且不在 writeSet：同一边界内路径 → F4 收窄拒绝。
    const b = makeDeps();
    await openRoleSession(
      { roleId: "X", project, scope: { writeSet: ["src/other.ts"], conditions: [] } },
      b.deps
    );
    const withScope = b.state.gate!("src/thing.ts");
    assert.equal(withScope.allowed, false);
    assert.match((withScope as { reason: string }).reason, /不在任务 writeSet 内/);
  } finally {
    cleanup(project);
  }
});

// —— 内置治理角色（project.builtInRoles）入口意图约束 ——
// 会话式入口（openRoleSession）允许开启配置声明的内置治理角色；一次性 CLI（runRole）绝不放宽。

test("openRoleSession：project.builtInRoles 声明 su → 内置角色可开（不抛错，建会话一次）", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  const { deps, state } = makeDeps();
  try {
    await openRoleSession({ roleId: "su", project }, deps);
    assert.equal(state.binds, 1);
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：未声明 builtInRoles → 同 roleId 被拒（未知角色）", async () => {
  const project = makeTempProject(); // 不设 builtInRoles
  const { deps } = makeDeps();
  try {
    await assert.rejects(openRoleSession({ roleId: "su", project }, deps), /未知角色/);
  } finally {
    cleanup(project);
  }
});

test("runRole：即便配置声明了 builtInRoles，CLI 一次性路径仍拒绝内置角色（EXIT_USAGE）", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  const { deps } = makeDeps();
  try {
    const res = await runRole({ roleId: "su", taskId: "T-1", project }, deps);
    assert.notEqual(res.code, 0);
    assert.equal(res.code, EXIT_USAGE);
  } finally {
    cleanup(project);
  }
});

// —— F-5-opt1（编排侧）：模型可见注记注入渠道（重建后写权清零的如实告知） ——

/** 记录 prompt 原文的桩会话（可注一次性失败）。 */
function makeTextCapturingDeps(): {
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter };
  sentTexts: string[];
  failNext: { value: boolean };
} {
  const sentTexts: string[] = [];
  const failNext = { value: false };
  const session: RoleSession = {
    async prompt(text: string): Promise<void> {
      if (failNext.value) {
        failNext.value = false;
        throw new Error("传输失败");
      }
      sentTexts.push(text);
    },
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        /* 桩不产出事件 */
      })();
    },
    async dispose(): Promise<void> {},
  };
  return {
    sentTexts,
    failNext,
    deps: { createAdapter: () => ({ async composeContext() { return { systemPrompt: "" }; }, async bindRole() { return session; } }) },
  };
}

test("F-5-opt1：queueModelNotice 的注记作为**下一轮输入前缀**送达并消费一次；失败且未开轮则保留；空串忽略", async () => {
  const project = makeTempProject();
  const { deps, sentTexts } = makeTextCapturingDeps();
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    assert.equal(typeof handle.queueModelNotice, "function", "openRoleSession 句柄恒实现本方法（同 abort? 先例）");

    const notice = REBUILT_SESSION_WRITE_PERMITS_NOTICE;
    assert.match(notice, /^【系统通知·会话重建】/, "notice 以系统标记开头——系统注入的 notice，不是角色/客户发言");
    assert.match(notice, /写权不会自动保留/, "文案如实说明写权清零");
    assert.match(notice, /request_confirmation/, "指向可行恢复路径");

    handle.queueModelNotice!(notice);
    await handle.send("客户消息一");
    assert.equal(sentTexts.length, 1, "注记不单独开轮（只随下一轮输入送达）");
    assert.equal(sentTexts[0], `${notice}\n\n客户消息一`, "注记作为输入前缀随下一轮送达");

    await handle.send("客户消息二");
    assert.equal(sentTexts[1], "客户消息二", "送达一次即消费（不重复注入）");

    handle.queueModelNotice!("   ");
    await handle.send("客户消息三");
    assert.equal(sentTexts[2], "客户消息三", "空串/空白忽略（不做一半的事）");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("F-5-opt1：该轮 prompt 失败且未开轮（无 ACK）→ 注记保留，下一轮重试仍带上", async () => {
  const project = makeTempProject();
  const { deps, sentTexts, failNext } = makeTextCapturingDeps();
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    handle.queueModelNotice!(REBUILT_SESSION_WRITE_PERMITS_NOTICE);
    failNext.value = true;
    await assert.rejects(handle.send("第一条"), /传输失败/);
    await handle.send("第二条");
    assert.equal(sentTexts.length, 1);
    assert.equal(
      sentTexts[0],
      `${REBUILT_SESSION_WRITE_PERMITS_NOTICE}\n\n第二条`,
      "未送达模型（未开轮）→ 注记不丢，随重试轮带上",
    );
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

// —— su 预授权写目录（客户裁定 2026-10-16）：docs/su/** + docs/contracts/** + docs/skills/** + docs/mcp/** ——
// 客户裁定原文：①「这个 su 可以写 docs/su 的目录，不需要我审批」；②「还有个契约目录也可以给他写。」
// ③ G-4（角色能力安装）V1 十项裁定全采纳（2026-10-16 批准；§4.6 候选 1）＝扩列 `docs/skills/**`
// （技能文档树：install.md 登记 + SKILL.md 内容；安装＝先落盘再激活，无卡口径要求落盘在初始写集内）。
// ④ G-4 V2（MCP 安装）客户 2026-10-16「按推荐批准，开始实施」＝V1 裁定①「V2 再议」落点＝扩列
// `docs/mcp/**`（MCP 声明树：`docs/mcp/<name>.md`；落盘同「先落盘再激活」口径；提案 §九 V2 范围①）。
// 语义（本组钉死）：内置治理角色（su）会话的**初始 writeSet 恒含**这四棵目录树（项目根、含子路径）
// ——不依赖 request_confirmation 发行；每次开会话/会话重建都生效。严格范围：仅 su、仅这四棵树；
// 其余路径（docs/ 其它子路径、角色卡/、.ans/ …）与其它角色照旧走确认（未确认 = F4 拒）。

/** su 创世态 project：roles 空 + builtInRoles 声明 su + genesisBootstrap
 *  （种子边界 = 普通目录 角色卡//docs//.ans/，acceptance 已接受）。 */
function makeSuProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-su-preauth-"));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    builtInRoles: ["su"],
    governanceBoundary: { path: "", acceptance: { accepted: true, source: "test:su-preauth" } },
    genesisBootstrap: { source: "test:有界创世（su 预授权测试）" },
  };
}

/** 恒拒客户通道（本组用例中**不应被调用**——预授权不经确认发行）。 */
function decliningChannel(calls: { n: number }): CustomerInputFn {
  return () => {
    calls.n += 1;
    return { outcome: "declined" };
  };
}

test("su 预授权：确认制会话开局即可写 docs/su/**、docs/contracts/**、docs/skills/** 与 docs/mcp/**（含子路径/绝对路径），零确认", async () => {
  const project = makeSuProject();
  const { deps, state } = makeDeps();
  const calls = { n: 0 };
  try {
    await openRoleSession({ roleId: "su", project, customerInput: decliningChannel(calls) }, deps);
    assert.ok(state.gate, "应构建出 gate");
    // 全组零 request_confirmation：发行器从未运行（issued 恒空）——放行只可能来自**预授权**（初始集合）。
    assert.equal(calls.n, 0, "预授权写入不应发起任何客户确认");
    assert.equal(state.gate!("docs/su/memo.md").allowed, true, "docs/su/memo.md 免确认可写");
    assert.equal(state.gate!("docs/su/changelog.md").allowed, true);
    assert.equal(state.gate!("docs/su/notes/2026-10-16.md").allowed, true, "含子路径");
    assert.equal(
      state.gate!(path.join(project.projectRoot, "docs", "su", "memo.md")).allowed,
      true,
      "绝对路径同口径（项目根内）",
    );
    assert.equal(state.gate!("docs/contracts/api-v1.md").allowed, true, "docs/contracts/** 免确认可写（客户裁定追加）");
    assert.equal(state.gate!("docs/contracts/sub/deep.md").allowed, true, "含子路径");
    assert.equal(state.gate!("docs/skills/my-skill/install.md").allowed, true, "docs/skills/** 免确认可写（G-4 裁定扩列）");
    assert.equal(state.gate!("docs/skills/my-skill/SKILL.md").allowed, true, "含子路径（技能内容文件同口径）");
    assert.equal(state.gate!("docs/mcp/echo.md").allowed, true, "docs/mcp/** 免确认可写（G-4 V2 裁定扩列）");
    assert.equal(state.gate!("docs/mcp/sub/deep.md").allowed, true, "含子路径（MCP 声明树同口径）");
    assert.equal(
      state.gate!(path.join(project.projectRoot, "docs", "mcp", "echo.md")).allowed,
      true,
      "绝对路径同口径（第四棵）",
    );
  } finally {
    cleanup(project);
  }
});

test("su 预授权严格边界：docs/ 其它路径与 角色卡/ 仍走确认（未确认 = F4 拒）；相近前缀不算覆盖；边界外照拒", async () => {
  const project = makeSuProject();
  const { deps, state } = makeDeps();
  const calls = { n: 0 };
  try {
    await openRoleSession({ roleId: "su", project, customerInput: decliningChannel(calls) }, deps);
    assert.equal(calls.n, 0);
    const other = state.gate!("docs/other.md");
    assert.equal(other.allowed, false, "docs/ 其它子路径不预授权");
    assert.match((other as { reason: string }).reason, /不在任务 writeSet 内/, "拒绝理由 = F4（在边界内、不在 writeSet）");
    assert.equal(state.gate!("docs/su2/x.md").allowed, false, "docs/su2 不被 docs/su 覆盖（按段比较，非字符串前缀）");
    assert.equal(state.gate!("docs/contracts2/x.md").allowed, false);
    assert.equal(state.gate!("docs/skills2/x.md").allowed, false, "docs/skills2 不被 docs/skills 覆盖");
    assert.equal(state.gate!("docs/mcp2/x.md").allowed, false, "docs/mcp2 不被 docs/mcp 覆盖（按段比较）");
    const card = state.gate!("角色卡/Y/role-card.md");
    assert.equal(card.allowed, false, "角色卡/ 不预授权");
    assert.match((card as { reason: string }).reason, /不在任务 writeSet 内/);
    assert.equal(state.gate!("src/evil.ts").allowed, false, "边界外（src/）照拒——预授权不放松边界本身");
    assert.equal(state.gate!("").allowed, false, "空路径照拒");
  } finally {
    cleanup(project);
  }
});

test("项目角色按自己的 Section 1 预授权（不借用 su 四棵）：边界内直接放行、边界外照拒", async () => {
  // 2026-10-25 客户规则：「写自己角色权限内的路径，直接放行。」项目角色无任务收窄时，其边界条目
  // 就是初始可写集——不再需要 request_confirmation 逐路径发行；边界外仍然拒绝。
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-docsrole-"));
  // X 的边界覆盖 docs/：docs/su/** 等路径属 X 自己的 Section 1 ⇒ 直接放行。
  const dirX = path.join(root, "角色卡", "X");
  fs.mkdirSync(dirX, { recursive: true });
  fs.writeFileSync(path.join(dirX, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dirX, "boundary.yaml"),
    `role: X\nentries:\n  - kind: directory\n    path: docs/\n    purpose: 测试：docs 目录\n`
  );
  // Y 的边界只覆盖 src/：docs/su/** 不在其 Section 1 ⇒ 不因 su 的旧预授权目录而被放行。
  const dirY = path.join(root, "角色卡", "Y");
  fs.mkdirSync(dirY, { recursive: true });
  fs.writeFileSync(path.join(dirY, "role-card.md"), "# 角色 Y\n");
  fs.writeFileSync(
    path.join(dirY, "boundary.yaml"),
    `role: Y\nentries:\n  - kind: directory\n    path: src/\n    purpose: 测试：src 目录\n`
  );
  const project: ProjectConfig = {
    projectRoot: root,
    skillRoot: root,
    roles: {
      X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" },
      Y: { card: "角色卡/Y/role-card.md", boundary: "角色卡/Y/boundary.yaml" },
    },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
  const calls = { n: 0 };
  try {
    const { deps, state } = makeDeps();
    await openRoleSession({ roleId: "X", project, customerInput: decliningChannel(calls) }, deps);
    assert.equal(calls.n, 0, "Section 1 写入无需请求确认");
    assert.equal(state.gate!("docs/su/memo.md").allowed, true, "X 的 Section 1（docs/）直接放行");
    assert.equal(state.gate!("docs/contracts/x.md").allowed, true);
    assert.equal(state.gate!("docs/sub/deep.md").allowed, true, "目录条目含子路径");
    assert.equal(state.gate!("src/evil.ts").allowed, false, "X 边界外照拒（预授权不扩大边界）");

    const y = makeDeps();
    await openRoleSession({ roleId: "Y", project, customerInput: decliningChannel(calls) }, y.deps);
    assert.equal(y.state.gate!("src/ok.ts").allowed, true, "Y 的 Section 1 直接放行");
    assert.equal(y.state.gate!("docs/su/memo.md").allowed, false, "su 的旧预授权目录不泄漏给其他角色");
  } finally {
    cleanup(project);
  }
});

test("su 静态 scope 会话同口径：预授权树并入初始 writeSet（scope 内照常、树外仍 F4 拒）", async () => {
  const project = makeSuProject();
  const { deps, state } = makeDeps();
  try {
    // 无 customerInput ⇒ 非确认制（静态 scope 路径——直接调用治理引擎的形态）。
    await openRoleSession(
      { roleId: "su", project, scope: { writeSet: ["角色卡/A/role-card.md"], conditions: [] } },
      deps,
    );
    assert.equal(state.gate!("角色卡/A/role-card.md").allowed, true, "scope 内照常放行（逐字现状）");
    assert.equal(state.gate!("docs/su/memo.md").allowed, true, "预授权树并进初始 writeSet");
    assert.equal(state.gate!("docs/contracts/x.md").allowed, true);
    assert.equal(state.gate!("docs/skills/t/install.md").allowed, true);
    assert.equal(state.gate!("docs/mcp/echo.md").allowed, true, "第四棵同口径并入初始 writeSet");
    const other = state.gate!("docs/other.md");
    assert.equal(other.allowed, false, "其余路径仍受 F4 收窄");
    assert.match((other as { reason: string }).reason, /不在任务 writeSet 内/);
    assert.equal(state.gate!("角色卡/B/role-card.md").allowed, false, "scope 外的角色卡路径照旧被拒");
  } finally {
    cleanup(project);
  }
});

test("会话重建（新开会话）后预授权仍然生效——初始集合的一部分，不依赖发行器/前一句柄", async () => {
  const project = makeSuProject();
  const first = makeDeps();
  const rebuilt = makeDeps();
  const calls = { n: 0 };
  try {
    const h1 = await openRoleSession({ roleId: "su", project, customerInput: decliningChannel(calls) }, first.deps);
    assert.equal(first.state.gate!("docs/su/memo.md").allowed, true, "首个会话即可写");
    await h1.dispose();
    // 重建 = 桌面 O-1 路径：旧句柄作废、按新边界**重开**一次会话（同一项目再开即此形态）。
    const h2 = await openRoleSession({ roleId: "su", project, customerInput: decliningChannel(calls) }, rebuilt.deps);
    assert.equal(rebuilt.state.gate!("docs/su/memo.md").allowed, true, "重建后仍可写（属初始集合，不随句柄丢失）");
    assert.equal(rebuilt.state.gate!("docs/contracts/y.md").allowed, true);
    assert.equal(rebuilt.state.gate!("docs/skills/t/SKILL.md").allowed, true, "第三棵目录树同口径（G-4 扩列）");
    assert.equal(rebuilt.state.gate!("docs/mcp/echo.md").allowed, true, "第四棵目录树同口径（G-4 V2 扩列）");
    assert.equal(rebuilt.state.gate!("docs/other.md").allowed, false, "重建后其余路径照旧：发行为空、F4 拒");
    assert.equal(calls.n, 0, "全程未发起任何客户确认");
    await h2.dispose();
  } finally {
    cleanup(project);
  }
});

// —— 会话级后台任务访问面（2026-10-25）：编排句柄对 RoleSession 三个可选方法的**纯透传** ——
// 契约来源 `src/model/runtime.ts` 的 `RoleSession.listBackgroundTasks?/readBackgroundTask?/stopBackgroundTask?`：
// 底层实现 ⇒ 同名同签名原样转发（结果不重造）；底层缺席 ⇒ 句柄属性保持 undefined（不伪造空实现）；
// stop 的 `ok:false`（如 unknown-task）与抛错原样返回（不吞失败语义）。

const taskSnapshot = (
  taskId: string,
  state: BackgroundTaskSnapshot["state"] = "running",
): BackgroundTaskSnapshot => ({
  taskId,
  state,
  command: 'node -e "setInterval(() => {}, 1000)"',
  startedAt: "2026-10-25T00:00:00.000Z",
  durationMs: 1234,
  pid: 4242,
});

interface BackgroundProbe {
  lists: number;
  reads: Array<{ taskId: string; options?: BackgroundTaskReadOptions }>;
  stops: Array<{ taskId: string; options?: BackgroundTaskStopOptions }>;
}

/** 实现后台任务三方法的桩会话：记录 list/read/stop 的调用与参数，结果引用可断言。 */
function makeBackgroundDeps(
  stopImpl: (taskId: string, options?: BackgroundTaskStopOptions) => Promise<BackgroundTaskStopResult>,
): {
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter };
  probe: BackgroundProbe;
  tasks: BackgroundTaskSnapshot[];
  readResult: BackgroundTaskReadResult;
} {
  const probe: BackgroundProbe = { lists: 0, reads: [], stops: [] };
  const tasks = [taskSnapshot("bg-1")];
  const readResult: BackgroundTaskReadResult = {
    task: tasks[0]!,
    tailLines: 3,
    tailClamped: true,
    stdout: { text: "out", truncated: false },
  };
  const session: RoleSession = {
    async prompt(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        /* 桩不产出事件 */
      })();
    },
    async dispose(): Promise<void> {},
    listBackgroundTasks(): BackgroundTaskSnapshot[] {
      probe.lists += 1;
      return tasks;
    },
    readBackgroundTask(taskId: string, options?: BackgroundTaskReadOptions): BackgroundTaskReadResult | undefined {
      probe.reads.push(options === undefined ? { taskId } : { taskId, options });
      return taskId === "bg-1" ? readResult : undefined;
    },
    stopBackgroundTask(taskId: string, options?: BackgroundTaskStopOptions): Promise<BackgroundTaskStopResult> {
      probe.stops.push(options === undefined ? { taskId } : { taskId, options });
      return stopImpl(taskId, options);
    },
  };
  return {
    probe,
    tasks,
    readResult,
    deps: {
      createAdapter: () => ({
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole() {
          return session;
        },
      }),
    },
  };
}

test("openRoleSession：底层实现后台任务三方法 → 句柄原样透传 list/read/stop（结果不重造）", async () => {
  const project = makeTempProject();
  const stopResult: BackgroundTaskStopResult = {
    ok: true,
    task: taskSnapshot("bg-1", "stopped"),
    alreadyEnded: false,
  };
  const { deps, probe, tasks, readResult } = makeBackgroundDeps(async () => stopResult);
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    assert.equal(typeof handle.listBackgroundTasks, "function", "底层实现 ⇒ 句柄具备 listBackgroundTasks");
    assert.equal(handle.listBackgroundTasks!(), tasks, "list 原样返回底层快照数组（同一引用，不复制/不重造）");
    assert.equal(probe.lists, 1);

    const read = handle.readBackgroundTask!("bg-1", { stream: "stdout", tailLines: 3 });
    assert.equal(read, readResult, "read 原样返回底层结果对象（同一引用）");
    assert.deepEqual(
      probe.reads[0],
      { taskId: "bg-1", options: { stream: "stdout", tailLines: 3 } },
      "taskId/options 原样转发",
    );
    assert.equal(handle.readBackgroundTask!("bg-x"), undefined, "底层对未知任务返回 undefined ⇒ 句柄如实保留 undefined");
    assert.deepEqual(probe.reads[1], { taskId: "bg-x" }, "缺省 options 不额外伪造");

    const stopped = await handle.stopBackgroundTask!("bg-1", { force: true });
    assert.equal(stopped, stopResult, "stop 原样返回底层结果对象");
    assert.deepEqual(probe.stops[0], { taskId: "bg-1", options: { force: true } }, "stop 参数原样转发");
    await handle.stopBackgroundTask!("bg-1");
    assert.deepEqual(probe.stops[1], { taskId: "bg-1" }, "缺省 options 不额外伪造");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：底层未实现后台任务三方法 → 句柄对应属性保持 undefined（不伪造空实现）", async () => {
  const project = makeTempProject();
  const { deps } = makeDeps(); // 旧替身：只有 prompt/events/dispose，不实现三个可选方法
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    assert.equal(handle.listBackgroundTasks, undefined, "listBackgroundTasks 保持缺席（不是空数组）");
    assert.equal(handle.readBackgroundTask, undefined, "readBackgroundTask 保持缺席（不是恒 undefined 的函数）");
    assert.equal(handle.stopBackgroundTask, undefined, "stopBackgroundTask 保持缺席（不是伪造失败结果的函数）");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：stop 的 ok:false（unknown-task）与抛错原样返回——不吞失败语义", async () => {
  const project = makeTempProject();
  const unknown: BackgroundTaskStopResult = { ok: false, reason: "unknown-task", message: "未知任务：bg-404" };
  const thrown = new Error("终止失败：SIGKILL 不可用");
  const { deps } = makeBackgroundDeps(async () => unknown);
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    const result = await handle.stopBackgroundTask!("bg-404");
    assert.equal(result, unknown, "ok:false 结果对象原样返回（同一引用，不改写 reason/message）");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unknown-task");
    await handle.dispose();

    // 底层直接 reject ⇒ 句柄不 catch、不把抛错改写成失败结果（同一错误对象向上传播）。
    const rejecting = makeBackgroundDeps(async () => {
      throw thrown;
    });
    const handle2 = await openRoleSession({ roleId: "X", project }, rejecting.deps);
    await assert.rejects(handle2.stopBackgroundTask!("bg-1"), (err) => err === thrown);
    await handle2.dispose();
  } finally {
    cleanup(project);
  }
});
