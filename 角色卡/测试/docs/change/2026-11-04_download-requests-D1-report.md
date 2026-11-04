# D1 报告：下载文件申请跨层集成与全量回归（2026-11-04）

**风险档位：T3｜判定依据：客户闸门 0/1/2 与实施授权；团队计划 §5.1 D1/§6.2/§6.3；V1 `docs/acceptance/download-requests-criteria-v1.md` §4.2–4.5｜选定检查：新增跨层集成测试 + 六组受影响套件 + T3 全量（排除 `test/pi-adapter/write-sequencing.test.ts`）+ `npm run typecheck`/`typecheck:renderer`/`build:renderer` + 候选逐文件 hash-object/sha256 + diff/status｜复用证据：B0 v3（`角色卡/测试/docs/change/2026-11-04_download-requests-B0-baseline-v3.md`，HEAD `f0adb49`，T3 410/3697/3670/9/18）作为**对照基线**（非角色证据复用）；本 D1 对当前候选重跑全部检查｜消费者重测结论：运行时核心/编排/项目管理/桌面应用/桌面UI/测试六组 + T3 全量均重跑，通过（失败仅既有 Windows symlink EPERM）｜全量回归：已执行（见 §5）**

- 任务 ID：`2026-11-04-download-requests`
- 节点：D1（跨层集成 + 受影响套件 + T3 全量 + 静态门）
- 角色：测试（独立工作上下文）
- 日期：2026-11-04
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\download-requests`
- 状态：**`implemented-unverified`**（D1 只报告，不判验收；D2 真实运行未执行）
- 纪律：只新增 `test/测试/download-requests-integration.test.ts` 与 `角色卡/测试/docs/change/` 证据；不改产品源码、其他角色测试/文档、boundary/changelog、`docs/scheduling|acceptance|communication`；不 commit/push；不启动子代理。

## 1. 前置核对（开工 20:16:00）

| 项 | 期望 | 实测 | 结论 |
| --- | --- | --- | --- |
| 工作目录 | `...\.claude\worktrees\download-requests` | 同 | 一致 |
| HEAD | `1d7560f5dc4c8fb3de1f92483a087dd7b20c80da` | `1d7560f5dc4c8fb3de1f92483a087dd7b20c80da` | 一致 |
| 分支 | `feat/download-requests` | `feat/download-requests` | 一致 |
| `git status --porcelain -- src app test`（开工） | 仅本任务新增测试 | `?? test/测试/download-requests-integration.test.ts` | 一致（其余干净） |
| `git diff --cached --name-only` | 空 | 空 | 一致 |

提交序列（HEAD 组成）：`1d7560f` C2 renderer → `57b5ff2` C1 desktop wiring → `604c362` B1 verification → `f0adb49` merge origin/main（B0 v3 基线）→ `3c88fae` A1/A2/B1 candidates。

## 2. 新增跨层集成测试

- 文件：`test/测试/download-requests-integration.test.ts`（新增，唯一产品/测试区写入）。
- 装配：真实 Model（download/指令契约）+ 真实 Service（策略/配置）+ 真实 Provider（Node http 传输、文件 sink、`downloads.jsonl`、G8 A epoch 文件、customer-directive 文件账本）+ 真实 Pipeline（`download-request`/`customer-directive`）+ 真实桌面通道（`createCustomerInputChannel` + `SessionManager.withRequestLifecycle`）。
- 替身仅限：本地 HTTP 服务端（真实 Provider 经 impl `lookupOverride` 测试缝钉到 127.0.0.1，逻辑主机保持 `download.test:PORT`/`other.test:PORT`，产品策略不改）；presenter 回包（客户作答）；judge 脚本；directive 确认面板回包。不启动 Electron、不触外网、无测试专用生产缝。
- 结果：**13 tests / 13 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**；exit 0；`duration_ms 846.5487`。

| # | 用例 | 对应要求 |
| --- | --- | --- |
| 1 | G8 A：真实 epoch 文件；旧 domain 指令不授权（卡片路径）、新 allow/deny 生效；面板投影 none/download | epoch/预授权 allow/deny |
| 2 | 预授权 once：首次命中并消费、第二次回审批；执行失败也算已消费 | once + 失败算消费 |
| 3 | once durable 消费失败 ⇒ 回落普通审批，指令不被消费 | durable 失败回落 |
| 4 | 卡片路径审计：`request.created/presented/resolved`（by customer）+ downloads.jsonl（含 requestId） | 审计归属 |
| 5 | 审计坏行：downloads/tasks 坏行不影响主路径；小上限账本轮转仍可读 | 坏行/轮转 |
| 6 | 预授权路径审计：零 `request.*`；downloads.jsonl 无 requestId、by directive+directiveId | 审计归属 |
| 7 | judge approve：无客户卡、presented.to judge、downloads.jsonl by judge（含判据） | 判断路径 |
| 8 | judge manual ⇒ 客户卡 + judgeNotice；resolved.by customer | manual 转客户卡 |
| 9 | unavailableReason 防御：下载卡转客户卡、judge 不调用、不消耗预授权 | AC-28 |
| 10 | 跨域重定向 ⇒ `download-redirect-cross-host`；随后对目标重新申请成功 | 重定向重新申请 |
| 11 | 大小超限与超时：稳定 code 且清理占位/临时文件（download/ 为空） | 超限/超时清理 |
| 12 | 一项目一卡：真实通道排队，第二张在首张结算后才呈现 | 并发（一项目一卡） |
| 13 | 每项目执行并发 ≤2（跨会话共享）且并发同名不覆盖（后缀唯一） | 并发（≤2/同名） |

## 3. 六组受影响套件（逐组实测；★=与 B0 v3 差异）

| 套件 | 文件数 | exit | tests | pass | fail | cancelled | skipped | todo | duration_ms | 与 B0 v3 差异及归因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `test/runtime-core/**/*.test.ts` | 41 | 1 | 323 | 316 | 3 | 0 | 4 | 0 | 30,448.07 | 无变化 |
| `test/编排/**/*.test.ts` | 64 ★ | 1 | 799 ★ | 798 ★ | 1 | 0 | 0 | 0 | 15,408.31 | +3 文件/+32 tests：`604c362` B1 验证（download-judge/download-pipeline/download-provider + customer-directive 增补） |
| `test/项目管理/shared/**/*.test.ts` | 11 | **0** | 176 | 171 | 0 | 0 | 5 | 0 | 7,708.93 | 无变化 |
| `test/桌面应用/**/*.test.ts` | 57 ★ | **0** | 562 ★ | 562 ★ | 0 | 0 | 0 | 0 | 73,890.28 | +2 文件/+16 tests：`57b5ff2` C1（download-request/download-decision） |
| `test/桌面UI/**/*.test.ts` | 55 ★ | **0** | 408 ★ | 408 ★ | 0 | 0 | 0 | 0 | 5,266.85 | +1 文件/+3 tests：`1d7560f` C2（download-card） |
| `test/测试/**/*.test.ts` | 92 ★ | 1 | 594 ★ | 587 ★ | 1 | 0 | 6 | 0 | 76,134.88 | +1 文件/+13 tests：本 D1 集成测试 |

失败 5 项（与 B0 v3/v2/v1 完全相同，全部 Windows symlink EPERM，`errno -4048`、`syscall symlink`）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 2 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 3 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 4 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |
| 5 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |

## 4. 静态门

| 命令 | exit | 用时 | 备注 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 3s | `tsc --noEmit`（含新增集成测试） |
| `npm run typecheck:renderer` | **0** | 1s | `tsc -p app/renderer/tsconfig.json` |
| `npm run build:renderer` | **0** | 1s | built in 369ms；仅 chunk-size / 动态导入提示；`app/renderer/dist/` 为非候选忽略产物 |

## 5. T3 全量回归

- 口径：全量 `.test.ts` 排除 `test/pi-adapter/write-sequencing.test.ts`（既有已知挂起，显式排除并留清单）。文件集 **417**（418 个 `.test.ts` 排除 1）；与 B0 v3 清单 diff = **+7 文件**（B1 验证 +3、C1 +2、C2 +1、D1 +1），无其它增删。
- 执行方式（同 B0 口径）：10 个目录 glob + 39 个显式 pi-adapter 文件；静态覆盖校验 `expected=417 expanded=417 piExplicit=39 missing=0 extra=0`。
- 干净性检查（运行前/中×2/后）：仅本任务新增测试文件存在，无其它 `src app test` 写入（未触发中止）：

| 时点 | 检查 | 结果 |
| --- | --- | --- |
| 20:20:37（运行前） | `git status --porcelain -- src app test`；HEAD；staged | 仅 `?? test/测试/download-requests-integration.test.ts`；`1d7560f`；空 |
| 20:22:23（运行中 1） | 同上 | 仅本任务新增测试 |
| 20:24:10（运行中 2） | 同上 | 仅本任务新增测试 |
| 20:26:14（运行后） | 同上 | 仅本任务新增测试；`1d7560f`；staged 空 |

- 结果：**exit 1**（完全由 9 项既有 EPERM 失败解释）；**tests 3761 / pass 3734 / fail 9 / cancelled 0 / skipped 18 / todo 0**；`duration_ms 276,041.9104`（约 276.0s；约 20:20:5x–20:25:5x）。
- 失败（9/9 全部 Windows symlink EPERM，与 B0 v3 逐项一致）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | store validate callback rejects directory symlink before Pi parse or new native write |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

- 跳过 **18**：全部源码内平台条件（win32/!posix/root；含 1 项 `t.skip("chmod 语义在 Windows 不适用")`），与 B0 v3 相同。

### 5.1 与 B0 v3 对照

| 基线 | 文件 | tests | pass | fail | skip |
| --- | --- | --- | --- | --- | --- |
| B0 v3（f0adb49） | 410 | 3697 | 3670 | 9 | 18 |
| **D1（1d7560f）** | **417** | **3761** | **3734** | **9** | **18** |
| 差异 | +7 | +64 | +64 | 0 | 0 |

+64 tests 归因：B1 验证 +32（604c362）、C1 +16（57b5ff2）、C2 +3（1d7560f）、D1 集成 +13（本任务）。

### 5.2 结论

- **新增确定性失败 = 0**（9 项均为既有 Windows symlink EPERM，与 B0 v3 名单逐项一致）。
- **新增 skip = 0**（18 项均为既有源码内平台条件）。
- **非 EPERM 新增失败 = 0**。

## 6. 候选与证据

- 候选基线口径：`f394cfb`（B0 v1 规划基线）→ HEAD `1d7560f`；`src app test` 已提交改动 **82 文件**（43 新增 / 39 修改，无删除/重命名）+ 本任务新增测试 **1 文件** = **83 文件**。
- 逐文件 `git hash-object` + `sha256sum`：`18-hash-object.txt` / `18-sha256.txt` / 合并 `18-candidate-hashes.txt`（83 行）；清单 `18-candidate-files.txt`；`18-candidate-committed.txt`（name-status）与 `18-candidate-worktree.txt`。
- 工作区：`git diff --name-only -- src app test` 为空；`git status --porcelain -- src app test` 仅本任务新增测试；`git diff --cached --name-only` 为空；未 commit/push（HEAD 仍 `1d7560f`）。
- 管理文档/治理改动（非候选、非本角色）：H1 9 个 boundary/changelog 文件与 `docs/planning/memo.md` 仍为未提交修改（预期，未触碰）。

## 7. 限制与风险

1. D2（真实 Electron 探针/截图）未执行；Electron 二进制在 B0 v3 记录为缺失（需 `install-electron`），D2 前须准备。
2. 候选尚未由 E1 冻结（HEAD 为多个实施提交的合并树 + 1 个未提交测试文件）；E1 变更包需固定最终候选哈希。
3. H1 治理文件在 D1 期间仍为未提交状态；`git status` 全仓非空属预期治理改动，`src app test` 干净。
4. 本文件只报告 D1 结果，不判验收；`implemented-unverified`。

## 8. 证据索引（SHA-256 / 行数）

| 文件 | SHA-256 | 行数 | 说明 |
| --- | --- | --- | --- |
| `00-opening-state.log` | `59218cdc86057f60afd26dfb6940e125e7996ba951e73bd0f0464d5d91cb736b` | 9 | 开工 HEAD/分支/状态 |
| `01-integration-test.log` | `795f4eb77d9467cf5a563eaa91967ed6a769d881e067953f552fc348c87af02d` | 22 | 集成测试 13/13 |
| `02-suite-runtime-core.log` | `d5c7a7c29c0c6a0403e0c11d8905e3755def06abff00e8226ceb0a4d4f38f026` | 383 | 323/316/3/4 |
| `03-suite-orchestration.log` | `c1aacd24a8d1635bb06b1b9685793ad865558154ed5b82991a81256bacd9c8ac` | 1376 | 799/798/1/0 |
| `04-suite-pm-shared.log` | `f809508a249933a279e6274095468a777d6a61452608c88373469a3865c4d28d` | 188 | 176/171/0/5 |
| `05-suite-desktop-app.log` | `21151c152d2d7ddc29cfcf69747de5d686792415c8c5ae63640dd578db026fb5` | 584 | 562/562/0/0 |
| `06-suite-desktop-ui.log` | `cdf8e8865ce37f3f70f0393f4eb6202dd316aeb7ec72f24dc1a949c8c7363b53` | 417 | 408/408/0/0 |
| `07-suite-test-role.log` | `edf122bd7498dc993cd52286113a85581a31118a38eafbaf5840db411f4a56c2` | 657 | 594/587/1/6 |
| `08-typecheck.log` | `e362512e15adafdd68986feb5c2f2dda40355f32f098eabdd887fcbe69c073f2` | 5 | typecheck 0 |
| `09-typecheck-renderer.log` | `282c727db2718e0fe75db64d0ef3d034beb002c2317d97afcf596b8bda070b01` | 5 | typecheck:renderer 0 |
| `10-build-renderer.log` | `302f6739d4ecf67b579f88c9c8f21c29929f038093459d7f58b56a85c079bf59` | 23 | build:renderer 0 |
| `11-t3-file-list.txt` | `fc22e5c4668a4388c1407643d6f69e68e4fcf6116247edfd78a774fd536996ad` | 417 | T3 文件清单 |
| `11-t3-file-list-diff-vs-b0v3.txt` | `5c182021b86e6413ff3c6177d30436a0d77bb3a959c66b45702b5f59f54346f0` | 12 | 与 B0 v3 差异（+7 文件） |
| `12-t3-coverage-check.log` | `b3b0acac85946146bc662501ccbda33dc345300705822847ef0424c73676cc04` | 1 | 覆盖校验 417/417 |
| `13-t3-prerun-status.log` | `06e3335882bd5703e706ceaaded426d81afa1636a0e5e13e28ece24932afc391` | 7 | 运行前检查 |
| `14-t3-mid1.log` | `5091c1daaa3829cb2e3f896ae4d50ea9f754c6a9e29b263c5f635a377071547a` | 5 | 运行中检查 1 |
| `15-t3-mid2.log` | `bfb38737bf703c378a8e140b2df1fa43e3040d66ba8dd8462dc6aa5dd39b0d0b` | 5 | 运行中检查 2 |
| `16-t3-full-regression.log` | `5740fed2af5dece9f26e2d57f42d31fa26b6bf3229d567c1c2f6d2db93e26f59` | 4865 | T3 原始输出 |
| `17-t3-postrun-status.log` | `a3d9e014ebbfffe0371aa4cd541b097bdcdddb4ffc61413a0b0eaa7282ad0d56` | 6 | 运行后检查 |
| `18-candidate-committed.txt` | `7e9422a8df3a4a5443e211604865cea32398ce52ff007e8b725a8cf89c4dbb9c` | 83 | 已提交候选 name-status（82 文件） |
| `18-candidate-worktree.txt` | `2130d43fbfd794426888ef976b30c52cb36aff1e9e5f1f29eb7b356dfd217311` | 2 | 工作区新增测试 |
| `18-candidate-diff.txt` | `86e7fbd5807ad626e9cc6a81aad8ee3809ac12ba23575d498071365e0db03b88` | 12 | diff 范围（src app test 空） |
| `18-candidate-files.txt` | `7ab270791b4aeaa1639afa149a0b3a79335af041199519918a6b6f31f540e2f1` | 83 | 候选文件清单 |
| `18-hash-object.txt` | `995c79c4bb2d3293c40d9aaa54fecde5685c6dba087d799618ba332d382503e5` | 83 | git hash-object |
| `18-sha256.txt` | `e294d1789e784b86da23a73b55a10fd376379009d7208a7cce8800f156f1f40a` | 83 | sha256sum |
| `18-candidate-hashes.txt` | `d57899e31fb9d70f35297ead6bae4cfba6104d1e907586e46443647fcaa98ce8` | 83 | 合并清单 |
| `verify-t3-coverage.mjs` | `05ce788139245368f36dd5dc2c2a2d422f51019bfa4f655a0eafe14ad726c527` | 45 | 覆盖校验脚本（读 11-t3-file-list.txt） |

索引文件 `19-evidence-index.sha256` 收录以上全部文件与本报告（索引自身不入索引；其哈希见交付报告）。
