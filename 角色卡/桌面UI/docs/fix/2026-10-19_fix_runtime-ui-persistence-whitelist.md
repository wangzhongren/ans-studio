---
id: runtime-ui-persistence-whitelist-deskui
type: fix
title: runtime-ui「整文件无 localStorage」契约过期——收紧为侧栏偏好白名单守卫
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: [runtime-ui, sidebar-persistence, runtime-ui-persistence-contract-stale]
---

# runtime-ui 持久化断言过期：从「整文件禁用」收紧为白名单守卫（桌面UI）

## 0. 来源与边界

- 测试角色只读核对并交付判定：`角色卡/测试/docs/fix/2026-10-19_verify_runtime-ui-persistence-contract.md`
  （干净 HEAD `144b803` 复现红、renderer 存储面核对、拟议补丁与 7 项负向变异）。该文件在
  `角色卡/桌面UI/boundary.yaml` 第 36 行白名单内，测试角色未越界修改，本上下文负责落地。
- 本侧改动仅：`test/桌面应用/runtime-ui.test.ts`（替换第 69 行整文件禁令）、本记录与
  `changelog.md`。**未改 renderer 源码**、未改其他角色测试、未 git 提交、未读 `.env`、未打印凭据。

## 1. HEAD 既有红（不是产品回归）

`test/桌面应用/runtime-ui.test.ts` 用例「renderer 仅消费 IPC，机密为空且无持久化，切引擎不停止后台任务」
在 HEAD 即红，失败点旧第 69 行：

```ts
assert.doesNotMatch(renderer, /localStorage|sessionStorage|node:fs|require\("fs"\)|import\(/);
```

原因：2026-10-17 客户反馈左栏可收起/可拖拽，renderer 引入 `ans.sidebar.width` / `ans.sidebar.collapsed`
两项界面偏好持久化（HEAD 已存在，`SIDEBAR_WIDTH_STORAGE_KEY` / `SIDEBAR_STORAGE_KEY`、`initSidebar()`）；
旧断言仍按「整文件零 localStorage」的历史契约要求。同属桌面UI 的 `renderer.test.ts` 早已把侧栏持久化
写成正面契约，两者口径冲突。故为**测试契约过期**，不是产品回归，也不能靠删除持久化或删断言了事。

## 2. 新守卫口径（收紧，不是放宽）

替换旧断言后的口径：

1. **仍全禁**：`sessionStorage|node:fs|require\("fs"\)|import\(`（整文件，保持原样）。
2. **去注释后计数**：renderer 去块注释/行注释后，含 `localStorage` 的行**恰好 4 行**，
   且 `localStorage` 出现次数**恰好 4 次**（两项偏好的读/写；新增偏好必须显式更新契约）。
3. **每处形态白名单**：每行只能匹配
   `window\.localStorage\.(getItem|setItem)\((SIDEBAR_WIDTH_STORAGE_KEY|SIDEBAR_STORAGE_KEY)\b`；
   删去白名单匹配后同行不得残留任何 `localStorage`——同行夹带 `removeItem/clear`、下标访问或裸调用均失败。
4. **邻近敏感词**：每处 `localStorage` 的上一行/本行/下一行不得出现
   `api[_-]?key|token|secret|password|credential|shellConfirm|recoveryConfirm|shellJudge|decisionJudge|piConfig`
   （不区分大小写；在任务给定清单上补了 `piConfig`，落实「Pi 配置只走 IPC」）。
5. **键字面量**：`SIDEBAR_WIDTH_STORAGE_KEY` / `SIDEBAR_STORAGE_KEY` 的定义恰为
   `ans.sidebar.width` / `ans.sidebar.collapsed`（`var|let|const` 均可，防风格漂移误报）。
6. **保留原有断言**：切引擎不停止后台任务（`switchBody` 不含 `stopSession|abortSession`）、
   输入值不回显（`inp.value = ""; // 绝不回显值`）、`onOperatorExpired`、`entry.runtime !== state.runtime`。

## 3. 负向变异（用真实测试文件验证）

方法：把 `app/renderer/` 与 `test/桌面应用/runtime-ui.test.ts` 复制到 `/tmp` 独立目录，
对 `renderer.js` 副本施加单点变异后运行真实用例；基线（不变异）必须过，每个变异必须红。
脚本与临时目录用后即删，未入仓。

| # | 变异 | 预期 | 结果 |
| --- | --- | --- | --- |
| 0 | 基线（不变异） | 过 | 12/12 过，exit 0 |
| 1 | 追加 `window.sessionStorage.setItem(...)` | 红 | 红（sessionStorage 全禁） |
| 2 | 键字面量 `ans.sidebar.width` → `ans.apiKey` | 红 | 红（键字面量断言） |
| 3 | 侧栏键写入值改为 `state.token` | 红 | 红（邻近敏感词） |
| 4 | `getItem` 改为 `removeItem` | 红 | 红（形态白名单） |
| 5 | `window.localStorage` 改为裸 `localStorage` | 红 | 红（形态白名单） |
| 6 | 侧栏键写入 `state.shellConfirm` | 红 | 红（邻近敏感词） |
| 7 | 侧栏键写入 `piConfig` | 红 | 红（邻近敏感词，含本批新增 `piConfig`） |
| 8 | 追加第 5 处侧栏偏好写（新键未更新契约） | 红 | 红（恰 4 处计数） |
| 9 | 追加 `require("fs")` | 红 | 红（Node fs 全禁） |

10 个用例全部符合预期（`ALL_MUTATIONS_AS_EXPECTED`）。

## 4. 验证实录（2026-10-19，本工作树）

| 命令 | 结果 |
| --- | --- |
| `node --test "test/桌面应用/runtime-ui.test.ts"` | **12 计 / 12 过 / 0 红 / exit 0**（改前 12/11/1，红点即旧第 69 行） |
| `node --test "test/桌面应用/**/*.test.ts"` | **636 计 / 636 过 / 0 红 / 0 skip / exit 0** |
| `npm run typecheck` | **exit 0**（`tsc --noEmit` 0 错） |

测试角色此前快照中的桌面应用 11 红（9 条工作树在途 + 2 条 HEAD 既有）在本轮运行时刻已全部消失
（`runtime-ui` 由本批修复；其余由对应属主推进后转绿），**当前无剩余红可归因**。本角色未修改
`interface.test.ts`、`acceptance-dispatch.test.ts`、`operator-wiring.test.ts` 等其他角色测试。

## 5. 纪律

- 未 git 提交；未读 `.env`；未打印任何凭据；未修改 renderer 源码与产品行为；
- 未修改其他角色测试；临时变异目录与脚本已清理。
