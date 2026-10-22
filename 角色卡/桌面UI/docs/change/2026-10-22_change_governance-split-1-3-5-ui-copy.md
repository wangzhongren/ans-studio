# 2026-10-22 变更记录：治理拆分 1-3-5 · 桌面UI appointment 文案（阶段 D）

- **任务 ID**：`2026-10-22-governance-split-1-3-5`
- **角色**：桌面UI（固定角色上下文）
- **状态**：`implemented-unverified`
- **依据**：客户确认的策划方案 v1 §5.4/§10.1/O5（`docs/planning/2026-10-22_design_governance-split-1-3-5.md`）；团队计划 §4.2/§5.1 N8/§11.9（`docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md`）；验收标准 G3/P14（`docs/acceptance/governance-split-1-3-5-criteria-v1.md`）；闸门 2 确认与实施授权（`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`）。
- **范围**：只改 appointment 徽标/提示与 Crew 副标题文案；不改角色显示名、内部 id、`GovernanceFunction` 值、路径、渲染逻辑、DOM 结构或交互行为。不开始阶段 E。

## 一、环境与写前基线

- 平台：Windows 11 Pro 10.0.26300；Git Bash；分支 `feat/background-tasks-governance-and-reasoning`。
- Node v24.22.1 / npm 11.19.1（`/c/Users/51054/AppData/Local/Programs/nodejs` 加入 PATH）。
- HEAD：`c3693ecdcb78bd83def351c0f2967571dad7174c`（与任务书一致）。工作树已有阶段 B/C 其他角色改动（预期，不属本角色）。
- 写前 `git hash-object` 核对（全部一致，未覆盖他人改动）：

| 文件 | 写前 blob |
| --- | --- |
| `app/renderer/src/chat/governance-view.ts` | `c66a0520a1e60ea49db9d5b2b1967786fd31211f` |
| `app/renderer/src/chat/role-view.ts` | `5f9b38c0dc14d48da858f0dc6c917e033fc2be4f` |
| `test/桌面UI/governance-view.test.ts` | `ae122d9820895c1bddde8a8a16af1fb537199f9c` |
| `test/桌面UI/role-view.test.ts` | `031a8afe57457ea8e3da300e63e89f4fbe584e18` |

## 二、文案前后对照

| 位置 | 前 | 后 |
| --- | --- | --- |
| `governance-view.ts` `GOVERNANCE_CARD_POWER.appointment`（治理卡「权力类型」行 / operator 镜像） | `提名` | `任命` |
| `governance-view.ts` `GOVERNANCE_CARD_POWER["appointment-write"]` | `提名` | `任命写卡` |
| `governance-view.ts` `GOVERNANCE_ROLE_HINT.nomination`（Crew 空态提示） | `通常由流程单提名步骤打开；仅在客户明确要求时直接使用` | `客户任命后打开写卡；只按团队计划与任命名单写角色卡与边界，不选择角色、不批准。` |
| `role-view.ts` `GOVERNANCE.nomination.power`（Crew 副标题） | `提名权 · 不拥有最终批准权` | `写卡权（客户任命后） · 不拥有最终批准权` |

语义依据（阶段 C 已完成的门禁引擎卡文本）：Crew 职能为「写卡权（客户任命后）」——读客户确认后的团队计划、按任命名单写角色卡/边界/工作文档；不再选择角色、组建团队、发 appointment 或写 `docs/nominations/**`；appointment 由 Steward / 统筹发起并经客户决定。显示名 `Crew / 组队`、内部 id `nominator`、`governanceFunction` 值 `nomination` 均未改。

同时更新 `governance-view.ts` 中三处已失真的「逐字沿用旧 ui-labels」注释，注明 appointment 文案按 2026-10-22 治理拆分更新；仅为注释，无逻辑变化。

## 三、测试断言更新

- `test/桌面UI/governance-view.test.ts`
  - 新增 `governanceRoleEmptyHint` 导入。
  - 治理卡元信息测试新增：`appointment` → `任命`（且 `lines` 含「权力类型：任命」、徽标仍为「治理决定 · 客户最终批准」）；`appointment-write` → `任命写卡`（且 `lines` 含「权力类型：任命写卡」）。
  - 新增测试「2026-10-22 治理拆分：Crew 空态提示改为『客户任命后打开写卡』；其他角色提示不变」：逐字断言新提示、断言不含「提名」、`schedule` 提示逐字不变、未知/缺省返回空串。
- `test/桌面UI/role-view.test.ts`：`nomination` 期望副标题改为 `写卡权（客户任命后） · 不拥有最终批准权`；显示名 `Crew / 组队` 断言不变。

未删除任何测试，未放松既有断言；其他角色提示与徽标的既有断言全部保留。

## 四、命令与结果（原始输出摘要）

| 命令 | 退出码 | 计数/结果 | 耗时 |
| --- | --- | --- | --- |
| `node --test "test/桌面UI/governance-view.test.ts" "test/桌面UI/role-view.test.ts"` | 0 | tests 16 / pass 16 / fail 0 | node 计时 91.5ms |
| `node --test "test/桌面UI/**/*.test.ts"` | 0 | tests 163 / pass 163 / fail 0 | node 计时 229.3ms |
| `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 0 | 无诊断输出 | <1s |
| `npm run build:renderer`（`vite build --config vite.config.ts`） | 0 | `✓ 2654 modules transformed`、`✓ built in 283ms` | 约 1s |

构建产物（`app/renderer/dist/`，`.gitignore:9` 已忽略，不构成候选改动）：
- `dist/index.html` 0.59 kB
- `dist/assets/index-CM_oPpfU.js` 831.30 kB（gzip 273.82 kB）
- `dist/assets/index-s5ZMUClC.css` 108.82 kB（gzip 19.62 kB）
- `dist/assets/ans-studio-ans-icon-DOpmqMAU.png` 55.05 kB

Vite 仅提示 chunk >500 kB（既有提示，非本次引入的失败）。

## 五、写后候选哈希

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `app/renderer/src/chat/governance-view.ts` | `f72188bd8737c6056727062f3b3487a9960d2f62` | `4f5e62a8f529e69eefb9c1b7314a87f78c0157f0bcb5cf63efed6f9bf7d6ce48` |
| `app/renderer/src/chat/role-view.ts` | `a3ad631cf0e9d76b40598effd8270f5c8fabe766` | `268a0999015d7bd2f022799fee66e7a035989f8f6a3fdf11c471ef5623b3341b` |
| `test/桌面UI/governance-view.test.ts` | `38634fec1a4db39d07534752517e8395d2e489ba` | `1dc1a82e4db1b268f46095398dcf07664a3c47d048a02774e93c249afdf0aac6` |
| `test/桌面UI/role-view.test.ts` | `7cbccd4a00fca9cc55d42c5badd9e15c95999f72` | `6f98d780213a921cba13402e1f3fa58df8377d95fcd4be5f2f6ed067fc597e3d` |

## 六、diff / status

- `git diff --stat`（本角色四文件）：`4 files changed, 31 insertions(+), 8 deletions(-)`
  - `app/renderer/src/chat/governance-view.ts` +8/−6
  - `app/renderer/src/chat/role-view.ts` +1/−1
  - `test/桌面UI/governance-view.test.ts` +21/−0
  - `test/桌面UI/role-view.test.ts` +1/−1
- `git diff --name-only` 中本角色新增条目仅上述四个文件；列表中其余文件为阶段 B/C 其他角色的既有改动（任务书确认为预期工作树状态），本角色未触碰。
- `git status --short`（本角色目标文件）：仅上述四个 `M`；`app/renderer/dist/` 未被列出（`.gitignore:9` 忽略）。
- `git diff --cached`：空（无暂存）。
- 未提交、未暂存、未推送、未合并、未发布。

## 七、未做项与偏差

- **未做**：阶段 E；`app/desktop/**`、`app/main.ts`、`app/preload.cjs` 及 `app/renderer/` 其他源码；`test/桌面应用/**`（`renderer.test.ts` 当前不存在，未新建）；`src/**`；`docs/scheduling/**`、`docs/acceptance/**`；角色卡/边界（除本角色 api-spec/memo/change 记录）；`package.json`/`tsconfig.json`；`npm install`。
- **偏差**：无功能性偏差。说明两点：
  1. 任务提到的「下一步/报告路径/验收提示同步」——在本角色可写的两个渲染源码中不存在 appointment 专属文案；下一步状态行由 `stores/governance-store.ts` 以通用 `"下一步：" + nextFunction` 渲染（无「提名」等中文措辞），该文件不在本任务写集，故无需也不得改动。报告/验收提示不在 `governance-view.ts`/`role-view.ts` 的 appointment 文案面内。
  2. 额外更新了 `governance-view.ts` 三处注释（声明旧文案「逐字沿用」的注记），避免与新文案矛盾；无逻辑、DOM 或交互变化。
- **待验证**：本记录状态 `implemented-unverified`；真实启动/演示 UI 证据与独立验收由测试角色/独立验收在后续阶段判定。

## 八、边界声明

本次改动仅落入 `角色卡/桌面UI/boundary.md` Section 1：`app/renderer/`（目录）、`test/桌面UI/`（目录）、`角色卡/桌面UI/docs/change/`、`api-spec.md`、`memo.md`。未越界、未提交/暂存/推送。
