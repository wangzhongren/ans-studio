// test/桌面UI/runtime-view.test.ts
// Phase 4A 纯逻辑：视图缓存键、当前/异引擎/旧项目路由、重放顺序、
// 按项目清理、切引擎 generation 守卫。

import test from "node:test";
import assert from "node:assert/strict";
import {
  GenerationGuard,
  RuntimeViewCache,
  envelopeList,
  isViewRuntime,
  partitionEnvelopes,
  payloadRuntime,
  replayView,
  routePayload,
  viewKey,
  type RuntimeViewPort,
} from "../../app/renderer/src/chat/runtime-view.ts";

const view = { projectRoot: "/p", runtime: "pi" };

test("视图键：项目+runtime 精确区分，缺省项目为空串", () => {
  assert.equal(viewKey("/p", "pi"), JSON.stringify(["/p", "pi"]));
  assert.equal(viewKey(null, "pi"), JSON.stringify(["", "pi"]));
  assert.notEqual(viewKey("/p", "pi"), viewKey("/p", "codex"));
  assert.notEqual(viewKey("/p", "pi"), viewKey("/q", "pi"));
});

test("载荷 runtime：显式 runtime → event.runtime；缺省不猜（null）", () => {
  assert.equal(payloadRuntime({ runtime: "codex" }), "codex");
  assert.equal(payloadRuntime({ event: { runtime: "claude" } }), "claude");
  assert.equal(payloadRuntime({ event: {} }), null);
  assert.equal(payloadRuntime({ runtime: "demo" }), null);
  assert.equal(payloadRuntime(null), null);
  assert.equal(isViewRuntime("pi"), true);
  assert.equal(isViewRuntime("demo"), false);
});

test("路由：当前视图→current，异引擎→cache，旧项目→drop；缺省属于当前视图", () => {
  assert.equal(routePayload({ runtime: "pi", roleId: "A" }, view).target, "current");
  assert.equal(routePayload({ runtime: "codex", roleId: "A" }, view).target, "cache");
  const stale = routePayload({ projectRoot: "/old", runtime: "pi" }, view);
  assert.equal(stale.target, "drop");
  assert.equal(stale.staleProject, true);
  assert.equal(routePayload({ runtime: "demo" }, view).target, "drop");
  assert.equal(routePayload(null, view).target, "drop");
  const missing = routePayload({ roleId: "A", event: { kind: "message" } }, view);
  assert.equal(missing.target, "current");
  assert.equal(missing.runtime, "pi");
});

test("信封数组按目标分组且保序；旧项目信封丢弃", () => {
  const { current, cache } = partitionEnvelopes(
    [
      { runtime: "pi", roleId: "A", seq: 1 },
      { runtime: "codex", roleId: "A", seq: 2 },
      { projectRoot: "/old", runtime: "pi", seq: 3 },
      { runtime: "pi", roleId: "B", seq: 4 },
    ],
    view,
  );
  assert.deepEqual(current.map((item: any) => item.seq), [1, 4]);
  assert.deepEqual(cache.map((item) => [item.runtime, (item.envelope as any).seq]), [
    ["codex", 2],
  ]);
  assert.deepEqual(envelopeList("x"), ["x"]);
  assert.deepEqual(envelopeList(["x"]), ["x"]);
});

test("缓存：当前/异引擎载荷都记录；旧项目不记录；按项目清理", () => {
  const cache = new RuntimeViewCache();
  cache.recordHistory("/p", "pi", { projectRoot: "/p", runtime: "pi", roleId: "A", rows: [{ kind: "assistant", text: "h1" }] });
  cache.recordHistory("/p", "pi", { projectRoot: "/p", runtime: "pi", roleId: "A", rows: [{ kind: "assistant", text: "h2" }] });
  cache.recordRoleState("/p", "pi", { projectRoot: "/p", runtime: "pi", roleId: "A", busy: true });
  cache.recordEvents("/p", "pi", [{ runtime: "pi", roleId: "A", event: { kind: "message" } }]);
  cache.recordEvents("/p", "codex", [
    { runtime: "codex", roleId: "A", event: { kind: "message" } },
    { projectRoot: "/old", runtime: "codex", roleId: "A", event: { kind: "message" } },
  ]);

  const pi = cache.get("/p", "pi");
  assert.equal(pi.historyOrder.length, 1);
  assert.equal((pi.histories.get("A") as any).rows[0].text, "h2");
  assert.equal(pi.events.length, 1);
  assert.equal(cache.get("/p", "codex").events.length, 1);

  cache.clearProject("/p");
  assert.equal(cache.has("/p", "pi"), false);
  assert.equal(cache.has("/p", "codex"), false);
});

test("重放顺序：history → events → role-state → operator 卡 → 失效 → shell/恢复 → judge（排队事实不重放）", () => {
  const cache = new RuntimeViewCache();
  cache.recordRoleState("/p", "pi", { projectRoot: "/p", runtime: "pi", roleId: "B", busy: false });
  cache.recordRoleState("/p", "pi", { projectRoot: "/p", runtime: "pi", roleId: "A", busy: true });
  cache.recordEvents("/p", "pi", [
    { runtime: "pi", roleId: "A", event: { kind: "message", seq: 1 } },
    { runtime: "pi", roleId: "A", event: { kind: "message", seq: 2 } },
  ]);
  cache.recordHistory("/p", "pi", { projectRoot: "/p", runtime: "pi", roleId: "A", rows: [] });
  cache.recordOperatorRequest("/p", "pi", { projectRoot: "/p", runtime: "pi", id: "op-1", roleId: "A" });
  cache.recordOperatorExpired("/p", "pi", { projectRoot: "/p", runtime: "pi", id: "op-1", reason: "已失效" });
  cache.recordOperatorQueued("/p", "pi", { projectRoot: "/p", runtime: "pi", id: "q-1", roleId: "A" });
  cache.recordShellConfirm("/p", "pi", { projectRoot: "/p", runtime: "pi", id: "sc-1" });
  cache.recordRecoveryConfirm("/p", "pi", { projectRoot: "/p", runtime: "pi", id: "rc-1" });
  cache.recordShellJudgeResult("/p", "pi", { projectRoot: "/p", runtime: "pi", id: "j-1" });
  cache.recordGovernanceJudgeResult("/p", "pi", { projectRoot: "/p", runtime: "pi", id: "g-1" });

  const calls: string[] = [];
  const port: RuntimeViewPort = {
    applyHistory: (payload) => calls.push("history:" + (payload as any).roleId),
    appendEnvelopes: (envelopes) =>
      calls.push("events:" + envelopes.map((item: any) => item.event.seq).join(",")),
    applyRoleState: (payload) => calls.push("state:" + (payload as any).roleId),
    appendOperatorRequest: (payload) => calls.push("op:" + (payload as any).id),
    expireOperator: (id, reason) => calls.push("expire:" + id + ":" + (reason || "")),
    queueOperator: (payload) => calls.push("queued:" + (payload as any).id),
    receiveShell: (payload) => calls.push("shell:" + (payload as any).id),
    receiveRecovery: (payload) => calls.push("recovery:" + (payload as any).id),
    appendShellJudgeResult: (payload) => calls.push("judge:" + (payload as any).id),
    appendGovernanceJudgeResult: (payload) => calls.push("gov:" + (payload as any).id),
  };
  replayView(cache.get("/p", "pi"), port);
  // PM §15.3：排队事实是运行期事实，只由主进程重推重建；快照可记录但重放不得复活旧排队。
  assert.equal(cache.get("/p", "pi").operatorQueued.has("q-1"), true);
  assert.deepEqual(calls, [
    "history:A",
    "events:1,2",
    "state:B",
    "state:A",
    "op:op-1",
    "expire:op-1:已失效",
    "shell:sc-1",
    "recovery:rc-1",
    "judge:j-1",
    "gov:g-1",
  ]);
});

test("重复抑制：同角色历史只保留最新；事件按到达序全部保留（去重由 store 负责）", () => {
  const cache = new RuntimeViewCache();
  cache.recordHistory("/p", "codex", { projectRoot: "/p", runtime: "codex", roleId: "A", rows: [{ n: 1 }] });
  cache.recordHistory("/p", "codex", { projectRoot: "/p", runtime: "codex", roleId: "A", rows: [{ n: 2 }] });
  cache.recordHistory("/p", "codex", { projectRoot: "/p", runtime: "codex", roleId: "B", rows: [] });
  const snapshot = cache.get("/p", "codex");
  assert.deepEqual(snapshot.historyOrder, ["A", "B"]);
  assert.equal((snapshot.histories.get("A") as any).rows[0].n, 2);
});

test("落定 shell：只收起同角色缓存卡；clearShell/clearRecovery 按引擎清理", () => {
  const cache = new RuntimeViewCache();
  cache.recordShellConfirm("/p", "pi", { runtime: "pi", id: "sc-1", roleId: "A" });
  cache.settleShell("B", "pi", "/p");
  assert.ok(cache.get("/p", "pi").shellConfirm);
  cache.settleShell("A", "pi", "/p");
  assert.equal(cache.get("/p", "pi").shellConfirm, null);

  cache.recordShellConfirm("/p", "pi", { runtime: "pi", id: "sc-2" });
  cache.recordRecoveryConfirm("/p", "pi", { runtime: "pi", id: "rc-1" });
  cache.clearShell("/p", "pi");
  cache.clearRecovery("/p", "pi");
  assert.equal(cache.get("/p", "pi").shellConfirm, null);
  assert.equal(cache.get("/p", "pi").recoveryConfirm, null);
});

test("失效回执：同 id 的缓存 shell 卡收起，operator 请求保留供重放定格", () => {
  const cache = new RuntimeViewCache();
  cache.recordOperatorRequest("/p", "pi", { runtime: "pi", id: "op-1", roleId: "A" });
  cache.recordShellConfirm("/p", "pi", { runtime: "pi", id: "op-1", roleId: "A" });
  cache.recordOperatorExpired("/p", "pi", { runtime: "pi", id: "op-1", reason: "原轮次已中止" });
  const snapshot = cache.get("/p", "pi");
  assert.ok(snapshot.operatorRequests.has("op-1"));
  assert.equal(snapshot.operatorExpired.get("op-1"), "原轮次已中止");
  assert.equal(snapshot.shellConfirm, null);
});

test("generation 守卫：每次 bump 使旧 token 失效", () => {
  const guard = new GenerationGuard();
  const first = guard.bump();
  assert.equal(guard.isCurrent(first), true);
  const second = guard.bump();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.current(), second);
});
