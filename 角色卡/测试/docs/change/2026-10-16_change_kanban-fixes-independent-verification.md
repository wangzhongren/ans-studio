---
id: kanban-fixes-independent-verification
type: change
title: 2026-10-16 kanban 修复实施批次独立验证报告（测试角色）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: verified
related: [kanban-fixes-pm-review, kanban-runtime-fixes-dispatch, core-kanban-shell-exec-proposal, fix-kanban-delivery-and-operator, pi-kanban-turn-truncation-fix-proposal, kanban-f4-governance-note-fix, fix-kanban-shell-audit-f6]
events:
  - date: "2026-10-16"
    kind: verified
    summary: 独立复验完成——冻结绑定（HEAD 27bc263 + 77 条目 sha256）、全量 1471/1470/0/1 + typecheck 0、范围审计无夹带无越界、25 条独立对抗用例全绿；发现 0 项不通过、4 项存疑/差异（详见文末）
  - date: "2026-10-16"
    kind: verified
    summary: G-1 格式收口后金文本跟进——f2-claim-release 本地 dispatchTemplate 改接编排单一来源 renderDispatchPrompt（时序/行为断言零改动、非放松）；f2 2/2、test/测试 182/182、全量 1528/1527/0红/1skip、typecheck 0（详见文末追加节）
---

# 2026-10-16 kanban 修复实施批次独立验证报告（测试角色）

**验证对象**：客户 2026-10-16 按推荐批准、六个实施上下文交回、PM 已完成收口的 kanban-live 修复批次（F-1..F-9 批准范围，见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §客户批准记录、实施派发记录与 PM 收口记录）。

**整体结论：通过（0 项不通过；4 项存疑/差异，均如实列明、不影响批准范围的落地判定）。**

本报告全部证据落在本角色证据目录 `角色卡/测试/docs/change/2026-10-16-kanban-fixes-verification-evidence/`（下称「证据目录」，路径均相对仓库根；`raw/` 下为原始输出）；独立用例在本角色边界内 `test/测试/kanban-fixes-verify/`（7 文件 25 例）。全程只写 `test/测试/` 与 `角色卡/测试/`；未改任何 src/app/他角色文件；未 git 提交；kanban-live 与 2026-10-15 证据目录只读。

---

## ① 冻结绑定（本结论对应哪一版代码）

- HEAD＝`27bc2631fa908ae4803b04018724b5a6a02f87cb`（2026-10-15 23:04:35 +0800，`raw/head-frozen.txt`）——批次全部改动**未 commit**、停在**工作树**（本就如此交付）。
- 冻结时工作树：`git status` **67 个已跟踪文件修改 + 10 个新增条目**（77 行，含 1 个新建文档目录展开；`raw/git-status-frozen-nul.txt`、`raw/git-status-bound.txt`）。与「PM 收口 63 改 + 9 新增」的差异见 §⑤-1（已定位为 PM 自身收口记录的记账时点差）。
- **全部 77 个条目的 sha256 已冻结**：`raw/sha256-frozen.txt`（排序文件，shasum -a 256 逐文件；本文件自身 `53c4c10b…12eca7`）。复验结束再次逐文件重算并 diff → **逐字节一致**（`raw/sha256-recheck.txt`；输出 `FROZEN-HASHES-UNCHANGED`）——本报告全部结论绑定且仅绑定该版本。

关键实现文件指纹（摘自冻结清单，完整 77 条见该文件）：

| 文件 | sha256（前 16）|
|---|---|
| src/provider/runtime/tools.ts | `8e67ca1f2ca4c047` |
| src/common/runtime-core/tool-display.ts | `ebe7f8b1d579b167` |
| src/common/pi-adapter/lifecycle.ts | `6ab1b83fba47bba3` |
| src/common/pi-adapter/real-adapter.ts | `2cd8da31f56f79c0` |
| app/desktop/session.ts | `907dab98235e9ef1` |
| app/desktop/operator-channel.ts | `4715828162c015b4` |
| src/service/gate/resolve-write.ts | `12fa84944599cc44` |
| src/common/编排/shell-audit.ts | `0dcda6bb7915271d` |
| src/common/编排/shell-gate.ts | `a874612ce85cfce5` |
| app/renderer/tool-rows.js | `3eef5bfd960f9b09` |

## ② 全量复跑

| 命令 | 原始计数（冻结版本） | 证据 |
|---|---|---|
| `node --test "test/**/*.test.ts"` | **tests 1471 / pass 1470 / fail 0 / skipped 1 / exit 0**（约 17.3s） | `raw/full-test-run.txt` |
| `npm run typecheck` | **0 错误**（退出码 0） | `raw/typecheck.txt`（typecheck exit=0） |

- 与 PM 收口数字 **1470 计 / 1469 过 / 0 红 / 1 跳过** 的差异＝**+1 计 / +1 过**：定位到 `test/项目管理/shared/diagnostics.test.ts` 的**收尾小项新用例**「执行时限元数据落盘：timeoutMs 有限数值保留…」（PM 收口记录自己写明该小项在计数之后「已派项目管理角色补齐」——+1 恰好是该用例；已核对 diff 仅新增、未动既有断言）。
- 记忆中「2 条基线红」：**在本冻结版本确实不复现**——`test/桌面应用/pi-config.test.ts` 独跑 **15/15 过**、`test/项目管理/shared/path-primitives.test.ts` 独跑 **21/21 过**（两文件均不在本批次改动集内，属更早提交已修复，与 PM 结论一致）。
- 加入本角色独立 harness 后复跑（对照）：**1496 / 1495 过 / 0 红 / 1 跳过 = 1471 + 25**，零相互干扰（`raw/full-test-run-with-verifier-harness.txt`）。

## ③ 范围审计（对照批准表逐项）

### 3.1 批准实施项是否真实落地——逐项核对（读码 + 行为/测试证据）

| 批准项 | 落点核对（file:line 为冻结版本） | 判定 |
|---|---|---|
| F-1 全套（a/b/c/d） | `timeout.ts:31-33`（`DEFAULT_SHELL_EXEC_TIMEOUT_MS=600000`＋`SHELL_EXEC_TIMEOUT_ENV`）；`model/runtime.ts:281,389-392,365-368`（选项/facts.timedOut,timeoutMs/process.timedOut）；`tools.ts:517-594`（deadline 定时器＋共享幂等 `terminate()`＋SIGTERM→250ms→SIGKILL→1000ms 预算不变）；`tools.ts:661-681`（超时分支「超时已终止（N ms）」＋部分输出＋轮次继续）；`tools.ts:1117-1121`（解析链 选项??env??默认，0/负/非法回退默认）；诊断 `shell.exec.start/timeout` | 通过 |
| F-1-opt1 进程树 | `tools.ts:486-503`（POSIX `detached:true`＋`process.kill(-pid)` 回退；Windows `taskkill /T /F`）；`tools.ts:521-523` | 通过（Windows 分支本机不可跑，见 §⑤-2） |
| F-7 必需＋opt1＋opt2 | `tools.ts:319-348`（`splitCommand` 同源返回 argv＋unquoted）；`361-430`（必需集合、紧贴重定向、内嵌、展开、逐字文案）；`614-628`（守卫在 gate 之前、不 spawn、diagnostics `shell.guard.blocked`） | 通过 |
| F-8-a | `tool-display.ts:131-152`（`已执行完成（退出码 N）`/`超时终止` 分类；ok/status/kind/errorCode 不变；`display.process.timedOut` 正向＋再投影两处） | 通过 |
| F-3-c（schema 文案） | `schema.ts:147-149`（submit_report 第三条 guideline） | 通过 |
| F-5-opt2（schema 文案） | `schema.ts:52-63`（「读取与检查无需逐次确认；写盘一律先经本工具确认」，preview/confirmed:true 两句保留） | 通过 |
| F-9-opt2（立项评估） | 新文档 `角色卡/运行时核心/docs/design/2026-10-16_design_f9-opt2-tool-result-size-window-linkage.md`（90 行，无代码改动；`MAX_SHELL_OUTPUT_BYTES` 仍 1 MiB） | 通过 |
| F-2-M1 | `session.ts:1671-1674`（链注释）＋`1695-1712`（drainQueueUnsafe 收窄说明）＋`1772-1806`（认领段：claim.start→shift→置忙/登记/delivery.start→取 send promise）＋`1808-1883`（分离续段 IIFE，成功/失败记账逐支保留）＋`1875-1883`（链外就地拒收＋claim.end） | 通过 |
| F-2-opt2 | `session.ts:465-481`（`openChains` 按会话键互斥）＋`808-827`（`openInternal` 包装）＋重建续段直调 `openInternalUnsafe` 防死锁（`736-741`） | 通过 |
| F-2-opt3 | `session.ts:1771-1772,1796,1881`（`delivery.claim.start/end`） | 通过 |
| F-4-M1 | `operator-channel.ts:522-530`（`readConfirmTimeoutMs` 专用 env→`SHELL_REVIEW_TIMEOUT_ENV`（从编排 `shell-deadline.ts` 只读导入）→120000）＋`385`（presenter 兜底 +5000 同步跟随） | 通过 |
| F-4-M2 | `operator-channel.ts:269-283`（超时以 `confirmTimeoutError(timeoutMs)` 中止组合信号）＋`423-437`（cancel 读 `signal.reason` 分流文案）+`486-495`（标记携带 timeoutMs） | 通过 |
| F-4-opt1 | `main.ts:264-265`（`focus`/`show` → `shellConfirm.replayPending()`，幂等） | 通过 |
| F-4-opt2 | `operator-channel.ts:427-436`（`shell-confirm.timeout/cancelled` 诊断） | 通过 |
| F-8-b 桌面窗口 | `session-history.ts:86-102`（`classifyProcessOutcome`）＋`202-227`（行归类；旧文本行不变）＋`runtime-history.ts:38-43,66-73,83-90`（事件路与旧投影路同一判据） | 通过 |
| F-5-opt1 桌面侧 | `session.ts:348-354`（`confirmGated` 定格）＋`737-756`（重建后仅确认制会话经 `queueModelNotice` 排单一来源注记；防御式 `?.`；失败不打断） | 通过（读码＋属主单测；见 §⑤-4） |
| F-3-a/b | `lifecycle.ts:13,26-29,57-65,76-97`（截断识别＋每轮恰一条系统行＋settled detail `truncation:"length"`＋`wasTruncated()`＋`seal()`）；`real-adapter.ts:621-635,706-732,927-941,1027-1042`（补发判据/恰一次结构保证/best-effort/记账） | 通过 |
| F-5-main | `resolve-write.ts:71-90`（`issuedByRootOf`）＋`92-101`（`F4_DENIAL_GUIDANCE`）＋`179-187`（F4 分支原头逐字＋指引＋列表换语义）；`decision.ts` 仅注释；`boundary-core.ts:107-113`（su 卡「确认制要点」段） | 通过 |
| F-6-1 | `shell-audit.ts:99-110,116-155`（`refreshGate` 刷新一次重试、切活跃门禁、链式原因）＋`shell-gate.ts:705-717,726-740`（注入包装，缺省不传=旧行为）＋`shell-arming.ts:118-131,196-209,152,226`（两处装配注入共享载入器刷新闭包） | 通过 |
| F-6-2 | `shell-gate.ts:329`（去重状态声明）＋`633-665`（按 reason 去重＋恢复落盘行；判定不翻转）；`shell-audit.ts:124-126`（删「缺少条件？」猜测） | 通过 |
| F-4-X1 | `shell-gate.ts:568-583`（unavailable 转达通道真实 reason；缺原因走如实兜底句，不再「无人值守？」；归因码仍 `a-unavailable`） | 通过 |
| F-3-d | `handback.ts:344-351`（仅 terminal-fallback 且 `detail.truncation==="length"` 附「（截断：stopReason=length）」） | 通过 |
| F-5-opt1 编排侧 | `run-role.ts:238-245`（导出单一来源 `REBUILT_SESSION_WRITE_PERMITS_NOTICE`）＋`295-306`（`queueModelNotice?` 语义钉死）＋`532,642-656,676-688,707-712`（下一轮输入前缀、送达一次消费、未开轮保留） | 通过 |
| F-8-b 桌面UI | `tool-rows.js:113-127`（`timed-out`/`exited-nonzero` 结构化事实优先；标签/exceptional；旧正则并存）＋`renderer.js:1017-1018,1042-1044`（「消息/错误」标注与错误预览让位）＋`test/桌面应用/e2e/uiux-v2.mjs:350`（期望同步） | 通过 |
| G-1（产品细化） | 新文档 `角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md`（218 行） | 通过（性质＝文档；内容细化的评审不属本次复验范围） |
| Claude/Codex 截断同构评估 | 两份新评估文档，`status: draft/assessment-only`，无代码改动 | 通过 |

### 3.2 未勾选项**必须未实施**——逐项核查（全部「未实施」成立）

| 未批准项 | 核查方法与证据 | 结论 |
|---|---|---|
| F-2-opt1（链键降为每队列） | `session.ts:1677-1678` `drainQueue` 的 `const key = projectRoot` 原样（仍按项目）；`drainChains` 注释仍写「每项目一条」 | **未实施** ✓ |
| F-4-opt3（提高默认确认超时） | `operator-channel.ts:72` `DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS = 120000` 原值 | **未实施** ✓ |
| F-5-opt3（写权跨重建保留） | `run-role.ts` 无「重建恢复已发行路径集」任何代码（issued 仍为闭包内只增集合、重建新句柄清零——`queueModelNotice` 只是如实注记，不恢复任何写权）；桌面重建路径无回传发行集 | **未实施** ✓ |
| F-6-opt2（验收变化主动重建） | `app/desktop/` 无「收尾/验收变化 → 主动重建持有旧快照会话」逻辑（grep 无命中；重建仍仅交互/O-1 时机触发） | **未实施** ✓ |
| F-6-opt3（J-1 时序消除） | 派发/收尾次序未动（`run-role.ts` finalize 调用点不变） | **未实施** ✓ |
| F-9 各项（opt1 压缩可见化/opt3 口径/opt4） | `src/common/pi-adapter/` 无 `compaction_end` 订阅、无 `estimatedTokensAfter`；`settings.ts`/`provider-config.ts`/`timeout.ts`（适配器侧）未改（不在 git status 变更集） | **未实施** ✓ |

### 3.3 边界未越（抽查 file:line 归属 × boundary.yaml Section 1）

| 抽查点（冻结版本） | 应属角色（Section 1 条目） | 判定 |
|---|---|---|
| `src/provider/runtime/tools.ts:624`（F-7 守卫接线） | 运行时核心（`src/provider/runtime/tools.ts`） | ✓ |
| `src/common/runtime-core/tool-display.ts:152`（F-8-a 分类） | 运行时核心（`src/common/runtime-core/`） | ✓ |
| `app/desktop/session.ts:1808`（F-2-M1 分离续段） | 桌面窗口（`app/desktop/`） | ✓ |
| `app/desktop/operator-channel.ts:274`（F-4-M2） | 桌面窗口（`app/desktop/`） | ✓ |
| `src/common/pi-adapter/lifecycle.ts:61`（F-3-b） | Pi适配器（`src/common/pi-adapter/`） | ✓ |
| `src/service/gate/resolve-write.ts:177-188`（F-5-main） | 门禁引擎（`src/service/gate/resolve-write.ts`） | ✓ |
| `src/common/编排/shell-audit.ts:116-155`（F-6-1） | 编排（`src/common/编排/`） | ✓ |
| `app/renderer/tool-rows.js:113-127`（F-8-b） | 桌面UI（`app/renderer/`） | ✓ |
| `src/common/shared/diagnostics.ts`（`timeoutMs` 入白名单） | 项目管理（共享组件属主；PM 收口已记「已派项目管理角色补齐」）；**excerpt 未入白名单**＝PM 裁定已接受的偏差（与设计契约一致） | ✓（经 PM 流程） |

其余改动文件（各角色 memo/changelog/提案实施记录、PM 评审与登记文档、测试文件）逐一核对均落在对应角色 Section 1（docs/fix、docs/design、docs/change、memo、changelog 等条目）内，未发现任何角色改动他人文件。测试文件归属同样核对：`test/runtime-core/*`↔运行时核心、`test/pi-adapter/*`↔Pi适配器、`test/门禁引擎/*`↔门禁引擎、`test/编排/*`↔编排、`test/桌面应用/{dispatch-delivery,handback-delivery,message-queue,queue-withdraw-lru,session-history,multi-runtime,operator-channel,boundary-refresh}.test.ts`↔桌面窗口、`test/桌面应用/{renderer,tool-rows}.test.ts`＋`e2e/uiux-v2.mjs`↔桌面UI、`test/项目管理/shared/diagnostics.test.ts`↔项目管理。

**测试 diff 削弱扫描**：全部被改测试文件里，被删除的断言行仅 1 处——`test/编排/shell-review-chain.test.ts` 的 `/不可用/` 改为更严的「转达通道真实 reason（`/无 TTY/`）＋不含『无人值守』」两条（F-4-X1 的预期措辞变更，非放松；diff 逐行核对）。无任何测试删除/放水。

## ④ 对抗性行为核对（独立构造，不复用实施方断言）

独立用例目录 `test/测试/kanban-fixes-verify/`（7 文件 25 例），命令与原始计数：

```
node --test "test/测试/kanban-fixes-verify/"*.test.ts
→ tests 25 / pass 25 / fail 0 / skipped 0   （raw/independent-tests.txt）
```

| 域 | 独立构造的关键场景（与本报告结论直接相关的断言） | 结果 |
|---|---|---|
| **F-7**（f7-guard.test.ts，4 例） | 未加引号独立 token `;`／`2>/dev/null`／`>>`／`&&`／`\|\|`／`<` → `run_shell 未执行`＋回显命中 token＋**gate 零调用**＋无 `shell.exec.start`；`touch 标记 \| sort` 后标记文件不存在、目录为空（零副作用）；`grep -n "a\\\|b" 文件` 与未加引号 `grep a\\\|b` **真实执行 exit 0 且产出匹配行**；opt1 内嵌 `find . -name x\|sort` 拒绝且附「加引号」指引、URL 词中 `&` 不判（到达审核）；opt2 `echo $HOME`／`echo $(pwd)` 拒绝，`echo '$HOME'` **真实执行打印字面量 $HOME** | **通过 4/4** |
| **F-1**（f1-timeout.test.ts，4 例） | env `ANS_PI_SHELL_EXEC_TIMEOUT_MS=250`：挂起 node 到期终止、文案含「超时已终止（250 ms）」、`execution.timedOut=true/timeoutMs=250`、wall<5s；**共享 AbortSignal 保持未中止**（轮次继续语义）且随后的命令 exit 0；**孙进程终止**：父脚本派生孙进程写 pid → 超时后轮询 pid 消失（进程组收口）；SIGTERM 免疫子进程被 SIGKILL 升级（late 文件不出现）；快命令＋显式 600000 不误杀、诊断 `shell.exec.start.timeoutMs=600000`（选项优先于 env） | **通过 4/4** |
| **F-3**（f3-length-followup.test.ts，3 例） | 自建桩件驱动 `makeRolePrompt`＋真实 lifecycle：截断轮后**恰一次**补发（第二轮文本===导出常量）；截断系统行**恰一条**且 detail `truncation:"length"`；补发通知行恰一条；settled **恰一次**；env 显式关闭值解析为关＋`enabled:false` 恰一轮、无补发行、**外推事实仍可见**（settled 携 truncation）；已交报告（`wasReportSubmitted=true`）不催交 | **通过 3/3** |
| **F-2**（f2-claim-release.test.ts，2 例） | 自建 SessionManager 夹具＋可控挂起 send：场景 1——A 目标 send 挂起期间 su 派发 B，**B 在 A 轮未结束时立即收到（<1s）**（修复前链被 A 持有必失败）；场景 2——同目标投递进行中再派 ⇒ **不并发 send**（调用数保持 1）；settled 后**按序放行**（先到/后续两条都到位）；两场景同会话并发峰值均 ≤1 | **通过 2/2** |
| **F-8**（f8-classification-chain.test.ts，4 例） | **同一执行事实贯穿三级**：①投影产物直接喂 ②③——exitCode 3（无 error/signal/timedOut）→ 投影摘要「已执行完成（退出码 3）」且 kind 仍 denied（契约不变）→ `classifyProcessOutcome`＝`exited-nonzero` → `activityOf` status=`exited-nonzero`、label 一致、`exceptional=false`；timedOut → 投影「超时终止」＋`process.timedOut` → `timed-out` → label「超时终止」、`exceptional=true`；spawn 失败 → 仍「执行失败」、classify=null、activityOf 标红；旧行（无结构化事实）classify=null、文本口径逐字保留 | **通过 4/4** |
| **F-5**（f5-f6-verification.test.ts，3 例） | F4 仍拒＋原头逐字＋指引含 `request_confirmation`/`preview`/`confirmed:true`/「许可按会话生效」；**列表＝当前已发行可写集**（三项 writeSet 中越界项滤除、恰列两项；空集两根皆空；不在列表出现边界条目 `docs`）；条件未激活的已发行项不计入、激活后计入并可真实放行；writeSet 内路径照常放行；非 F4 分支列表回退边界覆盖、不混入 F4 指引 | **通过 3/3** |
| **F-6**（同上，2 例；另复跑编排回归） | sink 级最小复刻：首查拒→刷新恰一次→重试放行落盘恰一行、恢复后直走新门禁（刷新不再发生）；refresh 仍拒→链式原因两段事实、零副作用；refresh 抛错→如实；无 refreshGate→旧行为且不再含「（缺少 shell-gate 条件？）」猜测。**另复跑编排既有事故回归**：`node --test test/编排/shell-arming.test.ts test/编排/shell-gate.test.ts` → **29/29 通过**（`raw/orchestration-f6-regression.txt`），其中 F-6-T6（创世过渡窗复刻：窗内首查未落盘零副作用→收尾落盘→再审自愈恰一条→连续追加）与 T6b（不注入刷新闭包的对照组仍不落盘）互为对照、断言含义经我方独立复述（见下）| **通过 2/2 ＋ 回归 29/29** |
| **F-4**（f4-operator-channel.test.ts，3 例，超出必核清单的加核） | 未设专用 env 时确认超时**跟随** `ANS_PI_SHELL_REVIEW_TIMEOUT_MS=200`（reason `>200ms`、wall<2s，非 120s）；专用 env 150 压过 5000；超时以**带标记原因**（name=`OperatorConfirmTimeoutError`、`timeoutMs=120`）经组合信号传播到 presenter 的 `signal.reason`（F-4-M2 机制） | **通过 3/3** |

**F-6-T6 断言含义独立复述**（编排既有回归）：它复刻真机 13:21:38 时序——用「`.ans` 尚无、gov.path 空」的装配快照审一条命令，断言**判定照常放行但审计未落盘且零副作用**（fail-closed 应有残留）；随后按生产渲染器写出治理边界文档＋`.ans`（pin 当场重算），再审一条，断言**刷新闭包重读盘上验收后自愈落盘且恰一条**（首条物理不可恢复、不补记）；最后第三条断言恢复后连续追加（不再刷新）。对照组 T6b 断言**不注入刷新闭包时第二条仍不落盘**——两组互为判别，证明修复动因真实在场。

## ⑤ 判定汇总、差异与存疑

### 汇总

| 复验域 | 通过 | 不通过 | 存疑 |
|---|---|---|---|
| ① 冻结绑定 | 1/1 | 0 | 0 |
| ② 全量复跑＋typecheck | 2/2 | 0 | 0 |
| ③ 范围审计（落地/夹带/边界） | 26 项（行）落地全过；6 组未勾选项均未实施；边界抽查 9 处全过 | 0 | 0 |
| ④ 对抗性核对 | 25/25（＋F-6 回归 29/29） | 0 | 0 |

### 存疑/差异项（均不影响「通过」判定）

1. **与 PM 收口计数的两处出入**：文件数 67 改＋10 新增（我，冻结态）vs 63 改＋9 新增（PM）；行数 +2548/-123 vs +2502/-120；测试 1471 vs 1470。①测试 +1 已精确定位（diagnostics 收尾小项用例，PM 计数发生在其落地前）；②行数差 +46/-3 **恰等于** PM 评审文档终稿（+44/-3）与 PM memo（+2/-0）两文件的改动量，且多出的 1 个新条目＝`角色卡/项目管理/changelog.md`（5 行）——即差异全部落在 **PM 自身收口记录的记账时点差**，不涉及任何实施项；余下文件计数（4 改）无法从现有记录逐一对齐到具体文件，如实登记为**记账差异**（非范围差异——全部文件均在批准角色白名单内）。
2. **F-1-opt1 Windows 分支未真机执行**：本机 darwin，`taskkill /T /F` 分支仅代码路径存在＋typecheck 通过（实施方已如实声明「未实际跑过」；我同样无法在本机执行）。POSIX 进程组分支已被我独立实测（孙进程终止例）。
3. **F-7-c excerpt 不落盘＝已接受偏差**（PM 裁定，登记在案）：我核查 `diagnostics.ts` FIELD_NAMES 现含 `timeoutMs`、**不含 `excerpt`**，与 PM 裁定及设计契约一致；守卫命中 token 经 `reasonCode` 落盘（我的 F-7 用例已断言）。**不视为缺陷**。
4. **F-5-opt1（跨桌面/编排）与 F-4-V1 渲染可见性**：模型可见注记的桌面接线与编排实现（下一轮输入前缀、送达一次消费）经读码＋双方属主单测（`boundary-refresh.test.ts` F-5-opt1 两条＋`session-handle.test.ts` 一条）＋全量绿确认；**未做**跨边界真机链路观测。F-4-V1（卡片可见性）与真机断点观测按 PM 计划属**下一轮真机 E2E**，本报告不声称已验。
5. 真机 E2E 复跑（含 F-2/F-3/F-4 断点观测）与未部署声明：本批次整体状态仍为「已实施未部署/真机未复验」，与各提案实施记录一致。

## 证据索引（均在本报告目录内）

- `raw/head-frozen.txt`、`raw/git-status-frozen-nul.txt`、`raw/git-status-bound.txt`、`raw/sha256-frozen.txt`、`raw/sha256-recheck.txt`（冻结绑定与复检）
- `raw/full-test-run.txt`、`raw/typecheck.txt`、`raw/full-test-run-with-verifier-harness.txt`（全量复跑）
- `raw/diff-stat.txt`（+2548/-123 原始 stat）
- `raw/independent-tests.txt`（本角色 25 例独立对抗用例全量输出）
- `raw/orchestration-f6-regression.txt`（编排 F-6 既有回归 29/29 复跑）
- 独立用例源码：`test/测试/kanban-fixes-verify/{f7-guard,f1-timeout,f3-length-followup,f2-claim-release,f8-classification-chain,f5-f6-verification,f4-operator-channel}.test.ts`

## 只读引用（未改动）

- 批准与收口：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md`
- 五份提案（含实施记录）：`角色卡/{运行时核心,桌面窗口,Pi适配器,门禁引擎,编排}/docs/fix/2026-10-15_fix_kanban-*.md`
- 2026-10-15 真机证据目录：`角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/`

---

## ⑥（追加，2026-10-16）G-1 格式收口后金文本跟进：`f2-claim-release.test.ts`

**性质：批准范围内的格式收口跟进，非行为变更，非「为变绿改测试」。** 前文 §① 冻结绑定仅覆盖 2026-10-16 当时冻结版本；本节改动发生在其后，自带独立证据（`raw/g1-followup-*`）。

### 6.1 背景与改前红态（实跑复现）

客户 2026-10-16 批准 G-1 实施（PM 六项裁定）：派发文本渲染收口到单一来源 = 编排 `renderDispatchPrompt`（`角色卡/编排/docs/change/2026-10-16_change_contract-workflow-dispatch-a1.md` §三/§五），桌面窗口按 A2 接线并**按批准删除本地副本** `renderDispatchPromptLocal`（`角色卡/桌面窗口/docs/fix/2026-10-16_fix_g1-dispatch-required-reading.md`）。本套件 `dispatchTemplate`（原 :32）断言的正是**已删除的桌面旧单行内联模板**，故全量仅有的 2 红即 :125/:160 两处末段金文本比对——实施方与其登记依赖（「落地后必须切换」）的必然结果，桌面窗口 fix 记录 §六.1 亦交叉登记。

改前本角色实测（仅此两处失败、时序断言全过）：actual = 单来源无引用旧格式三行逐字（`[派发] 来自 su 的任务`＋换行＋任务＋换行＋`完成后请交回报告（改了什么/结论/证据）。`）vs expected = 旧单行 `[派发] 来自 su 的任务：<task>——完成后请交回报告`。两例的**跨目标不阻塞 / 同目标排队 / 并发峰值 ≤1 等时序断言在改前即全部通过**。

### 6.2 改了什么（行级；文件 sha256 `2d5acc90…3bbf444`；diff 存 `raw/g1-followup-diff.txt`，49 行）

| 位置（改后行号） | 改动 |
|---|---|
| :11 | 新增值导入 `import { renderDispatchPrompt } from "../../../src/common/编排/handback.ts";`（与既有 `import type` 分行，循 `test/桌面应用/dispatch-fresh-enum.test.ts` 先例） |
| :33-37（原 :32） | 本地 `dispatchTemplate` 由单行内联字面量改为单来源渲染一行：`const dispatchTemplate = (task: string) => renderDispatchPrompt({ roleId: "A", task });`＋4 行注释登记收口理由；`roleId` 不进入文案（handback.ts 注明「用于路由与校验」），取 `"A"` 与真实路由渲染逐字一致 |
| :130/:135/:165（原 :125/:130/:160，共 4 处调用） | 签名跟进 `dispatchTemplate("su", X)` → `dispatchTemplate(X)`；四个任务文本与断言对象不变 |

### 6.3 为什么不是放松

- **行为断言一字未动**：两个用例的时序断言、并发峰值断言、自建夹具（可控挂起 send 的 SessionManager）与用例结构零改动。
- **断言强度等价**：原先钉「投递实际文本 == 旧桌面模板」，现钉「投递实际文本 == 单一来源渲染文本」——后者即产品现状本身，且单一来源格式已由编排 14 例（`test/编排/dispatch-reads.test.ts`，「无引用逐字旧格式」逐行金文本）另行钉住；仍为逐字 `deepEqual`，未改包含匹配等弱化形式，未删任何断言。

### 6.4 复跑结果（本角色实跑；Node v24.14.0 / Darwin 25.6.0）

| 命令 | 结果 | 证据 |
|---|---|---|
| `node --test "test/测试/kanban-fixes-verify/f2-claim-release.test.ts"` | **2/2 过 / 0 红**，exit 0 | `raw/g1-followup-f2-file.txt` |
| `node --test "test/测试/**/*.test.ts"`（28 文件；另以显式 28 文件清单双跑，均 182——覆盖无遗漏） | **182/182 过 / 0 红**，exit 0 | `raw/g1-followup-test-area.txt` |
| `node --test "test/**/*.test.ts"`（全量） | **1528 计 / 1527 过 / 0 红 / 1 skip（Windows 专用）**，exit 0（此前 1525 过 / 2 红 → 现 0 红） | `raw/g1-followup-full-run.txt` |
| `npm run typecheck` | **0 错**，exit 0 | `raw/g1-followup-typecheck.txt` |

### 6.5 其他陈旧金文本扫描

对 `test/测试/` 全目录（含 kanban-fixes-verify 7 文件）grep G-1 相关旧特征（`[派发]`、`renderDispatchPromptLocal`、`——完成后请交回报告`、`任务：`、`必读（按序`）：**除 f2 的这两处外零命中**——未发现本角色名下其他陈旧金文本，套件其余 6 文件无需跟进。

### 6.6 边界

只写 `test/测试/kanban-fixes-verify/f2-claim-release.test.ts`、本记录与 `raw/g1-followup-*` 证据文件；未改任何 src/app/他角色文件；未 git 提交；未碰 `ans-testbed/kanban-live-3`、`/private/tmp` 轮次目录与 2026-10-15 证据目录。
