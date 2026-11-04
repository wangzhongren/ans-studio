# 变更记录：预授权测试同步——convener 工作流写权回归（2026-11-04）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-11-04
- 角色：编排（Orchestration）
- 依据：`docs/communication/2026-11-04_issue-workflow-md-no-writer.md`（客户最终决定：恢复 convener 对 `docs/workflow.md` 的写权，保留「工作流先行」；否决「缺省容忍」）
- 任务：A 直修（worktree `workflow-writer-fix`，分支 `fix/convener-workflow-write`，基线 `origin/main f4c24ea`）
- 工作区说明：子代理 `EnterWorktree` 创建被 harness 拒绝，按任务后备命令 `git worktree add` 创建；
  文件工具仍被隔离，实际写入经受控暂存 + `cp` 完成。全部改动只落在该 worktree；未 commit / push / 发布。
- 范围：只改 `test/编排/section1-write-preauthorization.test.ts`（本角色测试目录）；不改编排源码。

## 1. 根因与背景

该测试此前钉住「D 批旧精确文件 `docs/workflow.md` 不再在 [convener 的] Section 1」——断言 convener 写 `docs/workflow.md` 被拒。
客户 2026-11-04 最终决定恢复该写权后，该断言与新基线相反；必须同步测试，不能保留旧断言或放宽为永远通过。

## 2. 改动（逐处 before → after）

文件：`test/编排/section1-write-preauthorization.test.ts`

1. 文件头说明（约 :5-7）：把「Convener 的 `docs/workflow.md`，它不在旧 `preauthorizedDirs` 目录清单内」更新为
   「2026-11-04 客户决定起该精确文件同时列入其 `preauthorizedDirs`」。
2. 用例「运营（Convener）无任务收窄…」（约 :222）：
   - before：`assert.equal(captured.gate!("docs/workflow.md").allowed, false, "D 批旧精确文件 docs/workflow.md 不再在 Section 1");`
   - after：`assert.equal(captured.gate!("docs/workflow.md").allowed, true, "2026-11-04 客户决定：docs/workflow.md 为 Section 1 精确文件预授权（工作流先行）");`
   - 新增负例：`docs/workflow.md.bak` 仍拒（精确文件条目只覆盖该文件本身）。
3. 新增用例「运营有任务 writeSet 时：docs/workflow.md 仍按既有 preauthorizedDirs 直接放行；他人写区仍拒」
   （约 :273-300）：任务 `writeSet` 仅 `docs/scheduling/plan.md` 时，`docs/workflow.md` 仍因 `preauthorizedDirs`
   精确文件子集直接放行；`docs/proposals/…` 仍按边界拒绝并给出归属提示。
4. 用例标题同步：原「…他人写集/禁写路径/旧 workflow 仍拒」→「…他人写集/禁写路径仍拒」。

## 3. 保留项（未放宽其它断言）

1. 项目角色 Section 1 精确文件/目录预授权、边界外拒绝、`.ans` 应用独占拒绝等断言逐字保留。
2. 任务 writeSet 收窄（F4）语义不变：有任务 scope 时 Section 1 不并入；nominator 用例仍钉住 F4 收窄。
3. 预授权只免「边界内逐次确认」；`forbiddenWritePaths`、接受门与治理门禁断言不变。

## 4. 测试与证据（原始数字）

证据目录：`角色卡/编排/docs/change/2026-11-04_change_convener-workflow-write-evidence/`

| 命令 | 原始结果 | 日志 |
| --- | --- | --- |
| `node --test test/编排/section1-write-preauthorization.test.ts` | tests 6 / pass 6 / fail 0 / skipped 0 / duration 241.0057ms | `section1-write-preauthorization.log` |
| `node --test "test/编排/**/*.test.ts"` | tests 758 / pass 757 / fail 1 / skipped 0 / duration 1671.1908ms；唯一失败为既有 Windows symlink `EPERM`（`node test外指符号链接路径不获委托…`） | `orchestration-suite.log` |

## 5. 候选哈希（sha256 / git blob SHA-1，2026-11-04 写定）

| 文件 | sha256 | git blob |
| --- | --- | --- |
| `test/编排/section1-write-preauthorization.test.ts` | `f85d48b45f116ca95d163c113e886a13d9ab64fb17b216ec4a96ac226aba6182` | `f9385079dd8b19c804059c2ec2c0782d0c8df435` |
| `.../section1-write-preauthorization.log` | `c5dd485250898b0ea35e3701679bc1f1400ed595cde159c5267717acdcbf4f61` | `d99efc3cb7cd2767bac15187a53ddd6606d73075` |
| `.../orchestration-suite.log` | `5ef571a60aafb269f15e130b7d8fa0de816db8400ab347e6406272c5d53287b5` | `1b8773c05d24884575986a91e31b3ac34b250ab0` |

本记录自身的 sha256 无法自引用内嵌，随最终回报给出。

## 6. 与预期不符 / 需要知悉

1. 编排套件 1 项失败为既有 Windows symlink `EPERM` 环境限制，与本次改动无关（原始日志见证据目录）。
2. 数据侧改动（convener entries/preauthorizedDirs、卡文本）见
   `角色卡/门禁引擎/docs/change/2026-11-04_change_convener-workflow-write.md`；
   `dispatch_task` 文案改动见 `角色卡/运行时核心/docs/change/2026-11-04_change_convener-workflow-write.md`。
