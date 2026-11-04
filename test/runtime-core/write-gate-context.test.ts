// C1c：WriteGate 内容上下文（关闭 C1 冻结遗留 F6；P1 r2 §3.3-8）。
// 只验证「可选第二参数」的传递与向后兼容；不改写门禁判定/审批语义。
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import type { WriteGate, WriteGateContext, WriteGateOperation } from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";

const sha256 = (data: Buffer): string => createHash("sha256").update(data).digest("hex");

const toolsFor = (root: string, gate: WriteGate) =>
  new Map(buildGovernedTools(gate, { writeRoot: root }).map((tool) => [tool.name, tool]));

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-write-gate-context-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("F6/write_file：写前复核 gate 收到最终字节 sha256 与 operation=write；首次调用无上下文", async () => {
  await withRoot(async (root) => {
    const content = "第一行\n第二行\n";
    const seen: Array<WriteGateContext | undefined> = [];
    const gate: WriteGate = (target, context) => {
      seen.push(context);
      return allow(target);
    };
    const result = await toolsFor(root, gate).get("write_file")!.handler({
      name: "write_file",
      args: { path: "nested/file.txt", content },
    });
    assert.equal(result.ok, true, result.message);
    assert.equal(await readFile(path.join(root, "nested", "file.txt"), "utf8"), content);
    assert.equal(seen.length, 2);
    assert.equal(seen[0], undefined, "首次（纯路径）调用不得携带内容上下文");
    assert.deepEqual(seen[1], { contentSha256: sha256(Buffer.from(content, "utf8")), operation: "write" });
    assert.match(seen[1]!.contentSha256!, /^[0-9a-f]{64}$/);
  });
});

test("F6/edit_file：写前复核 gate 收到编辑后最终字节（BOM 保留）sha256 与 operation=edit", async () => {
  await withRoot(async (root) => {
    await writeFile(path.join(root, "doc.txt"), "\uFEFF" + "original", "utf8");
    const expected = Buffer.from("\uFEFF" + "changed", "utf8");
    const seen: Array<WriteGateContext | undefined> = [];
    const gate: WriteGate = (target, context) => {
      seen.push(context);
      return allow(target);
    };
    const result = await toolsFor(root, gate).get("edit_file")!.handler({
      name: "edit_file",
      args: { path: "doc.txt", old_string: "original", new_string: "changed" },
    });
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(await readFile(path.join(root, "doc.txt")), expected);
    assert.equal(seen.length, 2);
    assert.equal(seen[0], undefined, "首次（纯路径）调用不得携带内容上下文");
    assert.deepEqual(seen[1], { contentSha256: sha256(expected), operation: "edit" });
  });
});

test("F6/向后兼容：旧单参数 WriteGate 实现与直接单参调用零变化", async () => {
  await withRoot(async (root) => {
    const oldStyle: WriteGate = (target) => allow(target);
    assert.equal(oldStyle("any/path").allowed, true, "直接单参数调用保持可用");
    const result = await toolsFor(root, oldStyle).get("write_file")!.handler({
      name: "write_file",
      args: { path: "legacy.txt", content: "legacy" },
    });
    assert.equal(result.ok, true, result.message);
    assert.equal(await readFile(path.join(root, "legacy.txt"), "utf8"), "legacy");
  });
});

test("F6/写前复核拒绝：携带内容上下文时拒绝 ⇒ write/edit 均不落盘", async () => {
  await withRoot(async (root) => {
    await writeFile(path.join(root, "existing.txt"), "original", "utf8");
    const gate: WriteGate = (target, context) => {
      if (context?.contentSha256 !== undefined) {
        return { allowed: false, reason: "stable-write 许可缺失（fixture）", allowedByRoot: { project: [], skill: [] } };
      }
      return allow(target);
    };
    const byName = toolsFor(root, gate);
    const write = await byName.get("write_file")!.handler({
      name: "write_file",
      args: { path: "created/file.txt", content: "changed" },
    });
    assert.equal(write.ok, false);
    assert.match(write.message, /stable-write 许可缺失/);
    assert.equal(existsSync(path.join(root, "created", "file.txt")), false, "拒绝时不得创建目标文件");
    const edit = await byName.get("edit_file")!.handler({
      name: "edit_file",
      args: { path: "existing.txt", old_string: "original", new_string: "changed" },
    });
    assert.equal(edit.ok, false);
    assert.match(edit.message, /stable-write 许可缺失/);
    assert.equal(await readFile(path.join(root, "existing.txt"), "utf8"), "original", "拒绝时原文件保持不变");
  });
});

test("F6/类型形状：WriteGateContext 仅 contentSha256?/operation?（write|edit）", () => {
  const empty: WriteGateContext = {};
  const write: WriteGateContext = { contentSha256: "0".repeat(64), operation: "write" };
  const edit: WriteGateContext = { operation: "edit" };
  const operations: WriteGateOperation[] = ["write", "edit"];
  assert.deepEqual(Object.keys(empty), []);
  assert.equal(write.operation, "write");
  assert.equal(edit.operation, "edit");
  assert.deepEqual(operations, ["write", "edit"]);
  // @ts-expect-error operation 仅 write/edit
  const invalid: WriteGateOperation = "append";
  // @ts-expect-error 未定义字段不得进入上下文（不扩大写集/判定面）
  const extra: WriteGateContext = { contentSha256: "0".repeat(64), stablePermit: "forged" };
  assert.equal(typeof invalid, "string");
  assert.equal("stablePermit" in extra, true);
});
