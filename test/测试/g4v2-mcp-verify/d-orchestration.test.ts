// test/测试/g4v2-mcp-verify/d-orchestration.test.ts —— D 域：编排（第四棵树 docs/mcp ＋能力位透传链）。
//
// 独立构造：经 `openRoleSession` 真实装配捕获 gate 与 AdapterCapabilities（与实施方测试不同的路径：
// 会话式入口＋行为矩阵），再以捕获面驱动 `createRuntimeAdapterFactory` 核对受治理工具注册（行为侧）。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { openRoleSession, createRuntimeAdapterFactory } from "../../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities } from "../../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";
import type { CustomerInputRequest, RuntimeAdapter, RuntimeProviderOptions, WriteGate, InstallMcpFn, UninstallMcpFn } from "../../../src/model/runtime.ts";
import { makeRoot } from "./helpers.ts";
import fs from "node:fs";

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

function captureAdapter(sink: Captured): (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter {
  return (gate, capabilities) => {
    sink.gate = gate;
    sink.caps = capabilities;
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

function genesisProject(root: string): ProjectConfig {
  return { projectRoot: root, skillRoot: root, roles: {}, builtInRoles: ["su"], genesisBootstrap: { source: "G-4 V2 独立验证：客户导入空项目" } };
}

function projectWithRole(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "G-4 V2 独立验证夹具" } },
  };
}

function makeProjectRoot(): string {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, "角色卡", "X"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "X", "role-card.md"), "# 角色 X（G-4 V2 复验夹具）\n");
  fs.writeFileSync(path.join(root, "角色卡", "X", "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/X.ts\n    purpose: 复验夹具条目\n");
  return root;
}

test("D1 第四棵树矩阵：docs/mcp 树内免确认直写（相对/子路径/绝对）、前缀负例、穿越归一；全程零确认", async () => {
  const root = makeProjectRoot();
  const asked: CustomerInputRequest[] = [];
  try {
    const sink: Captured = {};
    await openRoleSession(
      { roleId: "su", project: genesisProject(root), customerInput: async (req) => { asked.push(req); return { outcome: "answered" as const, value: { confirmed: true } }; } },
      { createAdapter: captureAdapter(sink) },
    );
    const gate = sink.gate!;
    assert.ok(gate, "su 会话应捕获 gate");
    for (const p of ["docs/mcp/srv.md", "docs/mcp/a/b/深层.md", path.join(root, "docs", "mcp", "x.md"), "docs/mcp/../mcp/归一.md"]) {
      assert.equal(gate(p).allowed, true, `预授权树内应放行：${p}`);
    }
    assert.equal(asked.length, 0, "预授权直写零确认（无卡）");
    // 前缀负例（段比较）与逃逸
    assert.equal(gate("docs/mcp2/x.md").allowed, false, "docs/mcp2 不被 docs/mcp 覆盖");
    assert.equal(gate("docs/mcpX").allowed, false, "docs/mcpX 不被覆盖");
    assert.equal(gate("docs/mcp/../su2/x.md").allowed, false, "「..」归一逃出四棵树（docs/su2）且未确认 ⇒ 拒");
    // 树外：确认前拒 → 经确认发行后放行（逐条确认语义未变）
    assert.equal(gate("docs/其他.md").allowed, false, "树外未确认仍拒");
    const customerInput = sink.caps?.customerInput;
    assert.ok(customerInput, "su 会话应有（包装后的）客户通道");
    // 2026-10-19 呈现前完整性闸：声明路径后须有可核对正文，卡片才呈现/发行。
    await customerInput({ kind: "confirm", title: "写 docs/其他.md", preview: "docs/其他.md\n\n确认正文：树外写入的真实正文。\n" }, { turnId: "T-1" });
    assert.equal(asked.length, 1, "树外写盘恰一次确认请求");
    assert.equal(gate("docs/其他.md").allowed, true, "经确认发行后放行");
    assert.equal(gate("docs/其他2.md").allowed, false, "确认集精确：未列入的路径仍拒");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("D2 非 su 不变：项目角色写 docs/mcp 仍拒（预授权不扩散）；重建（新开会话）后 su 树仍免确认", async () => {
  const root = makeProjectRoot();
  try {
    const xSink: Captured = {};
    await openRoleSession({ roleId: "X", project: projectWithRole(root) }, { createAdapter: captureAdapter(xSink) });
    const xGate = xSink.gate!;
    assert.equal(xGate("docs/mcp/srv.md").allowed, false, "项目角色写 docs/mcp 仍拒（预授权仅 su）");
    assert.equal(xGate("docs/skills/a/SKILL.md").allowed, false, "doc2s/skills 对项目角色也不扩散");
    assert.equal(xGate("src/X.ts").allowed, true, "X 写自己边界内条目照常可");

    // 重建语义：新开一次 su 会话（＝重建路径同口径），四棵树仍免确认
    const suSink = new Map<number, Captured>();
    for (let generation = 0; generation < 2; generation += 1) {
      const sink: Captured = {};
      suSink.set(generation, sink);
      await openRoleSession({ roleId: "su", project: genesisProject(root) }, { createAdapter: captureAdapter(sink) });
    }
    const gate = suSink.get(1)!.gate!;
    for (const p of ["docs/su/memo.md", "docs/contracts/c-v1.md", "docs/skills/s/SKILL.md", "docs/mcp/m.md"]) {
      assert.equal(gate(p).allowed, true, `重建后四棵树仍免确认：${p}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("D3 透传链（仅 su）：su 会话两能力原样透传；项目角色即便误给也零注入", async () => {
  const root = makeProjectRoot();
  try {
    const installFn: InstallMcpFn = async () => ({ ok: false, reason: "fixture", message: "fixture" });
    const uninstallFn: UninstallMcpFn = async () => ({ ok: false, reason: "fixture", message: "fixture" });

    const suSink: Captured = {};
    await openRoleSession(
      { roleId: "su", project: genesisProject(root), installMcp: installFn, uninstallMcp: uninstallFn },
      { createAdapter: captureAdapter(suSink) },
    );
    assert.equal(suSink.caps?.installMcp, installFn, "su：installMcp 以同一引用透传（字段名逐字）");
    assert.equal(suSink.caps?.uninstallMcp, uninstallFn, "su：uninstallMcp 以同一引用透传");

    const xSink: Captured = {};
    await openRoleSession(
      { roleId: "X", project: projectWithRole(root), installMcp: installFn, uninstallMcp: uninstallFn },
      { createAdapter: captureAdapter(xSink) },
    );
    assert.equal(xSink.caps?.installMcp, undefined, "项目角色：误给 installMcp 也零注入（工具不注册）");
    assert.equal(xSink.caps?.uninstallMcp, undefined, "项目角色：误给 uninstallMcp 也零注入");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("D4 行为侧收口：捕获的能力面喂给生产适配器工厂——su 注册两工具、项目角色零注册（注入才注册）", async () => {
  const root = makeProjectRoot();
  try {
    const installFn: InstallMcpFn = async () => ({ ok: false, reason: "fixture", message: "fixture" });
    const suSink: Captured = {};
    await openRoleSession(
      { roleId: "su", project: genesisProject(root), installMcp: installFn },
      { createAdapter: captureAdapter(suSink) },
    );
    const captured: RuntimeProviderOptions[] = [];
    const capture: (options: RuntimeProviderOptions) => RuntimeAdapter = (options) => {
      captured.push(options);
      return { async composeContext() { return { systemPrompt: "" }; }, async bindRole() { return { async prompt() {}, events() { return (async function* () {})(); }, async dispose() {} }; } };
    };
    const suFactory = createRuntimeAdapterFactory(genesisProject(root), "demo", { providerFactories: { demo: capture } });
    const suAdapter = suFactory(suSink.gate!, suSink.caps);
    await suAdapter.composeContext({ id: "su", kind: "built-in-governance", cardText: "", boundary: { entries: [], boundarySource: "x", acceptance: { accepted: true, source: "x" } }, boundarySource: "x", location: { card: "", boundary: "" } });
    const suToolNames = captured.at(-1)!.tools.map((t) => t.name);
    assert.ok(suToolNames.includes("install_mcp"), `su 会话工具面须含 install_mcp：${JSON.stringify(suToolNames)}`);
    assert.equal(suToolNames.includes("uninstall_mcp"), false, "未注入的能力（uninstallMcp）不注册");

    const xSink: Captured = {};
    await openRoleSession(
      { roleId: "X", project: projectWithRole(root), installMcp: installFn },
      { createAdapter: captureAdapter(xSink) },
    );
    const xFactory = createRuntimeAdapterFactory(projectWithRole(root), "demo", { providerFactories: { demo: capture } });
    const xAdapter = xFactory(xSink.gate!, xSink.caps);
    await xAdapter.composeContext({ id: "X", kind: "project", cardText: "", boundary: { entries: [], boundarySource: "x", acceptance: { accepted: true, source: "x" } }, boundarySource: "x", location: { card: "", boundary: "" } });
    const xToolNames = captured.at(-1)!.tools.map((t) => t.name);
    assert.equal(xToolNames.includes("install_mcp"), false, `项目角色即便上游误给也零注册：${JSON.stringify(xToolNames)}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
