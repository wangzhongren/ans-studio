# 变更记录：trunk-amendment T1（跨层集成）、T3（全量回归）与 T2（真实运行）— 2026-11-05

- 任务 ID：`2026-11-04-trunk-amendment-model`
- 节点：Batch 5 **T1**（跨层集成 + T3 全量）+ **T2**（真实 Electron 运行证据）；含 **E2 返工补充与闭环**（AC-5 集成负例 / AC-13、AC-17 的 T2 场景 / D4 修复复测）
- 角色：测试（独立工作上下文）
- 日期：2026-11-05（初跑 → 缺陷 D1–D3 修复复跑 → E2 返工补充 → D4 修复闭环）
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（分支 `feat/trunk-amendment-model`，HEAD `89b1fb2`）
- 依据：方案 P1.6 §7.2/§7.3、V1 v1.1（AC-1–AC-36）、B0 基线、团队计划增量 §6/§10、Batch 3.5 批准记录、E2 报告 `docs/acceptance/trunk-amendment-model-report-v1.md`（151 行 / `c6a05025…`）之返工要求。
- 纪律：只写 `test/测试/`（2 个集成测试 + 1 个 Electron 探针）与 `角色卡/测试/docs/change/`；未改 `src/**`、`app/**`、其它角色测试、角色卡/边界/communication/acceptance/scheduling；未 commit/push/暂存。
- **最终结论：T1 通过（20/20）；T3 全量新增确定性失败 = 0（仅 9 项既有 Windows symlink EPERM）；T2 全部 34/34 checks 通过、11 张截图；E2 返工项 AC-5 / AC-13 / AC-17 与 D4 均闭环。**

## 1. 前置核对（最终状态）

| 项 | 实测 | 结论 |
| --- | --- | --- |
| HEAD / 分支 | `89b1fb2751d74c607b3a17d1b522b88061943a14` / `feat/trunk-amendment-model` | 与实施基线一致（`00-head.txt`） |
| `git status --porcelain -uall` | 280 行（`01-status-all.log`，快照 SHA-256 `1a21aa22…`） | 候选含其它角色在途改动（见 §6） |
| `git diff --cached --name-only` | 空（`05-staged.log`，SHA-256 `e3b0c442…`） | 未暂存 |
| Node / npm | v24.22.1 / 11.19.1（`04-env.log`） | — |
| Electron | 包 `44.7.0`；`electron.exe` 存在（246,302,208 bytes）（`26-electron-facts.log`） | T2 可执行 |

## 2. T1 交付物（最终复跑）

| 文件 | SHA-256 | 行数 | 测试数 |
| --- | --- | --- | --- |
| `test/测试/version-change-integration.test.ts` | `dd0ec8a05f63b2544657c3a744bb3772b0bd8522daca41c4e823e8e93f01b8db` | 1407 | 12（12/12 pass） |
| `test/测试/trunk-stable-write-integration.test.ts` | `ffa4b8337ae1ae7ab2b6c9bbc46d50087f1c2cf0c5bd4d0f3094fcbc95ab5acf` | 969 | 8（8/8 pass） |
| `test/测试/trunk-amendment-electron-probe.mjs`（T2 探针） | `51bd8deb6a4045e0d8d8c900cf0139438df64c2b60dc31f39359cc9d0feea534` | 668 | 6 个场景运行（见 §7） |

合计 **20 tests / 20 pass / 0 fail / 0 skip**（`18a-new-version-change-integration.log`、`18b-new-trunk-stable-integration.log`）。

跨层真实实现 + fake presenter/客户作答：真实 Model/Service/Provider/S2 trunk/S3 run-manifest 冻结校验/S4 四个 Pipeline/门禁引擎/D1 桌面栈/桌面客户通道/真实 `tasks.jsonl` 账本（`readTaskState` 逐 kind 校验）；临时项目根在系统临时目录内并清理；T1 不启动 Electron、不触网、不改产品代码。

### 2.1 覆盖映射（T1 必cover → 测试）

| 要求 | 覆盖测试 |
| --- | --- |
| VCA product version-upgrade / rapporteur detail（create/submit/approve/reject/apply） | A-1、A-2、A-3、A-4 |
| bootstrap `baseTrunk:null` | A-5（两条路径）、A-1（bootstrap 升级） |
| detail 逐项/acknowledgments / 只冻结 applied | A-2（真实通道：缺必选 acknowledgment 拒收，再受理并回传） |
| 批准前哈希重验 | A-4b（提交后漂移 ⇒ `vca-hash-drift`，不冻结/不 re-pin） |
| **AC-5 前置校验（批准前/apply 前）** | **A-9**（无效 roster / D3 targetRoleIds 越界 / 契约版本链不匹配 ⇒ `vca-target-invalid`，VCA 保持 submitted、无冻结、run manifest 无 repins、trunk 不变）；**A-10**（已批准后 apply 前重验失败 ⇒ `vca-apply-failed`、不 re-pin；修复后可重试 applied） |
| 并发/幂等 | A-4（同 flow 单 submitted、重复提交幂等、`vca-pending`、base mismatch） |
| 冻结 R9 权威 / doc-freezes 派生缓存 | A-6（baseline 权威、缓存重建/损坏 fail-closed、`migrated-draft`） |
| 冻结迁移 missing/corrupt | A-6；A-5（pin 严格模式） |
| draft 原位改 vs frozen 拒绝 | A-1、A-2、A-3、A-6（`versionedDocOverwriteDecision` 全通道判定） |
| stable workflow 确认卡 / appointment-write / permit / completeWrite / mini re-pin / 无 drift | B-1、B-2、B-3 |
| 重构（convener、机械写集、越界转 VCA、managedBy、无客户决定、不产生 trunk 版本） | A-7 |
| trunk derive/verify/apply-journal 两方向/phase 滞后/re-pin/history/refreeze/abandon/恢复 tN+1/bootstrap | B-4、B-4b、B-5、B-6；A-1/A-5（bootstrap/apply） |
| 客户主权（VCA/stable 卡不被 judge/委托/@决策；acknowledgments 必选；trunk 确认需显式 acknowledged） | A-8（真实通道 + D1 映射）、B-5（trunk confirm） |
| 旧入口/文案/低层 run-change 保留；F15 roleCards；F16 无 D1 直接写盘；F17 无 refactor:request | A-8（i18n/旧卡/F15/F17）、B-1（F16 行为与 API）、B-3（F15 三类快照） |
| 候选哈希/diff/status | §6（`10-candidate-hashes.txt`：116 文件） |

编号：A-1…A-10 为 `version-change-integration.test.ts` 用例；B-1…B-7 为 `trunk-stable-write-integration.test.ts`（顺序见原始日志）。

## 3. T1 结论

**通过**（证据层面；最终判定归 E2）。AC-5（S7 前置校验）、AC-13（stable boundary 扩大 → 确认卡 → 一次性许可）、AC-17（VCA 在途抑制自动 run-change）均通过；D4（confirm 回执缺 acknowledgments）已由 D3/U2 修复并经 T2 复测闭环（§8）。

## 4. T3 全量回归（最终权威运行 = `24-t3-full-regression.log`）

- 口径（沿用 B0）：`node --test --test-concurrency=1`，`test/**/*.test.ts` 排除既有挂起 `test/pi-adapter/write-sequencing.test.ts`；10 目录 glob + 39 pi 显式文件（`run-t3.sh`）。
- 文件集：**446**（447−1），较 B0（420）**+26/−0**（`19-t3-diff-vs-b0.txt`）；覆盖校验 `expected=446 expanded=446 piExplicit=39 missing=0 extra=0`。
- 运行：**exit 1**；窗口 `2026-11-05 02:59:59 → 03:04:32 +0800`；`duration_ms 272,689.9323`（约 272.7s）。
- 计数：**tests 4029 / pass 4002 / fail 9 / cancelled 0 / skipped 18 / todo 0**（较 B0 基线 +255 tests，来自本特性各层与 E2 返工新增用例）。
- 失败分类：**9 项全部为既有 Windows symlink EPERM**（与 B0 名单逐名一致）；**新增确定性失败 = 0、新增 skip = 0**（skipped 18 为既有平台条件）。
- 运行抖动披露：一次全量（run3）在 pi-adapter 后半段停滞（B0 同类），已中止留证（`24-t3-full-regression-run3-stalled.log`）；run4 完整完成并作权威数字；ENOTEMPTY 类隔离复跑均通过（`24b`/`24b2`）。

## 5. 双端 typecheck / build（最终候选）

| 命令 | exit | 原始输出 |
| --- | --- | --- |
| `npm run typecheck` | **0** | `06-typecheck.log`（4 行） |
| `npm run typecheck:renderer` | **0** | `07-typecheck-renderer.log`（4 行） |
| `npm run build:renderer`（D4 修复后重建） | **0** | `08d-build-renderer-d4-fix.log`（22 行；`08`/`08b`/`08c` 为历史轮次留档） |

## 6. 候选身份（哈希/diff/status；未暂存）

- HEAD：`89b1fb2`（未变）；分支 `feat/trunk-amendment-model`。
- 工作区快照：`01-status-all.log`（280 行，SHA-256 `1a21aa22…`）；候选（`src/ app/ test/`）状态 `02-status-src-app-test.log`（116 条，SHA-256 `bfb45e72…`，`-uall` 逐文件）。
- 逐文件哈希：`10-candidate-hashes.txt`（116 行，SHA-256 `08fd0cee…`；`git hash-object` + 工作区 `sha256sum`；不暂存）。本节点新文件见 §2。
- `git diff --stat`：`03-diff-stat.log`（55 行，SHA-256 `a722738a…`）。
- 暂存区：空（`05-staged.log`，0 行）。

## 7. T2 真实 Electron 运行（已完成；6 次运行 / 11 张截图 / 34 checks 全过）

- 环境：Electron `44.7.0`（electron.exe 246,302,208 bytes），Node `24.21.0`，Chrome `152.0.7977.130`；Windows 11。
- 方式：`test/测试/trunk-amendment-electron-probe.mjs` 启动真实 Electron 窗口（`1360×860` content size）+ 真实 `app/preload.cjs` + 真实渲染器构建产物 + 真实 ChatHeader/TrunkPanels/VersionChangePanel/RefactorPanel/DecisionDialog；D1 冻结 IPC 由探针按真实形状注入（不启动真实模型/会话执行）；客户卡由真实 `buildVersionChangeCard`/`buildAmendmentItemCard` 与真实 `buildStableBoundaryRisk` 构造；S7 扩大检测经真实 `detectStableBoundaryExpansion` 对真实磁盘 boundary 文件执行；未加载 DEBUG 覆盖层、最多截图不录屏。
- 运行与检查（输出归档 `T2/`）：
  1. zh 主场景（`ANS_T2_OUTDIR=…/T2`）：17 checks / 6 shots；
  2. en-US（`ANS_T2_LOCALE=en-US`）：1 / 1；
  3. item-card：2 / 1；
  4. vca-card：2 / 1；
  5. **boundary-stable（AC-13）**：9 checks / 1 shot（含缺 ack 拒收/勾选后受理/回执携带 required ack）；
  6. **ac17（AC-17）**：3 / 1。
  合计 **34 checks / 34 pass / 0 fail；11 张截图**；每张记录 sha256/bytes/窗口尺寸（`T2/report*.json`、`T2/probe.log`）。

| 截图 | SHA-256 | 窗口 |
| --- | --- | --- |
| `T2/01-customer-header.png` | `4a9f146feeeb8baa698ea9729f4a9eb31776c48349b9b8780820e2b8475c57ba` | 1360×860 |
| `T2/02-version-change-panel.png` | `63d2a4a01330cfa8cf5ec0b0ec193447a88a90c98f37b2e116c172b032e7aad7` | 1360×860 |
| `T2/03-trunk-panel-stable.png` | `885e920e14df59b3b7f8f42074519e20170a9c74df5df61fce816ec771042e94` | 1360×860 |
| `T2/04-refactor-audit.png` | `beaa1feaa85c36594b9dee6d0dd719d84f4138d838eed742ab7bc6dbebaf5989` | 1360×860 |
| `T2/05-trunk-upgrade-preview.png` | `f1105e66f8190639b589e55abc8dcd5d1f749f7ebebe8cf14c04c617edfe9785` | 1360×860 |
| `T2/06-trunk-upgrade-confirmed.png` | `1d006d4b4cbffe07ef4253b4a812d9820117ae6419d46d6a3d80b659bd763c1d` | 1360×860 |
| `T2/07-amendment-item-card.png` | `1461380afed3d90ada7270b3b2f25d3f4c82f89a5f0f0e30849b094fe089d892` | 1360×860 |
| `T2/08-vca-approval-card.png` | `baabfdde0534474d5867f3404c8d2fed240c87400a2db796c620e79d10f92bab` | 1360×860 |
| `T2/09-version-change-panel-en.png` | `d9770bf1c4e55539e173b9d388387dcd67ae6c128c6bb0542a98059fd321a168` | 1360×860 |
| `T2/10-boundary-expansion-card.png` | `cba5ec811483870ebeaf7156c46711607a399cd81e63986093369327e0dbcf25` | 1360×860 |
| `T2/11-ac17-vca-in-flight-system-line.png` | `93cdc78e09f9bbad16885af57bf0d05fb2307108ac03f1532ab90b2a71f3d1db` | 1360×860 |

- AC-13 场景要点（D4 修复后 9/9）：真实 S7 对 `角色卡/impl/boundary.yaml`（新增 `test/`）返回 `expanded:true, expansions:["project:test"]`；真实 D2 生成横幅与 required acknowledgments；确认卡显示横幅/逐条扩大项/必选勾选，未勾选时确认按钮禁用；收窄/无变化 ⇒ 无横幅；不可解析预览 ⇒ `to-yaml-invalid` fail-closed（不呈现卡）；客户通道缺 required acknowledgments 的 confirm 被**拒收且 pending 保留**，勾选齐全后受理且 `outcome.acknowledged` 恰为 required ids。
- AC-17 场景要点：VCA `vc-1 (待确认)` 在途系统行可见且含 `vc-1`；无自动 run-change 决策卡；`#version-change`/`#trunk-upgrade` 显式入口保留。抑制逻辑（submitted/approved 在途、恢复、显式入口）由 D2 `test/桌面应用/run-change-trigger.test.ts` 覆盖并随 T3 通过；本场景展示其 UI 结果（事件形状同真实 session 推送）。
- 披露：T2 IPC 载荷为探针按冻结形状注入（未接真实后端/模型会话），作为 UI/卡面/入口/文案证据足够，但不等同于完整真实业务流程；E2 判定时按此口径采用。

## 8. 缺陷状态（全部关闭）

### 8.1 初跑 D1–D3（已关闭，复测通过）

D1 `trunk-runtime.reconcile` 账本归属（B-4b 8/8）；D2 创世 stable gate（`t9-block1-bootstrap` 11/11）；D3 i18n allowlist（`i18n-guard` 6/6）。

### 8.2 E2 返工 D4（已关闭，复测通过）

- **原缺陷**：confirm 类型的 appointment-write 卡声明 required acknowledgments 时，渲染侧 `DecisionDialog.confirm()` 只发 `{kind:"confirm",confirmed:true}`、`OperatorDecisionPayload.confirm` 无 `acknowledged`；session `afterAppointmentWriteApproved` 因 acks 缺失只发 `boundary-ack-missing`、不签发许可 ⇒ 扩大边界写入勾选后仍无法取得许可。
- **修复**：D3 `app/desktop/customer-input.ts` confirm 回执支持/校验 `acknowledged`（与 choice 共用 `settleAcknowledgements`，缺失/多余/非数组拒收、pending 保留）；U2 `DecisionDialog` confirm 回传恰为 required ids。
- **复测**：T2 boundary 场景 9/9（未勾选禁用；缺 ack confirm 拒收且 pending 保留；勾选齐全受理；`outcome.acknowledged=["boundary-expansion-0"]`）；桌面/UI 全量随 T3 通过。
- 证据：`T2/report-boundary.json`、`T2/10-boundary-expansion-card.png`、`T2/probe.log`。

当前**无待修产品缺陷**。

## 9. AC 覆盖映射（T1/T2 证据；判定归 E2）

| AC | 证据 | 备注 |
| --- | --- | --- |
| AC-1 | A-1/A-2/A-3/A-6 | draft 原位改、frozen 拒绝、新版本允许、R9 事件 |
| AC-2 | A-2/A-3 | 提交冻结修正案、拒绝后仍冻结、不可复用 |
| AC-3 | A-4 | product/rapporteur 矩阵；convener 拒绝 |
| AC-4 | A-1/A-2/A-3/A-8 | 批准/拒绝路径；detail 不立即冻结目标；主权 |
| AC-5 | **A-9/A-10** + A-1/A-4/A-4b + `test/编排/trunk-upgrade-validation.test.ts`（T3） | 批准前/apply 前 schema/roster/D3/版本链 fail-closed；合法正例 applied |
| AC-6 | A-2/A-3 | 逐项 apply/keep；execution 不纳入 guard；失败不改 trunk |
| AC-7 | A-7 | 重构机械写集/无客户决定/无 trunk 版本/越界转 VCA |
| AC-8 | A-7 | refactor 事件无 customer decision；与 version.change 分离 |
| AC-9 | T2 01/02/09 截图 + A-8(i18n/旧入口) + U1 测试 | 客户侧无重构按钮、版本变更入口、收窄主干升级、旧文案迁移 |
| AC-10 | A-6/A-5 | 迁移一律冻结；missing/corrupt；migrated-draft；pin 严格 |
| AC-11 | 各测账本断言（readTaskState 校验） | 三态归属回放 |
| AC-12 | B-4/B-4b | 提交点/两方向/phase 滞后；D1 修复后补写事件合规 |
| AC-13 | **T2 10（9/9）** + S7/D2 测试（T3） | 横幅/逐条扩大/未勾选禁用/缺 ack 拒收/勾选后许可/收窄无横幅/不可解析 fail-closed；D4 闭环 |
| AC-14 | A-4 | 并发/幂等/base mismatch |
| AC-15 | A-1/A-2/A-3/A-6 + `test/门禁引擎/**`（T3） | 全调用点矩阵由门禁测试覆盖 |
| AC-16 | T3 既有 P1.3/trunk 测试 | 回归；无新增失败 |
| AC-17 | **T2 11（3/3）+ `test/桌面应用/run-change-trigger.test.ts`（T3）** + A-8 | VCA 在途抑制自动 run-change（含 vc-1 系统行）、结束后恢复、显式入口保留 |
| AC-18 | A-1/A-2/A-8 + T2 07/08/10 截图 | 卡字段/通道/主权/ack；detail 逐项卡、VCA 卡、边界确认卡可见 |
| AC-19 | A-4/A-2 | 作者写区、workflow/boundary 禁入 VCA |
| AC-20 | T2 04 截图 + 桌面UI 测试 | 客户只读审计、无批准按钮 |
| AC-21 | A-6；B-6 | corrupt fail-closed；恢复拒绝 |
| AC-22 | 本记录/证据目录 + T2 截图元数据 | 候选哈希/命令/计数/截图 sha256/窗口尺寸齐全 |
| AC-23 | A-8 i18n parity + T3 i18n 测试（6/6） | 旧文案迁移 |
| AC-24 | E1/H1 结构核对；T1 未新增角色/写权 | — |
| AC-25 | A-5（两条 bootstrap 路径） | handoff-pin + baseTrunk:null+trunk v1 |
| AC-26 | A-1、A-4b；S2 测试（apply 前重验） | 三时点重验 |
| AC-27 | A-6 + T3 门禁/编排测试 | R9 权威/缓存重建/损坏 fail-closed |
| AC-28 | A-2（仅实际项）；S2/S4 测试 | `change:none` 不入 target |
| AC-29 | A-4（kind/作者写区）、A-2（execution） | teamPlan/flow 映射由 S2 测试 |
| AC-30 | A-4、B-1/B-3、T2 05/06 | stable 单一路径；主干升级仅紧急/恢复 |
| AC-31 | 各测 `readTaskState` 断言 | D1 即此条的候选缺陷（已修复） |
| AC-32 | T3 既有 P1.3 测试 | T1 未重复实现 |
| AC-33 | B-1/B-2/B-3 | workflow 卡/许可/拒绝 |
| AC-34 | B-1/B-3 | mini re-pin/不升版本/绑定 |
| AC-35 | B-1/B-2 | 无许可/过期/哈希不符 fail-closed；无 drift |
| AC-36 | B-1（无 drift）+ A-8（i18n）+ T2 03/09 | 面板无 drift、续接记录、中英文案 |

## 10. 合规与收尾

- 只写：`test/测试/version-change-integration.test.ts`、`test/测试/trunk-stable-write-integration.test.ts`、`test/测试/trunk-amendment-electron-probe.mjs`、本记录与证据目录。
- 未改产品源码/其它角色测试/角色卡内容/边界/communication/acceptance/scheduling；未 commit/push/暂存。收尾：HEAD 仍 `89b1fb2`，暂存区空（`27-postrun-state.log`）。
- T1 临时目录已清理；T2 证据目录内 `T2/project`、`T2/user-data` 等为探针夹具/Electron profile（运行数据，不属产品候选）。

## 11. 证据索引（SHA-256 / 行数；索引见 `28-evidence-index.sha256`）

| 文件 | SHA-256 | 行数/字节 |
| --- | --- | --- |
| `00-head.txt` | `b64c2dd89a7ebcb75e6fece1858d15b23f85ca6138ce9f7e57a565557aa82137` | 1 |
| `01-status-all.log` | `1a21aa2206aeacd8893fe7012c9ec24215c30fbb4bcc6c23db20504583bc88c9` | 280 |
| `02-status-src-app-test.log` | `bfb45e726292a15034b02c1af81271da97f6497e54c8d805048c47da352cb998` | 116 |
| `03-diff-stat.log` | `a722738afe349c4da264363b995156e5be0e68f3bc0c6aba298feb1ff54adce9` | 55 |
| `04-env.log` | `0c05015800cbfdb5d58c7f8ec8b3344c7e0edc7be4bc92324290e7f56422e561` | 3 |
| `05-staged.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 0 |
| `06-typecheck.log` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` | 4 |
| `07-typecheck-renderer.log` | `c39f84a800c8979056680c81bc1c9d0fc1cd0b8cf30560cf69f0be1ca800d93b` | 4 |
| `08-build-renderer.log` | `1412225bc94231243afd0cbe8bec8d8963b4fe695da6634d7e3b3cdc4af12cdb` | 22 |
| `08b-build-renderer-postfix.log` | `b81614070e94b1292ca9f5fe8f160a804aed87db8053d3c54c5d0b0109ea5d9e` | 22 |
| `08c-build-renderer-e2-fix.log` | `62c939ec6e466e786d6d4a9b43a221dcf8e5160a25ce2c4629e33bd4b5d9edd9` | 22 |
| `08d-build-renderer-d4-fix.log` | `e73b5b29e8cf28e586c588b009c43c7d0d2d90fb4ee35173ceb23f320d5a7b2a` | 22 |
| `10-candidate-hashes.txt` | `08fd0ceebc75047886fe550f31cfc9905aa000921020b66b345683b067fcc91f` | 116 |
| `18a-new-version-change-integration.log` | `282cc42b1bc34830c1c95f70fb0de901934e151354aaf2dd49ad69c3a495df32` | 20 |
| `18b-new-trunk-stable-integration.log` | `79f7670548d6ab97403b7650743e4aa18642c0968e01a313db0732c304353000` | 16 |
| `19-t3-file-list.txt` | `799cc96b3af69b46be813e9927ffdacab6285b849a9bdc3fc8036b0da03ca851` | 446 |
| `pi-adapter-explicit-files.txt` | `25e902d3feca2def15dc0b01cec02b474499ebbf14b8f3fccc04eae350f572bd` | 39 |
| `19-t3-list-summary.log` | `9d20403edcec8a86d9eb546c09f06048c29dfe1d1b0caacd36dc67d16ec630b2` | 1 |
| `19-t3-diff-vs-b0.txt` | `33012cd2f6c2c50f87a940bd1fc9018c339cf9a887d3d9bf05895f6f7e4b1895` | 31 |
| `20-t3-coverage-check.log` | `d1d5b13182ea59e781ca4da5f53822c77013096f4a8b442298622e93ff5b0b6b` | 1 |
| `24-t3-full-regression.log` | `4ddb90bdc3a518cd1259b1c896a1ebabe4b6715fb5a4aa645f9b9b7e0f5a97d6` | 5194 |
| `24-t3-full-regression-run3-stalled.log` | `8f45dd263858b5188049a171f92dd85a0e69d4e154dbed96f124c1166ee7f5f1` | 580 |
| `24b-rerun-stuck-redispatch.log` | `0048a25fb13686d2a3acfa2ce7ada9f46ce20e932c142c64db0b44de4d3c4e54` | 18 |
| `24b2-rerun-message-queue.log` | `c5108427a693870645069ea6f78656918c747a2c64b7e96f412a07a465c94bfc` | 27 |
| `26-electron-facts.log` | `921a7d0607dadd1450d7bcf749e8b5634da7cd51f46d8c2ca12605d8f2f55fdc` | 7 |
| `27-postrun-state.log` | `1e3b72227f579f22acc3204b51c4d9ac96b46dd1e3235003590db32c1e1a36d2` | 117 |
| `T2/01-customer-header.png` | `4a9f146feeeb8baa698ea9729f4a9eb31776c48349b9b8780820e2b8475c57ba` | 58,656 B |
| `T2/02-version-change-panel.png` | `63d2a4a01330cfa8cf5ec0b0ec193447a88a90c98f37b2e116c172b032e7aad7` | 121,529 B |
| `T2/03-trunk-panel-stable.png` | `885e920e14df59b3b7f8f42074519e20170a9c74df5df61fce816ec771042e94` | 118,476 B |
| `T2/04-refactor-audit.png` | `beaa1feaa85c36594b9dee6d0dd719d84f4138d838eed742ab7bc6dbebaf5989` | 86,047 B |
| `T2/05-trunk-upgrade-preview.png` | `f1105e66f8190639b589e55abc8dcd5d1f749f7ebebe8cf14c04c617edfe9785` | 126,887 B |
| `T2/06-trunk-upgrade-confirmed.png` | `1d006d4b4cbffe07ef4253b4a812d9820117ae6419d46d6a3d80b659bd763c1d` | 127,408 B |
| `T2/07-amendment-item-card.png` | `1461380afed3d90ada7270b3b2f25d3f4c82f89a5f0f0e30849b094fe089d892` | 84,283 B |
| `T2/08-vca-approval-card.png` | `baabfdde0534474d5867f3404c8d2fed240c87400a2db796c620e79d10f92bab` | 83,885 B |
| `T2/09-version-change-panel-en.png` | `d9770bf1c4e55539e173b9d388387dcd67ae6c128c6bb0542a98059fd321a168` | 157,362 B |
| `T2/10-boundary-expansion-card.png` | `cba5ec811483870ebeaf7156c46711607a399cd81e63986093369327e0dbcf25` | 84,386 B |
| `T2/11-ac17-vca-in-flight-system-line.png` | `93cdc78e09f9bbad16885af57bf0d05fb2307108ac03f1532ab90b2a71f3d1db` | 56,362 B |
| `T2/report.json` | `d7b7f5fdd898f506076651cfb3685fe52b2954b6609a3309f5e80f932e810087` | 19,691 B |
| `T2/report-en.json` | `3b0ec97bbffd2133fe6bf1bf00e32ea5ec43b578378b37ea6bf10fb70d141623` | 1,389 B |
| `T2/report-item.json` | `6b0774436eb2451fca4e51b21f11979e8443804154fa73dae27a7fc0dd4fe060` | 1,388 B |
| `T2/report-vca.json` | `40dc9fe6bd420ae5eceb164a9973cd82f50d30ec1d482711071766e269b423ad` | 1,256 B |
| `T2/report-boundary.json` | `83043b145dcc7701aa15388eeded939e9b856319814d721b2f5031be3d6f7111` | 3,586 B |
| `T2/report-ac17.json` | `b756dbea188df368df4c4dfcb1b78cce11b7405c8809fe967010827a90e2fc9a` | 2,697 B |
| `T2/probe.log` | `fcda1aad6a90b860bf5e12a18bed03e0e6258a583d0cf3084646bf1d4cd19391` | 24,459 B |

构建/索引脚本另见 `10-hash-candidate.mjs`、`19-diff-vs-b0.mjs`、`make-list.mjs`、`run-t3.sh`、`verify-t3-coverage.mjs`（哈希收录于 `28-evidence-index.sha256`）。索引自身不入索引；`sha256sum -c` 校验见 `29-evidence-verify.log`。
