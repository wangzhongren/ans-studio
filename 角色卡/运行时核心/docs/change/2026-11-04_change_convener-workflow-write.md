# 变更记录：`dispatch_task` 工作流写者文案对齐——工作流由运营落盘（2026-11-04）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-11-04
- 角色：运行时核心（Runtime Core）
- 依据：`docs/communication/2026-11-04_issue-workflow-md-no-writer.md`（客户最终决定：恢复 convener 对 `docs/workflow.md` 的写权，保留「工作流先行」；否决「缺省容忍」方案 B）
- 任务：A 直修（worktree `workflow-writer-fix`，分支 `fix/convener-workflow-write`，基线 `origin/main f4c24ea`）
- 工作区说明：子代理 `EnterWorktree` 创建被 harness 拒绝，按任务后备命令 `git worktree add` 创建；
  文件工具仍被隔离，实际写入经受控暂存 + `cp` 完成。全部改动只落在该 worktree；未 commit / push / 发布。
- 功能：公共工具 schema 与描述（[../feature/runtime-core.md](../feature/runtime-core.md)）

## 1. 根因

`dispatch_task` 的模型可见描述要求「工作流落盘到 `docs/workflow.md`（写盘经确认制：把路径列入规划确认的 preview）**再**派发」。
但 trio 注册表中此前**没有任何角色可写** `docs/workflow.md`，且 trio 的写盘预授权语义是「Section 1 条目直接写」而非
「规划确认 preview」——命令角色写一个无入口的文件，导致幕僚/运营自我阻塞。门禁引擎同批已恢复运营写权（数据侧），
本记录只同步**文案**，不改任何代码行为。

## 2. 改动（逐处 before → after）

文件：`src/provider/runtime/schema.ts`

### 2.1 `dispatch_task` 主描述（约 :545-547）

- before：
  `（写盘许可已预置、直接写即可），工作流落盘到 `docs/workflow.md`（写盘经确认制：把路径列入规划确认的 preview），**再**派发任务。`
- after：
  `（写盘许可已预置、直接写即可），工作流由**运营（convener）**落盘到 `docs/workflow.md`（运营的 Section 1 预授权、直接写即可），**再**派发任务。`

### 2.2 `dispatch_task` promptGuidelines（约 :564-565）

- before：
  `工作流落盘到 `docs/workflow.md`（路径列入规划确认的 preview），**再**派发。`
- after：
  `工作流由**运营（convener）**落盘到 `docs/workflow.md`（运营的 Section 1 预授权、直接写即可），**再**派发。`

两处均**保留「先落盘再派发」要求**，仅纠正写者（运营）与确认制说法（Section 1 预授权、直接写）。

### 2.3 测试同步（本角色）

- 新增 `test/runtime-core/dispatch-workflow-writer-copy.test.ts`：
  - 断言 `dispatch_task` 描述与 promptGuidelines 含「工作流由**运营（convener）**落盘到 `docs/workflow.md`」与
    「运营的 Section 1 预授权、直接写即可」，且保留「先落盘再派发」；
  - 反向断言不再出现「写盘经确认制」「把路径列入规划确认的 preview」；
  - 断言既有的 `docs/workflow.md` 缺失不拒投事实陈述保留（不改行为）。

## 3. 保留项（不改）

1. 「派发 ≠ 授权」「任务自足」「返工带证据」等 H-1 语义逐字保留。
2. 契约落盘口径（`docs/contracts/<name>-v<N>.md`、预置写盘、直接写）不变。
3. `docs/workflow.md` 缺失（旧项目过渡期）不拒投、必读块如实标注「未提供」的**行为事实**保留；本批不改代码行为。
4. single/legacy（`boundary-core.ts`、`LEGACY_SU_*`）卡文本与路径不变（workflow.md 在 su 卡内仍走规划确认）。
5. `src/provider/runtime/tools.ts` 的成功回执、`dispatch_task` 参数/能力注入逻辑不改。

## 4. 测试与证据（原始数字）

证据目录：`角色卡/运行时核心/docs/change/2026-11-04_change_convener-workflow-write-evidence/`

| 命令 | 原始结果 | 日志 |
| --- | --- | --- |
| `node --test "test/runtime-core/**/*.test.ts" test/pi-adapter/dispatch-task.test.ts test/桌面应用/write-safety.test.ts` | tests 329 / pass 322 / fail 3 / skipped 4 / duration 15750.7549ms | `runtime-core-and-pi-dispatch-test.log` |
| `npm run typecheck`（`tsc --noEmit`） | 退出码 0，无诊断 | `typecheck.log` |

3 项失败均为**既有 Windows 符号链接 EPERM 环境限制**（`file-write-safety` linked workspace、`session-store` symlink ×2），
与被改文件无关；新增文案测试在套件内通过（`✔ dispatch_task 文案：工作流由运营（convener）落盘…`）。

## 5. 候选哈希（sha256 / git blob SHA-1，2026-11-04 写定）

| 文件 | sha256 | git blob |
| --- | --- | --- |
| `src/provider/runtime/schema.ts` | `f39cbd1d7896a4abb248c87c6b9f76f7c803bd69a95f3dd41cb191facc7c56ce` | `1a43b10b152c5bb8407d498089de84e5b934826c` |
| `test/runtime-core/dispatch-workflow-writer-copy.test.ts`（新增） | `1779cc9f371cb5a4a87825663778f55147df3d39fce1ffc953f0abd6094fb40e` | `7bba78cfd3d0122981dad2b1d03e953a3e1ff148` |
| `.../runtime-core-and-pi-dispatch-test.log` | `f9ea7416773e17fb1084a0ac1c50a109fd98b32d012788d9f17ab604f57dd03d` | `9beb365ef90e2a0955984f43e232c575576a2d70` |
| `.../typecheck.log` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` | `db725ed93320452a3192fad231e8e9c6fc498086` |

本记录自身的 sha256 无法自引用内嵌，随最终回报给出。

## 6. 与预期不符 / 需要知悉

1. `dispatch_task` 文案为 trio/single 共享文案；按任务要求统一改为「运营（convener）」。single/legacy 的 su 卡文本
   仍按历史口径（workflow.md 经规划确认），该差异属任务明确的保留项。
2. 桌面应用 `write-safety` 套件内含既有 symlink 用例，在 Windows 下 EPERM 失败（见 §4），非本改动引入。
3. 门禁引擎侧的数据改动见 `角色卡/门禁引擎/docs/change/2026-11-04_change_convener-workflow-write.md`。
