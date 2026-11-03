// test/项目管理/shared/jsonl-ledger.test.ts
// 项目管理（2026-11-03，customer-authorization-plane A2）：共享 JSONL 账本辅助单测。
//
// 覆盖 A2 冻结契约：追加（建目录/单行/多行/并发串行/失败不抛）、轮转边界与命名
// （.N 最旧、.1 最新、越界份清理、rotations=1）、旧→新读取（files/空行/CRLF/仅轮转段）、
// 坏行与 ignore 计数、文件级读失败、路径参数化、limits、multiline 防御、段文件清单。
// 全部使用系统临时目录，用后清理，不指向仓库真实 `.ans`。

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  DEFAULT_JSONL_MAX_BYTES,
  DEFAULT_JSONL_ROTATIONS,
  appendJsonlLine,
  jsonlSegmentFiles,
  readJsonlLedger,
  type JsonlParseResult,
} from "../../../src/common/shared/jsonl-ledger.ts";

function parseJson(raw: string): JsonlParseResult<Record<string, unknown>> {
  const value = JSON.parse(raw) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "不是对象" };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

async function tempLedger(name = "ledger.jsonl"): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-jsonl-ledger-"));
  return { dir, file: path.join(dir, "state", name) };
}

async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

test("追加：递归建目录、单行精确、多行保序", async () => {
  const { dir, file } = await tempLedger();
  try {
    const first = await appendJsonlLine(file, '{"k":1}');
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.path, path.resolve(file));
    const second = await appendJsonlLine(file, '{"k":2}');
    assert.equal(second.ok, true);
    assert.equal(await fs.readFile(file, "utf8"), '{"k":1}\n{"k":2}\n');
  } finally {
    await cleanup(dir);
  }
});

test("并发追加：串行链保证 32 行全部落盘、逐行完整且无交错", async () => {
  const { dir, file } = await tempLedger();
  try {
    const results = await Promise.all(
      Array.from({ length: 32 }, (_, n) => appendJsonlLine(file, JSON.stringify({ n }))),
    );
    assert.deepEqual(results.filter((result) => !result.ok), []);
    const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/).filter((line) => line !== "");
    assert.equal(lines.length, 32);
    const ns = lines.map((line) => (JSON.parse(line) as { n: number }).n).sort((a, b) => a - b);
    assert.deepEqual(ns, Array.from({ length: 32 }, (_, n) => n));
  } finally {
    await cleanup(dir);
  }
});

test("轮转边界：恰好等于上限不轮转，跨阈值才轮转", async () => {
  const { dir, file } = await tempLedger();
  const line = JSON.stringify({ n: "a" });
  const incoming = Buffer.byteLength(`${line}\n`, "utf8");
  try {
    await appendJsonlLine(file, line, { maxBytes: incoming * 2, rotations: 3 });
    await appendJsonlLine(file, line, { maxBytes: incoming * 2, rotations: 3 });
    assert.equal(await exists(`${file}.1`), false);
    assert.equal(await fs.readFile(file, "utf8"), `${line}\n${line}\n`);

    await appendJsonlLine(file, '{"n":"b"}', { maxBytes: incoming * 2, rotations: 3 });
    assert.equal(await fs.readFile(`${file}.1`, "utf8"), `${line}\n${line}\n`);
    assert.equal(await fs.readFile(file, "utf8"), '{"n":"b"}\n');
  } finally {
    await cleanup(dir);
  }
});

test("轮转命名：当前→.1、原 .i-1→.i；.1 最新、.N 最旧", async () => {
  const { dir, file } = await tempLedger();
  const incoming = Buffer.byteLength('{"n":"a"}\n', "utf8");
  try {
    await appendJsonlLine(file, '{"n":"a"}', { maxBytes: incoming, rotations: 3 });
    await appendJsonlLine(file, '{"n":"b"}', { maxBytes: incoming, rotations: 3 });
    await appendJsonlLine(file, '{"n":"c"}', { maxBytes: incoming, rotations: 3 });
    assert.equal(await fs.readFile(file, "utf8"), '{"n":"c"}\n');
    assert.equal(await fs.readFile(`${file}.1`, "utf8"), '{"n":"b"}\n');
    assert.equal(await fs.readFile(`${file}.2`, "utf8"), '{"n":"a"}\n');
    assert.equal(await exists(`${file}.3`), false);
  } finally {
    await cleanup(dir);
  }
});

test("轮转：预置越界份 .N+1 在轮转时被清理", async () => {
  const { dir, file } = await tempLedger();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "x\n", "utf8");
    await fs.writeFile(`${file}.3`, "junk\n", "utf8");
    const result = await appendJsonlLine(file, '{"n":"a"}', { maxBytes: 1, rotations: 2 });
    assert.equal(result.ok, true);
    assert.equal(await exists(`${file}.3`), false);
    assert.equal(await fs.readFile(`${file}.1`, "utf8"), "x\n");
    assert.equal(await fs.readFile(file, "utf8"), '{"n":"a"}\n');
  } finally {
    await cleanup(dir);
  }
});

test("轮转：rotations=1 只保留 .1，不产生 .2", async () => {
  const { dir, file } = await tempLedger();
  const incoming = Buffer.byteLength('{"n":"a"}\n', "utf8");
  try {
    await appendJsonlLine(file, '{"n":"a"}', { maxBytes: incoming, rotations: 1 });
    await appendJsonlLine(file, '{"n":"b"}', { maxBytes: incoming, rotations: 1 });
    await appendJsonlLine(file, '{"n":"c"}', { maxBytes: incoming, rotations: 1 });
    assert.equal(await fs.readFile(file, "utf8"), '{"n":"c"}\n');
    assert.equal(await fs.readFile(`${file}.1`, "utf8"), '{"n":"b"}\n');
    assert.equal(await exists(`${file}.2`), false);
  } finally {
    await cleanup(dir);
  }
});

test("读取顺序：.N→…→.1→当前 为旧→新，files 仅含存在段", async () => {
  const { dir, file } = await tempLedger();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.2`, '{"v":1}\n', "utf8");
    await fs.writeFile(`${file}.1`, '{"v":2}\n', "utf8");
    await fs.writeFile(file, '{"v":3}\n', "utf8");
    const result = await readJsonlLedger(file, parseJson, { rotations: 3 });
    assert.deepEqual(result.values.map((value) => value.v), [1, 2, 3]);
    assert.deepEqual(result.files, [path.basename(`${file}.2`), path.basename(`${file}.1`), path.basename(file)]);
    assert.deepEqual(result.errors, []);
    assert.equal(result.badLines, 0);
    assert.equal(result.ignoredLines, 0);
  } finally {
    await cleanup(dir);
  }
});

test("读取：不存在/空文件/仅轮转段/尾随换行/空行/CRLF", async () => {
  const { dir, file } = await tempLedger();
  try {
    let result = await readJsonlLedger(file, parseJson);
    assert.deepEqual(result.files, [path.basename(file)]);
    assert.deepEqual(result.values, []);
    assert.deepEqual(result.errors, []);

    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "", "utf8");
    result = await readJsonlLedger(file, parseJson);
    assert.deepEqual(result.files, [path.basename(file)]);
    assert.deepEqual(result.values, []);
    assert.deepEqual(result.errors, []);

    await fs.writeFile(file, '{"v":1}\n\n{"v":2}\n', "utf8");
    result = await readJsonlLedger(file, parseJson);
    assert.deepEqual(result.values.map((value) => value.v), [1, 2]);
    assert.equal(result.badLines, 0);

    await fs.writeFile(file, '{"v":1}\r\n{"v":2}\r\n', "utf8");
    result = await readJsonlLedger(file, parseJson);
    assert.deepEqual(result.values.map((value) => value.v), [1, 2]);
    assert.deepEqual(result.errors, []);

    const onlyRotated = path.join(dir, "state", "rotated.jsonl");
    await fs.writeFile(`${onlyRotated}.1`, '{"v":9}\n', "utf8");
    result = await readJsonlLedger(onlyRotated, parseJson, { rotations: 2 });
    assert.deepEqual(result.values.map((value) => value.v), [9]);
    assert.deepEqual(result.files, [path.basename(`${onlyRotated}.1`), path.basename(onlyRotated)]);
    assert.deepEqual(result.errors, []);
  } finally {
    await cleanup(dir);
  }
});

test("读取坏行：坏 JSON、parser 拒绝、ignore 计数、空行跳过、basename+行号", async () => {
  const { dir, file } = await tempLedger();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const content = [
      '{"kind":"ok","v":1}',
      "not json",
      '{"kind":"bad","v":2}',
      '{"kind":"skip","v":3}',
      "",
      '{"kind":"ok","v":4}',
    ].join("\n");
    await fs.writeFile(file, `${content}\n`, "utf8");
    const parser = (raw: string): JsonlParseResult<Record<string, unknown>> => {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (value["kind"] === "skip") return { ok: "ignore" };
      if (value["kind"] !== "ok") return { ok: false, message: "字段非法" };
      return { ok: true, value };
    };
    const result = await readJsonlLedger(file, parser);
    assert.deepEqual(result.values.map((value) => value.v), [1, 4]);
    assert.equal(result.badLines, 2);
    assert.equal(result.ignoredLines, 1);
    assert.equal(result.errors.length, 2);
    assert.equal(result.errors[0]?.file, path.basename(file));
    assert.equal(result.errors[0]?.line, 2);
    assert.match(result.errors[0]?.message ?? "", /JSON 坏行/);
    assert.equal(result.errors[1]?.file, path.basename(file));
    assert.equal(result.errors[1]?.line, 3);
    assert.equal(result.errors[1]?.message, "字段非法");
  } finally {
    await cleanup(dir);
  }
});

test("读取坏段：文件级读失败记 line=0 并继续读当前段", async () => {
  const { dir, file } = await tempLedger();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.mkdir(`${file}.1`);
    await fs.writeFile(file, '{"v":7}\n', "utf8");
    const result = await readJsonlLedger(file, parseJson, { rotations: 1 });
    assert.deepEqual(result.values.map((value) => value.v), [7]);
    assert.deepEqual(result.files, [path.basename(`${file}.1`), path.basename(file)]);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.file, path.basename(`${file}.1`));
    assert.equal(result.errors[0]?.line, 0);
    assert.equal(result.badLines, 0);
  } finally {
    await cleanup(dir);
  }
});

test("路径参数化：两本账各自串行/轮转，互不影响", async () => {
  const { dir, file } = await tempLedger("a.jsonl");
  const other = path.join(dir, "state", "b.jsonl");
  const incoming = Buffer.byteLength('{"n":"x"}\n', "utf8");
  try {
    await Promise.all([
      appendJsonlLine(file, '{"n":"a1"}', { maxBytes: incoming, rotations: 2 }),
      appendJsonlLine(other, '{"n":"b1"}', { maxBytes: 1024, rotations: 2 }),
      appendJsonlLine(file, '{"n":"a2"}', { maxBytes: incoming, rotations: 2 }),
      appendJsonlLine(other, '{"n":"b2"}', { maxBytes: 1024, rotations: 2 }),
    ]);
    assert.equal(await fs.readFile(other, "utf8"), '{"n":"b1"}\n{"n":"b2"}\n');
    assert.equal(await exists(`${other}.1`), false);
    assert.equal(await fs.readFile(file, "utf8"), '{"n":"a2"}\n');
    assert.equal(await fs.readFile(`${file}.1`, "utf8"), '{"n":"a1"}\n');
  } finally {
    await cleanup(dir);
  }
});

test("limits：maxBytes/rotations 参数化；默认常量与 task-state 现状一致", async () => {
  assert.equal(DEFAULT_JSONL_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(DEFAULT_JSONL_ROTATIONS, 3);
  const { dir, file } = await tempLedger();
  const line = '{"n":"a"}';
  const incoming = Buffer.byteLength(`${line}\n`, "utf8");
  try {
    for (let i = 0; i < 4; i += 1) {
      await appendJsonlLine(file, line, { maxBytes: incoming, rotations: 2 });
    }
    assert.equal(await exists(`${file}.2`), true);
    assert.equal(await exists(`${file}.3`), false);
  } finally {
    await cleanup(dir);
  }
});

test("multiline 防御：含裸换行的 jsonText 拒绝且不落盘", async () => {
  const { dir, file } = await tempLedger();
  try {
    const withNewline = await appendJsonlLine(file, '{"a":\n1}');
    assert.equal(withNewline.ok, false);
    if (!withNewline.ok) assert.equal(withNewline.code, "multiline");
    const withCarriageReturn = await appendJsonlLine(file, '{"a":\r1}');
    assert.equal(withCarriageReturn.ok, false);
    if (!withCarriageReturn.ok) assert.equal(withCarriageReturn.code, "multiline");
    assert.equal(await exists(file), false);
    assert.equal(await exists(path.dirname(file)), false);
  } finally {
    await cleanup(dir);
  }
});

test("追加失败：不抛，返回结构化错误（cause 保留原错误）", async () => {
  const { dir, file } = await tempLedger();
  try {
    await fs.mkdir(file, { recursive: true });
    const result = await appendJsonlLine(file, '{"a":1}', { maxBytes: 1024 * 1024, rotations: 3 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(typeof result.message, "string");
      assert.equal(typeof result.code, "string");
      assert.ok(result.cause instanceof Error);
    }
  } finally {
    await cleanup(dir);
  }
});

test("jsonlSegmentFiles：.N→…→.1→当前（绝对路径）", () => {
  const file = path.join(os.tmpdir(), "ans-jsonl-segments", "ledger.jsonl");
  const resolved = path.resolve(file);
  assert.deepEqual(jsonlSegmentFiles(file, 3), [`${resolved}.3`, `${resolved}.2`, `${resolved}.1`, resolved]);
  assert.deepEqual(jsonlSegmentFiles(file, 1), [`${resolved}.1`, resolved]);
});

test("并发+轮转：串行链下每行完整，保留份数内旧→新顺序正确", async () => {
  const { dir, file } = await tempLedger();
  try {
    // maxBytes=1：当前文件一旦有内容就轮转；rotations=25 足以保留 20 行。
    await Promise.all(
      Array.from({ length: 20 }, (_, n) => appendJsonlLine(file, JSON.stringify({ n }), { maxBytes: 1, rotations: 25 })),
    );
    const result = await readJsonlLedger(file, parseJson, { rotations: 25 });
    assert.deepEqual(result.values.map((value) => value.n), Array.from({ length: 20 }, (_, n) => n));
    assert.equal(result.badLines, 0);
    assert.deepEqual(result.errors, []);
    assert.ok(result.files.length <= 21, `段数超出保留份数：${result.files.length}`);
  } finally {
    await cleanup(dir);
  }
});
