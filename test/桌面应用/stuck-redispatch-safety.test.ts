// test/桌面应用/stuck-redispatch-safety.test.ts
// B 批（2026-10-28）：终止/重派安全——外部/破坏性/未知副作用、终止未确认、已发生外部副作用
// ⇒ unsafe；部分写入/未完成工具调用/已有完成报告 ⇒ needs-review；仅 read-only/docs/code 且无部分写入 ⇒ safe。
import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRedispatchSafety } from "../../src/common/编排/watchdog.ts";
import { classifyTaskSideEffect, normalizeTaskSideEffect } from "../../src/common/编排/task-state.ts";

test("unsafe：external/destructive/unknown 零次自动重派（即使终止已确认）", () => {
  for (const sideEffect of ["external", "destructive", "unknown"]) {
    const decision = evaluateRedispatchSafety({ sideEffect, terminationConfirmed: true });
    assert.equal(decision.safety, "unsafe", sideEffect);
    assert.equal(decision.autoAllowed, false);
  }
});

test("unsafe：终止未确认 / 已发生外部副作用", () => {
  const unconfirmed = evaluateRedispatchSafety({ sideEffect: "code", terminationConfirmed: false });
  assert.equal(unconfirmed.safety, "unsafe");
  assert.match(unconfirmed.reasons.join("；"), /终止未确认/);
  const external = evaluateRedispatchSafety({ sideEffect: "code", terminationConfirmed: true, externalSideEffects: true });
  assert.equal(external.safety, "unsafe");
  assert.match(external.reasons.join("；"), /外部副作用/);
});

test("needs-review：部分写入/未完成工具调用/已有完成报告 ⇒ 不自动重派", () => {
  const partial = evaluateRedispatchSafety({ sideEffect: "code", terminationConfirmed: true, partialArtifacts: ["src/a.ts"] });
  assert.equal(partial.safety, "needs-review");
  assert.match(partial.reasons.join("；"), /部分写入/);
  const inFlight = evaluateRedispatchSafety({ sideEffect: "docs", terminationConfirmed: true, inFlightTool: true });
  assert.equal(inFlight.safety, "needs-review");
  // B-08：in-flight shell/external/destructive 一律 needs-review（不是 unsafe）。
  for (const sideEffect of ["external", "destructive"]) {
    const decision = evaluateRedispatchSafety({ sideEffect, terminationConfirmed: true, inFlightTool: true });
    assert.equal(decision.safety, "needs-review", sideEffect);
    assert.equal(decision.autoAllowed, false);
  }
  const done = evaluateRedispatchSafety({ sideEffect: "read-only", terminationConfirmed: true, completedReport: true });
  assert.equal(done.safety, "needs-review");
  assert.equal(done.autoAllowed, false);
});

test("safe：仅 read-only/docs/code 且终止确认、无部分写入/无外部副作用", () => {
  for (const sideEffect of ["read-only", "docs", "code"]) {
    const decision = evaluateRedispatchSafety({ sideEffect, terminationConfirmed: true });
    assert.equal(decision.safety, "safe", sideEffect);
    assert.equal(decision.autoAllowed, true);
  }
});

test("应用强制升类（不降类）：缺填/非法 ⇒ unknown；shell/删除/发布/源码/文档按文本升类", () => {
  assert.equal(normalizeTaskSideEffect("bogus"), "unknown");
  assert.equal(classifyTaskSideEffect(undefined, "运行 rm -rf build"), "destructive");
  assert.equal(classifyTaskSideEffect(undefined, "git push origin main"), "external");
  assert.equal(classifyTaskSideEffect("read-only", "修改 src/app.ts 并跑 npm run test"), "code");
  assert.equal(classifyTaskSideEffect("read-only", "更新 docs/plan.md"), "docs");
  assert.equal(classifyTaskSideEffect("external", "更新 docs/plan.md"), "external", "声明更高风险不降");
  assert.equal(classifyTaskSideEffect("docs", "修改 src/app.ts"), "code", "证据更高风险升类");
});
