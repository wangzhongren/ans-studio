# D1 跨角色回归：派发护栏放宽（dispatch-guardrail-relax）

- **任务 ID**：`2026-11-02-dispatch-guardrail-relax`（风险档位 **T3**）
- **记录角色**：测试（Testing）
- **日期**：2026-11-02
- **阶段**：D1 跨角色回归（团队计划 §5.1/§5.3、§7.3；V1 §2.3/§5.3/§5.5）
- **状态**：**D1 取证完成；初次发现 1 项新增确定性失败（`i-full-chain` 旧断言），经统筹裁定授权 D1-fix 完成测试-only 迁移并重跑；最终候选 T3 为 9 项既有 Windows symlink EPERM、新增确定性失败 0、新增 skip 0。本记录只陈述事实，不判验收；D2 未执行**。
- **输入与基线**：
  - 团队计划 v1：`docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md`（**482 行** / `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d`）
  - 验收标准 V1：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`（**814 行** / `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3`）
  - B0 基线：`角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md`（**201 行** / `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb`）
  - B1 实施记录：`角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation.md`（**113 行** / `048aa4270b3a1fc064b2ea9bc34368b1862960a0a61b40b7c38dcf22bf70b87b`；B1 报 7 文件 61/61、typecheck 0、全量桌面 462/462）
- **候选身份**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`（tree `689a49580fd7e79a0bfae1be343597b793967f71`）；初始 D1 候选树 `f5aea50f145609f7e31d73a1a61f869ef143ce36`（HEAD + A1 五文件 + B1 八文件，与 B1 记录一致）；**D1-fix 后最终候选树 `79962115b301f9e2b7c6c0d19af8844335b1fef5`**（见 §十一）。
- **环境**：Windows 11 Pro 10.0.26300 / MINGW64 Git Bash 3.6.10；Node **v24.22.1** / npm **11.19.1**；Git 2.55.0.windows.5；`node_modules` 与 Electron 44.7.0 二进制存在（同 B0）。D1 未启动应用、未运行 E2E。

---

## 一、候选写集与文件身份

### 1.1 写集核对

| 检查 | 结果 |
| --- | --- |
| HEAD | `c80f4944c3421554fcbd35f8570cedd3e2119a0a`（未变） |
| `git status --porcelain -- src app test` | 12 个条目：A1 5（2 改 + 2 新增 + 1 改测试）+ B1 7 改（`session.ts` + 6 个桌面测试）；**`test/桌面应用/dispatch-fresh-enum.test.ts` 未改**（B1 写集第 8 文件，属正常） |
| 写集外产品/测试改动 | **无**；`git status --porcelain -- src app test` 与团队计划 §4.3 写集逐项对应 |
| `git diff --cached --name-only` | 空（未暂存） |
| `git diff --diff-filter=D --name-only` | 空（无删除文件） |
| `git diff --name-only -- package.json package-lock.json` | 空；`package.json` SHA-256 `8b8bde31…`、`package-lock.json` `cf00899d…`（与既有基线一致） |
| 管理/治理改动（非产品候选） | 3 个 memo、桌面窗口 boundary.md/yaml/changelog、编排 api-spec.md/memo；均由对应角色记录，不进入产品候选 |

### 1.2 A1/B1 改动文件身份（候选实测）

| 文件 | 行数 | `git hash-object` | SHA-256 | 对照 |
| --- | --- | --- | --- | --- |
| `src/common/编排/workflow-preconditions.ts` | 1337 | `83a6c7ebfc5b3fe9094f3a67df5704bfdfd05be5` | `9dfb55638324b6657fd7dc3928e7c7430215848dd9ee6c7d78a21de86ba1249f` | A1 冻结一致 |
| `src/common/编排/dispatch-advisories.ts` | 283 | `211e70467ddb7c3557d3c4a0562e7a431c01f7cf` | `0781cd3db1201a724feb9ece4837aef4d23c043fa12e202cd01f0dd8d1e30d6f` | A1 冻结一致 |
| `src/common/编排/mechanical-rejection.ts` | 190 | `270d0c016c4c5069cd34a8154dfcf20c8938a542` | `1e1e65736d99d371dbf13bbc18d9d88a048d17ac7fd6475ee508cca623750a62` | A1 冻结一致 |
| `test/编排/workflow-preconditions.test.ts` | 972 | `e1a7683eebc9f4f35d318921dd1d1a6725c0e14f` | `bec8c36109dc4cb1ad823f2dd363ff8aa8aae9e96276287733b5989c8cef066b` | A1 冻结一致 |
| `test/编排/dispatch-advisories.test.ts` | 304 | `8744a22cdba803394d2636236d3fac17263c88bf` | `72a3ad0cf9ee87d3cd0cecc7c96847463de7c1288103f016e7d433df0620c7e5` | A1 冻结一致 |
| `app/desktop/session.ts` | 7819 | `0fd043a7627c9be031bc2f83ead1f2b11af96443` | `491bf24f8fa2201454524093e863ae7d01f50c2fde2f0aad612aab288b6b5030` | B1 记录一致 |
| `test/桌面应用/chain-enforcement.test.ts` | 1036 | `0cbf827a3957ed3e667dd1b8ed9fcb872133a9ec` | `9e20c8b6360180b71fc0b0407f284803b48b4f7c4657d80779fcbebda9eb633b` | B1 记录一致 |
| `test/桌面应用/star-routing.test.ts` | 391 | `fd5c71fe4d5aa016e1220966c7e6e1dc10f19f45` | `e0bfdfd6634b6ce811a0006eee5bde4ea6e2b78790d2ada2f0b1f849ccb4ba40` | B1 记录一致 |
| `test/桌面应用/rejection-copy.test.ts` | 268 | `1c45af3df38671868b802f80e1a2255cd3e6d915` | `8c7e7dcee84214addd9ff96071b83059470d117209a431a43851ca997686076f` | B1 记录一致 |
| `test/桌面应用/run-pin.test.ts` | 830 | `b66e1c91d5dc4eccefd0e62dbd5eef7df02eabd7` | `dad68b3b71c640341ed15a5e0b75020f3599f4cd75d3089c0346b592807773ed` | B1 记录一致 |
| `test/桌面应用/run-change-trigger.test.ts` | 479 | `addfec596168787b78a1c3c39f0a4cbe7f2c5c2b` | `1f9f93406d763e10ba36bd26342fba10f6ccb5981bc7e35b4fc2d1f1aa691976` | B1 记录一致 |
| `test/桌面应用/run-change-entry.test.ts` | 218 | `b8bbc605dae4645a2d2c663eea6bb1216688bd74` | `fc1a71f172495f198c32f735cdd43043f4818b6e794f318eb2ff6b61cf3ab16e` | B1 记录一致 |
| `test/桌面应用/dispatch-fresh-enum.test.ts` | 219 | `2b799498c572fd55111a868caa5ebda9e20fd3dc` | `fdca2a3f592db475c67f13d85a9f0d410e25131e63f6aee3fdc7d82d17f89425` | 未改（B1 记录一致） |

- A1 五文件哈希与派发消息给出的冻结值逐项一致；B1 八文件与 B1 实施记录 §1 逐项一致。
- **候选树**：`f5aea50f145609f7e31d73a1a61f869ef143ce36`（临时 index 计算，未触碰真实 index；与 B1 记录 §5 相同）。另生成一个无 ref 引用的悬空候选对象 `1c48fd280d83e25f94d3865c64173c404925d59f`（`git commit-tree`，未更新任何分支/索引，不是提交动作）。
- 原始输出：`01-git-baseline.txt`（84 行 / `2ec3a41a5c9a7b823ad845d7abf97b92c2ac8490c58c23732953356039983977`）、`02-candidate-file-hashes.txt`（20 行 / `604b9280313f85054ed28a6bf15b19f0f6f2342e111858b3ae2ade0dfbad992f`）、`03-candidate-tree.txt`（10 行 / `c489fe59be4c8ea47eead52ca5bbe474c060aadf48e811659d64b3c825211173`）。

---

## 二、受影响套件

| # | 命令 | 退出码 | tests | pass | fail | skip | todo | duration_ms | 失败 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts` | **0** | 34 | 34 | 0 | 0 | 0 | 290.7548 | 无 |
| B | `node --test --test-concurrency=1` 7 个桌面文件（chain-enforcement / star-routing / rejection-copy / run-pin / run-change-trigger / run-change-entry / dispatch-fresh-enum） | **0** | 61 | 61 | 0 | 0 | 0 | 14050.8454 | 无 |

A+B = 95 个测试全部通过，0 fail / 0 skip / 0 todo。与 B0 基线（39 + 50 = 89）相比，测试数 +6（A1 新增/迁移 + B1 迁移），符合 B1 记录「7 文件 50 → 61」。原始输出：`04-affected-orchestration.txt`（46 行 / `43ced74076af535baa755695c696f6e5afb643d363c63d99c44bd9bc81abb4fc`）、`05-affected-desktop.txt`（73 行 / `9d623b0ff9cdf91f251c6e387d83ea196ee1971a0e71b84b015658339969a539`）。

---

## 三、补充目录套件

| # | 范围 | 命令 | 文件数 | 退出码 | tests | pass | fail | skip | todo | duration_ms | 失败 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C | 桌面应用目录 | `node --test --test-concurrency=1 $(find test/桌面应用 -name '*.test.ts')` | 50 | **0** | 462 | 462 | 0 | 0 | 0 | 67021.5012 | 无 |
| D | 编排目录 | `node --test --test-concurrency=1 $(find test/编排 -name '*.test.ts')` | 53 | **1** | 661 | 660 | **1** | 0 | 0 | 14120.8607 | `test/编排/shell-authorized-routine.test.ts:191` 既有 Windows symlink EPERM |

- 桌面应用目录 462/462，与 B1 记录的全量桌面 462/462 一致。
- 编排目录唯一失败为既有 Windows symlink EPERM（`errno -4048`，与 B0 第 9 项同测试/同因）；非本候选新增。
- 命令用 `find` 显式展开；`node --test "test/桌面应用/**/*.test.ts"` 的 glob 形式未采用，实际命令与等价性如上（团队计划允许记录实际命令）。
- 原始输出：`06-supplementary-desktop-dir.txt`（488 行 / `2a47e9388331d630b79e0b6d51db4f3ecaeebd3855d81b8aaacc05d94f40a49e`）、`07-supplementary-orchestration-dir.txt`（1240 行 / `7a1dea2b806a06d533594924bca6aa75264b0a0191923a72ddb0f0b3ed2e6300`）。

---

## 四、T3 全量回归

- 实际命令：

```bash
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')
```

- 工作目录：本 worktree 根；文件数 **387**（B0 为 386，新增 `test/编排/dispatch-advisories.test.ts`）；时间 2026-11-02T04:36:54Z → 04:41:37Z（duration_ms **282362.9258**，约 4 分 42 秒）。
- 排除项：`test/pi-adapter/write-sequencing.test.ts`（既有已知挂起；依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`；命令中显式 `! -name 'write-sequencing.test.ts'`，未静默跳过）。
- 退出码：**1**。
- 计数：

| tests | suites | pass | fail | cancelled | skipped | todo |
| --- | --- | --- | --- | --- | --- | --- |
| **3385** | 0 | **3357** | **10** | 0 | **18** | **0** |

原始输出：`10-t3-full-suite.txt`（4503 行 / `998a00c33b446f7f6ac12da6d5abb0afdbad1b7fd2409f1a0409af1397fac78b`）。

### 4.1 失败清单

| # | 分类 | 测试文件:行 | 测试名 | 错误 |
| --- | --- | --- | --- | --- |
| 1 | 既有环境 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query | EPERM symlink（errno -4048） |
| 2 | 既有环境 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary | EPERM symlink |
| 3 | 既有环境 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write | EPERM symlink |
| 4 | 既有环境 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage | EPERM symlink |
| 5 | 既有环境 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced | EPERM symlink |
| 6 | 既有环境 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected | EPERM symlink |
| 7 | 既有环境 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects | EPERM symlink |
| 8 | 既有环境 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 | EPERM symlink |
| 9 | 既有环境 | `test/编排/shell-authorized-routine.test.ts:191` | node test外指符号链接路径不获委托；项目内测试路径获委托 | EPERM symlink |
| 10 | **新增确定性失败（非环境）** | `test/测试/governance-e2e-auto/i-full-chain.test.ts:131`（断言 `:176`） | 最小系统全链（v4.1）：六角色枚举 + 幕僚链首派发落 tasks.jsonl + 无 flow/gate/ledger + 运营派发作用域 | `AssertionError: 未接交付 ⇒ 运营派实现任务被拒`；actual `true`，expected `false` |

- 1–9 与 B0 基线失败集合逐项相同（名称/文件/EPERM 类型一致）；B0 为 9 fail，D1 为 9 项同 + 1 项新。
- 第 10 项在 B0 基线中**通过**（B0 `t3-full-suite.txt:2009`：`✔ 最小系统全链（v4.1）… (121.1692ms)`），在 D1 全量中失败（D1 `10-t3-full-suite.txt:2021`，149.1406ms）；为候选引入的**新增确定性失败**。

### 4.2 第 10 项隔离复跑（确定性）

- 命令：`node --test --test-concurrency=1 "test/测试/governance-e2e-auto/i-full-chain.test.ts"`，连续 3 次。
- 结果：3/3 均 **2 tests / 1 pass / 1 fail / 0 skip / 0 todo、退出码 1**，失败断言与全量完全一致（`未接交付 ⇒ 运营派实现任务被拒`）。日志：`11-isolated-i-full-chain-runs.txt`（96 行 / `467fadff73ddf61af9860cd400aa3459fb583574897341408cc7a322da67d3d3`）。
- 判定：确定性失败，非并发/时序偶发。

### 4.3 第 10 项原因与处置边界（事实）

- 测试断言旧语义：`test/测试/governance-e2e-auto/i-full-chain.test.ts:176` 期望 `convenerDispatch.ok === false` 且 message 匹配 `/交付/`（「未接交付 ⇒ 运营派实现任务被拒」）。
- 新语义（方案 §7.3 P4 / AC-2.4 / B1 提案）：运营未接交付派项目 worker 应**受理 + advisory `handoff-missing` + 任务行 +1**（目标存在时投递）。同语义的桌面测试 `test/桌面应用/star-routing.test.ts` 已迁移并在 D1 通过：`✔ convener 拥有 dispatch（v4.1）：未接交付时派项目 worker 受理 + advisory，建任务`。
- 该测试位于 `test/测试/`（测试角色目录），但 D1 派发明确要求「只写 `角色卡/测试/docs/change/` 证据，不改产品/测试源码」；D1 未修改该文件，也未新增 skip/todo。文件现状：226 行 / blob `daceef63488a771c3cd94295e293c5b235b83c4f` / SHA-256 `41c6013beaee7e9bd96f4c338a68c9fc6f6d1ab531b565c662d2df019627230f`。
- 处置缺口属**测试迁移/计划范围问题**，需统筹决定由哪个角色、在哪个授权节点迁移该断言（或确认其他处置）；本记录不自行修改，也不把它计为通过。

### 4.4 skip / todo

- skip **18**，与 B0 完全同类：D3/POSIX 权限、umask、chmod、fsync 相关 15 项；POSIX 进程组 SIGTERM 1 项；不可读权限 1 项；目录不可写（`# chmod 语义在 Windows 不适用`）1 项。
- todo **0**；**新增 skip/todo = 0**。
- 所有 skip 均为测试自身平台条件，不计为 pass。

---

## 五、typecheck

| 命令 | 退出码 | 结果 | 日志 |
| --- | --- | --- | --- |
| `npm run typecheck`（`tsc --noEmit`） | **0** | 无错误输出；04:36:33Z → 04:36:35Z | `08-typecheck.txt`（8 行 / `4ab67fc279df125f5d98470de46feee6cc90b3c56311a19cdd93c14908dd8f5c`） |

渲染层未改，未运行 `typecheck:renderer` / `build:renderer`（团队计划默认口径）。

---

## 六、F4 只读核对

| 检查 | 结果 |
| --- | --- |
| `git diff --name-only -- src/pipeline/orchestration/run-role.ts` | 空 |
| `git diff --quiet HEAD -- src/pipeline/orchestration/run-role.ts` | 退出码 **0**（未改） |
| `git hash-object src/pipeline/orchestration/run-role.ts` | `8cb9d580c39a1ed38c787e2a8c7b02a30fe77358` |
| `git rev-parse HEAD:src/pipeline/orchestration/run-role.ts` | `8cb9d580c39a1ed38c787e2a8c7b02a30fe77358`（一致） |
| `app/desktop/session.ts` diff hunk | 见下 |
| 重派锚点 | `chooseRedispatchTarget` 在 `app/desktop/session.ts:4246`；`redispatchTask` 在 `:4398` |
| hunk 与重派区域重叠扫描 | 对 `4200–4750`（覆盖两锚点）与 `4300–4699` 两次扫描：**OVERLAP = 0** |

- `session.ts` hunk 头（`git diff -U0 | grep '^@@'`）集中在：import（`-92,+92` 等）、`-2045,80`（删除 run-change 辅助）、`-6086…-6403`（派发/锚点/回执区）、`-7059…-7083`（`evidenceScopeRoots` 区）；没有任何 hunk 落入重派方法区域。
- `app/desktop/session.ts` 含 NUL 字节，`grep` 需 `-a`（与 B0/上一任务记录一致）。
- 详细原始输出：`09-f4-check.txt`（170 行 / `08511e3032798e86a4a9d01579907b50bbdcba01819aa196f74f7c6753501a08`）。

---

## 七、Electron / E2E / 应用

- 按 D1 派发与团队计划，D1 **未启动应用、未运行 Electron E2E**；D2 另派。
- Electron 二进制与 `test/桌面应用/e2e/main.mjs` 存在性已在 B0 记录（§五）；D1 未重复启动探测。
- 本 worktree 的 ANS 应用在 D1 期间未由本角色启动或操作。

---

## 八、D1 事实结论（不判验收）

1. **候选身份一致**：HEAD 未变；A1 五文件哈希与冻结值逐项一致；B1 八文件与 B1 记录逐项一致；候选树 `f5aea50f…` 与 B1 记录一致；无写集外产品/测试改动、无 `package.json`/锁改动、无删文件、暂存空。
2. **受影响套件通过**：编排 34/34、桌面 61/61，均 exit 0；补充桌面 462/462 exit 0；补充编排 660/661（唯一失败为既有 Windows symlink EPERM）。
3. **typecheck 通过**：exit 0。
4. **F4 满足**：`run-role.ts` 与 HEAD 逐字节一致；`session.ts` 无 hunk 落入重派区域。
5. **T3 全量**：3385 tests / 3357 pass / 10 fail / 18 skipped / 0 todo；9 项既有 Windows symlink EPERM + **1 项新增确定性失败**（`i-full-chain.test.ts:176`，隔离 3/3 复现）；新增 skip/todo = 0。
6. **出口口径事实**：团队计划 §5.3/V1 §2.3 要求「新增确定性失败必须为 0」；当前新增确定性失败 = 1，故 **D1 暂不可按该口径放行**。该失败属 `test/测试/` 旧断言迁移缺口，D1 未被授权修改测试源码，需统筹/独立验收按流程处置（授权迁移或其他决定）。本记录不判验收，未进入 D2。（2026-11-02 统筹已授权 D1-fix；迁移过程与最终候选结果见 §十一。）
7. **限制**：未运行 E2E（D2）；未验证 A1/B1 之外的产品行为；未修改任何测试断言以保绿。

---

## 九、证据文件清单

目录：`角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-D1-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `01-git-baseline.txt` | 84 | `2ec3a41a5c9a7b823ad845d7abf97b92c2ac8490c58c23732953356039983977` |
| `02-candidate-file-hashes.txt` | 20 | `604b9280313f85054ed28a6bf15b19f0f6f2342e111858b3ae2ade0dfbad992f` |
| `03-candidate-tree.txt` | 10 | `c489fe59be4c8ea47eead52ca5bbe474c060aadf48e811659d64b3c825211173` |
| `04-affected-orchestration.txt` | 46 | `43ced74076af535baa755695c696f6e5afb643d363c63d99c44bd9bc81abb4fc` |
| `05-affected-desktop.txt` | 73 | `9d623b0ff9cdf91f251c6e387d83ea196ee1971a0e71b84b015658339969a539` |
| `06-supplementary-desktop-dir.txt` | 488 | `2a47e9388331d630b79e0b6d51db4f3ecaeebd3855d81b8aaacc05d94f40a49e` |
| `07-supplementary-orchestration-dir.txt` | 1240 | `7a1dea2b806a06d533594924bca6aa75264b0a0191923a72ddb0f0b3ed2e6300` |
| `08-typecheck.txt` | 8 | `4ab67fc279df125f5d98470de46feee6cc90b3c56311a19cdd93c14908dd8f5c` |
| `09-f4-check.txt` | 170 | `08511e3032798e86a4a9d01579907b50bbdcba01819aa196f74f7c6753501a08` |
| `10-t3-full-suite.txt` | 4503 | `998a00c33b446f7f6ac12da6d5abb0afdbad1b7fd2409f1a0409af1397fac78b` |
| `11-isolated-i-full-chain-runs.txt` | 96 | `467fadff73ddf61af9860cd400aa3459fb583574897341408cc7a322da67d3d3` |
| `12-d1fix-file-identity.txt` | 100 | `9f2990bf463fdbbaf416393518412563cb5d478f143056628dc486cb05f45af4` |
| `13-d1fix-isolated-i-full-chain.txt` | 79 | `c285537ac2daae1fe025b8c349145cd9920a238390982b2b58147d1abc5cfa73` |
| `14-d1fix-affected-orchestration.txt` | 47 | `99e578c889e8f38231e86de4a21960e72741b277a1196db81528117f7e483260` |
| `15-d1fix-affected-desktop.txt` | 74 | `bf68d3e3e27327ea858f80e697a198e2060f0fee6bbcd1d3be87fe8452a5ab37` |
| `16-d1fix-governance-e2e-auto-dir.txt` | 16 | `11f289dc66636a3453f24fe228e53a16187ed94c8f17d4d99610cd197dd8cac7` |
| `17-d1fix-t3-full-suite.txt` | 4487 | `823def59a5d7d42966d01d8634f83798d9861f196baadffd99da1c1637740791`（最终干净复跑） |
| `17a-d1fix-t3-full-suite-intermediate-enotempty.txt` | 4490 | `630c1529e28a2fd74ec4e4e84f89fb871f176efcd66319fe35b56c7a257e2084`（中间态：清理竞态） |
| `17b-d1fix-t3-full-suite-transient-background-erase.txt` | 4501 | `6c95ea7b1dd36eee1bc096e0bd59749b4a7c79433b0927b42faa4f5d2768d672`（中间态：背景任务清理偶发） |
| `18-d1fix-typecheck.txt` | 9 | `8ba48a352ec335b452ba1bf7de5be3b57411ec78f2a5ad6d92093a9432658fe4` |
| `19-isolated-background-entry-runs.txt` | 113 | `08e42cd2b553e58a25ab867d75731b19643fc057b712469864a2f7b1aa11df2e` |
| `20-d1fix-final-candidate.txt` | 42 | `58a554bfa1bfb211fa5aa8dec7a31c451c8663f9c3d1ae5593d92bb6d700cbaa` |
| `21-d1fix-final-tree-and-f4.txt` | 56 | `f7a9b86a306e6abd538e6bb2147b654820321d4d9ec781aa1c731b03396a919c` |

本记录自身行数/SHA-256 由 D1 完成报告给出（文件无法在不改变自身内容的前提下内嵌最终哈希）。

---

## 十、写入边界与限制

- **写入边界**：仅 `角色卡/测试/docs/change/`（本记录与原始日志）。未修改产品源码、测试、配置、角色卡、边界、其他角色文档；未写 `docs/scheduling|acceptance|communication|planning`；未 commit/push/merge/release。
- **未运行**：Electron E2E、应用启动/截图、D2 动作；未安装/升级依赖。
- **证据绑定**：路径 + 行数 + SHA-256；候选变化、输入/夹具/环境变化会使相关证据失效，需重取。
- 本记录不是验收结论；新增失败的迁移/返工与 D2 由统筹/后续授权角色按团队计划与 V1 处理。

---

## 十一、D1-fix：`i-full-chain` 旧断言迁移（测试-only，2026-11-02）

### 11.1 授权与范围

- 统筹裁定：D1 的 1 项新增确定性失败在测试角色既有写集内（`test/测试/` 目录授权；`角色卡/测试/boundary.md` Section 1），授权 **D1-fix**；不需要改团队计划/写集或重开闸门。
- 依据：方案 §7.3 **P4** / AC-2.4——运营未接交付派实现由「拒发」改为「受理 + `handoff-missing` advisory + 任务行 +1」；B1 已迁移的 `test/桌面应用/star-routing.test.ts` 为参考（只读，未修改）。
- 写入范围：只改 `test/测试/governance-e2e-auto/i-full-chain.test.ts`；未新增文件、未改其他测试/产品/角色文档。

### 11.2 文件身份与 diff 摘要

| 阶段 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- |
| D1 原状（迁移前） | 226 | `daceef63488a771c3cd94295e293c5b235b83c4f` | `41c6013beaee7e9bd96f4c338a68c9fc6f6d1ab531b565c662d2df019627230f` |
| 断言迁移后、清理重试前 | 229 | `be3808d62439359cf19cfa7b3976c01818e2dae7` | `64fd7ddad4004e837f4e618165daacc74a1c4978464abbf264e4cf7602630696` |
| **D1-fix 最终** | 229 | `8707ec529f57bd26bfad3b245cf09f069ff7b3a1` | **`b5d5c6c8411d71797479a452d611bb91a3b62146df6e05f54e0929f7e8545e6b`** |

diff 摘要（完整 diff 见 `12-d1fix-file-identity.txt`，仅本文件）：

1. 顶部注释：改为「运营未接交付时派 worker 受理 + handoff-missing advisory，任务行 +1（不阻断）」。
2. convener 块旧断言迁移：
   - 删除 `assert.equal(convenerDispatch.ok, false, "未接交付 ⇒ 运营派实现任务被拒")` 与 `/交付/` 旧匹配；
   - 新增 `assert.equal(convenerDispatch.ok, true, …)`；
   - 新增 `assert.match(message, /尚未收到幕僚的交付任务/)`（`handoff-missing` advisory 的原文；技术 code 只进诊断，回执只带人话）；
   - 新增 `assert.match(message, /状态提示（未阻断）/)`；
   - 新增 `waitUntilTaskState(... records.size >= 2)` 与 `assert.equal(records.size, 2, "未接交付也受理并建任务（原 1 + 新 1）")`。
3. 两个测试的 `finally` 清理：`fs.rm(root, { recursive: true, force: true })` → 增加 `maxRetries: 10, retryDelay: 50`（Windows 异步日志写入与目录删除的 `ENOTEMPTY`/`EPERM` 清理竞态；**不涉及任何断言**，与 `star-routing` 已迁移测试的清理方式一致）。
4. **保留未动**：角色枚举、幕僚→产品受理与 `tasks.jsonl`/delivery 断言、幕僚→worker 硬拒与「拒绝不产生新任务行」、无 flow/gate/ledger、tasks.jsonl 存在、convener 注入断言、第二个 F 终态测试全部断言。

### 11.3 迁移后的验证（最终候选）

| 检查 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 隔离复跑 3 次 | `node --test --test-concurrency=1 test/测试/governance-e2e-auto/i-full-chain.test.ts` | **3/3 均 2 tests / 2 pass / 0 fail / 0 skip / 0 todo，exit 0** | `13-d1fix-isolated-i-full-chain.txt`（79 行 / `c285537a…`） |
| 受影响编排 | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts` | **34/34 pass，exit 0**，316.7118ms | `14-d1fix-affected-orchestration.txt`（47 行 / `99e578c8…`） |
| 受影响桌面 | 7 个桌面文件（同 D1 命令） | **61/61 pass，exit 0**，13967.2139ms | `15-d1fix-affected-desktop.txt`（74 行 / `bf68d3e3…`） |
| e2e-auto 目录 | `node --test --test-concurrency=1 $(find test/测试/governance-e2e-auto -name '*.test.ts')` | 1 文件，**2/2 pass，exit 0**，2062.8394ms | `16-d1fix-governance-e2e-auto-dir.txt`（16 行 / `11f289dc…`） |
| typecheck | `npm run typecheck` | **exit 0**，无错误输出 | `18-d1fix-typecheck.txt`（9 行 / `8ba48a35…`） |
| **T3 全量（最终干净复跑）** | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` | **3385 tests / 3358 pass / 9 fail / 18 skipped / 0 todo，exit 1**，281595.6505ms；失败集合与 B0 **逐项相同**（9 项既有 Windows symlink EPERM）；`i-full-chain` 通过（`:2022`，157.5156ms）；**新增确定性失败 0、新增 skip 0** | `17-d1fix-t3-full-suite.txt`（4487 行 / `823def59…`） |

### 11.4 中间态与清理竞态（如实披露）

1. **中间态 A（`17a`）**：断言迁移后、清理重试前的 T3 全量为 3385/3357/10/18；第 10 项为 `i-full-chain` 自身在 `finally` 清理时 `ENOTEMPTY: directory not empty, rmdir '…\.ans\state\logs'`（`errno -4051`）。测试体断言全部通过，失败仅发生在清理；因此按既有 `star-routing` 测试做法为 `fs.rm` 增加 `maxRetries`/`retryDelay`（不改断言）。日志：`17a-…intermediate-enotempty.txt`（4490 行 / `630c1529…`）。
2. **中间态 B（`17b`）**：清理重试后的首次 T3 全量为 3385/3357/10/18；第 10 项为**无关的既有测试** `test/测试/background-tasks-entry/background-entry.test.ts:292` 在 fixture 清理时 `EPERM, Permission denied: '…\Temp\ans-qa-bg-…'`（`syscall: 'rm'`，非 symlink）。该测试体未失败；隔离复跑 **5/5 均 12 tests / 12 pass / exit 0**（`19-isolated-background-entry-runs.txt`，113 行 / `08e42cd2…`），归类为**非确定性的 Windows 清理/环境偶发**，不是本候选新增确定性失败。日志：`17b-…transient-background-erase.txt`（4501 行 / `6c95ea7b…`）。
3. **最终干净复跑（`17`）**：同一最终候选 T3 全量为 3385/3358/**9**/18/0；9 项与 B0 失败集合逐项相同；上述两类清理竞态均未复现，`i-full-chain` 通过。日志见 §11.3。

### 11.5 最终候选身份与 F4

- 最终候选树：**`79962115b301f9e2b7c6c0d19af8844335b1fef5`**（临时 index = HEAD + A1 五文件 + B1 八文件 + `i-full-chain`）；悬空候选对象 `c78a402942deb12591b1799e7680bf9f1b6bdcc1`（无 ref，非提交动作）。日志：`21-d1fix-final-tree-and-f4.txt`（56 行 / `f7a9b86a…`）。
- `git status --porcelain -- src app test`：13 个条目 = A1 5 + B1 7 + `i-full-chain` 1；无写集外改动、无删文件、暂存空；`package.json`/`package-lock.json` 未改。
- A1 五文件与 B1 八文件哈希与 D1 初始候选**逐项相同**（仅新增 `i-full-chain` 的修改）；逐文件表见 `20-d1fix-final-candidate.txt`（42 行 / `58a554bf…`）。
- F4 复核：`src/pipeline/orchestration/run-role.ts` `git diff --quiet HEAD` exit 0（blob `8cb9d580…` 未变）；`app/desktop/session.ts` blob `0fd043a7…` 未变；hunk 与重派区域（4200–4750）扫描 **无 OVERLAP**。

### 11.6 D1-fix 事实结论

- 迁移后的 `i-full-chain.test.ts` 在隔离、受影响套件、e2e-auto 目录与最终 T3 全量中均通过；断言未被删除或放宽，只把旧「拒绝」语义迁移为「受理 + handoff-missing advisory + 任务行 +1」，并保留其余全部断言。
- 最终候选 T3：**9 fail（全部为 B0 同集合的既有 Windows symlink EPERM）/ 新增确定性失败 0 / 新增 skip 0 / todo 0**；typecheck exit 0；F4 满足。
- 本记录不判验收；D2 未执行，仍需按团队计划另派。

