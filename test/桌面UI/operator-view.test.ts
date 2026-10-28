// test/桌面UI/operator-view.test.ts
// Phase 4B 纯逻辑：镜像面判定、同 id 去重、排队计数/清理语义、终态/重试文案、pending 按 surfaces。

import test from "node:test";
import assert from "node:assert/strict";
import {
  operatorCardMeta,
  operatorExpiredNote,
  operatorFinalNote,
  operatorMirrorRoleId,
  operatorOutsideView,
  operatorQueued,
  operatorRetryNote,
  operatorSourceRoleId,
  operatorSurfaces,
  pendingKindFor,
  queuedCountForView,
  queuedIds,
  queuedWithoutPresented,
} from "../../app/renderer/src/chat/operator-view.ts";
import { pendingViews } from "../../app/renderer/src/chat/work-view.ts";

const payload = (extra: Record<string, unknown> = {}) => ({
  id: "op-1",
  roleId: "rapporteur",
  projectRoot: "/p",
  runtime: "pi",
  request: { kind: "confirm", title: "提案" },
  ...extra,
});

test("镜像面：mirrorRoleId 缺省/相同 → 单面；不同 → 源面+镜像面", () => {
  assert.equal(operatorMirrorRoleId(payload()), null);
  assert.equal(operatorMirrorRoleId(payload({ mirrorRoleId: "rapporteur" })), null);
  assert.equal(operatorMirrorRoleId(payload({ mirrorRoleId: "liaison" })), "liaison");
  assert.deepEqual(operatorSurfaces(payload()), ["rapporteur"]);
  assert.deepEqual(operatorSurfaces(payload({ mirrorRoleId: "liaison" })), [
    "rapporteur",
    "liaison",
  ]);
  assert.deepEqual(operatorSurfaces(payload({ mirrorRoleId: "rapporteur" })), ["rapporteur"]);
  assert.equal(operatorSourceRoleId(payload()), "rapporteur");
  assert.equal(operatorSourceRoleId({}), "");
});

test("可见性指针：所有呈现面都不是当前查看角色", () => {
  const mirror = payload({ mirrorRoleId: "liaison" });
  assert.equal(operatorOutsideView(mirror, "rapporteur"), false);
  assert.equal(operatorOutsideView(mirror, "liaison"), false);
  assert.equal(operatorOutsideView(mirror, "A"), true);
  assert.equal(operatorOutsideView(mirror, null), true);
});

test("queued 事实：payload/request 任一为 true；缺省 false", () => {
  assert.equal(operatorQueued(payload()), false);
  assert.equal(operatorQueued(payload({ queued: true })), true);
  assert.equal(operatorQueued(payload({ request: { kind: "confirm", queued: true } })), true);
});

test("排队计数：当前项目×引擎、唯一 id、旧项目/旧引擎丢弃", () => {
  const queued = {
    q1: payload({ id: "q1" }),
    q2: payload({ id: "q2", projectRoot: "/other" }),
    q3: payload({ id: "q3", runtime: "codex" }),
    q4: payload({ id: "q4", projectRoot: null, runtime: null }),
  };
  assert.equal(queuedCountForView(queued as never, "/p", "pi"), 2);
  assert.deepEqual(queuedIds(queued as never), ["q1", "q2", "q3", "q4"]);
  // 同一 id 重推由对象键天然去重；已呈现的 id 从排队中剔除（不重复计数）。
  const pending = { q1: payload({ id: "q1" }) };
  assert.deepEqual(Object.keys(queuedWithoutPresented(queued as never, pending as never)), [
    "q2",
    "q3",
    "q4",
  ]);
});

test("终态文案：确认/拒绝/取消/提交；过期与重试原因如实", () => {
  assert.equal(operatorFinalNote({ kind: "confirm", confirmed: true }), "已确认。");
  assert.equal(operatorFinalNote({ kind: "confirm", confirmed: false }), "已回『不同意』（未获同意）。");
  assert.equal(operatorFinalNote({ kind: "choice", cancelled: true }), "已取消（未获同意）。");
  assert.equal(operatorFinalNote({ kind: "choice", selected: ["a"] }), "已提交。");
  assert.equal(operatorExpiredNote("轮次停止"), "请求已失效，未获同意。原因：轮次停止");
  assert.equal(operatorExpiredNote(""), "请求已失效，未获同意。请让角色重新发起。");
  assert.ok(operatorRetryNote("校验驳回").startsWith("回传失败：校验驳回"));
  assert.ok(operatorRetryNote("").includes("——请重试。"));
});

test("治理卡元信息透传（D 批仅 appointment-write）；普通卡无徽标", () => {
  assert.equal(operatorCardMeta(payload()).badge, "");
  const meta = operatorCardMeta(
    payload({ request: { kind: "confirm", title: "写角色卡", cardKind: "appointment-write" } }),
  );
  assert.equal(meta.badge, "任命写卡");
  assert.deepEqual(meta.lines, ["权力类型：任命写卡"]);
  assert.equal(meta.flowId, "");
});

test("pending 按 surfaces 计数：镜像面同样可见同一请求", () => {
  const pending = {
    "op-1": payload({ mirrorRoleId: "liaison" }),
    "op-2": payload({ id: "op-2" }),
  };
  assert.equal(pendingViews(pending as never, "rapporteur").length, 2);
  assert.equal(pendingViews(pending as never, "liaison").length, 1);
  assert.equal(pendingViews(pending as never, "liaison")[0].requestId, "op-1");
  assert.equal(pendingViews(pending as never, "A").length, 0);
  assert.equal(pendingViews(pending as never, null).length, 0);
});

test("pendingKindFor：任一 choice ⇒ 待选择，否则等待你确认，无 pending ⇒ null", () => {
  assert.equal(pendingKindFor({} as never, "rapporteur"), null);
  assert.equal(pendingKindFor({} as never, "A"), null);
  assert.equal(pendingKindFor({} as never, ""), null);
  const confirm = {
    "op-1": payload({ id: "op-1" }),
  };
  assert.equal(pendingKindFor(confirm as never, "rapporteur"), "等待你确认");
  assert.equal(pendingKindFor(confirm as never, "A"), null);
  const choice = {
    "op-1": payload({ id: "op-1", request: { kind: "choice", title: "选择" } }),
  };
  assert.equal(pendingKindFor(choice as never, "rapporteur"), "待选择");
  // 混合未决：choice 优先（不问数量；数量只由 .ti-count 承担）。
  const mixed = {
    "op-1": payload({ id: "op-1" }),
    "op-2": payload({ id: "op-2", request: { kind: "choice", title: "选择" } }),
  };
  assert.equal(pendingKindFor(mixed as never, "rapporteur"), "待选择");
  // 镜像面与源面看到同一未决事实。
  const mirror = {
    "op-1": payload({ id: "op-1", mirrorRoleId: "liaison", request: { kind: "choice" } }),
  };
  assert.equal(pendingKindFor(mirror as never, "liaison"), "待选择");
  assert.equal(pendingKindFor(mirror as never, "rapporteur"), "待选择");
  // 作答/失效后 pending 删除 ⇒ 回真实状态（null），而不是残留标签。
  const answered = { ...mirror };
  delete (answered as Record<string, unknown>)["op-1"];
  assert.equal(pendingKindFor(answered as never, "liaison"), null);
  // request 缺省/格式异常按非 choice 处理（保守显示等待确认，不猜种类）。
  assert.equal(pendingKindFor({ x: payload({ id: "x", request: null }) } as never, "rapporteur"), "等待你确认");
  assert.equal(
    pendingKindFor({ y: payload({ id: "y", request: { kind: "other" } }) } as never, "rapporteur"),
    "等待你确认",
  );
});
