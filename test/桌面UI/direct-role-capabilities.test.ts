import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decisionDelegationSnapshot, governanceJudgeResultView, judgeToggleView } from "../../app/renderer/src/chat/judge.ts";
import type { DirectActionSource } from "../../src/model/trunk.ts";

test("decision状态只采主进程revision，迟到/冲突回包不覆盖推送；关闭保持真实新revision", () => {
  const initial = { enabled: false, revision: null };
  assert.equal(decisionDelegationSnapshot({ version: 1, enabled: true }, initial), null);
  for (const revision of [-1, 1.5, NaN, "2"]) {
    assert.equal(decisionDelegationSnapshot({ version: 1, enabled: true, revision }, initial), null);
  }
  const enabled = decisionDelegationSnapshot({ version: 1, ok: true, enabled: true, revision: 4 }, initial)!;
  assert.deepEqual(enabled, { enabled: true, revision: 4, available: true });
  assert.equal(decisionDelegationSnapshot({ version: 1, enabled: false, revision: 3 }, enabled), null);
  assert.equal(decisionDelegationSnapshot({ version: 1, enabled: false, revision: 4 }, enabled), null);
  const disabled = decisionDelegationSnapshot({ version: 1, enabled: false, revision: 5 }, enabled)!;
  assert.deepEqual(disabled, { enabled: false, revision: 5, available: true });
  assert.equal(decisionDelegationSnapshot({ version: 1, ok: false, enabled: true, revision: 6 }, disabled), null);
  const view = judgeToggleView("decision", true, true, false);
  assert.equal(view.label, "替我决策");
  assert.equal(view.title, "幕僚代决策");
  assert.doesNotMatch(view.label, /处理中|决策中/);
});

function source(disposition: "select" | "reject" | "revise"): Extract<DirectActionSource, { kind: "chief-delegated" }> {
  return { kind: "chief-delegated", actorRoleId: "chief", originRoleId: "product", requestId: "request-real",
    baseDigest: "a".repeat(64), delegationRevision: 4, disposition,
    ...(disposition === "select" ? { selected: ["alternative"] } : {}), reason: "实际决定理由", at: "2026-11-05T01:00:00Z" };
}

test("真实chief非推荐选择/拒绝/退修保留完整来源，关闭后的历史不重标客户或judge", () => {
  for (const disposition of ["select", "reject", "revise"] as const) {
    const actionSource = source(disposition);
    const payload = { group: "decision", cardKind: "proposal", requestId: "request-real", roleId: "product",
      reasonCode: "chief-delegated", actionSource, selected: ["wrong-top-level"], engine: "codex" };
    const view = governanceJudgeResultView(payload)!;
    assert.equal(view.title, "幕僚代决策");
    assert.equal(view.operatorText, "operator:chief");
    assert.equal(view.customerNote, "来源：product");
    assert.deepEqual(view.actionSource, actionSource);
    assert.deepEqual(view.details.actionSource, actionSource);
    assert.deepEqual(view.details.selected, disposition === "select" ? ["alternative"] : []);
    assert.equal(view.details.reason, actionSource.reason);
    assert.doesNotMatch(view.title, /judge|客户/);
    if (disposition === "revise") {
      assert.match(view.headline, /未获批准/);
      assert.match(view.headline, /不代表任务取消/);
    }
    if (disposition === "reject") assert.equal(view.headline, "拒绝");
    assert.deepEqual(governanceJudgeResultView(payload), view, "回放只读原来源，不读当前开关");
    assert.equal(governanceJudgeResultView({ ...payload, requestId: "different" }), null);
    assert.equal(governanceJudgeResultView({ ...payload, actionSource: { ...actionSource, actorRoleId: "judge" } }), null);
  }
  const old = governanceJudgeResultView({ group: "decision", cardKind: "proposal", engine: "codex" })!;
  assert.equal(old.title, "judge 代批 · 代决策");
  assert.equal(old.operatorText, "operator:judge:codex");
  assert.equal(old.actionSource, undefined);
  assert.equal(governanceJudgeResultView({ group: "decision", reasonCode: "chief-delegated" }), null);
});

test("唯一勾选位于chief顶部；非chief输入与发送处理器有约束，停止控制保留", () => {
  const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
  const header = read("app/renderer/src/shell/ChatHeader.tsx");
  const composer = read("app/renderer/src/shell/Composer.tsx");
  assert.equal((header.match(/id="judge-decision-toggle"/g) ?? []).length, 1);
  assert.match(header, /selectedRoleId === "chief" \? \(/);
  assert.match(header, /data-revision=\{decision.revision/);
  assert.doesNotMatch(composer, /id="judge-decision-toggle"/);
  assert.match(composer, /const customerEntry = selectedRoleId === "chief"/);
  assert.match(composer, /disabled=\{!customerEntry\}/);
  const send = composer.slice(composer.indexOf("const send = async"), composer.indexOf("const halt = async"));
  assert.ok(send.indexOf('roleId !== "chief"') < send.indexOf("bridge.sendSession("));
  assert.match(send, /useUiStore.getState\(\).selectedRoleId !== "chief"/);
  assert.match(composer, /id="btn-halt"/);
  assert.match(composer, /id="auto-approve-toggle"/);
});
