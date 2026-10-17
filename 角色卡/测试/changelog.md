# 测试 变更记录

## 2026-10-17（复审）— 预算误报修复后 reverified：本批 40/40；全量 2496/2473/20红/3skip；typecheck 0

**修复复审**：运行时核心 `budgetDenied` 不再计入 `deniedReads`（预算耗尽返回独立码 `budget`）；编排 `damageCode` 顺序改为 `budgetExceeded → budget`、`truncatedReads → read-truncated`、`deniedReads → read-denied`；驱动 manual 理由改为「判断预算耗尽（读取次数/总读取字节达上限）…」。

**复审结果**：首轮唯一失败用例（第 9 次真实读取应得 `manual/budget`）**转绿**；`shell-judge-verify` 36/36 ＋ `abort-cleanup-verify` 4/4 ＝ **40/40**。全量 `node --test "test/**/*.test.ts"` → **2496 / 2473 pass / 20 fail / 3 skip**（本批新增红 **0**；20 红全为既有：Windows symlink EPERM 8、runtime-core shell 子进程竞态 1、其他角色在途源码/文案钉 11）；`npm run typecheck` **0 错**。未发现其他缺陷。报告追加 reverified 事件并更新第五条。未 commit/push。

## 2026-10-17 — 「替我审」判断 agent + 卡死修复独立验证：39/40 通过；1 项实现缺陷（预算误报 read-denied）；全量 2495/2471/21/3

**范围**：PM 评审 `2026-10-17_design_shell-auto-approve-review.md` §6–§12（运行时核心只读工具/读取策略、编排 `createShellJudge`、三引擎判断模式、桌面开关/IPC/通道/UI、审计/诊断、deny 档放行、结果行失败分叉）及 2026-10-17 卡死修复（abort 清理失败后的隔离解除、Claude 已关闭查询）。

**方法**：自建 `test/测试/shell-judge-verify/`（`fixture.ts` + 7 文件 **36 例**）＋ `test/测试/abort-cleanup-verify.test.ts`（**4 例**）；全部离线。判断链＝真实 `createShellGate → createDesktopOperatorChannel → createShellJudge（经 govern-session 公共出口）→ buildShellJudgeTools`，假适配器扮演模型；假 IPC＝真实开关状态机 + sender 守卫；假渲染＝真 `ui-labels.js`；三引擎＝Claude 假 SDK 捕获 `Options`、Pi 真实适配器 + pi-ai faux provider、Codex 真实适配器 + 假引擎/内存 MCP 桩、Service 装配逐引擎捕获。不读 `.env`、不跑真实模型/凭据/网络。

**关键结论**：① 默认关→原卡、判断 0 次、审计人工无 `judge`；开启 allow→0 卡/1 行/审计 `operator:judge:<引擎>`+`judge`/诊断；项目与 su 审批两条 policy 均正确。② deny（有/无替代方案）→0 卡、§8.4 文本、合成 `customerMessage`+标准出路、结果行；deny 行投达失败仍 deny。③ manual（不可用/超时/解析失败/读取被拒/截断/防循环/引擎不支持/模型自报/上下文过大）→原卡+`judgeNotice`、审计人工；allow 行投达失败→`row-failed` 卡。④ deny 档 judge allow→放行 0 卡，审计/诊断/结果行三处标「deny 档 · judge 放行」；普通 risky/review 不带标记。⑤ 已挂起卡切换开关不受影响；判断中关闭以调用时点为准；关后恢复手动。⑥ 敏感/越界/junction/二进制/预算读取被拒且不泄内容；三引擎均恰三只 judge 工具、无写/shell/网络。⑦ abort 抛错但底层稍后 settle→隔离解除可再进入；底层永不 settle→仍拒绝；Claude `Query closed before response received` 视为已中止，其他 interrupt 错误仍上抛。

**发现缺陷（未改实现）**：真实 judge 工具第 9 次读取（调用预算耗尽）会同时置 `budgetExceeded` 和 `deniedReads`，驱动 `damageCode` 先判 `deniedReads` ⇒ 返回 `manual/read-denied`（卡片「所需项目文件无法读取」），设计要求 `manual/budget`（「读取预算已用尽」）。属主：运行时核心（`policy.ts::budgetDenied` / `shell-judge.ts::damageCode` 优先级）；编排属主测试直接置 stats 未覆盖真实工具路径。失败断言保留，未放宽/跳过。

**复跑**：本批 **40 例 / 39 通过 / 1 失败（即上述缺陷）**；全量 `node --test "test/**/*.test.ts"` → **2495 / 2471 pass / 21 fail / 3 skip**（**本批新增 1 红**；既有 20 红：Windows symlink EPERM 8、runtime-core shell 子进程竞态 1、其他角色在途源码/文案钉 11）；`npm run typecheck` → **0 错**（本批 0）。详见[报告](docs/fix/2026-10-17_verify_shell-judge-and-abort.md)。未 commit/push。

## 2026-10-17 — 治理记录 pin 不符「重新接受」独立端到端验证：AC1–AC12 通过，未发现缺陷；修正 3 条旧断言，新增 11 例

**范围**：PM 评审 `2026-10-17_design_governance-pin-recovery-review.md` §5.5/§六/§八/§九——门禁引擎 `inspectPinnedBoundaries`、编排 `previewGovernanceReacceptance`/`reacceptGovernancePins`、桌面 `listProject.governanceRecord`（`pin-mismatch` + `pinFiles`/`pinCount`）与两个 IPC/preload 方法、桌面UI `governanceActionFor`。实现不改，只做独立验证。

**方法**：自建 `test/测试/governance-pin-recovery-verify/`（`fixture.ts` + **11 例**）。临时项目＝`角色卡/governance-boundary.yaml` + 3 角色 `boundary.yaml`/`role-card.md` + `.ans/project.json`（**真实哈希 pin** 4 条 + 未知字段）+ `docs/bootstrap-manifest.md`；真实链 `listProject → buildEffectiveProjectConfig → preview → reaccept → listProject → resolveRole`；会话入口用确定性桩适配器（立即 settled，不触真实模型）。「零写入」＝完整目录树快照（路径/类型/大小/mtime/文件 sha256）前后 `deepEqual`。

**关键结论**：① 全一致 → evidence `ok`、`present`、无动作、预览 `not-needed`；② 改 1 文件 → `pin-mismatch` 恰 1 条 `modified`，预览 `ok:true`/`canConfirm:true`/changed 正确/`previewDigest` 64 hex，**预览前后零变化**；③ 确认写入 → `completed`，按内容哈希仅 `.ans` 与 manifest 变化，pin 路径/顺序/条数、`roles`、`acceptance.source`、未知字段全不变，被改项写回实际哈希、其余保持旧 pin，manifest 逐字节保留并追加含时间/变更数/路径/完整旧新哈希的一条；④ 写入后 → `present`、su `accepted:true`/`parseError` 空、桩会话可开启；⑤ 删 1 文件 → 预览 `canConfirm:false` + `missing` blocker，写入 `missing-file`/`precheck` 零写入；2 改 + 1 删 → changed 3 条（2 modified + 1 missing）同阻断；⑥ 预览后再改 → `preview-stale`/`precheck` 零写入；⑦ 取消 → 零写入、状态仍 `pin-mismatch`；⑧ `.ans` 缺失 → `missing` + 预览 `no-record` + 只出现 establish；不可解析 → `invalid` + `invalid-record`；⑨ 坏 YAML / `entries: []` → `unparseable-boundary`/`canConfirm:false`/零写入；⑩ Pipeline 公共出口直调同样只改两个文件。

**旧断言修正（语义变更）**：A2 改用新增 `writeRealPinnedAns`（真实哈希）→ `present`；A13 坏 pin 由 `present` 改判 `pin-mismatch`（保留 su 仍未接受/写入被拒覆盖）；E2 渲染侧状态集合由三态正则改为四态 `knownGovernanceStates`（含 `pin-mismatch`）。未放宽或删除覆盖。

**复跑**：本角色两目录 **53/53**；全量 `node --test "test/**/*.test.ts"` → **2314 / 2216 pass / 95 fail / 3 skip**（上一有效基线 2313/2215/95/3；本批 +1 用例通过、红数不变；**95 红全为既有且不在本批目录**：依赖缺件 74、Windows EPERM 7、其他无关漂移 14）；`npm run typecheck` → **85 错**（全为既有依赖缺件，本批改动文件 0 错）。**未发现实现缺陷**；AC11（写入阶段故障注入）与 AC17（manifest 不可读）未由本 E2E 覆盖，AC11 由编排套件覆盖、AC17 留白。详见[报告](docs/fix/2026-10-17_verify_governance-pin-recovery.md)。未 commit/push。

## 2026-10-17（复审）— 到点检查偏差修复后 reverified：三项修复全落地，全量 2246/2150/94红/2skip，桌面 5 条旧红消失

**修复复审**：① 运行时核心 `resolveRuntimeTimeouts` 改为**全运行时**读 `ANS_PI_PROMPT_TIMEOUT_MS`（env=60000 → pi/claude/codex 均 60000）；② 设置 help 补齐「仍在推进则不动作」「留空＝系统默认（5 分钟）」；③ 桌面 `turn-deadline` 解除**不再投「看护恢复」行**（仅诊断），5 条属主测试已用显式注入同步。

**本角色同步**：`g2-verify/w1-signals.test.ts` 身份更替用例由「投恢复行」改为「不投恢复行、新一轮独立告警」；`turn-watch-verify` A1 同步；C1 增加三 runtime env 断言、C2 增加 help 两项措辞断言。

**复审结果**：独立套件 **15/15**、w1 **14/14**、t1 **8/8**、scope-audit 通过；全量 **2246 / 2150 pass / 94 fail / 2 skip**（上轮 2245/2144/99/2；**桌面窗口 5 条旧红全部消失**；94＝既有 93＋Codex 缺 MCP SDK 1 条环境红；无其他新增/消失）；typecheck **85 错**（本批/同步文件 0）。报告 revision 2 + `reverified` 事件；证据补 `reverify-*`。未改产品代码，未 commit/push。

## 2026-10-17 — 到点检查 + 1 小时兜底独立验证：核心行为通过；1 项功能性偏差 + 2 项文案/建议偏差（列属主）

**范围**：客户 2026-10-17「整轮不应该有超时…到了时间 su 去看是否卡死…保留 1 小时兜底」；PM 评审 `2026-10-17_design_turn-watch-and-recover-review.md`。运行时核心/服务/Pi/Claude/Codex/桌面看护/编排文案/门禁 su 卡/PM 设置。

**方法**：自建 `test/测试/turn-watch-verify/`（**15 例** 4 文件＋夹具：看护 rig/挂起 provider/SessionManager/桩恢复）；同步本角色旧断言 3 处（t1 4 条红→8/8、w1 90%→100%→14/14、g2 scope-audit ratio 0.9→1.0）。不真等 1h、不跑真实模型/破坏性命令。

**结论**：① 到点不中止（检查 40ms/兜底 300ms 注入：100ms 零 settled）；文案「轮次到点检查」+不中止/不动作/卡死才 propose/1 小时兜底，旧措辞零命中；每轮恰一条、下一轮独立；挂起卡/su 忙排除。② 1h 兜底到点才中止；settled 摘要「最后兜底」、与检查可区分；确认卡挂起 2× 时限不中止（同一 withPausableTimeout 原语）。③ 非整轮时限 600000/120000/120000 不变。④ 设置 label/档位/默认标签/1h 不暴露；role_status「看护检查时限 5 分 0 秒 / 1 小时最后兜底」；su 卡命令纪律齐备。⑤ propose_recovery 未确认=未执行、确认=已执行；watchdog 不自动执行。⑥ 三适配器+服务整轮均接 turnLastResortMs。

**偏差（不修，列属主）**：1）**功能性**：非 Pi runtime 不读 `ANS_PI_PROMPT_TIMEOUT_MS`（实测 pi 60000 / claude 300000 / codex 300000），评审 §3.1/§3.3/§5.9 要求全运行时读取——属主运行时核心。2）设置 help 与评审 §3.3 非逐字（核心语义在位）——属主 PM。3）turn-deadline 解除仍投「看护恢复」行（评审建议不投/改文案）——属主桌面窗口，不阻塞。

**复跑**：本批 15/15；全量 **2245/2144 pass/99 fail/2 skip**（上轮 2215/2120/93/2；+30 测试 / +6 红：既有 93（依赖缺件 75、EPERM 8、CRLF 9、计时竞态 1）＋桌面窗口属主 5 条未同步新默认（session 4 按 120s、multi-runtime 1 条 choiceLabels）＋Codex 新用例 1 条缺 MCP SDK）；typecheck **85 错**（本批 0）。详见[报告](docs/change/2026-10-17_change_turn-watch-recover-verify.md)与[证据](docs/change/2026-10-17-turn-watch-recover-verify-evidence/)。未 commit/push。

## 2026-10-17 — su 的 run_shell 审批策略独立验证：整体通过（0 不通过 / 6 备注）

**范围**：客户 2026-10-17「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」；PM 评审 `2026-10-17_design_su-shell-approval-review.md`。编排（operatorOnly/approveDeny/分支/守卫、assembleOperatorShellGate、run-role su-only 与互斥、CLI 模式文案）、门禁引擎（内置卡命令纪律）、桌面窗口（su 注入 + tier/policy/plain reason）、桌面UI（SU 卡）。

**方法**：对抗性独立构造、不复用实施方断言——自建 `test/测试/su-shell-approval-verify/`（5 用例文件 **36 例** + 夹具 + 离线 Electron 卡片探针 9 项）。全部假件/临时目录；零执行哨兵只用 `process.execPath -e` 写临时文件（无 `sh -c`/rm）；不跑真机、不用凭据。

**关键结论**：① allow → 0 卡、`c-allow`、by「（su 审批档）」；risky/review/deny（approveDeny）各恰 1 卡，批准→`c-*→a-allow`、拒绝/超时/不可用→对应 `a-deny/a-timeout/a-unavailable`；deny 无 approveDeny → `c-deny` 0 卡；四组构造守卫全抛错。② 审计 command 原文/argv/cwd/branch/by/conditions 齐备、三态可辨。③ `assembleOperatorShellGate` 缺件 fail-closed；run-role su-only/互斥/装配失败均不 arm；type 面无 pmAsk/routineShellPolicy。④ 桌面 su 收 `shellOperatorOnly`、不收 `shellReadonly`；项目角色三层链不变；缺件不 arm。⑤ 卡片 tier/policy/三档 plain reason/SU 标题/警告/默认拒绝焦点；Esc 回传 allow:false；项目卡旧呈现不变。⑥ 真实 gate+run_shell：批准 deny/risky 真实执行；拒绝/超时/不可用哨兵不存在；review 批准 spawn 失败如实。

**复跑**：本批 **36/36**、卡片探针 **9/9**；全量 `node --test "test/**/*.test.ts"` → **2215 / 2120 pass / 93 fail / 2 skip**（上一轮 2153/2058/93/2；+62 测试＝本批 36＋并发属主 26；**红数 93 与组成不变**：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1）；typecheck **85 错**（全为既有依赖缺件，本批/同步文件 0 错）。**并发值钉同步**：Pi 滑块批次新增 `ANS_PI_PROMPT_TIMEOUT_MS` → t29 面板键 5→6；桌面角色状态消歧 → g2 R1 接受「上一轮终局（不表示当前轮）」——同步后红数回到 93，非产品缺陷。未发现需返工缺陷。详见[报告](docs/change/2026-10-17_change_su-shell-approval-verify.md)与[证据](docs/change/2026-10-17-su-shell-approval-verify-evidence/)。未 commit/push。

## 2026-10-17 — 渲染轮复审（助手消息即时 Markdown）：全量 2153/2058/93红/2skip，e2e 原失败点通过、剩余红经 HEAD A/B 证明既有

**范围**：桌面UI 渲染改动（`appendAssistant` 恒 `mdReady:true`；旧行升级仅作安全网）＋ `uiux-v2.mjs` 两处 `.trim()` 修订。

**结果**：① 全量 `node --test "test/**/*.test.ts"` → **2153 / 2058 pass / 93 fail / 2 skip**（较上轮 +1 测试＝并发属主；红数 93 与组成不变：依赖缺件 75、EPERM 8、CRLF 源钉 9、计时竞态 1）。② e2e 当前 renderer → exit 1，**仅** `virtual visible nonempty`（`uiux-v2.mjs:1044`）；其前全部通过，**含原失败点 `routine collapsed; failure direct; assistant untouched`（:964）**。③ **独立 HEAD A/B**：在 `test/测试/.tmp-e2e-head-arm/` 建隔离副本（复制 app/src/e2e，renderer 用 `git show HEAD:`，sha256 前 8＝`7d18858b`），同点同观测失败 → 该红**先于本轮**，桌面UI 自报属实；运行后删除副本。④ 新语义独立 Electron 探针 `test/测试/render-md-ready-probe.mjs` → **6/6**：源码字面 `mdReady:true`；含 `##`/表格的助手消息未 settled 即 `<h2>/<table>`、内容保留、无 `is-streaming`；settled 不重复插行/不回退；旧行安全网（仅升级 `mdReady:false`，settled 仍调用）在位（新进程内运行期不可达，源码面验证）。

**结论**：未新增红、原失败点已修；剩余 `virtual visible nonempty` 非本轮引入，不判返工，建议后续独立定位。证据：`renderer-round-summary.md`、`renderer-round-e2e-current.txt`、`renderer-round-e2e-head-arm.txt`、`renderer-round-md-probe.txt`(+report json)。只改 `test/测试/` 与本角色文档；未 commit。

## 2026-10-17 — 客户裁定「系统默认就是 500k」：t29 默认值钉从 32768 同步为 500000

**来源**：客户 2026-10-17 裁定「我的意思说系统默认就是500k」；Pi适配器已把 `DEFAULT_PI_CONTEXT_WINDOW` 改为 **500000** 并更新 notice 文案。本角色同步自己属下的钉值：

- `test/测试/t29-pi-config-roundtrip.test.ts:161`：`assert.equal(DEFAULT_PI_CONTEXT_WINDOW, 32768, "保守默认值应钉死为 32768（勿被悄悄改动）")` → **500000**，文案「系统默认值应钉死为 500000（客户 2026-10-17 裁定）」；同段「保守默认值/保守默认」注释与用例名按新语义改为「系统默认值」（:137/:140/:143 与 :160 回落断言消息）。
- `test/测试/t9-block1-bootstrap.test.ts:78` 手工步骤说明「留空 = 用保守默认」→「留空 = 用系统默认 500000」（非断言，措辞同步）。
- 其余 `32768` 出现均为**显式夹具值**（`g4-skill-verify/g-splicing.test.ts` ×2、`g4v2-mcp-verify/j-pi.test.ts` ×1 的 `contextWindow: 32768`），按指示**未改**。

**复跑**：`node --test "test/测试/t29-pi-config-roundtrip.test.ts"` → **11/11 pass**；全量 `node --test "test/**/*.test.ts"` → **2152 tests / 2057 pass / 93 fail / 2 skip**（较上一轮 2150/2055/93/2：新增 2 例由并发属主落地、**红数 93 不变、归因不变**——依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1）。只改 `test/测试/` 与本角色文档；未碰产品代码、未 commit。

## 2026-10-17（复审）— 编排按备注②/⑤修正两处文案后 reverified：独立套件 42/42，全量计数与 93 红归因不变

**修正对象（编排，语义/契约不变）**：① `GOVERNANCE_RECORD_ACCEPTANCE_SOURCE` → `desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）`（一次性的是种子边界对象，不是该来源字符串）；② 写入阶段失败消息 → `写入中断：<错误>；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。`（不再承诺「重新执行」；phase/不重试/不清理不变）。

**复审**：独立套件 `node --test "test/测试/existing-project-compat-verify/*.test.ts"` → **42/42 pass**（B5 按新文案加正向断言 + 「不得出现『重新执行』」反向断言；B12 改为复审语义；其余断言引用常量，自然通过）；全量 `node --test "test/**/*.test.ts"` → **2150 tests / 2055 pass / 93 fail / 2 skip**（与修正前逐位相同；93 红组成不变：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1）；`npm run typecheck` → **85 错**（不变，本批/本轮实现 0 错）；`reverify-sha256-freeze.txt` **24/24** 逐字节一致。报告 status 保持 `verified`、`revision: 2`、事件追加 `reverified`；备注②/⑤改记为「已由编排修正」。未改产品代码，未 commit/push。

## 2026-10-17 — 已有角色但无治理记录的项目兼容（B+C V1）独立验证：整体通过（0 不通过 / 7 备注）

**范围**：门禁引擎（A1 种子边界 Service 公共出口、I5 F6 恢复指引）、编排（I3 preview/establish、一次性种子边界、进程内互斥、B2 薄再导出）、桌面窗口（I1 `deriveGovernanceRecord`、I2/C1 IPC 与守卫）、桌面UI（I4 状态行/su 空态/预览面板/文案）。批准口径＝客户 2026-10-17「按 B+C 来」；验收口径＝PM 评审 §六（V1–V8/V6b、N1–N8）。

**方法**：对抗性独立构造、不复用实施方断言——自建 `test/测试/existing-project-compat-verify/`（5 用例文件 **42 例** + `fixture.ts`）。夹具与客户现场同形状（N 角色 `role-card.md` + **仅** `boundary.md`、无 `.ans`；另 S1b/N5/S2/S3/S4 变体）；真实链 `listProject → buildEffectiveProjectConfig → resolveBoundarySection → resolveWrite`，机制经 Pipeline 公共出口调用。证据：`sha256-freeze.txt`（24 文件指纹）、`git-status-short.txt`、`verify-suite-output.txt`（42/42）、`flaky-abort-recheck.txt`、`full-suite-summary.md`、`typecheck-summary.md`。

**关键结论**：① V2 三产物 + `.ans` 结构 + pin 逐条独立实算一致 + manifest 一致 + completed；② V3 确定性：su 写 `docs/su/memo.md` allowed、`src/**` 拒；V4 角色边界前后不变；③ V5/V6 零写入（树 + mtime）；V6b phase=write 且 message「可能已写入部分文件」、文案绝不称零副作用；V7 幂等；并发恰一 ok 一 busy；一次性边界无 genesis 标记、重建重算 pin（不信任预览）；④ F6 首句逐字且恰一次 + 指引（两份 `format-denial` 同构）；V8 确认卡不发行 writeSet、不产生 `.ans`；篡改/伪造 pin 仍未接受；⑤ N1/N2 invalid+reason；N4 采纳与坏文档；N5 缺件跳过；N7/N8 既有创世与 CLI 注入不变；⑥ 40 个改动/新增文件 40/40 在属主 boundary 内，零越界。

**复跑**：本批 **42/42**；全量 `node --test "test/**/*.test.ts"` → **2150 tests / 2055 pass / 93 fail / 2 skip**（基线 2108/2014/92/2；93 红全部归因既有环境：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9〔含任务书已列 renderer.test 4 + markdown 1〕、计时竞态 1——均与本轮实现无交集）；`npm run typecheck` → **85 错，全部既有依赖缺件**，本批与本轮实现文件 0 错。

**备注（不判缺陷）**：N6 `nothing-to-pin`/precheck `blocked` 经 preview/establish 入口结构性不可达（hasRoles 先判 + 内部种子恒覆盖写路径），底层经 `finalizeBootstrap` 直调验证；V6b message「重新执行」在 `.ans` 已落盘子场景会得 already-established（设计原文，含「或核对现场」）；跨进程无全局锁（设计已登记）；`present ≠ su 可写`（V1 文档化限制，A13 实证）；`acceptance.source` 落盘后含「不持久化」字样（指一次性边界而非该字符串）易误读，建议 V2 改述；真实 su 会话/Electron e2e 属客户与桌面UI 轮。详见[报告](docs/change/2026-10-17_change_existing-project-compat-verify.md)与[证据](docs/change/2026-10-17-existing-project-compat-verify-evidence/)。未 commit/push。

## 2026-10-16 — v1.3.0 CI Windows 红修复：验证套件平台适配（6 红全为测试侧；产品修复需求零）

**来源**：CI run `38924209553` Windows job（regression tests 8 红，其中 test/测试 面 6 红＝本角色验证套件；另 2 红属 Pi适配器/Codex适配器角色）。逐条判别：**双向核**（控制字符 `0x01` 夹具目录不可建盘＝Windows 文件系统真值；读取器名判据先于盘面、直调名覆盖保留）、**① 三触发**（通知点名＝平台原生分隔符真值——桌面窗口属主自有测试已用 `path.join` 冻结同口径且 Windows CI 通过）、**H2**（自扫描面 `path.relative` 反斜杠未归一——**非第四处直读**）、**G1a/G1d/J3**（Windows 对自定义环境块强制补齐的十键 OS/libuv 真值——同一 CI 三处互异 spawn 实现实得相同十键集；SIGTERM＝TerminateProcess 无信号面）。**产品修复需求零**；平台分支只替换平台真值值面、断言本体零放宽。改动 4 文件：`test/测试/g4-skill-verify/b-render-double-check.test.ts`、`test/测试/g4-skill-verify/f-fingerprint.test.ts`、`test/测试/g4v2-mcp-verify/j-pi.test.ts`、`test/测试/g5-reasoning-verify/h-scope-audit.test.ts`（另 `g-claude-launcher.test.ts` 由 Claude适配器角色并发修复，已复核）。复跑：`test/测试/**` **502/502**、全量 **2110/2109/0红/1skip**、typecheck 0；win32 分支经进程内仿真（b-render 7/7）与 `path.win32` 变换证明。详见[修复记录](docs/fix/2026-10-16_fix_windows-ci-platform-branches.md)。未 commit/push。

## 2026-10-16 — G-5（推理与推理强度）独立验证：整体通过（0 不通过 / 7 备注）

**范围**：契约与归一（五值冻结/三态归一/三 env 键/非法⇒按未设＋诊断不毁会话）、事实通道与投影单点（脱敏/16384 B 预算/omitted 恒空/durationMs 防伪/summary 定格/幂等/坏件诊断/emit 与历史兩路同单点）、Claude 接线（映射未设零参数·off disabled·四档直通·max 不收编/捕获不预脱敏/降级 4xx＋词元恰一次同输入重推）、Codex 接线（五值校验装配前抛/单条 `-c`/off 如实文案/reasoning 事件双信号时长/降级闸恰一次＋负例四格）、Pi 接线（off 前置修复假关闭消除/未设零调用/R1 自证网关三窗修复/捕获/降级终态前消费不二次/429 排除/中断守卫）、设置链（三字段 choices 单源/保存值域拒 trim 规范形空串清除批量原子/pi-config 漂移对齐＋旧路径如实现状）、桌面渲染（四态文案真实执行/select 控件/默认折叠 esc 纯文本/回放载体真驱动）、范围审计（探针纯本地/键读取面单点/零网络面）。

**方法**：对抗性独立构造、不复用实施方断言——自建 `test/测试/g5-reasoning-verify/`（8 测试文件＋helpers 夹具）**65 例全绿**（真 Service 装配捕获工厂＋自建假 Claude SDK/假 Codex 引擎/loopback 假网关驱动真 Pi SDK＋真 tool-rows.js 执行＋真 getSessionHistory 回放驱动）。全量 **2112/2111/0红/1skip**（＝基线 2047/2046/0/1＋65；1 skip＝既有 Windows-only）、typecheck 0；G-5 改动面冻结 **33 条目**开工/收工逐字节一致（两次复算）。备注 6 条（零引用钉交互〔H1 按 g4v2 K3 先例动态枚举改写〕、R1 第三窗无需修复、429 SDK 层重试观测、Codex 增量帧计作已产出、summary 定格仅 kind=message、Claude 判据词元集）与未验边界（真网关/Electron e2e/真 CLI wire/aborted 竞态窗/细窗口/Windows）见报告。详见[报告](docs/change/2026-10-16_change_g5-reasoning-independent-verification.md)与[证据](docs/change/2026-10-16-g5-verification-evidence/)。未 commit/push。

## 2026-10-16 — G-5（推理与推理强度）落树后：Pi 面板键 4→5 同步＋推理键往返/choices/值域单源新钉；g3 审计④核对

**来源**：G-5 全链落树（契约层/三适配器接线与降级/设置保存/档位控件/推理折叠行/回放载体；批准件＝PM 记录 §G-5 与各属主回交）。本角色名下唯一红＝`test/测试/t29-pi-config-roundtrip.test.ts` 面板键 deepEqual（实际 5 键 vs 旧钉 4 键）；全量扫描 G-5 旧钉后共两处翻新＋两例新钉。边界：只写 `test/测试/**` 与本角色文档；未碰产品文件与探针；**未 commit**。

### 同步清单（断言 → 旧值 → 新值 → 依据）

1. `t29-pi-config-roundtrip.test.ts` :88-91 — `PI_PANEL_KEYS` deepEqual 4 键 → **5 键**（增 `ANS_PI_REASONING_EFFORT`；注释「3 必填 + 1 可选」→「3 必填 + 2 可选」）。依据：桌面窗口 G-5「纳入」处理——`app/desktop/pi-config.ts:60-66` 实况；与注册表 `RUNTIME_SETTINGS.pi` 逐键对齐（`app/desktop/pi-config.ts:43` 注）。
2. 同文件**新增**「T29 G-5：ANS_PI_REASONING_EFFORT 往返＋漂移守卫」——①面板键集 ≡ `RUNTIME_SETTINGS.pi` 字段键集（钉对齐）；②save→同 env 重载→另开 env 重载→`getPiConfig` 视图（非机密、值可见、isSet）全链往返。
3. 同文件**新增**「T29 G-5：choices 透传＋值域单源」——①`getRuntimeConfig("pi")` 视图 `choices` 逐字＝["off","low","medium","high","xhigh"]、required:false（元数据透传）；②注册表保存链拒非法值（ok:false、错误列出值域、不回显提交值、零落盘）；③合法值 trim 规范形写盘；④**旧面板路径不做值域校验**（`savePiConfig` 越值直写、原样落盘——单一来源纪律如实钉，防复制第二份判定）。
4. `ui-reacceptance-renderer-regression.mjs` :51 — `pi-config:get` 桩的旧 4 键快照 → 加 `ANS_PI_REASONING_EFFORT`（桩与现行面板键集同形；无断言依赖该计数）。

### 扫描范围与遗漏排查

- 全量扫 `test/测试/**`（`推理|reasoning|思考|档位|effort|EFFORT|ANS_*_REASONING|RUNTIME_SETTINGS|已思考|xhigh`）：G-5 旧钉仅命中上述两文件（已翻新）；其余 `.mjs` 桩为动态取 `RUNTIME_SETTINGS`（无旧快照）、空 `fields: []` 桩或无键面（核对未改）。
- `g3-search-verify/scope-audit-and-fold.test.ts` 审计④（Pi 属主已适配）单独复跑 13 例全绿——核对即可，未改。
- 残留扫描 0 意外命中（仅负向/变异用旧串与既有无关 length 计数）；`t29-write-discipline.test.ts` 与新键不冲突（`ANS_PI_PROVIDER` 反向守卫仍真），未改。

### 复跑（本角色独立执行）

- `node --test "test/测试/**/*.test.ts"` → **437 pass / 0 fail / 0 skip**（改前 435 中 434/1，唯一红按预期消解；新增 2 例）。
- `node --test "test/**/*.test.ts"`（全量）→ **2047 tests：2046 pass / 0 fail / 1 skip**（唯一 skip＝`test/门禁引擎/resolve-write.test.ts:173` 既有 Windows-only；单独复跑 21 pass/1 skip 确认）。
- `npm run typecheck` → **0 错**。

## 2026-10-16 — G-4 V2（su 安装外来 MCP 全链）独立验证：整体通过（0 不通过 / 7 备注）

**范围**：契约与读取器（`InstalledMcpServerV1`＋`mcp-declarations.ts`）、Service 接线（`providerFor` 按角色注入）、工具面（`install_mcp`/`uninstall_mcp`）、编排（第四棵树 `docs/mcp`＋能力位透传仅 su）、门禁卡文本（MCP 安装纪律段＋J-1 守卫全检）、桌面 handler（`applyMcpChange` 护栏/三态/系统行/诊断）、Claude P1（hook 五条件＋env 收窄启动器）、Codex P2（单条 root map＋三处名字集恰等＋`mcpToolCall` 映射）、Pi P3（前缀判据×2 同源＋tools-only＋自持 transport＋dispose 收口）、桌面UI 复用、范围审计（stdio 限定/名拒/零二次卡/诚实面/探针纯本地）。

**方法**：对抗性独立构造、不复用实施方断言——自建 `test/测试/g4v2-mcp-verify/`（11 测试文件＋3 夹具）**64 例全绿**（真实临时项目盘＋可控 SessionManager 假件＋自建假 Claude SDK/假 Codex 引擎/自建 Pi stdio 夹具 server＋真实 launcher 子进程＋真实 Pi SDK faux 模型＋自写 mini TOML 解析器做转义往返）。复跑证据：实施方 V2 六文件 72/72；翻转钉子 13 文件 223/223；V1 范围⑥钉 7/7；真 CLI 复跑两枚（Claude installed-loopback exit 0、Codex native-probe exit 0）——均零真实网关请求。全量 **1998/1997/0红/1skip**（基线 1934/1933/0/1＋64）、typecheck 0；V2 面冻结 **82 条目**开工/收工逐字节一致（两次复算）。备注 6 条（并发非 V2 面、`CAN_USE_TOOL_SHADOWED` 提示、schema 占位符互核、系统子类符号更名、Codex 碰撞判据大小写敏感、空 name 文案小瑕）与未验边界见报告。详见[报告](docs/change/2026-10-16_change_g4v2-mcp-install-independent-verification.md)与[证据](docs/change/2026-10-16-g4v2-verification-evidence/)。未 commit/push。

## 2026-10-16 — G-4 V2（MCP 安装）落树后：名下钉子翻新（三→四棵机械同步＋预授权/零实施两处行为翻转）

**来源**：G-4 V2（MCP 安装）全链实施已落树（合同/读取器/Service/工具/桌面 handler/三适配器 P1-P3/卡文本四棵；批准件＝PM 记录 V2 裁定「按推荐批准，开始实施」与各属主回交）。V2 落树使本角色名下 8 条旧钉转红（371 tests 中 363 pass/8 fail），本轮逐字对表新事实翻新：机械项强度不改（deepEqual/正则/变异锚点等值），行为项按批准事实翻转（非放宽）。边界：只写 `test/测试/**` 与本角色文档；未碰产品文件与探针；**未 commit**。

### 同步清单（断言 → 旧值 → 新值 → 依据）

**A. 机械 三→四棵**（依据：V2 第四棵，`run-role.ts:984` 实况 `SU_PREAUTHORIZED_WRITE_DIRS = [… "docs/mcp"]`）
1. `g1-copy-and-nails.test.ts` :26/:31 — deepEqual `["docs/su","docs/contracts","docs/skills"]` → 追加 `"docs/mcp"`（用例名「恰为三棵」→「恰为四棵」）。
2. 同文件 :49 — 非空洞变异锚点 `「不在预置三目录内」`→`「不在预置四目录内」`（防漂移与三变体逐一捕获未动）。
3. 同文件 :103 — 正向短语清单同串替换；:139 口径注释「恰三棵」→「恰四棵」。
4. 同文件 :111 与 `d-card-guard.test.ts` :66 — **新增**「旧计数防回退负向」：`写入这两棵/三棵目录树`、`预置的两棵/三棵目录树除外`、`不在预置两/三目录内` 六串逐字不得复现。
5. `d-card-guard.test.ts` — 用例名「三棵树话术」→「四棵树话术」；:55 核查四棵均点名（加 `docs/mcp/**`）；:56 `写入这四棵目录树**无需逐次确认**`；:58 `预置的四棵目录树除外`；:87 变异锚点四棵；:91 变异锚点四目录（含变异目标串）。依据＝V2 卡文本（`boundary-core.ts:160/161/167/174`）。

**B. 行为翻转**（依据：PM 记录 V2 裁定＋门禁引擎/运行时核心/桌面属主回交的落树实况）
6. `c-preauth.test.ts` — 「docs/mcp 未预授权」翻转为**预授权直写**：①直写矩阵加 mcp 相对/嵌套/绝对三路径（零确认）；④ `docs/mcp/any.md` allowed false→true（免确认）＋前缀负例 `docs/mcp2/any.md`⇒false（段比较）＋零新增确认（asked 仍恰 1）；⑥ 重建后 mcp 仍生效；⑤ 非 su 角色 `docs/mcp/t9.md`⇒false（预授权四棵均不扩散）。
7. `h-scope-audit.test.ts` 范围① — 「字面量恰为三棵（docs/mcp 未入）」→「恰为四棵（＋docs/mcp）」deepEqual 四元素。
8. 同文件 范围② — 「MCP V2 零产品实施」（全仓零命中/schema 拒绝/仅注释提及）**翻转为 V2 已实施**四事实：`install_mcp`/`uninstall_mcp` 工具名常量＋maker 在位且 schema 可描述（原 `assert.throws` 翻转）；`docs/mcp` 并入预授权且被声明读取器消费（`mcp-declarations.ts` `MCP_REL = "docs/mcp"`）；三适配器装配 `installedMcpServers`（claude/codex/pi-real-adapter）＋服务层 `listInstalledMcpServers` 注入；能力位仅 su（编排 `suppressHandback` 判据＋桌面 `role.builtIn === true` 两注入判据）。

### 扫描范围与遗漏排查

- 全量扫 `test/测试/**`（`两棵|两目录|三棵|三目录|零实施|零命中|未预授权|V2 另议|install_mcp|uninstall_mcp|docs/mcp`）：V2 旧钉仅命中上述两文件（已全翻新）；`g2/g3-verify/scope-audit` 的「零实施」属看护/G3 域（非 MCP），核对后未改；残留扫描 0 意外命中（仅新增的防回退负向清单两处）。
- 探针（`.probe.ts`）未碰——范围⑥ 既有零引用审计继续全绿。

### 复跑（本角色独立执行）

- `node --test "test/测试/**/*.test.ts"` → **371 pass / 0 fail / 0 skip**（改前 363/8；8 红如上述清单逐条归因、全部本轮回绿，无他域新红）。
- `node --test "test/**/*.test.ts"`（全量）→ **1934 tests：1933 pass / 0 fail / 1 skip**（唯一 skip＝`test/门禁引擎/resolve-write.test.ts:173` 既有 Windows-only；单独复跑该文件 21 pass/1 skip 确认非本轮引入）。
- `npm run typecheck` → **0 错**（tsc --noEmit）。

## 2026-10-16 — G-4 V1（su 技能安装全链）＋ cleanPatterns 轻修：独立验证**整体通过**（0 不通过、5 备注）

**来源**：PM 派发「独立验证轮」（V1 全链＋cleanPatterns 轻修＋范围审计＋冻结绑定）。本角色**独立构造**自建用例套件 `test/测试/g4-skill-verify/`（9 测试文件＋2 夹具，**51 例全绿**；对抗性构造、不复用实施方断言）；报告 [2026-10-16_change_g4-skill-install-and-cleanpatterns-independent-verification.md](docs/change/2026-10-16_change_g4-skill-install-and-cleanpatterns-independent-verification.md)，证据 `docs/change/2026-10-16-g4-verification-evidence/`。边界：只写 `test/测试/**` 与本角色文档；未碰产品文件与探针脚本；未 git 提交；零真实网关请求。

- **逐域通过**：A 工具面（注入才注册矩阵/回执冻形/契约外 fail-closed/schema 冻结句逐字/零写盘切片＋盘快照）｜B 渲染单一来源（双向核/原始字节 digest/坏件防御/穿越大防御/∅）｜C 预授权（真装配 gate：树内免确认、树外仍逐条、前缀负例、docs/mcp 未预授、非 su 不变、重建仍有效）｜D 卡文本四要点＋J-1 全文小句级零违规｜E handler（护栏六格矩阵：无轮次/回交/系统/派发[私有面直注]拒、直聊/排队客户消息放行；拒绝全分支 reason 映射＋零副作用；三态如实；`[系统·安装]` 真投递且 withdraw 拒；诊断落盘）｜F 裁定⑤指纹（三触发/零技能负例/坏登记不误重建/缺件收敛/隔离）｜G 拼接 ×3＋假适配器（恰一段差分、独立重打节文本、坏件不拒会）｜H 范围审计（MCP V2 零实施、零二次卡、无删除原语、能力位仅 su、探针纯本地）｜I cleanPatterns（复现转正/零泄漏 battery/ASCII `;` 不回归/flags 不变/Codex redact 同口径）。
- **冻结绑定**：26 条目 sha256 开工/收工/终次三份**逐字节一致**（清单写入报告 §四）。
- **全量**：`node --test "test/**/*.test.ts"` → **1880 计/1879 过/0 红/1 skip**（＝基线 1829＋本批 51；skip＝既有「仅 Windows」）；`npm run typecheck` 0 错。翻转钉子（loopback L255）与 g1 三棵同步复跑 **12/12** 绿。
- **备注（非不通过）**：① rebuilt 支复用 rebuildSession 既有事件文案含「客户确认的恢复动作」——安装场景措辞不精确（单一来源复用，非本批改动面）；② Codex redact hash 口径原样保留（只紧不松，如实登记）；③「无分隔符紧贴 CJK」残余按裁定保留；④登记由好转坏触发一次重建后收敛（语义细节）；⑤派发轮护栏分支以私有面直注检验（真实装配下 su 不为派发目标）。
- **未验边界**：Electron 真机 E2E；Claude/Codex/Pi 的 SDK 级会话注入（实施方测试覆盖、本角色复跑绿）；卸载×在跑组合（同 code path）；`app/desktop/interface.ts` 真渲染链路；探针脚本行为（按约束不执行，仅静态审计）。

## 2026-10-16 — G-4 四项已批准变更落盘后：名下钉子逐字对表新事实同步（三棵 / 新卡文本 / cleanPatterns 翻转）

**来源**：四项已批准变更落盘（裁定①预授权三棵树＋编排 I5、门禁引擎 I6 卡文本增「安装纪律」段＋三棵话术、运行时核心 A-base cleanPatterns 收窄）。本角色名下 3 条 g1 钉子与 1 条 pi-loopback 钉子钉的是旧事实，本轮**逐字对表新事实同步**（不是放宽断言：等值/在场性/非空洞强度一字不降，旧值→新值）。边界：只写 `test/测试/**` 与本角色文档；未碰产品文件、未碰他角色在飞（三适配器/桌面 UI）；**未 commit**。

### 同步清单（断言 → 旧值 → 新值 → 依据）

1. `test/测试/g1-verify/g1-copy-and-nails.test.ts`「su 预授权写目录」钉子（:26/:31）：
   - 用例名：`恰为两棵（docs/su + docs/contracts）` → `恰为三棵（docs/su + docs/contracts + docs/skills）`；
   - `assert.deepEqual(dirs, ["docs/su","docs/contracts"])` → `assert.deepEqual(dirs, ["docs/su","docs/contracts","docs/skills"])`（deepEqual 全等强度不变；`some(workflow)` 反向断言不动）。
   - **依据**：裁定①预授权三棵树＋编排 I5——`src/pipeline/orchestration/run-role.ts:916` 实况 `SU_PREAUTHORIZED_WRITE_DIRS = ["docs/su","docs/contracts","docs/skills"]`。
2. 同文件「卡文本独立反向断言」非空洞变异锚点（:49）：`T.replace("`docs/workflow.md` 不在预置两目录内", v)` → `…不在预置三目录内…`。防漂移断言（`mutated !== T`）与三个违规变体的逐一捕获断言均未动；锚点是对新卡文本的实际子串。
   - **依据**：门禁引擎 I6——`boundary-core.ts:162` 新句「`docs/workflow.md` 不在预置三目录内」。
3. 同文件「正向在场性短语清单」（:103）：`"不在预置两目录内"` → `"不在预置三目录内"`（逐字在场性强度不变）。
   - **依据**：同上 I6。
4. 同文件 ④ 段口径注释「恰两棵预授权目录」→「恰三棵预授权目录」（注释同步，断言零变化）。
5. `test/测试/g3-search-verify/pi-loopback-verify.test.ts`「开启成功往返」第 2 条标题断言**翻转**（:255）：
   - 旧：`assert.equal(resultText.includes(TITLE_B), false, "（备注）第 2 条标题被既有 URL 贪吃口径吞掉——如实登记")`；
   - 新：`assert.equal(resultText.includes(TITLE_B), true, "第 2 条标题不再被 URL 口径吞并——完整可见（A-base 收窄后）")`（布尔等值强度不变；注释改为记录翻转来源与依据）。
   - **依据**：运行时核心 A-base——`src/common/runtime-core/tool-display.ts:43` URL 匹配排除集追加 CJK 标点块 `　-〿` 与全角形式块 `＀-￯`；组内「；」连接下归一替换止于标点，第 2 条起标题完整可见。

### 扫描范围与遗漏排查（先全量再改）

- 全量扫 `test/测试/**`（`两棵|两目录|预置两|恰为两|确认制要点|写盘许可已预置`）：旧值仅命中本文件 4 处，已全部同步；g2-verify/scope-audit.test.ts 两条引用卡文本的断言（工具名在场、看护职责段位置/关键词）与新文本不冲突，未改。
- 他角色已含新钉（不重复）：`test/门禁引擎/su-doc-surface-convention.test.ts:378`「预授权扩列（G-4）两棵→三棵」、`test/runtime-core/tools.test.ts:47` 旧计数防复现——均为其属主文件，本角色未碰。

### 复跑（本角色独立执行）

- `node --test "test/测试/**/*.test.ts"` → **320 pass / 0 fail / 0 skip**（改前 316/4，4 红＝本轮 3 条同步＋1 条翻转，全部按预期消解）。
- `node --test "test/**/*.test.ts"`（全量）→ **1814 tests：1813 pass / 0 fail / 1 skip**（唯一 skip＝`test/门禁引擎/resolve-write.test.ts:173` 既有 Windows-only，非本轮引入）。
- `npm run typecheck` → **0 错**（tsc --noEmit）。

## 2026-10-14 — 补建角色功能导航 feature-map.md（修复 role-card 死链；客户要求）

**来源**：客户普查发现含本角色在内 5 个角色缺 `feature-map.md`，role-card 中「当前导航见[测试功能导航](feature-map.md)」为死链；客户要求统一补建。边界：只写本角色边界 Section 1 内文件（本页 + changelog/memo，Section 1 已列）。

- **内容**：按「名称 / 一句话用途 / 当前状态 / 文档」列本角色九类交付物（跨角色联调 CLI 真入口与治理链、完整流程 su 建角色→写落盘→pin/shell 闸、Pi 配置往返与写入纪律、桌面交互独立回归 R1–R5、回放解析与展示映射、虚拟行锚点交付回归、最小复现与诊断探针、回归证据存档、其余稳定性小件），状态均按实际现状标注（2026-10-12 / 2026-10-14 各轮记录）；受测入口**链接受测角色功能文档、不复制其流程图**（role-card 口径）；未新建 `docs/feature/`（本角色无用户可操作业务功能）。
- **链接自检**：34 条相对链接逐一解析存在，**0 死链**（含 4 个证据目录、`test/测试/` 下 18 个脚本与桌面会话功能文档；桌面角色拆分重组中按现路径引用并标注）。
- 依据材料：role-card.md、boundary.yaml、memo.md、changelog.md、docs/ 与 test/测试/ 实际目录。**未 commit。**

## 2026-10-14 — 「按设计对齐」候选独立回归：主套件 119 条与回放 11 项通过；发现并上报虚拟行锚点漂移真实回归；抽屉关闭动画竞态为测试侧观测订正

**来源**：PM 冻结新候选（桌面「按 UI/UX v2 设计对齐」，纯视觉/骨架；实施记录见桌面属主 `docs/fix/2026-10-13_fix_uiux-design-alignment.md`，该角色重组中按现路径引用）。依赖变化使本角色上轮证据（旧指纹 fc148d35/f9c4e41f）失效，按 Governing Invariant 重跑受影响项并按新指纹重绑。边界：只写 `test/测试/**` 与 `角色卡/测试/**`；**未改产品代码、未碰他角色文件、未 commit/push**。

### 1) 测试侧订正（断言零变化）

- 首跑 102 条止于 'R5 choice title preview options and all actions exposed 960 card'。诊断（`drawer-close-race-diagnose.json`）：**既有**的 120ms 抽屉关闭动画（`#right-drawer` clip-path/可见性过渡——本候选仅改其底色/边色，动画为未变上下文）在激活后 ~80ms 时刻仍有可见残条（clip≈85–94%）；设计把未决卡从 `min(680px,92%)` 改**通栏**（V13）后卡右缘采样点（x≈908@960）落入残条区间。卡片本体可命中，只是**观测时刻未到**：400ms 后复测整卡全过，只加观测与等待（断言零变化）的诊断副本满跑 119 条通过。
- 订正 `ui-reacceptance-renderer-regression.mjs`：新增 `drawerSettled()`——两处「定位后整卡曝光」断言前等待抽屉 `visibility:hidden`（超时照原断言按真实状态判定，fail-closed）；两条曝光断言观测补记 `inert/rightTab/drawerVisibility`。**断言本体与其余断言一字未改**（脚本 4071945e→124d05f4）。等待证据：choice 两档 waits=3（约 60ms 残量）、confirm 两档 waits=0。

### 2) 真实回归（已上报，待属主修复后复测）

- 长会话（218 行、虚拟化）收起/展开执行记录组（46 条活动）：**旧候选**（`git show HEAD:` 原样取出 /private/tmp 运行，A/B 同夹具同脚本）收起 **−0.65625px**、展开 **0（完全复位）**、4 轮无累积；**新候选** **+1.0625px / +0.9375px**、逐轮净 **+2px** 累积、第 3 轮收起后锚点跳位 **68.125px**（offset +15.25→−52.875）后停在新位置；阅读文本身份两臂均保持。
- 交付锚点套件 13 条断言 **12 过 1 红**（'expand preserves preceding visible paragraph offset'：Δ=2.0px ≮ 2px；fail-fast 其余 8 条未跑；诊断副本证其余 11 条全过）。**未动断言、未放宽容差**。归因初判（供属主）：本候选 renderer.js 仅改呈现（记录行补时间列等），锚点机制代码未动；布局行高/组高为小数（段落 53.1875、组 2487.3125）而虚拟窗口记账用 `offsetHeight` 取整（53/2487），开合链 `refreshActivityHeight→updateVirtualWindow→restoreChatReading` 中整数/小数偏差从「互相抵消」变为「每轮 +2px 系统性漂移」，越界后换锚一档。
- 最小复现 `test/测试/uiux-anchor-drift-probe.mjs`（含旧候选 A/B 运行方法注释）；诊断副本 `test/测试/uiux-anchor-probe.mjs`（APP 可指向旧候选；仅把两处开合断言改为记录，其余全强度）。

### 3) 结果与重基线判定

- `node --test test/测试/uiux-v2-replay-regression.test.ts` → **11/11，0 skip，exit 0**（重绑重跑）。
- `node_modules/.bin/electron test/测试/ui-reacceptance-renderer-regression.mjs`（hidden、隔离 userData、受控内存 IPC）→ **119 条**（99 断言＋12 实际 Tab 行＋8 抽屉等待行）**通过，exit 0**，consoleErrors 空，run 起止指纹一致；两次满跑一致。
- `node_modules/.bin/electron test/测试/uiux-v2-renderer-regression.mjs` → **exit 1**（上述真实回归）。
- **零处重基线**：逐条核对三套脚本，**无断言编码设计值**（聊天头 66/composer 100/胶囊 52/760 居中/字号行高颜色/记录行时间列均不在断言内）；几何断言=设计无关不变量（相对 |Δ|<2px、无横向溢出、左缘对齐）＋R2 自身口径（动作 ≥28px，V31 已保留）；设计值只出现在观测字段，如 960 档会话列实测 630px（卡盒 296→926）与属主记录「960 档铺满 630」及原型 `.conversation` 一致。
- R1–R5 行为零改动核验：单份说明、全文/位次/点击区、默认异常目标/原因/exit、撤回就地回执、未决优先/定位/作答、IME、回交单一展示、停止保队列、图片/草稿——**全过**；唯一不符「语义零变化」即上述锚点漂移。
- 环境：Electron 44.7.0/内置 Node 24.21.0、终端 Node v24.14.0、macOS 26.6.2/arm64；HEAD 7457da4。**未跑**：全量/他角色套件、真实模型/网络/业务、GUI 截图；锚点套件 fail-fast 后 8 条仅诊断副本覆盖（不冒充通过）。
- 证据：`docs/change/2026-10-14_change_uiux-design-alignment-regression.md`（status blocked → 见下节复测后更新为 verified）＋ `docs/change/2026-10-14-uiux-design-alignment-evidence/`（renderer-report.json、renderer-presettle-race-fail.json、drawer-close-race-diagnose.json、anchors-report.json、anchor-drift-probe-new/old.json、anchor-coverage-new/old.json、replay-output.txt、candidate-hashes.txt）。

### 4) 修复候选复测（当日追加，结论改判：全部转绿）

修复候选 `renderer.js 402e49a7…`（styles/index/tool-rows/ui-labels/preload/session-history 与上轮冻结一致）独立复测：**主套件 119 条满跑通过（exit 0，报告内 startHashes==endHashes）**；**回放 11/11**；**锚点 14 条全跑全过（exit 0）**——上轮红项 'expand preserves preceding visible paragraph offset' **转绿**（收起/展开 before=after=11.1875、零漂移），fail-fast 之后的 8 条（单组折叠/追加/换身份/前插/已决卡双锚/跨角色未决/三条失败摘要）**实际跑到且逐项通过**。漂移探针升级 v2（**固定元素读数**，桌面UI建议；两读数并列）：修复候选 4 轮开合恒定 11.1875、scrollTop 恒定 12382；旧 HEAD 臂 −0.65625/0 与上轮一致。**「68.125px 跳位」订正（本角色实测，非仅算术推断）**：旧探针「首个可见行」读数在累计漂移约一格后**切换目标行**所致的观测伪影——保留修前行为的中间副本（`renderer.js fba0f1de…`，**非冻结指纹**、仅机制核对；本场景读数与冻结修前候选逐位一致）双读数实测：**固定元素**读数平滑 ~+1px/轮（11.25→16.3125，无跳变），**首可见行**第 5 次开合起读作 −52.875，恰为 16.3125 − 69.1875（69.1875 ＝ 行高 53.1875 ＋ pane 16px 行距，均实测）；真实症状 = ~1px/轮缓移、约 5 次开合后顶部多露一行。探针已改用固定元素读数（升级为交付断言时的口径）。本日 change 记录 status **blocked → verified**；证据 `docs/change/2026-10-14-driftfix-recheck-evidence/`（renderer-report.json、anchors-report.json、replay-output.txt、drift-probe-fix.json、drift-probe-oldhead.json、drift-probe-intermediate-mechanism.json、candidate-hashes.txt——运行结束后复核指纹与运行前一致）。**未改产品代码、未 commit。**

### 5) 第二版候选复测（行距缓存修复，当日再追加，全绿）

候选 `renderer.js 47703d0b…`（styles/index/tool-rows/ui-labels/preload/session-history 与上轮冻结一致）。属主摘要：U1 定性排查发现**行距缓存缺陷**——脱离文档的 pane 首次读行距得到空串被当 0 缓存，后台早到事件/恢复路径（行表在挂载前建成）会让该 pane 退回「不含行距」旧错口径；修法＝**仅挂载时读、命中才缓存**；`rowModelDebug` 只增收 `rowGap`。本角色独立复测：主套件 **119 条满跑（exit 0，报告内 startHashes==endHashes）**、回放 **11/11**、锚点 **14/14（全跑全过，收起/展开 before=after=11.1875）**、漂移探针双读数 **4 轮恒定 11.1875、scrollTop 恒定 12382**。**新增独立覆盖** `test/测试/uiux-rowgap-detached-probe.mjs`（本角色新写，r1–r3 三轮）：①B 角色**未挂载期**建行表 181 行（虚拟化）且 `rowGap:null`（未读**不落值**）；②树点点选挂载后 `rowGap===16` 且**等于挂载 pane `getComputedStyle` 实读值**、>0（独立真值源）；③挂载后 4 轮开合**零漂移**——组确在真切换（`open` 翻转、组高 2487↔36、docH 18625↔16126）；④**U1 抽跑**：两角色深内容、无未决，交替点角色树 20 次/轮 × 3 轮 = **60 次全部到底（0 miss）**，未出现属主所述既有偶发。排障备注（防误读）：新探针首两轮曾报 +428px 跳变，经查为**本角色夹具缺陷**（50 条后续正文误用消息对象未过 `parse` 成 ReplayRow → 组后为空 → 触发上轮已记录的「收起末尾大组 scroll 夹紧」既有口径），与产品无关；修正后三轮确定性通过。对照限制：本机无 402e49a7 副本可 A/B，独立判据＝「修复后行为正确 ＋ 缓存若为 0 时探针即红（rowGap≠paneGap）」。证据 `docs/change/2026-10-14-recheck2-evidence/`（renderer-report.json、anchors-report.json、replay-output.txt、drift-probe-final2.json、rowgap-detached-probe-r1/r2/r3.json、candidate-hashes.txt——运行结束后复核指纹与运行前一致）。**未改产品代码、未 commit。**

## 2026-10-12 — 按新语义更新 shell 闸 (b) 不可解析断言：不升 (a)，直接拒绝（b-unparseable-deny）

**来源**：客户裁定（M-2）——(b) 审读输出**不可解析 ⇒ 直接拒绝**（fail-closed），**不升 (a)、不重试、不打扰客户**；编排已落地（`src/common/编排/shell-gate.ts`：删 `BRANCH_B_BADJSON`，新增归因码 `BRANCH_B_UNPARSEABLE="b-unparseable-deny"` + 固定短句 `REASON_B_UNPARSEABLE`；其余分支不变）。边界：只写 `test/测试/**` 与 `角色卡/测试/**`。

### 1) 失效断言（改前）

`t9-block3-pin-shell.test.ts`（原 `:376-381`）：`pmAsk → "这不是 JSON"` + (a) 桩 `unavailable` → 断 `b-badjson→a-unavailable`（旧「升 (a)」语义）。

### 2) 改后断言（未放宽，反而加严）

(a) 桩改为**本会放行**（反向钉住「根本不该惊动客户」）：断言 `allow===false`、audit `conclusion==="deny"`、`branch===BRANCH_B_UNPARSEABLE`、**`calls.a===0`**、`reason===REASON_B_UNPARSEABLE`（固定短句，单一来源，绝不说成放行）。用例名同步改为「…；JSON 非法（不可解析）→ **直接拒绝、不升 (a)**」。**顺带核对**：同文件其余 shell 链断言（(c) 白名单/硬拒含反向守卫、risky 五条含最要害 `b-allow→a-deny`、b-unsure/无会话/超时仍升 (a)、(a) 超时/不可用/未接通道拒绝、规则集加载失败）与现实现逐条相符，**未动**。

### 3) 验证（本角色独立执行，2026-10-12）

- `node --test "test/测试/*.test.ts"` → **110/110 通过，exit 0**（改前 109/110）。
- `node --test "test/**/*.test.ts"`（引号带）→ **836 计 / 833 过 / 2 红 / 1 跳，exit 1**；两红＝既有环境红（桌面 `pi-config.test.ts:60` 目录名、pm `path-primitives.test.ts:254` macOS `/var`）。
- `npm run typecheck` → **0 错（exit 0）**。
- 环境：Node **v24.14.0**、macOS 26.6.2、HEAD **d933537**（改动均未提交）。

## 2026-10-12 — 按客户确认制新语义（A 组）改写本目录 4 条用例：finalize/operatorChannel/settled 旧面已删 → request_confirmation + F4 发行 + 自动收尾

**来源**：客户 2026-10-12 批准设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` A 组（删「收口」、客户确认制、客户同意后自动收尾）；编排/Pi适配器/桌面实施后，本目录 4 条按旧面断言的用例转红。边界：只写 `test/测试/**` 与 `角色卡/测试/**`；未碰他角色文件。

### 1) 失效断言（改前）

- `t9-block1-bootstrap.test.ts` 3 条（第 6/7 节）：用**已删**的句柄 `settled`/`finalize()` 与 `operatorChannel` 注入（finalize 提议-确认整面已删）。
- `cli-genesis-boundary.test.ts` 1 条（链路面）：用**已删** `operatorChannel`；且其「不确认直接写」脚本在新语义下被 F4 拒（**红即正确**）。
- 扫全目录「已删 API」：仅上述 4 条；`t9-block3-pin-shell.test.ts` 的 `operatorChannel` 是 **shell 闸 (a)** 的通道（仍在，非已删面），未动。

### 2) 改后断言（新语义；**逐条保留或等价替代，未放宽**）

- t9-block1 ①（未获同意）：客户**拒绝** / 通道**不可用** 两场景——su 应**恰好发起一次** `request_confirmation`；事件断言「未获客户同意」如实回报 + 后续写入被 **F4** 拒（未确认路径不发行）；角色三件套、`.ans`、治理边界文档、manifest **全零副作用**（较旧版**新增**「角色文件也不得出现」断言）。
- t9-block1 ②（确认通过）：确认桩恰 1 次、预览列出三条将写路径；写入**真落盘**（字节相等）；**自动收尾**写出治理边界文档（内容 = `renderGovernanceBoundaryDoc()`）+ `.ans` + manifest；`acceptance.source` **逐字等于创世来源**——旧断言「含 `operator:test-客户`」随 A-4 证据模型（确认在写入前逐笔进行、operatorId 在工具事件不在 `.ans`）被**替代**为更严的等于断言（注释已注明）；pin 独立重算一致、载入器验 pin-backed accepted、`resolveRole` 无 parseError——**全部保留**。
- t9-block1 ③（拿掉授权）：边界未接受 → su 写入被 **F6** 拒（事件断言）+ 角色目录不出现；直接调 `repinIfBootstrapped`（= 会话 settle 时调用的**同一函数**）→ `ok:false`、`status:"blocked"`、reason 含门禁拒绝、零副作用——保留旧 reason 断言语义。
- `cli-genesis-boundary.test.ts` 链路面：改注入 `customerInput` 确认桩（`(gate, caps) => createFakeRuntimeAdapter({…, customerInput: caps?.customerInput})` 镜像真实接线）；越界写不落盘 + 确认后角色文件落盘 + **自动收尾三件落盘** + `exit 0` + 确认恰一次。

### 3) 验证（本角色独立执行，2026-10-12）

- `node --test "test/测试/*.test.ts"` → **110/110 通过，exit 0**。
- `node --test "test/**/*.test.ts"`（引号带）→ **715 计 / 697 过 / 17 红 / 1 跳，exit 1**——**0 红在本目录**；17 红归属：13 `test/桌面应用/finalize-wiring.test.ts` + 1 `interface.test.ts` + 1 `renderer.test.ts`（桌面角色在途迁移，未修）、1 `pi-config.test.ts` 与 1 `test/项目管理/shared/path-primitives.test.ts`（既有环境红）。
- `npm run typecheck` → **28 错全在他角色在途文件**（`app/desktop/customer-input.ts` 2、`test/桌面应用/finalize-wiring.test.ts` 22、`test/桌面应用/interface.test.ts` 4）；**本目录 0 错**。
- 环境：Node **v24.14.0**、macOS 26.6.2、HEAD **d933537**（工作区改动均未提交）。
- **未验**：真实模型端到端（su 真经确认建角色）——属「客户跑」。

## 2026-10-12 — runCli 默认擦洗凭据/ANS_RUNTIME + 补 CLI `ans govern <目录>` 入口与创世用例（客户批准 M1+M2+M3+O1）

**来源**：本角色第三轮独立复核发现（提案与证据 `docs/fix/2026-10-12_fix_runcli-credential-leak-and-govern-cli-cases.md`）。客户 2026-10-12 批准 **M1+M2+M3+O1**、**未采纳 O2**（无消费者，将来真需要再加），并随 O1 裁定「有 `角色卡/` 无 `.ans`」判据差**维持现状**（桌面对齐另议）。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/common/shared/runtime-shared.ts`、`src/index.ts`、`src/service/role/resolve-role.ts`、`src/service/gate/resolve-write.ts`、`src/interface/cli/govern.ts`、`src/provider/pi/session.ts`。

### 1) 问题（实测）

- `test/测试/helpers.ts` 的 `runCli` 调 `spawnSync` **未传 `env`** ⇒ 子进程继承跑测进程环境。机器上有 `ANS_PI_*`/凭据时：`real-entry` 的 govern 用例**真开会话、发真实模型请求**，且会话成功反使「断言非 0」转红；该会话 su 在自根（演示配置）下边界 = 门禁引擎 Section 1（17 条、accepted、scope 未收窄）——实测 `src/common/门禁引擎/evil.ts` 类写入**会被放行**（极端情况把文件写进仓库）。
- 同类第二开关：`ANS_RUNTIME=pi` 会把 role run 三条成功用例从演示切到真实适配器（无凭据全红、有凭据真发请求）。

### 2) 改后断言（`test/测试/`）

- `helpers.ts`：新增私有 `scrubbedEnv()`，`runCli` 子进程 env 默认擦洗三类键——`PI_CREDENTIAL_ENV_VARS`（单一来源 `runtime-shared.ts` **只读导入**）+ 全部 `ANS_PI_` 前缀键 + `ANS_RUNTIME`；其余环境原样。**不加** O2 开关（客户未采纳）。
- `real-entry.test.ts`：`FAIL_CASES` 加可选 `stderrMatch`，govern 条目填 `/缺少 base URL/`（**收紧**：原「非 0」保留，其余断言一字未动）；新增真入口用例「`ans govern <空目录>` → 非 0 + stderr 无「治理边界解析失败」+ 含「缺少 base URL」+ 目标目录零残留」；新增「runCli 默认擦洗」哨兵用例（**实施时增补**：注入哨兵 `ANS_RUNTIME=pi`+凭据变量后断言子进程看不到它们——否则无凭据机器上无法证明擦洗生效；哨兵 base URL 置空 ⇒ 即便擦洗失效也不外连）。
- 新增 `cli-genesis-boundary.test.ts`（跨角色联调）：① 判定面——空目录注入 su 边界**恰 3 条**（`角色卡/`、`docs/`、`.ans/`），`src/**`、词法逃逸（`角色卡/../src`）、真实路径逃逸、根外绝对路径全拒，三处治理产物放行；② 链路面——`governCommand` + 假适配器：越界写 `src/evil.ts` **不落盘**、`角色卡/X` 骨架**真落盘**、命令 exit 0；③ O1 角落——有 `角色卡/` 无 `.ans` 仍带 `genesisBootstrap`（`listProject.hasRoles=true` 呈现差异），可写面仍只落三处治理产物（客户裁定登记于用例注释与提案文档）。

### 3) 验证（本角色独立执行，2026-10-12）

- `node --test "test/测试/*.test.ts"` → **110/110 通过，exit 0**（基线 105；+5 = M2 1 + M3 2 + O1 1 + 擦洗哨兵 1）。
- `node --test "test/**/*.test.ts"`（引号带）→ **692 计 / 689 过 / 2 红 / 1 跳，exit 1**（基线 687/684/2/1）。两红为他角色**既有环境红**，未修、不计入本角色回归：`test/桌面应用/pi-config.test.ts:60`（检出目录名）、`test/项目管理/shared/path-primitives.test.ts:254`（macOS `/var`→`/private/var`）。
- `npm run typecheck` → **0 错（exit 0）**。
- **未验**：真实模型端到端（su 真建角色 → 提议 → 终端 y/n 确认）——属「客户跑」。

## 2026-10-11 — 按新语义改 Pi 面板断言：面板键 5→4（3 必填 + 1 可选）、`ANS_PI_PROVIDER` 移出面板（转反向守卫）、`ANS_PI_CONTEXT_WINDOW` 改可选

**来源**：客户就桌面 Pi 设置面板给新裁定（原话：「**这个 pi 为啥需要配置 5 个呢**」——真正必须的只有 **3 个**）。桌面应用据此改 `app/desktop/pi-config.ts`（**只读**）：面板键集合 `PI_PANEL_KEYS` 由 5 → **4**（3 必填 `ANTHROPIC_AUTH_TOKEN`/`ANS_PI_BASE_URL`/`ANS_PI_MODEL` + 1 可选 `ANS_PI_CONTEXT_WINDOW`）；`ANS_PI_PROVIDER` **移出面板**（代码里有默认值 `ans-gateway`、是内部标签，非用户该填）；`ANS_PI_CONTEXT_WINDOW` 从「必填」改「**可选 + 保守默认**」（Pi适配器 `src/common/pi-adapter/provider-config.ts` 定的默认值 `DEFAULT_PI_CONTEXT_WINDOW = 32768`；缺失**不硬失败**，只在日志/事件流提示）。桌面如实回报本角色两处按**旧语义**断言已红（**未动本角色文件**）。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`app/desktop/pi-config.ts`、`src/common/pi-adapter/provider-config.ts`。

### 1) 两处失效断言（改前，已实测）

- `test/测试/t29-pi-config-roundtrip.test.ts:75`：`assert.deepEqual([...res.applied].sort(), [...PI_PANEL_KEYS].sort())`——把「**载入结果（文件里实际载入的全部键名）**」当「**面板键集合**」等起来。夹具 `.env` 含 `ANS_PI_PROVIDER`，故 `res.applied` 有 5 键、`PI_PANEL_KEYS` 只有 4 键 → 差异 `+ANS_PI_PROVIDER`。
- `test/测试/t29-write-discipline.test.ts:157`：在「特殊字符写后读回」用例里把 `["ANS_PI_PROVIDER", "  padded both ends  "]` 当作**可写的面板键**提交给 `savePiConfig`。provider 已不是面板键 → 被过滤 → 读回 `undefined`，报 `ANS_PI_PROVIDER 经 parse 读回须逐字一致` 失败。

### 2) 改法

- **roundtrip:75**：拆成三条——(a) `res.applied` 等**文件里实际载入的全部键名**（5 键，含 `ANS_PI_PROVIDER`——它仍是被读取的环境变量，只是不再占面板输入框）；(b) `PI_PANEL_KEYS` 等 **3+1 = 4** 键（以代码里的导出为准）；(c) **反向守卫** `!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER")`。**未删行**——反向守卫比删掉更能防它长回来。
- **write-discipline:157**：把该用例的 provider 项**换成面板键**（`ANS_PI_CONTEXT_WINDOW`，仍验「首尾空白」的字节保真）；**另起一条**反向守卫用例 `ANS_PI_PROVIDER 不是面板键——提交被忽略`：结构化断言 `!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER")` + 行为断言（提交 `{ANS_PI_PROVIDER:"should-not-write", ANS_PI_MODEL:"ok"}` → `appliedKeys==["ANS_PI_MODEL"]`、值不落盘、**已在 `.env` 的 provider 行原样保留**）。导入 `PI_PANEL_KEYS`。
- **contextWindow 新语义**：本角色原**无**「必填」断言；**新增**一条守卫 `t29-pi-config-roundtrip.test.ts` 第 2b 节——放入**不含** `ANS_PI_CONTEXT_WINDOW` 的 `.env` → `resolvePiProviderConfig` **不抛错**、`contextWindow===DEFAULT_PI_CONTEXT_WINDOW(32768)`、`contextWindowSource==="default"`（钉死默认值，防被人悄悄改动）。
- **`test/测试/t9-block1-bootstrap.test.ts`**：同属本角色目录，两处**陈述**（非断言）按旧语义写着 `ANS_PI_CONTEXT_WINDOW（必填）` 且把 `ANS_PI_PROVIDER` 列入需配置项——按新语义订正（BASE_URL/MODEL 必填、CONTEXT_WINDOW **可选**、删 provider）。该 `CLIENT_MANUAL_STEPS` 常量未被别处引用。

### 3) 「旧断言是否揭示了新语义的问题」——**否**

两处旧断言都只是**偶然耦合**：`res.applied == PI_PANEL_KEYS` 成立，仅因旧 `.env` 夹具恰好只含面板键（现在多了 provider 行，两者才分岔）；provider 在旧面板里可写，仅因当时它算一个面板键。新语义本身**自洽且已被行为验证**：provider 移出面板后**仍**由 `resolvePiProviderConfig` 从 env 照读（`cfg.providerId==="ans-gateway"`，roundtrip 用例仍绿）、其 `.env` 行**原样保留**；contextWindow 缺失回落保守默认**不硬失败**、非法值**仍**明确失败（Pi适配器已验）。**未发现新语义的问题**。

### 4) 扫全仓：别处有无同类旧断言

扫全 `test/`（含本角色外）：`ANS_PI_PROVIDER` / `PI_PANEL_KEYS` / `PI_REQUIRED_KEYS` / `contextWindow` 命中的**桌面角色**（`test/桌面应用/pi-config.test.ts`、`renderer.test.ts`、`e2e/main.mjs`）与 **Pi适配器角色**（`test/pi-adapter/provider-config.test.ts`）**均已迁到新语义**（含反向守卫：`!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER")`、`PI_REQUIRED_KEYS` 不含 context window、缺失→默认 32768 不抛错）——**无遗留旧断言**。其余命中（`test/项目管理/shared/env-file.test.ts` 把 `ANS_PI_CONTEXT_WINDOW` 当**样例数据**、`test/pi-adapter/real-adapter.*` 显式传 `contextWindow: 131072`）**非**「必填/provider 面板键」断言，不受影响。**未改任何非本角色文件**。

### 5) 结果

`node --test test/测试/*.test.ts` → **105 pass / 0 fail**（原 103；+2 新增守卫）。`npm run typecheck` → **零错误**。全量 `node --test "test/**/*.test.ts"`（带引号走 Node glob）→ **677 pass / 0 fail**（基线 **673 通过 / 2 失败** = 675 总，那 2 处即本条，**已消除**；+2 新增 = 677）。**未遇**并行编排收归三类型引起的红。

## 2026-10-11 — 按新语义改 shell 闸 (c) 判定断言：rm 改判 risky（必过 (b) 且 b 放行后仍必过 (a)）；sh -c 仍硬拒

**来源**：客户就 **shell 闸 (c) 的判定**给新裁定，**部分推翻**「危险即硬拒终结」（原话：**pm 不是终审，客户才是**）。门禁引擎（T40 `src/common/门禁引擎/classify-shell.ts`）+ 编排（T41 `src/common/编排/shell-gate.ts`）已落地：`ShellClass` 四态 `"allow" | "deny" | "risky" | "review"`；`rm`/`dd`/`sed -i`/`git` 写子命令等从硬拒**改判 `risky`**；`sh -c`/`eval`/`node -e`/`awk` **仍硬拒**（命令藏在 string 里，客户看原文看不懂、兜不住，§14.4）。次序表（§14.2）：`risky`→(b)；**b 判放行仍须过 (a)**；b 判拒即终结、**不打扰 (a)**；(a) 拒绝/超时/不可用 → 拒绝；(b)/(a) 均未接 → 拒（fail-closed）。两角色如实回报**未越界改本角色文件**，点名 `test/测试/t9-block3-pin-shell.test.ts:248` 的 `rm -rf build` 硬拒断言已成为失败项（**正是 fail-closed 语义变更的预期，非 bug**）。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/model/decision.ts`、`src/common/门禁引擎/classify-shell.ts`、`src/common/编排/shell-gate.ts`、`src/provider/pi/session.ts`。

### 1) 失效断言（改前，先实测）

本角色 `test/测试/t9-block3-pin-shell.test.ts`（`test` 声明于 **248** 行）按**旧语义**断言 `rm -rf build` 硬拒：

```ts
const r = await gate(req("rm -rf build", ["rm", "-rf", "build"]));
assert.equal(r.allow, false, "硬拒必须拒绝");
assert.equal(calls.b, 0, "(b) 本会放行也必须**不被调用**——硬地板绝对否决");
assert.equal(calls.a, 0, "(a) 本会放行也必须**不被调用**");
assert.match(r.allow === false ? r.reason : "", /硬拒|deny/);
assert.equal(audit.records[0].branch, BRANCH_C_DENY);
```

独立实测四态（`classifyShell`，`defaultShellRules()`）：`rm -rf build` → **`risky`**（不再 `deny`）；`sh -c …` → **`deny`**；`python x.py` → `review`；`ls -la` → `allow`。故该断言与新区次序表矛盾——`rm` 现走 `risky`，会接 (b)/(a)。**这正是 fail-closed 语义变更的预期**。

### 2) 改法

**① 保留并加固 `sh -c` 那条**（原「硬拒终结」的断言改用 `sh -c` 承载，原断言逐条保留）：
- 保留：`allow:false`、`calls.b===0`、`calls.a===0`（(b)/(a) 桩**本会放行**，证明硬地板不可翻案）、`reason` 匹配 `/硬拒|deny/`、`branch===BRANCH_C_DENY`。
- **新增反向守卫**（这处最容易被后人顺手放宽）：直接钉住 (c) 分类——`assert.equal(classifyShell(["sh","-c","rm -rf build"], rules), "deny")` + `assert.notEqual(…, "risky")` + `assert.notEqual(…, "allow")`。

**② 把 `rm` 那条改写为新次序表的四条**（覆盖任务要求的全部分支）：
- `risky + (b)/(a) 均未接入 → 拒绝`，branch `BRANCH_RISKY_NO_BA`（`risky-default-deny`）；
- **`risky + (b) 放行 + (a) 拒绝 → 拒绝`**（**最要害**：证明 pm 不是终审）——branch `b-allow→a-deny`，`calls.a===1`；
- `risky + (b) 拒绝 → 拒绝且 (a) 未被调用`——branch `BRANCH_B_DENY`，`calls.a===0`；
- `risky + (b) 放行 + (a) 放行 → 放行`——branch `b-allow→a-allow`，`calls.b===calls.a===1`（**正例**）。

### 3) 正例与替身（不只改负例）

四条 risky 用例中，`risky + (b) 放行 + (a) 放行 → 放行` 是**正例**。确认通道替身即既有 `gateWithSpies` 注入的 `pmAsk`（`PmAskFn`）与 `operatorChannel`（`OperatorChannelFn`）——**形状单一来源 `src/provider/pi/session.ts`**（与 `t9-block1-bootstrap.test.ts` finalize 正例**同一套替身**：`(prompt) => ({ outcome: "allow", operatorId: "op" })`）。spy 包装记录 (b)/(a) 调用次数，故「必过 (a)」可断言。

### 4) 扫本角色全目录：有无别处仍按旧语义断言 shell 判定

**无。** `test/测试/` 内 `classifyShell` / `ShellClass` / `risky` / `hardDeny` 命中除本文件（已改）外，仅 `t9-block3-pin-shell.test.ts:426` 的 fail-closed 用例（`classifyShell(["ls"], badRules) === "deny"`）——那是**规则集版本未知**的 fail-closed 断言（程序名单无关），**不受影响、仍绿**。其余文件（`helpers.ts`/`boundary-matrix`/`fail-closed`/`wiring`/`conditions-f5`/`real-entry`/`f7-symlink`/`t9-block2`/`t29-*`）**不含** shell 判定断言。**未改任何非本角色文件**（如实回报；本角色边界不含 `test/门禁引擎/`、`test/编排/`）。

**注**：`test/门禁引擎/classify-shell.test.ts`、`test/编排/shell-gate.test.ts`（**门禁引擎 / 编排**角色，非本角色）是否已随新语义更新**不在本角色边界**，**未核对、未改动**——如发现旧语义断言请由对应角色收口。

### 5) 验证（本角色独立执行）

- `node --test test/测试/t9-block3-pin-shell.test.ts` → **20 pass / 0 fail**（改前 16 例，本条 1 → 5，净 +4）。
- `node --test test/测试/*.test.ts` → **103 pass / 0 fail**（改前 99）。
- `npm run typecheck` → **零错误**。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**走 Node glob，三层路径）→ **657 pass / 0 fail**（基线 653 总 / 652 通过 / 1 失败；那 1 处即本条，已消除）。**改完全量全绿。**
- 观察（如实登记，非本改动引入）：首跑曾**偶发**一次 `test/pi-adapter/tools.test.ts:248`（`edit_file` 保留 UTF-8 BOM 用例）失败；单跑该文件 3/3 通过、其后两轮全量均 657/657 全绿 ⇒ 判为**偶发 flake**（异角色文件、异路径、与 shell 判定无关）。未改该文件。

## 2026-10-11 — 按新语义修 finalize 断言：收口需客户确认（fail-closed）

**来源**：客户裁定 **bootstrap 完成方式 =「su 主动提议 → 客户确认 → 完成」**（原话：「完成 bootstrap 应该是 su 主动觉得差不多了，来完成」+「当然需要客户确认了」）。编排（T37）据此改造 `src/common/编排/finalize.ts::finalize()`：**不再「被调用即完成」**，而是**构造提议、经客户确认通道挂起**；**通道缺省/不可用/超时/拒绝 → 不完成**（fail-closed）。确认通道**复用 shell 闸 (a) 的 `OperatorChannelFn`**（形状单一来源 `src/provider/pi/session.ts`），提议是**一种 `OperatorPrompt`**——**不造第二套确认机制**。编排未越界改本角色文件，如实把结论交回本角色收口。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/common/编排/finalize.ts`、`src/provider/pi/session.ts`、`src/pipeline/orchestration/govern-session.ts`。

### 1) 失效断言（改前，先实测）

本角色 `test/测试/t9-block1-bootstrap.test.ts` 第 6 节 finalize 正例（`test` 声明于 **339** 行）按**旧语义**断言——调 `handle.finalize()` 即期望完成：

```ts
const res = await handle.finalize();
assert.equal(res.ok, true, `finalize 应成功：${res.reason ?? ""}`);
```

实测确切失败位置——
- `node --test test/测试/t9-block1-bootstrap.test.ts` → **9 pass / 1 fail**；`AssertionError [ERR_ASSERTION]: finalize 应成功：收口未获确认：未接入客户确认通道（无人值守？）——不完成（fail-closed）；su 可继续工作或稍后再提议`，`actual: false` / `expected: true`，抛在 **`t9-block1-bootstrap.test.ts:357:10`**。
- 该用例**未注入** `operatorChannel`，故新语义下 `confirm()` 判为 `unavailable` → `mkResult("unavailable", …)` → **不完成**——**正是 fail-closed 的预期**，非 bug。

### 2) 改法（按新语义改写为**两条**：负例 + 正例）

第 6 节由「一条按旧语义的正例」改写为：

- **① 未确认 → 不完成 + 零副作用**（原旧断言的位置）：su 经创世边界建出角色（**不写**治理边界文档，以便断言它未被写）→ **不注入** `operatorChannel`（模拟「未接入客户确认通道」）→ `handle.finalize()` 断言 `ok:false`、`status==="unavailable"`、`message` 匹配 `/未获确认|未接入客户确认通道|fail-closed/`；**零副作用**：`.ans/`、`.ans/project.json`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md` **逐一断言不存在**、`wrote` 为空。
- **② 确认通过 → 完成**（新增正例）：同样 su 建角色 → **注入 allow 确认通道替身** `(prompt) => ({ outcome: "allow", operatorId: "test-客户" })`（**形状 = shell 闸 (a) 的 `OperatorChannelFn`**，提议是 `OperatorPrompt`）→ `handle.finalize()` 断言 `ok:true`、`status==="completed"`；并断言提议**确经该通道**提出（`cwd===项目根`、带 `command`/`argv`/`toolCallId`）；写出 **治理边界文档（内容 === `renderGovernanceBoundaryDoc()`）+ `.ans/project.json` + `docs/bootstrap-manifest.md`**；pin 覆盖 `[角色卡/governance-boundary.yaml, 角色卡/新角色/boundary.yaml]` 且**由我自己用 `node:crypto` 独立重算 SHA-256 逐条比对一致**；`acceptance.source` 含 `operator:test-客户`；该 `.ans` 经装配载入器 `loadEffectiveConfig` 验为 **pin-backed accepted**、`resolveRole("新角色")` 无 `parseError`。

新增值导入 `renderGovernanceBoundaryDoc`（`src/common/编排/finalize.ts`）与类型 `OperatorChannelFn`/`OperatorPrompt`（`src/provider/pi/session.ts`）——**只读引用**，符合本角色边界。第 7 节「拿掉授权 → 被门禁拒」负例**不变**（仍绿：门禁前置预检在提议前即拒，未打扰客户）。

### 3) 扫全仓：有无别处仍在按旧语义断言 `finalize`

- `test/编排/finalize.test.ts`、`test/编排/genesis-finalize-reach.test.ts`（**编排**角色）：**已是**新语义——均注入 `operatorChannel`（allow/deny/unavailable 各色）后断言 `completed`/`declined`/`unavailable`，**无需改动**，且全绿。
- `test/桌面应用/finalize-wiring.test.ts`（**桌面应用**角色，非本角色）：**:156** 与 **:190** 两条用例在**未接任何确认通道**下仍断 `manager.finalizeBootstrap()` `ok:true` ——**同属旧语义**（`finalizeBootstrap` 经 `SessionManager` 未透传 `OperatorChannelFn` ⇒ 实得 `unavailable`）。**这正是全量剩余的那 2 处失败**，属桌面角色（已排给它）——**未动**（本角色边界不含 `test/桌面应用/`）。
- 其余命中均为设计文档 / `memo` / `changelog` 说明文字，非断言。

**未改任何非本角色文件**（如实回报）。

### 4) 验证（本角色独立执行）

- `node --test test/测试/t9-block1-bootstrap.test.ts` → **11 pass / 0 fail**（改前 9/1；本文件 10→11 例，净 +1）。
- `node --test test/测试/*.test.ts` → **99 pass / 0 fail**（改前 98/1）。
- `npm run typecheck` → **零错误**。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**走 Node glob，三层路径）→ **610 总 / 608 通过 / 2 失败**（改前 **609 总 / 606 通过 / 3 失败**）。剩余 **2 处**失败**均在** `test/桌面应用/finalize-wiring.test.ts:156`、`:190`（桌面角色，非本角色、未动）。

## 2026-10-11 — 修一处因「空项目不再报 warning」而失效的断言（空项目是正常状态）

**来源**：客户指出「**项目没有角色卡的时候也不用有错误提示啊，这个是正常的**」。门禁引擎据此改 `src/service/role/resolve-role.ts::listProject`：**无角色目录**时**不再推那条 warning**（返回值其余不变——仍返回 `[内置 su] + hasRoles:false + primaryRoleId:{内置 su id}`）；**所有真异常的 warning 全部保留**（缺 `role-card.md` / 缺 `boundary.yaml` / 读取失败 / 边界解析失败 / 角色重复 /「有目录却无有效角色」）。门禁引擎**未越界改本角色文件**，把结论交回本角色收口。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/service/role/resolve-role.ts`。

### 1) 失效断言（改前，先实测）

本角色 `test/测试/t9-block1-bootstrap.test.ts` 的「空文件夹」用例（`test` 声明于 **122** 行）仍在断言空项目**应**给出 warning：

```ts
assert.ok(
  listing.warnings.some((w) => w.includes("bootstrap") || w.includes("无角色目录")),
  `应给出「尚未 bootstrap」类 warning，实得：${JSON.stringify(listing.warnings)}`,
);
```

实测确切失败位置 ——
- `node --test test/测试/t9-block1-bootstrap.test.ts` → **9 pass / 1 fail**；失败即本用例，`test at test\测试\t9-block1-bootstrap.test.ts:122:1`，`AssertionError [ERR_ASSERTION] … 应给出「尚未 bootstrap」类 warning，实得：[]`，抛在 **`t9-block1-bootstrap.test.ts:133:10`**（`actual: false` / `expected: true`）。
- 只读核对新行为（`listProject`，`src/service/role/resolve-role.ts:106-221`）：空项目 `foundRoots.length===0` ⇒ 第 215 行的「有目录却无有效角色」汇总**也不触发** ⇒ 返回 `{ warnings: [], hasRoles:false, primaryRoleId: BUILT_IN_GOVERNANCE_ROLE_ID, roles:[内置 su] }`。与本用例其余正面断言（`hasRoles:false` / `primaryRoleId:"su"` / `roles.length===1` / 内置 su 带 `cardText`）一致。

### 2) 改法：反向守卫（**不删行**）

把该 `assert.ok` 改为**断言没有 warning**——留着守卫比删掉更有价值（它不会再长回来）：

```ts
assert.deepEqual(listing.warnings, [], `空项目不应有任何 warning（空项目是正常状态），实得：${JSON.stringify(listing.warnings)}`);
assert.ok(
  !listing.warnings.some((w) => /无角色目录|尚未 bootstrap/.test(w)),
  `空项目不得再出现「无角色目录 / 尚未 bootstrap」类 warning，实得：${JSON.stringify(listing.warnings)}`,
);
```

并改写上方注释：说明客户 2026-10-11 裁定「**空项目是正常状态**（尚未 bootstrap 的初始态）、不该报警」，且**真异常 warning 全部保留**。写法与 `test/门禁引擎/list-project.test.ts`（门禁引擎角色）同款**反向守卫**。**未**改动其余断言语义。

### 3) 扫全仓：有无别处仍在断言那条 warning

**无。** 全仓 `无角色目录|尚未 bootstrap|warnings.some` 命中里，除本处（已改）外 ——
- `test/门禁引擎/list-project.test.ts`（**门禁引擎**角色，非本角色）：**已是**反向守卫 `!w.some(w => /无角色目录/.test(w))`，无需改动；
- `test/桌面应用/interface.test.ts:275 / :328`（**桌面应用**角色，非本角色）：`warnings: ["项目根下无角色目录"]` 仅是喂给 `listProjectFn` 的**桩输入**（构造 mock `ProjectListing` 测桌面**透传**），**并不断言**真实 `listProject` 产出该 warning ⇒ 不受影响；
- 其余命中均为设计文档 / `memo`/`changelog` 说明文字，非断言。

**未改任何非本角色文件**（如实回报）。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **98 pass / 0 fail**（改前 97 / 1）。
- `npm run typecheck` → **零错误**。
- 全量 `node --test "test/**/*.test.ts"`（**带引号**走 Node glob，三层路径）→ **598 pass / 0 fail**（连跑 4 次均全绿）。
- 观察（如实登记，非本改动引入）：全量首跑曾**偶发**一次 `test/pi-adapter/tools.test.ts:248`（`edit_file` 保留 UTF-8 BOM 用例）失败；单跑该文件 3/3 通过、其后全量 3/3 全绿 ⇒ 判为**偶发 flake**，与本次改动无关（异角色文件、异路径）。未改该文件。

## 2026-10-11 — 修一处因拆除「只读」徽标而失效的断言（su 不再标只读）

**来源**：客户裁定**拆掉 su 上的「只读」标记**（原话：「su 不该是只读…一直可以聊天」）——依据其早定的「**门禁静默执行、拒绝内联显示在聊天流里**」；「只读」徽标是后加的、偏离了那条，故拆除。桌面应用（他角色）随之**删除** `RoleView.readOnly`、`isReadOnlyRole` 及相关呈现与样式。桌面未改本角色文件（`test/测试/t9-block1-bootstrap.test.ts` 在本角色边界内），把结论交回本角色收口。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`app/desktop/interface.ts`。

### 1) 失效断言（改前，先实测）

本角色 `test/测试/t9-block1-bootstrap.test.ts:138` 仍在读已删字段：

```ts
assert.equal(listing.roles[0].readOnly, false, "未 bootstrap 的 su 能写治理产物，不得标只读");
```

实测确切报错位置——
- `npm run typecheck` → `test/测试/t9-block1-bootstrap.test.ts(138,33): error TS2339: Property 'readOnly' does not exist on type 'RoleView'.`（**1 处**）
- `node --test test/测试/*.test.ts` → **97 pass / 1 fail**；失败即本用例，`AssertionError … 未 bootstrap 的 su 能写治理产物，不得标只读`，`actual: undefined` / `expected: false`（读到的字段已是 `undefined`）。
- `RoleView`（`app/desktop/interface.ts:49`）现无 `readOnly` 字段（确认：只剩 `roleId/cardPath/boundaryPath/cardText/boundary/builtIn/changelog/docs`）。

### 2) 改法：反向守卫（**不删行**）

把该行改为**断言该字段不存在**——留着守卫比删掉更有价值（它不会再长回来）：

```ts
assert.equal("readOnly" in listing.roles[0], false, "su 不应再带 readOnly 字段（只读徽标已移除）");
```

并改写上方注释：说明客户 2026-10-11 裁定移除「只读」徽标（它偏离了「门禁静默执行、拒绝内联显示在聊天流里」的原模型；su 本就一直能聊天/写治理产物）。写法与 `test/桌面应用/interface.test.ts`、`su-effective-boundary.test.ts` 的**反向守卫**同款（`assert.equal("readOnly" in r, false, …)`），**一致性**：全仓同一条纪律。**未**改动其余断言语义。

### 3) 扫全仓：有无别处仍在读被删的 `readOnly`

**无。** 全仓 `\.readOnly|readOnly\b` 命中里，除本处（已改）外——
- `test/桌面应用/`（`interface.test.ts` / `su-effective-boundary.test.ts`）已是**反向守卫**（断言字段不存在），无需改动；
- `src/common/门禁引擎/classify-shell.ts`、`src/model/decision.ts`、`test/门禁引擎/classify-shell.test.ts`、`test/测试/t9-block3-pin-shell.test.ts` 等的 `readOnly` 是 **`ShellRules.readOnly`**（shell 命令分类的**只读程序白名单**数组），**与被删的 `RoleView.readOnly` 无关**，不动。

**未改任何非本角色文件**（如实回报）。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **98 pass / 0 fail**（改前 97 / 1）。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，三层路径）→ **598 pass / 0 fail**（基线 599，−1 是桌面删了 1 条纯 `isReadOnlyRole` 用例；本改动未增减用例数，仅改 1 行断言）。
- `npm run typecheck` → **零错误**（原 1 处已消除）。

## 2026-10-11 — T35 用户入口验收：重写 t9-block1（su 不预建 · 从用户入口出发）

**任务**：T35（设计 §12.6/§12.7）。**两件**：① 重写旧验收 `test/测试/t9-block1-bootstrap.test.ts`（其前提「固定 7 角色骨架」已被客户「不预建，全由 su 对话决定」否定）；② 验收**从用户入口出发**。基线：全量 **572 总 / 570 通过 / 2 失败** + **1 处 typecheck 错**（三处全在本文件旧版）。边界：只写 `test/测试/` 与 `角色卡/测试/`。**只读**：`src/service/gate/resolve-write.ts`、`src/common/门禁引擎/governance-seed.ts`、`app/desktop/{project,session,interface}.ts`。

### 0) 旧版为何是红的（三处，全在本文件）

- **typecheck 错**（`:90`）：用 **T32 已退役的 `bootstrap` 选项**（`openGovernanceSession` 不再接收）——`TS2353`。
- **2 失败**：断言「固定 7 角色骨架落盘」（`角色卡/{项目管理,编排,…}/…`）——**客户已定「不预建」**，该前提被推翻，`openGovernanceSession` 现按 §12.4 不再预建骨架。

### 1) 改写形态（不是修修补补）

`t9-block1-bootstrap.test.ts` **整体重写**为 §12.6 的**新形态**：**su 不预建**——它**直接写出**角色；`openGovernanceSession` **不预先创建** `角色卡/`/`docs/`/`.ans/`；角色是 su（经创世边界）**写出来的**。共 **10 例**（旧版 6 例），系统临时目录、用完清理、**不写仓库**。

### 2) 从**用户入口**出发：沿哪条链验（本次方法要求）

T9 结论「未发现自证与实际不符」是实话，但**验错了对象**——验的是编排的 `openGovernanceSession`，**没验桌面那条链**。故本文件沿**桌面实际会走的那条链**：

**导入空文件夹（IPC `createDesktopInterface`）→ `listProject`（门禁引擎）→ 构造 `ProjectConfig`（`buildProjectConfig`）→ `openSession` → 真实 `openRoleSession` 构造 gate → 开门禁判定**。

gate 从**注入的适配器工厂缝**（`createDemoAdapterFn`）捕获——**不是**直接调 `resolveWrite` 了事；`ProjectConfig` 也从真实 `openRoleSession` 入参捕获（证明「未 bootstrap 带 `genesisBootstrap`、有角色不带」确由桌面链产出）。**不跳过中间层**。

### 3) 各确定性项的**实际**结果

- **空文件夹**：IPC `listProject` **不抛错**，返回内置 `su` + `hasRoles:false` + `primaryRoleId:"su"`（roles 仅 1 条、builtIn、不标只读）；根不存在/是文件**仍抛错**（真错误不伪装）。
- **创世边界**：su 的 gate **放行** `角色卡/<任意新角色>/{role-card.md,boundary.yaml,memo.md}`、`角色卡/governance-boundary.yaml`、`docs/…`、`.ans/project.json`；**拒绝** `src/**`、`README.md`、`package.json`、`app/…` 及**项目根外的绝对路径**。
- **切回**：项目一有角色（`hasRoles:true`）→ 桌面**不再设** `genesisBootstrap`（键不出现）→ su 回内置未接受边界 →**拒一切写**（含 `docs/`）。角色 R 是**经创世 gate 由 su 真实写出**的（`buildGovernedTools` 落盘），故「有角色」确系 su 所为。
- **自终止**：写出只含 `docs/` 的项目边界并 pin 后，`resolveBoundarySection` 的**项目覆盖**先命中（条目只剩 1 条）→ 原本可写的 `角色卡/Y/…` **写不了**，`docs/` 仍可写（对照）——**genesisBootstrap 刻意残留亦无效**（结构性自终止成立）。
- **旧形态退场**：空项目 + 空脚本 → `openGovernanceSession` 后 `角色卡/`、`docs/`、`.ans/` **均不存在**（引擎不预建）；且创世下 `handle.scope === undefined`（§12.2，不造 `writeSet`）。
- **新形态**：su 直接写出的角色**真实落盘、字节相等**；越界写 `src/evil.ts` **写前被拒且零副作用**（不建父目录）；`listProject` 枚举到新角色。

### 4) finalize —— **pin 由我独立重算比对** + 载入器验真

- **正例**：创世项目 → `openGovernanceSession` → su 写出角色三件套 + 项目治理边界 → `handle.finalize()` **真的写出** `.ans/project.json` 与 `docs/bootstrap-manifest.md`；pin 覆盖「项目治理边界 + 各角色 `boundary.yaml`」。
  - **独立重算**：**我自己**用 `node:crypto` 对原始字节求 SHA-256 逐条比对——**全部一致**（未采信实现方断言）。
  - **载入器验真**：该 `.ans` 经**装配的载入器** `loadEffectiveConfig` 载入 → `source.kind==="ans"`、`acceptance.accepted===true`、`pinPaths>=2`；`resolveRole("新角色")` 边界 **accepted、无 parseError**（pin 校验通过）。
  - 留痕列出 `角色卡/新角色/{role-card,boundary,memo}.md`、`角色卡/governance-boundary.yaml`、`.ans/project.json`。
- **负例（不绕门）**：**把授权拿掉**（项目治理边界文档在、但 `acceptance` 未接受）→ `finalize()` **被门禁拒**（`/门禁拒绝|未被接受|F6/`）且 **零副作用**（`.ans/` 未创建、`wrote` 为空）——证明 finalize 的写同样经 `resolveWrite`，**不是凭代码身份绕门**。

### 5) 有无发现实现方**自证与实际不符**

**没有发现谎报。** 被验主张（创世有界、切回、结构性自终止、finalize 过门且 pin 可验）均经独立构造复现通过。**但发现一处端到端缺口**（如实登记，非谎报）：**桌面路径未接 `finalize`**——`app/desktop/` 无任何 `finalize` 调用，故从**用户入口**走完「su 建角色」后，`.ans/project.json`（pin）与 `docs/bootstrap-manifest.md` **不会自动写出**（编排文档明说「多轮消费者（桌面 su 聊天）应自行调 `handle.finalize()`」，桌面未调）。**已如实报告**，接线与否交协调方/客户定（T33 的「取舍交客户」亦未定）。

### 6) 「客户须手工验」的步骤（真实模型建角色那条，本机不可自动验收）

「su **真的据对话**决定并建出角色」需**真实模型轮次**（凭据 + 已配置 provider + `ANS_PI_CONTEXT_WINDOW` 必填），按项目操作约束**须客户本人运行**——**不列入自动验收**。建议：（撰写于 `t9-block1-bootstrap.test.ts` 顶部 `CLIENT_MANUAL_STEPS` 常量）

> ① 桌面导入**空文件夹**（无 `角色卡/`、无 `.ans/`）→ 左树显示 su + 「尚未 bootstrap」提示；② `.env` 配 `ANS_PI_BASE_URL/MODEL/PROVIDER/CONTEXT_WINDOW` + `ANTHROPIC_AUTH_TOKEN`；③ 选 pi，点 su，**用自然语言**说明要建哪些角色；④ 断言 su 真的 `write_file` 写出 `角色卡/<角色>/{role-card.md,boundary.yaml,memo.md}`、且越界写（`src/**`）写前被拒；⑤ 断言写完后左树随 su 建角色**长出**对应角色。

### 7) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **98 pass / 0 fail**（改前 94）。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，三层路径）→ **576 pass / 0 fail**（改前 576 总/2 失败；本文件 6→10 例，净 +4）。
- `npm run typecheck` → **零错误**（本文件旧版 1 处 `bootstrap` 选项错已消除）。

### 8) 范围/限制（如实照录）

- 桌面 **shell 闸 V1 不 arm**、**pi 路径会真写入**（demo 只判不写）、**`ans init` 已废**——既有范围，非本次目标。
- 本文件**未**触发真实模型；`(b)` pm 审读真实模型行为不属本块。

## 2026-10-11 — T29 独立验收：Pi 配置往返与写入纪律

**任务**：T29（独立验收「桌面 Pi 配置界面 → 保存 `.env`」的**配置往返**与**写入纪律**）。**独立性**是要害——不重跑实现方的自证，由本角色**自写**用例验证**主张**。基线：全量 **533 通过 / 0 失败**、`npm run typecheck` **零错误**。边界：只写 `test/测试/` 与 `角色卡/测试/`。方案：设计 §11（`2026-10-11_design_v1-full-implementation.md`）。**只读**：`src/common/shared/env-file.ts`、`app/desktop/pi-config.ts`、`src/common/pi-adapter/provider-config.ts`。

**隔离红线**：全程只碰系统临时目录（`os.tmpdir()` 下 `mkdtemp`），**绝不读写仓库根真实 `.env`**；用完即清理，仓库不留文件。

### 1) 新增文件（2 个，共 21 例，自搭临时 `.env`、不复用他角色夹具）

- **`test/测试/t29-pi-config-roundtrip.test.ts`（8 例）** 配置往返 + 单一来源/签名纪律：
  - 自写一组 Pi 配置（含哨兵 token）到临时 `.env` → `loadPiEnv` 载入 → 进程 env 拿到**正确值（含 token）**；`LoadEnvResult` 只含键名、**不含值**（`JSON.stringify` 不含 token）。
  - **配置到达适配器**：载入后 `resolvePiProviderConfig({}, env)` 成功构造——baseUrl/modelId/**contextWindow（"131072"→number）**/providerId 正确、`apiKeyEnvVar==="ANTHROPIC_AUTH_TOKEN"`；构造结果不含 token 值。
  - **保存后重载**：改 modelId+contextWindow → `savePiConfig` → 同一 env **立即**生效 + **另开** env 从盘重载生效（确认真落盘）+ 适配器构造取到新值。
  - **单一来源**：**自己遍历** `src/`+`app/` 的 `.ts`，确认 `parseEnvFile`/`mergeEnvText`/`atomicWriteText`/`readEnvFile`/`saveEnvFile`/`loadEnvFileInto`**只在** `env-file.ts` 定义；桌面 `pi-config.ts`/`main.ts` 只从共享模块导入。
  - **签名未扩**：`resolvePiProviderConfig.length===2`、`createPiAdapterFactory.length===2`（方案 §11.3 裁定不扩签名）。
- **`test/测试/t29-write-discipline.test.ts`（13 例）** 写入纪律逐条独立：
  - ①**只改相关键**——**自己做字节级比对**（除目标行外挖掉后两份文件 `===`；行数不变；恰 1 行变化且为目标键行，其值等于**我独立算出**的期望）；注释/空行/未知键/无关键原样在。
  - ②**键不存在→追加**（前文逐字节不变、追加在末尾、沿用原行尾符；CRLF 原文追加 CRLF）、**已存在→就地替换**（键名/`=`/两侧空白/引号风格/内联注释均保留）。
  - ③**特殊字符**（`=`、空格、`"`、`'`、`#`、反斜杠、首尾空白、tab、URL 查询串）写后读回**逐字一致**（经 `parse` 与经 `loadEnvFileInto` 两路）。
  - ④**原子性**——写入后目录内**只有 `.env`**（无 temp 残留）、内容为完整合并结果（非半写）；`atomicWriteText` 直调覆盖原子。
  - ⑤**失败路径**——目标目录不存在 → `savePiConfig` `{ok:false,error}` 且**不建目录**、`saveEnvFile` 抛错、`readEnvFile` 抛错（对照 `loadEnvFileInto` 对 ENOENT 不抛=「无 `.env`」）；**目标是目录** → 抛错且**目录未被替换/损坏**（marker 原样）。
  - ⑥**不回显**——哨兵 token **只进 env**；成功/失败**回报**、**错误文本**、**面板视图**（机密键 value 恒 `""`、只给 `isSet`）一律不含其值；非面板键被忽略、**不越界落盘**。

### 2) 独立复核结论（我自做，非照抄实现方断言）

- **配置往返**：载入值（含 token）正确、**能成功构造 `PiProviderConfig`**、保存后重载新值生效——三者独立跑通。
- **写入纪律**：逐条通过；**字节级比对由本文件自做**（含"挖掉目标行后整体 `===`"与"独立算期望行"两法），实现方对"只改相关键/保留其余"的主张**与实际相符**。
- **有无发现实现方自证与实际不符**：**没有**。
- **额外对抗性探针**（一次性脚本，未入库）：未命中行含**行尾空白/制表符/缩进**时仍逐字节保留；值内 tab 经双引号 quote 后读回逐字一致——均符合主张。

### 3) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **94 pass / 0 fail**。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，三层路径）→ **554 pass / 0 fail**（基线 533 + 本次 21）。
- `npm run typecheck` → **零错误**。

### 4) 「验证不到的东西」（如实标注）

- **真实模型轮次本机不可自动验收**（凭据命令须客户本人运行）：故"保存配置后**真实 pi 会话能跑通**"**只验证到「配置能正确到达适配器构造」**（`resolvePiProviderConfig` 成功产出 `PiProviderConfig`），**未验证真实模型/网络调用**。
- 既有范围边界（非本次目标，如实照录）：桌面 **shell 闸 V1 不 arm**、**pi 路径会真写入**（demo 路径不写=S2 二期）、**`ans init` 已废**（作未知命令非 0）。
- 原子写的 **fsync / rename 原子性本身**无法在单进程内直接观测半写；以"无 temp 残留 + 内容完整"为可观测代理。

## 2026-10-11 — T9 独立跨角色总验收

**任务**：T9（独立跨角色总验收）。**独立性**是要害——不重跑实现方的自证，由本角色**自写**跨角色端到端验收，验证**主张**（越界写在发生之前被拒）而非仅验证实现。基线：全量 460 通过 / 0 失败、typecheck 零错误。边界：只写 `test/测试/` 与 `角色卡/测试/`。

### 1) 新增文件（3 个，共 32 例，自搭场景、不复用他角色夹具）

- **`test/测试/t9-block1-bootstrap.test.ts`（6 例）** 块1 bootstrap/创建权：
  - 空目录 → `listProject` **不抛错**，返回内置 `su` + `hasRoles:false` + `primaryRoleId:"su"`；项目根不存在/是文件 → **仍抛错**（真错误，不伪装成空项目）。
  - 有界创世：经**唯一治理会话引擎** `openGovernanceSession`（`bootstrap` 选项，替身 adapter 无真实模型）在全新项目写出治理产物——7 角色 `role-card.md`/`boundary.yaml`/`memo.md`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md`、`.ans/project.json`；逐条校验 pin 与实际 SHA-256 一致、治理边界本身被 pin 覆盖；`listProject` 枚举到 7 项目角色 + su。
  - 与 su 对话建角色：用**共享载入器** `loadEffectiveConfig` 从 `.ans` 载入生效配置（非手拼），再经同一引擎新增 `角色卡/新角色/`（替身写 role-card/boundary/memo）；写集内文件**真实落盘且字节相等**，越界写 `src/evil.ts` **写前被拒且零副作用**；`listProject` 枚举到新角色。
  - 负例（边界）：创世授权下写 `src/`/`README.md`/`任意文件.txt`/`package.json`/`app/…` → **一律写前被拒**。
  - 负例（自终止）：先证**纯创世**下 `角色卡/Y/role-card.md` 可写；写出只含 `docs/` 的项目边界文档并 pin 后，**原本可写的 `角色卡/Y/…` 写不了了**（`genesisBootstrap` 刻意残留，证明自终止是**结构性**的）；对照 `docs/` 仍可写。
- **`test/测试/t9-block2-write-landing.test.ts`（10 例）** 块2 写入真正落盘：
  - 允许写 → 盘上**字节等于** content（含非 ASCII，UTF-8 原始字节）；目录条目覆盖子路径 → `mkdir -p` 出父目录；`edit_file` 命中 → 回写等于预期；未命中 → `ok:false` 且文件不变。
  - 拒绝写 → 文件不存在、父目录不建；对已存在但越界的文件 `edit_file` → **内容与 mtime 不变**（零副作用）。
  - 负例：gate 抛错 → **任何副作用之前** fail-closed，无文件/目录产生；junction **逃逸出写根** → 写层拒绝且**链接目标未被触碰**（gate 故意放行，证明写层纵深防御生效）。
  - 第二边界（§3.8）：gate 放行**写根之外（skill 根）**的写 → **写层仍拒**、无文件产生。
  - 同源：行为——gate 收到的 abs === 文件落盘路径；静态——`fs-write.ts` 与 `门禁引擎/paths.ts` 均引 `shared/path-primitives.ts`，且两处均不再自持 `normalizeLexical` 实现。
- **`test/测试/t9-block3-pin-shell.test.ts`（16 例）** 块3 pin/调度/V3：
  - pin：匹配→accepted 且 `src/a.ts` 可写；**篡改边界文件致 hash 失配 → 未接受 → 拒一切写**；`.ans` 存在但 `accepted:true` **无 pin** → 载入方置未接受（`downgradeReason`）→ 拒写；**无 `.ans`** → 回退内置（未接受）仍拒写（F6）。
  - 调度/审计（boundary 级）：pm 边界覆盖 `docs/scheduling/`；审计 `docs/audit/shell-gate.jsonl` 声明 `shell-gate` 才放行，**缺条件 → 写前拒**。
  - V3 三层链：`(c)` 白名单放行 **且 (b)/(a) 未被调用**；`(c)` 硬拒 → 拒绝、终结，**且 (b)/(a) 未被调用**（(b)/(a) 桩**本会放行**，证明硬地板不可翻案）；`(c)` review → `(b)` 放行/拒绝即终结；`(b)` 拿不准/无会话/超时/JSON 非法 → 升 `(a)`；`(a)` 超时/不可用 → 拒绝；(c)-only 未接 (b)/(a) → review 默认拒绝。
  - fail-closed 退路：规则集加载失败 → **整条拒绝**（含白名单命令 `ls`，证明绝不「没规则就放行」）；`classifyShell` 版本未知 → deny；**未 arm → `run_shell` 根本不注册**；`run_shell` 只在恰好 `allow:true` 时执行；`shellKillSwitch` 未 arm block。

### 2) 独立验收结论

- **未发现实现方自证与实际不符之处。** 三块关键主张（越界写写前被拒、创世有界且自终止、硬地板不可翻案、未 arm 不注册、fail-closed 只往更严退）均经独立构造复现通过。
- 一处**待记的既文档化行为**（非不符）：`listProject` 只枚举**同时具备 `role-card.md` 与 `boundary.yaml`** 的角色目录（缺一则记 warning 跳过）。故「与 su 对话建角色」须写全套骨架方可被左树枚举——建角色用例据此写 role-card/boundary/memo 三件。
- `test/测试/` 与全量套件均**全绿、零跳过**；`npm run typecheck` 零错误。

### 3) 如实记录的「验证不到的东西」

- **真实模型轮次本机不可自动验收**（凭据命令须客户本人运行）：`(b)` pm 审读的**真实效果**、真实模型驱动的 su 对话，**只验证了接线形状与失败时的 fail-closed，未验证真实模型行为**（本文件对 (b) 用桩）。
- **桌面 shell 闸 V1 不 arm**（客户已定）：桌面的操作者通道**建了但未被消费**——是**范围**，非缺陷。
- **桌面 pi 路径会真写入**（客户已定，受门禁约束）；demo 路径只判不写。
- **`ans init` 已废除**，建项目只有 su 对话一条路。
- **本机限制**：Windows 无开发者模式/管理员权限 → 无法创建**文件符号链接**（`symlinkSync` 直接 EPERM），故设计 §5.1「目标本身是符号链接 → 拒绝」子用例**本机不可自动验收**；其安全属性（绝不写链接之外）已由可用的 **junction 逃逸**用例覆盖。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **73 pass / 0 fail / 0 skip**（改前 41 + 本次 32）。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，三层路径）→ **492 pass / 0 fail / 0 skip**（基线 460 + 本次 32）。
- `npm run typecheck` → **零错误**。
- 桌面 e2e：`ANS_E2E_OUTDIR=<系统临时目录> node_modules/.bin/electron test/桌面应用/e2e/main.mjs` → 退出 0，`report.txt` 关键检查点：`PRIMARY_ROLE_ID=su`、`DEFAULT_SELECTED_ROLE=su`、`SU_IS_FIRST=true`、`NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME=true`、`BOOTSTRAP_NOTICE_SHOWN=true`（空项目、非错误样式）、`REFRESH_*=true`、`HANDBACK_CARD_PRESENT=true`/`HANDBACK_NOT_MIRROR=true`/`HANDBACK_STATUS_OK=true`、`MIRROR_CARD_PRESENT=true`/`MIRROR_HAS_FROM=true`/`MIRROR_STATUS_BLOCKED=true`、`OLD_GENERAL_CLAIM_PRESENT=false`、`E2E_DONE=1`。**未开任何真实 pi 会话**（e2e 全程 demo）；跑完 Electron 自行退出（无残留进程）、临时目录已清理，仓库无残留文件。

## 2026-10-11 — 修正 `test/测试/f7-symlink.test.ts` 的 2 处 typecheck 错误（字面量漏标注）

**来源**：仓库装入 `typescript`，`npm run typecheck`（`tsc --noEmit`）成为真门；全仓 11 处错误中 2 处落在本角色文件 `test/测试/f7-symlink.test.ts` 的 58 / 64 行。

### 1) 错误是什么

两条错误**同源**，均为 `TS2345`：传给 `resolveWrite(...)`（第 2 形参类型 `BoundarySection1`，见 `src/service/gate/resolve-write.ts`）的实参类型不匹配——

```
Argument of type '{ entries: { root: string; path: string; kind: string; purpose: string; }[]; ... }'
is not assignable to parameter of type 'BoundarySection1'.
  Types of property 'root' are incompatible. Type 'string' is not assignable to type 'Root'.
```

根因：测试里 `const boundary = { entries: [{ root: "project", path: "src", kind: "directory", purpose: "t" }], … }` **未标注类型**，对象字面量的属性被**拓宽**为 `string`；而 `Root = "skill" | "project"`、`kind: EntryKind`。`string` 不能赋给 `Root` / `EntryKind`。

### 2) 判定：是生产代码的类型问题吗

**不是。** `src/model/boundary.ts` 的 `Root` / `BoundaryEntry` / `BoundarySection1` 定义本身正确、自洽；`resolveWrite` 的形参收窄也是对的（它就该收窄到 `BoundarySection1`）。错误**只在测试一侧**：构造夹具时漏了类型标注，让字面量被拓宽。故按真实语义**在测试里补标注**，不越界改 `src/`。

### 3) 改法（只看本角色文件）

- 新增 `import type { BoundarySection1 } from "../../src/model/boundary.ts";`（只读引用类型，符合本角色边界）。
- `const boundary = {` → `const boundary: BoundarySection1 = {`。标注后 `root` / `kind` 按字面量上下文归一到 `Root` / `EntryKind`，两条错误一并消失。
- 与仓库既有约定一致（同款：`test/门禁引擎/built-in-section-equivalence.test.ts`、`test/编排/shell-gate.test.ts`、`test/桌面应用/interface.test.ts` 均以 `BoundarySection1` 标注边界字面量）。
- **未使用 `as any` / `as unknown as` / `@ts-ignore` / `@ts-expect-error` 等压制手段**；未改任何断言与用例语义。

### 4) 验证（本角色独立执行）

- `npm run typecheck`：过滤 `f7-symlink` **无输出**（本角色 2 处错误归零）；全仓其余 9 处错误均属他角色/生产文件，**未动**。
- `node --test test/测试/*.test.ts` → **41 pass / 0 fail**。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob）→ **445 pass / 0 fail / 0 skip**。


## 2026-10-11 — 移除因 `ans init` 命令废除而失效的断言

**来源**：客户废除 `ans init` 命令（改为「导入空文件夹 → 与内置治理角色 su 对话 → su 建角色」）。编排（T16）删除 `src/interface/cli/init.ts` 整个文件，装配把 `cli-parse` 的 init 分支移除——`init` 现归 **`unknown`** 命令（`src/common/装配/cli-parse.ts`，`parseInvocation` 无 init 分支 → 落到末尾 `{kind:"unknown", message:"未知命令：init"}`；`src/index.ts` 的 `case "unknown"` 返回 2）。编排为只读方，改的是它自己边界内的文件；本角色的 `test/测试/real-entry.test.ts` 在测试边界内，故由本角色收口。

### 1) 失效断言（改前）

`test/测试/real-entry.test.ts` 有两条 init 用例：

- 「真实入口:ans init <临时目录> 以 0 结束并生成骨架」——断言 `status === 0` 且生成 `.ans/project.json` / `docs/bootstrap-manifest.md`。**这是全量套件中的那 1 个失败**（改前 445 pass / 1 fail）。
- 「真实入口:ans init 无目录参数以 2 结束(用法错误)」——断言 `===2`。**恰好仍通过**（未知命令也是 2），但**名称与理由已不成立**：不再是「缺目录参数」，而是「命令不存在」。

### 2) 独立实测（不照抄编排结论）

- `node bin/ans.js init`（无参）→ **退出码 2**，stderr：`错误：未知命令：init` + 帮助文本（`USAGE`）。
- `node bin/ans.js init <临时目录>` → **退出码 2**，stderr 同上 `错误：未知命令：init`；临时目录**保持为空**（`.ans/`、`docs/` 均未生成）。

实测与编排结论**完全一致**（0 期望已失效、骨架不再生成；无参 2 亦确认）。编排提到的两点均复现。

### 3) 改后断言（`test/测试/real-entry.test.ts`）

- **删除**正例「ans init <临时目录> 以 0 结束并生成骨架」：`ans init` 已不存在，为一条不存在的命令保留断言只会让人以为它还在（采纳编排倾向）。
- 把「无目录参数以 2」**改名为**「真实入口:ans init 已废除(作为未知命令以非 0 结束,且不再生成骨架)」，并改为：
  - 无参：断言 `status !== 0` **且** stderr 含 `/未知命令/`（钉住**真实原因**：命令不存在 → 归 unknown）。
  - 带目录：断言 `status !== 0` 且**不生成骨架**（`.ans/project.json` 与 `docs/` 均不存在）——保留正例被删后仍值得回归的那一点（防骨架生成器被误复活）。
- **不把「2」当 init 的契约**：只断「非 0」+ 原因，不写死具体码。2 只是 `index.ts` 的 `case "unknown"` 这条既有分支的返回值，已由上方 `FAIL_CASES` 的「未知命令」用例覆盖。
- 两条用例**净合一**：全量用例总数由 446（445 pass + 1 fail）降为 445。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **41 pass / 0 fail**。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob，覆盖三层路径）→ **445 pass / 0 fail**（改前 445 pass / 1 fail；那 1 处即本条，已消除）。
- 扫全 `test/`：**本角色文件外**仍有几处提及 `ans init`，但**均非断言其旧行为、无需改动**：`test/装配/cli-parse.test.ts`（断言 `parseInvocation(["init"]).kind === "unknown"`，即**新**正确行为）、`test/编排/bootstrap.test.ts`（断言 `init.ts` 不存在、命令面已删，即**新**正确行为）、`test/编排/govern.test.ts` 与 `test/门禁引擎/cold-start-genesis.test.ts`（仅注释）。**未改任何非本角色文件**（回报编排）。

## 2026-10-11 — 修正因 `ans govern` 契约变更而失效的退出码断言，并据契约判定放宽「非 0」

**来源**：编排角色把 `ans govern` 从占位改为**真治理会话**（`src/interface/cli/govern.ts` + `src/pipeline/orchestration/govern-session.ts`）——现在接收装配注入的 `ConfigInjection`、走真实 Pi 适配器（缺省 `createPiAdapterFactory`，无 demo 回退）。编排未改本角色文件（`test/测试/real-entry.test.ts` 在本角色边界内），把结论交回本角色收口。

### 1) 失效断言（改前）

`test/测试/real-entry.test.ts` 的失败路径用例 `{name:"govern 无配置通道", argv:["govern"], code:2}` 断言 `===2`。这是占位时代「govern 无配置通道 → 用法错误 2」的断言；真治理会话后 govern **有**配置通道，失败原因已改为「真实 Pi 适配器缺 provider 配置」。

### 2) 独立实测（不照抄编排结论）

- `node bin/ans.js govern`（无参）→ 退出码 **1**（非 2）。stderr：
  `ans govern 会话失败：缺少 base URL：请通过 opts.baseUrl 或环境变量 ANS_PI_BASE_URL 显式提供。为避免把凭据发往未知端点，这里不会回落到任何默认 base URL。`
  （另有两行 stdout 的会话信息，无凭据值打印。）
- 实测与编排结论一致。**逐条复核了原用例中其余 7 条**：`未知角色 / 缺角色 id / 缺 --task / --task 缺值 / 多余参数 / 未知命令 / 未知 role 子命令` 无参实测**均为 2**（用法错误）。

### 3) 契约判定（这是本改动的核心判断）

退出码约定见 `src/common/编排/exit-codes.ts`：0=成功；2=用法/参数错误；1=运行时失败。判断「具体码是否属契约」的准绳 = **它是否只由 argv 决定（输入驱动、确定）**：

- **具体码 2 属稳定契约**：仅由 argv 决定，同一非法 argv 在任何环境都得 2（未知角色/未知参数/多余参数/缺少必需参数）。→ **保留逐条 `===2`**，不放宽。
- **具体码 1 不属稳定契约（至少此处）**：`ans govern` 无参的失败**依赖运行时/环境**——取决于真实 Pi 适配器所需 provider 配置（`ANS_PI_BASE_URL` 等）是否存在；同一 argv 在不同环境可能得到不同码。断言其具体码即**过度约束**（每次环境/上游行为一变就连带失败，这正是本次与上次 `init` 同类失效的根因）。→ **放宽为只断言「非 0」**。
- 两类都保留「**必须非 0**」：失败路径绝不静默成功。

据此**只放宽 govern 这一条**，其余 7 条用法错误仍断言具体码 2。这是**有原则的放宽**，不是为变绿而无原则放宽。

### 4) 改后断言（`test/测试/real-entry.test.ts`）

- 失败路径数组类型由 `code: number` 改为 `code?: number`；循环内**仅当给出 `code` 时才断言 `===code`**，恒断言 `!==0`。
- 用例改名：`govern 无配置通道` → **`govern 缺真实 Pi 适配器 provider 配置（ANS_PI_BASE_URL 等未设）`**（如实反映真实原因），并去掉其 `code`（只断非 0）。
- 顶部加注释块，写明上述契约判定依据。

### 5) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **42 pass / 0 fail**。
- `node --test "test/**/*.test.ts"`（带引号走 Node glob）→ **357 pass / 0 fail**（改前 356 pass / 1 fail；本改动未增减用例数，仅改 1 条断言与名称）。
- 扫全 `test/`：无其他因 `govern`/`init` 行为变更而失效的断言。`test/编排/govern.test.ts` 对 `governCommand(argv, undefined)`→`EXIT_USAGE` 的断言是**注入缺失的确定性用法错误**（非环境依赖），仍成立；`test/装配/entry.test.ts` 的 pi 无凭据用例本就只断「非 0」，模式正确。

## 2026-10-11 — 修正因 `ans init` 契约变更而失效的退出码断言

**来源**：编排角色把 `ans init` 从占位命令改为**真实骨架生成器**（`src/interface/cli/init.ts` + `src/common/编排/bootstrap.ts`）。新行为：`ans init <目标目录> [--force]`；**无目录参数属用法错误**（`parseInitArgs` → `errors.length > 0` → `EXIT_USAGE`）。编排未改本角色文件（`test/测试/real-entry.test.ts` 在本角色边界内），把结论交回本角色收口。

### 1) 失效断言（改前）

`test/测试/real-entry.test.ts` 原用例「真实入口:help/doctor/init 以 0 结束」断言 `runCli(["init"]).status === 0`——这是占位命令时代的断言，与新契约矛盾（全量套件中的那 1 个失败）。

### 2) 独立实测（不照抄编排结论）

- `node bin/ans.js init`（无参）→ **退出码 2**，stderr：`错误：缺少目标目录` + 用法行。
- `node bin/ans.js init <临时空目录>` → **退出码 0**，stdout 打印 `# Bootstrap 创建清单（创世例外，设计 §2.4）`，并生成 `.ans/`、`docs/`、`角色卡/`（含 `.ans/project.json` 与 `docs/bootstrap-manifest.md`）；临时目录已清理，仓库无残留。

实测与编排结论一致，采纳其建议。

### 3) 改后断言（`test/测试/real-entry.test.ts`）

- 拆分原用例：「真实入口:help/doctor 以 0 结束」（仅 `--help`/`doctor`）。
- 新增「真实入口:ans init 无目录参数以 2 结束（用法错误）」：断言 `status !== 0` 且 `status === 2`。
- 新增正例「真实入口:ans init <临时目录> 以 0 结束并生成骨架」：`mkdtempSync(join(tmpdir(), "ans-init-"))` 建临时目录 → 断言 `status === 0`、stdout 含创建清单、`.ans/project.json` 与 `docs/bootstrap-manifest.md` 存在；`try/finally` + `rmSync(dir, {recursive:true, force:true})` 保证清理（沿用 `test/门禁引擎/*` 既有临时目录模式）。

### 4) 验证（本角色独立执行）

- `node --test test/测试/*.test.ts` → **42 pass / 0 fail**。
- `node --test test/*/*.test.ts`（全量）→ **328 pass / 0 fail**（改前 325 pass / 1 fail；本改动拆 1 用例为 3，净 +2）。
- 扫全 `test/`：无其他因 `init` 行为变更而失效的退出码断言。`test/装配/cli-parse.test.ts:47` 断言 `parseInvocation(["init"])` 的**解析形状**（`{ kind:"init", argv:[] }`），非退出码，不受影响，未改。


- 2026-10-15：V2 严格落地独立验证 verified：真实原生双宽、导入/键盘/缺配/选择/停止/来源阅读、p-limit 正式派发和回交通过；最终 Node 1384 pass / 0 fail / 1 Windows-only skip。5 个生产文件变化由各属主维护；测试仅补 own fake IPC，原断言不放松。详见 [独立验证](docs/change/2026-10-15_change_visual-v2-independent-verification.md) 与 [最终证据](docs/change/2026-10-15-visual-v2-implementation-evidence/final-verification.json)，首红与修复历史保留，未 commit/push。

- 2026-10-15：v1.0.0三原生运行包独立验收与公开发布verified。CI3每平台1401项，mac两各1400pass0fail1skip、Windows1399pass0fail2skip；实际ZIP启动/依赖、同source+overlay树、GitHub服务器digest和匿名下载核对通过。原tag、真实.env、acceptedV2不变。首红及跨平台/时钟夹具订正全部保留，详见[发布独立验证](docs/change/2026-10-15_change_v1-release-verification.md)。
