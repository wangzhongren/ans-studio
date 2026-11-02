---
id: acceptance-return-card-a4-implementation
type: change
title: 验收回交卡 A4 实施记录：桌面展示载荷 + SessionManager 测试
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: implemented-unverified
related: [acceptance-return-card]
events:
  - date: "2026-11-02"
    kind: created
    summary: 按 P1 审核与 A4 写集实施 session/customer-input 展示载荷与 SessionManager 级新测试；测试/类型检查通过，未验收、未提交
---

# 验收回交卡 A4 实施记录（桌面窗口）

- **任务 ID / flowId**：`2026-11-02-acceptance-return-card` / `acceptance-return-card`
- **角色**：桌面窗口（Desktop Window），独立上下文
- **阶段 / 节点**：团队计划 §5.1 **A4**（P1 审核通过 + H1/B-1 已落地后）
- **日期**：2026-11-02
- **状态**：**`implemented-unverified`**。实现与本层测试/类型检查已完成；**未判验收、未 commit/push、未启动应用、未跑 Electron E2E、未接触客户**。本记录不替代 V1、D1 或独立验收。
- **P1 审核输入**：`角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-P1-review.md`（**168 行 / SHA-256 `8a114aab2d6f1fa61bc7df8a1ef09f81d65afdb17d2990bf78a4ead50ca080d2`**，结论 `recommend approval`）；本人 P1 提案 **426 行 / `8ee94a302e04eab740dcd7353bc7b8e4874363cb93db363ed6cd7c98e172360e`**。
- **P1 条件落实**：**P1-ARC-04 已落实**；P1-ARC-05/06 建议已落实；P1-ARC-03/07/08 属 A3/A5，不在 A4 写集。

## 一、改了什么（先读这段）

应用在呈现验收决定卡前，本来就会读取 `docs/quality/<flowId>-report-v1.md` 供验收判断使用。A4 把这次已经读到的文本再做一次 **16 KiB 安全投影**（`protectText`），放进一个**应用私有、仅展示**的可选字段，随既有客户卡 payload 送到渲染层；报告缺失/不可读/无 flowId/非法 flowId/旧 payload 时字段缺席，卡片仍走 `request.preview` 降级。验收判定、选项、推荐、可作答性、路由、报告持久化、任务账本全部不变。

- `app/desktop/customer-input.ts`：新增 `AcceptanceReportDisplayV1`、`OperatorRequestPayload.acceptanceReport?`、`DesktopCustomerInputFn.ctx.acceptanceReport?`；payload 构造时复制。队列/镜像/过期路径未改。
- `app/desktop/session.ts`：`enrichAcceptanceJudgeContext` 增加本地 flowId slug 校验、16 KiB 投影、诊断与 `{ metadata, display? }` 返回值；`withRequestLifecycle`/`buildCustomerInputContext` 把 display 放进 ctx。
- `test/桌面应用/acceptance-return-card.test.ts`（新增，B-1 已授权）：SessionManager 级覆盖正常/大文件/净化/空/缺失/不可读/无 flowId/非法 flowId/旧 payload/诊断。

## 二、写入基线与候选

### 2.1 HEAD 与工作树

| 项 | 值 |
| --- | --- |
| 分支 / HEAD | `feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9` |
| A4 目标路径状态 | `M app/desktop/customer-input.ts`、`M app/desktop/session.ts`、`?? test/桌面应用/acceptance-return-card.test.ts` |
| 暂存区 | `git diff --cached --name-only` 为空 |
| 并发说明 | 同一 worktree 中 A1/A2/A3 正在写各自的 i18n/渲染/测试路径；A4 未触碰这些路径。`git status -- src app test` 会同时显示并发角色文件，不能据此把整棵树当作 A4 候选 |

### 2.2 逐文件 before / after

| 文件 | before blob（HEAD） | before sha256（提案时工作树） | after blob | after sha256 |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | `0fd043a7627c9be031bc2f83ead1f2b11af96443` | `491bf24f8fa2201454524093e863ae7d01f50c2fde2f0aad612aab288b6b5030` | `10eb2ce55c10845a05ab02b1c08e7e82bd1b78f6` | `73b1f70e0e567c59b6d7f6c684f62a55c3997f624da360b34ef065f605a4c4ce` |
| `app/desktop/customer-input.ts` | `4870b6e949ca23264ea12263e3884db0fe600ca0` | `0cd2513d56361682a582744632deb87936529aed23efc7ca00e5255f487e58f5` | `847ed040f30e510d5fb60dd08201e8ec5ac5033a` | `059f080eb66758ced158c40fccac80f2202b35187b601ddc0ba28c6b07679d2d` |
| `test/桌面应用/acceptance-return-card.test.ts` | 不存在 | — | `6037d807dda104c0ab00a7009f9fe5a5b01a8fb1` | `0c008cc574563a0a60a6f48b392b471b3464e8b6bf6426adc8123749fd62e9b4` |

- 当前行数：`session.ts` 7881、`customer-input.ts` 2067、新测试 468。
- diff 范围（A4 目标路径）：`customer-input.ts` +18/-0；`session.ts` +70/-8；新测试为新增。无 A4 写集外路径。
- `before sha256` 是 P1 提案写盘时对工作树的实测值；`before blob` 是 HEAD 标准 blob（工作树若为 CRLF，`git hash-object` 原始字节哈希可能不同，故并列记录）。

## 三、实现口径

### 3.1 `customer-input.ts`（应用私有 C2）

- 新增 `AcceptanceReportDisplayV1 { version:1; path:string; text:DisplayTextV1 }`；`DisplayTextV1` 只读 type import。
- `OperatorRequestPayload` 增加可选 `acceptanceReport`；`DesktopCustomerInputFn` 的 `ctx` 增加可选同名字段。
- `customerInput` 构造 payload 时：`if (ctx?.acceptanceReport !== undefined) payload.acceptanceReport = ctx.acceptanceReport;`。
- 不把字段放进 `entry.ctx`，不传给 judge/triage；队列/镜像/过期原样保留；旧 payload 不出现该属性。

### 3.2 `session.ts`（C2/C3 + N1/N4）

- `enrichAcceptanceJudgeContext` 新增 `sourceRoleId` 参数与 `{ metadata, display? }` 返回值；`withRequestLifecycle` 接收 `display` 并通过 `buildCustomerInputContext` 放进 ctx。
- **flowId 守卫**：非空检查后、`findActiveRun`/`readIntentEntryFacts`/`loadLatestRoster`/`readTasks` 等读取之前，本地执行 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)`：
  - 合法 slug：现有 facts/artifacts/unavailableReason 计算逐字保留，只增加 display。
  - **非法非空 flowId**：不构造/不读取任何项目路径；返回合成 fail-closed judgeContext（无 `qualityReportPath`、无 `acceptanceReportPath`、无 `artifacts`，含 `unavailableReason: "验收最小链事实缺失：质检报告（flowId 不合法，未读取报告）"`）；记 `flow-id-invalid` 诊断。
  - **缺失 flowId**：沿用旧早退 `{ metadata }`，不构造/不读取/不显示；不重写 metadata。
- **display**：合法 flowId 且 `reportOk`（非空可读）时，复用已有 `reportText`：
  `display = { version:1, path:reportRel, text:createToolDisplayContext({credentialEnvNames}).protectText(reportText,16384) }`。
  `credentialEnvNames` 与现有 `session_tail` 同源：`runtimeOptions.extraCredentialEnvVars + apiKeyEnvVar`。
- **诊断**：`acceptance.card.report.display` 只使用 `diagnostics.ts` 白名单字段 `ok/path/bytes/state/reasonCode`；`state` 编码 `plain/truncated/redacted/truncated+redacted`（`truncated`/`redacted` 不在 `FIELD_NAMES`，直接写会被 `safeFields` 丢弃；未改共享 diagnostics）。`bytes` 为源报告 UTF-8 字节数；不记正文/凭据。
- **投影失败**：catch 后 `display=undefined` 并记 `projection-failed`；不抛出、不影响卡片/判断。
- **P1-ARC-06**：诊断 logger 的 `roleId` 使用 `withRequestLifecycle` 的 `sourceRoleId`（会话绑定身份），不用可选的 `request.sourceRoleId`。

## 四、P1-ARC-04/05/06 落点

| 条件/建议 | 落点 |
| --- | --- |
| **P1-ARC-04（必须）** | 新测试「无 flowId」：metadata 带上游 `judgeContext.facts` 与 `artifacts.proposalPath`；断言 `ctx.acceptanceReport`/payload 缺席、`facts.qualityReportPath`/`artifacts.acceptanceReportPath` 不新增、`docs/quality` 读取数为 0、上游 `proposalPath` 保留、preview 保留、卡可作答。实现保持缺失 flowId 旧早退，不合成 context。 |
| **P1-ARC-05（建议）** | 「旧 payload」明确标为 channel 级（`channel.customerInput` 直接调用），不冒充 SessionManager 级；注释写明需 A2/A3 渲染证据合并。 |
| **P1-ARC-06（建议）** | `enrichAcceptanceJudgeContext(..., sourceRoleId)`；诊断 logger 使用该参数。 |
| P1-ARC-03/07/08 | 属 A3/A5；A4 未实施、未声称。 |

## 五、验证

### 5.1 命令与结果

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | 0 类型错误 |
| 2 | `node --test --test-concurrency=1 test/桌面应用/acceptance-return-card.test.ts test/桌面应用/acceptance-evidence.test.ts test/桌面应用/optional-acceptance.test.ts` | **0** | **19 tests / 19 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo** |

- 新测试文件单独运行：10 tests / 10 pass / 0 fail / 0 skip。
- 既有 `acceptance-evidence.test.ts` + `optional-acceptance.test.ts` 9 tests 全过（B0 基线 9/9），无删测/新增 skip/放松断言。
- 环境：Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300（MINGW64）；命令在 worktree 根执行。
- 未运行 Electron E2E；D1 需实际执行并记录 `E2E_PASS`/原始输出/截图（至多）或可复核不可用原因。

### 5.2 测试覆盖与断言要点

| 用例 | 断言 |
| --- | --- |
| 正常文件 | `ctx.acceptanceReport` 与 presenter payload 的 `{version:1,path,text}` 一致；`metadata.judgeContext.facts.qualityReportPath`/`artifacts.acceptanceReportPath` 存在；`payload.request` 与输入深度相等（options/recommended/preview）；作答 `accept` 得 answered；原文件 sha256 不变；`request.created` 无 `acceptanceReport`、任务账本无报告 marker；读 spy 证明复用了已有 docs/quality 读取 |
| >16 KiB | `Buffer.byteLength(text,"utf8") <= 16384`；`truncated===true`；`redacted===false`；payload/ctx 一致；原文件 sha256 不变 |
| 净化 | 测试专用 env 伪凭据被替换、明文不在 payload、`redacted===true`、`[REDACTED]` 出现；原文件不变；env 在 finally 恢复 |
| 空/缺失/不可读 | 三种均无 `acceptanceReport` 属性、不抛错、preview 保留、卡可作答；不可读用「报告路径为目录」触发 EISDIR |
| 无 flowId（P1-ARC-04） | 见 §四；读 spy 断言 `docs/quality` 读取数为 0；上游 facts/artifacts 不被重写 |
| 非法 flowId | 项目外 sentinel 未被读取；无 `acceptanceReport`；`facts.qualityReportPath`/`artifacts` 缺失；`unavailableReason` fail-closed；preview/options/作答不变 |
| 旧 payload（channel 级） | 无 `acceptanceReport` 属性；preview 保留；卡可作答 |
| 诊断 | 日志含 `acceptance.card.report.display` 与 `"state":"plain"`；不含报告 marker/伪凭据 |

## 六、证据

证据目录：`角色卡/桌面窗口/docs/change/2026-11-02_acceptance-return-card-A4-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `00-baseline.txt` | 29 | `56779f9ade06eb4bcfc88ea04e335ced7228c941e6a2ae4a6bd888325c31b9e1` |
| `01-typecheck.log` | 9 | `0b6d271f14f9f9b9a3bf2004ae8f3de3ae14e8f38503f402bb7225ca1e4e2952` |
| `02-tests.log` | 32 | `a807f6b44c5e6055b1fc75235920aa883c91694022976b8b84a185ce2cecce0f` |
| `03-after-hashes.txt` | 39 | `542b444f26d51aaa6ec7cd1d5a09338b6b727d0637f5461cc643e1b6fb198e1f` |

## 七、边界、未做与开放点

- **只写 A4 写集**：`app/desktop/session.ts`、`app/desktop/customer-input.ts`、`test/桌面应用/acceptance-return-card.test.ts` + 本记录/证据。未写 `interface.ts`/`main.ts`/`preload.cjs`/`renderer/**`/`src/**`/其他测试/角色卡/边界/治理。
- **未 commit/push**；未启动应用；未接触客户；未判验收。
- **并发候选**：同一 worktree 有 A1/A2/A3 的并行改动；本记录只对 A4 三文件与 HEAD 5a35908 绑定。D1/变更包需在同一候选上复算；A3/A4 不写对方路径。
- **旧 payload**：channel 级用例只证明旧形状；真实旧卡/回放 DOM 需 A2/A3/E2 证据合并，不能当作 SessionManager 级。
- **非法 flowId**：合成 fail-closed judgeContext 可能使判断 agent 从自动代批回落到手动；合法 slug 不变；这是 V1 AC-6/N4 已披露的新增保护。
- **缺失 flowId**：沿用旧早退；未强制合成 context。若 V1 所有者要求合成，需停止澄清，不在 A4 静默扩大。
- **报告文件未认证**：应用只做安全投影/净化，不认证内容；O5 SHA-256 不实施。
- **`acceptanceTriage`**：基线 `session.ts` 未发现注入；A4 未改。若 Interface 真实接线导致验收卡被应用分诊卡替换，AC-5 证据不足，停止回报。
- **E2E**：未运行；D1 负责真实渲染证据。
- **诊断白名单**：用 `state` 编码 flags；未改共享 diagnostics。若后续要求独立布尔字段，需共享属主变更并评估档位。

**本记录状态：`implemented-unverified`；等待 D1/E1/E2。未验收、未提交。**
