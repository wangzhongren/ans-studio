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
import { chmod, mkdir, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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

test("② 已中止的原子写与 rename 不产生临时文件或替换目标", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, "target.txt");
    const source = path.join(dir, "source.txt");
    await writeFile(target, "old");
    await writeFile(source, "new");
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => atomicWrite(target, "new", { signal: controller.signal }), { name: "AbortError" });
    await assert.rejects(() => renameReplacingExisting(source, target, controller.signal), { name: "AbortError" });
    assert.equal(await readFile(target, "utf8"), "old");
    assert.equal(await readFile(source, "utf8"), "new");
    assert.deepEqual((await readdir(dir)).sort(), ["source.txt", "target.txt"]);
  });
});

test("② temp fsync 后中止：保留旧目标，清理未提交的完整 temp", async (t) => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, "target.txt");
    await writeFile(target, "old");
    const probe = await open(path.join(dir, "probe"), "wx");
    const prototype = Object.getPrototypeOf(probe) as { sync(): Promise<void> };
    const originalSync = prototype.sync;
    await probe.close();
    await rm(path.join(dir, "probe"));
    const controller = new AbortController();
    const injected = t.mock.method(prototype, "sync", async function(this: { sync(): Promise<void> }) {
      await originalSync.call(this);
      controller.abort();
    });
    try {
      await assert.rejects(() => atomicWrite(target, "new", { signal: controller.signal }), { name: "AbortError" });
    } finally {
      injected.mock.restore();
    }
    assert.equal(await readFile(target, "utf8"), "old");
    assert.deepEqual(await readdir(dir), ["target.txt"]);
  });
});

// ============================================================================
// ③ 并发自争用压测：完整链路在争用下**不硬失败**（端到端）+ 失败路径的**安全性**
// ============================================================================

// 说明（本轮校正）：本用例此前断言「8 路 x 250 轮**全部成功**」，并在**全量并发**
// （`node --test "test/**/*.test.ts"`，Node 默认并行多文件）下约 **1/20** 真实翻红——
// 经诊断**不是用例自身竞态**，而是**产品代码在此压力下真的失败**：Windows rename 覆盖已存在目标
// 的**瞬时** `EPERM` 在重负载下**尾部拉长**，原上界 20 被**打满**（日志实测 `attempts=20 code=EPERM`）。
// 证据与定界见 `atomic-write.ts::RENAME_MAX_ATTEMPTS`。修法＝**按实测把上界 20 提到 200**（观测尾部≈63、
// 留 ~3x 余量），而非在用例里加 sleep/重试把它捂绿。**失败路径本身已单测其安全性**（见下一用例）。
test("③ 并发自争用：多路 atomicWrite 反复覆盖**同一目标**，全部成功、无 temp 残留", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, ".env");
    const LANES = 8;
    const ROUNDS = 250;
    const laneTexts = Array.from({ length: LANES }, (_, i) => `LANE=${i}\n`);
    for (let r = 0; r < ROUNDS; r++) {
      // 同一目标、同时发起：真实触发「rename 覆盖已存在目标」，Windows 下会偶发瞬时 EPERM → 由有界重试兜住。
      const lanes = laneTexts.map((t) => atomicWrite(target, `${t}# round ${r}\n`));
      const results = await Promise.allSettled(lanes);
      // 全部成功（有界重试把瞬时 EPERM 兜住）；若偶有不成功，只应是**瞬时码被耗尽**，绝非其它错——
      // 这里把它断言成「无任何失败」，一旦翻红，报错会直接给出错误码，便于区分「上界耗尽」与「真·损坏」。
      const rejected = results.filter((x): x is PromiseRejectedResult => x.status === "rejected");
      assert.deepEqual(
        rejected.map((x) => (x.reason as NodeJS.ErrnoException)?.code),
        [],
        `有 lane 失败：码=${rejected.map((x) => (x.reason as NodeJS.ErrnoException)?.code).join(",")}（若均为瞬时码=有界重试上界被耗尽）`,
      );
    }
    // 最终内容须是某一路写的**完整**结果（非半写拼接）。
    const final = await readFile(target, "utf8");
    assert.match(final, /^LANE=\d+\n# round \d+\n$/, "最终内容须为某次写入的完整结果（非半写）");
    assert.deepEqual(await readdir(dir), [".env"], "争用后不得有 temp 残留");
  });
});

// 失败路径的**安全性**（确定性，不靠概率）：令「rename 覆盖目标」**必然失败**——目标是一个
// **已存在的非空目录**（Windows：EPERM 瞬时码 → 重试至上界再抛；POSIX：EISDIR/ENOTEMPTY 非瞬时 → 立即抛）。
// 两种平台都必须满足同一契约：**显式抛出**、**temp 已清**、**目标未被触碰/损坏**。这正是「即便上界耗尽，
// 也只是损失一次写、绝不损坏文件」这一裁决的可回归证据。
test("③ 失败路径安全：目标不可被替换时 atomicWrite 显式抛出、temp 已清、目标未受损", async () => {
  await withTmpDir(async (dir) => {
    const target = path.join(dir, "target-is-a-dir");
    await mkdir(target);
    await writeFile(path.join(target, "keep.txt"), "keep");
    await assert.rejects(() => atomicWrite(target, "NEW=1\n"), "目标不可被文件覆盖时必须显式抛错");
    assert.deepEqual(await readdir(dir), ["target-is-a-dir"], "失败后目录内不得残留 temp");
    assert.deepEqual((await readdir(target)).sort(), ["keep.txt"], "目标（目录）内容不得被触碰");
    assert.equal(await readFile(path.join(target, "keep.txt"), "utf8"), "keep", "目标内既有文件须完好");
  });
});

test("③ 上界常量与实测一致（RENAME_MAX_ATTEMPTS=200，由实测尾部≈63 留 ~3x 余量）", () => {
  assert.equal(RENAME_MAX_ATTEMPTS, 200);
});

test("D3 finalMode 非法时不创建临时文件或替换目标", async () => {
  await withTmpDir(async (directory) => {
    const target = path.join(directory, "original.txt");
    await writeFile(target, "original");
    for (const finalMode of [-1, 0o1000, 0o4755, 1.5, NaN, Infinity]) {
      await assert.rejects(() => atomicWrite(target, "replacement", { finalMode }), RangeError);
      assert.equal(await readFile(target, "utf8"), "original");
      assert.deepEqual(await readdir(directory), ["original.txt"]);
    }
  });
});

test("D3 finalMode 应用普通权限位，未传时保持既有安全创建行为", { skip: process.platform === "win32" }, async () => {
  await withTmpDir(async (directory) => {
    const target = path.join(directory, "run.sh");
    for (const finalMode of [0o755, 0o644, 0o600]) {
      await atomicWrite(target, "#!/bin/sh\necho ready\n", { mode: 0o600, finalMode });
      assert.equal((await stat(target)).mode & 0o7777, finalMode);
      assert.equal(await readFile(target, "utf8"), "#!/bin/sh\necho ready\n");
    }
    await atomicWrite(target, "legacy", { mode: 0o600 });
    assert.equal((await stat(target)).mode & 0o777, 0o600 & ~process.umask());
    assert.deepEqual(await readdir(directory), ["run.sh"]);
  });
});

test("D3 严格 umask 下 finalMode 不丢执行位（独立子进程）", { skip: process.platform === "win32" }, async () => {
  await withTmpDir(async (directory) => {
    const target = path.join(directory, "run.sh");
    const moduleUrl = new URL("../../../src/common/shared/atomic-write.ts", import.meta.url).href;
    const childScript = `
      const { atomicWrite } = await import(process.argv[1]);
      process.umask(0o077);
      await atomicWrite(process.argv[2], 'updated', { mode: 0o600, finalMode: 0o755 });
    `;
    execFileSync(process.execPath, ["--input-type=module", "-e", childScript, moduleUrl, target], { timeout: 10000 });
    assert.equal((await stat(target)).mode & 0o777, 0o755);
    assert.equal(await readFile(target, "utf8"), "updated");
    assert.deepEqual(await readdir(directory), ["run.sh"]);
  });
});

for (const operation of ["chmod", "sync"] as const) {
  test(`D3 ${operation} 失败不提交内容或权限，并清理临时文件`, { skip: process.platform === "win32" }, async (context) => {
    await withTmpDir(async (directory) => {
      const target = path.join(directory, "run.sh");
      await writeFile(target, "original");
      await chmod(target, 0o755);
      const probe = await open(path.join(directory, "probe"), "wx");
      const prototype = Object.getPrototypeOf(probe);
      await probe.close();
      await rm(path.join(directory, "probe"));
      const failure = context.mock.method(prototype, operation, async () => { throw injected("EIO"); });
      try {
        await assert.rejects(() => atomicWrite(target, "replacement", { mode: 0o600, finalMode: 0o644 }),
          (error: unknown) => (error as NodeJS.ErrnoException).code === "EIO");
      } finally {
        failure.mock.restore();
      }
      assert.equal(await readFile(target, "utf8"), "original");
      assert.equal((await stat(target)).mode & 0o777, 0o755);
      assert.deepEqual(await readdir(directory), ["run.sh"]);
    });
  });
}

test("D3 chmod 完成后中止仍保留原文件及权限", { skip: process.platform === "win32" }, async (context) => {
  await withTmpDir(async (directory) => {
    const target = path.join(directory, "run.sh");
    await writeFile(target, "original");
    await chmod(target, 0o755);
    const probe = await open(path.join(directory, "probe"), "wx");
    const prototype = Object.getPrototypeOf(probe) as { chmod(mode: number): Promise<void> };
    const originalChmod = prototype.chmod;
    await probe.close();
    await rm(path.join(directory, "probe"));
    const controller = new AbortController();
    const observed = context.mock.method(prototype, "chmod", async function(this: { chmod(mode: number): Promise<void> }, mode: number) {
      await originalChmod.call(this, mode);
      controller.abort();
    });
    try {
      await assert.rejects(() => atomicWrite(target, "replacement", { mode: 0o600, finalMode: 0o644, signal: controller.signal }),
        { name: "AbortError" });
    } finally {
      observed.mock.restore();
    }
    assert.equal(await readFile(target, "utf8"), "original");
    assert.equal((await stat(target)).mode & 0o777, 0o755);
    assert.deepEqual(await readdir(directory), ["run.sh"]);
  });
});
