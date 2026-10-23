# 真实启动/演示证据（角色粒度与 MapReduce，Reduce 终验）

- 日期：2026-10-22
- 候选：HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845` 工作树候选（见 `../manifest.md` §候选与 `candidate/hashes.tsv`）
- Electron：44.7.0（`node_modules/electron/dist/electron.exe`）
- 模型边界：**离线脚本桩**。三次 Electron 运行均注入脚本化 adapter（`createRuntimeAdapterFactoryFn` / `createPiAdapterFactoryFn` / `createDemoAdapterFn`），不触网、不读真实凭据；真实件为 Electron 主进程、`app/preload.cjs`、真实渲染进程 `app/renderer/dist/index.html`、真实窗口、`app/desktop/interface.ts`、`app/desktop/customer-input.ts`、真实 flow 解析/门禁/账本/客户通道。
- 启动命令、时间、输出：

| # | 运行 | 命令 | 时间（本地） | exit | 关键输出 | 截图 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 真实 Electron 总自检 | `ANS_E2E_OUTDIR=<evidence>/e2e-main node_modules/electron/dist/electron.exe test/桌面应用/e2e/main.mjs` | 2026-10-22 21:41:28–21:42:45 | 0 | `E2E_PASS=true`、`E2E_FAILURES=`、`E2E_DONE=1`、`ELECTRON=44.7.0` | 17 PNG |
| 2 | v2 治理链演示 | `ANS_DEMO_OUTDIR=<ASCII temp>/ans-v2-demo-BC9xQX node_modules/electron/dist/electron.exe test/测试/role-granularity-v2-demo.mjs` | 2026-10-22 21:46:05–21:46:12 | 0 | `DEMO_PASS=true`、`DEMO_DONE=1` | 8 PNG |
| 3 | legacy v1 治理链演示 | `ANS_DEMO_OUTDIR=<ASCII temp>/ans-legacy-demo-Zpo8kP node_modules/electron/dist/electron.exe test/测试/phase-e-governance-demo.mjs` | 2026-10-22 21:46:16–21:46:22 | 0 | `DEMO_PASS=true`、`DEMO_DONE=1`、`DEMO_IMPL_DISPATCH=true` | 7 PNG |

## v2 演示覆盖（运行 2，`demo-v2/report.txt`）

- `DEMO_V2_PLAN=true`：团队计划 v2（`teamPlanSchema: 2`、模块清单、14 列角色表、Map/Reduce）。
- `DEMO_V2_FLOW_PARALLEL_GROUP=true`：初始 flow YAML 携带 `parallelGroup: map-a`。
- `DEMO_APPOINTMENT_CARD_VISIBLE=true`：真实 appointment 卡（客户端 `cardKind=appointment`；V1–V11 卡前守卫通过）。
- `DEMO_CREW_WRITE_CARD_VISIBLE=true` / `DEMO_CREW_TWO_ROLES_WRITTEN=true`：Crew 写 executor + reviewer 两个 Map 角色卡（appointment-write 卡客户确认）。
- `DEMO_READINESS_RECORD=true` / `DEMO_CHANGE_PACKAGE=true`：Convener readiness（module/契约/测试面/并行/粒度）与变更包落盘。
- `DEMO_MAP_PARALLEL_DISPATCH=true` / `DEMO_REDUCE_DISPATCH=true`：`delivery-storefront`、`delivery-checkout-api` 先派发，`test-map-shards`、`integration-e2e` 后派发（账本 `DEMO_DISPATCHES=role-cards,delivery-storefront,delivery-checkout-api,role-readiness,test-map-shards,integration-e2e`）。
- `DEMO_MANIFEST=true`：测试角色写 `docs/verification/flow-demo/manifest.md`。
- `DEMO_ACCEPTANCE_CARD_VISIBLE=true`：Verifier 报告 + acceptance 卡真实呈现，客户点击通过；账本 `DEMO_DECISIONS=proposal-accept:accepted:,appointment:appointed:executor+reviewer+tester,appointment-write:accepted:,acceptance:accepted:`。
- 截图：`demo-00-launch`、`demo-01-project-imported`、`demo-02-appointment-card`、`demo-03-crew-write-card`、`demo-04-convener-readiness-map-dispatch`、`demo-05-reduce-manifest`、`demo-06-acceptance-card`、`demo-07-accepted`。

## legacy v1 演示（运行 3，`demo-legacy-v1/report.txt`）

- v1 团队计划 + 单角色链路仍通过：`DEMO_APPOINTMENT_CARD_VISIBLE=true`、`DEMO_CREW_WRITE_CARD_VISIBLE=true`、`DEMO_READINESS_RECORD=true`、`DEMO_ACCEPTANCE_CARD_VISIBLE=true`、`DEMO_IMPL_DISPATCH=true`、`DEMO_PASS=true`。
- 截图：7 PNG（launch/project-imported/appointment/crew-write/readiness/acceptance/accepted）。

## 运行路径说明（如实记录，不判产品缺陷）

- 首次尝试把 `ANS_DEMO_OUTDIR` 放在本仓库 `角色卡/测试/docs/change/...` 证据目录（含中文路径）时，demo 的 Crew `write_file` 被治理门禁拒绝：`目标绝对路径不在任何受治理根（skill/project）之内`。同一失败可用既有 legacy `phase-e-governance-demo.mjs` 复现（`EVENT nominator denied ...`），**不是 v2 演示或本轮候选引入**；随后改用 ASCII 临时输出根（Phase-E 既有运行口径）即通过。该路径差异只影响演示输出目录选择，不影响产品代码/测试，记录为环境观察。
- 首次 v2 演示注入的预置 `artifact.observed` 账本行缺 `actorRoleId`/`power`，账本读取按坏行 fail-closed；补齐字段（与真实扫描条目形状一致）后通过。属演示夹具修正，未改产品。
- **未使用**真实模型/凭据；离线桩边界如上。真实启动、真实窗口、真实 preload/IPC/Interface/门禁/账本均已覆盖，不以单元测试/mock 代替启动。
