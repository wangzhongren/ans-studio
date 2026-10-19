---
id: desktop-shell-confirm-role-title
type: change
created: "2026-10-19"
status: implemented-unverified
revision: 1
---

# shell 审批卡标题按实际角色显示（内置治理角色不再显示「SU」）

## 客户反馈与截图事实

客户真机截图（2026-10-19）显示：由 **Proof / 验收** 发起的 shell 审批卡，标题仍是「SU 命令审批」。五个内置治理角色现在都走同一审批档（内部 policy 仍叫 `su-approval`），但 UI 不应再显示 SU——应按实际角色显示，例如「命令审批 · Proof / 验收」或「Proof / 验收 · 命令审批」。单模型 su 仍可显示「SU 命令审批」。

截图内容要点（按客户转述记录；图片本身未随本任务落盘）：

- 卡片标题：`SU 命令审批`（发起角色实为内置治理角色 Proof / 验收 `verifier`）；
- 命令原文、档位、原因、警告与放行/拒绝按钮形态正常；
- 客户诉求只针对标题称谓，不涉及卡片行为、按钮或审批判据。

## 改动

判据只取载荷事实（`policy`、`roleId`），文案映射单点在 `ui-labels.js`；渲染侧只把 `roleId` 传进去。**卡片行为、按钮、默认焦点、放行/拒绝判据、警告与样式零改动。**

| 载荷 | 标题 |
| --- | --- |
| `su-approval` + `roleId` ∈ {liaison, rapporteur, nominator, convener, verifier} | `命令审批 · <显示名>`：Lead / 主理、Draft / 提案、Crew / 组队、Steward / 统筹、Proof / 验收 |
| `su-approval` + 非上述 roleId（单模型 `su`、旧请求缺 roleId、未知 id/坏值） | `SU 命令审批`（逐字保留） |
| 其余（`project` 三层链卡 / 缺 policy 的旧请求） | `shell 命令请求`（既有兜底逐字保留） |

实现位置：

- `app/renderer/ui-labels.js`
  - `shellConfirmTitle(policy, roleId)`（原第 195–198 行，现约 195–207 行）：roleId 优先——内置治理角色即便 `policy` 仍是 `su-approval` 也不再显示「SU」；否则按 policy 走旧文案。
  - 新增 `GOVERNANCE_ROLE_FUNCTION_BY_ID` 与 `governanceRoleDisplayNameById(roleId)`（`governanceRoleView` 之后）：显示名由既有 `GOVERNANCE_ROLE_TEXT` 的 `en` / `cn` 派生（`en + " / " + cn`），与注册表 `BUILT_IN_GOVERNANCE_ROLES[].displayName` 同序、逐字一致；非内置治理 id（含 `su`、项目角色、未知）⇒ 空串，不编名字。
- `app/renderer/renderer.js`
  - `renderShellConfirm`（约第 2608 行）：新增 `confirmRoleId = payload.roleId`（字符串非空时）否则回退 `cur.roleId`；`#sc-title.textContent = UiLabels.shellConfirmTitle(payload.policy, confirmRoleId)`。其余行零改动（`index.html` / `styles.css` 未触碰）。

## 影响面

- 只影响 shell 确认卡的标题文案。
- 单模型 su：`roleId === "su"`（或旧请求无 roleId）⇒ 仍「SU 命令审批」，逐字不变。
- 项目角色三层链卡：`policy === "project"` 且 roleId 非内置治理角色 ⇒ 仍「shell 命令请求」，既有测试与 e2e 夹具（不带 roleId）逐字回归通过。
- 显示名顺序：本卡按客户示例与注册表 `displayName` 用「英文 / 中文」（如 `Proof / 验收`）；左树 `displayNameOf` 仍为「中文 英文」（如 `验收 Proof`），本批**不改**左树（客户只要求审批卡标题；避免扩大展示面）。

## 测试

- `test/桌面应用/renderer.test.ts`：SU 审批卡用例新增 8 条纯映射断言（verifier→`命令审批 · Proof / 验收`、五角色逐一、su→`SU 命令审批`、project 角色兜底、未知/坏 roleId 兜底、roleId 优先于 policy），并更新接线守卫（`confirmRoleId` 取载荷/回退、标题调用传第二实参）；既有 3 条旧文案逐字回归保留。
  - 单跑：**104/104 通过，0 失败**。
- `node --test "test/桌面应用/*.test.ts"`：**605 计 / 604 过 / 1 红 / 0 skip**。唯一红为 `runtime-ui.test.ts:69` 的 `localStorage` 源码守卫，**HEAD 即红**（`git show HEAD:app/renderer/renderer.js` 已含侧栏 `localStorage` 读写），与本批无关、未触碰。
- `npx tsc --noEmit`：本侧文件零错误；全仓现存报错均在 `src/common/runtime-core/shell-judge/policy.ts`（他角色在飞改动），与本批无关。

## 跨域待同步（只读核对、不改他域）

- `test/测试/su-shell-approval-verify/d-card-data.test.ts:107` 断言渲染源码包含子串 `UiLabels.shellConfirmTitle(payload.policy)`；调用现新增第二实参，该守卫会失配，需测试角色同步（本角色边界不含 `test/测试/**`）。
- `test/测试/su-shell-approval-verify/card-probe.mjs` 与 `test/桌面应用/e2e/uiux-v2.mjs` 的 su 卡夹具不带 `roleId` ⇒ 标题仍为「SU 命令审批」，无需修改。

## 未验边界

- 未做真实 Electron/真机截图复核（本批为纯文案映射；标题由 `ui-labels` 纯函数与渲染接线守卫覆盖）。真机验收需在 Proof / 验收 角色的会话里真实触发一次审批卡确认标题。
