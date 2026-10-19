// test/编排/governance-ledger.test.ts
// W2（2026-10-17）治理账本（评审 §5.7）：append-only `.ans/governance/ledger.jsonl`。
//
// 覆盖：
//   ① append/read 往返（字段逐字保留、append 顺序 = 读取顺序）；
//   ② 进程内按项目串行：并发 append 不交错、不丢行；
//   ③ 坏行/不可读 → `errors`（坏行跳过），文件不存在 → 空账本且无错误；
//   ④ fsync 失败 → `{ok:false}` 如实返回、行已写入但**不回滚**（「账本失败不翻转」）；
//   ⑤ 快照刷新 helper；条目形状非法 → 拒写、零副作用。
//
// 全部临时目录，用完清理；不读 `.env`、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendGovernanceLedger,
  flushGovernanceLedger,
  governanceLedgerPath,
  readGovernanceLedger,
  refreshGovernanceLedgerSnapshot,
  type GovernanceLedgerEntry,
} from "../../src/common/编排/governance-ledger.ts";

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-ledger-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

function entry(over: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    at: "2026-10-17T00:00:00.000Z",
    kind: "customer.decision",
    actorRoleId: "rapporteur",
    power: "proposal",
    flowId: "flow-a",
    decisionKind: "proposal-accept",
    customerDecision: "accepted",
    ...over,
  };
}

test("append/read：一行一条 JSON、字段原样保留、append 顺序即读取顺序", async () => {
  await withRoot(async (root) => {
    assert.deepEqual(await readGovernanceLedger(root), { entries: [], errors: [] }, "文件不存在 → 空账本、无错误");

    const first = entry({
      at: "2026-10-17T00:00:01.000Z",
      decisionEvidence: { kind: "customer-input", toolCallId: "call-1", turnId: "turn-1", sessionId: "s-1" },
      paths: ["角色卡/A/role-card.md"],
    });
    const second = entry({
      at: "2026-10-17T00:00:02.000Z",
      kind: "dispatch.accepted",
      actorRoleId: "convener",
      power: "schedule",
      stepId: "impl",
      targetRoleId: "A",
    });
    assert.deepEqual(await appendGovernanceLedger(root, first), { ok: true });
    assert.deepEqual(await appendGovernanceLedger(root, second), { ok: true });

    const read = await readGovernanceLedger(root);
    assert.deepEqual(read.errors, []);
    assert.equal(read.entries.length, 2);
    assert.deepEqual(read.entries[0], first);
    assert.deepEqual(read.entries[1], second);

    const lines = readFileSync(governanceLedgerPath(root), "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));
  });
});

test("串行：同一项目并发 append 全部落盘、每行合法、不交错", async () => {
  await withRoot(async (root) => {
    const results = await Promise.all(
      Array.from({ length: 32 }, (_, i) =>
        appendGovernanceLedger(root, entry({ at: `2026-10-17T00:00:${String(i).padStart(2, "0")}.000Z` })),
      ),
    );
    assert.equal(results.every((r) => r.ok), true);
    const lines = readFileSync(governanceLedgerPath(root), "utf8").trim().split("\n");
    assert.equal(lines.length, 32, "不得丢行");
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line), "不得写入半行/交错行");
    const read = await readGovernanceLedger(root);
    assert.equal(read.entries.length, 32);
    assert.equal(new Set(read.entries.map((e) => e.at)).size, 32);
  });
});

test("坏行：跳过坏行并记 errors；合法行仍返回（门禁见 errors 非空即 fail-closed）", async () => {
  await withRoot(async (root) => {
    const abs = governanceLedgerPath(root);
    mkdirSync(join(root, ".ans", "governance"), { recursive: true });
    writeFileSync(
      abs,
      [
        JSON.stringify(entry()),
        "{ not json",
        JSON.stringify({ kind: "customer.decision" }), // 缺必填字段
        JSON.stringify(entry({ at: "2026-10-17T00:00:03.000Z" })),
      ].join("\n") + "\n",
    );
    const read = await readGovernanceLedger(root);
    assert.equal(read.entries.length, 2);
    assert.equal(read.errors.length, 2);
    assert.match(read.errors[0], /第 2 行不是合法 JSON/);
    assert.match(read.errors[1], /第 3 行账本条目形状非法/);
  });
});

test("fsync 失败：如实返回 {ok:false}、不回滚已写入的行、不抛给调用方", async () => {
  await withRoot(async (root) => {
    let wrote = "";
    const result = await appendGovernanceLedger(root, entry(), {
      openFile: async () => ({
        async write(content: string) {
          wrote += content;
        },
        async sync() {
          throw new Error("fsync 失败（测试注入）");
        },
        async close() {},
      }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /fsync 失败（测试注入）/);
    assert.match(wrote, /\n$/, "失败前已写入一行（不回滚）");
    assert.equal(existsSync(governanceLedgerPath(root)), false, "注入句柄未真正落盘（生产路径由 node:fs 写）");
  });
});

test("刷新快照：返回只读 entries/errors；空项目为合法空快照", async () => {
  await withRoot(async (root) => {
    assert.deepEqual(await refreshGovernanceLedgerSnapshot(root), { entries: [], errors: [] });
    await appendGovernanceLedger(root, entry());
    await flushGovernanceLedger(root);
    const snapshot = await refreshGovernanceLedgerSnapshot(root);
    assert.equal(snapshot.entries.length, 1);
    assert.deepEqual(snapshot.errors, []);
  });
});

test("非法条目形状：拒写、零副作用（不建 .ans）", async () => {
  await withRoot(async (root) => {
    const bad = { at: "x", kind: "customer.decision", actorRoleId: "r" } as unknown as GovernanceLedgerEntry;
    const result = await appendGovernanceLedger(root, bad);
    assert.equal(result.ok, false);
    assert.equal(existsSync(join(root, ".ans")), false);
  });
});

test("自动派发去重兼容：dispatch.accepted(targetRoleId=verifier, stepId=verification) 可记录/读回；旧条目缺 trigger 仍合法", async () => {
  await withRoot(async (root) => {
    // 2026-10-19：应用在流程齐备后自动派发 Proof / 验收——账本记录形状（不新增 kind/字段）。
    const autoDispatch: GovernanceLedgerEntry = {
      at: "2026-10-19T00:00:02.000Z",
      kind: "dispatch.accepted",
      actorRoleId: "app",
      power: "app",
      trigger: "settle",
      flowId: "flow-a",
      stepId: "verification",
      targetRoleId: "verifier",
      messageSummary: "流程齐备，自动派发 Proof / 验收",
    };
    // 旧条目（2026-10-18 前）：无 trigger、actorRoleId=convener——读回必须原样保留、不得报错。
    const legacyDispatch: GovernanceLedgerEntry = {
      at: "2026-10-18T00:00:01.000Z",
      kind: "dispatch.accepted",
      actorRoleId: "convener",
      power: "schedule",
      flowId: "flow-a",
      stepId: "impl",
      targetRoleId: "A",
    };
    assert.deepEqual(await appendGovernanceLedger(root, legacyDispatch), { ok: true });
    assert.deepEqual(await appendGovernanceLedger(root, autoDispatch), { ok: true });

    const read = await readGovernanceLedger(root);
    assert.deepEqual(read.errors, [], "新旧条目都必须可读（向后兼容）");
    assert.deepEqual(read.entries[0], legacyDispatch);
    assert.deepEqual(read.entries[1], autoDispatch);

    // 与桌面自动派发同一去重谓词：同一 flowId+stepId 已有 dispatch.accepted ⇒ 不重复派发。
    const alreadyDispatched = (
      entries: readonly GovernanceLedgerEntry[],
      flowId: string,
      stepId: string,
    ): boolean =>
      entries.some((e) => e.kind === "dispatch.accepted" && e.flowId === flowId && e.stepId === stepId);
    assert.equal(alreadyDispatched(read.entries, "flow-a", "verification"), true, "自动派发记录可用于去重");
    assert.equal(alreadyDispatched(read.entries, "flow-b", "verification"), false, "不同 flow 不受影响");
    assert.equal(alreadyDispatched(read.entries, "flow-a", "impl"), true, "执行步骤派发照旧");
  });
});
