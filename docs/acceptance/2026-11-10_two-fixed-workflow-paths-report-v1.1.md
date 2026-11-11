# B2 复判独立验收报告：两条固定工作流路径（T3，预 RR 放行门，v1.1）

- 日期：2026-11-10
- 角色：ANS「独立验收」（独立固定上下文；任务精确范围授权写入 `docs/acceptance/`）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 节点：**B2 复判（预 RR 放行门）**；按 **B1 v1.1**（冻结 `e2ad4701…`）全量重判 MF-B2-01/02 关闭与候选 `79e16a1`
- 候选：分支 `feat/two-fixed-workflow-paths` / **HEAD `79e16a14bd3467219ecb861c38a48ab47b993038`**
- 基线：`origin/main` `d9e3e99c160599e5b53a82e105939a359f69992f`；代码基线 `10f90c7`
- 详细记录（含全部逐条矩阵、代码锚点与证据索引）：`角色卡/独立验收/docs/change/2026-11-10_B2_re-review_two-fixed-workflow-paths.md`
- 证据目录：`角色卡/独立验收/docs/change/2026-11-10_B2_re-review_two-fixed-workflow-paths_evidence/`（逐文件 SHA-256 见 `90-evidence-index.txt`）
- 前版（保留不改）：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-report-v1.md`（`e28923c` 判定 `不可进入 RR`，MF-B2-01/02）

---

## 一、依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测 |
| --- | --- | --- |
| **B1 v1.1（冻结，唯一判据）** | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.1.md` | 214 行 / 38,065 B / `e2ad4701b1bda9a994616d4543fcab8b05de2f8bfcd4c9f6ee0fcc0873e0b749` |
| B1 v1（前版，逐字保留不改） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| B2 预验收（MF 来源） | `角色卡/独立验收/docs/change/2026-11-10_B2_pre-RR_two-fixed-workflow-paths.md` | 267 / 40,790 / `5958ba3879aa6ad5df2be0e27f43ec74c7067644576a074f5d94f169dc206888` |
| B2.1 编排（MF-B2-02 实现） | `角色卡/编排/docs/change/2026-11-10_B2.1_two-fixed-workflow-paths.md` | `a7bb4bff8fa5c77cbc46e33a1fa8e72fee02be6875b8392d20cf16ae36743817` |
| B2.1 桌面（A12a/A12b 接线） | `角色卡/桌面窗口/docs/change/2026-11-10_B2.1_two-fixed-workflow-paths-desktop.md` | `c110313a27fb0d86331a044296cc1b977b6cf9995ad241156443dffea24d0ac1` |
| B5.3（B2.1 后全链/D1） | `角色卡/测试/docs/change/2026-11-10_B5.3_two-fixed-workflow-paths.md` | `c69d469cd4cf4707a6116b684a5ec60ba0f9c4ff83f2a1099cff173a905bc88f` |
| 设计 v2 / v1.3 / G-IR / 团队计划 | 同前版报告 | `b075829b…` / `ae737dcf…` / `08e01726…` / `4c63ccbc…`（全部实测一致） |

## 二、候选身份

- HEAD `79e16a1`；距 `origin/main` **30 提交、0 落后**；无合并提交、无 tag、未推送（无远端分支）。
- 旧分支 `feat/initial-workflow-publication-completion`（`4a0bafd`/`882d84b`）不是 HEAD 祖先，不参与。
- 工作树 `src`/`app`/`test` 与 HEAD 零 diff；`src/common/gates/` 0 diff；无依赖/配置变更。

## 三、MF 复判结论

### MF-B2-01：**已关闭**

- B1 v1.1 已把 star-routing 7 + i-full-chain 2 = 9 条基线红逐名列入 §二 known-red（`10f90c7` 同名同因、
  非候选回归、测试夹具缺陷）、`test/编排` 22→24 更正、AC-03 明确「legacy 断言逐字保留、不弱化；
  9 红按 known-red 口径、**不要求 pass**」。
- 独立复跑：候选 `79e16a1` 与代码基线 `10f90c7` 纯净解包两侧均 **12 / 3 pass / 9 fail**，
  失败**名称+首条错误串 9/9 完全一致**；`test/编排` **1,335 / 1,309 pass / 24 fail / 2 skip**，
  24 失败名 vs B0 冻结 before **24/24 逐名一致**。

### MF-B2-02：**已关闭**

- 编排 B2.1：`amendBasis`（`basis.amended`/`previousBasisId`、同路径改字节 ⇒ `basis.drift` fail-closed、
  幂等 replay、不产生写权）；`verifyBasisForWorkflow` 关键门（A11/B1/B3/A12a/A12b/A13/B4）一致时
  节流入账 `basis.verified`、drift 必写 `basis.drift`；`verifyBasisForStage` 阶段入口。
- 桌面 B2.1：**A12a/A12b accepted 收口前**按真实 `task.created` 的 workflowId/stage 复核（drift/缺失 ⇒
  `basis-drift`/`basis-missing` 拒绝收口/完成，不写 `task.closed`、不生成归档、不伪造 verified）；
  A11/B1/B3 派发门补 `stage`；A13/B4 发布服务两处复核带 `stage`。
- 独立复跑：`workflow-basis-b21.test.ts` **7/7**、`b21-basis-gate-desktop.test.ts` **6/6**、
  全链 **3/3**、桌面 fixed 套件 **77/77**；代码锚点确认事件写入点唯一、drift 以磁盘真实字节复核。

## 四、独立复跑摘要（同一候选 `79e16a1`）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | **exit 0** |
| `fixed-path-full-chain.test.ts` | **3/3 pass** |
| `mode-switch` + `b-change-scope` | **5/5 pass** |
| B2.1 服务 + 桌面新套件 | **7/7 + 6/6 pass** |
| `test/编排` 全域 | **1,335 / 1,309 pass / 24 fail / 2 skip**（24/24 name-set 与 B0 冻结一致） |
| `test/门禁引擎` 全域 | **528 / 522 / 5 / 1**（5/5 与 B2 预验收证据一致） |
| `test/runtime-core` 全域 | **586 / 549 / 33 / 4**（33/33 一致） |
| `test/roles` / `test/项目管理/shared` | **275/275** / **224 / 219 / 0 / 5** |
| 旧谓词 + 六角色 module-consumption | **69/69 pass** |
| 桌面 fixed 套件（9 文件） | **77/77 pass** |
| `star-routing` + `i-full-chain` | 候选与 `10f90c7` 均 **12 / 3 / 9**，9/9 同名同因 |
| `version-change-integration` / `optional-acceptance` | 9 红（`vca-channel-unavailable`）/ 150s 挂起（2 pass/1 fail/3 未运行，既有 known-red 形态） |

## 五、逐条判定汇总

- **AC-01…AC-30**：**28 pass / 0 fail / 2 insufficient（AC-28/AC-30 仅 RR 证据类）/ 0 NA**。
- **T-01…T-20**：**20 pass / 0 fail**（T-08 由 fail 转 pass；T-14/T-18/T-19/T-20 附披露）。
- **EV-01…EV-08**：**7 pass / 1 insufficient（EV-06 RR 未执行）**。
- **RR-01…RR-06**：**未执行（预算另报）**，不计 pass。

逐条证据矩阵见详细记录 §6–§8；TAP/命令输出见证据目录。

## 六、放行结论：**`可进入 RR`**（预 RR 放行门通过）

- MF-B2-01、MF-B2-02 **均已关闭**；确定性 AC/T/EV（除 RR 证据类）全部 pass；**无剩余 must-fix**。
- **RR 必验点**：隔离实例（RR-01，不用 9222/9223）；空项目→贪吃蛇全链（RR-02：3 卡、基线、A10→A11、
  真实提交、A12a 先于 A11、A12b + `docs/acceptance` 归档）；merge-main 仅客户本人（RR-03）；
  账本/审计/隔离（RR-04）；失败即停（RR-05）；预算另报并书面授权（RR-06）。
- **进入前协调方确认项**（口径确认，非 must-fix）：
  1. `89e0ed6` 的 4 个角色自有记录文档（`角色卡/chief-code/api-spec.md`、
     `角色卡/product-code/{api-spec,feature-map,memo}.md`）按「既有 file 授权 + 角色记录」处理
     （本角色判 pass；严格字面读法下需 B1 v1.2 或移除，docs-only）；
  2. TM-5 同名 known-red 内容增长（5→7 字面量）的判定口径（建议白名单登记）；
  3. RR 不涉及治理文档修正；如需修正，`amendBasis` 当前无生产调用点，须应用侧服务调用 + 协调方单独授权，
     不得绕过 basis 账本。

## 七、限制与披露

- 本复判为**确定性/假会话**验收：未运行真实 Electron、真实模型、真实 UI；**RR-01…RR-06 未执行（预算另报）**。
- 未整域重跑 `test/测试`（119 文件）与 `test/桌面应用`（既有挂起套件）；关键套件/域独立重跑见 §四，
  其余按 B5.3/B2.1 记录引用（不据此声称全绿）。
- 9 条 star-routing/i-full-chain 红经独立基线对照确认为既有夹具缺陷；未修改任何 legacy 断言/夹具。
- 本报告不构成合并/发布/客户放行授权；不替代 RR 真机证据与客户确认。

## 八、未提交声明

- 本报告为**新版本文件**（不原地改 v1），仅写入 `docs/acceptance/` 本角色授权范围。
- **未 commit / push / merge / tag / 发布**；未改 `src/**`、`app/**`、`test/**`、`docs/planning/**`、
  `docs/proposals/**`、`docs/scheduling/**`、角色卡功能文件/边界/其它角色文档；
  未运行真实模型/Electron；未占用 9222/9223。
