# Reduce manifest：角色粒度与 MapReduce 并行测试（N7 终验）

- **任务 ID**：`2026-10-22-role-granularity-parallel-testing`（flowId `role-granularity-parallel-testing`）
- **记录角色**：测试（Reduce 终验）；状态 **verified-by-tests-only**（不宣布验收通过）
- **日期**：2026-10-22
- **阶段**：N7（Reduce：分片并行 + 合并 + 全量回归 + 真实启动/演示）
- **候选**：工作树候选（HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845` / tree `a736eaac0acdf3f6d979a42ec68071ae1e79ac12`）
  - `tracked_diff_sha256`（`git diff --binary -- src app test`）= `267194bf55246e586cda3f6bfee17a5de3e1e9b4b093321d96dcb54a788f5573`
  - `untracked_candidate_sha256`（未跟踪 src/app/test 文件） = `621ec300f17dc87656e50bc7198caf369b4aa398fdcf0eb8417934b089c61eef`
  - 逐文件 `git hash-object` + `sha256sum`：`candidate/hashes.tsv`（29 个文件；不含管理记录、角色文档、`app/renderer/dist`）
- **环境**：Windows 11 Pro 10.0.26300；Git Bash 5.3.15；Git 2.55.0.windows.5；Node v24.22.1；npm 11.19.1；Electron 44.7.0（真实启动演示）
- **证据根**：本目录（`角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-phase-e-evidence/`）

## 一、Map 分片（并行，独立临时根/日志）

每个分片使用独立 `TEMP`/`TMP` 目录（`map/tmp-<module>/`）、独立日志、独立退出码；同一时刻不共享可变项目根，不并发 `npm install`，不并发构建到同一输出目录。分片按模块并行启动。

| module 分片 | 命令 | 独立临时根 | 原始日志 | exit | tests | pass | fail | skip | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| orchestration | `node --test "test/编排/**/*.test.ts"` | `map/tmp-orchestration` | `map/map-orchestration.log` | 1 | 769 | 768 | 1 | 0 | 唯一红＝N3 基线既有 Windows symlink EPERM（`test/编排/shell-authorized-routine.test.ts:103`，`:110`） |
| gate-engine | `node --test "test/门禁引擎/**/*.test.ts"` | `map/tmp-gate-engine` | `map/map-gate-engine.log` | 0 | 313 | 312 | 0 | 1 | 全绿 |
| runtime-core | `node --test "test/runtime-core/**/*.test.ts"` | `map/tmp-runtime-core` | `map/map-runtime-core.log` | 1 | 292 | 285 | 3 | 4 | 3 红＝N3 基线既有 EPERM（file-write-safety:97、session-store:46/58） |
| desktop-files | `node --test "test/桌面应用/**/*.test.ts"` | `map/tmp-desktop-files` | `map/map-desktop-files.log` | 1（并行） | 518 | 517 | 1 | 0 | 1 红＝并行负载下桌面时序偶发；隔离复跑 16/16、整目录串行复跑 518/518（见 §二） |
| desktop-ui | `node --test "test/桌面UI/**/*.test.ts"` | `map/tmp-desktop-ui` | `map/map-desktop-ui.log` | 0 | 163 | 163 | 0 | 0 | 全绿 |
| governance-e2e | `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | `map/tmp-governance-e2e` | `map/map-governance-e2e.log` | 0 | 99 | 99 | 0 | 0 | 全绿（含 v2 完整链路/legacy v1 链路/q/r/p/b/c/d 新增用例） |

分片摘要文件：`map/map-<module>-summary.txt`；候选 ID：`map/candidate-id.txt`。

### 共享只读夹具 pin 哈希

- `map/fixture-pins-before.tsv` 与 `map/fixture-pins-after.tsv`：`test/**` 下 20 个 `fixture*.ts`/`helpers*.ts`/`*-fixture.ts` 的 SHA-256。
- 分片前后 `diff` 为空（`FIXTURE_PINS_UNCHANGED`）。分片不写共享夹具，只读使用。

## 二、失败隔离与分类

### 2.1 确定性既有失败（5 项分片内出现，全部属于 N3 9 项基线）

| # | 分片 | 文件:用例声明行（抛错行） | 失败用例 | 分类 |
| --- | --- | --- | --- | --- |
| 1 | orchestration | `test/编排/shell-authorized-routine.test.ts:103`（`:110`） | node test外指符号链接路径不获委托；项目内测试路径获委托 | 既有 Windows symlink EPERM |
| 2 | runtime-core | `test/runtime-core/file-write-safety.test.ts:97`（`:105`） | D3 linked workspace root remains usable; linked target itself is not replaced | 同上 |
| 3 | runtime-core | `test/runtime-core/session-store.test.ts:46`（`:51`） | store: traversal, mismatched scope and symlinked runtime directories rejected | 同上 |
| 4 | runtime-core | `test/runtime-core/session-store.test.ts:58`（`:63`） | store: native validation stays lazy and native symlink is rejected before effects | 同上 |
| 5 | desktop-files | `test/桌面应用/handback-delivery.test.ts:208`（`:215`） | E-1 去重：同一条回交重复到达（重放）→ 只投递一次 | **并行时序偶发**（非产品失败；见 2.2） |

### 2.2 桌面并行时序偶发（隔离分类）

- 现象：6 分片并行运行时 `desktop-files` 的 E-1 去重断言得到 `0 !== 1`（等待窗口内回交尚未投递），其余 517 项通过。
- 隔离复跑：`node --test test/桌面应用/handback-delivery.test.ts` → **16/16 pass，exit 0**（`map/rerun-desktop-handback-isolated.log`）。
- 整文件串行复跑：`node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` → **518/518 pass，exit 0**（`map/rerun-desktop-serial.log`，81,389 ms）。
- 分类：**并行负载下的桌面时序偶发**，记录为偶发而非产品失败；未修改任何测试/产品代码，未放宽断言。该分片的正式结论以串行复跑 518/518 为准（另见 §三 全量串行 3501/9）。

### 2.3 失败隔离执行

- `desktop-files` 偶发不阻塞其他分片：orchestration/gate-engine/runtime-core/desktop-ui/governance-e2e 均独立完成并取得退出码与计数。
- 无模块 owner 需要修复（偶发复跑通过；EPERM 为基线环境）。
- 未并发写同一文件：各分片独立 TEMP；`candidate-id.txt` 与 fixture pins 在分片前后一致。

## 三、Reduce 合并与最终验证（同候选）

| # | 检查 | 命令 | exit | tests | pass | fail | skip | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | canonical e2e | `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | 0 | 99 | 99 | 0 | 0 | `canonical-e2e.log` |
| 2 | T3 全量（并行） | `node --test "test/**/*.test.ts"` | 1 | 3528 | 3501 | 9 | 18 | `final-full-parallel.log` |
| 3 | T3 全量（串行） | `node --test --test-concurrency=1 "test/**/*.test.ts"` | 1 | 3528 | 3501 | 9 | 18 | `final-full-serial.log` / `final-full-serial-meta.txt`（300,781 ms） |
| 4 | typecheck | `npm run typecheck` | 0 | — | — | — | — | `typecheck.log` |
| 5 | typecheck:renderer | `npm run typecheck:renderer` | 0 | — | — | — | — | `typecheck-renderer.log` |
| 6 | build:renderer（exact） | `npm run build:renderer` | 0 | — | — | — | — | `build-renderer-exact.log`（299 ms；写 `app/renderer/dist/`，gitignore、非候选） |
| 7 | 真实 Electron 总自检 | `electron test/桌面应用/e2e/main.mjs` | 0 | — | — | — | — | `e2e-main/report.txt`（E2E_PASS=true / E2E_DONE=1，17 截图） |
| 8 | v2 治理链真实演示 | `electron test/测试/role-granularity-v2-demo.mjs` | 0 | — | — | — | — | `demo-v2/report.txt`（DEMO_PASS=true，8 截图，11,367 ms 级） |
| 9 | legacy v1 治理链真实演示 | `electron test/测试/phase-e-governance-demo.mjs` | 0 | — | — | — | — | `demo-legacy-v1/report.txt`（DEMO_PASS=true，7 截图） |

- **T3 全量对照 N3 基线**：基线 `3448/3421/9/18`；最终 `3528/3501/9/18`。增量 **+80 tests / +80 pass**（Map A/B/C 新增测试 + 本轮测试角色新增 31 例），**失败仍为同一 9 项 Windows symlink EPERM**，**零新增红**；并行与串行两次失败标题集合一致（`final-full-parallel-failure-titles.txt` / `final-full-serial-failure-titles.txt`）。
- **9 项 EPERM 逐条指名**（N3 基线 §10.4 同一清单）：`test/claude-adapter/session.test.ts:637`、`test/codex-adapter/session.test.ts:351`、`test/pi-adapter/injected-runtime.test.ts:185`、`:193`、`test/runtime-core/file-write-safety.test.ts:97`、`test/runtime-core/session-store.test.ts:46`、`:58`、`test/测试/g4-skill-verify/b-render-double-check.test.ts:182`、`test/编排/shell-authorized-routine.test.ts:103`。
- **跳过 18 项**：与 N3 基线分布一致（Windows 平台/chmod/umask/权限语义按设计 skip）；0 todo。
- **未发现挂起/超时**：本轮全量并行 22.6 s、串行 300.9 s，均正常结束；无 TaskStop/超时终止。

## 四、Provider 口径核对

- v2 初始 flow YAML 可携带 `parallelGroup`/`dependsOn`（`r4` 与 `q7` 均解析通过）；Map/Reduce 派发依赖由 `governance-gate` 读取 flow 步骤实现。
- **未发现**需要给 `flow_step_supersede` 转发两字段、或让 `flow_get` 文本投影渲染两字段的证据；`FLOW_STEP_KINDS` 仍四值（`r3`/`r4`）。本轮未扩 Provider 参数，未修改 `src/provider/runtime/**`。
- 若后续要求工具级更新并行字段，应按团队计划 §11.6 停止并回报，不静默扩参。

## 五、证据索引

| 文件/目录 | 内容 |
| --- | --- |
| `candidate/hashes.tsv` | 29 个候选文件（src/app/test）的 `git hash-object` + `sha256sum` |
| `candidate/candidate-paths.txt` / `candidate-paths.z` | 候选路径清单 |
| `candidate/untracked-paths.txt` / `untracked-paths.z` | 未跟踪候选文件（5 个） |
| `candidate/status-short.txt` / `diff-name-only.txt` / `diff-stat.txt` / `full.diff` | 工作树候选原始状态与完整 diff（`full.diff` 含 5 个未跟踪文件的 `/dev/null` diff） |
| `candidate/diff-cached-name-only.txt` | 空（未暂存） |
| `candidate/head.txt` / `tree.txt` | HEAD / tree |
| `map/` | 6 个分片日志、摘要、TEMP 根、候选 ID、fixture pins、桌面偶发隔离/串行复跑日志 |
| `final-full-parallel.log` / `final-full-serial.log` | T3 全量并行/串行原始输出与失败标题 |
| `real-entry.log` | `test/测试/real-entry.test.ts` 定向复跑（16/16，F3 通过） |
| `invariants-check.txt` | 非目标不变抽检（工程基线文本/治理注册表/枚举值/FlowStepKind） |
| `typecheck.log` / `typecheck-renderer.log` / `build-renderer-exact.log` | 类型检查与 exact 构建 |
| `e2e-main/` | 真实 Electron 总自检报告与 17 张截图 |
| `demo-v2/` | v2 治理链真实演示报告与 8 张截图 |
| `demo-legacy-v1/` | legacy v1 治理链真实演示报告与 7 张截图 |

## 六、边界与状态

- 本阶段只在 `test/测试/**` 与 `角色卡/测试/docs/**` 内写入；未改产品源码、其他角色测试目录、`test/桌面应用/`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界；未新建 `test/桌面应用/` 文件。
- 未暂存、提交、推送、合并、发布。
- 测试角色**不宣布验收通过**；本 manifest 只汇总测试证据，最终判定由内置独立验收按标准执行。
