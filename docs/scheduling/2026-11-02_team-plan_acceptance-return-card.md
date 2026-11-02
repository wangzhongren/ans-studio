# 团队计划：验收结果返回幕僚的卡片特殊显示 + 原文直出（acceptance return card）

- **任务 ID**：`2026-11-02-acceptance-return-card`
- **产品 flowId**：`acceptance-return-card`（沿用意图/方案文件名）
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-11-02
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档**
- **闸门 0/1 记录**：[`docs/communication/2026-11-02_intent_acceptance-return-card.md`](../communication/2026-11-02_intent_acceptance-return-card.md)（当前 93 行 / SHA-256 `449bf0165d09513d3f56c518b722dc99beb97f4008a90e03667b370e58aa65dd`，含闸门 0、闸门 1 材料与闸门 1 确认记录；方案头引用的 68 行 / `54f44bbb…` 是追加闸门 1 记录前的闸门 0 快照，两者不混用）。闸门 1 客户原话：「确认闸门 1：方案 P1.2，文案/冷色/preview/O2/Q5-A/F3 限制/Q4 全位置按推荐；仅 O2 纳入，其余选装不实施。」
- **客户确认的策划方案（唯一实施基线）**：[`docs/planning/2026-11-02_design_acceptance-return-card.md`](../planning/2026-11-02_design_acceptance-return-card.md) **P1.2**（873 行 / SHA-256 `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2`，本计划写盘前实测一致）。
- **独立复核**：[`docs/planning/2026-11-02_review_acceptance-return-card.md`](../planning/2026-11-02_review_acceptance-return-card.md)（143 行 / SHA-256 `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f`；P1.0 复核快照 103 行 / `5e423152…`，P1.1 再复核结论「建议提交客户确认」，F1–F12 关闭，N1–N4 已在 P1.2 文档/口径落地）。
- **风险档位**：**T2**（跨渲染层、桌面 Interface 与共享 i18n 的展示/载荷变更；不改变验收判定、验收卡选项/路由、报告持久化/声明语义、写权/边界；方案 §8.1 已定档，本计划不压档）。
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目当前**没有 `.ans/project.json`**（未启用 task_ops）；不伪造任务令牌、审批、锁或机器预检记录，证据以文件哈希与原始命令输出为准。
- **当前停点**：本计划写盘后交沟通向客户确认**闸门 2（参与角色/写集/边界变更/档位/阶段顺序/验收安排/证据口径/实施授权边界）**；**闸门 2 确认与客户实施授权前不派发任何 worker、不写卡、不改代码**。闸门 2 与实施授权是两个分开的事实。

---

## 一、任务与基线

### 1.1 目标（按客户确认的 P1.2，不扩大）

只改验收展示，不改验收判定：

1. **verifier 验收报告卡**（两个出现位置：质检自己的回交行、幕僚收到的交付批）：内置质检的报告显示「独立验收报告」标题/「独立验收」徽标/`--info` 冷色；正文直接渲染完整 `report.summary.text` 与全部 `evidence`，去掉 180 字预览与「查看全文」折叠；普通报告卡逐字不变；blocked/failed 危险色优先。
2. **客户侧验收决定卡**（`cardKind="acceptance"`）：显示「独立验收决定」徽标/冷色；把 `docs/quality/<flowId>-report-v1.md` 的 **16 KiB 安全投影原文**显示在卡上（O2：同时显示报告路径）；`request.preview` 作为「验收卡说明」始终显示在原文上方（完全重复时去重）；报告缺失/不可读/无 flowId/**非法 flowId**/旧 payload 走 preview 降级，卡仍可作答。
3. **不改变**：验收判定/验收结论、选项 id/推荐/可作答性/优先级/路由、判断代批、`request.resolved`/`customer.decision`、报告持久化/声明语义、写权/边界、客户闸门、派发受理。

可核对完成标准为方案 §9 **AC-1–AC-14**；正式验收标准由内置独立验收在实施前基于 P1.2 写盘（见 §七）。

### 1.2 风险档位与验证口径：T2

- **T2**：跨渲染层 + 桌面 Interface + 共享 i18n；不新增共享 Model/公共导出/报告契约，不改验收判定/路由/写权。
- 验证口径：受影响层测试（桌面UI 纯逻辑/组件、桌面窗口 SessionManager 载荷、项目管理 i18n）+ 跨层集成 + `npm run typecheck` + `npm run typecheck:renderer` + `npm run build:renderer` + **可跑的 Electron E2E**；截图至多、不要求/不提供录屏；T2 默认不做 T3 全量回归。
- **升档/停止条件**（方案 §8.1）：若实施需要改 `src/model/runtime.ts` 共享报告/客户输入契约、新增 Service/Pipeline 公共导出、改验收判定/`request.resolved`/`customer.decision`、新增 `cardKind`/工具/能力位、把展示文本持久化进报告/任务存储、或重新定义验收路由 → 停止并升 T3/重开闸门，不在本计划写集内。

### 1.3 本轮非目标（不得顺手扩大）

- **O2 纳入**（验收决定卡显示报告路径）；**O1/O3–O10 默认不实施**，O10（任务级验收判别）若要做另开 T3；O4/O5/O6/O7/O8/O9 等均不实施。
- **F3 已接受限制**：内置质检的非验收质量核对报告也会按验收身份显示；项目角色不自动标记；卡片文案不声称「已通过」，免责声明用「如本次为验收任务，是否验收通过以验收决定卡为准」；不做 O10。
- **Q5-A**：报告卡沿用既有快照上限（摘要 16 KiB、单条证据 2 KiB、最多 32 条、快照 96 KiB）；决定卡 16 KiB 安全投影；超限显示「已截断」，净化显示「已净化」；旧卡/缺失/不可读/无 flowId/非法 flowId 走 preview 降级。
- 不改验收判定/选项/推荐/可作答性/优先级/路由/判断代批/`request.resolved`/`customer.decision`/报告持久化/声明语义/写权/边界/客户闸门/派发受理。
- 不改报告快照/声明契约（`RuntimeReportSnapshotV1`/`RuntimeLiveReportViewV1`/`DisplayTextV1` 形状）、`reportId`/`reportPreview` 语义、报告存储/回放格式。
- 不改 `submit_report`/`request_choice` 工具 schema、角色卡文本、`[工作结果]` 模型输入、WorkOverview「最近交付」120 字列表、任务面板 `task.lastReport` 短摘要行。
- 不读 `docs/quality/` 以外路径；不按摘要/证据文本猜测验收；不把项目角色 id 恰好叫 `verifier` 的报告自动标成验收。
- 不恢复 2026-11-01 已取消的 `full-report-display` P1.3（全部交付卡默认展开/64 KiB 示例等）；本方案是 2026-11-02 闸门 0 的新授权，不复用旧闸门确认（方案 §1.6）。
- 不改角色卡/边界文本（除 §4.5 B-1 边界补登，由人事执行）；不改 `package.json`/构建/发布；不 commit/push/merge/release。
- 与当前 dogfooding/harness（仓库外）无关，不引用其工作树改动。

### 1.4 基线（写计划时实测，2026-11-02）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`（PR #31 merge 后；方案/复核一致） |
| 工作树（写本计划前） | 已跟踪修改：`docs/communication/2026-11-02_intent_acceptance-return-card.md`、`docs/communication/memo.md`、`docs/planning/memo.md`；未跟踪：本任务方案、复核记录。**无产品/测试改动**（`git status --porcelain -- src app test` 为空） |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops |
| 环境 | Node v24.22.1 / npm 11.19.1（与近期任务一致；实施前由 B0 复测） |
| 参考基线 | `test/项目管理/shared/i18n.test.ts:101-110` 当前计数 `ui:907 / main:559 / shared:62 / preferences:3 = 1531`；方案新增 14 个 `ui.*` key，若最终 key 集与方案 §4.4 一致则应为 `ui:921 / 总计 1545`（实施时以实际测试为准） |
| 共享属主 | `app/renderer/`、`test/桌面UI/`（及 `test/桌面应用/e2e/uiux-v2.mjs` 单文件）属**桌面UI**；`app/desktop/` 与 `test/桌面应用/`（逐文件授权）属**桌面窗口**；`src/common/shared/` 与 `test/项目管理/shared/` 属**项目管理**；`test/测试/` 属**测试**；`docs/scheduling/` 统筹、`docs/acceptance/` 内置验收、`docs/communication/` 沟通、`docs/planning/` 策划、`角色卡/**` 人事 |
| 输入快照 | 闸门 0 写盘快照 68 行 / `54f44bbb…`；当前闸门 0/1 记录 93 行 / `449bf016…`；方案 P1.2 873 / `51057be9…`；复核 143 / `6f8f8121…`（P1.0 快照 103 / `5e423152…`） |

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-11-02）** | 意图记录「闸门 0 确认记录」：Q1 两者都要、Q2 徽标+全文+证据 |
| 闸门 1：方案确认 | **已确认（2026-11-02，P1.2 为唯一实施基线）** | 意图记录「闸门 1 确认记录」；客户原话见本文件头 |
| 闸门 2：角色指派/写集/边界变更 | **未确认** | 本计划 §八；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开；未给前不派发任何 worker、不改代码 |
| 实施前验收标准 | 未写盘 | 内置独立验收在闸门 2 后、实施前写 `docs/acceptance/acceptance-return-card-criteria-v1.md`（沟通另起验收主上下文） |
| 提交/推送/发布 | **未授权** | 实施/验收期间不 commit/push；另行授权 |
| 已取消 full-report-display | 不相关/不恢复 | 本方案按 2026-11-02 闸门 0 新授权；不复用旧闸门确认；不恢复全部交付卡默认展开（方案 §1.6） |

### 2.1 闸门 2 与实施授权是两个事实

- 闸门 2 确认的是参与角色、各自范围和写集、B-1 边界变更、T2 档位、阶段顺序、验收安排、证据口径、实施授权边界；实施授权是对代码实施与真实回归的授权。两者分开记录。
- 客户在闸门 1 的确认不等于闸门 2，也不等于实施授权。
- 本计划写盘后不派发任何 worker，直到：闸门 2 确认 + 客户实施授权 + V1 写盘并经沟通确认 + H1 B-1 落地 + 逐角色范围预留完成。

### 2.2 客户在闸门 1 已确认的事项（本计划据此排期，不重开）

| 项 | 确认结果 |
| --- | --- |
| 文案 | 「独立验收报告」/「独立验收」/「独立验收决定」 |
| 颜色 | `--info` 冷色（蓝），危险状态优先 |
| preview | `request.preview` 始终显示在报告原文上方，完全重复时去重 |
| O2 | 验收决定卡显示报告路径 `docs/quality/<flowId>-report-v1.md` |
| Q5-A | 报告卡沿用既有快照上限；决定卡 16 KiB 投影；超限/净化 flags；缺失/不可读/无/非法 flowId 走 preview 降级 |
| F3 | 接受已接受限制（内置质检非验收质量核对报告也按验收身份显示；项目角色不标记；不做 O10） |
| Q4 | 所有报告出现位置（幕僚交付卡 + 质检回交卡；O6 不实施） |
| 选装 | 仅 O2 纳入；O1/O3–O10 默认不实施；O10 若做另开 T3 |

---

## 三、五维判断与决策表

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 报告卡/决定卡展示属**桌面UI**既有职责；`enrichAcceptanceJudgeContext`/payload 属**桌面窗口**既有职责；i18n 属**项目管理**；无需新的知识/契约/持续责任 |
| 2. 范围归属 | **现有 Section 1 覆盖；1 个逐文件测试条目缺失，需 B-1** | 见 §4.1。`app/renderer/`、`test/桌面UI/` 是桌面UI目录；`app/desktop/` 是桌面窗口目录；`src/common/shared/`、`test/项目管理/shared/` 是项目管理目录；`test/桌面应用/acceptance-return-card.test.ts` **未列**，需 B-1（`test/桌面应用/` 逐文件授权） |
| 3. 契约影响 | **有应用私有展示载荷变更；无共享 Model/公共导出变更** | `OperatorRequestPayload.acceptanceReport?: { version:1; path:string; text:DisplayTextV1 }` 是 `app/desktop/customer-input.ts` 的应用私有可选字段，不进入 `src/model/runtime.ts`；C1/C2/C3 为展示/数据契约；唯一 primary owner：桌面窗口（payload 提供方）+ 桌面UI（消费方）+ 项目管理（i18n key）。`DisplayTextV1`/`GOVERNANCE_SLUG_PATTERN`/`protectText` 只读复用 |
| 4. 证据独立性 | **满足** | 桌面UI 纯逻辑/组件测试；桌面窗口 SessionManager 级测试；项目管理 i18n parity/guard/计数；测试角色跨层回归 + Electron E2E；内置独立验收按 P1.2 写 V1 并判定 |
| 5. 协调成本 | **复用现有角色最低；新增角色不划算** | 3 个实施角色（桌面UI、桌面窗口、项目管理）写集不相交；测试角色负责跨层/E2E；人事只补 B-1；新增「验收卡展示」专职角色会跨三层重复建卡，无持续独立责任 |

### 3.2 逐角色判断

| 角色 | 判断 | 依据 |
| --- | --- | --- |
| 桌面UI | **保留** | `app/renderer/`、`test/桌面UI/`（及 `test/桌面应用/e2e/uiux-v2.mjs` 单文件）均在既有边界；职责不变 |
| 桌面窗口 | **保留 + 调整边界（B-1）** | `app/desktop/session.ts`/`customer-input.ts` 在 `app/desktop/` 目录；新测试 `test/桌面应用/acceptance-return-card.test.ts` 不在逐文件授权，需 B-1 |
| 项目管理 | **保留** | `src/common/shared/i18n/messages/*`、`test/项目管理/shared/i18n.test.ts` 在目录授权；同时承担实现提案审核（既有技术架构职责） |
| 测试 | **保留** | `test/测试/` 目录授权；负责跨层回归、typecheck/build、可跑 Electron E2E 与证据；默认不新增 `test/测试/` 文件 |
| 人事（内置） | **闸门 2 后执行 B-1** | 角色卡/边界/YAML/changelog 由人事维护；不改 id/显示名/职责描述 |
| 内置独立验收 | **参与**（V1/E2） | 技能默认写权 `docs/acceptance/`；沟通另起唯一验收主上下文 |
| 统筹 | **参与**（本计划、派发、收证、变更包） | 技能默认写权 `docs/scheduling/` |
| 沟通 | **参与**（闸门 2、实施授权、回报） | `docs/communication/` |
| 编排/运行时核心/门禁引擎/装配/产品/宣传/UIUX设计师/各适配器/项目 `角色卡/独立验收` worker | **不参与** | 本任务不改编排/报告快照/投影/门禁表/构建/发布；`run-role.ts`、`handback.ts`、`tool-display.ts`、`report-provenance.ts`、`governance-roles.ts`、`src/model/runtime.ts` 只读 |

### 3.3 决策表结果

**不变，派给现有角色；另需 1 项精确边界变更（职责相同，仅补既有逐文件测试授权路径）。**

- **无**新增角色、**无**拆分、**无**合并、**无**角色 id/显示名/职责描述变更。
- 边界变更 **B-1**：桌面窗口 `boundary.md` + `boundary.yaml` 新增 `test/桌面应用/acceptance-return-card.test.ts` 精确测试条目（见 §4.5）。
- 其余全部路径在既有目录/单文件授权内；不新增共享 Model/公共导出/工具/能力位/IPC 方法/cardKind。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有角色：桌面UI + 桌面窗口 + 项目管理 + 测试 + 内置验收 + 统筹 | **采用** | 写集与现有 Section 1 一一对应；展示/载荷/i18n/证据职责分离；协调成本最低 |
| B. 新增「验收展示」专职角色 | 否决 | 一次性跨层展示变更，无持续独立责任；建卡/边界/交接成本大于收益 |
| C. 把 `acceptanceReport` 放进 `src/model/runtime.ts` 共享 Model | 否决 | 会新增共享契约/公共字段，按方案 §8.1 升 T3；应用私有展示字段足够 |
| D. 扩展 `acceptance-evidence.test.ts` 以避免 B-1 | 不采用（本计划默认） | 设计允许二者；本计划选择新的 SessionManager 级测试文件以清晰覆盖 AC-5–AC-7，需 B-1；若闸门 2 前客户/人事选择扩展既有文件，可不执行 B-1，但不得新增未列文件 |
| E. 把 E2E 夹具改动交给测试角色 | 否决 | 桌面UI 拥有 `test/桌面UI/phase4b-electron-smoke.mjs` 与 `test/桌面应用/e2e/uiux-v2.mjs`；测试角色只执行与取证，避免越权改渲染测试 |
| F. 直接改 `app/desktop/interface.ts` 透传 acceptanceReport | 否决 | `interface.ts` 已透传 `builtIn`/`governanceFunction`；payload 通道在 `customer-input.ts`/`session.ts`，无需改 Interface 注册面 |
| G. 恢复已取消 `full-report-display` 的全部交付卡默认展开 | 否决 | 本方案只限验收卡，普通卡不变；恢复旧范围需另开变更/重走闸门 0/1 |

### 3.5 协调成本与关键排序（结论）

- **契约先行**：A2 桌面UI 纯函数 + A1 项目管理 i18n 先冻结展示判定/key；A4 桌面窗口 payload 形状按方案 C2 冻结；A3 桌面UI 组件/CSS 消费；A5 E2E 夹具在 A3/A4 后。
- **串行**：G2 → IA → H1/V1/B0（可并行）→ P1（实现提案+项目管理审核）→ A1/A2（并行）→ A3/A4（并行）→ A5 → D1 → E1 → E2 → E3。A4 的新测试文件必须在 H1 后创建；A3/A4 不写对方路径。
- **共享文件单写者**：`ReportCard.tsx`/`DecisionDialog.tsx`/`report-view.ts`/`role-view.ts`/`decision-dialog.ts`/`shell.css`/`phase4a.css`/`phase4b.css` 只由桌面UI写；`app/desktop/session.ts`/`customer-input.ts`/`test/桌面应用/acceptance-return-card.test.ts` 只由桌面窗口写；`src/common/shared/i18n/messages/*`/`test/项目管理/shared/i18n.test.ts` 只由项目管理写；`test/测试/` 只由测试写。任何角色不得写其他角色路径、角色卡/边界或 `docs/scheduling|acceptance|communication|planning`。
- **不允许**：在 H1 前创建新测试文件；A3 在 A1/A2 冻结前写引用新 key/纯函数的组件；A4 在 P1 契约审核前改 payload 形状；D1 修改产品/其他角色测试；任何角色改 `src/model/runtime.ts`/报告契约/验收路由。

---

## 四、参与角色、写集与边界覆盖

### 4.1 Section 1 覆盖图（2026-11-02 核对，HEAD `5a35908`）

> `boundary.md` 是授权来源，`boundary.yaml` 是同步副本。目录授权内新增文件不重写边界；逐文件目录中的新条目才交人事。

| 方案路径 | 所属角色 | Section 1 依据 | 本任务写入 |
| --- | --- | --- | --- |
| `app/renderer/src/chat/role-view.ts`（新增 `isVerificationRole`） | 桌面UI | `角色卡/桌面UI/boundary.md`「目录 `app/renderer/`」 | 是（A2） |
| `app/renderer/src/chat/decision-dialog.ts`（`acceptance`/`AcceptanceReportView`） | 桌面UI | 同上 | 是（A2） |
| `app/renderer/src/shell/ReportCard.tsx` | 桌面UI | 同上 | 是（A3） |
| `app/renderer/src/chat/DecisionDialog.tsx` | 桌面UI | 同上 | 是（A3） |
| `app/renderer/src/shell/shell.css`、`phase4a.css`、`phase4b.css` | 桌面UI | 同上 | 是（A3） |
| `test/桌面UI/role-view.test.ts`、`decision-dialog.test.ts` | 桌面UI | 「目录 `test/桌面UI/`」 | 是（A2） |
| `test/桌面UI/dialog-a11y.test.ts`、`source-guard.test.ts`、`theme-tokens.test.ts` | 桌面UI | 同上 | 是（A3） |
| `test/桌面UI/phase4b-electron-smoke.mjs`（E2E 最小追加，条件） | 桌面UI | 同上 | 是（A5，条件） |
| `test/桌面应用/e2e/uiux-v2.mjs`（E2E 最小追加，条件） | 桌面UI | 单文件 `test/桌面应用/e2e/uiux-v2.mjs` 既有条目 | 是（A5，条件） |
| `app/desktop/session.ts` | 桌面窗口 | 「目录 `app/desktop/`」 | 是（A4） |
| `app/desktop/customer-input.ts` | 桌面窗口 | 同上 | 是（A4） |
| `test/桌面应用/acceptance-return-card.test.ts`（新增） | 桌面窗口 | **未列（逐文件授权；H1 B-1）** | 是（A4，H1 后） |
| `test/桌面应用/acceptance-evidence.test.ts` | 桌面窗口 | 既有单文件条目 | **否**（回归只读；不修改） |
| `test/桌面应用/optional-acceptance.test.ts` | 桌面窗口 | 既有单文件条目 | **否**（channel 级回归只读；不能单独证明 AC-5–AC-7） |
| `test/桌面应用/e2e/main.mjs` | 桌面窗口 | 既有单文件条目 | **否**（如既有 E2E 需要运行，只读执行；不修改） |
| `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 项目管理 | 「目录（私有）`src/common/shared/`」 | 是（A1，14 个 `ui.*` key） |
| `test/项目管理/shared/i18n.test.ts` | 项目管理 | 「目录（测试）`test/项目管理/shared/`」 | 是（A1，计数/parity） |
| `test/项目管理/shared/i18n-guard.test.ts` | 项目管理 | 同上 | **否**（回归只读） |
| `test/测试/`（可选跨层/E2E 辅助） | 测试 | 「目录（测试）`test/测试/`」 | **默认否**；如需跨层用例，在目录内新增并回报 |
| `src/model/runtime.ts`、`src/common/runtime-core/tool-display.ts`、`report-provenance.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/run-role.ts`、`src/common/编排/handback.ts`、`app/desktop/interface.ts`、`app/renderer/src/chat/types.ts`、`markdown.ts`、`ChatRow.tsx`、`TaskCenterPanel.tsx`、`index.css` | 各自 owner | 既有边界 | **否**（只读复用/回归；不改共享契约/判定/路由） |
| `docs/acceptance/` | 内置独立验收 | 技能默认写权 | 是（V1/E2） |
| `docs/scheduling/` | 统筹 | 技能默认写权 | 是（本计划、变更包、memo） |
| `docs/communication/` | 沟通 | 沟通写权 | 是（闸门 2/实施授权记录） |
| `角色卡/桌面窗口/boundary.md` + `boundary.yaml` + changelog | 人事 | 人事治理写权 | 是（H1，仅闸门 2 后） |

### 4.2 共享属主核对（不猜）

- `app/renderer/`：桌面UI；本任务只改上述渲染文件/CSS/测试，不改 `app/main.ts`/`app/preload.cjs`/`app/desktop/**`。
- `app/desktop/`：桌面窗口；本任务只改 `session.ts`/`customer-input.ts`，不改 `interface.ts`/`main.ts`/`preload`。
- `src/common/shared/`：项目管理唯一写入者；本任务只新增 i18n key，不改共享组件/公共入口。
- `src/model/runtime.ts`：运行时核心；只读 `GOVERNANCE_SLUG_PATTERN`/`DisplayTextV1`/`OperatorRequestPayload` 现有类型，不修改。
- `src/common/runtime-core/tool-display.ts`：运行时核心；只读复用 `createToolDisplayContext().protectText`，不新增公共导出。
- `test/桌面应用/`：逐文件授权；只写 H1 新增的 `acceptance-return-card.test.ts`；既有 `acceptance-evidence.test.ts`/`optional-acceptance.test.ts`/`e2e/main.mjs` 只读回归/执行。
- `test/桌面UI/`：桌面UI目录；`test/项目管理/shared/`：项目管理目录；`test/测试/`：测试目录；互不重叠。
- `OperatorRequestPayload.acceptanceReport` 是应用私有字段，不进入共享 Model；`acceptanceReport` 不写盘、不进 `task.created`/报告快照。

### 4.3 逐角色精确写集与可观察交付

> 每个文件同一时间只有一个写入者。实现顺序：i18n/纯函数（A1/A2）→ 渲染组件/CSS（A3）与桌面 payload（A4）→ E2E（A5）→ 跨层回归（D1）。

#### 项目管理（A1 i18n；P1 审核）

- **写集（A1）**：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` 新增 14 个 `ui.*` key（方案 §4.4 表：`acceptanceTitle`/`acceptanceBadge`/`acceptanceReportLabel`/`evidenceCount`/`acceptanceDecision`/`acceptanceDecisionPending`/`acceptanceDisclaimer`/`acceptanceKind`/`acceptanceReportTitle`/`acceptanceReportFallback`/`acceptanceReportMissing`/`acceptanceReportTruncated`/`acceptancePreviewLabel`/`reportPath`）；`test/项目管理/shared/i18n.test.ts` 同步精确计数（907→921、1531→1545，实际以测试为准）、parity/占位符；`i18n-guard.test.ts` 作为回归只读。
- **P1 审核**：只读审核桌面UI/桌面窗口的短实现提案，重点确认 C1/C2/C3 形状、F3 文案、F5 两处 CSS、Q5-A/非法 flowId fail-closed、测试映射（AC-5–AC-7 SessionManager 级）、i18n key/计数；输出审核记录到自身已授权 docs。
- **不写**：`app/**`、`src/model/**`、`src/common/shared/i18n` 以外共享组件、其他角色测试、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。

#### 桌面UI（A2 纯逻辑；A3 组件/CSS；A5 E2E 条件）

- **写集（A2）**：`app/renderer/src/chat/role-view.ts`（`isVerificationRole`：`builtIn === true && governanceFunction === "verification"`）；`app/renderer/src/chat/decision-dialog.ts`（`acceptance`、`AcceptanceReportView` 防御读取、16 KiB UTF-8 防御上限、选项/推荐/可作答性不变）；`test/桌面UI/role-view.test.ts`、`test/桌面UI/decision-dialog.test.ts`。
- **写集（A3）**：`app/renderer/src/shell/ReportCard.tsx`（ReportBody 验收分支、完整 `summary.text` + 全部 evidence、无折叠；普通分支逐字不变；DeliveryCard 两处位置 `is-acceptance`/status 类）；`app/renderer/src/chat/DecisionDialog.tsx`（本地化徽标、报告原文区、路径 O2、preview 始终显示/去重、降级）；`app/renderer/src/shell/shell.css`、`phase4a.css`、`phase4b.css`（`--info` 冷色、danger 优先、窄屏/200%）；`test/桌面UI/dialog-a11y.test.ts`、`source-guard.test.ts`、`theme-tokens.test.ts` 按需更新。
- **写集（A5，条件）**：`test/桌面UI/phase4b-electron-smoke.mjs` 和/或 `test/桌面应用/e2e/uiux-v2.mjs` 最小追加验收卡/普通卡 DOM 断言；不得新建 e2e 脚本；不改 `test/桌面应用/e2e/main.mjs`。
- **不写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`（除 `uiux-v2.mjs` 单文件）、其他角色测试、i18n messages、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。
- **可观察交付**：普通报告卡逐字不变；验收报告卡两处位置标题/徽标/冷色/危险色/全文 marker/证据/无折叠；决定卡徽标/原文/路径/preview/降级/选项不变；纯逻辑/组件/守卫测试通过；`npm run typecheck:renderer`/`npm run build:renderer` 0；候选哈希。

#### 桌面窗口（A4 payload + SessionManager 级测试）

- **写集**：`app/desktop/session.ts`（`enrichAcceptanceJudgeContext` 复用已有 `reportText`/`protectText(reportText, 16384)`；本地 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)` 校验后再构造 `docs/quality/<flowId>-report-v1.md`；非法/缺失不构造/不读取，fail-closed；返回值 `{ metadata, display? }`；`buildCustomerInputContext` 传 `acceptanceReport`；诊断只记 path/bytes/flags，不记正文；合法 slug 卡 facts/artifacts/unavailableReason 不变）；`app/desktop/customer-input.ts`（`DesktopCustomerInputFn.ctx.acceptanceReport?`、`OperatorRequestPayload.acceptanceReport?` 复制/队列/镜像/过期原样保留）；新增 `test/桌面应用/acceptance-return-card.test.ts`（B-1 后；SessionManager 级：正常文件、>16 KiB 截断、空/缺失/不可读、无 flowId、非法 flowId、旧 payload 无字段；断言 `ctx.acceptanceReport`/presenter payload、judgeContext/facts/artifacts 缺失与 `unavailableReason` fail-closed；不读项目外文件）。
- **不写**：`app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/**`、`test/桌面应用/acceptance-evidence.test.ts`/`optional-acceptance.test.ts`/`e2e/main.mjs`（回归只读）、其他角色测试、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。
- **可观察交付**：合法 slug 验收卡 payload 形状正确；非法/缺失 flowId 不读项目外路径；>16 KiB 截断 flag；缺失/不可读降级；旧 payload 无字段；选项/路由/判定零变化；SessionManager 测试 + typecheck 通过；候选哈希。

#### 测试（D1）

- **写集**：`角色卡/测试/docs/change/` 证据；`test/测试/` 目录默认**不新增**文件；若 P1 审核确认需要跨层用例，在 `test/测试/` 内新增并回报（目录授权）。
- **D1**：对 A1–A5 同一候选跑方案 §10.3 受影响套件（桌面UI 纯逻辑/组件/守卫、项目管理 i18n、桌面 SessionManager 新测试、投影/报告快照回归）；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；可跑 Electron E2E（`phase4b-electron-smoke.mjs`/`uiux-v2.mjs` 或既有 `main.mjs`）；计数/失败分类/候选哈希；普通报告卡不回归；T2 证据包（不做 T3 全量，除非证据不足/升档）。
- **不写**：产品源码、其他角色测试/组件、角色卡/边界、`docs/scheduling|acceptance|communication|planning`。

#### 人事（H1）

- 按闸门 2 确认，在 `角色卡/桌面窗口/boundary.md` 与 `boundary.yaml` 新增 **B-1** `test/桌面应用/acceptance-return-card.test.ts` 精确单文件条目（用途：SessionManager 级验收回交卡展示载荷测试：正常/>16 KiB/空缺失/不可读/无 flowId/非法 flowId/旧 payload）；根 changelog 记录；不改 id/显示名/职责描述，不重写 role-card。

#### 内置独立验收 / 统筹 / 沟通

- 内置独立验收：`docs/acceptance/acceptance-return-card-criteria-v1.md`（V1）、`docs/acceptance/acceptance-return-card-report-v1.md`（E2）；沟通另起唯一验收主上下文。
- 统筹：`docs/scheduling/`（本计划、`acceptance-return-card-change-v1.md` 变更包、memo）。
- 沟通：`docs/communication/` 闸门 2、实施授权、提交/推送授权（另行）。

### 4.4 治理产物写区（不列给 worker）

- `docs/scheduling/`：统筹；`docs/acceptance/`：内置独立验收；`docs/communication/`：沟通；`docs/planning/`：策划；`角色卡/**` 角色卡/边界/YAML/changelog：人事。worker 不写这些路径。

### 4.5 精确边界变更清单（闸门 2 对象，由人事执行）

| # | 角色 | 治理文件 | 变更内容（精确） | 现状与依据 | 性质 |
| --- | --- | --- | --- | --- | --- |
| B-1 | 桌面窗口 | `角色卡/桌面窗口/boundary.md` + `boundary.yaml` | 新增精确单文件测试条目 `test/桌面应用/acceptance-return-card.test.ts`，用途：SessionManager 级验收回交卡展示载荷测试（正常/>16 KiB 截断/空缺失/不可读/无 flowId/非法 flowId/旧 payload；断言 `ctx.acceptanceReport`/presenter payload 与 fail-closed）；yaml 附 Delta 注释（如 `# --- Delta-ARC-1（2026-11-02，团队计划 §4.5；闸门 2）：test/桌面应用/ 新增 1 个精确测试文件（acceptance-return-card），逐文件授权 ---`） | 两文件均未列；`test/桌面应用/` 对桌面窗口是**逐文件授权**；方案 §10.1/§10.2 明确 SessionManager 级必做测试，AC-5–AC-7 证据需要 | 新增精确路径（职责相同）；不改 id/显示名；不扩其它权限 |

- 人事执行后核对 md/yaml 一致、无其它未列改动、按角色根 changelog 记录；不重写 role-card、不改职责。
- **除 B-1 外没有其它边界变更**：`app/renderer/`、`test/桌面UI/`、`test/桌面应用/e2e/uiux-v2.mjs`、`app/desktop/`、`test/桌面应用/acceptance-evidence.test.ts`/`optional-acceptance.test.ts`、`src/common/shared/`、`test/项目管理/shared/`、`test/测试/` 均在既有授权内。
- 若实施需要任何未列路径（含新 e2e 脚本、`test/桌面应用/` 其他新文件、`src/model/runtime.ts`、`src/common/runtime-core/**` 修改、共享导出）：**停止**，回报统筹并视情况升 T3/重开闸门；不得默认越界。

### 4.6 工作量与范围预留

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 项目管理 | 14 个 i18n key（2 文件）+ 1 个计数/parity 测试 + P1 审核记录 | A1 独占 `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts`；P1 只读审核 |
| 桌面UI | 2 个纯逻辑源码 + 2 个组件 + 3 个 CSS + 2–5 个测试 + 条件 E2E 夹具 | A2/A3/A5 独占 `app/renderer/src/chat/role-view.ts`、`decision-dialog.ts`、`app/renderer/src/shell/ReportCard.tsx`、`app/renderer/src/chat/DecisionDialog.tsx`、`app/renderer/src/shell/{shell,phase4a,phase4b}.css`、`test/桌面UI/*`、`test/桌面应用/e2e/uiux-v2.mjs`（条件） |
| 桌面窗口 | 2 个源码 + 1 个新 SessionManager 测试（B-1） | A4 独占 `app/desktop/session.ts`、`customer-input.ts`、`test/桌面应用/acceptance-return-card.test.ts`（H1 后） |
| 测试 | D1 受影响套件 + 双 typecheck/build + E2E + 证据 | D1 独占 `角色卡/测试/docs/change/`；`test/测试/` 默认不新增 |
| 人事 | 1 项边界条目 + 根 changelog | H1（闸门 2 后） |
| 内置验收 | 1 标准 + 1 报告 | V1/E2 |
| 统筹 | 本计划 + 变更包 + memo | G2/E1/E3 |

范围预留规则：每个节点开始前按具体 `roleId` 与精确路径预留；A1/A2/A3/A4 写集互不相交，但 A3 依赖 A1/A2 冻结，A5 依赖 A3/A4，D1 只读候选；同一文件同一时间只有一个写入者。

---

## 五、阶段、依赖与并行组

### 5.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| G2 | 闸门 | 沟通 → 客户 | 闸门 2 确认记录（参与角色、写集、B-1、T2、顺序、验收安排、证据口径、实施授权边界）；实施授权记录（分开） | 本计划写盘 |
| IA | 实施授权 | 客户 → 沟通 → 统筹 | 客户实施授权记录；未给前不派发任何 worker | G2 |
| H1 | 边界变更 | 人事 | B-1 精确条目落地（md/yaml 一致）+ 桌面窗口根 changelog | G2 |
| V1 | 实施前标准 | 内置独立验收 | `docs/acceptance/acceptance-return-card-criteria-v1.md`：AC-1–AC-14 不弱化、T2 依据与升档条件、证据计划、判定规则、版本冻结；经沟通确认 | G2（可与 H1/B0 并行） |
| B0 | 基线 | 测试 | HEAD/工作树、Node/npm、`typecheck`/`typecheck:renderer`/`build:renderer`、受影响套件基线、应用关闭/启动方式 | IA（可与 H1/V1 并行） |
| P1 | 实现提案与审核 | 桌面UI + 桌面窗口 + 项目管理（提案）/ 项目管理（审核） | 短实现提案（C1/C2/C3、F3/F5/Q5-A、测试映射）+ 项目管理审核记录（`recommend approval`/`needs revision`/`not ready`） | IA + V1 + B0；审核通过前不写产品代码 |
| A1 | i18n | 项目管理 | 14 个 `ui.*` key + 计数/parity 测试 | P1 审核通过 |
| A2 | 渲染纯逻辑 | 桌面UI | `isVerificationRole`、`AcceptanceReportView` 防御读取 + 纯测试 | P1 审核通过 |
| A3 | 报告卡/决定卡/CSS | 桌面UI | `ReportCard.tsx`/`DecisionDialog.tsx`/CSS + 组件/守卫测试 | A1 + A2 |
| A4 | 桌面 payload + SessionManager 测试 | 桌面窗口 | `session.ts`/`customer-input.ts` + `acceptance-return-card.test.ts`（H1 后） | P1 + H1（可并行 A3） |
| A5 | E2E 夹具 | 桌面UI（条件） | `phase4b-electron-smoke.mjs`/`uiux-v2.mjs` 最小验收/普通卡断言；不新建 e2e 脚本 | A3 + A4 |
| D1 | 跨层回归 | 测试 | 方案 §10.3 受影响套件 + 双 typecheck + build + 可跑 E2E；计数/失败分类/候选哈希；T2 证据包 | A5 |
| E1 | 变更包 | 统筹 | `docs/scheduling/acceptance-return-card-change-v1.md`：候选哈希、路径、节点、证据、T2、复用/失效说明 | D1 |
| E2 | 独立验收 | 内置独立验收 | `docs/acceptance/acceptance-return-card-report-v1.md`：AC-1–AC-14 逐项；通过/返工/证据不足 | E1 |
| E3 | 放行/回报 | 统筹 → 沟通 | 按匹配当前候选的结论记录/放行/回报；提交/推送/发布另行授权 | E2 |

### 5.2 依赖要点

- **必须串行**：G2 → IA（未给实施授权不派 worker）；IA → B0/P1；H1/V1 可与 B0/P1 并行，但 A4 的新测试文件必须在 H1 后；P1 审核通过 → A1/A2（可并行）；A1 + A2 → A3；P1 + H1 → A4；A3 + A4 → A5；A5 → D1 → E1 → E2 → E3。
- **可并行**：H1/V1/B0 互不写同一路径；A1（项目管理）与 A2（桌面UI）写集不相交；A3（桌面UI）与 A4（桌面窗口）写集不相交，可并行；A5 内两个 harness 文件可依次/同候选；D1 内各受影响套件可并行但同一候选。
- **不允许**：H1 前创建 `test/桌面应用/acceptance-return-card.test.ts`；A3 在 A1/A2 冻结前写引用新 key/纯函数的组件；A4 在 P1 审核前改 payload 形状；A4/A3 并发写同一文件；D1 修改产品/其他角色测试；任何角色改共享 Model/报告契约/验收路由/角色卡/边界。

### 5.3 各节点入口/出口条件（验收门与证据）

- **G2 入口**：本计划写盘。**出口**：闸门 2 确认记录覆盖本计划版本、参与角色、精确写集、B-1、T2、顺序、验收安排、证据口径、实施授权边界；实施授权另行齐备。
- **IA 入口**：G2 确认。**出口**：客户实施授权记录（与闸门 2 分开）；未给前不派发任何 worker。
- **H1 入口**：G2 确认。**出口**：B-1 在 md/yaml 一致落地；桌面窗口根 changelog 记录；无其它 diff；人事报告条目与哈希。
- **V1 入口**：G2 确认。**出口**：AC-1–AC-14 验收表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、T2 依据与升档条件、F3/F5/Q5-A/O2 核对项、证据计划、判定规则、版本冻结；不弱于方案 §9；沟通确认路径/版本；未确认不派实施。
- **B0 入口**：IA。**出口**：基线命令/环境/计数/失败分类可复算；确认无产品代码改动；记录 Electron/E2E 可运行性。
- **P1 入口**：IA + V1 经沟通确认 + B0。**出口**：实现提案明确 C1/C2/C3、F3 文案、F5 两处位置 CSS、Q5-A/非法 flowId fail-closed、AC-5–AC-7 SessionManager 级测试映射、i18n key/计数、写集；项目管理审核结论 `recommend approval`；否则回提案所有者修订后复审。
- **A1 入口**：P1 审核通过。**出口**：14 key 中英成对/占位符/计数更新/zero 中文泄漏；`i18n.test.ts`/`i18n-guard.test.ts`；typecheck；候选哈希。
- **A2 入口**：P1 审核通过。**出口**：纯函数判定/防御读取；`role-view.test.ts`/`decision-dialog.test.ts`；`typecheck:renderer`；候选哈希。
- **A3 入口**：A1 + A2 退出。**出口**：两处报告卡验收分支/决定卡原文/路径/preview/降级/普通卡不回归/危险色优先/无横向溢出；组件/守卫/主题测试；`typecheck:renderer`/`build:renderer`；候选哈希。
- **A4 入口**：P1 审核通过 + H1 完成。**出口**：payload 形状/16 KiB/非法 flowId fail-closed/缺失降级/旧 payload/诊断无正文；SessionManager 测试；`typecheck`；候选哈希。
- **A5 入口**：A3 + A4 退出。**出口**：E2E 夹具最小追加（两处报告卡/决定卡/普通卡对照）；不新建 e2e 脚本；候选哈希。
- **D1 入口**：A5 退出。**出口**：方案 §10.3 受影响套件全过；`typecheck`/`typecheck:renderer`/`build:renderer` 0；可跑 E2E 输出/截图（至多、不录屏）；计数/失败分类/候选哈希/diff/status；T2 证据包；普通报告卡不回归。
- **E1 入口**：D1。**出口**：变更包候选可复算、路径/节点/证据/T2 齐全。
- **E2 入口**：E1。**出口**：AC-1–AC-14 逐项结论、F3/F5/Q5-A/O2 核对、总体通过/返工/证据不足。
- **E3 出口**：只表示当前候选满足 V1；不授权提交/推送/发布。

### 5.4 失败、返工与恢复

- 失败阻止依赖节点；独立且已授权工作可继续（如 H1/V1/B0/P1 之间互不阻塞）。
- 返工交原所有者（渲染/组件/CSS 归桌面UI；payload/测试归桌面窗口；i18n 归项目管理；测试复测）；验收结论不由统筹改写。
- 候选/契约/标准/边界变化使受影响证据失效：回到待做/返工，不得只改哈希让旧证据冒充当前结果。
- 无并发工具时按相同授权与依赖顺序交独立上下文；无法创建新上下文就保留待办，不在统筹上下文切换角色。
- P1 审核发现方案/写集/档位实质变化：停止实施，回报统筹/沟通；必要时重开闸门 1/2；若触及共享 Model/报告契约/验收路由 → 升 T3。

---

## 六、关键实现约束与已确认口径

1. **验收身份判据（C1）**：仅 `RoleView.builtIn === true && governanceFunction === "verification"`；项目角色不标记；不以文本/状态/角色 id 字符串猜测；该判据是必做，不是选装。
2. **F3 已接受限制**：内置质检的非验收质量核对报告也按验收身份显示；文案「报告本身不构成通过」「如本次为验收任务，是否验收通过以验收决定卡为准」；不显示「验收通过/已通过」；O10 不实施。
3. **报告卡两处位置**：质检回交行（`.msg-handback`）与幕僚交付批（`.delivery-report`）都加 `is-acceptance`；交付批没有 `.msg-handback` 外层，必须单独覆盖；blocked/failed 危险色优先；普通报告卡逐字不变。
4. **决定卡**：`cardKind="acceptance"`；本地化徽标；报告原文 16 KiB 安全投影（`protectText`）；`request.preview` 始终显示在原文上方（纯文本，完全重复时去重）；O2 显示路径；缺失/不可读/无 flowId/非法 flowId/旧 payload 显示说明 + preview 降级；选项/推荐/可作答性/路由不变；高风险/破坏性危险色优先。
5. **路径安全（N1/N4）**：在 `enrichAcceptanceJudgeContext` 构造 `docs/quality/<flowId>-report-v1.md` 前用本地 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)`；非法/缺失不构造/不读取，fail-closed；合法 slug 卡 facts/artifacts/unavailableReason 不变；非法/缺失卡的省略/`unavailableReason` 变化是新增保护，测试需断言；不新增共享导出。
6. **Q5-A**：报告卡沿用既有快照上限（摘要 16 KiB、单证据 2 KiB、最多 32 条、快照 96 KiB）；决定卡 16 KiB 投影；超限/净化 flags；不读第二路径（O4 不实施）。
7. **O2**：决定卡显示 `docs/quality/<flowId>-report-v1.md` 路径；仅 O2 纳入，其余选装不实施。
8. **安全**：只经 `markdown.ts::renderMarkdown`（html:false）渲染报告原文；preview 降级用 `<pre>`；净化/redacted 如实；诊断只记 path/bytes/flags，不记正文/凭据；不新增 `innerHTML`/网络/文件访问；不读 `docs/quality/` 外路径。
9. **普通卡不回归**：`reportPreview` 不改；普通报告仍有 180 字/4 行预览 + 「查看全文」；既有 `uiux-v2.mjs`/`phase4b-electron-smoke.mjs`/`report-view.test.ts` 断言保持。
10. **不恢复 P1.3**：不恢复 `full-report-display` 全部交付卡默认展开/64 KiB；不复用旧闸门确认。

---

## 七、验收安排与证据要求

### 7.1 实施前完成标准（V1）

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 确认后、实施前；沟通另起**唯一验收主上下文**；需要并行取证时按既有规则启动 0–4 个只读取证子上下文（主上下文不计数；子上下文只取证、不判断、不产生第二结论）。
- **路径**：`docs/acceptance/acceptance-return-card-criteria-v1.md`。
- **基线**：客户闸门 1 确认的 P1.2（873 行 / `51057be9…`）+ 闸门 0 意图记录；团队计划只作范围/写集/阶段/证据口径依据，不是标准来源。
- **内容**：AC-1–AC-14 验收表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、T2 依据与升档条件、选定检查、证据复用/失效规则、pass/fail/insufficient evidence/not applicable 判定规则、版本冻结；必须覆盖：两张卡（两处报告卡 + 决定卡）、普通卡不回归、16 KiB/缺失/不可读/无/非法 flowId、i18n、O2、F3 限制、Q5-A、C1/C2/C3、AC-12 语义零变化、AC-13 权限/契约零新增；不得弱于方案 §9。

### 7.2 验收门与阶段放行

- 每个节点按 §5.3 出口交证据；统筹只在**匹配当前候选、客户确认的 P1.2、V1 标准**的有效验收结论出现后记录完成并释放依赖；完成报告/进程退出不能代替验收。
- E1 变更包包含：候选哈希（产品/测试；`git hash-object` + `sha256sum`）、改动路径、节点 G2–E3、证据链接、风险档位 **T2**、复用/失效说明。
- E2 报告首行含：风险档位、判定依据、选定检查、复用证据、消费者重测结论、全量回归 N/A 理由（T2 默认不做）；结论只能**通过/返工/证据不足**。
- 验收通过只表示当前候选满足 V1，不授权提交/推送/发布。

### 7.3 证据要求

1. **通用**：写前基线（目标文件 `git hash-object` + `sha256sum`、HEAD、`status`）；候选身份（逐文件 before/after）；改动范围（diff/status 在写集内、`git diff --cached` 空）；原始命令输出（命令/cwd/时间/Node/npm/OS/退出码/pass/fail/skip/失败原文）；不 commit/push；不改断言保绿；Windows 既有失败按 B0 分类。
2. **受影响检查**：

| 角色 | 命令 | 证据 |
| --- | --- | --- |
| 项目管理 | `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts`；`npm run typecheck` | 14 key 中英成对/占位符/计数 921/1545/零中文泄漏；P1 审核记录 |
| 桌面UI | `node --test --test-concurrency=1 test/桌面UI/role-view.test.ts test/桌面UI/decision-dialog.test.ts test/桌面UI/dialog-a11y.test.ts test/桌面UI/source-guard.test.ts test/桌面UI/theme-tokens.test.ts`；`npm run typecheck:renderer`；`npm run build:renderer` | 纯逻辑/两处报告卡/决定卡/普通卡/危险色/窄屏/主题/source-guard；候选哈希 |
| 桌面窗口 | `node --test --test-concurrency=1 test/桌面应用/acceptance-return-card.test.ts test/桌面应用/acceptance-evidence.test.ts test/桌面应用/optional-acceptance.test.ts`；`npm run typecheck` | payload 正常/>16 KiB/缺失/不可读/无/非法 flowId/旧 payload；judgeContext fail-closed；选项/路由不变；候选哈希 |
| 测试 | 方案 §10.3 受影响套件 + 双 typecheck + build + 可跑 Electron E2E；如需跨层 `test/测试/` | 计数/失败分类/候选哈希；E2E `E2E_PASS`/截图（至多、不录屏）；普通卡对照；T2 证据包 |

3. **Electron E2E**：优先既有 `test/桌面UI/phase4b-electron-smoke.mjs` 或 `test/桌面应用/e2e/uiux-v2.mjs`（桌面UI 所有）；需要时运行 `test/桌面应用/e2e/main.mjs`（桌面窗口所有，只读执行）。截图来自当前候选真实运行、关闭 DEBUG、记录 sha256/候选/命令/窗口尺寸；**最多截图，不得要求/提供录屏**。不可跑如实记录原因（AC 证据不足按 V1 判定）。
4. **T2 复用/失效**：仅复用同候选、同输入/依赖、同命令、同夹具/环境证据；本次展示/载荷变更使相关 UI/桌面证据失效，需重跑受影响套件；T2 默认不做 T3 全量；若证据不足或触发升档条件，按 T3 全量回归并记录排除项（`write-sequencing.test.ts` 既有挂起等）。
5. **不伪造**：报告卡/决定卡 DOM 断言必须是真实渲染输出；不把源码阅读当渲染证据；不把 preview 当报告原文；不把普通卡旧断言未跑当作通过。

---

## 八、闸门 2 待客户确认项

1. **参与角色**：桌面UI（报告卡/决定卡/纯逻辑/CSS/E2E 夹具）、桌面窗口（payload/SessionManager 测试）、项目管理（i18n + P1 审核）、测试（跨层回归/双 typecheck/build/E2E）；人事（H1 B-1）；内置独立验收（V1/E2）；统筹/沟通。**不参与**：编排、运行时核心、门禁引擎、装配、产品/宣传/UIUX设计师/各适配器、项目 `角色卡/独立验收` worker。
2. **精确写集**：按 §4.1/§4.3 逐角色列出（含 A1–A5 文件、B-1 新测试）；任何角色不得写写集外路径；`test/桌面应用/` 只新增 B-1 文件，既有 `acceptance-evidence.test.ts`/`optional-acceptance.test.ts`/`e2e/main.mjs` 只读回归/执行；不新建 e2e 脚本。
3. **边界变更 B-1**：桌面窗口 `boundary.md` + `boundary.yaml` 新增 `test/桌面应用/acceptance-return-card.test.ts` 精确条目（用途见 §4.5）；**无**新增/拆分/合并角色、无 id/显示名/职责描述变更、无其它权限扩大。
4. **风险档位**：**T2**（客户闸门 1 已确认）；若实施触发方案 §8.1 升档条件（共享 Model/报告契约/验收路由/公共导出），停止并升 T3/重开闸门。
5. **阶段顺序**：G2 → IA → H1/V1/B0（并行）→ P1（实现提案+审核）→ A1/A2（并行）→ A3/A4（并行）→ A5 → D1 → E1 → E2 → E3；契约先行、共享文件单写者；A4 新测试文件必须在 H1 后。
6. **验收安排**：内置独立验收；V1 在实施前按 P1.2 写盘（沟通另起唯一验收主上下文），AC-1–AC-14 不弱化，覆盖两张卡/普通卡不回归/16 KiB/缺失/非法 flowId/i18n/O2/F3/Q5-A；E2 判定通过/返工/证据不足。
7. **实施授权与闸门 2 分开**：客户可先确认角色/写集/B-1/T2/顺序/验收安排，再另行给实施授权；本计划写盘后不派发，直到闸门 2 + 实施授权 + V1 经沟通确认 + H1 落地 + 逐角色预留完成。
8. **已确认口径不重开**：文案、`--info` 冷色、preview 始终可见、O2、Q5-A、F3 限制、Q4 全位置、仅 O2 纳入、O1/O3–O10 不实施；`planDispatchDelivery`/派发受理与本任务无关。
9. **不恢复 P1.3**：不恢复已取消 `full-report-display` 的全部交付卡默认展开/64 KiB 示例，不复用旧闸门确认；本方案是 2026-11-02 新授权（方案 §1.6）。
10. **证据口径**：未启用 task_ops；以文件哈希、原始命令输出、diff/status、受影响套件、双 typecheck/build、可跑 Electron E2E/截图（至多、不录屏）为证据；不 commit/push；管理记录不混入产品候选。
11. **基线**：HEAD `5a35908`；若实施前需 rebase/合并 main，先重记基线并确认不改变 P1.2 锚点/证据口径。
12. **越界规则**：任何未列路径（含 `src/model/runtime.ts`、`src/common/runtime-core/**`、共享导出、新 e2e 脚本、其他 `test/桌面应用/` 新文件）停止并重开闸门 2/评估 T3；不得默认越界。

---

## 九、风险、开放点与不一致点

### 9.1 主要风险

1. **F3 限制误解**：内置质检非验收质量核对报告也显示「独立验收报告」；文案不得声称已通过；客户已在闸门 1 接受；O10 不实施。
2. **报告文件未认证**：`docs/quality/<flowId>-report-v1.md` 由质检模型写入，应用只投影/净化，不认证内容；文案「报告」而非「通过」；O5 SHA-256 不实施；如客户担心另开变更。
3. **非法/缺失 flowId fail-closed**：新守卫不构造/不读取；可能改变 `unavailableReason`/facts/artifacts；合法 slug 卡不变；测试必须覆盖，客户已在闸门 1 知悉。
4. **两处报告卡 CSS**：交付批没有 `.msg-handback` 外层，必须单独覆盖 `delivery-report.is-acceptance`/`is-blocked`；决定卡高风险/破坏性危险色优先；AC-1/AC-10 断言两处。
5. **preview 可见性**：始终显示在原文上方；完全重复才去重；不能用默认折叠隐藏 verifier 的卡面结论。
6. **普通报告卡回归**：普通分支 DOM/文案/折叠逐字不变；`reportPreview` 不改；既有 e2e/冒烟断言保持。
7. **i18n 计数/守卫**：14 个 `ui.*` key 中英成对/占位符/计数 921/1545；ReportCard/DecisionDialog 不得硬编码中文；`i18n-guard.test.ts` 通过。
8. **E2E 可运行性**：Windows Electron 环境/时序；B0 记录可运行性，D1 可跑则取证，不可跑如实记录，不以单测替代 AC 的真实渲染证据。
9. **B-1 前越界**：H1 前不得创建 `test/桌面应用/acceptance-return-card.test.ts`；否则越权。
10. **共享文件并发**：`ReportCard.tsx`/`DecisionDialog.tsx`/CSS 与 `session.ts`/`customer-input.ts`/i18n 单写者；A3/A4 并行但不得写对方路径。
11. **T2 证据不足**：若 UI/桌面/E2E 证据不足或触发升档，按 T3 补证/重开；不默认全量回归。
12. **未启用 task_ops**：不伪造机器状态/凭证；证据以文件/原始输出为准。

### 9.2 开放点

1. **测试文件选择**：本计划选择新增 `test/桌面应用/acceptance-return-card.test.ts`（B-1）；若闸门 2 前决定扩展既有 `acceptance-evidence.test.ts`，B-1 可不执行，但不得新增未列文件；需在 P1 提案/闸门 2 记录。
2. **E2E harness 选择**：桌面UI 可在 `phase4b-electron-smoke.mjs` 与 `uiux-v2.mjs` 中选最小追加；不得新建 e2e 脚本；测试角色执行。
3. **i18n 实际计数**：方案推算 921/1545；实施以 `i18n.test.ts` 实际 key 集为准，若新增 key 数不同需在 P1 说明。
4. **旧 payload/旧卡/回放**：按方案降级；未迁移数据；真实旧卡行为由测试/验收核对。
5. **`acceptanceTriage` 前闸**：复核未发现注入点；若真实接线存在，需在 P1/实施中确认不覆盖本 payload；不扩大写集。
6. **基线**：HEAD `5a35908`；若实施前 main 前进/rebase，重记基线并确认不改变 P1.2 锚点。

### 9.3 与方案 §10.3/角色标签的不一致点（如实记录）

1. **E2E 文件归属**：方案 §10.3 列 `test/桌面应用/e2e/main.mjs`（桌面窗口单文件）；本计划优先用桌面UI 所有的 `test/桌面UI/phase4b-electron-smoke.mjs`（目录授权）与 `test/桌面应用/e2e/uiux-v2.mjs`（单文件授权）做渲染 E2E 最小追加；`main.mjs` 只读执行，不改。若客户坚持改 `main.mjs`，归桌面窗口，仍在既有单文件授权内。
2. **新测试文件**：方案 §10.1 允许扩展 `acceptance-evidence.test.ts` 或新增 `acceptance-return-card.test.ts`；本计划选新增（B-1）。若改为扩展既有文件，B-1 不执行。
3. **i18n 计数**：方案 §4.4 推算 921/1545；以实际 key 集/测试为准；若 key 数不同，P1 说明。
4. **方案头/复核记录快照**：方案头引用闸门 0 68 行/`54f44bbb…`、复核 P1.0 103 行/`5e423152…`；当前意图 93/`449bf016…`、复核 143/`6f8f8121…`。本计划按当前文件与方案 P1.2/复核当前记录引用；不混用快照。
5. 除上述标签/快照校正外，方案 §4/§9/§10 的路径、写集性质与非目标与团队判断一致；无其它写集不一致。

---

## 十、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md`）；统筹 memo 续接线索。
- **未确认**：闸门 2（参与角色/写集/B-1/T2/顺序/验收安排/证据口径/实施授权边界）与客户实施授权。
- **未写盘**：实施前验收标准（内置独立验收在闸门 2 后写 `docs/acceptance/acceptance-return-card-criteria-v1.md`）。
- **未做**：派发、实施、测试、验收、E2E、提交、推送、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未接触客户。
- **下一步**：交沟通 → 客户闸门 2 → 客户实施授权 → 内置独立验收写 V1（沟通另起验收主上下文）→ 人事 H1 B-1 → P1 实现提案审核 → 按 §五顺序派发。若客户改变方案/写集/边界/档位/选装，重开闸门 1/2；本上下文不自行判断客户同意，不扩大授权。
