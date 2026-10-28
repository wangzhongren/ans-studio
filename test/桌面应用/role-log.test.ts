// test/桌面应用/role-log.test.ts
// B 批（2026-10-28）：每角色运行日志——字段白名单、脱敏、截断、轮转、读取过滤；
// 以及 SessionManager 的事件观察器真实写入（不依赖角色上报）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ROLE_LOGS_REL,
  appendRoleLog,
  formatRoleActivityText,
  lastRoleActivityAt,
  readRoleLog,
  redactRoleLogSummary,
  roleLogPath,
} from "../../src/common/编排/role-log.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-role-log-"));
}

test("脱敏：凭据/令牌/项目外绝对路径/换行与 200 字截断", () => {
  const root = "C:\\work\\proj";
  const redacted = redactRoleLogSummary(
    `token=supersecret api_key=sk-1234567890abcdef Authorization: Bearer abcdefghijklmnop ` +
      `path ${root}\\docs\\a.md other C:\\Users\\me\\secret.txt\nsecond line`,
    root,
  );
  assert.doesNotMatch(redacted, /supersecret|sk-1234567890|abcdefghijklmnop|C:\\Users/i);
  assert.match(redacted, /docs\\a\.md|\/docs\/a\.md|docs/);
  assert.match(redacted, /\[redacted\]/);
  assert.match(redacted, /\[absolute-path\]/);
  assert.doesNotMatch(redacted, /\n/);
  assert.ok([...redacted].length <= 200);
  assert.equal([...redactRoleLogSummary("x".repeat(500), root)].length, 200);
});

test("追加/读取：字段白名单、since/limit、坏行跳过、非法角色 id fail-closed", async () => {
  const root = await tempRoot();
  try {
    const base = { kind: "tool.result", summary: "write_file 已写入 src/a.ts", tool: "write_file", status: "ok" };
    for (let i = 0; i < 5; i += 1) {
      const result = await appendRoleLog(root, "worker", { ...base, at: new Date(Date.UTC(2026, 9, 28, 0, 0, i)).toISOString() });
      assert.equal(result.ok, true);
    }
    const file = roleLogPath(root, "worker")!;
    await fs.appendFile(file, "{bad json}\n{\"v\":1,\"kind\":\"x\"}\n", "utf8");
    const read = await readRoleLog(root, { roleId: "worker", limit: 3 });
    assert.equal(read.ok, true);
    assert.equal(read.skipped, 2);
    assert.equal(read.entries.length, 3);
    assert.equal(read.entries[0].at, "2026-10-28T00:00:02.000Z");
    assert.equal(read.entries[2].at, "2026-10-28T00:00:04.000Z");
    const since = await readRoleLog(root, { roleId: "worker", since: "2026-10-28T00:00:03.000Z" });
    assert.equal(since.entries.length, 2);
    assert.match(formatRoleActivityText(read, "worker"), /运行日志/);
    assert.equal(await lastRoleActivityAt(root, "worker"), "2026-10-28T00:00:04.000Z");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("非法角色 id：返回失败（不落盘、不抛）", async () => {
  const root = await tempRoot();
  try {
    const result = await appendRoleLog(root, "../evil", { kind: "message", summary: "x" });
    assert.equal(result.ok, false);
    assert.equal(await roleLogPath(root, "a/b"), undefined);
    await assert.rejects(fs.access(path.join(root, ...ROLE_LOGS_REL.split("/"), "evil.jsonl")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("轮转：超过上限时保留 .1，读取仍按旧→新返回最近条目", async () => {
  const root = await tempRoot();
  const oldMax = process.env.ANS_ROLE_LOG_MAX_BYTES;
  const oldRot = process.env.ANS_ROLE_LOG_ROTATIONS;
  process.env.ANS_ROLE_LOG_MAX_BYTES = "200";
  process.env.ANS_ROLE_LOG_ROTATIONS = "2";
  try {
    for (let i = 0; i < 6; i += 1) {
      await appendRoleLog(root, "worker", { kind: "message", summary: `第 ${i} 条 ${"x".repeat(20)}`, at: new Date(Date.UTC(2026, 9, 28, 0, 0, i)).toISOString() });
    }
    const read = await readRoleLog(root, { roleId: "worker", limit: 10 });
    assert.equal(read.ok, true);
    assert.ok(read.entries.length > 0);
    assert.equal(read.entries[read.entries.length - 1].summary.startsWith("第 5 条"), true);
  } finally {
    if (oldMax === undefined) delete process.env.ANS_ROLE_LOG_MAX_BYTES; else process.env.ANS_ROLE_LOG_MAX_BYTES = oldMax;
    if (oldRot === undefined) delete process.env.ANS_ROLE_LOG_ROTATIONS; else process.env.ANS_ROLE_LOG_ROTATIONS = oldRot;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("SessionManager 观察器：会话消息/工具/终局自动写日志（脱敏），角色无需上报", async () => {
  const root = await tempRoot();
  const streams: Record<string, OrchestrationEvent[]> = { A: [] };
  const listing: ProjectListing = {
    projectRoot: root,
    roles: [
      { roleId: "su", cardPath: "", boundaryPath: "", cardText: "su", boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } }, builtIn: true },
      { roleId: "A", cardPath: "角色卡/A/role-card.md", boundaryPath: "角色卡/A/boundary.yaml", cardText: "A", boundary: { entries: [{ root: "project", path: "src/A.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/A/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
    governanceModel: "single",
  };
  const handle: RoleSessionHandle = {
    async send() { /* no-op */ },
    events() {
      let i = 0;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              for (let tries = 0; tries < 100; tries += 1) {
                const arr = streams.A;
                if (i < arr.length) return { value: arr[i++], done: false };
                await tick(5);
              }
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async dispose() { /* no-op */ },
  };
  const mgr = new SessionManager({
    openRoleSession: async () => handle,
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing : undefined),
    emitEvent: () => {},
  });
  try {
    await mgr.open({ projectRoot: root, roleId: "A", runtime: "demo" });
    await tick(30);
    streams.A.push(
      { kind: "message", summary: `读取 C:\\Users\\me\\secret.txt 并检查 api_key=sk-1234567890abcdef`, turnId: "turn-1" } as unknown as OrchestrationEvent,
      { kind: "accepted", summary: "write_file 完成", turnId: "turn-1", detail: { toolName: "write_file", status: "ok" } } as unknown as OrchestrationEvent,
      { kind: "settled", summary: "完成", turnId: "turn-1", detail: { outcome: "completed" } } as unknown as OrchestrationEvent,
    );
    await tick(120);
    const read = await readRoleLog(root, { roleId: "A", limit: 20 });
    assert.equal(read.ok, true);
    assert.ok(read.entries.some((entry) => entry.kind === "message"));
    assert.ok(read.entries.some((entry) => entry.kind === "tool.result" && entry.tool === "write_file"));
    assert.ok(read.entries.some((entry) => entry.kind === "turn.end" && entry.status === "completed"));
    const all = JSON.stringify(read.entries);
    assert.doesNotMatch(all, /sk-1234567890|C:\\\\Users\\\\me/);
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});
