# E2 前置接口评审：六角色模块 `role.*` messageKey 与共享 i18n 登记方案

- 日期：2026-11-07；角色：`shared-code`（共享代码维护角色，固定 worker）。
- 性质：**只读规划评审**；不实施、不改源码/测试/角色卡/边界/共享目录；不提交/推送；未运行真实模型。
- 检出：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（worktree；分支 `feat/plan-escalation-card`；HEAD `e71501c`）。
- 依据：E0.3 契约 §3.3 第 6 条、§3.4、§3.5、§4.4；B1 §3.4 E2.1–E2.8；六角色 api-spec/证据；共享 i18n 现状与 `test/项目管理/shared/i18n.test.ts`。
- 写集：本文件只落在 `角色卡/shared-code/docs/change/`（Section 1 白名单）；未触碰 `src/`、`app/`、`test/`、`docs/`、其他角色目录。

---

## 0. 结论摘要

1. **清点结果**：六角色模块共 **112 个唯一 `role.*` 键** = dispatch 37 + preflight 69（含 1 个无角色前缀的 `role.preflight.actionNotCovered`）+ tools 6。另有门禁引擎既有的 3 个 `role.tools.*` 键，属 E0 前既有内部键，不在本次六模块清点范围，但作为先例引用。
2. **处置分类**（按 key 计）：**A = 96，B = 0，C = 16**。
   - A：仅内部诊断/结构化 reason，**不进入共享 i18n**，保持稳定内部键；
   - B：**无**。E2 不新增共享目录文案；
   - C：16 个键在“若需用户可见”时可直接复用既有 `main.*` 文案（消费者侧映射，见 §4.2）。
3. **登记方案**：**无需登记**。`zh-CN.ts` / `en-US.ts` / `keys.ts` / `index.ts` 零变更；`MessageKey` 联合类型不变；当前分区计数 **ui 1211 / main 640 / shared 62 / preferences 3 / 总计 1916** 与 `i18n.test.ts:549-559` 断言保持一致；parity（:907）与 en-US 零 Han（:911）自动保持。
4. **理由**（详见 §5）：E0 §3.5 明确“对外回执不变、内部 reason 只用于测试/诊断”；i18n 目录命名空间契约只有 `ui.*`/`main.*`/`shared.*`/`preferences.*`，不存在 `role.*` 呈现命名空间；六模块 `messageKey` 是 `string`（不是 `MessageKey`），当前无任何消费者 `translate()` 它们；E2.1–E2.8 是等价切换，不要求新增客户可见文案。
5. **阻断项**：**无**（对共享 i18n、写集、契约均无实质修改需求）。**一个条件式 E2 协调项**：若某 E2 单元真要把模块 `messageKey` 逐字呈现给客户，必须先走接口评审并登记**规范化的 `main.*` 家族**（不是 `role.*`），否则会与 i18n 目录契约和“同一文案只一个 key”规则冲突（见 §6.2、§7.2、§8 F7）。
6. **条件式 B 预案**（仅在上述条件触发时）：优先复用 §4.2 的既有 key；仅为 5 个无既有文案的 dispatch 场景新增 `main.session.dispatchDeny.*` 键，zh-CN/en-US 逐字建议见 §6.2；影响 main 640→645、总计 1916→1921。

---

## 1. 输入与版本锚点（实测）

| 输入 | 路径 | 行数 / SHA-256 |
| --- | --- | --- |
| E0.3 契约 | `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` | 685 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` |
| B1 标准 | `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` | 273 / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999` |
| 共享 zh-CN | `src/common/shared/i18n/messages/zh-CN.ts` | 2378 / `72cf3b15e49e433aac94ea7e924fea4e3d0ca7326094bef744a5c87bef8510b1` |
| 共享 en-US | `src/common/shared/i18n/messages/en-US.ts` | 2646 / `b20dd58bd4eed16cf05143c58a27351da825bc1d4395d18ea0591e01371f94e8` |
| `MessageKey` 推导 | `src/common/shared/i18n/keys.ts` | 12 / `a2651622d1b0df7522e4beeac98be71f54a399d6ce388859693602ec5fa26cbf` |
| 共享 i18n 公共出口 | `src/common/shared/i18n/index.ts` | 42 / `7378e0f0ec169c43ef5d92b913ba847c0c4e7d996acedd9c29df9ab716b7f1c3` |
| key 计数/parity/零泄漏测试 | `test/项目管理/shared/i18n.test.ts` | 1204 / `f3137a4f0982aa960c6f1b17efec36b0aaf7a89dd5f44ee14d022491d8d1d4d8` |
| chief api-spec / 证据 | `角色卡/chief-code/api-spec.md` / `docs/change/2026-11-07_E1_chief-module-evidence.md` | 160 / `320c09d603eb57d2a297d302a156df6fb76542dba3741bfc9d8599e8fda0d2f5`；127 / `0a42a8c2970d2acaf7b72dd84d717495f7ec29fce782ae5931de354e6e68ea1a` |
| product api-spec / 证据 | `角色卡/product-code/api-spec.md` / `docs/change/2026-11-07_E1_product-module-evidence.md` | 160 / `0f52f764995bffe8888b8061b7754a9ba8326c0203f3625c5bb1a3951ef0497d`；125 / `b70dc51cf9c1ffff709498f364e27ba9581ef2abeb14fb7d10ee2bc3988aaf4e` |
| rapporteur api-spec / 证据 | `角色卡/rapporteur-code/api-spec.md` / `docs/change/2026-11-07_E1_rapporteur-module-evidence.md` | 207 / `a94ec515dcecb8ceeeac0f0b3e4811e9ec9a6a6a6afa133dd634eb9a2a333cab`；149 / `0c655ff96024b45a6f42710e88c98f8de357d9cc953071303ca3a455fa177faa` |
| nominator api-spec / 证据 | `角色卡/nominator-code/api-spec.md` / `docs/change/2026-11-07_E1_nominator-module-evidence.md` | 204 / `9d07489bfa6c4508338bd9cac86a198a0cc246b3fb140a52cc8a12d31ea742fe`；138 / `b62a78b442f90acfccba344fabf9f784dbb120199e1b0afcaaec0d95ea27644e` |
| convener api-spec / 证据 | `角色卡/convener-code/api-spec.md` / `docs/change/2026-11-07_E1_convener-module-evidence.md` | 160 / `20e6336dcbd47acda251dbc4fb7cf5a7a95ebc40c3c6beac4837f7a60933aea4`；143 / `394d56132ab4e887576257086888c06ec5bdbadef9ae2133ce726ef1a2912a99` |
| verifier api-spec / 证据 | `角色卡/verifier-code/api-spec.md` / `docs/change/2026-11-07_E1_verifier-module-evidence.md` | 128 / `96dbbe35a5f42513008d4bbe24c552796f314a6ccd7e1c2a8fd243e64fc46372`；112 / `b37a51bc1398de1da4e3059fd37b005c15fba3e7fa712799e1ef725e8e187832` |

清点命令（只读）：`grep -rhoE '"role\.[A-Za-z0-9_.]+"' src/common/roles/ | tr -d '"' | sort -u` → 112 行；按 `role.<role>.<family>` 分组的唯一计数见 §2。

---

## 2. 清点范围与计数

| 角色 | dispatch | preflight | tools | 小计 |
| --- | --- | --- | --- | --- |
| chief | 6 | 5 | 2 | 13 |
| product | 7 | 11 | 1 | 19 |
| rapporteur | 5 | 11 | 1 | 17 |
| nominator | 7 | 24 + 1（`role.preflight.actionNotCovered`） | 1 | 33 |
| convener | 6 | 13 | 1 | 20 |
| verifier | 6 | 4 | 0 | 10 |
| **合计** | **37** | **69** | **6** | **112** |

说明：
- 六模块均以字符串字面量给出 `messageKey`；无模板拼接/动态生成（`grep 'messageKey: `'` 零命中）。`RolePolicyDecision.messageKey` / `RolePolicyReason.messageKey` 类型是 `string`（`src/model/role.ts:203-220`），不是共享目录的 `MessageKey`。
- 门禁引擎既有 `role.tools.idUnknown` / `role.tools.notAllowed` / `role.tools.duplicate`（`src/common/门禁引擎/role-tool-registry.ts:104-106`）同为未登记的稳定内部键，E0 前既有先例；不属六模块写集，本次不处理。
- 当前共享目录 `Object.keys(zhCN)` 实测（Node 24 直读 TS）：`{ui:1211, main:640, shared:62, preferences:3, role:0, total:1916}`。

---

## 3. 逐项键清单（112）

> “用户可见”= 该键的语义场景是否可能成为客户可见回执；“条件”表示只在消费者选择呈现时可见，模块本身不写文案。
> “处置”：A = 仅内部诊断，不登记；C = 可复用既有 `main.*` 键（附目标）；B = 需登记（本评审为 0）。

### 3.1 chief（13）

| # | key | code | 语义 | 用户可见 | 消费者 | 处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `role.chief.preflight.actionNotCovered` | `action-not-covered` | 动作不在 chief 覆盖范围（仅 version-decision） | 否 | Service/引擎 version-decision 前置 | A |
| 2 | `role.chief.preflight.factMissing` | `chief-preflight-fact-missing` | 必需事实键缺失 | 否 | 同上 | A |
| 3 | `role.chief.preflight.factInvalid` | `chief-preflight-fact-invalid` | 未知键/类型/取值不符 | 否 | 同上 | A |
| 4 | `role.chief.preflight.versionDecisionPinnedRun` | `chief-version-decision-pinned-run` | pinned run 应走 run-change | 条件 | Service/桌面版本决策 | C → `main.versionDecision.error.runChangeRequired` |
| 5 | `role.chief.preflight.versionDecisionPending` | `chief-version-decision-pending` | 已有未决版本决策，不重复发卡 | 条件 | 同上 | C → `main.versionDecision.error.decisionPending` |
| 6 | `role.chief.dispatch.sourceMissing` | `chief-dispatch-source-missing` | 派发来源缺失 | 条件 | 桌面 `session.ts` 派发路由 | C → `main.session.dispatchWrongSourceShort` |
| 7 | `role.chief.dispatch.sourceNotChief` | `chief-dispatch-source-not-chief` | 来源不是 chief | 条件 | 同上 | C → `main.session.dispatchWrongSource` |
| 8 | `role.chief.dispatch.self` | `self-dispatch` | 派发给自己 | 条件 | 同上 | A（无精确既有 key；如呈现用通用门禁拒绝载体） |
| 9 | `role.chief.dispatch.targetKindInvalid` | `chief-dispatch-target-kind-invalid` | 目标类别未知 | 否 | 同上 | A |
| 10 | `role.chief.dispatch.projectForbidden` | `chief-to-project-forbidden` | 幕僚不得直接派项目 worker | 条件 | 同上 | A（无精确既有 key） |
| 11 | `role.chief.dispatch.targetMissing` | `target-card-missing` | 目标不在五内置/不存在 | 条件 | 同上 | A（`dispatchUnknownTarget` 语义偏“项目角色”，不精确） |
| 12 | `role.chief.tools.singleModel` | `chief-tools-single-model` | single 模型不注入三权工具（正常，不是错误） | 否 | 编排 `run-role.ts` 工具注入 | A |
| 13 | `role.chief.tools.governanceModelUnknown` | `chief-tools-governance-model-unknown` | 未知模型 fail-closed | 否 | 同上 | A |

### 3.2 product（19）

| # | key | code | 语义 | 用户可见 | 消费者 | 处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `role.product.dispatch.inputInvalid` | `dispatch-input-invalid` | 输入形状/类别矛盾（含内置 id 声明为 project） | 否 | 桌面/Service 派发 | A |
| 2 | `role.product.dispatch.selfDispatch` | `self-dispatch` | 派发给自己 | 条件 | 桌面 | A |
| 3 | `role.product.dispatch.unknownSource` | `unknown-source` | 来源不在 {chief, convener} 或缺失 | 条件 | 桌面 | C → `main.session.dispatchWrongSource` |
| 4 | `role.product.dispatch.notInModuleScope` | `dispatch-not-in-module-scope` | 目标不是 product，非本模块范围 | 否 | 引擎路由 | A |
| 5 | `role.product.dispatch.chiefToProjectForbidden` | `chief-to-project-forbidden` | chief→project 禁止 | 条件 | 桌面 | A |
| 6 | `role.product.dispatch.targetCardMissing` | `target-card-missing` | 目标缺失/未核验存在 | 条件 | 桌面 | A |
| 7 | `role.product.dispatch.convenerTargetForbidden` | `convener-target-forbidden` | convener→内置目标禁止 | 条件 | 桌面 | A |
| 8 | `role.product.preflight.actionNotCovered` | `action-not-covered` | 动作不是 version-upgrade | 否 | Service VCA | A |
| 9 | `role.product.preflight.factsMissing` | `product-facts-missing` | 必需事实缺失 | 否 | Service VCA | A |
| 10 | `role.product.preflight.factsInvalid` | `product-facts-invalid` | 类型/取值不符 | 否 | Service VCA | A |
| 11 | `role.product.preflight.factsUnknownKey` | `product-facts-unknown-key` | 未登记事实键 | 否 | Service VCA | A |
| 12 | `role.product.preflight.initiatorMismatch` | `product-initiator-mismatch` | 发起人不是 product | 条件 | Service（最终 `vca-role-not-allowed`） | A |
| 13 | `role.product.preflight.kindMismatch` | `product-kind-mismatch` | kind 不是 version-upgrade | 条件 | Service | A |
| 14 | `role.product.preflight.amendmentRefForbidden` | `product-amendment-ref-forbidden` | version-upgrade 不得引用修正案 | 条件 | Service | A |
| 15 | `role.product.preflight.operationIdMissing` | `product-operation-id-missing` | operationId 空 | 条件 | Service | A |
| 16 | `role.product.preflight.bootstrapMismatch` | `product-bootstrap-mismatch` | baseTrunk=null 与 bootstrap 不配对 | 条件 | Service | A |
| 17 | `role.product.preflight.baseTrunkInvalid` | `product-base-trunk-invalid` | baseTrunk 形状非法 | 条件 | Service | A |
| 18 | `role.product.preflight.targetsInvalid` | `product-targets-invalid` | targets 为空/缺 `expectedFromSha256` | 条件 | Service | A |
| 19 | `role.product.tools.modelUnknown` | `role-tools-model-unknown` | 未知治理模型，不注入 | 否 | 编排 `run-role.ts` | A |

### 3.3 rapporteur（17）

| # | key | code | 语义 | 用户可见 | 消费者 | 处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `role.rapporteur.dispatch.sourceMissing` | `rapporteur-dispatch-source-missing` | 派发来源缺失 | 条件 | 桌面/引擎 | C → `main.session.dispatchWrongSourceShort` |
| 2 | `role.rapporteur.dispatch.sourceMismatch` | `rapporteur-dispatch-source-mismatch` | 来源不是 rapporteur | 条件 | 桌面/引擎 | C → `main.session.dispatchWrongSource` |
| 3 | `role.rapporteur.dispatch.targetInvalid` | `rapporteur-dispatch-target-invalid` | 目标 id/类别非法 | 否 | 引擎 | A |
| 4 | `role.rapporteur.dispatch.targetMissing` | `rapporteur-dispatch-target-missing` | 目标不存在 | 否 | 引擎 | A（rapporteur 非派发来源，防御分支） |
| 5 | `role.rapporteur.dispatch.notAuthorized` | `rapporteur-dispatch-not-authorized` | rapporteur 不是可派发来源 | 否 | 引擎 | A |
| 6 | `role.rapporteur.preflight.actionNotCovered` | `action-not-covered` | 动作不在三项覆盖内 | 否 | Service VCA/run-change | A |
| 7 | `role.rapporteur.preflight.factsMissing` | `rapporteur-facts-missing` | 必需事实缺失 | 否 | Service | A |
| 8 | `role.rapporteur.preflight.factsInvalid` | `rapporteur-facts-invalid` | 类型/取值不符、facts 非普通对象 | 否 | Service | A |
| 9 | `role.rapporteur.preflight.factsUnknownKey` | `rapporteur-facts-unknown-key` | 未登记事实键 | 否 | Service | A |
| 10 | `role.rapporteur.preflight.initiatorMismatch` | `rapporteur-initiator-mismatch` | 发起人不是 rapporteur | 条件 | Service | A |
| 11 | `role.rapporteur.preflight.amendmentNotWholeOrder` | `rapporteur-amendment-not-whole-order` | 非整单修正案 | 条件 | Service VCA | A |
| 12 | `role.rapporteur.preflight.amendmentLegacyCardPath` | `rapporteur-amendment-legacy-card-path` | 走旧卡/旧批准路径 | 条件 | Service VCA | A |
| 13 | `role.rapporteur.preflight.runChangeModeInvalid` | `rapporteur-run-change-mode-invalid` | mode 不在三模式闭集 | 条件 | Service run-change | A（`ui.runChange.failed` 仅通用兜底） |
| 14 | `role.rapporteur.preflight.requirementChangeRefMissing` | `rapporteur-requirement-change-ref-missing` | 缺 flowId/intentId/taskId | 条件 | Service 需求变更 | C → `main.requirementChange.invalid` |
| 15 | `role.rapporteur.preflight.requirementChangeApprovalClaimed` | `rapporteur-requirement-change-approval-claimed` | 声称已批准 | 条件 | Service | C → `main.requirementChange.rejected` |
| 16 | `role.rapporteur.preflight.requirementChangeSelfApproval` | `rapporteur-requirement-change-self-approval` | 发起方自批 | 条件 | Service | C → `main.requirementChange.rejected` |
| 17 | `role.rapporteur.tools.governanceModelUnsupported` | `rapporteur-tools-governance-model-unsupported` | 非 trio 不装配工具 | 否 | 编排 `run-role.ts` | A |

### 3.4 nominator（33）

| # | key | code | 语义 | 用户可见 | 消费者 | 处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `role.nominator.tools.modelUnknown` | `role-tools-model-unknown` | 未知治理模型，不注入 | 否 | 编排 `run-role.ts` | A |
| 2 | `role.nominator.dispatch.inputInvalid` | `dispatch-input-invalid` | 输入形状/类别矛盾 | 否 | 桌面 | A |
| 3 | `role.nominator.dispatch.selfDispatch` | `self-dispatch` | 派发给自己 | 条件 | 桌面 | A |
| 4 | `role.nominator.dispatch.unknownSource` | `unknown-source` | 来源不在 {chief, convener} | 条件 | 桌面 | C → `main.session.dispatchWrongSource` |
| 5 | `role.nominator.dispatch.targetCardMissing` | `target-card-missing` | 目标缺失 | 条件 | 桌面 | A |
| 6 | `role.nominator.dispatch.chiefToProjectForbidden` | `chief-to-project-forbidden` | chief→project 禁止 | 条件 | 桌面 | A |
| 7 | `role.nominator.dispatch.convenerTargetForbidden` | `convener-target-forbidden` | convener→内置目标禁止 | 条件 | 桌面 | A |
| 8 | `role.nominator.dispatch.notInModuleScope` | `dispatch-not-in-module-scope` | 目标不是 nominator | 否 | 引擎路由 | A |
| 9 | `role.preflight.actionNotCovered` | `action-not-covered` | 动作不是 appointment | 否 | Service journal | A（无角色前缀；见 §8 F2） |
| 10 | `role.nominator.preflight.factsMissing` | `appointment-facts-missing` | 必需事实缺失（含 stage） | 否 | Service journal | A |
| 11 | `role.nominator.preflight.factsUnknown` | `appointment-facts-unknown` | 未登记事实键 | 否 | Service journal | A |
| 12 | `role.nominator.preflight.factsInvalid` | `appointment-facts-invalid` | 类型不符/阶段不读的键 | 否 | Service journal | A |
| 13 | `role.nominator.preflight.stageInvalid` | `appointment-stage-invalid` | stage 非法 | 否 | Service journal | A |
| 14 | `role.nominator.preflight.intentEntryInconsistent` | `appointment-intent-entry-inconsistent` | 产品意图/提案/意图入口不一致 | 条件 | Service journal | A |
| 15 | `role.nominator.preflight.rosterMissing` | `appointment-roster-missing` | 最新名单缺失 | 条件 | Service journal | A |
| 16 | `role.nominator.preflight.rosterBuiltinRole` | `appointment-roster-builtin-role` | 名单含内置角色 id | 条件 | Service journal | A |
| 17 | `role.nominator.preflight.rosterInvalid` | `appointment-roster-invalid` | 名单非法/omitted 矛盾 | 条件 | Service journal | A |
| 18 | `role.nominator.preflight.rosterEnvBootstrapMissing` | `appointment-roster-env-bootstrap-missing` | 名单未省略 env-bootstrap 但缺失 | 条件 | Service journal | A |
| 19 | `role.nominator.preflight.d3CardNotMultiple` | `appointment-d3-card-not-multiple` | D3 卡非多选 | 条件 | 桌面 D3 卡 | A |
| 20 | `role.nominator.preflight.d3CardRosterMismatch` | `appointment-d3-card-roster-mismatch` | D3 选项与名单不一致 | 条件 | 桌面 D3 卡 | A |
| 21 | `role.nominator.preflight.d3CardRecommendedMismatch` | `appointment-d3-card-recommended-mismatch` | D3 推荐集与名单不一致 | 条件 | 桌面 D3 卡 | A |
| 22 | `role.nominator.preflight.targetBuiltin` | `appointment-target-builtin` | 目标是内置角色 | 条件 | Service journal | A |
| 23 | `role.nominator.preflight.targetNotInRoster` | `appointment-target-not-in-roster` | 目标不在名单 | 条件 | Service journal | A |
| 24 | `role.nominator.preflight.d3Missing` | `appointment-d3-missing` | 无最新真实 D3 | 条件 | Service journal | A |
| 25 | `role.nominator.preflight.d3Invalid` | `appointment-d3-invalid` | D3 选中集合越名单 | 条件 | Service journal | A |
| 26 | `role.nominator.preflight.d3NotSelected` | `appointment-d3-not-selected` | D3 未选中目标 | 条件 | Service journal | A |
| 27 | `role.nominator.preflight.d3RosterMismatch` | `appointment-d3-roster-mismatch` | D3 绑定名单版本/hash 漂移 | 条件 | Service journal | A |
| 28 | `role.nominator.preflight.planIncomplete` | `appointment-plan-incomplete` | 团队计划未完成 | 条件 | Service journal | A |
| 29 | `role.nominator.preflight.planTargetMissing` | `appointment-plan-target-missing` | 计划未分配目标 | 条件 | Service journal | A |
| 30 | `role.nominator.preflight.documentInvalid` | `appointment-document-invalid` | 三文档路径非 canonical | 条件 | Service journal | A |
| 31 | `role.nominator.preflight.boundaryScopeInvalid` | `appointment-boundary-scope-invalid` | 边界越过角色模块 | 条件 | Service journal | A |
| 32 | `role.nominator.preflight.boundaryUnsynchronized` | `appointment-boundary-unsynchronized` | boundary.md/yaml 不同步 | 条件 | Service journal | A |
| 33 | `role.nominator.preflight.roleCardSectionsMissing` | `appointment-role-card-sections-missing` | 角色卡缺必填章节 | 条件 | Service journal | C → `main.interface.cardMissingSection` |

### 3.5 convener（20）

| # | key | code | 语义 | 用户可见 | 消费者 | 处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `role.convener.tools.governanceModelUnknown` | `governance-model-unknown` | 未知治理模型 fail-closed | 否 | 编排 `run-role.ts` | A |
| 2 | `role.convener.dispatch.sourceInvalid` | `dispatch-source-invalid` | 来源不是 convener/缺失 | 条件 | 桌面 | C → `main.session.dispatchWrongSource` |
| 3 | `role.convener.dispatch.targetInvalid` | `dispatch-target-invalid` | 目标 id 为空 | 否 | 桌面 | A |
| 4 | `role.convener.dispatch.selfDispatch` | `self-dispatch` | 派发给自己 | 条件 | 桌面 | A |
| 5 | `role.convener.dispatch.targetForbidden` | `convener-target-forbidden` | 内置目标不是 verifier | 条件 | 桌面 | A |
| 6 | `role.convener.dispatch.targetMissing` | `dispatch-target-missing` | 目标不存在 | 条件 | 桌面 | A |
| 7 | `role.convener.dispatch.targetKindInvalid` | `dispatch-target-kind-invalid` | 目标类别非法 | 否 | 桌面 | A |
| 8 | `role.convener.preflight.actionNotCovered` | `action-not-covered` | 动作不在四项覆盖内 | 否 | Service | A |
| 9 | `role.convener.preflight.factsInvalid` | `facts-invalid` | facts 非普通对象 | 否 | Service | A |
| 10 | `role.convener.preflight.factsUnknown` | `facts-unknown` | 未登记事实键 | 否 | Service | A |
| 11 | `role.convener.preflight.teamPlanFactsInvalid` | `team-plan-facts-invalid` | 计划事实/形状非法 | 条件 | Service team-plan | A（Service 最终校验有 `main.interface.teamPlan*`） |
| 12 | `role.convener.preflight.teamPlanPathInvalid` | `team-plan-path-invalid` | 计划路径不符合 `docs/scheduling/<flowId>-team-v<version>.md` | 条件 | Service team-plan | A |
| 13 | `role.convener.preflight.stableWriteFactsInvalid` | `stable-write-facts-invalid` | stable-write 事实非法 | 条件 | Service stable-write | A |
| 14 | `role.convener.preflight.stableWriteKindInvalid` | `stable-write-kind-invalid` | kind 不是 workflow | 条件 | Service stable-write | A |
| 15 | `role.convener.preflight.requirementChangeFactsInvalid` | `requirement-change-facts-invalid` | 需求变更事实非法 | 条件 | Service 需求变更 | C → `main.requirementChange.invalid` |
| 16 | `role.convener.preflight.requirementChangeScopeMissing` | `requirement-change-scope-missing` | 缺 flowId/intentId/taskId | 条件 | Service 需求变更 | C → `main.requirementChange.invalid` |
| 17 | `role.convener.preflight.gitActionInvalid` | `git-action-invalid` | action 不在五动作闭集 | 条件 | Git Service | A（无既有 `main.git.*` 家族） |
| 18 | `role.convener.preflight.gitActionFactsInvalid` | `git-action-facts-invalid` | Git 事实/形状非法 | 条件 | Git Service | A |
| 19 | `role.convener.preflight.gitActionConditionsUnmet` | `git-action-conditions-unmet` | 角色侧 Git 条件未满足 | 条件 | Git Service | A |
| 20 | `role.convener.preflight.gitActionTargetInvalid` | `git-action-target-invalid` | Git 目标形状非法 | 条件 | Git Service | A |

### 3.6 verifier（10）

| # | key | code | 语义 | 用户可见 | 消费者 | 处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `role.verifier.dispatch.targetNotVerifier` | `target-not-verifier` | 目标不是 verifier | 否 | 引擎路由 | A |
| 2 | `role.verifier.dispatch.selfDispatch` | `self-dispatch` | 派发给自己 | 条件 | 桌面 | A |
| 3 | `role.verifier.dispatch.unknownSource` | `unknown-source` | 来源不在 {chief, convener} | 条件 | 桌面 | C → `main.session.dispatchWrongSource` |
| 4 | `role.verifier.dispatch.chiefToProjectForbidden` | `chief-to-project-forbidden` | chief→project 禁止 | 条件 | 桌面 | A |
| 5 | `role.verifier.dispatch.targetKindMismatch` | `target-kind-mismatch` | 内置 verifier 声明为 project | 否 | 引擎 | A |
| 6 | `role.verifier.dispatch.targetMissing` | `target-card-missing` | 目标缺失 | 条件 | 桌面 | A |
| 7 | `role.verifier.preflight.actionNotCovered` | `action-not-covered` | 动作不是 review | 否 | Service/桌面 review | A |
| 8 | `role.verifier.preflight.reviewFactsMissing` | `review-facts-missing` | 缺 reviewTarget/criteria | 条件 | Service review | A |
| 9 | `role.verifier.preflight.reviewTargetInvalid` | `review-target-invalid` | reviewTarget 形状非法 | 条件 | Service review | A |
| 10 | `role.verifier.preflight.reviewCriteriaInvalid` | `review-criteria-invalid` | criteria 形状/数量/去重/路径/哈希非法 | 条件 | Service review | A |

---

## 4. 分类汇总

### 4.1 A / B / C 计数

| 分类 | 计数 | 说明 |
| --- | --- | --- |
| A：仅内部诊断/结构化 reason，不进入共享 i18n | **96** | 含全部 6 个 tools 键、69 个 preflight 中除 8 个 C 外的 61 个、37 个 dispatch 中除 8 个 C 外的 29 个 |
| B：用户可见回执需要新增共享 i18n 文案 | **0** | E2 不新增目录条目；见 §5 理由 |
| C：与既有 `main.*` 语义重复/应复用 | **16** | 逐项见 §4.2；消费者用既有 key 渲染，不 translate `role.*` |
| 合计 | **112** | |

### 4.2 C 复用映射（16）

| # | 模块键 | 复用目标（既有 zh-CN key） | 语义匹配度 |
| --- | --- | --- | --- |
| 1 | `role.chief.dispatch.sourceMissing` | `main.session.dispatchWrongSourceShort` | 精确（来源缺失=来源错） |
| 2 | `role.chief.dispatch.sourceNotChief` | `main.session.dispatchWrongSource` | 精确 |
| 3 | `role.chief.preflight.versionDecisionPinnedRun` | `main.versionDecision.error.runChangeRequired` | 精确 |
| 4 | `role.chief.preflight.versionDecisionPending` | `main.versionDecision.error.decisionPending` | 精确 |
| 5 | `role.product.dispatch.unknownSource` | `main.session.dispatchWrongSource` | 精确 |
| 6 | `role.rapporteur.dispatch.sourceMissing` | `main.session.dispatchWrongSourceShort` | 精确 |
| 7 | `role.rapporteur.dispatch.sourceMismatch` | `main.session.dispatchWrongSource` | 精确 |
| 8 | `role.rapporteur.preflight.requirementChangeRefMissing` | `main.requirementChange.invalid` | 精确（参数非法） |
| 9 | `role.rapporteur.preflight.requirementChangeApprovalClaimed` | `main.requirementChange.rejected` | 精确（提交被拒） |
| 10 | `role.rapporteur.preflight.requirementChangeSelfApproval` | `main.requirementChange.rejected` | 精确（自批被拒） |
| 11 | `role.nominator.dispatch.unknownSource` | `main.session.dispatchWrongSource` | 精确 |
| 12 | `role.nominator.preflight.roleCardSectionsMissing` | `main.interface.cardMissingSection` | 精确（缺必填章节） |
| 13 | `role.convener.dispatch.sourceInvalid` | `main.session.dispatchWrongSource` | 精确 |
| 14 | `role.convener.preflight.requirementChangeFactsInvalid` | `main.requirementChange.invalid` | 精确 |
| 15 | `role.convener.preflight.requirementChangeScopeMissing` | `main.requirementChange.invalid` | 精确 |
| 16 | `role.verifier.dispatch.unknownSource` | `main.session.dispatchWrongSource` | 精确 |

> 其余“条件可见”但无精确既有文案的键（self-dispatch、chief-to-project、convener-target-forbidden、target-card-missing 等）保持 A。若未来确需呈现，**不得**逐角色登记重复文案；按 §6 的规范化 `main.*` 家族处理。

---

## 5. 为什么 B = 0（登记判定的依据）

1. **契约口径**：E0.3 §3.5 表“外部可见回执”行明确“门禁/Pipeline 仍返回现有 `trunk-verify-failed` 与文案；内部 reason 只用于测试/诊断”；§3.3 第 6 条只要求 `deny` 携带稳定内部 `code` 与 i18n `messageKey`，未要求把模块键加入共享目录。§4.4 的接口评审对象是“共享 public entry”，本评审的结论是不新增/变更共享 API。
   - 注：任务转述中的“文案由共享 i18n 渲染”不是 E0.3 §3.5 的原文；原文只规定 `i18n messageKey` 与“外部可见回执不变”。若把它解释为“每个 messageKey 都必须能被 `translate()`”，则与本节第 2、3 条的命名空间与“不收录”规则冲突，须先改契约（E0 冻结后变更走接口评审并更新冻结记录），不能由 shared-code 单方面扩张目录。
2. **目录命名空间契约**：`zh-CN.ts` 头注与 `shared-components.md` §2.9 只定义 `ui.*`（渲染层）、`main.*`（主进程用户可见）、`shared.*`（共享设置元数据）与 `preferences.*`；**不存在 `role.*` 呈现命名空间**。把 112 个 `role.*` 诊断键塞入目录会新造一个契约外命名空间。
3. **目录“不收录”规则**：`zh-CN.ts` 头注明确“不收录发给 agent 的任务文案/提示词、模型/工具输出、外部错误原文、诊断/日志码、机器标识”。六模块 `messageKey` 的消费者当前全部是工具回执/Service 校验/诊断（agent-facing）；dispatch 的客户可见系统行文案来自 `workflow-preconditions.ts` 既有中文 `message`，不是模块键，也不是目录条目。
4. **无渲染路径**：全仓 `translate()` 对 `role.*` 零调用；六模块不 import 共享 i18n（构造约束）；E2 呈现数据是语言中性 token（cardKind/optionIds/ids），标签仍走既有 `ui.governance.*`/`ui.decisionCard.*`/`ui.decisionDialog.*`。
5. **类型事实**：`RolePolicyDecision.messageKey` 是 `string`，不是 `MessageKey`；若登记，消费方仍需 cast 或维护映射表，登记并不自动带来类型安全。
6. **E2 等价要求**：B1 E2.2 要求旧/新差分逐字段一致；新增客户可见文案会改变对外呈现，违反 E2.3“不新增客户可见开关/不改变语义”的克制口径。E2.1–E2.8 没有任何条目要求新文案。
7. **先例**：门禁引擎 `role.tools.*`（3 键）自 E0 前即为未登记内部键；`role-tool-registry.ts` 的 `validateRoleToolDeclaration` 消费者只做 fail-closed，不渲染。六模块沿用同一先例。
8. **重复规则**：同一语义在 6 个角色各有 `selfDispatch`/`chiefToProjectForbidden`/`targetCardMissing`/`unknownSource` 等键；逐键登记会出现 6 份同义文案，违反 `zh-CN.ts` 头注“同一含义/同一文案只保留一个 key”与“跨层短词放 shared.common.*”的复用纪律。

---

## 6. 登记实施方案

### 6.1 本轮（E2）方案：无需登记

| 项 | 结论 |
| --- | --- |
| 修改文件 | **无**。`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`、`keys.ts`、`index.ts` 零变更 |
| key 计数测试 | 不更新；`test/项目管理/shared/i18n.test.ts:549-559` 继续断言 `{ui:1211, main:640, shared:62, preferences:3}`、总计 1916 |
| parity | `i18n.test.ts:907` 继续通过（key 全集未变） |
| 零泄漏 | `i18n.test.ts:911` 继续通过（en-US 未新增模板） |
| 本评审实测（只读） | `node --test test/项目管理/shared/i18n.test.ts` → **13/13 pass**；`node --test test/项目管理/shared/i18n-guard.test.ts` → **6/6 pass**（当前树；零变更） |
| `MessageKey` 类型 | 不变；`role.*` 不是 `MessageKey` |
| 共享 public entry | 不变；无 §4.4 共享 API 变更提案 |
| 消费者接线 | 见 §7；任何消费者**不得** `translate(locale, "role.…")`（会命中 `i18n.missing-key` 并回显 key 原文） |
| 回滚/迁移 | N/A（零变更） |

### 6.2 条件式 B 预案（仅当 E2 某单元确需把模块拒绝逐字呈现给客户）

- **触发条件**：某消费方（桌面/Service/工具回执）要把 `RolePolicyDecision.messageKey` 渲染为客户可见文本，且无法复用既有 key。
- **原则**：先复用 §4.2 的既有 key；仅对无既有文案的场景登记**规范化 `main.*` 家族**（不是 `role.*`），多对一映射（6 角色的同义 dispatch 键 → 同一 `main.*` 键）。
- **建议键族**（5 个，命名空间 `main.session.dispatchDeny.*`；`sourceNotDispatcher` 场景不新增，复用既有 `main.session.dispatchWrongSource`）：

| # | 建议 key | zh-CN | en-US | 来源模块键（多对一） |
| --- | --- | --- | --- | --- |
| 1 | `main.session.dispatchDeny.self` | 派发未受理：不能派发给自己。 | Dispatch not accepted: a role cannot dispatch a task to itself. | 六模块 `dispatch.selfDispatch` / `dispatch.self` |
| 2 | `main.session.dispatchDeny.chiefToProject` | 派发未受理：实现任务请交运营（convener）派发给项目 worker；幕僚不直接给项目 worker 派实现任务。 | Dispatch not accepted: implementation tasks must be dispatched to project workers by Operations (convener); the Chief of Staff does not dispatch implementation tasks directly to project workers. | chief/product/nominator/verifier `dispatch.chiefToProjectForbidden` |
| 3 | `main.session.dispatchDeny.chiefTargetMissing` | 派发未受理：目标角色 {roleId} 不是可派发的内置角色（幕僚可派产品/策划/人事/运营/质检）；请确认目标 id 是否拼写正确。 | Dispatch not accepted: target role {roleId} is not a dispatchable built-in role (the Chief of Staff may dispatch Product/Planning/People Ops/Operations/QA); check the target id spelling. | chief `dispatch.targetMissing` |
| 4 | `main.session.dispatchDeny.convenerTargetForbidden` | 派发未受理：运营只能给项目 worker（实现）或质检（验收核对）派发；不得派产品/策划/人事/幕僚。 | Dispatch not accepted: Operations may dispatch only to project workers (implementation) or QA (acceptance checks); it may not dispatch to Product/Planning/People Ops/the Chief of Staff. | convener `dispatch.targetForbidden`; product/nominator `dispatch.convenerTargetForbidden` |
| 5 | `main.session.dispatchDeny.convenerTargetMissing` | 派发未受理：目标角色不存在/未枚举到（{roleId}）；可能是角色卡或边界未就绪、id 拼写错误，或本次角色枚举不可用。请先确认目标 id 是否正确、是否为真实存在的项目角色；若目标是项目 worker 且尚未写卡，请人事按 D3 完成写卡后重试。 | Dispatch not accepted: target role {roleId} does not exist or was not enumerated; the role card or boundary may not be ready, the id may be misspelled, or role enumeration may be unavailable. Confirm the id and that the project role really exists; if the target is a project worker without a role card yet, have People Ops complete the D3 card writing first. | convener `dispatch.targetMissing`; product/nominator `dispatch.targetCardMissing`; verifier `dispatch.targetMissing`; rapporteur `dispatch.targetMissing` |

- **计数影响**：main 640 → **645**；总计 1916 → **1921**；ui/shared/preferences 不变。`i18n.test.ts:549-559` 的 `prefixes` 与 `keys.length` 必须同步更新；建议同时新增一个 5 键的冻结清单断言（仿 `DOWNLOAD_KEYS`），覆盖中英成对、占位符一致（`roleId`）、en-US 零 Han。
- **parity/零泄漏**：自动由 `Object.keys(enUS).sort()` 与 `HAN` 扫描覆盖；无需额外规则。
- **流程**：按 E0 §4.4 由触发单元的 owner 提交提案（目的/受影响 public entry=无/消费者/兼容性/测试/回滚），shared-code 评审并落 `docs/change/` 记录；不得由角色模块自己写文案（E0 §3.3：角色模块不写用户文案）。
- **本预案不实施**：当前 E2 无触发证据，保持 B=0。

---

## 7. E2 消费者接线点与检查清单

### 7.1 E2 单元接线点（按团队计划 §7.5）

| 单元 | 消费文件（只读核对） | 呈现/回执路径 | 本评审要求 |
| --- | --- | --- | --- |
| X-G 门控 | `src/pipeline/orchestration/trunk-runtime.ts` → `src/common/gates/index.ts` | 对外仍 `trunk-verify-failed` + 原文案；`DispatchParentReason` 只诊断 | 不触碰 i18n；不登记 gates reason（本来无 messageKey） |
| X-R1 product | `src/service/version-change/`、`src/service/trunk/`、桌面 | `ui.versionChange.*` / 既有工具回执 | 不 translate `role.product.*`；preflight deny 只进诊断/工具回执 |
| X-R2 rapporteur | Service VCA/run-change、桌面 | `ui.runChange.*` / `main.requirementChange.*` | 同上；run-change 用户可见文案仍走既有 key |
| X-R3 nominator | Service appointment/journal、桌面 D3/写卡卡面 | `main.interface.card*` / `main.interface.boundary*` / `main.interface.teamPlan*` / `ui.governance.power.*` | 卡面标签仍走既有 `ui.*`；模块只提供数据 token |
| X-R4 convener | Service apply-journal/hub、编排 Git 能力装配、桌面 | `main.interface.teamPlan*` / `main.requirementChange.*` / `ui.stableWrite.*` / Git 工具回执 | Git 无 `main.git.*` 家族；deny 只进工具回执/诊断 |
| X-R5 verifier | Service/桌面 review/acceptance 路由 | `main.interface.criteria*` / `main.interface.changePackage*` / `ui.reportCard.*` / `ui.decisionDialog.*` | review/acceptance 卡面标签不新增 key |
| X-R6 chief | 编排 `run-role.ts`、Service `apply-journal.ts`、桌面 | `main.versionDecision.error.*` / `main.session.dispatch*` / `ui.governance.*` | dispatch 的硬授权/文案仍以 `workflow-preconditions.ts` 为准（见 §7.2） |
| X-S 共享抽取 | N/A（E0 §4.3 默认不迁移 `handback.ts` / `workflow-preconditions.ts`） | — | 按 E0 判 `not applicable`，不因本评审改变 |

### 7.2 对 dispatch 消费切换的硬性要求

- `src/common/编排/workflow-preconditions.ts::evaluateDispatchAuthorization` 是 E0 §4.3 声明的**编排稳定公开只读入口**；其现有中文 `message` 是当前唯一承载 dispatch 逐场景文案的来源。
- E2 若把桌面 `routeStarDispatch` 的硬授权改读模块 `dispatch()`，必须同时解决“模块不写文案”的缺口：**保留 `evaluateDispatchAuthorization` 作为权威执行器/文案来源**，模块只作差分期望；或先按 §6.2 走规范化 `main.*` 登记提案。**不得**在桌面/Service 里内联中文字符串（`app/desktop/session.ts` 虽在 `i18n-guard` 既有 allowlist 中、不会触发守卫失败，但新增用户可见文案仍违反 i18n 目录纪律；以“已在 allowlist”为由接受内联文案不成立）。
- 该项不阻断其他 E2 单元；但在 X-R6/桌面单元切换 gate（E2.8）前须有明确处置记录。

### 7.3 E2.1–E2.8 对照

| 条目 | 与 i18n 的关系 | 本评审要求 |
| --- | --- | --- |
| E2.1 切换顺序 | 无 | 不改变顺序 |
| E2.2 双跑差分 | 差分对象是模块输出（含 `code`/`messageKey`），不是客户文案 | 差分只比较结构化字段；不要求目录文案 |
| E2.3 桥接/不新增客户可见开关 | 新增 `role.*` 目录条目若被渲染即为客户可见变化 | 本轮不登记；条件式 B 须另走评审 |
| E2.4 回滚演练 | 无 | 零 i18n 变更，回滚成本为零 |
| E2.5 切换后删除旧实现 | 删除旧中文 `message` 前必须保留文案来源 | 见 §7.2；否则用户可见回执回退 |
| E2.6 清理边界 | `role.*` 键随模块保留，不删 | 不把内部键当死代码清理 |
| E2.7 共享抽取 | 不涉及 i18n 目录（不是抽取项） | N/A 依 E0 §4.3 |
| E2.8 切换 gate | 受影响套件含共享 i18n 测试 | `node --test "test/项目管理/shared/**/*.test.ts"` 保持 199/194/0/5（既有 skip 口径） |

---

## 8. 发现与风险

| # | 发现 | 影响 | 处置 |
| --- | --- | --- | --- |
| F1 | **B = 0，无需登记**：112 键均为内部诊断；目录零变更 | 无 | 本评审结论 |
| F2 | **命名不一致**：nominator 用 `role.preflight.actionNotCovered`（无角色前缀），其余用 `role.<id>.preflight.actionNotCovered`；chief 用 `factMissing`/`factInvalid`，其余用 `factsMissing`/`factsInvalid`；product/rapporteur 用 `factsUnknownKey`，nominator/convener 用 `factsUnknown`；chief 用 `dispatch.self`，其余用 `selfDispatch`；chief 用 `projectForbidden`，其余用 `chiefToProjectForbidden`；tools 键名有 `singleModel`/`modelUnknown`/`governanceModelUnknown`/`governanceModelUnsupported` 四种 | 仅内部一致性/可读性；不影响 E2 等价（键名冻结在模块与测试中） | **非阻断**；不建议 E2 改名（改名需六角色 + 测试同步，且当前无消费者）；记录为 E3 后规范化候选 |
| F3 | **契约测试样例键与模块键不同命名空间**：`test/门禁引擎/role-module-contract.test.ts:290,299,306,371` 使用 `role.dispatch.*` / `role.preflight.*`（角色无关） | 仅测试夹具；不约束模块 | 非阻断；由门禁引擎 owner 在后续契约测试维护时知悉 |
| F4 | **文档/注释口径漂移**：`product/internal/dispatch.ts:37` 写“文案由共享 i18n 渲染；当前为模块登记键，E1 接口评审登记文案”；`product/internal/preflight.ts:42` 写“E1 接口评审时登记文案”；`rapporteur/internal/codes.ts:5` 已写“E1 只登记键名，不新增 shared i18n 条目（与 `role.tools.*` 先例一致）”；nominator 证据 §8 写“E2 前由 shared-code/引擎统一登记” | 不影响运行；可能误导后续维护者 | 非阻断；由各 `*-code` 在各自写集内把注释/证据改为“内部诊断键；E2 评审确认不登记”（本评审记录为共享侧依据） |
| F5 | **pre-existing `role.tools.*` 未登记** | 与六模块同先例 | 非阻断；本评审不改门禁引擎写集 |
| F6 | **`messageKey` 类型为 `string`**，非 `MessageKey` | 消费方无法在类型层直接 translate | 非阻断；当前无人 translate；若未来要呈现，按 §6.2 新建 `main.*` 常量并映射 |
| F7 | **条件式风险：E2 删除旧 dispatch 中文 `message`** | 若不保留 `workflow-preconditions.ts` 或不做规范化登记，客户可见系统行会丢失具体文案 | **条件式阻断**：仅阻断“把 dispatch 硬授权/文案来源切换并删除旧实现”的 E2 步骤；不阻断 E2 启动或其他单元 |
| F8 | **工具 reason 的 `single` 不是错误**（正常模型），若误当用户错误呈现会误导 | 无（当前不呈现） | 记录：tools reason 只进诊断/审计 |

---

## 9. 接口评审记录要点（E0.3 §4.4）

| 项 | 内容 |
| --- | --- |
| 需求方 | 六 `*-code` E1 证据/`api-spec` 遗留项；统筹 dispatch-log E1 剩余问题 2 |
| 目的 | 决定 112 个 `role.*` messageKey 是否登记共享 i18n，及 E2 呈现接线口径 |
| 受影响 public entry | **无**（i18n 目录/`MessageKey`/`translate`/`createTranslator` 均不变；无 shared `index.ts` 伞状入口变更） |
| 消费者影响 | 六角色模块只读字符串；E2 消费方新增“不得 translate `role.*`”约束；无证据失效 |
| 兼容性 | 零变更；现有 1916 key 稳定；既有 `main.*`/`ui.*` 复用 |
| 测试 | 共享 i18n 13 + guard 6 不变；角色/门控/共享套件不受影响；无需重取证据 |
| 迁移/回滚 | N/A（零变更） |
| 结论 | 不登记（B=0）；条件式 B 预案见 §6.2；条件式 dispatch 文案风险见 §7.2 |
| 记录位置 | 本文件（`角色卡/shared-code/docs/change/`）；后续若触发 B，另立提案/评审记录 |

---

## 10. 写集与只读自查

- 本评审只新增本文件；未修改 `src/common/shared/**`、`test/项目管理/shared/**`、任何角色模块/测试/角色卡/边界/文档。
- 清点/计数命令均为只读 grep/Node 直读；未运行会写文件的脚本；未运行真实模型。
- 工作树状态：`角色卡/shared-code/` 整体为未跟踪新目录（E1 产物 + 本文件）；`src/common/shared/**` 相对 HEAD 零 diff；`test/项目管理/shared/**` 零改动。

---

## 11. 后续动作

1. 统筹/E2 单元：按 §7 接线；dispatch 消费切换前先完成 §7.2 的处置记录。
2. 六 `*-code`：在各自 `api-spec.md`/证据/memo 更新“messageKey 为内部诊断键；E2 接口评审确认不登记”的口径（F4），不改键名。
3. shared-code：本记录作为 i18n 侧的接口评审记录；若未来收到 §6.2 触发提案，按 E0 §4.4 评审并更新 `zh-CN.ts`/`en-US.ts`/计数测试/冻结清单。
4. 独立验收/B2：可按本记录核对 E2 的 i18n 零变更与 E2.8 受影响套件。
