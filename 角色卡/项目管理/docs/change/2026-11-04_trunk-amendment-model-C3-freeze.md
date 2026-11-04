---
id: trunk-amendment-model-c3-freeze
type: change
title: 主干/冻结与版本变更 C3 i18n 契约冻结记录（99 key，frozen）
created: "2026-11-04"
updated: "2026-11-05"
timezone: Asia/Shanghai
status: frozen
related: [trunk-amendment-model]
events:
  - date: "2026-11-04"
    kind: created
    summary: 按桌面UI P1 Rev 1 §6.2 需求清单冻结 99 个 i18n key（versionChange 34 / stableWrite 12 / refactor 14 / freeze 17 / trunk 22），zh/en 成对；迁移 ui.runChange.entry、ui.projectState.pinnedHint、main.versionDecision.error.runChangeRequired；更新 i18n.test.ts 分区计数与 99-key 契约断言；F17 协调注明（D1 不提供 refactor:request，U1 只读指引）；未改其它角色文件/allowlist；未 commit/push
  - date: "2026-11-05"
    kind: updated
    summary: C3b（T1 返工 D3）：i18n-guard allowlist 增加精确条目 app/desktop/version-change.ts（import 中文目录名机器路径 + 三提交能力 tool-result message，非客户 UI；22→23）；guard 6/6、PM 套件 177/172/0/5、typecheck 不涉及；未改 99 key 文案；未 commit/push
---

# 主干/冻结与版本变更 C3 i18n 契约冻结记录（`frozen`）

- **任务 / flowId**：`2026-11-04-trunk-amendment-model` / `trunk-amendment-model`；风险档位 **T3**。
- **角色 / 节点**：项目管理（`src/common/shared/` 唯一写入者）/ 团队计划增量 §10.6 **Batch 1 / C3（i18n 契约冻结，99 key）**。
- **状态**：**`frozen`**（仅冻结 i18n key 契约；不是实施/验收结论）。消费方 U1/D1/编排按本清单消费，未 commit/push。
- **一句话结论**：冻结 **99 key**（`ui.versionChange.*` 34 / `ui.stableWrite.*` 12 / `ui.refactor.*` 14 / `ui.freeze.*` 17 / `ui.trunk.*` 22），zh-CN/en-US 成对、无重复、en-US 零中文泄漏；旧 run-change 文案迁移到「版本变更/主干升级」；`ui.trunk.*` 22 为 C3 **目录内 key 家族扩展**（E1 披露）；**F17**：D1 不提供 `refactor:request`，U1 只读指引，本清单无提交表单 key，U1 的条件性文案须按其冻结点删除/标记「不实现」（C3 未改 U1 文件）。

## 一、依据与基线（写盘前实测）

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| 方案 P1.6（实施契约基线） | 1151 | `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226` | §4.10 UI、§7.2 AC-23/AC-36、§10 复核处置 |
| 桌面UI P1 提案（99 key 需求清单） | 585 | `6ac40ceb96815bf55562d5f9ac4797c7bd01b39715215e5b5e951c8771d2fa3c` | Rev 1 §6.2 建议清单；§6.3 旧文案迁移 |
| 项目管理 P1.6 审核记录（含复审） | 451 | `1a73ebc6d2d0fb1776999522d1fec326e5c1eee3cab205d8a506fee7b9abcb8c` | §4.8 i18n 归 C3；复审 §四 F17；§五冻结前置条件 4 |
| 团队计划 P1.5 增量 | 468 | `911974fa8958e9b26c54e2e31b8bb1ec0be34d63b359795415d6dd5ca77d4ef5` | §4.1 C3 写集（未列 `ui.trunk.*`） |
| 分支 / HEAD | — | `89b1fb2751d74c607b3a17d1b522b88061943a14` | `feat/trunk-amendment-model` |

**目标文件基线（C3 写盘前；`git hash-object` / SHA-256）**

| 文件 | 行数 | blob | SHA-256 |
| --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 2231 | `c64dfe1fbff6752a8e533cb01800d9ea64b31b81` | `2e3413767a2d7593ff4fd5ed0b533bf00a7eb9f8f8ffbceacb9b0384f2ebeac5` |
| `src/common/shared/i18n/messages/en-US.ts` | 2499 | `6d55039d6287d99bce0d1b30bf17f82fcf72aa14` | `9e3803f711ebe632a238eb2f3cb48f14764441ab7aa308cbe7b993bf5635b1fa` |
| `test/项目管理/shared/i18n.test.ts` | 832 | `d9cbb3d5113f568112f1dfd71199fac89696c185` | `551ab06032b9b20a538926230b9d4d1892ed6f683a98e0935fc5be180c27b36b` |

基线哈希与桌面UI P1 §1.4 引用一致。

## 二、写集与改动

| 文件 | 动作 | 新行数 | blob | SHA-256 |
| --- | --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 新增 99 key；迁移 3 个旧 key 值 | 2341 | `b432d003927af56857751f107e6e6ef8b3ea5441` | `c8701f7f47a251d187d29b8637209a859fff700a00c1f719bcd22ffa5a31b50d` |
| `src/common/shared/i18n/messages/en-US.ts` | 同 key 集英文（`Record<MessageKey, MessageTemplate>` 强制齐全） | 2609 | `1b97686c90218008eb40ca748b25ae3ac5692dc1` | `a5d0ead357e7e889c5dd40b1ae36f00b29db502de954cf86b068ea9524b58b46` |
| `test/项目管理/shared/i18n.test.ts` | 分区计数 1092→1191 / 1783→1882；新增 99-key 契约测试 | 1187 | `53ffb651f4356008c9b358256a460dd1028b0ffb` | `b0374cb33d7ff1469638437569b2c8fcb98b7b94246026973a5669221bf3b9de` |
| `test/项目管理/shared/i18n-guard-allowlist.ts` | **C3b**：+1 精确条目（`app/desktop/version-change.ts`，22→23） | 109 | `a78e8c6f1099be08bd84d7a8ab1a46ae01ec790b` | `3c231e8c937e9a82a618dd6a8b94d11e3db2b99654ce34497ec024b7d569de97` |
| `角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-C3-freeze.md` | 本冻结记录（含 C3b） | — | — | — |

**未改**：`app/**`、`src/model/**`、`src/common/编排/**`、`src/provider/**`、`src/service/**`、`src/pipeline/**`、其它角色测试与文档（`app/desktop/version-change.ts` 只在 allowlist 注释中被引用，**未修改**）。`git status` 中同时可见的 `src/model/{runtime,trunk,version-change}.ts`、`src/common/编排/task-state.ts`、`test/runtime-core/*` 属其它角色在途改动，**不属 C3、未触碰**。

## 三、99 key 最终集合与计数（99 口径）

**99 = `ui.versionChange.*` 34 + `ui.stableWrite.*` 12 + `ui.refactor.*` 14 + `ui.freeze.*` 17 + `ui.trunk.*` 22**（与桌面UI P1 Rev 1 §6.2 需求清单逐项一致，未合并/改名/删减；无重复）。

目录总计变化：**ui 1092→1191 / main 626 / shared 62 / preferences 3 / 总 1783→1882**（只增 key，不删 key；3 个旧 key 仅改值）。

### 3.1 `ui.versionChange.*`（34；VCA 面板/入口；消费方 `VersionChangePanel`/`version-change-view.ts`，U1）

`entry`（入口按钮）、`entryHint`（入口说明）、`disabledUnavailable`/`disabledUnknown`（通道/状态不可用）、`loading`/`empty`/`loadError`/`schemaUnsupported`（加载/空态/错误/schema）、`tabPending`/`tabHistory`/`tabFrozen`（分段）、`kind.detailAmendment`/`kind.versionUpgrade`（kind 标签）、`initiator`/`flow`（发起者/流程行）、`status.draft|submitted|approved|rejected|applied|superseded`（VCA 六状态）、`targetLine`/`targetMore`（targets 行/折叠）、`summary`/`hash`/`diff`（摘要/提交哈希/差异预览标题）、`semantics.versionUpgrade`/`semantics.detailAmendment`（卡面语义，AC-18/F43）、`openCard`/`presentAction`/`noChannel`（跳转决策/重发卡/无通道）、`decision`/`resultTrunk`（历史行）、`submitGuidance`（**只读**提交指引，F10）。

### 3.2 `ui.stableWrite.*`（12；stable 确认即写与续接记录）

`record.section`/`record.line`/`record.empty`/`record.unchangedVersion`（主干面板续接记录，消费方 `TrunkPanels`/`stableRecordView`，U1）；`kind.workflow`/`kind.roleCard`/`kind.boundary`（三类 stable 文件标签）；`confirm.baseHash`/`confirm.targetHash`/`confirm.diff`/`confirm.semantics`（**D1 用 key 组装卡面** preview/detail，U1 原样展示，Q11 单一实现）；`confirm.noDrift`（唯一「不再显示漂移」解释句，AC-36 措辞复核）。

### 3.3 `ui.refactor.*`（14；重构审计/只读指引；消费方 `RefactorPanel`/`refactorRowView`，U1）

`entry`/`panelTitle`（入口/面板标题）、`auditOnly`（客户只读说明，AC-20）、`status.requested|accepted|closed|rejected|superseded`（五值，Q9）、`empty`/`summary`/`scope`（空态/说明/范围）、`boundaryHint`（越界转 VCA 提示）、`disabledUnavailable`（桥缺失）、`submitGuidance`（**只读**运营指引，F10/F17；无表单、无身份自报）。

### 3.4 `ui.freeze.*`（17；冻结状态/迁移/原因；消费方 VCA/主干面板冻结视图，U1）

`status.frozen`/`status.draft`（冻结/草稿）、`migratedLegacy`/`migratedDraft`（迁移标注，AC-10；`migrated-draft` 只作迁移标记，**不是** reason）、`failClosed`/`unavailable`（fail-closed/不可用）、`listLine`/`empty`（冻结行/空态）、`reason.vcaApproved|versionUpgradeApproved|detailItemApplied|amendmentSubmitted|handoffPinBootstrap|bootstrapVcaApproved|migratedLegacy|proposalConfirmed|intentConfirmed`（**九类**，与 C1 `DOC_FREEZE_REASONS` 一一对应，AC-31）。

### 3.5 `ui.trunk.*`（22；主干与版本变更面板/收窄升级；消费方 `TrunkPanels`/`trunk-view.ts`，U1）

`entry`/`entryHint`（主干升级入口/仅紧急恢复说明）、`panelTitle`（「主干与版本变更」）、`segment.versionChange|trunk|refactor`（三分段）、`version`/`versionNone`（主干版本/无主干）、`section.current|stable|history|upgrade`（四区段）、`emergencyOnly`（收窄说明，AC-30）、`upgrade.disabledNoTrunk|disabledUnavailable|disabledUnknown`（禁用原因）、`upgrade.highRisk`/`upgrade.reason`/`upgrade.submit`/`upgrade.success`（高危/原因/请求/待确认回执）、`history.empty`/`stable.empty`（空态）。

> **E1 披露**：`ui.trunk.*` 22 key 未在团队计划增量 §4.1 C3 行列出，属 **C3 目录内 key 家族扩展**（P1.6 §4.10 主干与版本变更面板需要；PM 审核 §4.8/§八-15、复审 §五冻结前置条件 4）。E1 引用本记录，不视为写集扩张。

## 四、旧文案迁移（AC-17/AC-23/AC-36）

| key | 迁移前（zh） | 迁移后（zh） | en-US | 消费方/说明 |
| --- | --- | --- | --- | --- |
| `ui.runChange.entry` | 契约变更 · 重开 run | **版本变更** | Version changes | 低层 run-change API/回执保留（G11）；会话头 `#run-change` 移除后不再作为客户主入口（U1 §3.2/§6.3） |
| `ui.projectState.pinnedHint` | …请走契约变更·重开 run。 | **当前 run 已冻结；版本决策不适用，请走版本变更；主干升级仅用于紧急/恢复。** | The current run is pinned; version decisions do not apply. Use Version changes; trunk upgrade is for emergencies and recovery only. | `ProjectStatePanel.tsx` 代码不变（值迁移，U1 Q8） |
| `main.versionDecision.error.runChangeRequired` | …请走契约变更·重开 run。 | **当前 run 已冻结（pinned）；版本决策不适用，请走版本变更；主干升级仅用于紧急/恢复。** | The current run is pinned; version decisions do not apply. Use Version changes; trunk upgrade is for emergencies and recovery only. | 主进程错误文案（D1 生成点消费）；不再指向旧 run-change 入口 |

- `ui.runChange.entryHint` 与其余 `ui.runChange.presented/answered*/failed` 等 **13 key 保留原值**（低层卡/回执仍在，共 14 `ui.runChange.*` key）；本批只迁移客户主入口相关 3 个值。
- `src/common/编排/version-decision.ts:135` 的硬编码「契约变更 · 重开 run」**由编排负责迁移**（不在 C3 写集；本记录只登记依赖）。同类残留见 §七。

## 五、F17 协调注明（不改 U1 文件）

- PM 复审 F17：U1 §3.4/§4.3 仍保留「若 D1 提供活动 convener 会话校验的 `refactor:request`，则 U1 可加申请动作」的条件性文案/描述；**D1 Revision 1 已明确不提供 `refactor:request`**（重构只经 convener 会话能力工具；D1 §3.3/§四/§11-7）。
- **C3 冻结立场（与 D1/F10/F17 一致）**：重构申请只经能力工具；U1 只读指引。冻结集合中**无**任何重构/VCA 提交表单或渲→主申请 key（`ui.refactor.submitGuidance` 与 `ui.versionChange.submitGuidance` 均为只读说明），也无身份自报字段。
- **待 U1 冻结点执行**：U1 在其写集内删除该条件分支或明确标记「不实现」；本 C3 记录不修改 U1 文件，仅作为冻结/协调依据。测试已断言目录中不存在 `ui.versionChange.submit.*`、`ui.refactor.submit.*`、`refactor:request` key（F10/F17 防回流）。

## 六、验证与结果（2026-11-04，当前候选）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 项目管理共享套件 | `node --test "test/项目管理/shared/**/*.test.ts"` | **177 tests / 172 pass / 0 fail / 5 skip**；基线 B0 = 176/171/0/5；新增 1 测试（C3 契约）与 1 pass，**0 新增失败、0 新增 skip**；5 个 skip 为既有（未改断言、未加 skip） |
| 类型检查 | `npm run typecheck` | **exit 0**（`tsc --noEmit`；含 `MessageKey` 推导与 en-US 齐全性；工作树中其它角色在途文件同样编译通过） |
| 独立计数复核 | Node 直读目录 | 总计 **1882**（ui 1191 / main 626 / shared 62 / preferences 3）；五家族 **34/12/14/17/22 = 99**；parity missing/extra = 0/0；en-US Han 计数 = 0 |
| i18n 硬编码守卫（C3） | 随 PM 套件（`i18n-guard.test.ts`） | 通过；C3 时 allowlist 未改、无新增条目 |
| i18n 硬编码守卫（**C3b 修复后**） | `node --test test/项目管理/shared/i18n-guard.test.ts` | **6 tests / 6 pass / 0 fail / 0 skip**；原唯一违规 `app/desktop/version-change.ts:25:51 编排` 已闭合 |
| PM 共享套件（**C3b 修复后复跑**） | `node --test "test/项目管理/shared/**/*.test.ts"` | **177 / 172 / 0 / 5**（与 C3 相同；无回归、无新增失败/skip） |
| 失败分类 | — | 无新增失败；无既有失败需要区分 |

## 七、遗留依赖（不属 C3 写集，按角色登记）

| # | 依赖 | 归属 | 说明 |
| --- | --- | --- | --- |
| 1 | `test/桌面UI/run-change-view.test.ts:25,29` 断言旧值（`zh = "契约变更 · 重开 run"`） | 桌面UI（U1） | U1 按 Q6 裁决删除按钮级用例、保留回执用例时同步更新；C3 只改目录值 |
| 2 | `#run-change` 按钮/旧状态/提示条移除 | 桌面UI（U1） | U1 §3.2；`ui.runChange.entry` 迁移后不再作客户主入口 |
| 3 | `test/桌面应用/run-change-entry.test.ts:204`、`test/桌面应用/e2e/main.mjs:630-633` 断言 `#run-change` | 桌面窗口（D1） | D1 迁移清单（U1 §7-7/§二） |
| 4 | `app/desktop/session.ts`/`interface.ts`/`main.ts` 中旧入口文案（注释/系统行常量） | 桌面窗口（D1） | D1 冻结点按新入口收口；`main.versionDecision.error.runChangeRequired` 值已迁移 |
| 5 | `src/common/编排/version-decision.ts:135` 硬编码旧文案 | 编排 | 任务书明确由编排迁移；同类残留 `src/common/编排/mechanical-rejection.ts:201`、`src/provider/runtime/schema.ts:1434` 亦含旧措辞，建议编排/运行时核心在各自写集内一并收口（只读发现，C3 未改） |
| 6 | `ui.stableWrite.confirm.*` 卡面组装（D1 `mainT`/`translate`） | 桌面窗口（D1） | Q11：D1 用 C3 key 组装 preview/detail，U1 原样展示；不得第二套 |
| 7 | `ui.trunk.*` 22 key 的 E1 披露 | 沟通/统筹（E1） | 引用本记录 §3.5；计划枚举补登，非边界变更 |
| 8 | U1 条件性 `refactor:request` 文案删除/标记 | 桌面UI（U1） | F17；见 §五 |

## 八、冻结声明

1. 本记录冻结 **99 key** 的 key 名、分区、计数、zh/en 文案与占位符；U1/D1/编排**只按本清单消费**（`MessageKey` 编译期强制；不得硬编码中文/英文可见字面量）。
2. 任何新增/改名/删除 key、改变文案语义或计数，须回到项目管理并显式更新 `i18n.test.ts` 断言与本冻结记录（新版本号/新哈希）；旧冻结不静默复用。
3. `ui.trunk.*` 22 为 C3 目录内扩展，已披露（§3.5），E1 引用；不视为新角色/写权/边界变更。
4. F17/F10 冻结：无 `refactor:request`/`version-change:submit` 渲→主提交 key；重构/VCA 只经能力工具，U1 只读指引。
5. 本冻结**不是**实施/测试/验收结论；U1/D1 实施未开始/未验证部分以各自完成报告与 E2 为准。提交/合并/发布不在本记录授权内。

## 九、声明

- 本记录是本次唯一新增的文档写盘；C3b 仅另改 `test/项目管理/shared/i18n-guard-allowlist.ts`（见 §十）；未改角色卡/边界/changelog/communication/acceptance/scheduling，未改其它角色文件。
- **未 commit / 未 push / 未暂存**；未启动应用、未跑 Electron/E2E。
- 写盘文件见 §二；测试/类型检查原始结果见 §六（可复算）。

## 十、C3b 修复记录（2026-11-05，T1 返工 D3：i18n guard 漏项）

- **缺陷**：`test/项目管理/shared/i18n-guard.test.ts` 报 `allowlist 之外出现硬编码中文`，唯一违规 `app/desktop/version-change.ts:25:51 编排`（T1 返工 D3）。
- **事实核对（只读）**：该文件扫描去注释后共 **23 处 Han**，全部为机器/agent-facing 文本，**非客户可见 UI 文案**：
  1. import specifier 中既有中文目录名的机器路径——`编排`（`../../src/common/编排/task-state.ts`，锚点 `:25:51`/`:26:54`）与 `门禁引擎`（`../../src/common/门禁引擎/versioned-doc-guard.ts`，`:31:26`/`:32:67`）；import 路径不可改写，属扫描器保守超集。
  2. 三提交能力（`submitVersionChange`/`submitRefactor`/`requestStableWrite`）的 **tool-result `message`**（`:1166`/`:1208`/`:1221`/`:1251`/`:1267`/`:1277`/`:1287` 等）——由 `src/provider/runtime/tools.ts` 的 `makeSubmit*Tool` 作为工具回执返回给角色 agent（tool output），不是客户 UI 文案；用户可见文本只经共享 i18n `mainT`/C3 key。与既有 `app/desktop/requirement-change.ts` allowlist 先例同类（classification §4）。
  > 说明：T1 报障描述只覆盖第 1 类（首个命中）；本记录按实测把第 2 类一并写明，避免理由不完整。
- **修复**：按既有 allowlist 机制增加**文件全等精确条目** `app/desktop/version-change.ts`（22→23；排序在 `session.ts` 与 `view-image.ts` 之间），注释写明上述两类锚点/理由；**未改扫描规则、未加文件级/目录级通配、未改 `version-change.ts`**。
- **验证**：guard 单跑 **6/6 pass / 0 fail / 0 skip**；PM 共享套件复跑 **177/172/0/5**（无回归）。allowlist 新哈希见 §二。
- **边界**：C3 99 key 文案与计数未变；本条目不改变客户可见文案、不扩权。
