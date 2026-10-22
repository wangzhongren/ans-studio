# 2026-10-22 变更记录：角色粒度与 MapReduce 并行 · 桌面UI（Map C）

- **任务 ID**：`2026-10-22-role-granularity-parallel-testing`
- **角色**：桌面UI（固定角色上下文）
- **状态**：**N/A（无渲染文案改动）**
- **依据**：客户确认的策划方案 v1 §9.1（渲染层可选文案）/§12（非目标）（`docs/planning/2026-10-22_design_role-granularity-parallel-testing.md`）；团队计划 §4.3「桌面UI」、§5.4 N6、§11.8（`docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md`）；验收标准 P10、P13 的桌面UI 可选文案子项（`docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` §4.4）。
- **结论**：本角色判断**不需要**修改 `app/renderer/src/chat/governance-view.ts`、`role-view.ts` 或 `test/桌面UI/**` 的任何源码/断言；未强行改动。仍对当前候选执行了 `node --test "test/桌面UI/**/*.test.ts"`、`npm run typecheck:renderer` 与最终候选 exact `npm run build:renderer`，作为验证/构建证据。

## 一、环境与写前基线

- 平台：Windows 11 Pro 10.0.26300；Git Bash；分支 `feat/background-tasks-governance-and-reasoning`。
- Node v24.22.1 / npm 11.19.1（`/c/Users/51054/AppData/Local/Programs/nodejs` 加入 PATH）。
- HEAD：`64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（与任务书一致）。
- 写前 `git diff --cached --name-only`：空。
- 写前 `git status --short`：Map A/Map B 其他角色改动与既有 memo/管理记录（预期，不属本角色）；`app/renderer/**`、`test/桌面UI/**`、`test/桌面应用/**` 无任何改动。
- 写前目标文件指纹（`git hash-object` / `sha256sum`）：

| 文件 | blob | sha256 |
| --- | --- | --- |
| `app/renderer/src/chat/governance-view.ts` | `f72188bd8737c6056727062f3b3487a9960d2f62` | `4f5e62a8f529e69eefb9c1b7314a87f78c0157f0bcb5cf63efed6f9bf7d6ce48` |
| `app/renderer/src/chat/role-view.ts` | `a3ad631cf0e9d76b40598effd8270f5c8fabe766` | `268a0999015d7bd2f022799fee66e7a035989f8f6a3fdf11c471ef5623b3341b` |
| `test/桌面UI/governance-view.test.ts` | `38634fec1a4db39d07534752517e8395d2e489ba` | `1dc1a82e4db1b268f46095398dcf07664a3c47d048a02774e93c249afdf0aac6` |
| `test/桌面UI/role-view.test.ts` | `7cbccd4a00fca9cc55d42c5badd9e15c95999f72` | `6f98d780213a921cba13402e1f3fa58df8377d95fcd4be5f2f6ed067fc597e3d` |

写后复算与上表逐字一致：本角色产品源码/测试零改动。

## 二、N/A 判断与理由

**渲染层没有承载团队计划 v2 模块/并行信息的面。** 逐一核对两个授权文案文件：

1. `governance-view.ts` 只做「主进程事实 → 文案」的转写：治理动作谓词、状态行、missing/invalid/pin-mismatch 空态、reaccept/establish/migration 预览与失败、治理卡元信息（flowId/stepId/权力类型/将写路径/摘要/哈希）、镜像与排队文案。这些都不解析、不展示团队计划的 module/公开契约/测试面/dependsOn/并行组，也不展示模块清单或 Map/Reduce 分组。
2. `role-view.ts` 只按 `governanceFunction` 派生五角色显示名/权力副标题/内置标识，按 `group`（团队计划「组别」列）分组。v2 新增的「并行组」是独立列，未进入渲染层 `RoleView` 契约；本轮也没有要求扩展该 IPC 数据面。
3. 唯一提及「团队计划」的文案是 `GOVERNANCE_ROLE_HINT.nomination`：「客户任命后打开写卡；只按团队计划与任命名单写角色卡与边界，不选择角色、不批准。」v2 只是给团队计划增加列/校验，Crew 的职责与入口语义未变，该句仍然如实。
4. appointment/客户入口/派发权/角色 id/显示名/`GovernanceFunction` 值在本轮明确不改；渲染层相关文案无需同步。
5. 桌面窗口在 `governance-advance.ts` 生成的 v2 任务文案（模块清单/MapReduce/测试分片/manifest）以 `summary`/正文进入聊天行，渲染层按原样展示，不做二次转写，因此不需要新增映射或文案。
6. 角色卡要求「界面文案按已有定稿如实……不在渲染侧自行发明规范」；本轮没有经确认的模块粒度/并行提示定稿文案，强行新增属于自行发明，故不做。
7. 验收标准 §4.4 明确允许 P10/P13 的桌面UI 文案子项在未改时记 N/A + 理由；不影响桌面窗口必改的解析/校验/任务文案判定。

**因此：** 不更新 `governance-view.ts`、`role-view.ts`、`test/桌面UI/**`；不创建 `test/桌面应用/renderer.test.ts`（该文件当前不存在，默认不创建）。

## 三、当前候选验证（未改源码仍执行）

| 命令 | 退出码 | 计数/结果 | 耗时（墙钟） | 原始日志 |
| --- | --- | --- | --- | --- |
| `node --test "test/桌面UI/**/*.test.ts"` | 0 | tests 163 / pass 163 / fail 0 / skipped 0 / todo 0（runner duration 235.6922 ms） | 293 ms | `%TEMP%/ans-desktopui-mapc/test-desktopui.log` |
| `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 0 | 无诊断输出 | 619 ms | `%TEMP%/ans-desktopui-mapc/typecheck-renderer.log` |
| `npm run build:renderer`（`vite build --config vite.config.ts`，exact 形式） | 0 | `✓ 2654 modules transformed`、`✓ built in 298ms`；仅既有 chunk >500 kB 提示 | 904 ms | `%TEMP%/ans-desktopui-mapc/build-renderer.log` |

上述计数与 N3 官方基线（`test/桌面UI/**` 163/163、typecheck:renderer exit 0、build exit 0）一致，零新增失败。`%TEMP%/ans-desktopui-mapc/` 为仓库外临时日志目录，不是候选。

### 构建产物与忽略核对（最终候选 exact 构建，由本角色执行）

- 输出（`app/renderer/dist/`）：
  - `index.html` 597 B（0.59 kB）
  - `assets/index-CM_oPpfU.js` 831,307 B（831.30 kB，gzip 273.82 kB）
  - `assets/index-s5ZMUClC.css` 108,829 B（108.82 kB，gzip 19.62 kB）
  - `assets/ans-studio-ans-icon-DOpmqMAU.png` 55,057 B（55.05 kB）
- `git check-ignore -v app/renderer/dist` → `.gitignore:9:app/renderer/dist/	app/renderer/dist`
- `app/renderer/dist/` 被忽略、未出现在 `git status --short`/`git diff --name-only`，**不是候选**；本角色只写该目录（及其上次构建的覆盖），未改任何未授权路径。

## 四、写后候选哈希

| 文件 | blob | sha256 | 与写前 |
| --- | --- | --- | --- |
| `app/renderer/src/chat/governance-view.ts` | `f72188bd8737c6056727062f3b3487a9960d2f62` | `4f5e62a8f529e69eefb9c1b7314a87f78c0157f0bcb5cf63efed6f9bf7d6ce48` | 一致 |
| `app/renderer/src/chat/role-view.ts` | `a3ad631cf0e9d76b40598effd8270f5c8fabe766` | `268a0999015d7bd2f022799fee66e7a035989f8f6a3fdf11c471ef5623b3341b` | 一致 |
| `test/桌面UI/governance-view.test.ts` | `38634fec1a4db39d07534752517e8395d2e489ba` | `1dc1a82e4db1b268f46095398dcf07664a3c47d048a02774e93c249afdf0aac6` | 一致 |
| `test/桌面UI/role-view.test.ts` | `7cbccd4a00fca9cc55d42c5badd9e15c95999f72` | `6f98d780213a921cba13402e1f3fa58df8377d95fcd4be5f2f6ed067fc597e3d` | 一致 |

## 五、diff / status

- 产品候选改动（本角色）：**无**。`git diff --name-only` 中本角色产品路径（`app/renderer/**`、`test/桌面UI/**`、`test/桌面应用/**`）零条目；`git diff --stat` 无本角色产品文件。
- 自身文档改动：`角色卡/桌面UI/memo.md`（+1 行，追加本任务 N/A 记录，属角色自身文档）；新增未跟踪本记录（`角色卡/桌面UI/docs/change/2026-10-22_change_role-granularity-parallel-testing.md`）。两者均非产品候选。
- `git diff --cached --name-only`：空（未暂存）。
- 未提交、未推送、未合并、未发布。
- `app/renderer/dist/` 未进入任何 diff/status 输出（忽略）。

## 六、未做项与偏差

- **未做**：渲染文案/测试/逻辑/DOM/交互改动（判断 N/A）；`test/桌面应用/**`（含 `renderer.test.ts`，未创建）；`app/desktop/**`、`app/main.ts`、`app/preload.cjs`；`src/**`；构建配置/`package.json`/tsconfig；`docs/scheduling/**`、`docs/acceptance/**`；角色卡/边界；Reduce/Map D。
- **偏差**：无。N/A 依据见 §二；验证与 exact 构建仍按任务书执行。
- **状态**：本记录状态 `N/A`（未改源码），不声明已验收/已提交；真实启动/演示与独立验收由测试角色/独立验收后续执行。

## 七、边界声明

本角色只写：`app/renderer/dist/`（构建产物，忽略）、本变更记录；`app/renderer/src/chat/*` 与 `test/桌面UI/**` 未改动。未越界、未暂存、未提交、未推送、未合并、未发布。
