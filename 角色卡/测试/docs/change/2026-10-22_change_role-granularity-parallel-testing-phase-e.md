# 变更报告：角色粒度与 MapReduce 并行测试（Reduce 终验）

- **任务 ID**：`2026-10-22-role-granularity-parallel-testing`（产品 flowId `role-granularity-parallel-testing`）
- **记录角色**：测试（独立固定角色上下文）
- **日期**：2026-10-22
- **阶段**：N7「Reduce 终验」（Map A/B/C 完成后）
- **状态**：**verified-by-tests-only**（测试证据已产出；不宣布验收通过，不代替独立验收/客户确认）
- **授权依据**：闸门 2 与客户实施授权（`docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`）；团队计划 §4.3「测试」、§5.4 N7、§5.5、§6、§11.10
- **候选**：HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845` / tree `a736eaac0acdf3f6d979a42ec68071ae1e79ac12` 工作树
  - `tracked_diff_sha256` = `267194bf55246e586cda3f6bfee17a5de3e1e9b4b093321d96dcb54a788f5573`
  - `untracked_candidate_sha256` = `621ec300f17dc87656e50bc7198caf369b4aa398fdcf0eb8417934b089c61eef`
  - 29 个候选文件（`src/**`、`app/**`、`test/**`）：`...-phase-e-evidence/candidate/hashes.tsv`
- **结论摘要**：v2 完整链路与 legacy v1 链路均通过；`governance-e2e-auto` 99/99；6 个 Map 分片并行执行并合并 manifest；T3 全量并行/串行均 **3528 tests / 3501 pass / 9 fail / 18 skip**，两次失败集合一致且全部为 N3 基线既有 Windows symlink EPERM，**零新增红**；typecheck / typecheck:renderer / exact build:renderer 均 exit 0；真实 Electron 总自检 `E2E_PASS=true`（17 截图），v2 治理链真实演示 `DEMO_PASS=true`（8 截图），legacy v1 治理链真实演示 `DEMO_PASS=true`（7 截图）。未发现必须扩展 Provider 工具参数的证据。未提交/暂存/推送。

## 一、环境与基线

| 项 | 值 |
| --- | --- |
| OS / Shell | Windows 11 Pro 10.0.26300；Git Bash 5.3.15（MINGW64_NT-10.0-26300） |
| Git | 2.55.0.windows.5 |
| Node / npm | v24.22.1 / 11.19.1（PATH 加入 `C:\Users\51054\AppData\Local\Programs\nodejs`） |
| Electron | 44.7.0 |
| 仓库 | `C:\Users\51054\Desktop\work\ans-studio`；分支 `feat/background-tasks-governance-and-reasoning` |
| N3 基线 | `3448 / 3421 pass / 9 fail / 18 skip / 0 todo`（HEAD `64ed44a`，9 项 Windows symlink EPERM） |
| 候选起始工作树 | Map A/B/C 改动 + 未跟踪 `src/common/编排/team-plan.ts`、`test/编排/team-plan.test.ts` 等；`git diff --cached` 空 |

## 二、本轮测试改动（写集 `test/测试/**`）

| 文件 | 改动 |
| --- | --- |
| `test/测试/governance-e2e-auto/fixture.ts` | 新增 v2 `teamPlanV2Doc`（frontmatter `teamPlanSchema: 2`/`modules`、模块清单、14 列角色表、MapReduce/粒度理由、五维章节，支持负例覆盖）；`flowDoc` 支持可选 `parallelGroup`/`dependsOn`；`roleBoundaryDoc`/`roleWorkDocs`/`writeRoleArtifacts` 支持额外写集与角色 id。**保留 v1 `teamPlanDoc`，未批量迁移旧夹具。** |
| `p-team-plan-guard.test.ts` | 卡前守卫扩至 19 例：原 7 例 + 11 个 v2 负例（缺 module/模块清单、重复/孤儿/未声明模块、写集重叠、依赖环、同组依赖、整层名、多模块无理由、Reduce 未覆盖 Map）+ legacy v1 正例；断言不发卡/不判断/不写账本/不派 Crew。 |
| `q-role-granularity.test.ts`（新增） | v2 正/负矩阵（模块覆盖、写集、DAG/并行组、粒度、legacy、V11 flow-plan 一致性）+ 真实卡前守卫 v2 正例/V11 负例。 |
| `r-mapreduce-parallel.test.ts`（新增） | Map 组并行派发、Reduce 等全部 Map done、dependsOn 硬前置、同组依赖双路径拒绝、legacy 不变、Provider 不扩参；测试分片独立根/日志/输出、失败隔离、只重跑失败分片、fixture pin 哈希与 manifest 合并。 |
| `i-full-chain.test.ts` | 保留 legacy v1 完整链路；新增 v2 完整链路：团队计划 v2 → appointment → Crew 写两个 Map 角色 → readiness → Map 并行派发 → 测试分片 → Reduce 集成 → manifest → 变更包 → Verifier → acceptance。 |
| `b-proposal-accept-timing.test.ts` | 新增 2c：接受提案后同一轮写 v2 计划/flow 并直接发任命卡；Crew/Convener 文案含 v2/模块/并行字段。 |
| `c-appointment-timing.test.ts` | 新增 3d：v2 计划写集未被 Crew boundary 覆盖（V12）⇒ 退回 Crew、不派 readiness。 |
| `d-dispatch-listing.test.ts` | 新增 4b：v2 Map 组并行派发、listing/role_status 可见、Reduce 前置未 done 拒绝/done 后受理。 |
| `test/测试/role-granularity-v2-demo.mjs`（新增） | v2 治理链真实 Electron 演示脚本（真实 preload/renderer/Interface/门禁/账本；离线模型桩）。 |

未修改 `test/桌面应用/` 任何文件，未新建该目录文件；未改 `test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面UI/`（其改动由 Map A/B/C 属主完成）；未改产品源码。

## 三、v2 / legacy e2e 结果

- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"`：**99/99 pass, exit 0**（11,367 ms；`canonical-e2e.log`）。
- v2 完整链路：通过（团队计划 v2 卡前守卫/V11、双 Map 角色 Crew 写卡、readiness v2 文案、Map 并行派发、Reduce 前置 done 后派发、manifest 观察、变更包、Verifier/acceptance）。
- legacy v1 完整链路与 legacy 卡前守卫正例：通过；legacy v1 真实 Electron 演示 `DEMO_PASS=true`。
- 负例覆盖：缺 module/模块清单、模块重复/孤儿/未声明、写集重叠、依赖环、同组依赖、整层名、多模块无理由、Reduce 未覆盖 Map、V12 未覆盖、flow 前置未 done、同组 flow 依赖、Provider 不扩参。

## 四、MapReduce 分片与 Reduce 合并

详见 `...-phase-e-evidence/manifest.md`。摘要：

| 分片 | exit | tests/pass/fail/skip | 结果 |
| --- | --- | --- | --- |
| orchestration | 1 | 769/768/1/0 | 唯一红＝N3 基线既有 EPERM |
| gate-engine | 0 | 313/312/0/1 | 全绿 |
| runtime-core | 1 | 292/285/3/4 | 3 红＝N3 基线既有 EPERM |
| desktop-files | 1（并行） | 518/517/1/0 | 1 红为并行桌面时序偶发；隔离 16/16、整目录串行 518/518 |
| desktop-ui | 0 | 163/163/0/0 | 全绿 |
| governance-e2e | 0 | 99/99/0/0 | 全绿 |

- 每分片独立 `TEMP`/`TMP`、独立日志、独立退出码；共享只读夹具 20 个文件 pin 哈希前后一致（`diff` 为空）；未共享可变根/端口/输出，未并发安装/构建。
- 失败隔离：桌面偶发不阻塞其他分片；无模块 owner 需修复；未改代码/断言。
- Reduce：manifest 合并 6 个分片，再跑 canonical e2e、真实启动/演示与 T3 全量。

## 五、T3 全量回归（最终候选）

| 命令 | exit | tests/pass/fail/skip | 耗时 | 日志 |
| --- | --- | --- | --- | --- |
| `node --test "test/**/*.test.ts"`（并行） | 1 | **3528 / 3501 / 9 / 18** | 22.6 s | `final-full-parallel.log` |
| `node --test --test-concurrency=1 "test/**/*.test.ts"`（串行） | 1 | **3528 / 3501 / 9 / 18** | 300.9 s | `final-full-serial.log` |
| `npm run typecheck` | 0 | — | ~1 s | `typecheck.log` |
| `npm run typecheck:renderer` | 0 | — | ~1 s | `typecheck-renderer.log` |
| `npm run build:renderer`（exact） | 0 | — | 299 ms | `build-renderer-exact.log` |

- 与 N3 基线 `3448/3421/9/18` 对照：**+80 tests / +80 pass**，失败仍为同一 9 项 Windows symlink EPERM，**零新增确定性失败**；并行/串行失败标题集合一致。
- 9 项 EPERM 逐条指名见 `manifest.md` §三（与 N3 基线 §10.4 同一清单）。
- skipped 18 项与基线分布一致；无挂起/超时/不可用。
- `build:renderer` 写 `app/renderer/dist/`（4 文件；`git check-ignore -v` → `.gitignore:9:app/renderer/dist/`），被忽略、非候选；未改源码/配置。
- `real-entry.test.ts` 本轮**未修改**：两次全量均通过；定向复跑 `node --test test/测试/real-entry.test.ts` **16/16 pass, exit 0**（`real-entry.log`，F3 通过）。其 F3 快照语义仍为「演示不产生新的 `docs/scheduling` 记录、也不改写既有记录」。本轮演示使用独立临时项目根，未影响仓库管理记录。

## 六、真实启动/演示

详见 `...-phase-e-evidence/demo-evidence.md`。

- `test/桌面应用/e2e/main.mjs` 真实 Electron 总自检：exit 0，`E2E_PASS=true`、`E2E_FAILURES=`、`E2E_DONE=1`，17 张截图。
- v2 治理链真实演示：exit 0，`DEMO_PASS=true`（8 截图）；`DEMO_DISPATCHES=role-cards,delivery-storefront,delivery-checkout-api,role-readiness,test-map-shards,integration-e2e`；`DEMO_DECISIONS` 含 appointment/appointment-write/acceptance。
- legacy v1 治理链真实演示：exit 0，`DEMO_PASS=true`（7 截图），`DEMO_IMPL_DISPATCH=true`。
- 模型为离线脚本桩（不触网、不读凭据）；真实 Electron 窗口/preload/renderer/Interface/门禁/账本/客户通道为真实件。未以单元测试/mock 代替启动。

## 七、Provider 工具限制

- v2 初始 flow YAML 可携带 `parallelGroup`/`dependsOn`，`parseFlowStateYaml` 与 V11 均通过；派发门禁按 flow 步骤 `dependsOn` 硬前置。
- **未发现**必须给 `flow_step_supersede` 增加参数或让 `flow_get` 文本投影渲染两字段的证据；`FLOW_STEP_KINDS` 仍 `dispatch/customer-decision/artifact/acceptance`。未改 `src/provider/runtime/**`。
- 若后续工具级更新并行字段成为必需，应按团队计划 §11.6 停止并回报，不静默扩参。
- 非目标不变抽检（`invariants-check.txt`）：`ENGINEERING_QUALITY_BASELINE`/`BUILT_IN_GOVERNANCE_ROLES` 无实质增删行（仅注释提及）；`src/model/runtime.ts` 无 `GovernanceStepKind`/`cardKind`/`GovernancePower`/`GovernanceDecisionKind` 枚举值增删；`FLOW_STEP_KINDS` 仍四值。

## 八、候选清单与哈希

目录：`...-phase-e-evidence/candidate/`

- `candidate-paths.txt`：29 个候选文件（`src/**`、`app/**`、`test/**`；不含角色文档、`docs/` 管理记录、`app/renderer/dist`）。
- `hashes.tsv`：每个文件 `git hash-object`（Git blob）+ `sha256sum`（SHA-256）。
- `status-short.txt`、`diff-name-only.txt`、`diff-stat.txt`、`full.diff`（含未跟踪文件）、`diff-cached-name-only.txt`（空）、`head.txt`、`tree.txt`。
- 关键文件哈希（示例，完整见 hashes.tsv）：`src/model/runtime.ts` `4b96ae9d…`、`src/common/门禁引擎/governance-roles.ts` `f074f0e1…`、`src/common/编排/team-plan.ts` `328737a3…`、`app/desktop/interface.ts` `203e36f4…`、`app/desktop/governance-advance.ts` `965e4656…`。
- 管理记录（顶层 `docs/**`）与角色文档未混入产品候选。

## 九、观察、残余与未解决问题

1. **桌面并行时序偶发**：6 分片并行时 `test/桌面应用/handback-delivery.test.ts` E-1 去重一次失败；隔离 16/16、整目录串行 518/518 通过，分类为并行负载偶发，非产品失败；未改断言。
2. **演示输出根路径观察**：把 `ANS_DEMO_OUTDIR` 放在仓库内中文证据路径时，Crew `write_file` 被「不在任何受治理根」拒绝；既有 legacy phase-e demo 同样复现，非本轮候选引入。改用 ASCII 临时输出根后两次演示均通过。未据此判产品缺陷。
3. **v2 演示预置账本行**：首次预置 `artifact.observed` 缺 `actorRoleId`/`power`，账本按坏行 fail-closed；补齐字段后通过。属演示夹具，未改产品。
4. **未验证**：真实模型/真实凭据下的治理链；Windows 以外的平台；`app/renderer/dist` 的打包产物。真实 Electron 启动/窗口/截图已覆盖。
5. 未 commit/push/stash/merge/release；未写 `docs/scheduling/`、`docs/acceptance/`；未改角色卡/边界；未新建 `test/桌面应用/` 文件。
6. 本报告状态为 `verified-by-tests-only`，不代表验收通过；最终判定由内置独立验收按 `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` 执行。

## 十、证据索引

- 本报告：`角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-phase-e.md`
- 证据目录：`角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-phase-e-evidence/`
  - `manifest.md`、`demo-evidence.md`、`candidate/`、`map/`
  - `canonical-e2e.log`、`final-full-parallel.log`、`final-full-serial.log`、`typecheck*.log`、`build-renderer-exact.log`
  - `e2e-main/`、`demo-v2/`、`demo-legacy-v1/`
