// 假适配器单测（契约 §4 / §0 范围）。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包——加载本测试不需要安装 Pi。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";
import { makeGate, makeRole } from "./fixtures.ts";

/** 一律放行的 gate（用于验证「配置 writeRoot 后真正落盘」；不承载治理判定）。 */
function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

/** 消费一个会话的全部事件直到结束。 */
async function drain(session: { events(): AsyncIterable<{ kind: string; summary: string }> }) {
  const events: Array<{ kind: string; summary: string; detail?: unknown }> = [];
  for await (const ev of session.events()) events.push(ev);
  return events;
}

test("composeContext 返回含角色与边界来源的系统提示", async () => {
  const adapter = createFakeRuntimeAdapter({ gate: makeGate({ skill: [], project: [] }) });
  const { systemPrompt } = await adapter.composeContext(makeRole());
  assert.match(systemPrompt, /角色：Pi适配器/);
  assert.match(systemPrompt, /角色卡\/Pi适配器\/boundary\.md/);
});

test("缺省脚本：一次越界写 src/evil.ts，在写入前被拒，拒绝信息按根分组", async () => {
  const gate = makeGate({ skill: ["技能/示例/"], project: ["src/provider/pi/tools.ts"] });
  const adapter = createFakeRuntimeAdapter({ gate });
  const session = await adapter.bindRole(makeRole());

  await session.prompt("请写入 src/evil.ts");
  const events = await drain(session);

  // 事件序列：message → tool_call → denied → settled
  assert.equal(events[0].kind, "message");
  assert.equal(events[1].kind, "tool_call");
  assert.equal(events[2].kind, "denied");
  assert.equal(events[events.length - 1].kind, "settled");

  const denial = events[2].summary;
  assert.match(denial, /写入被拒绝/);
  assert.match(denial, /按根分组/);
  // 按根分组（F10）：skill 与 project 各自一行。
  assert.match(denial, /skill: 技能\/示例\//);
  assert.match(denial, /project: src\/provider\/pi\/tools\.ts/);
  // 越界目标绝不出现为"已获准"。
  assert.doesNotMatch(denial, /已获准/);
});

test("自定义脚本：允许的路径走 accepted（未配置 writeRoot 时只判定、不落盘）", async () => {
  const gate = makeGate({ skill: [], project: ["src/provider/pi/session.ts"] });
  const adapter = createFakeRuntimeAdapter({
    gate,
    script: [{ name: "write_file", args: { path: "src/provider/pi/session.ts", content: "// ok\n" } }],
  });
  const session = await adapter.bindRole(makeRole());
  await session.prompt("写入允许的目标");
  const events = await drain(session);

  const accepted = events.find((e) => e.kind === "accepted");
  assert.ok(accepted, "应有一个 accepted 事件");
  assert.match(accepted!.summary, /已获准/);
  // 未配置 writeRoot ⇒ 只判定、不落盘（fail-closed），绝不误改仓库文件。
  assert.match(accepted!.summary, /未配置 writeRoot/);
  assert.match(accepted!.summary, /未落盘/);
});

test("自定义脚本：配置 writeRoot 后，允许的写入真正落盘到该写根", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-fake-"));
  try {
    const adapter = createFakeRuntimeAdapter({
      gate: allowGate(),
      script: [{ name: "write_file", args: { path: "out.txt", content: "// ok\n" } }],
      writeRoot: dir,
    });
    const session = await adapter.bindRole(makeRole());
    await session.prompt("写入允许的目标");
    const events = await drain(session);

    const accepted = events.find((e) => e.kind === "accepted");
    assert.ok(accepted, "应有一个 accepted 事件");
    assert.match(accepted!.summary, /已获准并落盘/);
    assert.equal(readFileSync(join(dir, "out.txt"), "utf8"), "// ok\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("未知工具被拒", async () => {
  const adapter = createFakeRuntimeAdapter({
    gate: makeGate({ skill: [], project: [] }),
    script: [{ name: "run_shell", args: { command: "rm -rf /" } }],
  });
  const session = await adapter.bindRole(makeRole());
  await session.prompt("执行 shell");
  const events = await drain(session);
  const denied = events.find((e) => e.kind === "denied");
  assert.ok(denied);
  assert.match(denied!.summary, /未知工具/);
});
