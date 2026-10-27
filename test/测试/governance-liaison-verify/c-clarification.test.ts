// test/测试/governance-liaison-verify/c-clarification.test.ts
// 独立端到端验收（测试角色，2026-10-18）：`request_clarification` 两轮上限、账本
// `clarification.requested`、主入口系统行、不弹决定卡/不占「一项目一卡」。
//
// 依据：四角色评审 §5.4、§7.2、§十 AC12。全部离线，不读 `.env`、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import { readGovernanceLedger } from "../../../src/common/编排/governance-ledger.ts";
import type { RequestClarificationFn } from "../../../src/model/runtime.ts";
import {
  capture,
  consume,
  makeRoot,
  toolAdapterFactory,
  trioProject,
  waitForLedger,
  writeProjectRole,
} from "./fixture.ts";

const FLOW = "flow-a";

interface ClarifyHarness {
  caps: ReturnType<typeof capture>["caps"];
  calls: Array<Record<string, unknown>>;
  dispose(): Promise<void>;
}

async function openRapporteur(root: string, delivery: "ok" | "fail" = "ok"): Promise<ClarifyHarness> {
  const cap = capture();
  const calls: Array<Record<string, unknown>> = [];
  const requestClarification: RequestClarificationFn = (payload) => {
    calls.push(payload as unknown as Record<string, unknown>);
    return delivery === "ok" ? { ok: true, message: "stub 已在主入口显示" } : { ok: false, message: "模拟送达失败" };
  };
  const handle = await openRoleSession(
    { roleId: "rapporteur", project: trioProject(root), taskId: "T-clarify", requestClarification },
    { createAdapter: toolAdapterFactory(cap, { root }) },
  );
  await consume(handle, "（验收空脚本）");
  return { caps: cap.caps, calls, dispose: () => handle.dispose() };
}

async function ledger(root: string) {
  return readGovernanceLedger(root);
}

// —————————————————————— 1) 合法澄清（工具 → 账本） ——————————————————————

test("澄清闭环：request_clarification → 账本 clarification.requested（rapporteur/proposal/flowId）→ 不弹决定卡", async () => {
  const { root, cleanup } = makeRoot("clarify-ok");
  try {
    writeProjectRole(root, "A");
    const cap = capture();
    const calls: Array<Record<string, unknown>> = [];
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project: trioProject(root),
        taskId: "T-clarify-tool",
        requestClarification: (payload) => {
          calls.push(payload as unknown as Record<string, unknown>);
          return { ok: true, message: "stub" };
        },
      },
      {
        createAdapter: toolAdapterFactory(cap, {
          root,
          script: [
            {
              name: "request_clarification",
              args: { flowId: FLOW, intentId: "intent-a", question: "验收标准是否包含离线场景？" },
            },
          ],
        }),
      },
    );
    await consume(handle, "请澄清验收标准");
    await handle.dispose();
    assert.equal(calls.length, 1, "送达端恰调用一次");
    assert.equal(cap.results![0].name, "request_clarification");
    assert.equal(cap.results![0].ok, true, cap.results![0].message);

    const { entries, errors } = await waitForLedger(root, (list) =>
      list.some((e) => e.kind === "clarification.requested"),
    );
    assert.deepEqual(errors, []);
    const entry = entries.find((e) => e.kind === "clarification.requested")!;
    assert.ok(entry, "应写 clarification.requested");
    assert.equal(entry.actorRoleId, "rapporteur");
    assert.equal(entry.power, "proposal");
    assert.equal(entry.flowId, FLOW);
    assert.equal(entry.intentId, "intent-a");
    assert.match(entry.messageSummary ?? "", /验收标准/);
    assert.equal(entries.some((e) => e.kind === "customer.decision"), false, "澄清不是客户决定");
    assert.equal(entries.some((e) => e.kind === "intent.handed-off"), false, "澄清不写交接账本");
  } finally {
    cleanup();
  }
});

// —————————————————————— 2) 两轮上限 ——————————————————————

test("两轮上限：同一 flow 第 1/2 轮通过，第 3 轮拒绝并提示在提案卡上请客户决定", async () => {
  const { root, cleanup } = makeRoot("clarify-cap");
  try {
    writeProjectRole(root, "A");
    const h = await openRapporteur(root);
    for (let round = 1; round <= 2; round += 1) {
      const receipt = await h.caps!.requestClarification!(
        { flowId: FLOW, question: `第 ${round} 轮问题` },
        { turnId: `turn-${round}` },
      );
      assert.equal(receipt.ok, true, `第 ${round} 轮应通过：${receipt.message}`);
    }
    const third = await h.caps!.requestClarification!(
      { flowId: FLOW, question: "第 3 轮问题" },
      { turnId: "turn-3" },
    );
    assert.equal(third.ok, false, "第 3 轮应拒");
    assert.match(third.message ?? "", /上限 2 轮|提案卡/);
    assert.equal(h.calls.length, 2, "被拒的第三轮不得触达送达端");
    await h.dispose();
    const { entries } = await ledger(root);
    assert.equal(
      entries.filter((e) => e.kind === "clarification.requested").length,
      2,
      "被拒轮次不写账本",
    );
  } finally {
    cleanup();
  }
});

test("无 flowId 时按 intentId 计数；两者都缺 → 拒绝；账本不可读 → 拒绝", async () => {
  const { root, cleanup } = makeRoot("clarify-scope");
  try {
    writeProjectRole(root, "A");
    const h = await openRapporteur(root);
    const missing = await h.caps!.requestClarification!({ question: "缺少归属" } as never, { turnId: "turn-0" });
    assert.equal(missing.ok, false);
    assert.match(missing.message ?? "", /flowId|intentId/);
    for (let round = 1; round <= 2; round += 1) {
      const receipt = await h.caps!.requestClarification!(
        { intentId: "intent-x", question: `按意图第 ${round} 轮` },
        { turnId: `turn-${round}` },
      );
      assert.equal(receipt.ok, true, receipt.message ?? "");
    }
    const third = await h.caps!.requestClarification!(
      { intentId: "intent-x", question: "第 3 轮" },
      { turnId: "turn-3" },
    );
    assert.equal(third.ok, false);
    await h.dispose();

    // 账本坏行 ⇒ fail-closed（宁可拒绝澄清，也不无限追问）。
    const { root: badRoot, cleanup: badCleanup } = makeRoot("clarify-ledger-bad");
    try {
      writeProjectRole(badRoot, "A");
      const fs = await import("node:fs/promises");
      await fs.mkdir(`${badRoot}/.ans/governance`, { recursive: true });
      await fs.writeFile(`${badRoot}/.ans/governance/ledger.jsonl`, "{坏行\n");
      const bad = await openRapporteur(badRoot);
      const receipt = await bad.caps!.requestClarification!(
        { flowId: FLOW, question: "坏账本下提问" },
        { turnId: "turn-1" },
      );
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /账本不可读|ledger/);
      assert.equal(bad.calls.length, 0, "账本坏不得触达送达端");
      await bad.dispose();
    } finally {
      badCleanup();
    }
  } finally {
    cleanup();
  }
});

test("送达失败：如实回执、不写账本、不重试", async () => {
  const { root, cleanup } = makeRoot("clarify-fail");
  try {
    writeProjectRole(root, "A");
    const h = await openRapporteur(root, "fail");
    const receipt = await h.caps!.requestClarification!(
      { flowId: FLOW, question: "会失败的问题" },
      { turnId: "turn-1" },
    );
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /未能提交/);
    assert.equal(h.calls.length, 1, "不重试");
    await h.dispose();
    const { entries } = await ledger(root);
    assert.equal(entries.filter((e) => e.kind === "clarification.requested").length, 0);
  } finally {
    cleanup();
  }
});

// —————————————————————— 3) 桌面：主入口系统行、不弹决定卡 ——————————————————————

test("桌面澄清：系统行落主入口 Liaison，客户确认通道零调用（不占一项目一卡）", async () => {
  const { root, cleanup } = makeRoot("clarify-desktop");
  try {
    writeProjectRole(root, "A");
    const fs = await import("node:fs/promises");
    await fs.mkdir(`${root}/.ans`, { recursive: true });
    await fs.writeFile(`${root}/.ans/project.json`, JSON.stringify({ projectRoot: root, roles: {}, governanceModel: "trio" }) + "\n");
    const listing: ProjectListing = await listProject(root);
    const events: Array<{ roleId: string; event: { kind: string; summary?: string; detail?: unknown } }> = [];
    let customerInputCalls = 0;
    const buildConfig = (l: ProjectListing, acceptance: Parameters<typeof buildProjectConfig>[1], env?: Record<string, string | undefined>, govPath?: string) => {
      const config = buildProjectConfig(l, acceptance, env, govPath);
      return {
        ...config,
        governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:desktop" } },
      };
    };
    const manager = new SessionManager({
      openRoleSession,
      createRuntimeAdapterFactory: () =>
        toolAdapterFactory(capture(), {
          root,
          scriptForRole: (roleId) =>
            roleId === "rapporteur"
              ? [{ name: "request_clarification", args: { flowId: FLOW, question: "验收标准是否包含离线场景？" } }]
              : [],
        }),
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
      buildProjectConfig: buildConfig,
      getListing: (r) => (r === root ? listing : undefined),
      emitEvent: (envelope) => {
        events.push(envelope as unknown as (typeof events)[number]);
      },
      customerInput: () => {
        customerInputCalls += 1;
        return { outcome: "declined", reason: "替身：拒绝" };
      },
    });
    const opened = await manager.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" });
    assert.equal(opened.ok, true, opened.error ?? "");
    await manager.send("我需要澄清");
    const { entries } = await waitForLedger(root, (list) =>
      list.some((e) => e.kind === "clarification.requested"),
    );
    assert.ok(entries.some((e) => e.kind === "clarification.requested"), "编排写账本");
    const notes = events.filter(
      (envelope) =>
        envelope.roleId === "liaison" &&
        envelope.event.kind === "message" &&
        (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note",
    );
    assert.equal(notes.length, 1, "系统行恰一条，落主入口 Liaison");
    assert.equal(notes[0].event.summary, "策划需要澄清：验收标准是否包含离线场景？");
    assert.equal(customerInputCalls, 0, "澄清不弹客户决定卡");
    await manager.stop(null);
  } finally {
    cleanup();
  }
});
