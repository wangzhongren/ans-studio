// test/测试/governance-e2e-auto/h-list-dir.test.ts
// 场景 8（离线端到端）：**list_dir**——角色可用列目录；敏感项不列名；越界拒绝；
// read_file 遇目录明确提示改用 list_dir。
//
// 直接调运行时核心 `buildGovernedTools`（角色会话同一来源），并用真实 `openRoleSession`
// 的项目角色脚本跑一遍 list_dir，证明工具确实在普通角色工具面内。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import type { ToolDefinition, WriteGate } from "../../../src/model/runtime.ts";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { GOV_REL, scriptedAdapterFactory, seedTrioProject, type ToolResultRecord } from "./fixture.ts";

const denyGate: WriteGate = () => ({ allowed: false, reason: "只读验收", allowedByRoot: { project: [], skill: [] } });

function toolsOf(root: string): Map<string, ToolDefinition> {
  return new Map(buildGovernedTools(denyGate, { readRoot: root }).map((tool) => [tool.name, tool]));
}

function plant(root: string): void {
  seedTrioProject(root, ["executor"]);
  const write = (rel: string, content: string): void => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  };
  write("docs/a.md", "# 文档 A\n");
  write("docs/audit/log.md", "审计记录（应用私有）\n");
  write("src/index.ts", "export const x = 1;\n");
  write(".env", "ANS_SENTINEL=DO_NOT_LEAK\n");
  write(".git/config", "[core]\n");
  write("secret.pem", "-----BEGIN PRIVATE KEY-----\n");
  write("api-key.txt", "token-value\n");
}

async function consume(handle: { send(text: string): Promise<void>; events(): AsyncIterable<{ kind?: string }> }): Promise<void> {
  await handle.send("列出目录");
  for await (const event of handle.events()) {
    if (event.kind === "settled") break;
  }
}

test("场景8a：普通角色工具面含 list_dir；目录名带 /；敏感项不列名", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-list-dir-"));
  try {
    plant(root);
    const tools = toolsOf(root);
    assert.equal(tools.has("list_dir"), true, "普通角色工具面必须含 list_dir");

    const rootList = await tools.get("list_dir")!.handler({ name: "list_dir", args: {} });
    assert.equal(rootList.ok, true, rootList.message);
    for (const visible of ["docs/", "角色卡/", "src/"]) {
      assert.ok(rootList.message.includes(visible), `根目录应列出 ${visible}`);
    }
    for (const hidden of [".env", ".git", ".ans", "secret.pem", "api-key.txt"]) {
      assert.equal(rootList.message.includes(hidden), false, `敏感项不得列名：${hidden}`);
    }

    const docs = await tools.get("list_dir")!.handler({ name: "list_dir", args: { path: "docs" } });
    assert.equal(docs.ok, true, docs.message);
    assert.ok(docs.message.includes("a.md"), "docs 下普通文件应列出");
    assert.equal(docs.message.includes("audit"), false, "docs/audit 不列名");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("场景8b：敏感目录/越界/文件路径全部拒绝，文案如实", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-list-dir-deny-"));
  const outside = mkdtempSync(path.join(tmpdir(), "ans-list-dir-outside-"));
  try {
    plant(root);
    const tools = toolsOf(root);

    const sensitive = await tools.get("list_dir")!.handler({ name: "list_dir", args: { path: ".ans" } });
    assert.equal(sensitive.ok, false);
    assert.match(sensitive.message, /敏感文件\/目录（已拒绝）/);

    const traversal = await tools.get("list_dir")!.handler({ name: "list_dir", args: { path: "../outside" } });
    assert.equal(traversal.ok, false);
    assert.match(traversal.message, /项目根之外（已拒绝）/);

    const absoluteOutside = await tools.get("list_dir")!.handler({ name: "list_dir", args: { path: outside } });
    assert.equal(absoluteOutside.ok, false);
    assert.match(absoluteOutside.message, /项目根之外（已拒绝）/);

    const file = await tools.get("list_dir")!.handler({ name: "list_dir", args: { path: "docs/a.md" } });
    assert.equal(file.ok, false);
    assert.match(file.message, /目标不是目录（读取文件请用 read_file）/);

    const missing = await tools.get("list_dir")!.handler({ name: "list_dir", args: { path: "docs/not-exist" } });
    assert.equal(missing.ok, false);
    assert.match(missing.message, /路径不存在或不可访问/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("场景8c：read_file 遇目录提示改用 list_dir", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-read-dir-"));
  try {
    plant(root);
    const tools = toolsOf(root);
    const result = await tools.get("read_file")!.handler({ name: "read_file", args: { path: "docs" } });
    assert.equal(result.ok, false);
    assert.match(result.message, /是目录——请改用 list_dir/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("场景8d：真实项目角色会话可调用 list_dir（工具面端到端）", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-list-dir-session-"));
  try {
    plant(root);
    const listing = await listProject(root);
    const project = buildProjectConfig(listing, { accepted: true, source: "test:list-dir" }, {}, GOV_REL);
    const results: ToolResultRecord[] = [];
    const handle = await openRoleSession(
      { roleId: "executor", project, taskId: "T-list-dir", runtime: "demo" },
      {
        createAdapter: scriptedAdapterFactory({
          root,
          scriptForRole: (ctx) => (ctx.roleId === "executor" ? [{ name: "list_dir", args: { path: "docs" } }] : []),
          onResult: (record) => results.push(record),
        }),
      },
    );
    await consume(handle);
    await handle.dispose();
    assert.equal(results.length, 1);
    assert.equal(results[0]!.name, "list_dir");
    assert.equal(results[0]!.ok, true, results[0]!.message);
    assert.ok(results[0]!.message.includes("docs"), "会话内 list_dir 返回目录内容");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
