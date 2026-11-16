---
id: ci-test-timeout-600-20261116
type: change
title: 测试专用 CI（test-ci.yml）：per-test 超时 300000 → 600000（仅开发反馈通道）
created: "2026-11-16"
updated: "2026-11-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ci-test-matrix-20261113, ci-test-force-exit-20261116, test-debt-x64-followup]
events:
  - date: "2026-11-16"
    kind: created
    summary: test-ci.yml 的 --test-timeout 300000→600000（协调者批准，仅开发反馈 workflow）；顶部注释补充 x64 慢 runner 依据与非门禁放松边界；release.yml 零改动
  - date: "2026-11-16"
    kind: verified
    summary: YAML 双解析器通过；改动前后结构 diff 仅 1 处（测试 run 行）；release.yml 解析结构 identical 且 git diff --exit-code 为 0；git diff --stat 仅 workflow（11+/2-）；未 commit/push、未触发 workflow
---

# 测试专用 CI：per-test 超时 300000 → 600000（仅开发反馈通道）

- 角色：ANS「项目管理」（roleId: 项目管理）。
- 任务：经协调者批准的 CI 调整——把开发反馈 workflow（`.github/workflows/test-ci.yml`）的
  `--test-timeout=300000` 提到 `--test-timeout=600000`。
- 工作树/分支：`.claude/worktrees/ci-timeout600` / `ci/test-timeout-600`，起点 `77d3505`
  （= `origin/main`，已程序化确认 `git rev-parse origin/main` 与 HEAD 相同）。
- 范围：只改 `.github/workflows/test-ci.yml` + 本记录。未改 `release.yml`、源码、测试、角色卡、
  边界；未 commit/push；未触发任何 workflow；未 tag；未碰 main；未读 `.env`；未占用
  9222/9223/9224。
- 本机：Windows 11 Pro 10.0.26300，Node v24.22.1（CI 为 24.14.0）。

## 一、批准依据（x64 慢 runner 的真实串行全链耗时）

1. **协调者已批准**（2026-11-16）：仅把**开发反馈通道**的 per-test 超时从 300000 提到
   600000；发布门禁口径不变。
2. **事实基础**：`角色卡/测试/docs/change/2026-11-16_test-debt-x64-followup.md` §1.3 与
   `..._evidence/07-q2p2-timeline.txt`（同一轮三平台 run，`git-role-workflows-e2e.test.ts`
   的「Q2 P2 first new project: empty public chief -> formal convener bootstrap before future
   planning/D3/cards」）：
   - 整例耗时：mac-arm64 **214,039ms 绿**、Windows **195,593ms 绿**、mac-x64
     **300,001ms 超时**（`test timed out after 300000ms`，被 watchdog SIGTERM；无断言体）。
   - child 时间线（`Q_OWNED_BUSINESS_CHILD_START` → `Q_PERSISTED_CHILD_OBSERVED`，即
     worker dispatch 段）：arm64 69.6s / Windows 67.1s / **x64 226.2s**（约 3.25–3.37×）。
   - 该批结论：Q2 P2 无安全语义等价的缩短空间（用例轮询粒度 10ms、链路为串行前置依赖）；
     提高预算属 owner 决策，已列入 owner 裁决项（x64-followup §1.3、§五.3）。
3. **600000 的余量判断**：x64 已实测 dispatch 段 226s 且整例在 300s 触顶；600s 约为实测段的
   2.65×、约为 arm64/Windows 同链（195–214s）的 3×。若 600s 仍不够，按批准口径**拆分该测试
   并报告 owner**，不得继续静默抬预算（已写入 workflow 顶部注释）。

## 二、改动（`.github/workflows/test-ci.yml`，+11/−2）

### 2.1 测试命令

```diff
       - name: Full regression tests (bounded; development feedback)
         shell: bash
         run: |
           set -o pipefail
-          node --test --test-concurrency=1 --test-timeout=300000 --test-force-exit "test/**/*.test.ts" 2>&1 | tee test-ci-output.log
+          node --test --test-concurrency=1 --test-timeout=600000 --test-force-exit "test/**/*.test.ts" 2>&1 | tee test-ci-output.log
```

### 2.2 顶部注释

```diff
-#     据此放松）；本文件中的 --test-timeout=300000 只把挂起变成可命名的失败；
+#     据此放松）；本文件中的 --test-timeout=600000 只把挂起变成可命名的失败；
@@
 #   使用该 flag；发布门禁 command 不变。
 #
+# --test-timeout=600000 批准依据（2026-11-16，协调者批准，仅开发反馈通道）：x64 慢 runner 的
+#   真实串行全链耗时——Q2 P2（git-role-workflows-e2e「first new project」）在 mac-x64 上整例
+#   触顶 300s（300,001ms 超时；其中 child worker dispatch 段约 226s），同 run mac-arm64 /
+#   Windows 同链分别约 214s / 196s 绿（见 角色卡/测试/docs/change/2026-11-16_test-debt-x64-followup.md
+#   §1.3 与 07-q2p2-timeline.txt）。300000 在 x64 上已无余量，故把 per-test 超时提到 600000；
+#   它仍只把挂起/超预算变成可命名的失败，不跳过、不放宽任何断言/用例。发布门禁命令
+#   （release.yml）不动且本来没有 per-test 超时，Q2 P2 不构成发布阻断；若 600s 仍不够，
+#   改为拆分该测试并报告 owner，不得继续静默抬预算。
+#
 # 触发：仅 workflow_dispatch（手动）。输入 ref 指定被测 ref（分支/tag/commit），默认 main。
```

其余内容（矩阵、Node 版本、git config、checkout、npm ci、typecheck、ripgrep 保障、
upload-artifact、权限、并发、job 超时 120 分钟）逐字未动。

## 三、非门禁放松论证（发布门禁本来没有 per-test 超时）

1. **独立 workflow、零发布动作**：`test-ci.yml` 仍仅 `workflow_dispatch`、`contents: read`；
   无 tag/打包/overlay/Release 资产。通过与否只表示该 ref 的开发期测试状态，不产生发布放行结论。
2. **`release.yml` 零改动且没有 per-test 超时**：发布权威测试命令仍是
   `node --test --test-concurrency=1 "test/**/*.test.ts"`——**不含 `--test-timeout`**
   （Node 默认无 per-test 截止时间），也不含 `--test-force-exit`。因此 300000 从来不是发布
   门禁的一部分，本改动没有放宽任何发布口径；发布 job 自身的 45 分钟 job 级预算未改，
   Q2 P2 不构成发布阻断。
3. **`--test-timeout` 语义边界**：它只把挂起/超预算的用例变成**可命名的失败**，不跳过、
   不重试、不放宽任何断言/用例；超过 600s 仍是失败，且失败名/统计照常进入
   `test-ci-output.log`（`upload-artifact` `if: always()` 不变），known-red 差分口径不受影响。
4. **批准边界**：600000 仅存在于开发反馈 workflow；发布门禁命令保持严格口径，不得据本改动
   放松。若 600s 仍不够，拆分测试并报告 owner。

## 四、验证（本地，未触发任何 workflow）

1. **YAML 解析**：`yaml@2.9.0`（主解析，与 `package.json` 的锁定版本一致）与
   `js-yaml@4.3.2`（交叉解析）均通过（经主检出 `node_modules` 加载；工作树未 `npm ci`）。
2. **改动前后结构 diff（程序化）**：解析后逐路径比对，**唯一**变化为
   `jobs.test.steps[6].run`：
   - before：`set -o pipefail\nnode --test --test-concurrency=1 --test-timeout=300000 --test-force-exit "test/**/*.test.ts" 2>&1 | tee test-ci-output.log\n`
   - after：`set -o pipefail\nnode --test --test-concurrency=1 --test-timeout=600000 --test-force-exit "test/**/*.test.ts" 2>&1 | tee test-ci-output.log\n`
   程序化断言全部通过，包括：diff 恰 1 处且路径/前后文本逐字匹配；新命令含
   `--test-timeout=600000`、不再含 `--test-timeout=300000`、仍含 `--test-force-exit`；
   `matrix` / `permissions` / `concurrency` / 触发 / `timeout-minutes` / 步骤数（8）与除
   index 6 外的所有步骤（含 `upload-artifact` 的 `if` / `name` / `path` /
   `if-no-files-found`）与改动前 JSON-equal。
3. **release.yml 零改动**：`git diff --exit-code -- .github/workflows/release.yml` 退出码 0；
   解析结构与 HEAD identical；发布权威命令逐字为
   `node --test --test-concurrency=1 "test/**/*.test.ts"`，全文不含 `--test-timeout` 与
   `--test-force-exit`。
4. **git 状态**：`git diff --stat` 仅 `.github/workflows/test-ci.yml`（11 insertions(+),
   2 deletions(-)）；`git status --short` 为 1 个修改 + 本记录 1 个新文件（见 §五）。
5. **文件形态**：UTF-8 无 BOM。本机检出 `core.autocrlf=true`，工作树为 CRLF、索引为 LF
   （`git ls-files --eol`：`i/lf w/crlf`）；提交时 Git 按索引归一化，入库/远端为 LF，
   与既有 workflow blob 形态一致。
6. **未执行**：未 commit/push、未触发任何 workflow、未运行 `npm ci`/测试（通道本身由协调者
   合并后手动触发验证）。

## 五、证据边界

- 本轮只改 `.github/workflows/test-ci.yml` 与新增本记录；不改 `release.yml`、源码、测试、
  配置、角色卡、边界。
- 未打 tag、未 push、未触发任何 workflow、未占用 9222/9223/9224；本地只读校验为主。
- 本记录生成后工作树状态：`M .github/workflows/test-ci.yml`、
  `?? 角色卡/项目管理/docs/change/2026-11-16_test-ci-timeout-600.md`（未暂存、未提交）。
