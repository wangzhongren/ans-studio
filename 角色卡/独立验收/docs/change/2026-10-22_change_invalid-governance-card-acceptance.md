---
id: change-invalid-governance-card-acceptance
type: change
title: 无效治理确认卡守卫 N1–N5 独立验收——受限通过（E8 按客户决定排除挂起文件）
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: verified
related: [invalid-governance-card-guard, invalid-governance-card-acceptance, invalid-governance-card-guard-change, invalid-governance-card-receipt, change_invalid-governance-card-copy, invalid-governance-card-verify, govern-target-strict-card-fixture-20261022]
events:
  - date: "2026-10-22"
    kind: verified
    summary: 按 A1 对冻结候选 HEAD 4d944e75+工作树逐条判定；N1–N5、S1–S9、F1–F12、E1–E8 满足（E8 按客户决定排除挂起文件，9 个既有 symlink EPERM 基线红已逐条分类；F2 尾连字符的设计文字与同段正则冲突，列为未决交项目管理/客户）；总体 pass（受限）；真机/真实模型/桌面 UI 镜像排队/非 Windows/应用重启/O1–O7 未判
---

# 无效治理确认卡守卫 N1–N5 独立验收：受限通过

**标准**：[无效治理确认卡守卫 N1–N5 验收标准 A1](../design/2026-10-22_design_invalid-governance-card-acceptance.md)，version A1，`status: ready`，本角色复算 SHA-256 `cc2c1fbf7c365d436a2ada6046200af6c7577b339d98715dcffb712a7f0fdbba`。本报告按该文件的 S1–S9、F1–F12、E1–E8 逐条判断，不另造标准。

**设计**：[无效治理确认卡的应用侧守卫](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)，`status: accepted`、`revision: 1`，SHA-256 `51fc3e34ac50e209c78c42b54b12c0a7a55965876c9c8fde138b8896ed708458`，与 A1 §一及客户 2026-10-22 决定一致。

**候选**：HEAD `4d944e7587f10be29b6356c42539e06219ed88fc`（未提交、未切分支）+ 未提交工作树；冻结清单 `角色卡/测试/docs/change/2026-10-22-verify-evidence/candidate.txt`，captured `2026-10-22T14:43:44+08:00`。环境：Windows 11 Pro 10.0.26300、Git Bash、Node v24.22.1、npm 11.19.1。

**总体结论：通过（pass，受限）**——N1–N5 交付齐全且归属正确；S1–S9、F1–F12 满足（F2 的「尾连字符」子项按设计同段明确的「格式=正则」口径通过；该文字与设计 §4.3/A1 F2 的「尾连字符非法」表述冲突，作为未决口径列于 §7.3，需项目管理/客户澄清）；E1–E8 必要证据完整并绑定当前冻结候选（E8 按客户决定口径）；未发现本改动引入的失败。**受限范围**：E8 按客户明确决定排除 `test/pi-adapter/write-sequencing.test.ts`（挂起，行为未验证）；全量基线仍有 9 个既有 Windows symlink `EPERM` 环境红（逐条分类、不计为通过）；真机/真实模型/桌面 UI 镜像排队/非 Windows/应用重启/O1–O7 未判（§七）。**不能据此声称「全量全绿」或「真机通过」。**

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色未修改产品代码、测试、断言、他人报告、权限或调度状态，未提交 Git；判定期间未改动冻结候选（仅新增本报告）。

## 一、候选身份与证据绑定

### 1.1 冻结清单核对

| 项 | 值 | 核对结果 |
| --- | --- | --- |
| HEAD | `4d944e7587f10be29b6356c42539e06219ed88fc` | 与 `candidate.txt` 一致 |
| 工作树清单 | `git status --porcelain`（core.quotepath=false） | 与冻结清单逐行一致（51 行；仅提取比对时多一空行），判定期间无改动 |
| 测试角色文件摘要 | 见 §1.2 | 与 `candidate.txt` 记录的 5 个测试角色文件 SHA-256 全部一致 |
| 装配夹具摘要 | `test/装配/govern-target.test.ts` = `7258f742…` | 与 `candidate.txt` 一致 |
| 候选捕获 / 本角色复核 | 14:43:44 / 14:49:42 | 本角色复核时清单与摘要未变 |
| 证据绑定 | 测试报告、原始日志、三份实现变更记录 | 均引用同一 HEAD 与工作树；报告明确候选冻结后不再改动 |

本角色在判定时独立执行了 `npm run typecheck` 与四套关键测试（§五 E4/E3），运行后再次逐行比对工作树，未发现变化。任何后续产品/测试/配置改动都会使本报告证据失效，需在新候选上重跑受影响门。

### 1.2 关键文件摘要（本角色独立计算）

```text
f3ea4e151c4cef973a8d2c64a22bfa61825c8abb04ad18c55921b96c6ce2a1e3  src/common/门禁引擎/governance-roles.ts
867d6b03f8538497f30daf32cc690ca431c225a3bc088f54df59d98ef2a88345  src/model/runtime.ts
39c520d2374721da77dc11d1586f3309268f88d63ad28398cd07bcde4c1933d5  src/pipeline/orchestration/run-role.ts
ccc41388f0976f1bad31602871eb59eb6d07f3093c7660cd83fe96fcbe3b529d  src/provider/runtime/schema.ts
464c5a4a73b7a5d3fc8d2882e137d1d3ba496975ee8f0ab3c15f3f860ef4da63  src/provider/runtime/tools.ts
76a665bdc3952a94d9b45f2a71d2b1d52b1db1ad6397d2710f498886770559b2  src/service/runtime/session.ts
0f76ee61e65bec2da5c047c3c8d2133856c4af18da1f8bec5838bb0e46cf8f5d  test/编排/governance-judge.test.ts
c73f9586dfb03138109cab64c6935194f3bfb21949b8ed2a064ba6be8395c809  test/编排/governance-session.test.ts
117e30ed00124b6146fd00e585a743a7bec45eb532e1b0e51da2554996d8fe6a  test/runtime-core/governance-flow-metadata.test.ts
907826dff57be92a9b5b1efce362f4906b6610a8923561cf6975f6a4103d0c78  test/门禁引擎/governance-trio.test.ts
ed8155833f51beca3cf4a9bc56c33328b766c5cb2e8df9d85978baeaf0c1eb89  test/测试/governance-e2e-auto/fixture.ts
82f1cde53ae9c4b9f0bfec451acaf42f9da7cc039c35191a320945317d2922f1  test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts
7258f7429df583675cc224ad2c9cc32cd3dea15e18d0a8eba65651a65d48ab61  test/装配/govern-target.test.ts
```

### 1.3 证据来源与版本

| 来源 | 版本 / 摘要 | 本角色核对方式 |
| --- | --- | --- |
| A1 标准 | `cc2c1fbf…` | 逐条对照；判据未修订 |
| 项目管理设计 | `51fc3e34…`、accepted、revision 1 | 复算一致；§4.5–§4.6/§6/§7.3/§九/§十逐节对照 |
| 编排变更 | `69fecba4…`、`implemented-unverified` | 逐节阅读；代码位置、命令、未验证项 |
| 运行时核心变更 | `2797478b…`、`implemented-pending-verification` | 逐节阅读；N2–N4 与未验证项 |
| 门禁引擎变更 | `99be04b2…`、`implemented` | 逐节阅读；五卡文本与测试 |
| 装配夹具适配 | `5565c101…`、`verified` | 只改 `test/装配/govern-target.test.ts`；最终 E8 通过 |
| 测试角色报告 | `847bfadc…`、`verified-in-scope` | 逐节阅读；候选、命令、T15–T17、E8 限制与未覆盖项 |
| 测试原始证据 | `2026-10-22-verify-evidence/` | 逐份读取本报告引用的日志与清单；关键计数与退出码核对 |
| 本角色独立复核 | typecheck + 四套关键测试 | §五 E3/E4，全部绑定本候选并通过 |

## 二、交付与范围核对

### 2.1 N1–N5 交付物

| 编号 | 实际落点与行为 | 结论 |
| --- | --- | --- |
| **N1** | `src/pipeline/orchestration/run-role.ts::governedInput`：`isTrio && kind==="confirm"` 时按「缺 cardKind → 越权 cardKind → 缺/非法 flowId → 既有 preview/YAML 闸 → judgeContext」顺序判定；新拒绝返回 `declined + notPresented:true`，写 `governance.card.rejected`；`defaultGovernanceConfirmCardKind` 已不存在；`defaultGovernanceChoiceCardKind` 保留（choice 分支） | 满足 |
| **N2** | `src/model/runtime.ts` 的 `CustomerInputOutcome` `declined` 变体新增可选 `notPresented?: true`（L322）；`CustomerInputRequest` 未变 | 满足 |
| **N3** | `src/provider/runtime/tools.ts` 新增 `cardNotPresented`（L1176），`makeRequestConfirmationTool` 在 `out.notPresented === true` 时先走该分支（L1333）；常规 `declined` 走原 `notConsented` 文案 | 满足 |
| **N4** | `src/provider/runtime/schema.ts` 的 `request_confirmation` 工具说明与 `flowId`/`cardKind` 描述明确「五个内置治理角色必须同时携带；缺失不发卡；普通角色与 single/su 可选；旧调用可用」；字段形状/`required`/枚举未变 | 满足 |
| **N5** | `src/common/门禁引擎/governance-roles.ts` 五张角色卡的「治理卡参数纪律」统一为「本次不发卡、不生成客户卡、未向客户呈现、直接退回并提示补齐重发」；`nominator` 卡中关于任命物证门槛的「回落手动」语句属另一语义，保留 | 满足 |

### 2.2 O1–O7 排除核对

| 编号 | 核对结果 |
| --- | --- |
| O1 | `request_choice` 未新增缺字段拒绝；`defaultGovernanceChoiceCardKind` 仍在（`run-role.ts` L749/L1847）；T17g 与既有 choice 测试通过 |
| O2 | confirm 卡机械兜底已删除；缺 `cardKind` 的案例（含此前可按路径推断的路径）在单测中均被拒（`rawCalls=0`） |
| O3 | `app/desktop/customer-input.ts`、`session.ts`、`interface.ts`、`operator-channel.ts` 零 diff（`git status` 未出现） |
| O4 | preview 完整性、Flow YAML、越权 `cardKind` 三条既有拒绝的文案与 `declined` 形状未变；越权路径不设 `notPresented`（T6 断言 `declined`，代码 L808–L819 无该字段） |
| O5 | `app/renderer/` 零 diff |
| O6 | 无新增桌面事件/呈现面；拒绝只经工具回执 |
| O7 | 守卫不读盘校验 `flowId` 存在性；T4 用 `flowId="flow-a"`（盘上未预置）通过并生成 `judgeContext`；`schedule-write` 创建流程场景正常 |

### 2.3 受保护零 diff 与改动归属

- 本角色核对 `git status --porcelain`：`app/**`、三适配器（`src/provider/claude/session.ts`、`src/provider/codex/session.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/real-adapter.ts`）、`src/common/shared/diagnostics.ts` 均未出现改动；`git diff --stat -- src/common/shared/diagnostics.ts` 为空。
- N1–N5 产品改动落在：编排 `src/pipeline/orchestration/run-role.ts`；运行时核心 `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`；门禁引擎 `src/common/门禁引擎/governance-roles.ts`。分别属于各角色 `boundary.md` Section 1。
- N1–N5 测试/文档落在：编排 `test/编排/`；运行时核心 `test/runtime-core/`；门禁引擎 `test/门禁引擎/`；测试角色 `test/测试/governance-e2e-auto/` 与报告/证据；装配 `test/装配/` 与变更记录。均在各自 Section 1 内。
- **共用文件归属**：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`src/service/runtime/session.ts` 同时含后台任务在途改动；guard/回执/schema 的 hunk 由本次三份变更记录界定，`service/runtime/session.ts` 不属于 N1–N5（归后台任务）。`test/runtime-core/tools.test.ts` 的 Windows junction 适配由后台任务变更记录（§改动表）明确归属，属测试环境适配，断言未放宽。
- **装配夹具适配**：`test/装配/govern-target.test.ts` 只改测试脚本（补 `flowId="demo"`、`cardKind="write"` 并加强到达通道与 `judgeContext` 断言），未改产品；设计 §6.2 未列装配，属测试影响缺口，装配变更记录已说明。该用例在最终 E8-B 中通过（日志 L4505）。
- 未发现 O1–O7 实现，未发现越权路径（除上述已归属的共用文件 hunk 与测试环境适配）。

## 三、成功标准 S1–S9

| 标准 | 结论 | 关键证据 |
| --- | --- | --- |
| **S1** 缺字段治理 confirm 在 raw 前被拒且六零 | **通过** | 单测「缺 cardKind」（4 个案例：convener×2、rapporteur、nominator，含此前可兜底路径）、「缺/非法 flowId（T1/T3/T9，5 个案例）」：`rawCalls=0`、`assertNotPresented`、账本无 `customer.decision`；E2E T15：`rawCustomerInputs=0`、`presented=0`、`nextIdCalls=0`、`pending/queued/judging/replay=0`、`pendingRoles=0`、`judgeInvocations=0`、`governance-judge.started` 诊断 0 行、`judgeRows=0`、后续 `write_file` 以 F4 拒绝且文件不存在、账本无决定 |
| **S2** 回执如实 | **通过** | E2E T15 断言含「治理确认卡未发出」「未向客户呈现」「缺少合法的 flowId」「本角色允许：write / schedule-write」「本次未发行任何写入路径、未写入账本」「请补齐后重新调用」，且 `doesNotMatch /未获客户同意/`；运行时核心 T12 断言常规 `declined` 文案逐字不变、`request_choice` 即使带 `notPresented` 也不变 |
| **S3** 补齐重发正常判断与代批 | **通过** | 单测 T10：第一张拒绝后第二张到达通道（`rawCalls=1`）且 `judgeContext.flowId="flow-a"`；E2E T16：两次回执（先 `ok:false` 后 `ok:true`）、`raw=1`、`nextId=1`、`presented=0`、判断 1 次、结果行 1 条、文件落盘、账本恰 1 条 `customer.decision`、`decisionEvidence.kind="judge"`、路径入账 |
| **S4** 四个可发 confirm 角色仍可用 | **通过** | 单测 T4：`rapporteur/write`、`nominator/write`+`appointment-write`、`convener/write`+`schedule-write`、`verifier/write` 全部到达通道，`judgeContext.flowId` 正确，`stepId` 缺席仍合法；E2E T17a–c 通过 |
| **S5** `liaison` confirm 一律拒绝 | **通过** | 单测 T5（缺 `cardKind`、显式 `intent-confirm` 等路径均 `declined`、`rawCalls=0`）；E2E T17d（缺 `cardKind` ⇒ `notPresented`+「本角色允许：无」；显式 `cardKind=write` ⇒ 既有越权文案、`raw=0`/`presented=0`/`nextId=0`/无账本）；需求确认仍走 `request_choice` 的 `intent-confirm` |
| **S6** schema 描述更新且旧调用被接受 | **通过** | 运行时核心 T13：工具说明与 `flowId`/`cardKind` 描述含「必须同时携带」「缺失不发卡」；`required`/枚举未变；旧调用 `ok:true`、请求/metadata 不凭空出现字段 |
| **S7** 五张角色卡文本更新 | **通过** | 门禁引擎 T14 逐字断言五卡新句恰出现一次，反向断言不再出现「会被当作旧卡」「判断 agent 不介入并回落手动」；`nominator` 的物证门槛句不属于参数纪律、未被误改 |
| **S8** `notPresented` 向后兼容 | **通过** | 字段可选、`CustomerInputRequest` 未变；T12 常规 `declined` 与 `request_choice` 文案逐字不变；`app/` 零 diff；无迁移 |
| **S9** 合法卡与既有治理语义零变化 | **通过** | E2E T17a–g 全部通过；`governance-e2e-auto` 全套 53/53（既有 44 + 新增 9）；最终 E8-B 中 T16、T17 与 `govern-target` 均通过；镜像/下一步/回放沿用既有逻辑，队列唯一变化是无效卡不占位 |

## 四、失败与边界 F1–F12

> 本文件的 F 编号只用于 A1；设计 §7.3 的 T 编号另有含义；仓库既有「F4 写前拦截」是产品内闸门名称。

| 标准 | 结论 | 关键证据与说明 |
| --- | --- | --- |
| **F1** 缺字段矩阵 | **通过** | 只缺 `flowId`、只缺 `cardKind`（含可兜底路径）、两者都缺、非法 `flowId`（大写/空串/单字符）均有单测且 `rawCalls=0`；两者都缺时合并列出两项、说明句不重复（T1/T3/T9）。`flowId` 缺失但 `stepId` 存在未设专测，但同一 `isGovernanceFlowId(flowId)` 分支与 Provider 的 `stepId` 独立校验已覆盖该组合的判定来源（非阻断残差，§七） |
| **F2** 非法 `flowId` 格式 | **通过（按设计明确的格式=正则；尾连字符存在设计文字冲突，见 §7.3）** | 大写/空串/单字符由 T9 覆盖；实现共用 `^[a-z0-9][a-z0-9-]{1,63}$`（`GOVERNANCE_SLUG_PATTERN`/`isGovernanceFlowId`，单点 schema 断言）；Provider 另有 `Bad Slug`、下划线 `stepId`、非字符串等既有非法形状测试；首连字符、下划线、65+ 超长由同一正则拒绝；**尾连字符（如 `flow-`）按该正则实际被允许**，与设计 §4.3/A1 F2 的「尾连字符非法」文字不一致（§7.3，交项目管理/客户澄清） |
| **F3** 越权 `cardKind` 与既有口径 | **通过** | T6：`rapporteur + schedule-write` 沿用「不允许 cardKind=…；允许：…。本次未向客户发卡。」`rawCalls=0`；工具级枚举外由 Provider 既有校验拒绝（运行时核心 `cardKind-choice` 用例断言通道零新增调用）；越权路径不要求也不设置 `notPresented`（O4 未授权）。直接包装器的 choice 卡种边界见 §7.2.7 |
| **F4** 重复拒绝幂等、无持久状态 | **通过** | T10 证明拒绝不留去重状态（第二张合法卡到达通道）；`governance-session.test.ts` 连续两张无效卡均 `declined`、`rawCalls=0`；守卫为纯前置校验、无 requestId/pending/queued/账本/写集；工具 sequential。未设「同一无效卡逐字重复两次」专测，但无去重/无状态已由上述等价断言动态覆盖（非阻断残差） |
| **F5** 拒绝后写集未发行 | **通过** | T11：无效卡后 `gate("docs/workflow.md").allowed=false`，原因含「不在任务 writeSet 内（F4）」；E2E T15 同轮 `write_file` 被 F4 拒、文件不存在 |
| **F6** 普通项目角色零变化 | **通过** | T7：项目角色 confirm 原样到达（`rawCalls=1`、`judgeContext` 未注入、无凭空字段）；E2E T17e：真实 `openRoleSession` 手批后写盘成功 |
| **F7** `single`/`su` 零变化、角色身份优先 | **通过** | T8/T17f：`single/su` 旧卡呈现、判断零介入、手批成功；`governanceRoleOf("su")===undefined`；五个治理角色的注册表身份有单测（`governanceRoleOf(spec.id)?.id===spec.id`），守卫判据 `isTrio = governanceRoleOf(setup.role.id) !== undefined` 与 `governanceModel` 无关。未设「single 项目 + 治理角色」专测，属包装器/注册表层组合证据（非阻断残差，§七） |
| **F8** choice 兜底与路径不变 | **通过** | `defaultGovernanceChoiceCardKind` 保留；E2E T17g（liaison choice 缺 cardKind ⇒ `intent-confirm` 兜底并代批）；运行时 T12 的 `request_choice declined` 文案逐字不变；既有 choice 用例通过 |
| **F9** 诊断白名单、不扩 `FIELD_NAMES` | **通过** | `run-role.ts` 拒绝处仅记录 `{ state:"not-presented", reasonCode, ok:false }`；`reasonCode` 为 `missing-card-kind`/`missing-flow-id`/`missing-card-kind-and-flow-id`/`role-not-allowed`；未记录 `flowId`/`cardKind`；`diagnostics.ts` 零 diff。属静态+零 diff 证据，未设事件字段动态断言（非阻断残差） |
| **F10** 既有呈现前闸不变 | **通过** | preview 完整性、Flow YAML、越权 `cardKind` 的拒绝条件/文案/形状未改（代码路径与既有测试）；E8 全量中相关既有测试通过 |
| **F11** 不做存在性校验 | **通过** | T4 的 `flowId="flow-a"` 未在盘上预置仍到达通道并生成 `judgeContext`；`schedule-write` 创建流程用例通过；守卫代码无读盘调用 |
| **F12** 全仓 typecheck 0 | **通过** | 测试角色记录 `npm run typecheck` exit 0（`typecheck-final.log`）；本角色在同一冻结候选独立复跑：Node v24.22.1 / npm 11.19.1，`tsc --noEmit` **exit 0**（§五 E4）；测试角色旧的 3 个 E2E 类型错误已在其边界内修复，未删测试/未放宽断言 |

## 五、必需证据 E1–E8

| 证据 | 结论 | 核对结果 |
| --- | --- | --- |
| **E1** 角色变更记录 | **通过** | 编排、运行时核心、门禁引擎三份变更记录存在；写明用户可见变化、代码位置、实际命令与结果、未验证项；状态与事实相符（编排 `implemented-unverified`、运行时核心 `implemented-pending-verification`、门禁 `implemented`） |
| **E2** 测试角色报告与原始输出 | **通过** | [测试报告](../../../测试/docs/change/2026-10-22_change_invalid-governance-card-verify.md) 存在，含候选/环境/命令/退出码/T15–T17 映射/缺失项；T15 直接断言诊断 `governance-judge.started` 0 行、T16 正对照两组件各 1 行；T16 首轮全量失败为测试屏障缺陷（旧屏障行导致提前读取），已改为唯一 `test.barrier.<seq>` 并等待精确落盘，修复后单跑 9/9、最终 E8 通过；属测试同步修正，未放宽产品断言 |
| **E3** 三个定向套件 | **通过** | 原始日志：编排 77/77、runtime-core 9/9、门禁 33/33；本角色在同一冻结候选独立复跑，结果同上（exit 0）；最终 E8-B 日志中对应测试名均 `✔`（T1–T11：L3451–L3458、L3470；T12/T13：L606/L609；T14：L5298），无失败 |
| **E4** 全仓 typecheck | **通过** | 报告记录 exit 0；本角色独立复跑 `npm run typecheck` → exit 0；覆盖测试角色 E2E 修复后的完整工作树 |
| **E5** 改动路径与 Section 1 归属 | **通过（含说明）** | 完整 `git status --porcelain`（除本报告这一判定产物外）与冻结清单一致；N1–N5、测试、文档逐条归属到各角色 Section 1；受保护零 diff；后台任务共用文件与 `tools.test.ts` junction 适配已由后台任务记录归属；装配夹具适配为测试-only 预期更新。未发现 O1–O7 或越权产品改动 |
| **E6** 候选身份与环境 | **通过** | HEAD 完整 SHA、冻结时工作树 51 行清单、测试角色/装配文件 SHA-256 与 `candidate.txt` 一致；Node/npm/OS 记录完整；本角色在判定时复核未变；所有证据绑定同一候选 |
| **E7** 方案与标准版本 | **通过** | 设计 accepted/revision 1/SHA `51fc3e34…`；A1 `cc2c1fbf…`；三份变更记录与测试报告摘要均在报告中引用 |
| **E8** 全量测试基线与既有红 | **通过（受限，见 §六）** | E8-A 因 `test/pi-adapter/write-sequencing.test.ts` 挂起被客户决定终止：463 pass / 4 fail / 2 skip，无结束摘要，**不是通过**；E8-B 按客户决定排除该文件后跑 342 个文件：**3377 tests / 3350 pass / 9 fail / 18 skip / 0 cancelled，exit 1**；9 个失败均为既有 Windows symlink `EPERM`，逐条文件:行与错误文本见 `e8-failure-classification.txt`，相关文件未被本改动触碰；T16 与装配适配后的 `govern-target` 在最终运行中 `✔` 通过。**不是全绿基线；不计为全量通过** |

E8-B 的 9 个既有环境红（逐条）：

```text
test/claude-adapter/session.test.ts:637
test/codex-adapter/session.test.ts:351
test/pi-adapter/injected-runtime.test.ts:185
test/pi-adapter/injected-runtime.test.ts:193
test/runtime-core/file-write-safety.test.ts:97
test/runtime-core/session-store.test.ts:46
test/runtime-core/session-store.test.ts:58
test/测试/g4-skill-verify/b-render-double-check.test.ts:182
test/编排/shell-authorized-routine.test.ts:103
```

均为 `EPERM: operation not permitted, symlink`；编排与运行时核心的既有变更记录也分别登记过同一环境红，可作为「非本改动引入」的独立佐证。

## 六、E8 专项判断：为何是「可记录的受限通过」

A1 E8 要求：全量运行、记录计数与失败清单、既有环境红指名并附证据、不得把既有失败算作通过、不得把本改动引入的失败归为基线红；未运行或无法区分基线红才是证据不足。逐条对照：

1. **已实际运行**：E8-B 在最终候选上实际执行 342 个文件，有命令、时间、文件清单、退出码与完整日志；不是「未运行」。
2. **基线红可区分**：9 个失败逐条给出文件:行、测试名、`EPERM symlink` 错误；失败发生在符号链接创建阶段，相关文件均未被本次改动触碰；两份既有变更记录独立登记过其中的环境红。没有把本改动引入的失败归为基线红（本改动相关测试无失败）。
3. **客户决定排除挂起文件**：`test/pi-adapter/write-sequencing.test.ts` 因 39+ 分钟无进展被客户明确决定排除；E8-A 的终止记录（463/4/2、无结束摘要）如实保留为 blocked，不冒充通过。该文件属适配器写序测试，三适配器本轮零 diff，且不在 N1–N5 改动面。**本角色不替客户补批准**：该文件的行为明确为**未验证**，并排除在通过范围之外。
4. **不是「全绿」**：本报告不声称全量通过；9 个既有环境红与 1 个排除文件均列为限制。

因此，按 A1 对「已运行且基线红可区分」的定义，E8 在本候选上构成**可记录的受限通过**；若客户要求「包含 write-sequencing 的全量全绿」，该项仍未满足，需另行安排（不属于本报告的评价范围）。

## 七、未判范围与非阻断残差

### 7.1 本轮不判（不扩大通过范围）

1. **真机复验（设计 §九.7）**：真实桌面/CLI + 真实模型/凭据下「无效卡不出现、无 `governance-judge.started`、角色收到可操作错误并能补齐重发；合法卡仍按开关代批」——未执行；需客户另行安排。
2. **真实模型行为**：模型是否按新 schema/角色卡文本补齐字段并重发，未验证；脚本化模型不能代替。
3. **桌面 UI 镜像/排队呈现**：夹具中 `presented=0`、pending/queued=0，渲染层镜像行结构性不可达；未做 UI 级断言（协调方明确本轮不含桌面 UI 镜像/排队）。
4. **非 Windows 平台**：通过结论只覆盖实际记录平台 Windows 11。
5. **应用重启后的真机复验**：未判；守卫无持久状态，但重启场景属真机阶段。
6. **O1–O7**：未授权、未实施、未判；若后续发现实施，按范围越权处理。
7. **`test/pi-adapter/write-sequencing.test.ts` 行为**：按客户决定排除，未验证。

### 7.2 非阻断残差（已记录，不影响本次通过）

1. F1 的「缺 flowId 但 stepId 存在」组合未设专门用例；F2 的下划线/首连字符/超长等由同一正则与 Provider 既有测试覆盖，未逐格式设用例；判定来源共用同一 `flowId` 正则与 Provider/守卫分支，属边界变体，非关键场景缺口。尾连字符另见 §7.3。
2. F4 未设「同一无效卡逐字重复两次」专测；T10（拒绝后重发到达、无去重）与 session 测试（连续两张无效卡均拒绝、raw 0）已动态断言无状态性。
3. F7.2「single 项目 + 治理角色」未设独立场景用例；`governanceRoleOf` 五角色/su 单测与 `isTrio = governanceRoleOf(setup.role.id) !== undefined`（与 `governanceModel` 无关）构成包装器层结构证据；建议后续补一条小用例以完全闭合。
4. F9 的 `governance.card.rejected` 字段未做诊断事件动态断言；以代码调用点 + `diagnostics.ts` 零 diff 核对，满足「不扩白名单/不记录 flowId/cardKind」的静态约束。
5. 18 个 skip 未逐条列出；关键四套件均 0 skip，新用例 0 skip；全量 skip 清单如后续需要可另行补证。
6. 测试角色对 `test/测试/background-tasks-e2e-real-model/*.ts` 的 3 个类型错误修复为类型标注 + 等价 handback 跳过，属类型层修正；这些脚本本轮未执行（需真实凭据），其真实模型结果不在本报告范围。
7. **直接包装器的 choice 卡种边界（层级说明）**：`TRIO_CARD_KINDS` 是 confirm/choice 并集（如 rapporteur 为 `proposal` + `write`）。产品工具路径上，Provider 的 `request_confirmation` 枚举先拒绝 `proposal` 等 choice 卡种（运行时核心 `cardKind-choice` 测试断言通道零新增调用），模型不可触达；但若直接调用编排包装器并给 `kind:"confirm", cardKind:"proposal"`，当前 `allowed.includes` 会放行（`confirmCardKindsOf` 仅用于错误文案，未用于该检查）。设计 §4.2 的「同时属于工具枚举」目前由 Provider + wrapper 两层共同满足；若要求 wrapper 自身也收窄到确认枚举，可后续把检查换成 `confirmCardKindsOf(...).includes`，属防御纵深增强，不改变本报告的产品路径结论。

### 7.3 设计与 A1 的文字冲突：尾连字符（未决，交项目管理/客户）

- 设计 §4.3 把格式定义为 `^[a-z0-9][a-z0-9-]{1,63}$`（与 Model `GOVERNANCE_SLUG_PATTERN`、编排 `isGovernanceFlowId` 同值），同段又说「大小写、下划线、**首尾连字符**、单字符、超长一律非法」。A1 F2 沿用了「首尾连字符」的表述。
- **实现与实测按正则**：本角色在冻结候选用 Node v24.22.1 实测该正则——`"flow-"`、`"a-"` 匹配为 **true（允许）**；`"-flow"`、`"a_b"`、`"Flow-A"`、单字符、65 字符为 false。`GOVERNANCE_SLUG_PATTERN` 与 `GOVERNANCE_FLOW_ID_RE` 均为同一字符串，`stepId`/`intentId` 等也共用该常量（运行时核心 T13 断言 schema `pattern` 与该常量相等）。
- **判断**：按设计同段明确的「格式=正则」，F2 的其余子项（大写/空串/单字符/下划线/首连字符/超长/非法字符）均被拒绝，尾连字符被允许；但**尾连字符子项不能同时满足设计与 A1 的文字表述**。这是**设计/A1 内部文字不一致**，不是本次 N1–N5 产品实现的运行时缺陷；本角色不自行决定修改共享常量，也不擅自把标准文字改成允许。
- **交回**：请项目管理（必要时客户）确认采用哪种口径：①**正则为准**——更正设计 §4.3 与 A1 F2 的文字（尾连字符允许）；②**文字为准**——需变更 `GOVERNANCE_SLUG_PATTERN` 及受影响的 `flowId`/`stepId`/`intentId` 工具与测试，属新的共享 Model 变更，不属当前 N1–N5 范围，需另行授权。在澄清前，本报告**不声称「尾连字符非法」已被满足**；本次 pass 只覆盖正则定义的行为。

## 八、结论与限制

- **总体结论：通过（pass，受限）**。N1–N5 交付齐全且落在各角色 Section 1；S1–S9、F1–F12 满足（F2 的尾连字符子项按设计同段「格式=正则」口径，文字冲突见 §7.3）；E1–E8 证据完整并绑定冻结候选（E8 按客户决定口径）；本角色独立复核 `npm run typecheck` exit 0，四套关键测试 77/77、9/9、33/33、9/9 全部 exit 0。
- **通过范围**：Windows 11 Pro（10.0.26300）、Node v24.22.1、脚本化模型/判断桩、真实产品 `openRoleSession`/write gate/确认写集发行器/客户通道/桌面 Interface 的跨角色路径；E8-B 342 文件、3377 例（排除客户决定的 write-sequencing）。
- **明确不在通过范围**：真机与真实模型/凭据、桌面 UI 镜像/排队呈现、非 Windows、应用重启、O1–O7、`write-sequencing` 行为；9 个既有 symlink `EPERM` 环境红不计为通过，也不声称全量全绿。
- **未决口径（§7.3）**：设计 §4.3/A1 F2 的「尾连字符非法」文字与同段正则不一致；当前实现按正则允许 `flow-`/`a-`。本报告按设计明确的「格式=正则」判定；若项目管理/客户确认文字口径，需另行变更共享 `GOVERNANCE_SLUG_PATTERN` 及受影响工具/测试，当前候选不满足该文字口径。
- **权限**：验收通过不授予提交、推送、合并、部署、发布或对外操作；发布决定属客户。候选在判定期间未改动；后续任何产品/测试/配置变化将使本报告证据失效，需在新候选上重跑受影响门。
- **后续**：先澄清 §7.3 的尾连字符口径；若需闭合 §7.2 的残差（尤其 F7.2 的 single+治理角色专测、F4 的逐字重复用例），建议另开小批补证。上述事项不影响本次 N1–N5 按正则口径的受限通过结论。

## 九、相关链接

- 验收标准：[无效治理确认卡守卫 N1–N5 验收标准 A1](../design/2026-10-22_design_invalid-governance-card-acceptance.md)
- 设计（项目管理）：[无效治理确认卡的应用侧守卫](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)
- 实现变更：[编排 N1](../../../编排/docs/change/2026-10-22_change_invalid-governance-card-guard.md)、[运行时核心 N2–N4](../../../运行时核心/docs/change/2026-10-22_change_invalid-governance-card-receipt.md)、[门禁引擎 N5](../../../门禁引擎/docs/change/2026-10-22_change_invalid-governance-card-copy.md)、[装配夹具适配](../../../装配/docs/change/2026-10-22_change_govern-target-strict-card-fixture.md)
- 测试报告与证据：[测试报告](../../../测试/docs/change/2026-10-22_change_invalid-governance-card-verify.md)、[原始证据目录](../../../测试/docs/change/2026-10-22-verify-evidence/)
- 同候选的上一份独立验收（后台任务，另一任务范围）：[后台任务 B1–B4 独立验收](2026-10-22_change_background-tasks-acceptance.md)
