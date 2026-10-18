// test/测试/governance-e2e-auto/k-governance-feedback.test.ts
// 五角色收口（2026-10-18 客户反馈）：内部治理角色 settle 后，**不再把正文原文贴成 delivery-note**，
// 而是经投递机给 Lead / 主理 投一条 `[系统·治理反馈]` 汇总任务（要求汇总后告知客户、不得逐字转述）。
//
// 全部离线：真实桌面 Interface / SessionManager / 投递机；模型为脚本桩。

import test from "node:test";
import assert from "node:assert/strict";

import { makeHarness, makeRoot, seedTrioProject } from "./fixture.ts";

test("内部角色 settle：Lead 收到 [系统·治理反馈] 汇总任务，而不是原文 delivery-note", async () => {
  const temp = makeRoot("governance-feedback");
  seedTrioProject(temp.root);
  const h = await makeHarness({
    tag: "governance-feedback",
    root: temp.root,
    scriptForRole: () => [],
  });
  try {
    await h.open("rapporteur");
    const sent = await h.send("rapporteur", "请写提案");
    assert.equal(sent.ok, true, sent.error ?? "");

    await h.waitFor(
      () => (h.prompts.get("liaison") ?? []).some((prompt) => prompt.startsWith("[系统·治理反馈]")),
      5000,
    );
    const feedback = h.prompts.get("liaison")!.find((prompt) => prompt.startsWith("[系统·治理反馈]"))!;
    assert.match(feedback, /^\[系统·治理反馈\] 来自 Draft \/ 提案 的内部反馈/, "显示名取listing的 displayName（Draft / 提案）");
    assert.match(feedback, /请写提案/, "内部正文作为内部材料带给 Lead");
    assert.match(feedback, /汇总后告知客户/, "要求 Lead 汇总后再告知客户");
    assert.match(feedback, /不要逐字转述/, "禁止原文照搬");

    const rawNotes = h.events.filter(
      (envelope) =>
        envelope.roleId === "liaison" &&
        envelope.event.kind === "message" &&
        (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note" &&
        typeof envelope.event.summary === "string" &&
        envelope.event.summary.includes("请写提案"),
    );
    assert.equal(rawNotes.length, 0, "不得把内部正文原文贴成 delivery-note");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
