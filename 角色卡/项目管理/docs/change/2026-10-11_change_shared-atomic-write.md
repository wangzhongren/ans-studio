# 项目管理 变更记录

## 2026-10-11 — 抽共享原子写原语 `atomic-write`（Windows rename 瞬时 `EPERM` 的**单一来源**处置）

**来源**：**Pi适配器**本轮诊断并修复了 `edit_file` 偶发失败的根因——`atomicWriteFile` 用「同目录 temp + `rename` **覆盖已存在目标**」落盘，Windows 上会瞬时 `EPERM`（实时防护/索引器/杀软以不含 `FILE_SHARE_DELETE` 的方式短暂持有目标句柄）；其修法为对**瞬时码**做**有界重试**（见 `角色卡/Pi适配器/changelog.md`）。**它如实回报**：本仓另一处**同源写法**是 `src/common/shared/env-file.ts::atomicWriteText`（属**项目管理**），且本轮全量中**真捕获过一次同款红**（当时位于 `test/项目管理/shared/env-file.test.ts`）。据工程法案 §一.5「不得复制第二份实现」，本次把两处共同的原语**收敛为单一来源**。

**架构裁决（本任务重点）＝ 抽共享原语**（而非各修各的）。理由：
1. 两处是**同一算法**——「同目录 temp → 写 → `fsync` → `rename` 覆盖目标」逐步骤一致，仅**数据形态**（`string` vs `Buffer`）与**临时文件名/权限位**等**表面差异**；差异**不**构成各自实现的技术理由。
2. 需收敛的核心不是「temp+rename」（那是常识），而是其中**非平凡且可靠性强相关**的**有界重试**（仅瞬时码 `EPERM/EBUSY/EACCES`、≤20 次、次数间只 `setImmediate` 让出事件循环、非瞬时立即抛）。这段逻辑若各自维护，正是 §6 逼出的**镜像**——一旦一处修正，另一处即变**陈旧第二实现**。
3. 与本项目**既定的收敛实践**一致（此前已把 `config-loader`/`path-primitives`/`runtime-shared`/`argv-primitives`/`env-file` 五处镜像收敛到 `src/common/shared/`）。

**做了什么**
- 新增 `src/common/shared/atomic-write.ts`（**跨角色共享**、属主 pm）。导出：
  - `atomicWrite(filePath: string, data: string | Buffer, options?: AtomicWriteOptions): Promise<void>` —— 同目录 temp + `fsync` + `rename` 覆盖目标（**同时服务文本 `.env` 与字节写工具**）；失败清理 temp 并抛错。
  - `renameReplacingExisting(from, to): Promise<void>` —— **有界重试**的 rename（覆盖已存在目标），专治 Windows 瞬时 `EPERM`。
  - `retryOnTransient(op, maxAttempts?): Promise<void>` —— 通用「**仅瞬时码、有界、只让出事件循环**」重试核心。
  - 常量 `RENAME_TRANSIENT_CODES`（`EPERM/EBUSY/EACCES`）、`RENAME_MAX_ATTEMPTS`（20）；类型 `AtomicWriteOptions`（`mode?`/`tmpPrefix?`）。
- 改 `src/common/shared/env-file.ts`：`atomicWriteText(filePath, text)` 的**实现体**改为委托 `atomicWrite(filePath, text)`——**签名与行为不变**（消费方 T28 只读导入此名）；移除本文件内联的 temp/rename 代码与此前仅它使用的 `open`/`rename`/`rm`/`path` 导入。
- 登记 `docs/architecture/shared-components.md` **组件 6（atomic-write）** + 本文件变更段。
- 更新工程法案 `docs/project-rules.md` §一.5：共享组件清单补为现行**六个**；补记 atomic-write 的消费方与「Pi适配器须改导入」的收敛动作。
- 新增测试 `test/项目管理/shared/atomic-write.test.ts`（**13 例**）；`test/项目管理/shared/env-file.test.ts` **+1 例**（并发自争用，纳入既有 ④ 原子写段）。

**瞬时错被兜住的证据（两类）**
1. **确定性注入（主证据，不依赖 OS、绝不 flaky）**——直测重试核心 `retryOnTransient`：
   - 瞬时 `EPERM` 连续 5 次 → **第 6 次成功返回**（被兜住）；`EBUSY`/`EACCES` 同集合，同样被重试至成功；
   - 非瞬时错（`ENOENT`/`EISDIR`/`EROFS`/`EXDEV`/无 `code`）**立即抛、调用次数=1**（绝不重试——证明兜的是**瞬时**错、非逻辑错）；
   - **有界**：持续 `EPERM` 达上界（5）后**照抛**，调用次数恰为上界（不吞、不伪装成功）；**边界**：上界-1 次瞬时后成功即返回；
   - **让出事件循环**：外部预排的 `setImmediate` 恰好运行在「第 1 次尝试」与「第 2 次尝试」之间（`["attempt-1","extern","attempt-2"]`）——证明是**让出**而非忙等/固定 sleep。
2. **并发自争用压测（端到端）**——`atomic-write.test.ts` **8 路 × 250 轮**、`env-file.test.ts` **8 路 × 150 轮**，多路并发反复 `atomicWrite`/`atomicWriteText` **同一目标**，真实经历「rename 覆盖已存在目标」分支；断言**全部成功**（否则 `Promise.all` 抛）、最终内容为某次写入的**完整**结果（非半写）、目录**无 temp 残留**。**注**：该压测只钉「无硬失败」，**不**（也不可能稳定地）断言「发生了多少次重试」——那依赖 OS 时序；「瞬时错确实被重试兜住」由上面的注入用例确定性证明。

**验证（项目管理独立执行）**
- 本组：`node --test "test/项目管理/**/*.test.ts"` → **95 pass / 0 fail**（81 既有 + **13** atomic-write + **1** env-file 新增）。
- 全量：`node --test "test/**/*.test.ts"`（**带引号**，走 Node glob）→ **671 pass / 0 fail**（基线 657 + 14 新增）。未见 `test/编排/finalize.test.ts:158` 那处独立时序 flake（与本题无关、已排给编排）。
- `npm run typecheck`（`tsc --noEmit`）→ **零错误**。
- 注：任务文字 `node --test test/项目管理/*.test.ts` 为**单层** glob，测试实位于 `test/项目管理/shared/` 一层之下，故按**递归** `test/项目管理/**/*.test.ts` 执行本组（同 T23/T26 记录）。

**不改 Pi适配器（越界，仅回报）——Pi适配器后续需要做成什么样**
- 现 `src/common/pi-adapter/fs-write.ts` 自带**私有** `renameReplacingExisting` + 内联重试 + `atomicWriteFile(abs, data: Buffer)`。收敛后应：**删**其私有 `renameReplacingExisting`/`RENAME_TRANSIENT_CODES`/`RENAME_MAX_ATTEMPTS` 与 `atomicWriteFile` 内的 temp/rename 脚手架，改 `atomicWriteFile(abs, data)` 为 **`return atomicWrite(abs, data, { mode: 0o600 })`**（`0o600` 保持其原有更严权限；`0o666` 为本共享原语缺省，即 env-file 既有行为），并从 `../../common/shared/atomic-write.ts` **只读导入** `atomicWrite`。
- Pi适配器其余私有辅助（`guardWriteTarget`/`recheckParentInsideWriteRoot`/`ensureParentDir`/`resolveWriteAbs`/`checkRelativePathSafe`）**不受影响**——它们不是本原语的一部分。
- **本角色未动 `src/common/pi-adapter/` 任何文件**（越界）；此为非本任务的后续收敛项。

**边界与合规**：仅写 pm Section 1 内路径（`src/common/shared/`、`test/项目管理/shared/`、`角色卡/项目管理/docs/`、`角色卡/项目管理/memo.md`）。**未读** `.env` 本身及其任何值、未发网络请求、未打印凭据；未改任何其他角色文件。

**记录更新**：本文件 + `memo.md` 追加一行 + `docs/architecture/shared-components.md` 组件 6 与变更段 + `docs/project-rules.md` §一.5 与变更记录段。
