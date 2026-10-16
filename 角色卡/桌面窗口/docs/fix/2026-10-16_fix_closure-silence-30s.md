---
id: fix-closure-silence-30s
type: fix
title: 完成态收束静默阈值 5min → 30s（客户 2026-10-16 run-5 裁定）桌面窗口实施记录
created: "2026-10-16"
updated: "2026-10-16"
status: 已实施待验证（单测全绿＋typecheck 0 错；独立验证与真机复验待测试/root）
---

# 完成态收束静默阈值 5min → 30s —— 桌面窗口实施记录

来源：客户 2026-10-16（run-5 真机观察后）对 G-2 收束阈值的**修订裁定**，PM 记档
[kanban 修复评审 §「客户裁定修订（2026-10-16，run-5 观察后）：收束阈值 5min → 30s」](../../../项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md)。
原 G-2 实施记录见 [2026-10-16_fix_g2-watchdog-and-recovery.md](2026-10-16_fix_g2-watchdog-and-recovery.md)（其余收束语义全部沿用，未动）。

## 〇、客户裁定（原文逐字）

> 「没有任务就应该直接收束啊，还等 5 分钟，是不是尬，应该是 su 自动收束」

裁定落地（PM 记档要点）：**完成态收束的静默阈值默认值改为 30 秒（一个 tick 的最小防抖）**；
env `ANS_DESKTOP_WATCHDOG_SILENCE_MS` 可调保留；**冻结接口**：`renderClosurePrompt(silentMs)`（文案
自适应「N 秒/N 分钟」）；派发：**桌面窗口**（默认值与判定）、**编排**（文案渲染器与常量）；随下一版
运行包发布。修订前的原裁定 1（5min/tick 30s）**其余部分仍有效**。

## 一、推理（为什么 30s 足够、5min 是纯延迟）

静默谓词成立时（全角色空闲＋投递队列全空＋无在途投递＋无待确认＋无 open/rebuild 链在跑＋su 空闲），
系统侧**已不可能再产生新的自动活动**——没有人/角色在飞任何东西，唯一的「新活动」只能来自客户或
su 自己。因此 5 分钟等待不含任何「等待什么发生」的语义，纯粹是收束提示的投递延迟。30 s
＝**一个 tick 的最小防抖**：足以防同一事件簇竞态（如收束前最后一轮 settled 与 tick 同刻到达、
投递机同 tick 内出队），又让「干完了」到「su 收到收束提示」的感知延迟从 ~5min 级降到 30s 级。

其余收束语义**一律不变**：滞回（每静默窗口恰一条）、反骚扰重武装（只认真实活动——看护自身
`system` 投递与 su 对收束提示的回复不算）、不强迫 su 断言「完成」、投递失败不消费窗口（下 tick 重试）、
预热（自导入以来 ≥1 轮 settled）。

## 二、改动点（行级；全部在本角色边界内）

### `app/desktop/watchdog.ts`（本角色目录 `app/desktop/` 内）

1. **`WATCHDOG_SILENCE_MS`：`5 * 60 * 1000` → `30_000`**（现第 68 行）。常量注释重写为完整裁定记档：
   裁定原文引用、PM 记档指针、「全空闲＋队列全空即不可能再有自动活动、5 min 纯属延迟、30 s＝一个 tick
   的最小防抖」推理、env 可调保留。
2. **模块头注释「完成态收束」段**（现第 30-37 行）：默认值表述 5 min → 「30 s＝一个 tick 的最小防抖」，
   并补裁定出处指针（PM 记档＋本文件）；防骚扰回路的措辞由「总结完 → 5 分钟又催」改为
   「总结完 → 又被立即催」（30s 阈值下骚扰回路隔离更须严格——阈值越短、误重武装的代价越高）。
3. **收束触发块**（现第 597-609 行）：删除 `Math.max(1, Math.round((at - closure.silenceSince) / 60000))`
   的分钟取整下限（旧式会把 30 s 静默**谎报**成「已持续 1 分钟」）；静默毫秒数 **`silentMs =
   at - closure.silenceSince` 直接**传入编排渲染器 `renderClosurePrompt(silentMs)`（冻结接口）；
   队列行 summary 同步改为自适应时长：`系统·收束 · 已无进行中任务（静默 ${formatDurationMs(silentMs)}）`
   （`formatDurationMs`＝本模块既有的事实行时长格式化，<60s「N 秒」、≥60s「M 分 S 秒」）；
   诊断 `watchdog.closure` 的 `durationMs` 复用同一 `silentMs`（值不再变）。
4. 同文件其余阈值（tick 30s、#1-#4、风暴护栏）**未动**。

### `app/desktop/session.ts` / `app/desktop/interface.ts`（仅注释同步，行为零改动）

- `session.ts`（约第 1279 行）：`fromSystemDelivery` 排除注释里的旧「5 分钟又催」表述同步为
  「又被立即催＋30s 阈值下隔离更须严格」。
- `interface.ts`（约第 256 行）：`watchdogOptions` 注释「静默 5min」→「静默 30s〔客户 2026-10-16 run-5
  裁定：5min → 30s〕」。

## 三、测试（全部在本角色边界内）

### `test/桌面应用/session.test.ts`（现 23 例全绿；本批 1 新增＋3 强化）

- **配置**（强化）：默认 `silenceMs === 30_000`（原断言 5min）；env 覆盖仍生效（180000）；
  **新增** env 毫秒口径 sub-minute（5000 合法）与**非法值回退默认 30_000**。
- **新增「env 覆盖经服务生效」**：只经 `config.env`（沿生产口径，不传覆盖）令
  `ANS_DESKTOP_WATCHDOG_SILENCE_MS=5000` → 静默 4.999s 不投、恰 5s 即投；text＝
  `renderClosurePrompt(5_000)`（ms 直传）；summary＝「静默 5 秒」（sub-minute 自适应）。
- **W3 收束滞回**（重写）：**静默恰 30s（含边界）触发恰一条**（29s 不投）；text 与
  `renderClosurePrompt(30_000)` **同参直调逐字相等**（钉 ms 直传、不取整——旧式会得到
  `renderClosurePrompt(1)`）；text 含「30 秒」且不含「1 分钟」（sub-minute 文案正确、杜绝取整谎报）；
  summary 逐字＝「系统·收束 · 已无进行中任务（静默 30 秒）」；**两 tick 内不重复**（fired 滞回）；
  su 的收束回复（system 持有 settled）不重武装；真实活动重置后第二条＝
  `renderClosurePrompt(32_000)`（新窗口实际静默毫秒数）。
- **W3 投递端异常**（强化）：32s 静默投失败 → 不标已投；下 tick 重试成功恰一条且复用同一毫秒数
  （`renderClosurePrompt(32_000)`）。
- 其余 W1 用例（#1-#4/风暴/排除项/看护故障）随夹具默认值 30s 全数复跑绿（逐例核过：仅 W3 组与
  配置组涉及时序/默认值断言）。

### `test/桌面应用/message-queue.test.ts`（现 11 例全绿）

- G2 集成夹具默认 `silenceMs: 30 * 1000`（与生产默认同值）；W3 集成用例标题/推进改「恰 30s」
  （两处 5min+2s → 30s+2s）——真实投递机链（入队/送达/settled 重武装）在 30s 口径下复跑绿。

### 命令与计数（2026-10-16 本机）

- `node --test test/桌面应用/session.test.ts` → **23/23 过**；`node --test test/桌面应用/message-queue.test.ts`
  → **11/11 过**；`node --test test/桌面应用/*.test.ts` 全目录 → **346/346 过 / 0 红**。
- `npm run typecheck` → **全仓 0 错**（exit 0）。
- 跨边界只读复跑（不在本角色写面，仅证据）：`test/编排/watchdog.test.ts` 12/12、
  `test/测试/g2-verify/contract-freeze.test.ts` 6/6。

## 四、与编排冻结接口的对接（`renderClosurePrompt(silentMs: number)`）

编排（O1）已**并行落树** `src/common/编排/watchdog.ts` 的新渲染器：参数单位毫秒、时长自适应两档
（≥60 000 ms「N 分钟」／<60 000 ms「N 秒」，floor——显示值为实际静默时长的下界，不夸大）、非法输入
回退批准默认 30 秒（`WATCHDOG_DEFAULT_SILENT_MINUTES = 0.5`）。本角色按冻结接口**只读调用**：调用点仅
`app/desktop/watchdog.ts` 一处，传 `silentMs`（实际静默毫秒数）。对接验证：本角色测试以「同参直调逐字
相等」钉 wiring（落树前后均稳定），并在双落树后复跑断言「30 秒」实文案——**对接通过**。本角色
**未改** `src/**` 任何文件（含 `src/common/编排/watchdog.ts`——只读导入）。

## 五、回滚

回滚＝把 `app/desktop/watchdog.ts` 的 `WATCHDOG_SILENCE_MS` 恢复为 `5 * 60 * 1000`（即 300000），
并同步还原触发块的分钟取整传入（`renderClosurePrompt(Math.max(1, Math.round(silentMs / 60000)))`
与 summary「（静默 N 分钟）」）——**注意编排侧参数单位已是毫秒（另一属主）**：若仅回滚本侧默认值而
不回滚传参口径，则「已持续 N 分钟」文案与判定阈值仍自洽（毫秒直传对任意阈值成立），**不需要**恢复
分钟取整即可回滚到「5 分钟阈值」语义；仅当要求连文案口径一并回到旧版时才还原传参。测试同步回滚
（session/message-queue 两组夹具默认值与 W3 断言）。无数据迁移、无对外契约回滚（env 名/投递机/
滞回语义均未变）。

## 六、范围声明（如实）

- 写面全部在本角色 `boundary.yaml` Section 1 之内：`app/desktop/`（watchdog/session/interface 三文件）、
  `test/桌面应用/session.test.ts`、`test/桌面应用/message-queue.test.ts`、本角色 `docs/fix/`、changelog、memo。
- **未触碰**：`src/common/编排/watchdog.ts` 及 `src/**`（编排并行属主；只读导入）、`app/renderer/**`、
  `test/编排/**`、`test/测试/**`、其他角色文件、kanban-live-* 与 `/private/tmp` 轮次目录；未 git 提交。
- 已知基线（不在本次范围）：`test/桌面应用/tool-rows.test.ts`/`e2e` 中作为**归类样例**的旧文案字符串
  「已持续 5 分钟」仅为分类器输入样例（前缀判据），与阈值语义无关，属桌面UI 边界，未动。
