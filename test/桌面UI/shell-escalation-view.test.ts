// test/桌面UI/shell-escalation-view.test.ts
// 2026-10-31 shell 判拒升级卡渲染层（方案 v1.3 §4.6/§6.5(a)(e)/§7.1/§7.2/§9）：
// 审批/升级按 kind 路由、三按钮、necessityNote/customerNotJudgeNote、过期/重复回包、
// 暂停按钮/徽标/恢复、旧桥缺省降级（禁用并说明，不假造）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isShellEscalationPayload,
  judgePauseReplyResult,
  judgePauseState,
  shellConfirmKind,
  shellEscalationResponseOutcome,
  shellEscalationResponsePayload,
  shellEscalationView,
  shellJudgeResultView,
} from "../../app/renderer/src/chat/judge.ts";
import {
  ShellJudgeRowCard,
  applyJudgePausePayload,
  getJudgePauseSnapshot,
  installJudgePauseBridge,
  requestJudgePause,
  resetJudgePauseForTests,
  setJudgePauseSnapshot,
} from "../../app/renderer/src/chat/judge-row-view.ts";
import { createTranslator } from "../../app/renderer/src/i18n/index.ts";

const t = createTranslator("zh-CN");

const REPO = new URL("../../", import.meta.url);

function read(relative: string): string {
  return fs.readFileSync(new URL(relative, REPO), "utf8");
}

const escalationPayload = {
  version: 1,
  kind: "escalation",
  id: "se-1",
  requestId: "req-1",
  roleId: "A",
  projectRoot: "/proj",
  runtime: "claude",
  command: "npm install left-pad",
  argv: ["npm", "install", "left-pad"],
  argvLines: ['"npm"', '"install"', '"left-pad"'],
  cwd: "/proj",
  judgeReason: "安装新依赖",
  judgeCustomerMessage: "该命令会安装新依赖。",
  judgeAlternative: {
    kind: "command",
    value: "npm ci",
    rationale: "按锁文件安装",
  },
  necessity: "发布前需要该依赖",
  necessityNote: "由角色提供，未经验证",
  customerNotJudgeNote: "客户手批 ≠ judge 放行。",
  actions: ["allow-once", "allow-session", "deny"],
};

const shaA = "a".repeat(64);
const shaB = "b".repeat(64);
const shaC = "c".repeat(64);

// E2 R1：approvalContext（判拒时 judge 所依据的脚本上下文）载荷样本。
const contextPayload = {
  ...escalationPayload,
  id: "se-ctx-1",
  approvalContext: {
    npmScriptName: "test",
    note: "构建工具配置（有界读取）",
    scripts: [
      {
        path: "scripts/run.js",
        label: "run.js",
        content: "console.log('hi')",
        bytes: 17,
        sha256: shaA,
        inWriteArea: false,
      },
      {
        path: "test/a.test.ts",
        label: "a.test.ts",
        content: "test('a')",
        bytes: 9,
        sha256: shaB,
        inWriteArea: true,
      },
      {
        label: "node -e",
        content: "1+1",
        bytes: 3,
        sha256: shaC,
      },
    ],
  },
};

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function renderRow(view: NonNullable<ReturnType<typeof shellJudgeResultView>>): string {
  return renderToStaticMarkup(
    createElement(
      "div",
      { className: "chat-row sys shell-judge-row" },
      createElement(ShellJudgeRowCard, { view, t }),
    ),
  );
}

function denyView(): NonNullable<ReturnType<typeof shellJudgeResultView>> {
  const view = shellJudgeResultView({
    verdict: "deny",
    tier: "risky",
    summary: "安装依赖",
    reason: "安装新依赖",
    engine: "claude",
    command: "npm install left-pad",
  });
  assert.ok(view);
  return view!;
}

function allowView(): NonNullable<ReturnType<typeof shellJudgeResultView>> {
  const view = shellJudgeResultView({
    verdict: "allow",
    summary: "读取文件",
    engine: "claude",
    command: "cat README.md",
  });
  assert.ok(view);
  return view!;
}

test("kind 路由：escalation 走升级卡；无 kind / approval 走既有审批卡", () => {
  assert.equal(isShellEscalationPayload(escalationPayload), true);
  assert.equal(shellConfirmKind(escalationPayload), "escalation");
  assert.equal(shellConfirmKind({ id: "sc-1", allow: true }), "approval");
  assert.equal(shellConfirmKind({ id: "sc-1", kind: "approval" }), "approval");
  assert.equal(shellConfirmKind(null), "approval");
  assert.equal(shellEscalationView({ id: "sc-1", command: "x" }), null);
});

test("升级卡视图：命令逐字/argv/cwd/judge 事实/必要性标注/客户手批声明/固定三按钮", () => {
  const view = shellEscalationView(escalationPayload);
  assert.ok(view);
  assert.equal(view!.command, "npm install left-pad");
  assert.deepEqual(view!.argvLines, ['"npm"', '"install"', '"left-pad"']);
  assert.equal(view!.cwd, "/proj");
  assert.equal(view!.judgeReason, "安装新依赖");
  assert.ok(view!.judgeReasonLine.includes("判断理由：安装新依赖"));
  assert.equal(view!.judgeCustomerMessage, "该命令会安装新依赖。");
  assert.equal(view!.judgeAlternative, "替代方案：npm ci（按锁文件安装）");
  assert.equal(view!.necessity, "发布前需要该依赖");
  assert.equal(view!.necessityNote, "由角色提供，未经验证");
  assert.equal(view!.customerNotJudgeNote, "客户手批 ≠ judge 放行。");
  assert.equal(view!.requestId, "req-1");
  assert.deepEqual(
    view!.actions.map((action) => action.action),
    ["allow-once", "allow-session", "deny"],
  );
  assert.deepEqual(
    view!.actions.map((action) => action.label),
    ["允许一次", "本会话允许该精确命令", "拒绝"],
  );
  assert.ok(view!.note.includes("每会话只能申请一次"));
  assert.ok(view!.expiredHint.includes("未获允许"));
});

test("升级卡视图：旧/缺省字段如实降级；未知动作被过滤；necessity 原样保留", () => {
  const partial = shellEscalationView({
    kind: "escalation",
    id: "se-2",
    command: "<b>raw</b> command",
    argv: ["node", "x.js"],
    necessity: "<script>alert(1)</script>",
    actions: ["allow-session", "bogus"],
  });
  assert.ok(partial);
  // 纯视图不加工不可信文本（渲染由 React 转义）；缺 argvLines 时退回 argv。
  assert.equal(partial!.command, "<b>raw</b> command");
  assert.deepEqual(partial!.argvLines, ["node", "x.js"]);
  assert.equal(partial!.necessity, "<script>alert(1)</script>");
  // 缺省 necessityNote / customerNotJudgeNote ⇒ A3 固定文案（应用语义不变）。
  assert.equal(partial!.necessityNote, "由角色提供，未经验证");
  assert.ok(partial!.customerNotJudgeNote.includes("客户手批 ≠ judge 放行"));
  // 只呈现识别到的动作，未知动作不呈现。
  assert.deepEqual(
    partial!.actions.map((action) => action.action),
    ["allow-session"],
  );
  const noActions = shellEscalationView({ kind: "escalation", id: "se-3" });
  assert.deepEqual(
    noActions!.actions.map((action) => action.action),
    ["allow-once", "allow-session", "deny"],
  );
  // 旧卡无 approvalContext ⇒ 不产生上下文区块。
  assert.equal(partial!.approvalContext, null);
  assert.equal(noActions!.approvalContext, null);
});

// E2 返工 R1（2026-10-31）：升级卡「脚本上下文」摘要（approvalContext）。
test("脚本上下文：header/note/npm 脚本/路径/sha256/有界内容/写区外警示", () => {
  const view = shellEscalationView(contextPayload);
  assert.ok(view);
  const ctx = view!.approvalContext;
  assert.ok(ctx);
  assert.equal(ctx!.header, "脚本上下文（judge 判拒时所依据）");
  assert.equal(ctx!.noteLine, "说明：构建工具配置（有界读取）");
  assert.equal(ctx!.npmScriptLine, "npm 脚本：test");
  assert.equal(ctx!.scripts.length, 3);

  const first = ctx!.scripts[0];
  assert.equal(first.path, "scripts/run.js");
  assert.equal(first.pathLine, "脚本：scripts/run.js");
  assert.equal(first.shaLine, "sha256：" + shaA);
  assert.equal(first.sha256, shaA);
  assert.equal(first.content, "console.log('hi')");
  assert.equal(first.bytes, 17);
  assert.equal(first.inWriteArea, false);
  assert.equal(first.outsideWriteWarning, "目标路径未匹配任何边界或不在可写范围内");

  const second = ctx!.scripts[1];
  assert.equal(second.inWriteArea, true);
  assert.equal(second.outsideWriteWarning, "", "写区内不显示警示");

  // 内联脚本无 path ⇒ 用 label 作为可读标识；不伪造 sha/内容。
  const inline = ctx!.scripts[2];
  assert.equal(inline.path, "node -e");
  assert.equal(inline.pathLine, "脚本：node -e");
  assert.equal(inline.shaLine, "sha256：" + shaC);
});

test("脚本上下文：缺失/非法/空 approvalContext ⇒ 不渲染区块；非法条目被过滤", () => {
  const cases: unknown[] = [
    undefined,
    null,
    42,
    "context",
    {},
    [],
    { scripts: "nope" },
    { scripts: [{}, { path: "" }, { path: "x.js" }, { path: "y.js", sha256: "" }] },
  ];
  for (const value of cases) {
    const view = shellEscalationView({
      kind: "escalation",
      id: "se-bad-context",
      ...(value === undefined ? {} : { approvalContext: value }),
    });
    assert.ok(view);
    assert.equal(view!.approvalContext, null, JSON.stringify(value));
  }
  // 只有一个合法脚本 + 非法条目 ⇒ 只呈现合法条目。
  const mixed = shellEscalationView({
    kind: "escalation",
    id: "se-mixed",
    approvalContext: {
      scripts: [
        { path: "ok.js", content: "1", bytes: 1, sha256: shaA },
        { path: "", sha256: shaB },
        "junk",
      ],
    },
  });
  assert.ok(mixed?.approvalContext);
  assert.equal(mixed!.approvalContext!.scripts.length, 1);
  assert.equal(mixed!.approvalContext!.scripts[0].path, "ok.js");
  assert.equal(mixed!.approvalContext!.scripts[0].outsideWriteWarning, "");
});

test("升级回包：按 kind 构造 {id, action}；过期/未知/通道异常如实提示（不放行）", () => {
  assert.deepEqual(shellEscalationResponsePayload("se-1", "allow-once"), {
    kind: "escalation",
    id: "se-1",
    action: "allow-once",
  });
  assert.deepEqual(shellEscalationResponseOutcome({ ok: true }), {
    close: true,
    expired: false,
    hint: "",
  });
  const expired = shellEscalationResponseOutcome({ ok: false, expired: true });
  assert.equal(expired.close, true);
  assert.equal(expired.expired, true);
  assert.ok(expired.hint.includes("未获允许"));
  const broken = shellEscalationResponseOutcome(null);
  assert.equal(broken.close, true);
  assert.ok(broken.hint.includes("按 fail-closed 不放行"));
});

test("暂停视图：旧桥不可用 ⇒ action:none（禁用说明）；暂停后 resume；busy 只禁用", () => {
  assert.deepEqual(judgePauseState(null), {
    available: false,
    paused: false,
    busy: false,
    justPaused: false,
    failed: false,
    action: "none",
    error: "",
  });
  assert.equal(judgePauseState({ available: true }).action, "pause");
  const paused = judgePauseState({ available: true, paused: true, justPaused: true });
  assert.equal(paused.action, "resume");
  assert.equal(paused.paused, true);
  assert.equal(paused.justPaused, true);
  const busy = judgePauseState({ available: true, busy: true });
  assert.equal(busy.busy, true);
  assert.equal(busy.action, "pause");
});

test("暂停回包：ok 采信主进程值；失败保持原状态并保留错误", () => {
  assert.deepEqual(judgePauseReplyResult(false, { version: 1, ok: true, paused: true }), {
    ok: true,
    paused: true,
    error: "",
  });
  assert.deepEqual(
    judgePauseReplyResult(true, { version: 1, ok: false, paused: true, error: "拒绝来源" }),
    { ok: false, paused: true, error: "拒绝来源" },
  );
  // 失败回执带有效 paused 时采用主进程当前值；缺字段时保持原状态。
  assert.deepEqual(
    judgePauseReplyResult(false, { version: 1, ok: false, paused: true, error: "拒绝来源" }),
    { ok: false, paused: true, error: "拒绝来源" },
  );
  assert.deepEqual(judgePauseReplyResult(false, null), {
    ok: false,
    paused: false,
    error: "",
  });
});

test("判拒结果行：旧桥缺省 ⇒ 暂停按钮禁用 + 说明；allow 行不出现暂停控件", () => {
  resetJudgePauseForTests();
  const denyHtml = renderRow(denyView());
  assert.match(denyHtml, /class="sj-pause"/);
  assert.match(denyHtml, /class="sj-pause-btn" disabled=""/);
  assert.equal(visibleText(denyHtml).includes("本次运行暂停自动审批"), true);
  assert.equal(visibleText(denyHtml).includes("当前版本不支持自动判断，保持手动"), true);

  const allowHtml = renderRow(allowView());
  assert.equal(allowHtml.includes("sj-pause"), false);
  assert.equal(visibleText(allowHtml).includes("本次运行暂停自动审批"), false);
  resetJudgePauseForTests();
});

test("判拒结果行：可暂停 ⇒ 按钮；已暂停 ⇒ 徽标 + 恢复按钮；失败 ⇒ 错误行", () => {
  resetJudgePauseForTests();
  setJudgePauseSnapshot({ available: true });
  const idle = renderRow(denyView());
  assert.match(idle, /class="sj-pause-btn"/);
  assert.equal(visibleText(idle).includes("本次运行暂停自动审批"), true);

  setJudgePauseSnapshot({ paused: true, justPaused: true });
  const pausedHtml = renderRow(denyView());
  assert.match(pausedHtml, /class="sj-pause-badge"/);
  assert.equal(visibleText(pausedHtml).includes("本次运行已暂停自动审批"), true);
  assert.equal(visibleText(pausedHtml).includes("恢复自动审批"), true);
  assert.equal(visibleText(pausedHtml).includes("已暂停本次运行的 shell 自动审批"), true);

  setJudgePauseSnapshot({ paused: false, justPaused: false, failed: true, error: "通道异常" });
  const failedHtml = renderRow(denyView());
  assert.match(failedHtml, /class="sj-pause-note is-error">通道异常/);
  resetJudgePauseForTests();
});

test("暂停请求：走 setShellJudgePaused，采用主进程回包；失败/缺桥不假造", async () => {
  const scope = globalThis as { window?: unknown };
  const previous = scope.window;
  try {
    resetJudgePauseForTests();
    const calls: boolean[] = [];
    scope.window = {
      desktop: {
        setShellJudgePaused: async (paused: boolean) => {
          calls.push(paused);
          return { version: 1, ok: true, paused };
        },
      },
    };
    setJudgePauseSnapshot({ available: true });
    assert.equal(await requestJudgePause(true), true);
    assert.deepEqual(calls, [true]);
    const snapshot = getJudgePauseSnapshot();
    assert.equal(snapshot.paused, true);
    assert.equal(snapshot.justPaused, true);
    assert.equal(snapshot.failed, false);

    scope.window = {
      desktop: {
        setShellJudgePaused: async () => ({
          version: 1,
          ok: false,
          paused: true,
          error: "请求来源无效。",
        }),
      },
    };
    setJudgePauseSnapshot({ paused: true, justPaused: false });
    assert.equal(await requestJudgePause(false), false);
    const failed = getJudgePauseSnapshot();
    assert.equal(failed.paused, true, "失败保持主进程最后报告值");
    assert.equal(failed.failed, true);
    assert.equal(failed.error, "请求来源无效。");

    // 旧 preload 缺方法：available:false ⇒ 不发请求、不抛错、不显示假暂停态。
    resetJudgePauseForTests();
    scope.window = { desktop: {} };
    assert.equal(await requestJudgePause(true), false);
    assert.equal(getJudgePauseSnapshot().paused, false);
    assert.equal(getJudgePauseSnapshot().available, false);
  } finally {
    resetJudgePauseForTests();
    scope.window = previous;
  }
});

test("暂停接线：新桥探测 + 初始读取 paused；旧桥缺省 ⇒ 禁用；无 paused 字段不假造", async () => {
  const scope = globalThis as { window?: unknown };
  const previous = scope.window;
  try {
    resetJudgePauseForTests();
    let push: ((payload: unknown) => void) | null = null;
    scope.window = {
      desktop: {
        setShellJudgePaused: async () => ({ version: 1, ok: true, paused: true }),
        getShellJudgeState: async () => ({ version: 1, ok: true, enabled: true, paused: true }),
        onShellJudgeState: (callback: (payload: unknown) => void) => {
          push = callback;
          return () => undefined;
        },
      },
    };
    installJudgePauseBridge(
      (scope.window as { desktop: never }).desktop,
    );
    assert.equal(getJudgePauseSnapshot().available, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getJudgePauseSnapshot().paused, true);

    // 推送更新；旧形态载荷（无 paused）不改变状态。
    push!({ version: 1, enabled: true, paused: false });
    assert.equal(getJudgePauseSnapshot().paused, false);
    push!({ version: 1, enabled: true });
    assert.equal(getJudgePauseSnapshot().paused, false);
    applyJudgePausePayload({ version: 1, paused: "yes" });
    assert.equal(getJudgePauseSnapshot().paused, false);

    resetJudgePauseForTests();
    scope.window = { desktop: { getShellJudgeState: async () => ({}) } };
    installJudgePauseBridge(
      (scope.window as { desktop: never }).desktop,
    );
    assert.equal(getJudgePauseSnapshot().available, false);
    assert.equal(getJudgePauseSnapshot().paused, false);
  } finally {
    resetJudgePauseForTests();
    scope.window = previous;
  }
});

test("渲染接线源码守卫：升级卡 DOM 合同 / store 按 kind 路由 / preload 桥类型", () => {
  const card = read("app/renderer/src/shell/ConfirmCard.tsx");
  assert.ok(card.includes('id="shell-escalation"'));
  assert.ok(card.includes("shellEscalationView("));
  assert.ok(card.includes('id="se-command"'));
  assert.ok(card.includes('id="se-reject"'));
  assert.ok(card.includes('"se-" + action.action'));
  assert.ok(card.includes('id="se-necessity-note"'));
  assert.ok(card.includes('id="se-customer-note"'));
  assert.ok(card.includes('id="se-pause"'));
  // E2 R1：脚本上下文区块（approvalContext；缺失时整块不渲染）。
  assert.ok(card.includes('id="se-context"'));
  assert.ok(card.includes("view.approvalContext"));
  assert.ok(card.includes('id="se-context-note"'));
  assert.ok(card.includes('id="se-context-npm-script"'));
  assert.ok(card.includes("se-context-warning"));
  assert.ok(card.includes("se-context-content"));
  assert.ok(card.includes("data-bytes={script.bytes}"));
  assert.ok(card.includes("shellConfirmKind(shellCard.payload)"));
  assert.ok(card.includes('respondEscalation("deny")'));

  const store = read("app/renderer/src/stores/confirm-store.ts");
  assert.ok(store.includes("shellConfirmKind(payload)"));
  assert.ok(store.includes("shellEscalationRespond("));
  assert.ok(store.includes("shellEscalationResponsePayload("));
  assert.ok(store.includes('shellConfirmKind(cur.payload) === "escalation"'));

  const platform = read("app/renderer/src/lib/platform.ts");
  assert.ok(platform.includes("shellEscalationRespond?"));
  assert.ok(platform.includes("setShellJudgePaused?"));
  assert.ok(platform.includes("paused?: boolean"));

  const ipc = read("app/renderer/src/chat/ipc.ts");
  assert.ok(ipc.includes("installJudgePauseBridge(bridge)"));
  assert.ok(ipc.includes("shellConfirmKind(current.payload) !== shellConfirmKind(payload)"));
});
