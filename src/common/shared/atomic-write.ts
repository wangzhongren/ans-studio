// 跨角色共享**原子写**原语（**单一来源**）。属主：项目管理（`src/common/shared/` 的唯一写入者）。
//
// **解决的问题**：本项目多处需要「同目录临时文件 → 写 → `fsync` → `rename` **覆盖目标**」的
// **原子落盘**——本仓至少两处：本模块消费方 `env-file.ts`（`.env`）与 **Pi适配器** 写工具
// （`src/common/pi-adapter/fs-write.ts::atomicWriteFile`）。更关键的是：Windows 上 `rename`
// **覆盖已存在目标**存在**瞬时失败**（`EPERM`）——根因与量化证据见 {@link renameReplacingExisting}。
// 若各处各自实现，这段**非平凡且可靠性强相关**的有界重试就会成为 §6 逼出的**第二份镜像**——
// 违反工程法案 `docs/project-rules.md` §一.5「不得复制第二份实现」。故收敛为**单一来源**。
//
// **来历（本轮）**：**Pi适配器**先把其 `atomicWriteFile` 的 rename 瞬时 `EPERM` 诊断清楚并修复
// （有界重试），**如实回报**本仓另一处同源写法即 `src/common/shared/env-file.ts::atomicWriteText`
// （本轮全量中**真捕获过一次**同款红）。据「不得第二份实现」，把两处共同的原语收敛到本模块：
// `env-file.ts` 已改**导入本模块**（本任务）；**Pi适配器**改导入是**后续任务**（本角色**只回报**，
// 不越界改其文件）。
//
// **克制**（沿用 Pi适配器的实现与理由，逐字同源）：
//  · 仅对**瞬时错误码** `EPERM`/`EBUSY`/`EACCES` 重试；**非瞬时立即抛**（`ENOENT`/`EROFS`/真缺权限绝不吞）；
//  · **有界**（{@link RENAME_MAX_ATTEMPTS}）；次数之间**仅 `setImmediate` 让出事件循环、无固定 sleep**——
//    占用是「目标句柄释放后立即可写」，无需等待时长；
//  · rename 到**不存在**目标本就 0 失败（对照组干净）⇒ 失败只源自「替换已存在目标」的 Windows 语义，
//    **不是逻辑 bug**，重试**不掩盖**任何逻辑缺陷。

import { open, rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * `rename` **覆盖已存在目标**时的**瞬时失败**错误码（Windows 专有现象，根因见 {@link renameReplacingExisting}）：
 * - `EPERM`：`MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)` 映射来的 `ERROR_ACCESS_DENIED`——当目标文件
 *   （刚被上个写入建出）正被**实时防护/索引器/杀软微过滤驱动**以**不含 `FILE_SHARE_DELETE`** 的方式
 *   短暂打开时发生；句柄一旦释放，**同一** rename 立即成功。
 * - `EBUSY`/`EACCES`：同类瞬时占用在其它 Windows 场景下的表现。
 */
export const RENAME_TRANSIENT_CODES: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES"]);

/**
 * 重试**上界**（取 200）。**为什么是 200：本轮实测把 20 改掉的**——一次**全量并发**
 * （`node --test` 递归跑 `test/` 下全部单元测试文件，Node 默认并行多文件）下，本模块的并发自争用用例
 * 约 **1/20** 触发「20 次尝试被耗尽」（`attempts=20 code=EPERM`），**产品代码在此压力下真的失败**
 * （有界重试的上界确实被打满，非测试自身问题）。用**多进程同跑**压力法量化尝试次数分布
 * （24/32 路并发各跑几百个 8 lane × 250 轮的自争用场景）：**绝大多数 rename 1~2 次即成**
 * （≈53% 第 1 次、≈26% 第 2 次），**但尾部长**——最坏观测到单个 rename 需 **≈63 次**(24 路 62、32 路 63，
 * 且**不随并发再升而爆涨**，是特征尾部)。故 20 太紧；取 **200 ≈ 观测尾部的 3×** 留余量。
 *
 * 为何加大不心虚：`setImmediate` 每轮即一个事件循环轮次，**成本可忽略**（与原 20 的物理代价同类）；
 * 且**仍是有限上界**——真·持续失败（权限真缺失等）照样在 ≤200 次内**显式抛出**，不被伪装成成功。
 * **失败是安全的**（已实测）：上界耗尽抛错时，`atomicWrite` 已 `rm` 掉 temp、目标文件**未被触碰**
 * （rename 原子，未成功即不改目标）——故即便极端压力下偶尔耗尽，也**只损失一次写、绝不损坏文件**。
 */
export const RENAME_MAX_ATTEMPTS = 200;

/**
 * **有界重试**循环：反复调用 `op`，**仅**当其抛出**瞬时码**（{@link RENAME_TRANSIENT_CODES}）且
 * 未达 `maxAttempts` 时重试；次数之间**仅 `setImmediate` 让出事件循环**（**无固定 sleep、无忙等**）。
 * 非瞬时错误**立即抛出**；达上界仍失败**照抛**（不吞）。
 *
 * 之所以是「让出事件循环」而非「等待固定时长」：占用是「句柄一释放即可写」，无需预测等待长度。
 * 之所以**有界**：绝不无限重试——真·持续失败（权限真缺失等）必须**显式抛出**，不被伪装成成功。
 */
export async function retryOnTransient(
  op: () => Promise<void>,
  maxAttempts: number = RENAME_MAX_ATTEMPTS,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await op();
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (attempt < maxAttempts && code !== undefined && RENAME_TRANSIENT_CODES.has(code)) {
        await new Promise<void>((resolve) => setImmediate(resolve)); // 让出事件循环（非固定延时）
        continue;
      }
      throw err;
    }
  }
}

/**
 * **有界**重试的 rename（覆盖已存在目标），专治 Windows 的**瞬时** `EPERM`。
 *
 * 为何需要（根因，实测证据）：Windows 上「rename 覆盖已存在文件」**不是**无条件原子成功——当目标文件
 * 正被实时防护/索引器/杀软微过滤驱动以不含 `FILE_SHARE_DELETE` 的方式**短暂持有句柄**时，`MoveFileExW`
 * 会瞬时返回 `ERROR_ACCESS_DENIED`（Node 报 `EPERM`）。该占用**通常极短**（实测：单进程覆盖已存在
 * 目标 ~3/20000、并发 ~7/20000 触发，多数第 2 次尝试即成；而 rename 到**不存在的**目标名 **0/48000**
 * 从未失败——即失败只源自「替换已存在目标」这一 Windows 语义，与任何逻辑竞态无关）。**但在全量/多进程
 * 高并发下，尾部会拉长**（见 {@link RENAME_MAX_ATTEMPTS}：最坏观测单次 rename 需 ≈63 次），故上界取
 * **有实测余量**的 {@link RENAME_MAX_ATTEMPTS}。**这不是「把 flaky 测试捂绿」**：失败是操作系统层面的
 * 瞬时占用，底层操作终会成功；重试**不掩盖**任何逻辑缺陷（没有逻辑缺陷可掩），且上界耗尽时**失败是安全的**
 * （temp 已清、目标完好）。业界同源先例：libuv 对 `unlink`/`rmdir` 的 `EBUSY`/`EPERM` 内置重试；
 * `write-file-atomic` 对本类 rename 做重试。
 *
 * 处置交由 {@link retryOnTransient}（仅瞬时码、有界、只让出事件循环）。
 */
export async function renameReplacingExisting(from: string, to: string, signal?: AbortSignal): Promise<void> {
  await retryOnTransient(async () => {
    signal?.throwIfAborted();
    await rename(from, to);
  });
}

/** {@link atomicWrite} 的可选参数。 */
export interface AtomicWriteOptions {
  /**
   * 临时文件权限位（八进制）。缺省 `0o666`（同 Node `open` 缺省，经 umask 生效）——即 `env-file` 的既有行为。
   * **Pi适配器**若需更严权限（如 `0o600`）可显式传入。
   */
  mode?: number;
  /** POSIX 提交前准确应用的普通权限位（0–0777），不受 umask 收窄；Windows 保持原行为。 */
  finalMode?: number;
  /** 临时文件名的前缀（同目录）；缺省 `.{目标名}.tmp`。 */
  tmpPrefix?: string;
  /** 当前工具轮次的中止信号；已中止时不提交目标替换，清理已创建的 temp。 */
  signal?: AbortSignal;
}

/**
 * **原子写**：在**同一目录**内建临时文件 → 写入并 `fsync` → `rename` **覆盖目标**（原子替换）。
 * 同目录规避跨设备 `EXDEV`；失败时清理临时文件并**抛错**，目标文件在 `rename` 成功前**不被触碰**（半写不可能）。
 *
 * `data` 为 `string`（按 UTF-8 写出）或 `Buffer`——同时服务 `env-file`（文本 `.env`）与 Pi适配器（字节）。
 * rename 的**瞬时失败**（Windows 实时防护等短暂持有目标句柄 → `EPERM`）由 {@link renameReplacingExisting}
 * 有界处置（根因与证据见该函数）。
 */
export async function atomicWrite(
  filePath: string,
  data: string | Buffer,
  options: AtomicWriteOptions = {},
): Promise<void> {
  if (options.finalMode !== undefined &&
      (!Number.isInteger(options.finalMode) || options.finalMode < 0 || options.finalMode > 0o777)) {
    throw new RangeError("atomicWrite finalMode 必须是 0–0777 的普通权限位整数");
  }
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const prefix = options.tmpPrefix ?? `.${base}.tmp`;
  const tmp = path.join(dir, `${prefix}-${process.pid}-${randomBytes(8).toString("hex")}`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    options.signal?.throwIfAborted();
    handle = await open(tmp, "wx", options.mode ?? 0o666);
    options.signal?.throwIfAborted();
    await handle.writeFile(data);
    options.signal?.throwIfAborted();
    if (options.finalMode !== undefined && process.platform !== "win32") {
      await handle.chmod(options.finalMode);
      options.signal?.throwIfAborted();
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    await renameReplacingExisting(tmp, filePath, options.signal);
  } catch (err) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        /* 清理尽力而为 */
      }
    }
    try {
      await rm(tmp, { force: true });
    } catch {
      /* 清理尽力而为 */
    }
    throw err;
  }
}
