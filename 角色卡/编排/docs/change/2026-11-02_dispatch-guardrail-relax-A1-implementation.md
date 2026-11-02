---
id: dispatch-guardrail-relax-a1-implementation
type: change
title: A1 实施记录：派发护栏放宽——编排硬授权与 advisory 纯逻辑
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: implemented-unverified
related: [dispatch-guardrail-relax]
events:
  - date: "2026-11-02"
    kind: implemented
    summary: A1 实施完成（提案 Revision 2 冻结形状）；两单测 34/34、补充回归 21/21、typecheck 0；未验收
---

# A1 实施记录：派发护栏放宽——编排硬授权与 advisory 纯逻辑

- **角色**：编排（Orchestration）
- **阶段**：A1（编排纯逻辑；不是 B1/D1/E2）
- **状态**：**implemented-unverified**。代码/测试已按冻结提案落地并通过 A1 层检查；**未验收、未跑桌面/T3/E2E、未 commit/push**。A1→B1 之间桌面为未接线中间态，不得作为候选/发布/验收。
- **实现设计（冻结）**：`角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation-proposal.md` **Revision 2，707 行 / SHA-256 `75a184b27d0b0941367eeb2107c16e1aab13535a1876b7895c48e8ccc9f212e7`**（项目管理 P1 复审通过，审核记录 375 行 / `9006e2bdee86e2df5608e8b65d7f4c33a565ce73688877f4a5dd1f1475a10fac`）。
- **基线**：HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`（tree `689a49580fd7e79a0bfae1be343597b793967f71`）；团队计划 482 行 / `4ebd41fa…`；V1 814 行 / `63c441aa…`；B0 201 行 / `547aba69…`。
- **边界**：仅写 `角色卡/编排/boundary.md` Section 1 内的 `src/common/编排/`、`test/编排/` 与本角色 `docs/change/`；未写 `app/**`、`test/桌面应用/**`、`test/测试/**`、`src/common/shared/**`、`src/common/门禁引擎/**`、`src/model/**`、`src/provider/**`、`src/pipeline/**`、角色卡/边界或 `docs/scheduling|acceptance|communication|planning`。

## 1. 改动清单（A1 精确写集）

| 路径 | 操作 | 写前 blob / sha256（HEAD） | 写后 blob / sha256 |
| --- | --- | --- | --- |
| `src/common/编排/workflow-preconditions.ts` | 改 | `d5376f285fa96deedfb4d0fc632244070693652b` / `68cc4f1260bb02d3dfc7bd4d388c7b1d5699729b51bb4b7f52c894320f2d639a` | `83a6c7ebfc5b3fe9094f3a67df5704bfdfd05be5` / `9dfb55638324b6657fd7dc3928e7c7430215848dd9ee6c7d78a21de86ba1249f` |
| `src/common/编排/dispatch-advisories.ts` | 新增 | —（不存在） | `211e70467ddb7c3557d3c4a0562e7a431c01f7cf` / `0781cd3db1201a724feb9ece4837aef4d23c043fa12e202cd01f0dd8d1e30d6f` |
| `src/common/编排/mechanical-rejection.ts` | 改 | `cf75a7194707d7f02a42275fae39b1b5b34c135e` / `51963abdeb086b45497a476ecfb541658f012012428934e02eeea91dc72f2281` | `270d0c016c4c5069cd34a8154dfcf20c8938a542` / `1e1e65736d99d371dbf13bbc18d9d88a048d17ac7fd6475ee508cca623750a62` |
| `test/编排/workflow-preconditions.test.ts` | 改 | `cfde02b76781066e4b24a78f2184ecc7b1ebd268` / `bda2e95b15c7e413750b4f95db217dc59f35e9c982a1fcc60629f9628db15975` | `e1a7683eebc9f4f35d318921dd1d1a6725c0e14f` / `bec8c36109dc4cb1ad823f2dd363ff8aa8aae9e96276287733b5989c8cef066b` |
| `test/编排/dispatch-advisories.test.ts` | 新增 | —（不存在） | `8744a22cdba803394d2636236d3fac17263c88bf` / `72a3ad0cf9ee87d3cd0cecc7c96847463de7c1288103f016e7d433df0620c7e5` |

- 写集外产品/测试改动：**无**。`git status --porcelain -- src app test` 恰为上述 5 个路径（2 改源码 + 1 改测试 + 2 新增）；`git diff --cached --name-only` 为空。
- 证据原文：`2026-11-02_dispatch-guardrail-relax-A1-evidence/01-git-baseline.txt`（42 行 / `dff61477b157840e618445d5e7474f76e9a384a9f9e830ef6122a7d194d2b612`）。

## 2. 实现摘要

- **硬授权唯一谓词**：`evaluateDispatchAuthorization(input: DispatchAuthorizationInput)`，仅接收 `fromRoleId`/`targetRoleId`/`targetBuiltIn`/`targetExists`/`chiefRoleId`/`convenerRoleId` 6 个授权事实；判定顺序为自派 → 来源 → 幕僚目标类型/显式 allowlist（product/rapporteur/nominator/convener/verifier）→ 运营目标类型/目标存在性。
- **复合入口**：`evaluateDispatchPreflight` 保留为唯一复合公开入口；内部调用 `evaluateDispatchAuthorization`，通过后调用 `collectDispatchAdvisories`。无第二份授权判定。
- **`targetExists`**：复合输入可选、窄输入必填；私有唯一 `resolveTargetExists = targetExists ?? targetCardFound`，fail-closed；B1 必须显式传 boolean。
- **`DispatchPreflightInput`**：新增 `targetExists?`、`chiefRoleId: string | null`、`runFacts?`、`versionedDocBaselineViolations?`、`run.modules?`；`targetCardFound` 保留为兼容字段。
- **`DispatchAdvisory`/`DispatchAdvisoryCode`/`collectDispatchAdvisories`**：23 个 code；链级只报首个未满足项；latest 用于链级，run 专属 `run-role-missing`/`module-missing` 用 `run.roles`/`run.modules`（pinned）；legacy 仅 advisory 事实；`run-pin-failed` + `run-pin-required` 可组合且顺序固定；`run.roles`/`run.modules === undefined` 按无事实处理（不产 code、不锚定该 pinned run）；纯函数、不读盘/不写盘、永不 `ok:false`；全部 advisory code 由本模块唯一产出。
- **删除状态拒绝分支**：旧 `run-missing`/`flow-required`/`intent-missing`/`proposal-missing`/`roster-missing`/`d3-missing`/`run-pin-required`/`run-role-missing`/`run-legacy-readonly`/`handoff-missing`/`module-*`/`target-not-nominated` 等不再从 preflight 返回 `ok:false`；`run-missing` 不再产生（RULES 条目保留供历史码表读取）。
- **`target-card-missing`**：文案覆盖「id 拼写/类型错误」与「角色卡/边界未就绪」；owner 保持 `nominator`；`M5_TARGET_CARD_MISSING` 旧别名保留；不新增拒绝码。
- **导入方向**：`dispatch-advisories.ts` 仅 `import type` 引用 `workflow-preconditions.ts`；`workflow-preconditions.ts` 运行期导入 collector；无运行期环（`verbatimModuleSyntax` 擦除类型导入）。

## 3. 验证证据

| 检查 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| A1 单测 | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts` | **34 tests / 34 pass / 0 fail / 0 skip / 0 todo；退出码 0** | `a1-tests.txt`（43 行 / `b3114c14a70a9b71eb16a8b7cf5667538f39c5e0461dbecf45b0324a92e14fbd`） |
| 补充回归 | `node --test --test-concurrency=1 test/编排/task-state.test.ts test/编排/appointment-roster.test.ts` | **21 tests / 21 pass / 0 fail / 0 skip / 0 todo；退出码 0** | `supplementary-tests.txt`（30 行 / `e54f9ef2218c1353169f5711533654c8621cef2975ee417f72b0c3f9f226d62c`） |
| 类型检查 | `npm run typecheck`（`tsc --noEmit`） | **退出码 0，无错误输出** | `typecheck.txt`（5 行 / `d353cf3ff670cbb8a6ca959eb6516cfe092b785b671f08f453b1be246fdc70a1`） |

- 环境：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；Windows 11 Pro 10.0.26300 / Git Bash（MINGW64_NT-10.0-26300）；Node **v24.22.1** / npm **11.19.1** / Git **2.55.0.windows.5**（实测见 `environment.txt`）。
- 未运行：桌面套件、T3 全量、E2E、应用启动（A1 退出标准不含；D1/D2 取证）。
- 已知跨角色中间态：`test/桌面应用/rejection-copy.test.ts` 的 BUG-4 运行时断言在 A1 后会红（A1 行为已降级为 advisory）；该文件属 B1 写集，A1 未运行、未修改；typecheck 保持 0。

## 4. 候选身份与写集

- 候选树（HEAD tree + A1 `src`/`test` 改动，临时 index 计算；不触碰真实 index）：**`a593ddcb4ae60f468d1a5919722a4fa23ee9b71e`**。
- 逐文件 blob/sha256：见 §1。
- `git status --porcelain -- src app test`：5 个 A1 路径；写集外产品/测试改动 **无**。
- `git diff --cached --name-only`：空（未暂存）。
- 未 commit/push/merge/release。

## 5. 契约冻结声明（A1 退出）

> A1 冻结以下形状与口径：
>
> - `DispatchPreflightInput`：`targetExists?: boolean`（复合输入兼容窗口，窄输入必填；`resolveTargetExists` 私有唯一解析、fail-closed；B1 始终显式 boolean）、`chiefRoleId: string | null`、`runFacts?: { ledgerUnavailable?; pinFailed?; documentHashMismatch?; pinnedRosterInvalid? }`、`versionedDocBaselineViolations?: string[]`、`run?: { state; runId?; roles?; modules? }`。后三项为会话层观察的可选事实/实施级扩展：复用既有 `DispatchPreflightInput` 事实袋，不新增 `DispatchAdvisoryInput`，不改 `TaskCreatedEvent`/`DispatchTaskPayload`/`RunManifest`/`tasks.jsonl` schema，不改变产品语义/写集/档位；若统筹/沟通/V1 严格按方案 §5.7 字面否决任何新增字段，A1 停止并回报（提案 §8.1 第 3 点）。
> - `DispatchAuthorizationInput`/`DispatchAuthorizationResult`/`DispatchAuthorizationFailure`：窄步骤的公开签名（`Pick` 派生，不是第二份输入形状）；窄输入只含 6 个授权事实。
> - `DispatchPreflightResult.ok:true.advisories`；`DispatchAdvisory`/`DispatchAdvisoryCode`；`evaluateDispatchAuthorization`；`collectDispatchAdvisories`（全部 23 个 advisory code 的唯一产出点）；`evaluateDispatchPreflight`（复合入口，进入后第一个判定步骤复用窄步骤）。
> - run 事实口径：链级 `target-not-nominated`/`d3-*`/`roster-*`/`module-*` 用 latest；run 专属 `run-role-missing` 用 `run.roles`、run 专属 `module-missing` 用 `run.modules`（pinned），不覆盖 latest 链级判定。`run.roles === undefined` / `run.modules === undefined` 按无事实处理：不产对应 code、任务不锚定该 pinned run；B1 证据/实施记录「pinned manifest 未声明 roles/modules，无法证明覆盖」的限制；B1 不得在会话层补产同类 code。B1 在 roles/modules 未声明时可不向 collector 传 `run`、只传 `runFacts`；collector 对 `run` 缺省与 `run` 无 roles/modules 同口径。
> - R2 advisory 组合：`runFacts.pinFailed=true` + `run.state="draft"` → `run-pin-failed` 与 `run-pin-required` 同时产出，顺序固定（failed 前、required 后）；run 不可用/无 manifest → `run-ledger-unavailable`。
> - 调用图：硬授权 → 事实收集 → run 只读/记账（含 handoff pin）→ `verifyVersionedDocBaselines` → `collectDispatchAdvisories` → `task.created` → 投递/回执；B1 按此接线。
> - 导入方向：`dispatch-advisories.ts` 仅 `import type` 反向引用；运行期无环；模块路径 advisory 的归一化与旧 `normalizeModulePath` 规则等价（`dispatch-advisories.test.ts` 覆盖反斜杠/绝对路径/`..`/通配/目录与文件尾斜杠）。
> - `target-card-missing` 码表文案/owner/旧别名（`M5_TARGET_CARD_MISSING`）；不新增拒绝码。
>
> B1 只按此形状消费；任何变更回编排重跑受影响证据。

## 6. 偏差、限制与未做

- **偏差**：无功能性偏差。实现按提案 Revision 2；仅将 allowlist 实现为私有 `ReadonlySet`（行为与显式数组一致），并新增 3 个补充测试（独立 advisory 顺序、verifier run 专属模块、convener→chief 授权矩阵断言），不改变契约。
- **限制/未做**：
  - 未运行桌面套件、T3 全量、E2E；`test/桌面应用/rejection-copy.test.ts` BUG-4 预期在 B1 迁移前为红（未运行、未修改）。
  - 未验证 B1 的 `routeStarDispatch` 实际调用顺序/硬拒绝零 draft run；由 B1/D1 取证。
  - 未验收；状态 `implemented-unverified`；不把本记录当验收结论。
  - 未 commit/push/merge/release；未启动应用；未派发其他角色。

## 7. 证据文件

目录：`角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-evidence/`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `01-git-baseline.txt` | 42 | `dff61477b157840e618445d5e7474f76e9a384a9f9e830ef6122a7d194d2b612` |
| `a1-tests.txt` | 43 | `b3114c14a70a9b71eb16a8b7cf5667538f39c5e0461dbecf45b0324a92e14fbd` |
| `supplementary-tests.txt` | 30 | `e54f9ef2218c1353169f5711533654c8621cef2975ee417f72b0c3f9f226d62c` |
| `typecheck.txt` | 5 | `d353cf3ff670cbb8a6ca959eb6516cfe092b785b671f08f453b1be246fdc70a1` |
| `environment.txt` | 7 | `b736c838d3c9ba83f410426bb2d6f4139b2b35a05c5251c063a86f4805f36e37` |

本记录自身行数/SHA-256 由 A1 完成报告给出（文件无法在不改变自身内容的前提下内嵌最终哈希）。
