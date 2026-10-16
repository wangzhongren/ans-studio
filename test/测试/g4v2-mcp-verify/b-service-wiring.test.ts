// test/测试/g4v2-mcp-verify/b-service-wiring.test.ts —— B 域：Service 接线（providerFor 按角色注入）。
//
// 独立构造：经 `createRuntimeAdapter`（service 公开入口）＋自建捕获工厂，逐项取证：
// ① 按角色注入（本角色命中收录、别角色声明不注入）；② 纯读（绝不建目录、绝不写盘）；
// ③ 坏件跳过（不毁会话装配）；④ 重建重读（新适配器实例＝新会话，读到当刻盘面）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createRuntimeAdapter } from "../../../src/service/runtime/session.ts";
import type { RuntimeProviderOptions, RuntimeAdapter, WriteGate } from "../../../src/model/runtime.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";
import { makeRoot, snapshotTree, writeMcpDeclaration } from "./helpers.ts";

const gate: WriteGate = () => ({ allowed: false, reason: "fixture", allowedByRoot: { project: [], skill: [] } });

function role(id: string): ResolvedRole {
  return {
    id,
    kind: "project",
    cardText: `# ${id}`,
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    boundarySource: "fixture",
    location: { card: "fixture", boundary: "fixture" },
  };
}

/** 捕获工厂：记录工厂收到的 RuntimeProviderOptions（只读观察），返回最小适配器。 */
function captureFactory(sink: RuntimeProviderOptions[]): (options: RuntimeProviderOptions) => RuntimeAdapter {
  return (options) => {
    sink.push(options);
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole() {
        return {
          async prompt(): Promise<void> {},
          events() { return (async function* () {})(); },
          async dispose(): Promise<void> {},
        };
      },
    };
  };
}

function makeAdapter(root: string, sink: RuntimeProviderOptions[]): RuntimeAdapter {
  return createRuntimeAdapter({
    runtime: "demo",
    gate,
    projectRoot: root,
    skillRoot: root,
    providerFactories: { demo: captureFactory(sink) },
  });
}

test("B1 按角色注入：本角色命中的声明按名收录（stdin 形式完整）；别角色声明不注入；空盘＝零声明", async () => {
  const root = makeRoot();
  try {
    writeMcpDeclaration(root, "for-x", { roles: "X", command: "node", args: "srv.js ｜ --flag", env: "TOK=env:HOME" });
    writeMcpDeclaration(root, "for-y", { roles: "Y" });
    writeMcpDeclaration(root, "for-both", { roles: "X、Y" });
    writeMcpDeclaration(root, "off", { roles: "X", status: "uninstalled" });
    writeMcpDeclaration(root, "bad", { roles: "X", text: "- 用途：只有一行\n" });
    const before = snapshotTree(root);

    const sink: RuntimeProviderOptions[] = [];
    const adapter = makeAdapter(root, sink);
    await adapter.composeContext(role("X"));
    await adapter.composeContext(role("Y"));

    const xOptions = sink[0]!;
    assert.ok(xOptions.installedMcpServers, "X 会话必须带 installedMcpServers 字段");
    assert.deepEqual(
      xOptions.installedMcpServers!.map((s) => s.name),
      ["for-both", "for-x"],
      "X 恰收命中且 installed 的两条（排序），别角色/卸载/坏件都不注入",
    );
    const forX = xOptions.installedMcpServers!.find((s) => s.name === "for-x")!;
    assert.equal(forX.command, "node");
    assert.deepEqual(forX.args, ["srv.js", "--flag"]);
    assert.deepEqual(forX.env, { TOK: "env:HOME" }, "env:NAME 引用原样（不展开）");
    const yOptions = sink.at(-1)!;
    assert.deepEqual(yOptions.installedMcpServers!.map((s) => s.name), ["for-both", "for-y"], "Y 注入面独立按角色算");

    // 纯读：装配前后盘面逐字节一致（列表读取绝不建目录/写盘）
    assert.deepEqual(snapshotTree(root), before, "providerFor 读取纯读、零写盘");
    assert.ok(!fs.existsSync(`${root}/.ans`), "不产生 .ans");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("B2 空盘零副作用：无 docs/mcp ⇒ 空数组且不建任何目录；坏件为主的项目照常装配", async () => {
  const root = makeRoot();
  try {
    const sink: RuntimeProviderOptions[] = [];
    await makeAdapter(root, sink).composeContext(role("X"));
    assert.deepEqual([...sink[0]!.installedMcpServers ?? []], [], "空盘 ⇒ 零声明");
    assert.deepEqual(fs.readdirSync(root), [], "绝不建目录（含 docs/mcp）");

    // 只有坏件：装配不抛、零清单
    writeMcpDeclaration(root, "bad", { text: "- 状态：whatever\n" });
    const sink2: RuntimeProviderOptions[] = [];
    await makeAdapter(root, sink2).composeContext(role("X"));
    assert.deepEqual([...sink2[0]!.installedMcpServers ?? []], [], "坏件不毁装配");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("B3 重建重读：同一盘面上新开会话读到当刻声明；声明改为 uninstalled 后新会话语义更新", async () => {
  const root = makeRoot();
  try {
    const sink1: RuntimeProviderOptions[] = [];
    await makeAdapter(root, sink1).composeContext(role("X"));
    assert.deepEqual([...sink1[0]!.installedMcpServers ?? []], [], "初始：未安装");

    writeMcpDeclaration(root, "added", { roles: "X" });
    const sink2: RuntimeProviderOptions[] = [];
    await makeAdapter(root, sink2).composeContext(role("X"));
    assert.deepEqual(sink2[0]!.installedMcpServers!.map((s) => s.name), ["added"], "新会话读到新声明（下次会话起生效）");

    writeMcpDeclaration(root, "added", { roles: "X", status: "uninstalled" });
    const sink3: RuntimeProviderOptions[] = [];
    await makeAdapter(root, sink3).composeContext(role("X"));
    assert.deepEqual([...sink3[0]!.installedMcpServers ?? []], [], "卸载（改声明）后新会话语义更新——下次会话摘除");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("B4 同适配器内按角色冻结（一次读取随会话冻结）：中途改盘不影响已构造的角色选项", async () => {
  const root = makeRoot();
  try {
    writeMcpDeclaration(root, "frozen", { roles: "X" });
    const sink: RuntimeProviderOptions[] = [];
    const adapter = makeAdapter(root, sink);
    const x = role("X");
    await adapter.composeContext(x);
    const first = sink[0]!.installedMcpServers!.map((s) => s.name);
    assert.deepEqual(first, ["frozen"]);
    // 中途新增声明：同一 adapter 再 composeContext（同角色对象）不再重读（providerFor 缓存语义）；
    // 换一个角色则新读（不受影响）。
    writeMcpDeclaration(root, "late", { roles: "X" });
    await adapter.composeContext(x);
    assert.equal(sink.length, 1, "同角色对象同 adapter 命中缓存（不再触发工厂）");
    await adapter.composeContext(role("Z"));
    assert.deepEqual(sink.at(-1)!.installedMcpServers!.map((s) => s.name), [], "Z 无命中");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
