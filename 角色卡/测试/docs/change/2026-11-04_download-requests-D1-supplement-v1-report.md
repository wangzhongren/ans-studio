# D1-supplement v1 报告：E2 补证（D2 加固重跑 + AC-22 + 全量回归）（2026-11-04）

**风险档位：T3｜判定依据：E2 报告 `docs/acceptance/download-requests-report-v1.md`（192 行 / `8f356057…`）§3.1–§3.5；AC-22 裁定记录 `docs/communication/2026-11-04_clarification_ac-22-queue-scope.md`（A：仅 customer-input 通道，不实施跨通道仲裁）；方案 P1.2 勘误（1032 行 / `8ef95e67…`，新增 §16）｜选定检查：D2 干净树加固重跑（>8 IP 截断 + AC-22 共存）+ 新增 AC-22 跨层测试 + 受影响六组 + T3 全量 + 双端 typecheck + `build:renderer` + 候选逐文件 hash-object/sha256｜复用证据：B0 v3（410/3697/3670/9/18）与 D1（417/3761/3734/9/18）仅作**对照基线**；本补充对当前候选重跑全部检查｜消费者重测结论：六组 + T3 全部重跑，通过（失败仅既有 Windows symlink EPERM）｜全量回归：已执行（见 §5）**

- 任务 ID：`2026-11-04-download-requests`（E2 补证）
- 节点：D1-supplement v1（E2 §3.1–§3.5 补证）
- 角色：测试（独立工作上下文）
- 日期：2026-11-04
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\download-requests`
- 状态：**`implemented-unverified`**（只报告，不判验收；E2 复判）
- 纪律：只写 `test/测试/`（D2 探针加固 + AC-22 测试）与 `角色卡/测试/docs/change/` 证据；不改产品源码、其他角色测试/文档、boundary/changelog、`docs/scheduling|acceptance|communication`；不 commit/push；不启动子代理。

## 1. 前置核对（开工 21:20:02）

| 项 | 期望 | 实测 | 结论 |
| --- | --- | --- | --- |
| 工作目录 | `...\.claude\worktrees\download-requests` | 同 | 一致 |
| HEAD | `cb3dd23fbebeba40627369da1adddd76322ee070` | `cb3dd23fbebeba40627369da1adddd76322ee070` | 一致 |
| 分支 | `feat/download-requests` | `feat/download-requests` | 一致 |
| `git status --porcelain -- src app test`（开工） | 仅本任务 test/测试 写入 | ` M test/测试/download-requests-electron-probe.mjs`、`?? test/测试/download-requests-ac22.test.ts` | 一致 |
| `git diff --cached --name-only` | 空 | 空 | 一致 |

## 2. D2 干净树加固重跑（AC-3/AC-25）

- 已应用已提交补丁 `角色卡/测试/docs/change/2026-11-04_download-requests-D2-evidence/11-hardening-probe.patch`（`git apply --check` / `git apply` exit 0；仅测试装配），并追加 AC-22 共存场景。
- 输出目录：`角色卡/测试/docs/change/2026-11-04_download-requests-D2-evidence/hardened-run-20261104-2111/`（**新目录，未覆盖**已提交证据；`user-data` 已清理）。
- 结果：**SCENARIOS PASS=82 / FAIL=0 / SHOTS=11**；exit 0；看门狗未触发；Electron 44.7.0 / Node 24.21.0 / Chrome 152.0.7977.130；窗口 1360×860；无录屏、未加载 DEBUG 覆盖层。
- **AC-3/AC-25 截断**（场景 8b）：测试解析器 `many.example.com` 返回 12 个公网 IP；断言卡片显示前 8 个 IP + 「共 12 个，仅显示前 8 个」，第 9–12 个不显示；截图 `09-card-resolved-ips-truncated.png` = `93a62608085891bed6e309b9d5f6fe394103a1cb0004b4752e5c6094a3750d7d`。>8 IP 截断展示现有真实运行截图证据。
- **AC-22 共存**（场景 8c）：下载卡先呈现；推入 shell 确认卡后 shell 卡可见、下载请求保持未结算（`coexistSettled=false`）；shell 卡拒绝后下载卡重新呈现并等待自身作答；无跨通道仲裁。截图 `10-shell-and-download-coexist.png` = `20446a1fe1e753d580a973553347750fc6a314771835ea51f8cd6d8999e46fbb`、`11-download-after-shell-closed.png` = `4e7877638237cdabc0ea61126996226f14be2e490c543b0fcf684d10f5ac5cb5`。观测：shell 卡打开时决策对话框不与其同屏（视觉优先级），但下载请求不因此被结算/取消。
- 关窗 fail-closed（场景 9）仍通过：`download-aborted`，无完成事件。
- 加固运行证据：`hardened-run-20261104-2111/report.json`（812 行 / `9d89ad7d5b335f27b22ea8f7eb7e4f9ebd410114804fce0a06c132e27a044d2a`）、`probe.log`（112 行 / `4e922869f5d63d7804f655b976b3f2e814c839ab08e0bad70d5b0a5b1d96facf`）、11 张截图（哈希见 D2 报告 §9 与运行 report.json）。
- D2 报告已追加「§9 加固重跑」并更新索引：报告 168 行 / **`8901c4338caca095f30265bb03e4556b82d33f525dfbd09b76e2b424e3e42be7`**；索引 `19-evidence-index.sha256` 64 条 / **`2d5db953c332c49c622bf5050d26ddcb5138aa126c9d5a67457da664697c5807`**（递归校验通过）。§0.2 的污染重跑与证据损失保留为历史。

## 3. AC-22 补证测试（裁定 A）

- 文件：`test/测试/download-requests-ac22.test.ts`（新增）。
- 装配：真实 `createCustomerInputChannel` + 真实 C1 卡片组装（`buildDownloadCardRequest` / `toDownloadApprovalOutcome`）+ 真实 B1 下载 Pipeline（Provider 传输为本地替身）。不启动 Electron、不触网。
- 场景与结果（**2 tests / 2 pass / 0 fail / 0 skip**；exit 0；281.71ms）：
  1. **决策卡在前 → 下载卡 waiting → 决策卡作答后下载卡呈现 → 各自结算**：决策卡呈现后下载请求进入同一通道排队（`onQueued`，不呈现）；决策卡作答后下载卡呈现；下载卡仍须自身作答（不被决策卡结算影响），最终 `download/ac22.bin` 成功、归属 customer。
  2. **反向（下载卡在前 → 决策卡 waiting）**：决策卡排队不呈现；下载卡作答成功后决策卡呈现并等待自身作答。
- 断言语义：同一 `customer-input` 通道「一项目一卡」顺序；无跨通道仲裁（裁定 A）。
- 局限：本测试不覆盖 shell 卡（shell 卡为独立通道，由 D2 场景 8c 截图覆盖共存/各自关闭）。

## 4. 六组受影响套件

| 套件 | 文件数 | exit | tests | pass | fail | cancelled | skipped | todo | duration_ms | 与 D1 差异 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `test/runtime-core/**/*.test.ts` | 41 | 1 | 323 | 316 | 3 | 0 | 4 | 0 | 31,685.10 | 无变化 |
| `test/编排/**/*.test.ts` | 64 | 1 | **803** | **802** | 1 | 0 | 0 | 0 | 15,720.69 | +4 tests（B1 补证 `cb3dd23`） |
| `test/项目管理/shared/**/*.test.ts` | 11 | **0** | 176 | 171 | 0 | 0 | 5 | 0 | 7,699.37 | 无变化 |
| `test/桌面应用/**/*.test.ts` | 57 | **0** | 562 | 562 | 0 | 0 | 0 | 0 | 73,923.82 | 无变化 |
| `test/桌面UI/**/*.test.ts` | 55 | **0** | 408 | 408 | 0 | 0 | 0 | 0 | 5,632.23 | 无变化 |
| `test/测试/**/*.test.ts` | **93** | 1 | **596** | **589** | 1 | 0 | 6 | 0 | 75,198.71 | +1 文件/+2 tests（AC-22） |

失败 5 项（与 D1/B0 v3 完全相同，全部 Windows symlink EPERM）：

| # | 文件:行 | 用例 |
| --- | --- | --- |
| 1 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 2 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 3 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 4 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |
| 5 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |

## 5. T3 全量回归

- 文件集：**418**（419 个 `.test.ts` 排除 `test/pi-adapter/write-sequencing.test.ts`；与 D1 清单 diff = **+1**：`test/测试/download-requests-ac22.test.ts`，无其它增删）；覆盖校验 `expected=418 / expanded=418 / piExplicit=39 / missing=0 / extra=0`。
- 干净性检查（运行前/中×2/后）：仅本任务 `test/测试` 两个文件，无其它并发写入：

| 时点 | 结果 |
| --- | --- |
| 21:24:34（运行前） | `M test/测试/download-requests-electron-probe.mjs`、`?? test/测试/download-requests-ac22.test.ts`；HEAD `cb3dd23`；staged 空 |
| 21:26:28（运行中 1） | 同上 |
| 21:28:16（运行中 2） | 同上 |
| 21:30:21（运行后） | 同上 |

- 结果：**exit 1**（完全由 9 项既有 EPERM 解释）；**tests 3767 / pass 3740 / fail 9 / cancelled 0 / skipped 18 / todo 0**；`duration_ms 276,061.8586`（约 276.1s；约 21:24:4x–21:29:5x）。
- 失败 9/9 全部 Windows symlink EPERM，与 B0 v3/D1 逐项一致（claude-adapter/session:639；codex-adapter/session:351；pi-adapter/injected-runtime:185、:193；runtime-core/file-write-safety:97；runtime-core/session-store:46、:58；测试/g4-skill-verify/b-render-double-check:182；编排/shell-authorized-routine:184）。
- 跳过 18：全部源码内平台条件（win32/!posix/root；含 1 项 `t.skip("chmod 语义在 Windows 不适用")`），与 B0 v3/D1 相同。

### 5.1 对照

| 基线 | 文件 | tests | pass | fail | skip |
| --- | --- | --- | --- | --- | --- |
| B0 v3（f0adb49） | 410 | 3697 | 3670 | 9 | 18 |
| D1（1d7560f） | 417 | 3761 | 3734 | 9 | 18 |
| **D1-supplement v1（cb3dd23 + 本任务 test/测试）** | **418** | **3767** | **3740** | **9** | **18** |
| 差异 vs D1 | +1 | +6 | +6 | 0 | 0 |

+6 tests 归因：B1 补证 `cb3dd23` 在 `test/编排` +4；AC-22 测试 +2。

### 5.2 结论

- **新增确定性失败 = 0**（9 项均为既有 Windows symlink EPERM，名单与 B0 v3/D1 逐项一致）。
- **新增 skip = 0**（18 项均为既有源码内平台条件）。
- **非 EPERM 新增失败 = 0**。

## 6. 静态门

| 命令 | exit | 用时 | 备注 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 2s | `tsc --noEmit`（含 AC-22 测试与探针硬化后的工作区） |
| `npm run typecheck:renderer` | **0** | 0s | `tsc -p app/renderer/tsconfig.json` |
| `npm run build:renderer` | **0** | 1s | built in 363ms；仅 chunk 提示；`app/renderer/dist/` 为忽略产物 |

## 7. 候选

- 口径：`f394cfb..HEAD（cb3dd23）` 已提交 `src app test` 改动 **84 文件**（45 A / 39 M，无删除/重命名）+ 本任务新增 AC-22 测试 **1 文件** = **85 文件**；探针为工作区修改（M，内容即加固 + AC-22 场景）。
- 逐文件 `git hash-object` + `sha256sum`：`18-hash-object.txt` / `18-sha256.txt` / 合并 `18-candidate-hashes.txt`（均 85 行）；name-status `18-candidate-committed.txt`；工作区 `18-candidate-worktree.txt`；`git diff --name-only -- src app test` = 仅探针（`18-candidate-diff.txt`）。
- 工作区：`git diff --cached --name-only` 空；未 commit/push（HEAD 仍 `cb3dd23`）。
- E1 需在最终冻结时把探针加固与 AC-22 测试纳入候选（当前为工作区状态）。

## 8. 限制与风险

1. D2 加固重跑为**补充证据**：受认证的历史 D2 运行（§4/§5 的 63 PASS / 8 截图）与本补充（82 PASS / 11 截图）分列；原截图/`probe.log` 字节仍不可恢复（§0.2 历史）。
2. AC-22 裁定 A 只覆盖 customer-input 通道；shell 卡为独立通道（D2 场景 8c 已给共存/各自关闭截图），不实现跨通道仲裁。
3. 探针以本地 HTTP 服务 + Provider `lookupOverride` 测试缝替代公网；judge 结果为脚本；工具调用由探针直接调用 `requestDownload`（不经真实模型选择，由 A1 单测/D1 集成覆盖）。
4. 本报告不判验收（`implemented-unverified`）；AC-12/13/14 由 B1 补证（`cb3dd23`）覆盖，AC-22 由本补充覆盖，最终判定归 E2。

## 9. 证据索引（SHA-256 / 行数）

| 文件 | SHA-256 | 行数 | 说明 |
| --- | --- | --- | --- |
| `00-opening-state.log` | `362379ef72c878d3da6ec0038df3163a3e8e21d8d4d1c65c9ac4a1a614246b0f` | 11 | 开工状态 |
| `01-ac22-test.log` | `fba3e95feb676bf77151fa14ce4f037db1a233e8e9485938c910ee72bf0c844a` | 11 | AC-22 测试 2/2 |
| `02-suite-runtime-core.log` | `3e9eabc8910a9d727ef7c6f6d80c0e9b6200b5e6522ac2faf4ffc37fcc2dffad` | 383 | 323/316/3/4 |
| `03-suite-orchestration.log` | `4bcab0fc654d171713eccb7945a006066324ea992ac5960fc56c0e5531ff6460` | 1380 | 803/802/1/0 |
| `04-suite-pm-shared.log` | `2c6072196733e21a77e7f602b1bd63e90d62dccc05c74ce6f54ce5a70ddca453` | 188 | 176/171/0/5 |
| `05-suite-desktop-app.log` | `9e6085c3e5a5afc2d704a8f2660543bbe3098c771f48b7f048c9b8d146b21f90` | 584 | 562/562/0/0 |
| `06-suite-desktop-ui.log` | `378fc0ddeb312a4880bde5518a3cf1217268cfd0fd8a6e57e5cde3187ea171b5` | 417 | 408/408/0/0 |
| `07-suite-test-role.log` | `bb1f8bafdcd4fe88e56f87a88ec748a486ba891f0eb73f8281573ea8395eaf44` | 659 | 596/589/1/6 |
| `08-typecheck.log` | `928e2ceb66b85b520edb24ac0a2c79e01498045a3516dbfced40fa109a742f3b` | 5 | typecheck 0 |
| `09-typecheck-renderer.log` | `d619e822febd8b647cb4f0201514abde4bc7c81741f8f6964dc3ed7861f258a1` | 5 | typecheck:renderer 0 |
| `10-build-renderer.log` | `b9b0eeeddfb882b325c150f0f95f9f2ec986dfe45462a8e4be87c03f3645da60` | 23 | build:renderer 0 |
| `11-t3-file-list.txt` | `ec2185126612d6be8cd972d23b4bb1ae013c3bb42e5d63353bae4d11537ec4bc` | 418 | T3 文件清单 |
| `11-t3-file-list-diff-vs-d1.txt` | `85a1150f2e307915bf1f053cbbde01b47e79b1ad967bf259aca7104addf584d8` | 2 | +AC-22 |
| `12-t3-coverage-check.log` | `f448223d52e409dc2d0af610dcd507b1412b5a30c4b7a3301883824f9a80f4bc` | 1 | 覆盖校验 418/418 |
| `13-t3-prerun-status.log` | `fa61cc6f108e48270cd92f98f1957bfc31fd59d251f58512ec22fedc8c56137a` | 8 | 运行前检查 |
| `14-t3-mid1.log` | `b7b7ee3aefea7bf57d0c09842e7ea1cb150ec8478c76498186f9b81c38b1eb82` | 4 | 运行中检查 1 |
| `15-t3-mid2.log` | `5f9e6eb33f031a41f491c602e034f8fd2cacf6bc5b0c22e8109fae74862967bd` | 4 | 运行中检查 2 |
| `16-t3-full-regression.log` | `273bba999bbfcdb37a147cc97444dc7eb5dab23027b45e7c7a64cbea6cb99c09` | 4871 | T3 原始输出 |
| `17-t3-postrun-status.log` | `98ec7bc6f64cd69cf7e3a104782993da6616cbbe66deda63563f674f84362d94` | 7 | 运行后检查 |
| `18-candidate-committed.txt` | `62bc031107d154bbd7d42e547f016e2b04086aa06eabbe49d305761d4e99aed8` | 85 | 已提交候选（84 文件） |
| `18-candidate-worktree.txt` | `c8983b01e03e6e0b150588fc4e4f9ae70bb837226494dbabe1826b98b60569d6` | 3 | 工作区两个 test/测试 写入 |
| `18-candidate-diff.txt` | `c0612992d9c2d83d0a45c250da82e8577b6417a31ada7a33cdefb9bc1061e650` | 2 | 探针 diff |
| `18-candidate-files.txt` | `4f8f61bb6d7d7a6520f5ba134097b26804657a19be343062c36a0babd7caaca0` | 85 | 候选清单 |
| `18-hash-object.txt` | `850c0536ddf001f26b22bc0b09433b4e66e47b787b87ff59488f183f0973faaa` | 85 | git hash-object |
| `18-sha256.txt` | `483d815d0f49b6196821f6d8f1682036919aec034c9cbabf8378ff96e5cd4acb` | 85 | sha256sum |
| `18-candidate-hashes.txt` | `ca0ea648fd82018b0450e08f0909e857ed072010bca1e1be1d962dac3d9c958e` | 85 | 合并清单 |
| `verify-t3-coverage.mjs` | `05ce788139245368f36dd5dc2c2a2d422f51019bfa4f655a0eafe14ad726c527` | 45 | 覆盖校验脚本 |

索引文件 `19-evidence-index.sha256` 收录以上全部文件与本报告（索引自身不入索引；其哈希见交付报告）。D2 加固重跑证据位于 D2 证据目录的 `hardened-run-20261104-2111/`（见 §2 与 D2 报告 §9）。
