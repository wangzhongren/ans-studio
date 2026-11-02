---
id: acceptance-return-card-a2-implementation
type: change
title: 验收回交卡 A2 实施记录：渲染纯逻辑（验收身份 + 决定卡防御读取）
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: implemented-unverified
related: [acceptance-return-card]
events:
  - date: "2026-11-02"
    kind: created
    summary: A2 实施：isVerificationRole + DecisionView acceptanceReport 防御读取 + 纯逻辑测试
  - date: "2026-11-02"
    kind: implemented
    summary: A2 代码/测试/spec 记录写入；17/17 测试、typecheck:renderer 通过；未 commit/push、未启动应用
---

# 验收回交卡 A2 实施记录：渲染纯逻辑

- **实施角色 / 上下文**：桌面UI（渲染层 `app/renderer/`），本上下文只承担该角色。
- **节点**：团队计划 §五 **A2（渲染纯逻辑）**；入口为 P1 审核 `recommend approval` + A1/A2 可并行。
- **状态**：**implemented-unverified**。代码与测试已写盘、A2 必测与 `typecheck:renderer` 已通过；**未 commit/push、未启动应用、未跑 E2E、未接触客户、未判验收**。A3/A5 仍待 A1/A2 冻结与 A3/A4 完成后进行。

## 一、输入与基线

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| P1 审核记录（`recommend approval`） | `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-P1-review.md` | 168 | `8a114aab2d6f1fa61bc7df8a1ef09f81d65afdb17d2990bf78a4ead50ca080d2` |
| 桌面UI P1 提案 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 463 | `e2eb138e17f0090495bf4d9be3c7b45ef152f631095e90893b63be374a5e4402` |
| 团队计划 | `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md` | 429 | `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` |
| V1 | `docs/acceptance/acceptance-return-card-criteria-v1.md` | 926 | `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b` |
| 方案 P1.2 | `docs/planning/2026-11-02_design_acceptance-return-card.md` | 873 | `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` |
| 复核 | `docs/planning/2026-11-02_review_acceptance-return-card.md` | 143 | `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline.md` | 178 | `b4c4808fc66c4005273058dd9e20df28830a5df3ca89a4ee6b3b20aa12838f61` |

- 分支 / HEAD：`feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`。
- 编辑前工作树：本角色两产品文件与两测试文件无改动（before 哈希见 §四）；`git diff --cached --name-only` 为空。
- 并行说明：实施期间工作树存在 **A1（项目管理 i18n）** 与 **A4（桌面窗口 payload）** 的并行改动（`src/common/shared/i18n/messages/*`、`test/项目管理/shared/i18n.test.ts`、`app/desktop/session.ts`、`app/desktop/customer-input.ts`）。这些**不是本上下文改动**，不纳入 A2 候选；本上下文未读写/修改这些路径。
- P1 实施条件：P1-ARC-01/02 属 A3、P1-ARC-04 属 A4，A2 无附加条件；本记录不覆盖 A3/A4/A5 条件。

## 二、改动内容

### 2.1 `app/renderer/src/chat/role-view.ts`

- 在 `findRole` 之后新增：

```ts
export function isVerificationRole(role: RoleView | null | undefined): boolean {
  return role?.builtIn === true && role.governanceFunction === "verification";
}
```

- 严格 `builtIn === true`；项目角色（含 id 恰为 `verifier`、`builtIn:false`）、缺 `governanceFunction`、`null`/`undefined`、角色不可解析均返回 `false`。
- 不按角色 id 字符串、报告文本、报告状态或任务账本猜测；不改其余显示/分组函数。

### 2.2 `app/renderer/src/chat/decision-dialog.ts`

- 新增本地类型（仅渲染侧，未新增共享 Model/公共入口）：

```ts
export interface AcceptanceReportView {
  version: 1;
  path: string;
  text: string;
  redacted: boolean;
  truncated: boolean;
}
```

- `DecisionView` 增加 `acceptance: boolean`、`acceptanceReport: AcceptanceReportView | null`。
- 新增私有 `readAcceptanceReport(payload)`：`version === 1`、`text.text` 字符串、`text.redacted`/`text.truncated` 布尔、`path` 字符串（允许空串）、`new TextEncoder().encode(text).byteLength <= 16384`；任一不合法返回 `null`（不抛、不猜、不二次截断）。
- `decisionView` 仅在 `cardKind === "acceptance"` 时读取报告；非验收卡即使携带字段也返回 `null`。`cardKind` 由内联调用提为局部常量复用（值不变），其余 `kind/options/multiple/recommendedId/priority/highRisk/destructive/answerable/judgeNotice` 计算逐字不变。
- 新增并导出纯函数 `sameDisplayText(left, right)`：仅统一换行（`\r\n?` → `\n`）与去首尾空白后完全相等才为 `true`；不做空白压缩。供 A3 的 preview 去重使用，属 A2 纯逻辑范围。

### 2.3 测试

- `test/桌面UI/role-view.test.ts`：新增 1 个判据矩阵测试（内置质检 true；项目 verifier/缺字段/角色列表未加载/null/undefined false）。
- `test/桌面UI/decision-dialog.test.ts`：新增 5 个测试：acceptance 标志与合法视图、选项/推荐/可作答性/优先级不变；非验收卡不消费、验收卡缺报告仍可作答；版本/字段类型/路径非法 → null；UTF-8 单字节/多字节 16384 边界；`sameDisplayText` 去重判据。
- 既有测试未删除、未改写断言、未新增 skip/todo；两文件用例数由 11 增至 17。
- `角色卡/桌面UI/api-spec.md` 模块表补充 `isVerificationRole` 与 `chat/decision-dialog.ts` 的 A2 导出说明（渲染侧内部契约，非共享契约）。
- `角色卡/桌面UI/memo.md` 追加 A2 状态续接记录。

## 三、验证结果

### 3.1 A2 必测套件

| 项 | 值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 test/桌面UI/role-view.test.ts test/桌面UI/decision-dialog.test.ts` |
| 时间（+08:00） | 2026-11-02T15:56:29 → 15:56:30 |
| 退出码 | **0** |
| tests / pass / fail / cancelled / skipped / todo | **17 / 17 / 0 / 0 / 0 / 0** |
| 原始日志 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A2-evidence/01-a2-tests.log`（30 行 / `aed2b8455aad08a1a8ec100dbfe6e4ef4c865065357c877fa78f5078b71ce011`） |

### 3.2 `typecheck:renderer`

| 项 | 值 |
| --- | --- |
| 命令 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） |
| 时间（+08:00） | 2026-11-02T15:56:33 → 15:56:34 |
| 退出码 | **0**（0 类型错误） |
| 原始日志 | `.../A2-evidence/02-typecheck-renderer.log`（9 行 / `ff0bc834f30919a6384ff7ed010b1d3a86004797e96d8901178aad2ac9b7d26d`） |

### 3.3 环境

| 项 | 实测值 |
| --- | --- |
| Node / npm | `v24.22.1` / `11.19.1` |
| OS / shell | `MINGW64_NT-10.0-26300 3.6.10-710e5275.x86_64` / Git Bash `5.3.15(2)-release` |
| 原始日志 | `.../A2-evidence/04-environment.log`（5 行 / `7a6d12c6d16ee2f8d9dbf53f38cdc06bc172867d21116be72382ea52d6b34331`） |

## 四、候选哈希（before / after）

| 文件 | before `git hash-object` | before sha256 | after `git hash-object` | after sha256 | 行数 |
| --- | --- | --- | --- | --- | --- |
| `app/renderer/src/chat/role-view.ts` | `e0925eda7188fa549e903c3323a3f3e40c9279a1` | `830a760f0809ddef133337729b1fd25fce9733b895264a87ff5f95f4f1408896` | `b8789c0990765263b6dc6b0c8d102a81f3e199e9` | `05a2225c50b21b4c752564053d1b5947597c4cb4d3b497b93f7e40fd21465843` | 151 → 159 |
| `app/renderer/src/chat/decision-dialog.ts` | `f3352f142120a9da790a21cc433e712deb00620e` | `00e1f088dd738750e8181877403fc578a14a00f5fb5aa65aa0302f6c3e65c23e` | `1548f1d452ce84b2796687afe974e4280f2730fc` | `c62d44b4e34308255ed8217539a4ec3f238429512cfd556c223f7f6c3b4d1679` | 181 → 231 |
| `test/桌面UI/role-view.test.ts` | `99071b1b70e65fc768b0c3c4d7fca0808be0f6e8` | `e2cd6dc6ffef8150844c2f6baef937784fd06a3a1f93731e31fc70d9c25e3c94` | `cb0fb324feb561ce33d923bef52b263a765b9b52` | `a8f853e4b72ead394fa2d54837b02c2a8c58165378c0418cea5f6d7fcac2f5ff` | 107 → 134 |
| `test/桌面UI/decision-dialog.test.ts` | `b7e2391de88010f7f62c5b6c9310d0b2c2b81445` | `c40b611144645de139b8bc9c101df450fa5ccd74c4c8978df0c1c3b42a20dd63` | `22049da0c6b8e67aef4680c6ca54de029a3c8ab7` | `50c7797220c2de27f457ac1678fe84c6c63948f429ac3e142282add38a72e062` | 103 → 235 |

- A2 产品/测试候选 = 上表 4 个文件的 after 哈希；`git diff --stat` 仅这 4 个文件（+218 / −1）。
- 哈希/状态原始记录：`.../A2-evidence/03-hashes-status.txt`（83 行 / `6a4fccd9b46340bc5aa6a7a72d1275787603795b24033131096cf9071bd4a7ae`）。

## 五、写集与纪律核对

- **本上下文写盘**：上述 2 个产品文件 + 2 个测试文件；`角色卡/桌面UI/api-spec.md`、`memo.md`；本记录与 `A2-evidence/` 日志；此前 P1 提案。
- **未写**：`ReportCard.tsx`、`DecisionDialog.tsx`、CSS、E2E harness（A3/A5）、`app/desktop/**`、`src/**`（含 i18n）、其他角色测试、角色卡/边界/changelog、`docs/scheduling|acceptance|communication|planning`。
- **未 commit / 未 push / 未启动应用 / 未跑 E2E / 未接触客户 / 未判验收**；`git diff --cached --name-only` 为空。
- 工作树中的 A1/A4 并行改动与既有治理/管理记录**不属本候选**（`03-hashes-status.txt` 已逐项标注）；本上下文未修改它们。

## 六、偏差、限制与下一步

- **偏差**：
  1. `sameDisplayText` 作为可测纯函数导出（A3 的 preview 去重使用）；仍在 `decision-dialog.ts` 内，不新增共享类型/公共入口。
  2. `readAcceptanceReport` 保持私有，经 `decisionView` 间接测试；外部只消费 `DecisionView`。
  3. `path` 允许空串（类型合法），A3 在路径为空时不显示 O2 行。
  4. `decisionView` 中 `cardKind` 由内联调用提为局部常量复用；值/语义不变，是本 diff 唯一删除行。
- **限制**：A2 只覆盖纯逻辑；未渲染 DOM、未验证 A3 卡片/决定卡视觉、未跑 E2E、未跑根 `typecheck`（A2 出口只要求 `typecheck:renderer`，D1 会跑全量门禁）。A1/A4 并行改动未由本上下文验证。
- **下一步**：A3 需等 A1/A2 冻结后实施（消费 14 个 i18n key 与本次纯函数）；A5 在 A3/A4 后；A2 状态保持 `implemented-unverified`，最终由 D1/E2 按 V1 判定，本记录不是验收结论。
