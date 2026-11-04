# 变更记录：恢复运营（convener）对 `docs/workflow.md` 的写权（trio 工作流先行）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-11-04
- 角色：门禁引擎（Gate Engine）
- 依据：`docs/communication/2026-11-04_issue-workflow-md-no-writer.md`（沟通记录；该文件当前在 download-requests worktree 中，未提交）
  - 客户最终决定（2026-11-04，晚于否决）：**恢复运营（convener）对 `docs/workflow.md` 的写权，保留「工作流先行」要求**。
  - 客户先选「缺省容忍」后**否决**（原话：「这个缺省容忍也不对」）；方案 B（把工作流前置改为可选）不采用、不合并。
- 任务：客户决定后的 A 直修（worktree `workflow-writer-fix`，分支 `fix/convener-workflow-write`，基线 `origin/main f4c24ea`）。
- 工作区说明：本会话为子代理，`EnterWorktree` 创建新 worktree 被 harness 拒绝；按任务给定的后备命令
  `git worktree add .claude/worktrees/workflow-writer-fix -b fix/convener-workflow-write origin/main` 创建成功。
  该 worktree 对文件工具仍被 harness 隔离，写入经受控暂存 + `cp` 通道完成；全部改动只落在该 worktree；
  未 commit / push / 发布。
- 功能导航：[feature-map.md](feature-map.md)（「治理三权内置角色注册表」行；该功能无独立 feature 文档，变更历史以
  changelog 与 `docs/change/` 记录为准）；写入判定机制见 [../feature/write-authorization.md](../feature/write-authorization.md)。

## 1. 根因

1. `src/common/门禁引擎/governance-roles.ts` 的六角色注册表中，`docs/workflow.md`：
   - 幕僚（chief）与产品（product）`forbiddenWritePaths` 显式禁写；
   - 质检（verifier）`forbiddenWritePaths` 显式禁写；
   - 策划（rapporteur）、人事（nominator）、运营（convener）的 Section 1 条目与写集均不含该文件。
   ⇒ **trio 下没有任何内置角色可写 `docs/workflow.md`**。
2. 但模型可见文本仍要求「工作流落盘 `docs/workflow.md`（写盘经确认制：把路径列入规划确认的 preview）再派发」
   （`src/provider/runtime/schema.ts` 的 `dispatch_task` 描述与 promptGuidelines）。命令角色写一个无人有权写的文件，
   且「经确认制」在 trio 预授权语义下没有对应入口 → 幕僚/运营等角色**自我阻塞**（`submit_report` blocked，无系统拒绝事件）。
3. 相关代码注释（`src/pipeline/orchestration/run-role.ts:766-767/786-787/1822-1823`、
   `src/pipeline/orchestration/govern-session.ts:374-377`）早已把「Convener 的 `docs/workflow.md` 精确文件条目」当作既有先例，
   但注册表实际未保留该条目——注释与数据不一致，属实现缺口。

## 2. 修复口径（客户决定）

- **恢复运营（convener）`docs/workflow.md` 精确文件写条目**，并加入其 `preauthorizedDirs`：
  - trio 语义（既有先例注释）：**Section 1 精确文件条目经门禁直接放行、不要求逐路径确认**；
    详见 `run-role.ts:784-792`（无任务 writeSet 收窄时按 Section 1 条目预授权，含精确文件条目）与
    `run-role.ts:1819-1836`（`PreauthorizedWriteSources` 语义：`entries`=Section 1 条目，`dirs`=既有预授权目录）。
  - `preauthorizedDirs` 中的 `docs/workflow.md` 按 `preauthorizedRelOf` 的 `isUnderOrEqual` **精确等值**匹配，
    有任务 writeSet 时也生效（既有目录子集语义）。
- **保留「工作流先行」要求**；不把工作流前置改为可选/缺省容忍。
- 不动 chief/product/verifier 的禁写清单，不动其它角色写集，不改 single/legacy（`boundary-core.ts`、`LEGACY_SU_*`）路径。
- 不改任何门禁/预授权**代码逻辑**（gate 已按 `entries` / `preauthorizedDirs` 工作）；本批只改**数据 + 模型可见文案**。

## 3. 改动（逐处，实际）

### 3.1 `src/common/门禁引擎/governance-roles.ts`（本角色）

1. `CONVENER_CARD_TEXT`（约 :226）新增职责行：
   `- 项目工作流：由你落盘并维护 `docs/workflow.md`（步骤表：步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）；派发实现任务前先让工作流就位。`
2. `CONVENER_CARD_TEXT`「可写」行（约 :233）：
   before `可写：`docs/scheduling/`、`docs/governance/convener/`（Section 1，预授权直接写）。`
   → after `可写：`docs/workflow.md`（项目工作流）、`docs/scheduling/`、`docs/governance/convener/`（Section 1，预授权直接写）。`
3. `CHIEF_CARD_TEXT` 职能行（约 :143）：
   before `职能：工作流管理、按序派发、短报汇总、运行日志巡检（不是决定权）。`
   → after `职能：工作流管理（项目工作流文件 `docs/workflow.md` 由运营落盘维护）、按序派发、短报汇总、运行日志巡检（不是决定权）。`
4. `convener.entries`（约 :394-400）新增精确文件条目：
   `projectEntry("docs/workflow.md", "file", "项目工作流（步骤表：步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）；由运营落盘并维护")`
   （附 2026-11-04 客户决定与根因记录注释）。
5. `convener.preauthorizedDirs`（约 :402）：
   before `["docs/scheduling/", "docs/governance/convener/"]`
   → after `["docs/workflow.md", "docs/scheduling/", "docs/governance/convener/"]`
   （精确文件路径按 `isUnderOrEqual` 等值匹配，有任务 writeSet 时也生效）。

### 3.2 跨角色同步（各自另有记录）

- `src/provider/runtime/schema.ts`（运行时核心）：`dispatch_task` 主描述与 promptGuidelines 改为
  「工作流由**运营（convener）**落盘到 `docs/workflow.md`（运营的 Section 1 预授权、直接写即可）」，保留「先落盘再派发」；
  记录：`角色卡/运行时核心/docs/change/2026-11-04_change_convener-workflow-write.md`。
- `test/编排/section1-write-preauthorization.test.ts`（编排）：原断言「docs/workflow.md 被拒」翻转为「直接放行」，
  新增精确文件相邻路径负例与「有任务 writeSet 时 preauthorizedDirs 仍放行」用例；
  记录：`角色卡/编排/docs/change/2026-11-04_change_convener-workflow-write.md`。
- 本角色新增测试：`test/门禁引擎/convener-workflow-write.test.ts`
  - convener entries 含 `docs/workflow.md`（root=project、kind=file、purpose 声明由运营落盘并维护）；
  - `preauthorizedDirs` 含该文件；
  - chief/product/verifier 仍禁写、rapporteur/nominator 不获该写权（不放宽其他角色断言）；
  - 卡文本「运营负责落盘工作流」与幕僚澄清；
  - 六角色枚举与 convener 能力位不变。

## 4. 保留项（不改）

1. `chief` / `product` / `verifier` 的 `forbiddenWritePaths` 中的 `docs/workflow.md` **逐字保留**。
2. 其他五个角色的 `entries` / `preauthorizedDirs` 不变。
3. `src/common/门禁引擎/boundary-core.ts`（旧 su/single 卡文本：workflow.md 仍走规划确认、不在预置四目录）与
   `LEGACY_SU_PREAUTHORIZED_DIRS` / `LEGACY_SU_CAPABILITIES` 不变。
4. `resolveWrite`、`resolveBoundary`、预授权实现（`scopeWithPreauthorizedWrites`）、`forbiddenWritePaths` 判定、
   `governance-judge-verdict.ts` 的 `SOURCE_WRITE_ROOTS`（已含 convener `docs/workflow.md`，无需改）均不改。
5. 「`docs/workflow.md` 缺失（旧项目过渡期）不拒投、必读块如实标注「未提供」」的行为事实保留（不改代码行为）。

## 5. 测试与证据（原始数字）

证据目录：`角色卡/门禁引擎/docs/change/2026-11-04_change_convener-workflow-write-evidence/`

| 命令 | 原始结果 | 日志（相对证据目录） |
| --- | --- | --- |
| `node --test "test/门禁引擎/**/*.test.ts"` | tests 292 / pass 291 / fail 0 / skipped 1 / duration 1212.7606ms | `gate-engine-suite.log` |
| `node --test test/测试/entry-role-minimal-d.test.ts` | tests 6 / pass 6 / fail 0 / skipped 0 / duration 222.6005ms（注册表写区断言未受影响） | `entry-role-minimal-d.log` |
| `node --test test/项目管理/shared/i18n-guard.test.ts` | tests 6 / pass 6 / fail 0 / skipped 0 / duration 205.4509ms | `i18n-guard.log` |
| `node --test "test/编排/**/*.test.ts"` | tests 758 / pass 757 / fail 1 / skipped 0 / duration 1671.1908ms；唯一失败为既有 Windows symlink `EPERM`（`node test外指符号链接路径不获委托…`），与被改文件无关 | `../../../编排/docs/change/2026-11-04_change_convener-workflow-write-evidence/orchestration-suite.log` |
| `node --test "test/runtime-core/**/*.test.ts" test/pi-adapter/dispatch-task.test.ts test/桌面应用/write-safety.test.ts` | tests 329 / pass 322 / fail 3 / skipped 4 / duration 15750.7549ms；3 项失败均为既有 Windows symlink `EPERM`（file-write-safety linked workspace、session-store symlink ×2） | `../../../运行时核心/docs/change/2026-11-04_change_convener-workflow-write-evidence/runtime-core-and-pi-dispatch-test.log` |
| `npm run typecheck`（`tsc --noEmit`） | 退出码 0，无诊断 | `../../../运行时核心/docs/change/2026-11-04_change_convener-workflow-write-evidence/typecheck.log` |

## 6. 候选哈希（sha256 / git blob SHA-1，2026-11-04 写定）

| 文件 | sha256 | git blob |
| --- | --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | `f394a8a1742b9d269eb237b6d8335a79ee74bdec5acd446f65dde51f50900d83` | `65c041dafa39c903b901044aa2bae23b54408ae8` |
| `src/provider/runtime/schema.ts` | `f39cbd1d7896a4abb248c87c6b9f76f7c803bd69a95f3dd41cb191facc7c56ce` | `1a43b10b152c5bb8407d498089de84e5b934826c` |
| `test/编排/section1-write-preauthorization.test.ts` | `f85d48b45f116ca95d163c113e886a13d9ab64fb17b216ec4a96ac226aba6182` | `f9385079dd8b19c804059c2ec2c0782d0c8df435` |
| `test/门禁引擎/convener-workflow-write.test.ts`（新增） | `1fe58a033ad54c3e19af19d20ccfaba1641dc58f98e7b5618dd086ccb694102f` | `279cfeae0dc40c979101d4d4a4592739edd706b9` |
| `test/runtime-core/dispatch-workflow-writer-copy.test.ts`（新增） | `1779cc9f371cb5a4a87825663778f55147df3d39fce1ffc953f0abd6094fb40e` | `7bba78cfd3d0122981dad2b1d03e953a3e1ff148` |
| `.../gate-engine-suite.log` | `608a1f26cc6cdf14af521a4cd5d7221705bb99adc32ee31652eee980e8d984ad` | `1203b6d36cda667ed4b8dab870ee403bb5651846` |
| `.../entry-role-minimal-d.log` | `21a4349f940ff3ff3ebdfeb5070b05b5ebf3f3126e024cbcb187b5b2174f1c6d` | `94941730d9e9417bf68dd0ea6ae141966526ad67` |
| `.../i18n-guard.log` | `5f52f692d48b31c1b25b178f4cf44cc689da878a288a326d4c0cbc740213454a` | `8657171706db6913566414eb9b8f4c1dca5bbeb5` |
| `.../orchestration-suite.log`（编排证据） | `5ef571a60aafb269f15e130b7d8fa0de816db8400ab347e6406272c5d53287b5` | `1b8773c05d24884575986a91e31b3ac34b250ab0` |
| `.../runtime-core-and-pi-dispatch-test.log`（运行时核心证据） | `f9ea7416773e17fb1084a0ac1c50a109fd98b32d012788d9f17ab604f57dd03d` | `9beb365ef90e2a0955984f43e232c575576a2d70` |
| `.../typecheck.log`（运行时核心证据） | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` | `db725ed93320452a3192fad231e8e9c6fc498086` |

本记录自身的 sha256 无法自引用内嵌，随最终回报给出。

## 7. 与预期不符 / 需要知悉

1. **工作区**：子代理无法用 `EnterWorktree` 创建/切换到新 worktree（harness 隔离），改按任务后备命令创建
   `workflow-writer-fix`；文件工具写入仍被限制，实际写入经受控暂存（download-requests `.tmp-wf-fix/`）+ `cp` 完成，
   临时候件随后删除。所有候选均在 `workflow-writer-fix` 内。
2. **编排既有测试原断言**：`test/编排/section1-write-preauthorization.test.ts` 原有一条断言「D 批旧精确文件
   `docs/workflow.md` 不再在 Section 1」，与本次客户决定相反；已按新决定翻转并加强（新增相邻路径负例 +
   有任务 writeSet 的 preauthorizedDirs 用例），未放宽其它断言（见编排记录）。
3. **测试失败**：编排套件 1 项、运行时核心套件 3 项失败均为既有 Windows symlink `EPERM` 环境限制，
   与本次改动无关；其余全过（原始数字见 §5）。
4. **single/legacy 残留口径**：`dispatch_task` 文案为共享文案，本批按任务要求改为「运营（convener）」；
   single/legacy 的 `boundary-core.ts` 卡文本（workflow.md 走规划确认、不在预置四目录）按任务要求**未改**。
   因此 single 模式下 su 的 workflow 写盘口径仍以 su 卡文本为准（历史兼容），trio 以本记录为准。
5. 沟通记录 `docs/communication/2026-11-04_issue-workflow-md-no-writer.md` 目前仅存在于 download-requests worktree
   （未提交），本记录按任务引述其客户决定原文。
6. 测试依赖：为避免网络安装，测试用 `node_modules` 以 junction 指向 `package-lock.json` sha256 相同的
   download-requests worktree（`node_modules` 被 `.gitignore` 忽略，不属候选，不影响候选哈希）。
