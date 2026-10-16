---
id: fix-closure-30s-ms-interface
type: fix
title: 收束默认阈值 5min→30s（客户复裁）——renderClosurePrompt 改毫秒接口 + 两档自适应文案；常量保名改值
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [kanban-fixes-pm-review, fix-g2-watchdog-wiring, role-watchdog-and-closure]
---

# 收束默认阈值 30 秒 + `renderClosurePrompt(silentMs)` 毫秒接口（编排侧）

**状态：已实施 / 待验证**（独立验证与真机 E2E 未进行；未 git 提交）。全部落点在**编排**角色 `boundary.yaml` Section 1 内：`src/common/编排/watchdog.ts`（两处 hunk）、`test/编排/watchdog.test.ts`（收束块重写并拆两例）、本记录与 changelog/memo。桌面窗口按冻结接口**并行**改其侧（`app/desktop/watchdog.ts`），本项**未碰** `app/desktop/**` 与 `test/测试/**`。

## 一、来源与权限

- **客户裁定（2026-10-16，run-5 真机观察后）**：「没有任务就应该直接收束啊，还等 5 分钟，是不是尬，应该是 su 自动收束」。裁定：完成态收束的静默阈值默认值改为 **30 秒（一个 tick 的最小防抖）**，env `ANS_DESKTOP_WATCHDOG_SILENCE_MS` 可调保留；**冻结接口 `renderClosurePrompt(silentMs)`**（参数从「分钟数」改为「毫秒时长」；调用方桌面窗口按此传参）。派发：桌面窗口（默认值与判定）、**编排（文案渲染器与常量）**。原始记档＝`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「客户裁定修订（2026-10-16，run-5 观察后）：收束阈值 5min → 30s」。
- 修订前原裁定 1（5 min/tick 30 s）**其余部分仍有效**（阈值表、动作集、恢复卡、去重口径等不动）；本项只动默认时长与收束渲染接口。

## 二、结论

`renderClosurePrompt` 从「分钟参数、单档文案」改为**毫秒参数、两档自适应文案**：≥ 60 000 ms 用「N 分钟」、< 60 000 ms 用「N 秒」（客户冻结口径）；两档一律 **floor（向下取整）**，显示值为已静默时长的**下界**（绝不夸大）；非法输入（非有限或 ≤ 0）回退批准默认值 **30 秒**。文案骨架（文首标记、其余四行、不强迫 su 断言「完成」）逐字未动。默认值常量选**保名改值**（`WATCHDOG_DEFAULT_SILENT_MINUTES = 0.5`，即 0.5 分钟 ＝ 30 000 ms），理由与影响面见 §五。

## 三、改了什么（行级）

### 3.1 `src/common/编排/watchdog.ts`

| # | 位置（改前） | 改前 | 改后 |
|---|---|---|---|
| 1 | 常量（原 L42-43） | `/** 收束阈值的**批准默认值**（客户 2026-10-16 裁定：静默 5 min / tick 30 s，V1 仅 env）。 */` ＋ `export const WATCHDOG_DEFAULT_SILENT_MINUTES = 5;` | 注释重写为「复裁：静默 30 秒；**保名改值**（0.5 分钟 ＝ 30 000 ms）——外部按名导入，改名即越界破坏其编译；非法输入回退 = 本值 × 60 000 ms」；值改 **`0.5`** |
| 2 | 渲染器（原 L125-139） | `export function renderClosurePrompt(silentMinutes: number)`；`const n = …> 0 ? silentMinutes : WATCHDOG_DEFAULT_SILENT_MINUTES;`；首行恒 `已持续 ${n} 分钟。` | `export function renderClosurePrompt(silentMs: number)`；`const ms = Number.isFinite(silentMs) && silentMs > 0 ? silentMs : WATCHDOG_DEFAULT_SILENT_MINUTES * 60_000;`；`const duration = ms >= 60_000 ? \`${Math.floor(ms / 60_000)} 分钟\` : \`${Math.floor(ms / 1000)} 秒\`;`；首行改 `已持续 ${duration}。`；**其余四行逐字未动**；JSDoc 更新（毫秒接口/两档/floor 下界口径/非法回退 30 秒） |

**取整规则（本项自定并注明）**：两档均 `Math.floor`——分钟档 90 500 ms → 「1 分钟」（不渲染「2 分钟」）；秒档 59 999 ms → 「59 秒」；亚秒（如 500 ms）→ 「0 秒」（不编造、不上抛）。口径＝**显示值为时长下界**：只说「至少静默了这么久」，读数恒不超出实际静默时长，杜绝夸大（桌面传的是实测静默毫秒数）。两档为接口冻结口径（<60 s 秒 / ≥60 s 分钟），V1 不设小时档——分钟档无上限（如 600 000 ms → 「10 分钟」）。

### 3.2 `test/编排/watchdog.test.ts`

- 文首标记契约例（原 L151）：`renderClosurePrompt(5)` → `renderClosurePrompt(30_000)`（语义改毫秒；该例只查标记形态）。
- 收束块（原 1 例）**重写并拆两例**（下方 §四）；导入面不变（`WATCHDOG_DEFAULT_SILENT_MINUTES` 名字未变）。

## 四、文案样例（逐字；两例仅首行时长短语不同）

**30 s（复裁默认；`renderClosurePrompt(30_000)`）**：

```text
[系统·收束] 已无进行中任务：全部角色空闲、投递队列为空、无待确认，已持续 30 秒。
请核对是否达到收尾条件：
· 若确认完成——请给客户最终总结（交付物／验证结论／遗留项）；
· 若还有未了事项（含你正在等待的客户答复之外的口头承诺）——继续处理或派发。
本提示仅为系统侧静默判定，不代表任何验收结论；是否收尾由你判断。
```

**5 min（`renderClosurePrompt(300_000)`）**：

```text
[系统·收束] 已无进行中任务：全部角色空闲、投递队列为空、无待确认，已持续 5 分钟。
请核对是否达到收尾条件：
· 若确认完成——请给客户最终总结（交付物／验证结论／遗留项）；
· 若还有未了事项（含你正在等待的客户答复之外的口头承诺）——继续处理或派发。
本提示仅为系统侧静默判定，不代表任何验收结论；是否收尾由你判断。
```

## 五、测试与证据

- `node --test "test/编排/"*.test.ts` → **300/300**（基线 299 + 收束块 1 → 2 例；既有用例零改动、未放松断言）。环境 Node v24.14.0 / Darwin 25.6.0。
- `npm run typecheck` → **全仓 0 错**（exit 0、`error TS` 计数 0）。
- 两例新增/重写内容和断言：
  1. **两档自适应金文本**：300 000 ms 逐行金文本（含文首/「不代表任何验收结论」）；30 000 ms → 「30 秒」、45 000 ms → 「45 秒」、59 999 ms → 「59 秒」（边界内侧）、60 000 ms → 「1 分钟」（恰跨档）、600 000 ms → 「10 分钟」（分钟档无上限）。
  2. **floor 与回退、常量自洽**：90 500 ms → 「1 分钟」（下界口径，不渲染 2 分钟）、500 ms → 「0 秒」；回退目标 = `WATCHDOG_DEFAULT_SILENT_MINUTES * 60_000` 渲染「30 秒」；`WATCHDOG_DEFAULT_SILENT_MINUTES === 0.5`；`0.5 × 60 000 === 30_000`（精确无浮点尾差）；六类非法输入（0 / -1 / -0.5 / ±Infinity / NaN）渲染与回退逐字相等。

## 六、常量选型与跨角色影响面登记（导出名未变；语义值变化）

**选型**：客户裁定两法皆可——「改名毫秒常量（如 `WATCHDOG_DEFAULT_SILENT_MS = 30_000`）」或「保名改值（`…_MINUTES = 0.5`）」。**选保名改值**：`test/测试/g2-verify/scope-audit.test.ts` **按名导入** `WATCHDOG_DEFAULT_SILENT_MINUTES`（该文件不在本角色边界内；改名即其编译断裂，`npm run typecheck` 全仓 0 错不可保）。**导出名零变化 ⇒ 全仓导入面无破坏**；变化的只是语义值（5 → 0.5）。

**影响面（准确清单，均不在本角色边界内；本项未改动）**：

| 消费方 | 现状 | 影响与处置 |
|---|---|---|
| `test/测试/g2-verify/scope-audit.test.ts:53` | `assert.equal(WATCHDOG_DEFAULT_SILENT_MINUTES, 5)` | **将红**（0.5 ≠ 5）。该断言属旧「裁定 1」审计块——其桌面侧断言（L49 `WATCHDOG_SILENCE_MS === 5*60*1000` 等）随复裁同样过期 ⇒ 该块整体需 测试 角色随新裁定刷新（**待 pm 派发**） |
| `test/测试/g2-verify/scope-audit.test.ts:184`、`contract-freeze.test.ts:64/85` | `renderClosurePrompt(5)`（旧分钟语义的书写残留） | 毫秒语义下 5 ms → 渲染「已持续 0 秒」；三处断言仅查标记形态/禁用词/归类 ⇒ **不红**，但数字语义过期，建议随 g2-verify 刷新改 `30_000`（**待 pm 转达登记**） |
| `app/desktop/watchdog.ts:588`（改前） | 传分钟数 | **桌面窗口已在并行批内按冻结接口改为传实测静默毫秒**（本项已只读核对其工作树 diff：`renderClosurePrompt(silentMs)` 直传、不再 `Math.max(1, Math.round(…/60000))`）；`WATCHDOG_SILENCE_MS` 默认 5 min → 30 s 亦其侧 |
| 测试/独立验证 | g2 冻结绑定与范围审计引用 | 复裁为既有裁定修订——独立验证口径应随之更新（登记） |

无数据/持久化格式迁移：收束文案是运行时渲染的投递文本，不落盘、无回放格式。

## 七、回滚

- 代码：撤销 `watchdog.ts` 两处 hunk（常量回 5、渲染器回分钟单档）+ 测试收束块回旧例 + 文档指针。**接口回滚须与桌面窗口联动**——桌面已按冻结接口传毫秒；仅回滚编排侧会把毫秒当分钟渲染（如实登记，禁单边回滚）。
- 文案逐字金文本、floor 口径、非法回退行为均有测试钉住，回滚后重跑 `test/编排/` 与 typecheck 即可验证。

## 八、边界声明与纪律

只写本角色 Section 1 内文件（`src/common/编排/watchdog.ts`、`test/编排/watchdog.test.ts`、本记录与 changelog/memo、旧修复记录的**后记指针**）。**未碰** `app/desktop/**`（仅只读核对 diff）、`test/测试/**`、其它角色文件、kanban-live-* 与 `/private/tmp` 真机轮目录（typecheck 退出码核对曾用临时日志 `/tmp/..ans-tc.log`，**已删除**——如实登记）。未 git 提交；未发真实模型请求。相关导航见[编排功能导航](../../feature-map.md)。
