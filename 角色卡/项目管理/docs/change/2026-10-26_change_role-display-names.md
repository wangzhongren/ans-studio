# 变更记录：内置治理角色显示名改为两字公司职务名

- 日期：2026-10-26
- 客户决定：内置治理角色显示名改为公司职务名，统一两个字——**产品、策划、运营、人事、质检**。
- 范围：只改显示名、角色卡/系统文案、共享 i18n 与测试期望；不改内部 id、权力、边界、账本、角色路径与门禁判定。

## 映射

| 内部 id | 治理职能 | 旧显示名 | 新显示名 |
| --- | --- | --- | --- |
| `liaison` | liaison（沟通） | 主理 | **产品** |
| `rapporteur` | proposal（提案） | 提案 | **策划** |
| `convener` | schedule（排程） | 统筹 | **运营** |
| `nominator` | nomination（写卡） | 组队 | **人事** |
| `verifier` | verification（验收） | 验收 | **质检** |

## 改了什么

- `src/common/门禁引擎/governance-roles.ts`：五个 `displayName`；角色卡标题与正文中的角色自称/互称（如「产品 / Lead」「运营 / Steward」「质检 / Proof」）；保留内部英文别名，便于与代码和账本对应。
- `src/common/shared/i18n/messages/zh-CN.ts` / `en-US.ts`：`ui.role.governance.*.name`、`ui.judge.roleName.*`、系统行与角色介绍；英文显示名同步为 Product / Planner / Operations / People Ops / QA。
- `src/pipeline/orchestration/govern-session.ts`、`src/provider/runtime/schema.ts` / `tools.ts`、`src/common/编排/*`：agent 可见的工具描述、纪律标题与提示词中的角色名。
- `app/desktop/*`：用户可见的系统行、确认卡/审批档/边界变更/需求变更任务文案中硬编码的角色名。
- 测试：46 个测试文件的期望值随新显示名同步；未删除或放宽断言。

## 没有改什么

- 内部 id（`liaison` / `rapporteur` / `nominator` / `convener` / `verifier`）、治理职能、能力位、Section 1 写权、预授权、禁写、账本字段、flow 步骤、角色目录路径全部不变。
- 历史变更记录与历史验收报告保留当时的旧显示名，不追改。
- `demos/` 与 `.claude/` 不在本批写集。

## 验证

- `npm run typecheck` / `npm run typecheck:renderer`：exit 0 / exit 0。
- 桌面应用：689/689。
- 门禁引擎：346 计 / 345 pass / 0 fail / 1 skip。
- 项目管理 shared（含 i18n 守卫）：209 计 / 204 pass / 0 fail / 5 skip。
- 桌面 UI：296/296。
- 编排：1016 计 / 1014 pass / 1 既有 Windows symlink EPERM / 1 skip。
- runtime-core：354 计 / 347 pass / 3 既有 Windows symlink EPERM / 4 skip。
- 未验证：真实 Electron/真实模型端到端；运行中的应用仍是旧代码，需重启后才显示新名。

## 残余

- 运行中的 ANS 应用未重启，当前界面仍显示旧名；重启后生效。
- 英文显示名采用 Product / Planner / Operations / People Ops / QA；中文仍为两字。
- 历史文档中的旧名保留，属有意选择。
