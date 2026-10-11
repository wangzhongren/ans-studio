// test/项目管理/shared/atomic-write.test.ts
// 项目管理：对跨角色共享**原子写**原语 `src/common/shared/atomic-write.ts` 的验证。
//
// 重点**不是** happy path，而是那个**Windows 偶发失败**的根因是否被正确处置：
//   `rename` **覆盖已存在目标**在 Windows 上会**瞬时** `EPERM`（实时防护/索引器短暂持有目标句柄，
//   不含 `FILE_SHARE_DELETE`），根因与量化证据见 `atomic-write.ts::renameReplacingExisting`。
// 修法 = **有界重试**（仅瞬时码、≤20 次、次数间只 `setImmediate` 让出事件循环、无固定 sleep）。
//
// 证据分两类：
//   ① **确定性注入**（主证据）：直接对重试核心 `retryOnTransient` 注入「瞬时失败 N 次后成功」的假 op，
//      逐条钉死「瞬时被兜住 / 非瞬时立即抛 / 有界 / 让出事件循环」——不依赖具体 OS、不靠概率、绝不 flaky；
//   ② **并发自争用压测**（端到端）：多路并发对同一目标反复 `atomicWrite`，真实经历「rename 覆盖已存在目标」，
//      断言**全部成功、无 temp 残留**——证明完整链路（atomicWrite→renameReplacingExisting→retryOnTransient）
//      在争用下不硬失败。该压测**不**断言「发生了多少次重试」（那依赖 OS 时序），只钉「无硬失败」。
//
// 全部使用系统临时目录，**不留文件于仓库**，用完递归清理；不指向仓库根真实 `.env`。

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  atomicWrite,
  RENAME_MAX_ATTEMPTS,
  renameReplacingExisting,
  retryOnTransient,
} from "../../../src/common/shared/atomic-write.ts";

// ---- 测试夹具：系统临时目录，用后清理 ----

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ans-atomic-write-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 造一个带 `.code` 的注入错误（模拟 Node fs 的 `ErrnoException`）。 */
function injected(code: string): NodeJS.ErrnoException {
  const e = new Error(`injected ${code}`) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

// ============================================================================
// ① 确定性注入：瞬时错被有界重试兜住（主证据）
// ============================================================================

test("① 瞬时 EPERM 连续 5 次后被兜住：op 第 6 次成功即返回", async () => {
  let calls = 0;
  await retryOnTransient(async () => {
    calls++;
    if (calls <= 5) throw injected("EPERM");
  });
  assert.equal(calls, 6, "应在 5 次瞬时失败后于第 6 次成功返回");
});

test("① 同一瞬时集合：EBUSY / EACCES 亦被重试（非只认 EPERM）", async () => {
  for (const code of ["EBUSY", "EACCES"]) {
    let calls = 0;
    await retryOnTransient(async () => {
      calls++;
      if (calls <= 3) throw injected(code);
    });
    assert.equal(calls, 4, `${code} 应被重试至成功`);
  }
});

test("① 非瞬时错**立即抛**、绝不重试（ENOENT/EISDIR/EROFS/无 code）", async () => {
  for (const code of ["ENOENT", "EISDIR", "EROFS", "EXDEV"] as const) {
    let calls = 0;
    await assert.rejects(
      () =>
        retryOnTransient(async () => {
          calls++;
          throw injected(code);
        }),
      (err: unknown) => (err as NodeJS.ErrnoException).code === code,
    );
    assert.equal(calls, 1, `${code} 不得重试（非瞬时错不是本原语的处置对象）`);
  }
  // 连 `.code` 都没有的普通错误，同样立即抛、不重试。
  let calls = 0;
  await assert.rejects(
    () =>
      retryOnTransient(async () => {
        calls++;
        throw new Error("no code");
      }),
    /no code/,
  );
  assert.equal(calls, 1, "无 code 的错误不得重试");
});

test("① 有界：持续瞬时错耗尽上界后**照抛**（不吞、不伪装成功）", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      retryOnTransient(async () => {
        calls++;
        throw injected("EPERM");
      }, 5),
    (err: unknown) => (err as NodeJS.ErrnoException).code === "EPERM",
  );
  assert.equal(calls, 5, "应为恰好上界（5）次尝试后抛出");
});

test("① 边界：上界-1 次瞬时后成功（恰好用满上界即返回，非超界）", async () => {
  let calls = 0;
  await retryOnTransient(async () => {
    calls++;
    if (calls <= 4) throw injected("EPERM");
  }, 5);
  assert.equal(calls, 5, "第 5 次（= 上界）成功应返回，不得再多试");
});

test("① 次数之间**让出事件循环**（setImmediate），非忙等 / 非固定 sleep", async () => {
  const order: string[] = [];
  // 先排一个外部 immediate：若重试是「忙等/同步循环」，它永远排在两次尝试之间；
  // 若重试「让出事件循环」，它应在 attempt-1 与 attempt-2 之间运行——正是我们要的语义。
  setImmediate(() => order.push("extern"));
  let calls = 0;
  await retryOnTransient(async () => {
    calls++;
    order.push(`attempt-${calls}`);
    if (calls === 1) throw injected("EPERM");
  });
  assert.deepEqual(order, ["attempt-1", "extern", "attempt-2"], "重试须让出事件循环（外部 immediate 插在两次尝试之间）");
});

// ============================================================================
// ② atomicWrite / renameReplacingExisting：原子落盘与覆盖
// ============================================================================

test("② atomicWrite 写 string：内容完整、目录内**无 temp 残留**", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    await atomicWrite(target, "A=1\nB=2\n");
    assert.equal(await readFile(target, "utf8"), "A=1\nB=2\n");
    assert.deepEqual(await readdir(dir), [".env"]);
  });
});

test("② atomicWrite 写 Buffer：内容逐字节完整（供 Pi适配器复用字节语义）", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, "out.bin");
    const bytes = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0x0a, 0x0d]);
    await atomicWrite(target, bytes);
    const back = await readFile(target);
    assert.deepEqual([...back], [...bytes]);
    assert.deepEqual(await readdir(dir), ["out.bin"]);
  });
});

test("② atomicWrite **覆盖已存在目标**：整体替换、无残留（真实经历 rename 覆盖分支）", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    await atomicWrite(target, "OLD=1\n");
    await atomicWrite(target, "NEW=2\n");
    assert.equal(await readFile(target, "utf8"), "NEW=2\n");
    assert.deepEqual(await readdir(dir), [".env"]);
  });
});

test("② atomicWrite 目标目录不存在 → 显式抛错、不创建目录、无残留", async () => {
  await withTmpDir(async (dir) => {
    const missing = path.join(dir, "no-such-dir");
    const target = path.join(missing, ".env");
    await assert.rejects(() => atomicWrite(target, "A=1\n"));
    await assert.rejects(() => readdir(missing), "失败不得创建目录");
  });
});

test("② renameReplacingExisting 覆盖已存在目标成功（原语直测）", async () => {
  await withTmpDir(async (dir) => {
    const a = path.join(dir, "a.txt");
    const b = path.join(dir, "b.txt");
    await atomicWrite(a, "AAA");
    await atomicWrite(b, "BBB");
    await renameReplacingExisting(b, a);
    assert.equal(await readFile(a, "utf8"), "BBB");
    assert.deepEqual(await readdir(dir), ["a.txt"], "源文件应已被移走（无残留）");
  });
});

// ============================================================================
// ③ 并发自争用压测：完整链路在争用下**不硬失败**（端到端）
// ============================================================================

test("③ 并发自争用：多路 atomicWrite 反复覆盖**同一目标**，全部成功、无 temp 残留", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    const LANES = 8;
    const ROUNDS = 250;
    const laneTexts = Array.from({ length: LANES }, (_, i) => `LANE=${i}\n`);
    for (let r = 0; r < ROUNDS; r++) {
      // 同一目标、同时发起：真实触发「rename 覆盖已存在目标」，Windows 下会偶发瞬时 EPERM → 由有界重试兜住。
      await Promise.all(laneTexts.map((t) => atomicWrite(target, `${t}# round ${r}\n`)));
    }
    // 全部成功（否则 Promise.all 已抛）；最终内容须是某一路写的**完整**结果（非半写拼接）。
    const final = await readFile(target, "utf8");
    assert.match(final, /^LANE=\d+\n# round \d+\n$/, "最终内容须为某次写入的完整结果（非半写）");
    assert.deepEqual(await readdir(dir), [".env"], "争用后不得有 temp 残留");
  });
});

test("③ 上界常量与实测一致（RENAME_MAX_ATTEMPTS=20）", () => {
  assert.equal(RENAME_MAX_ATTEMPTS, 20);
});
