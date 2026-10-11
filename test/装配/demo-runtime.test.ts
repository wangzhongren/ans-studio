import assert from "node:assert/strict";
import { test } from "node:test";

import { createDemoRuntimeAdapter, DEMO_SCRIPT } from "../../src/common/装配/demo-runtime.ts";

import type { RuntimeAdapter, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";
import type { ResolvedRole } from "../../src/model/role.ts";

const STUB_ROLE = { id: "编排" } as unknown as ResolvedRole;

/** 一个只判“目标是否等于某路径”的桩 gate，用于隔离验证假 runtime。 */
function stubGate(allowedPath: string): WriteGate {
  return (targetPath: string): WriteDecision => {
    if (targetPath === allowedPath) {
      return {
        allowed: true,
        matchedEntry: { root: "project", path: targetPath, kind: "file", purpose: "桩" },
      };
    }
    return {
      allowed: false,
      reason: "不在角色边界内（桩）",
      allowedByRoot: { skill: [], project: ["src/interface/cli/run.ts"] },
    };
  };
}

async function runScript(adapter: RuntimeAdapter): Promise<SessionEvent[]> {
  const session = await adapter.bindRole(STUB_ROLE);
  await session.prompt("实现 T-1");
  const events: SessionEvent[] = [];
  for await (const event of session.events()) {
    events.push(event);
  }
  await session.dispose();
  return events;
}

test("默认脚本：两笔越界写入都在写之前被拒，逐笔给出按根分组的允许路径", async () => {
  const adapter = createDemoRuntimeAdapter({ gate: stubGate("__none__") });
  const events = await runScript(adapter);

  const toolCalls = events.filter((e) => e.kind === "tool_call");
  const denied = events.filter((e) => e.kind === "denied");
  const accepted = events.filter((e) => e.kind === "accepted");

  assert.equal(toolCalls.length, DEMO_SCRIPT.length, "每笔脚本调用都应有 tool_call 事件");
  assert.equal(denied.length, DEMO_SCRIPT.length, "全部越界写入都应被拒");
  assert.equal(accepted.length, 0, "脚本内的写入都不应被允许");

  for (const e of denied) {
    assert.match(e.summary, /按根分组/);
    assert.match(e.summary, /project:/);
    assert.match(e.summary, /skill:/);
  }

  assert.equal(events.at(-1)?.kind, "settled", "进程以 settled 结束");
});

test("脚本事件顺序：先 tool_call，再判定，最后 settled", async () => {
  const adapter = createDemoRuntimeAdapter({ gate: stubGate("__none__") });
  const events = await runScript(adapter);
  const kinds = events.map((e) => e.kind);
  assert.equal(kinds[0], "message");
  assert.ok(kinds.includes("tool_call"));
  assert.equal(kinds.at(-1), "settled");
  // 每个 tool_call 之后紧跟一个判定事件（accepted/denied）。
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] === "tool_call") {
      assert.ok(kinds[i + 1] === "accepted" || kinds[i + 1] === "denied");
    }
  }
});

test("gate 允许时产出 accepted 且不发写入（替身不落盘）", async () => {
  const adapter = createDemoRuntimeAdapter({
    gate: stubGate("src/evil.ts"),
  });
  const events = await runScript(adapter);
  const accepted = events.filter((e) => e.kind === "accepted");
  assert.equal(accepted.length, 1, "命中桩允许路径的那一笔应被接受");
  assert.match(accepted[0].summary, /写入被允许/);
});
