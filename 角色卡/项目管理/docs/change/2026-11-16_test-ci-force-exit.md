---
id: ci-test-force-exit-20261116
type: change
title: 测试专用 CI（test-ci.yml）：测试命令追加 --test-force-exit（仅开发反馈通道）
created: "2026-11-16"
updated: "2026-11-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ci-test-matrix-20261113, test-debt-b1b, test-debt-b3c]
events:
  - date: "2026-11-16"
    kind: created
    summary: test-ci.yml 测试命令加 --test-force-exit（协调者批准，仅开发反馈 workflow）；release.yml 零改动；顶部注释补充 flag 语义与批准依据
  - date: "2026-11-16"
    kind: verified
    summary: YAML 双解析器通过；改动前后结构 diff 仅 1 处（测试 run 行）；release.yml 树内零 diff；git diff --stat 仅 workflow（11+/3-）；未 commit/push、未触发 workflow
---

# 测试专用 CI：测试命令追加 `--test-force-exit`

- 角色：ANS「项目管理」（roleId: 项目管理）。
- 任务：经协调者批准的 CI 收紧——在开发反馈 workflow（`.github/workflows/test-ci.yml`）的
  全量测试命令中追加 `--test-force-exit`。
- 工作树/分支：`.claude/worktrees/cife` / `ci/test-ci-force-exit`，起点 `a0baea2`（= `origin/main`）。
- 范围：只改 `.github/workflows/test-ci.yml` + 本记录。未改 `release.yml`、源码、测试、角色卡、
  边界；未 commit/push；未触发任何 workflow；未 tag；未碰 main；未读 `.env`；未占用
  9222/9223/9224。
- 本机：Windows 11 Pro 10.0.26300，Node v24.22.1（CI 为 24.14.0）。

## 一、批准依据（B1b/B3c 的 post-test spin 残余）

1. **B1b**（`角色卡/测试/docs/change/2026-11-16_test-debt-b1b-chief-workflow-exit.md`）§五.2/§六：
   修复句柄泄漏后，本机仍偶发一种**与句柄无关的 Node 主线程 CPU 自旋**——套件全部用例完成、
   无汇总输出、进程不退出（V8 profiler 只剩 `(root)/(idle)`、无 socket、`--test-isolation=none`
   3/3 自然退出）。CI 侧同型表现为 `chief-workflow.test.ts` 末用例通过后静默 112 分钟直至
   job 120 分钟上限（run 43793243595）。测试侧无法从根上消除（不是可释放的句柄）。
2. **B3c**（`角色卡/测试/docs/change/2026-11-16_test-debt-b3c-ci-path.md`）§六.3：
   两个 initial-workflow 文件在**测试体全绿**后偶发文件级进程不退出（junction 3/20、plain 1/12、
   `--test-isolation=none` 2/8），与 B1b §6 同型；验证改用 `--test-force-exit` 3× 全绿，并明确
   **建议 owner 决定 `test-ci.yml` 是否加该 flag**（B3b/B1b 已提出同一建议；B3c 自身不改 workflow）。
3. **协调者已批准**仅在开发反馈通道（本 workflow）加 `--test-force-exit`；发布门禁口径不变。

## 二、改动（`.github/workflows/test-ci.yml`，+11/−3）

### 2.1 测试命令

```diff
       - name: Full regression tests (bounded; development feedback)
         shell: bash
         run: |
           set -o pipefail
-          node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts" 2>&1 | tee test-ci-output.log
+          node --test --test-concurrency=1 --test-timeout=300000 --test-force-exit "test/**/*.test.ts" 2>&1 | tee test-ci-output.log
```

### 2.2 顶部注释/非目标说明

```diff
 #   - 不改 release.yml：发布 workflow 保持原样（冻结 tag + overlay 发布门禁不动）；
 #   - 不放宽发布门禁：本 workflow 不替代、不参与发布验证。发布权威测试命令仍是
-#     release.yml 的 `node --test --test-concurrency=1 "test/**/*.test.ts"`；本文件中的
-#     --test-timeout=300000 只把挂起变成可命名的失败，不跳过、不放宽任何断言；
+#     release.yml 的 `node --test --test-concurrency=1 "test/**/*.test.ts"`（零改动，不得
+#     据此放松）；本文件中的 --test-timeout=300000 只把挂起变成可命名的失败；
+#     --test-force-exit 仅在**全部用例完成或被命名（失败）后**影响进程退出，用于防止
+#     Node/Windows 上测试后异步清理期（post-test spin 残余）进程不退出。两者都不跳过、
+#     不放宽任何断言/用例；
 #   - 不发布：无 tag、无打包、无 release-prepare/overlay、无 Release 资产、无写权限
 #     （仅 contents: read）；
 #   - 仅开发反馈：通过与否只表示该 ref 的开发期测试状态，不构成任何发布放行结论。
 #
+# --test-force-exit 批准依据：B1b（chief-workflow 退出/句柄泄漏修复）与 B3c（CI 路径规范形）
+#   记录的 post-test spin 残余——测试体全绿后偶发文件级进程不退出（无 ref'd 句柄、与修复
+#   无关的 Node 主线程自旋，--test-isolation=none 亦复现）。协调者已批准仅本开发反馈通道
+#   使用该 flag；发布门禁 command 不变。
+#
 # 触发：仅 workflow_dispatch（手动）。输入 ref 指定被测 ref（分支/tag/commit），默认 main。
```

其余内容（矩阵、Node 版本、git config、checkout、npm ci、typecheck、ripgrep 保障、
upload-artifact、权限、并发）逐字未动。

## 三、非门禁放松论证

1. **独立 workflow、零发布动作**：`test-ci.yml` 仅 `workflow_dispatch`、`contents: read`，
   无 tag/打包/overlay/Release 资产；通过与否只表示该 ref 的开发期测试状态，不产生发布放行结论。
2. **`release.yml` 零改动**：发布权威测试命令仍是
   `node --test --test-concurrency=1 "test/**/*.test.ts"`（严格口径，无 timeout/force-exit 附加
   参数），不得据本改动放松。
3. **`--test-force-exit` 语义边界**：Node 文档口径为「全部已知用例执行完毕后强制进程退出」——
   它只影响**用例完成/被命名后**的进程退出时机，用于防止测试后异步清理期（post-test spin 残余）
   进程不退出；它不跳过、不删除、不放宽任何断言/用例，也不能把失败或超时改写为通过。
   - 仍在运行的用例不受其影响：仍由 `--test-timeout=300000` 约束，超时即**可命名的失败**；
   - 失败名/统计在退出前照常完整输出；`upload-artifact`（`if: always()`）与日志 tee 不变，
     known-red 差分口径不受影响。
4. **批准边界**：该 flag 仅存在于开发反馈 workflow；发布门禁（release.yml）保持严格口径。

## 四、验证（本地，未触发任何 workflow）

1. **YAML 解析**：`yaml@2.9.0`（主解析）与 `js-yaml@4.3.2`（交叉解析）均通过，且两解析器对
   `test-ci.yml`/`release.yml` 的结构输出 JSON-equal（`on` 键均为对象）。
2. **改动前后结构 diff（程序化）**：解析后逐路径比对，**唯一**变化为
   `jobs.test.steps[6].run`：
   - before：`set -o pipefail\nnode --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts" 2>&1 | tee test-ci-output.log\n`
   - after：`set -o pipefail\nnode --test --test-concurrency=1 --test-timeout=300000 --test-force-exit "test/**/*.test.ts" 2>&1 | tee test-ci-output.log\n`
   程序化断言全部通过：恰好 1 处结构变化且路径/前后文本逐字匹配；新命令含 `--test-force-exit`；
   `release.yml` 结构 before/after 相同；发布权威命令逐字为
   `node --test --test-concurrency=1 "test/**/*.test.ts"` 且不含 `--test-force-exit`；
   `matrix`/`permissions`/`concurrency`/`upload-artifact` 步骤与改动前 JSON-equal。
3. **release.yml 零改动**：`git diff --exit-code -- .github/workflows/release.yml` 退出码 0
   （树内无差异）。
4. **git 状态**：`git diff --stat` 仅 `.github/workflows/test-ci.yml`（11 insertions(+),
   3 deletions(-)）；新增本记录后 `git status --short` 为 1 个修改 + 1 个新文件（见 §五）。
5. **文件形态**：UTF-8 无 BOM。本机检出 `core.autocrlf=true`，工作树为 CRLF、索引为 LF
   （`git ls-files --eol`：`i/lf w/crlf`）；提交时 Git 按索引归一化，入库/远端为 LF，
   与既有 workflow blob 形态一致。
6. **未执行**：未 commit/push、未触发任何 workflow、未运行 `npm ci`/测试（通道本身由协调者
   合并后手动触发验证）。

## 五、证据边界

- 本轮只改 `.github/workflows/test-ci.yml` 与新增本记录；不改 `release.yml`、源码、测试、
  配置、角色卡、边界。
- 未打 tag、未 push、未触发任何 workflow、未占用 9222/9223/9224；本地只读校验为主。
- 本记录生成后工作树状态：`M .github/workflows/test-ci.yml`、`?? 角色卡/项目管理/docs/change/2026-11-16_test-ci-force-exit.md`
  （未暂存、未提交）。
