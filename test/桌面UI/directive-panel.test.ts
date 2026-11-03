// test/桌面UI/directive-panel.test.ts
// 客户授权平面 C2：指令面板分组/状态/消费者/期限提示 / 列表冻结载荷窄化 /
// store 的 IPC 消费（handshake/初始读/确认/撤销/项目切换/卡内入口）/ 面板源码守卫。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  asDirectiveListReply,
  asDirectiveListView,
  cardEntryFor,
  consumerLabelKey,
  directiveRowView,
  emptyDirectiveList,
  groupDirectiveList,
  isDirectiveOverlayOpen,
  statusLabelKey,
  untilHintKey,
  untilLabelKey,
  useDirectiveStore,
  type DirectiveItemView,
  type DirectiveListView,
} from "../../app/renderer/src/stores/directive-store.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const RESOURCE = { type: "shell", command: "npm test", cwd: "/proj" } as const;

function item(over: Partial<DirectiveItemView> = {}): DirectiveItemView {
  return {
    id: "d-1",
    target: "approval",
    action: { kind: "allow", resource: RESOURCE },
    scope: {},
    until: "once",
    status: "active",
    createdAt: "2026-11-03T00:00:00.000Z",
    consumer: "shell-gate",
    ...over,
  };
}

function listOf(over: Partial<DirectiveListView> = {}): DirectiveListView {
  return { ...emptyDirectiveList(), ...over };
}

function stateOf(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    directivesEnabled: true,
    projectRoot: "/proj",
    approval: listOf({ active: [item()] }),
    decision: listOf(),
    ledgerErrors: 0,
    ...over,
  };
}

function requestOf(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    request: {
      id: "req-1",
      target: "approval",
      rawText: "@审批 允许 npm test",
      projectRoot: "/proj",
      roleId: "A",
      runtime: "claude",
      prefill: {
        action: { kind: "allow", resource: RESOURCE },
        scope: {},
        until: "once",
        unrecognized: [],
      },
      highRisk: { reasons: ["forever"] },
      confirmable: true,
      decisionGroupEnabled: false,
      ...over,
    },
  };
}

interface FakeBridge {
  calls: {
    list: unknown[];
    revoke: unknown[];
    respond: unknown[];
  };
  onDirectiveConfirmRequest: (callback: (payload: unknown) => void) => () => void;
  onDirectiveState: (callback: (payload: unknown) => void) => () => void;
  directiveConfirmRespond: (input: unknown) => Promise<unknown>;
  listDirectives: (input: unknown) => Promise<unknown>;
  revokeDirective: (input: unknown) => Promise<unknown>;
}

function fakeBridge(options: {
  list?: (input: unknown) => Promise<unknown>;
  revoke?: (input: unknown) => Promise<unknown>;
  respond?: (input: unknown) => Promise<unknown>;
} = {}): FakeBridge {
  const calls: FakeBridge["calls"] = { list: [], revoke: [], respond: [] };
  return {
    calls,
    onDirectiveConfirmRequest: () => () => undefined,
    onDirectiveState: () => () => undefined,
    directiveConfirmRespond: async (input) => {
      calls.respond.push(input);
      return options.respond ? options.respond(input) : { ok: true };
    },
    listDirectives: async (input) => {
      calls.list.push(input);
      return options.list ? options.list(input) : { ...stateOf(), ok: true };
    },
    revokeDirective: async (input) => {
      calls.revoke.push(input);
      return options.revoke ? options.revoke(input) : { ok: true };
    },
  };
}

function resetStore(projectRoot: string | null = "/proj") {
  useDirectiveStore.getState().clearProject(null, projectRoot);
  useDirectiveStore.setState({
    directivesEnabled: false,
    capabilityAvailable: false,
    initialReadDone: false,
  });
}

test("列表视图：只接受冻结四分组与合法行；非法行丢弃、跨 target 行不混入", () => {
  const parsed = asDirectiveListView(
    listOf({
      active: [item()],
      consumed: [{ id: "bad" } as unknown as DirectiveItemView],
      revoked: [item({ id: "d-2", status: "revoked" })],
      expired: [item({ id: "d-3", status: "expired", target: "decision" })],
    }),
    "approval",
  );
  assert.ok(parsed);
  assert.equal(parsed!.active.length, 1);
  assert.equal(parsed!.consumed.length, 0);
  assert.equal(parsed!.revoked.length, 1);
  assert.equal(parsed!.expired.length, 0, "decision row must not leak into approval view");
  assert.equal(asDirectiveListView({ active: [] }, "approval"), null);
});

test("列表成功回包：ok:true + version:1 + 双视图 + ledgerErrors；失败回包返回 null", () => {
  const parsed = asDirectiveListReply(stateOf({ ok: true, ledgerErrors: 2 }));
  assert.ok(parsed);
  assert.equal(parsed!.ledgerErrors, 2);
  assert.equal(parsed!.approval.active.length, 1);
  assert.equal(asDirectiveListReply({ ok: false, error: "bad" }), null);
  assert.equal(
    asDirectiveListReply(stateOf({ directivesEnabled: false })),
    null,
  );
});

test("分组：active 单独；历史按 consumed → revoked → expired 顺序", () => {
  const groups = groupDirectiveList(
    listOf({
      active: [item({ id: "d-1" })],
      consumed: [item({ id: "d-2", status: "consumed" })],
      revoked: [item({ id: "d-3", status: "revoked" })],
      expired: [item({ id: "d-4", status: "expired" })],
    }),
  );
  assert.deepEqual(groups.active.map((row) => row.id), ["d-1"]);
  assert.deepEqual(groups.history.map((row) => row.id), ["d-2", "d-3", "d-4"]);
});

test("行视图：状态/消费者/期限提示；仅 active 可撤销", () => {
  const active = directiveRowView(item());
  assert.equal(active.canRevoke, true);
  assert.equal(active.statusKey, "ui.directive.panel.status.active");
  assert.equal(active.consumerKey, "ui.directive.panel.consumer.shellGate");
  assert.equal(active.untilKey, "ui.directive.panel.until.once");
  assert.equal(active.untilHintKey, null);
  assert.equal(active.resourceKey, "ui.directive.dialog.resource.shell");

  const session = directiveRowView(item({ until: "session" }));
  assert.equal(session.untilHintKey, "ui.directive.panel.until.sessionHint");
  const forever = directiveRowView(item({ until: "forever" }));
  assert.equal(forever.untilHintKey, "ui.directive.panel.until.foreverHint");
  const expiredOnce = directiveRowView(item({ status: "expired", until: "once" }));
  assert.equal(expiredOnce.untilHintKey, "ui.directive.panel.until.onceUnusedHint");
  assert.equal(expiredOnce.canRevoke, false);

  const decisionNone = directiveRowView(
    item({
      target: "decision",
      action: { kind: "select-recommended" },
      consumer: "none",
      status: "consumed",
    }),
  );
  assert.equal(decisionNone.consumerKey, "ui.directive.panel.consumer.none");
  assert.equal(decisionNone.statusKey, "ui.directive.panel.status.consumed");
  assert.equal(decisionNone.canRevoke, false);
  assert.equal(decisionNone.resourceKey, null);
});

test("key 映射与 overlay 判定", () => {
  assert.equal(statusLabelKey("revoked"), "ui.directive.panel.status.revoked");
  assert.equal(consumerLabelKey("decision-card"), "ui.directive.panel.consumer.decisionCard");
  assert.equal(untilLabelKey("forever"), "ui.directive.panel.until.forever");
  assert.equal(untilHintKey("once", "consumed"), null);
  assert.equal(
    isDirectiveOverlayOpen({ pending: null, panelOpen: true }),
    true,
  );
  assert.equal(
    isDirectiveOverlayOpen({ pending: null, panelOpen: false }),
    false,
  );
});

test("store handshake：directive:state 应用能力位/双视图/账本错误，并丢弃旧项目视图", () => {
  resetStore("/proj");
  useDirectiveStore.getState().applyState(stateOf({ ledgerErrors: 1 }));
  const applied = useDirectiveStore.getState();
  assert.equal(applied.directivesEnabled, true);
  assert.equal(applied.approval.active.length, 1);
  assert.equal(applied.ledgerErrors, 1);

  useDirectiveStore.getState().applyState(
    stateOf({ projectRoot: "/old", approval: listOf({ active: [item({ id: "d-old" })] }) }),
  );
  assert.equal(
    useDirectiveStore.getState().approval.active.some((row) => row.id === "d-old"),
    false,
    "old project push must not replace current lists",
  );

  useDirectiveStore.getState().applyState({ version: 1, directivesEnabled: false });
  assert.equal(useDirectiveStore.getState().directivesEnabled, true, "invalid state push ignored");
});

test("ensureInitialRead：成功启用；超时/失败按 false 正常发送；旧 preload 能力禁用", async () => {
  resetStore("/proj");
  const bridge = fakeBridge({ list: async () => ({ ...stateOf(), ok: true }) });
  useDirectiveStore.getState().attachBridge(bridge);
  await useDirectiveStore.getState().ensureInitialRead("/proj", 50);
  assert.equal(useDirectiveStore.getState().directivesEnabled, true);
  assert.equal(useDirectiveStore.getState().listLoaded, true);
  assert.deepEqual(bridge.calls.list[0], { projectRoot: "/proj" });

  resetStore("/proj");
  const slow = fakeBridge({ list: () => new Promise(() => undefined) });
  useDirectiveStore.getState().attachBridge(slow);
  await useDirectiveStore.getState().ensureInitialRead("/proj", 5);
  assert.equal(useDirectiveStore.getState().directivesEnabled, false);
  assert.equal(useDirectiveStore.getState().initialReadDone, true);

  resetStore("/proj");
  useDirectiveStore.getState().attachBridge(null);
  await useDirectiveStore.getState().ensureInitialRead("/proj", 5);
  assert.equal(useDirectiveStore.getState().capabilityAvailable, false);
  assert.equal(useDirectiveStore.getState().directivesEnabled, false);
});

test("确认请求：按 projectRoot 丢弃旧项目；同 id 重推保持勾选，新 id 重置", () => {
  resetStore("/proj");
  useDirectiveStore.getState().receiveConfirmRequest(
    requestOf({ projectRoot: "/other" }),
  );
  assert.equal(useDirectiveStore.getState().pending, null);

  useDirectiveStore.getState().receiveConfirmRequest(requestOf());
  assert.equal(useDirectiveStore.getState().pending?.id, "req-1");
  useDirectiveStore.getState().setDialogAcknowledged(true);
  useDirectiveStore.getState().receiveConfirmRequest(requestOf());
  assert.equal(useDirectiveStore.getState().dialogAcknowledged, true);

  useDirectiveStore.getState().receiveConfirmRequest(requestOf({ id: "req-2" }));
  assert.equal(useDirectiveStore.getState().pending?.id, "req-2");
  assert.equal(useDirectiveStore.getState().dialogAcknowledged, false);
});

test("回包：高危未勾选不发送；勾选后附 acknowledged:true 与预填快照；取消只发 decision", async () => {
  resetStore("/proj");
  const bridge = fakeBridge({ list: async () => ({ ...stateOf(), ok: true }) });
  useDirectiveStore.getState().attachBridge(bridge);
  useDirectiveStore.getState().receiveConfirmRequest(requestOf());

  await useDirectiveStore.getState().respondConfirm("confirm");
  assert.equal(bridge.calls.respond.length, 0, "high-risk unacknowledged must not send");
  assert.equal(
    useDirectiveStore.getState().errorKey,
    "ui.directive.error.highRiskUnacknowledged",
  );

  useDirectiveStore.getState().setDialogAcknowledged(true);
  await useDirectiveStore.getState().respondConfirm("confirm");
  assert.deepEqual(bridge.calls.respond[0], {
    id: "req-1",
    decision: "confirm",
    values: {
      action: { kind: "allow", resource: RESOURCE },
      scope: {},
      until: "once",
      acknowledged: true,
    },
  });
  assert.equal(useDirectiveStore.getState().pending, null);
  await new Promise((resolve) => setTimeout(resolve, 0));

  useDirectiveStore.getState().receiveConfirmRequest(requestOf({ id: "req-3" }));
  useDirectiveStore.getState().setDialogAcknowledged(true);
  await useDirectiveStore.getState().respondConfirm("cancel");
  assert.deepEqual(bridge.calls.respond[1], { id: "req-3", decision: "cancel" });
});

test("撤销（无上下文）：保持 id/target/projectRoot 冻结载荷；失败如实保留错误；成功刷新列表", async () => {
  resetStore("/proj");
  const bridge = fakeBridge({
    revoke: async () => ({ ok: false, error: "already-consumed" }),
  });
  useDirectiveStore.getState().attachBridge(bridge);
  await useDirectiveStore.getState().revoke("d-1", "approval");
  assert.deepEqual(bridge.calls.revoke[0], {
    id: "d-1",
    target: "approval",
    projectRoot: "/proj",
  });
  assert.equal(useDirectiveStore.getState().errorText, "already-consumed");

  const okBridge = fakeBridge();
  useDirectiveStore.getState().attachBridge(okBridge);
  await useDirectiveStore.getState().revoke("d-2", "decision");
  assert.equal(okBridge.calls.list.length, 1, "success refreshes list");
  assert.equal(useDirectiveStore.getState().errorText, "");
});

test("撤销（带上下文）：有效 roleId/runtime 附加到 directive:revoke；空 roleId/缺 runtime 不附", async () => {
  resetStore("/proj");
  const bridge = fakeBridge();
  useDirectiveStore.getState().attachBridge(bridge);

  await useDirectiveStore.getState().revoke("d-1", "approval", {
    roleId: "demo-product",
    runtime: "claude",
  });
  assert.deepEqual(bridge.calls.revoke[0], {
    id: "d-1",
    target: "approval",
    projectRoot: "/proj",
    roleId: "demo-product",
    runtime: "claude",
  });

  await useDirectiveStore.getState().revoke("d-2", "decision", {
    roleId: "   ",
    runtime: undefined,
  });
  assert.deepEqual(bridge.calls.revoke[1], {
    id: "d-2",
    target: "decision",
    projectRoot: "/proj",
  });

  await useDirectiveStore.getState().revoke("d-3", "approval", {
    runtime: "pi",
  });
  assert.deepEqual(bridge.calls.revoke[2], {
    id: "d-3",
    target: "approval",
    projectRoot: "/proj",
    runtime: "pi",
  });
});

test("项目切换：清空未决确认/双视图/账本错误/卡内入口，并重置初始读", () => {
  resetStore("/proj");
  useDirectiveStore.getState().applyState(stateOf({ ledgerErrors: 2 }));
  useDirectiveStore.getState().receiveConfirmRequest(requestOf());
  useDirectiveStore.getState().setCardEntryText("sc-1", "@审批 x");
  useDirectiveStore.getState().setCardEntryExpanded("sc-1", true);
  useDirectiveStore.getState().openPanel();
  useDirectiveStore.getState().clearProject("/proj", "/next");
  const state = useDirectiveStore.getState();
  assert.equal(state.projectRoot, "/next");
  assert.equal(state.pending, null);
  assert.equal(state.panelOpen, false);
  assert.deepEqual(state.approval, emptyDirectiveList());
  assert.equal(state.ledgerErrors, 0);
  assert.deepEqual(state.cardEntries, {});
  assert.equal(state.initialReadDone, false);
});

test("AC-22 卡内入口：非法/跨项目 target 零 sendSession；合法 target 逐字发送且清空输入", async () => {
  resetStore("/proj");
  useDirectiveStore.getState().applyState(stateOf());
  const sends: unknown[][] = [];
  const sendSession = async (...args: unknown[]) => {
    sends.push(args);
    return { ok: true, directive: { id: "d-9", target: "approval" } };
  };
  const payload = { projectRoot: "/proj", roleId: "A", runtime: "claude" };
  const view = { projectRoot: "/proj", runtime: "claude" };

  await useDirectiveStore.getState().submitFromCardEntry({
    cardId: "sc-bad",
    rawText: "@审批 允许 npm test",
    payload: { ...payload, runtime: undefined },
    view,
    sendSession,
  });
  assert.equal(sends.length, 0);
  assert.equal(
    cardEntryFor(useDirectiveStore.getState().cardEntries, "sc-bad").status.key,
    "ui.directive.cardEntry.error.invalidTarget",
  );

  await useDirectiveStore.getState().submitFromCardEntry({
    cardId: "sc-cross",
    rawText: "@审批 允许 npm test",
    payload: { ...payload, projectRoot: "/other" },
    view,
    sendSession,
  });
  assert.equal(sends.length, 0);

  useDirectiveStore.getState().setCardEntryExpanded("sc-1", true);  await useDirectiveStore.getState().submitFromCardEntry({
    cardId: "sc-1",
    rawText: "ordinary text",
    payload,
    view,
    sendSession,
  });
  assert.equal(sends.length, 0, "non-marker input must not send");
  assert.equal(
    cardEntryFor(useDirectiveStore.getState().cardEntries, "sc-1").status.key,
    "ui.directive.cardEntry.error.notDirective",
  );

  useDirectiveStore.getState().setCardEntryText("sc-1", "@审批 允许 npm test");
  await useDirectiveStore.getState().submitFromCardEntry({
    cardId: "sc-1",
    rawText: "@审批 允许 npm test",
    payload,
    view,
    sendSession,
  });
  assert.equal(sends.length, 1);
  assert.equal(sends[0]![0], "@审批 允许 npm test");
  assert.deepEqual(sends[0]![1], []);
  assert.deepEqual(sends[0]![2], payload);
  assert.equal(typeof (sends[0]![3] as Record<string, unknown>).clientMessageId, "string");
  const entry = cardEntryFor(useDirectiveStore.getState().cardEntries, "sc-1");
  assert.equal(entry.text, "");
  assert.equal(entry.status.key, "ui.directive.cardEntry.status.confirmOpened");
  assert.equal(entry.submitting, false);
});

test("面板源码守卫：两个逻辑面板/分组/待答徽标/撤销/不调用 shell 应答/层级 95", () => {
  const panel = read("app/renderer/src/chat/directive-panel.tsx");
  assert.ok(panel.includes('id="directive-panel"'));
  assert.ok(panel.includes('id={"directive-panel-" + target}'));
  assert.ok(panel.includes('target="approval"'));
  assert.ok(panel.includes('target="decision"'));
  assert.ok(panel.includes("groupDirectiveList"));
  assert.ok(panel.includes('id="directive-panel-shell-badge"'));
  assert.ok(panel.includes("useConfirmStore"));
  assert.ok(panel.includes("directiveRowView"));
  assert.ok(panel.includes('id={"directive-revoke-" + item.id}'));
  assert.match(
    panel,
    /revoke\(item\.id,\s*item\.target,\s*\{\s*roleId,\s*runtime\s*\}\)/,
    "panel revoke must forward the current roleId/runtime context",
  );
  const composer = read("app/renderer/src/shell/Composer.tsx");
  assert.match(
    composer,
    /<DirectivePanel\s+roleId=\{selectedRoleId\}\s+runtime=\{runtime\}\s*\/>/,
    "Composer must pass the current roleId/runtime to the panel",
  );
  const panelCode = panel
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.equal(panelCode.includes("respondShell"), false);
  assert.equal(panelCode.includes("respondRecovery"), false);
  assert.equal(panelCode.includes("respondEscalation"), false);
  assert.equal(panelCode.includes("shellCardSlot"), false);
});
