# Retired legacy-renderer test check names (5B)

> 逐文件列出退役 test 声明；不作为通过，替代覆盖见报告 §二。
- 文件：22；test 声明：95。

## card-probe.mjs.retired

- (no `test("...")` declarations; probe/script)

## contract-freeze.test.ts.retired

- `G-2 契约①：三前缀逐字节＝ASCII `[`＋`系统`＋U+00B7 中点＋子类＋ASCII `]``
- `G-2 契约①：四渲染器输出恒以「前缀＋一个 ASCII 空格」起始（U1 归类判据依赖）`
- `G-2 契约①：渲染侧 tool-rows.js 归类面——三前缀＋扩充子类均为 system；形态变体不误归类`
- `G-2 契约②：字段名 roleStatus/sessionTail/proposeRecovery 五面同名的源码精确钉`
- `G-2 契约③：openRoleSession——su 拿三能力原引用；项目角色即便误给也零注入；未给零注入`
- `G-2 契约④：桌面注入闭包经 真 openRoleSession＋真 createRuntimeAdapter 端到端连通（handler 直达 manager 数据面）`

## d-card-data.test.ts.retired

- `D1 档位解析：行首前缀优先；deny 不被后缀 /risky/ 抢占；项目角色恒 null`
- `D2 卡片数据：tier/policy、命令原文/cwd/reasonRaw；三档 plain reason 含必备披露`
- `D3 UI 纯映射：SU 标题/项目标题；三档标签；未知档位不编造`
- `D4 渲染源码：SU 警告/默认拒绝焦点/标题档位原因接线；不得把审批呈现成已获准`
- `D5 前缀单一来源：Pipeline 公共出口与编排私有实现逐字相同`
- `D6 内置角色卡命令纪律：免审批/逐条批准/不走 pm/不得说已获准/写边界披露齐备`

## d-mirror-advance.test.ts.retired

- `镜像通道：同一请求 id 的镜像面；两侧共享一份 pending；第一次作答结算、第二次 expired；onNextStep 恰一次`
- `镜像排队：第二张不呈现可操作卡、只进聚合；第一张结算后第二张呈现并带镜像面`
- `write 卡镜像：同一请求 id 带镜像面、只答一次（第二次 expired）、下一步回调不重复`
- `桌面镜像面：proposal/appointment/acceptance/write 带 mirrorRoleId=liaison；无 cardKind/single 不镜像`
- `渲染源码钉：同一请求登记一次、surfaces 列表、两面物化/冻结、徽标与来源标签、排队聚合行`
- `ui-labels：镜像徽标/来源标签/排队聚合文案逐字；单模型不出现这些行由渲染侧模型判据保证`
- `下一步推导：accept→Convener（两段式）、accept-quick→Convener、任命→Convener、其余无下一步；镜像范围判据`
- `自动推进账本：accept→Nominator、accept-quick/任命→Convener；dispatch.accepted{app, customer-decision} 逐次一条、不写客户决定`

## d-scope-audit.test.ts.retired

- `D1 权限边界：本轮每个改动文件都落在其属主 boundary.yaml 的 Section 1 内`
- `D2 权限边界：本轮改动未落在测试角色自己的写入面之外（test/测试/ 目录条目）`
- `D3 文档产物：测试角色报告/证据路径在 test/测试/ 与 角色卡/测试/docs/ 白名单内`

## e-contract-wiring.test.ts.retired

- `E1 IPC 契约：main 注册两个通道；preload 暴露同名方法且 establish 固定 confirm:true`
- `E2 渲染侧契约：只经 window.desktop 方法消费；不使用 ipcRenderer；状态字段原样落 state`
- `E3 Interface 契约：ListProjectResult 带 governanceRecord；两方法在 DesktopInterface 上`
- `E4 动作只由确认按钮触发：establish 调用点唯一（preview/建立均无自动/定时调用）`

## e-ui.test.ts.retired

- `UI：五角色副标题——主理 Lead 客户沟通 / 提案 Draft / 组队 Crew / 统筹 Steward / 验收 Proof，且都写明「不拥有最终批准权」`
- `UI：五角色专属空态逐字；未知 function ⇒ null`
- `UI：状态行——治理模型（三权 · 五角色/旧模型）· 当前流程 · 四态；接口未给模型不猜`
- `UI：迁移按钮——桥齐备启用「查看差异 / 升级」；未接线禁用「升级入口待本版后续」`
- `UI：迁移预览视图——模型/写路径/modelField/manifestLine/pinChanges/保留文件/摘要前 8 位；无摘要不发行`
- `UI：迁移成功/失败视图——write 阶段失败绝不说「已升级/未写入」；already-trio/no-record 不提供重试`
- `UI：左树三组顺序＝主入口 → 治理职能（内置）→ 其他角色；治理行由 governanceFunction 派生（不硬编码 id）`
- `UI：迁移入口——按桥能力探测、按钮 data 属性、点击只开预览、确认按钮才调 migrate（传 snapshotDigest）`
- `假 IPC：listProject 透传 governanceModel / role.governanceFunction / primaryRoleId（原样，不猜）`
- `假 IPC：S1 预览/建立透传治理模型；非法模型 invalid-request；迁移预览/写入守卫与透传`

## f-ui.test.ts.retired

- `两个复选框：默认均未勾选；开启态文案各自标注「判断 agent」`
- `桥/驱动缺失：禁用且不显示假开启态；single 项目禁用 decision 并说明`
- `一次性警告：同一块按开启组列行；每组首次开启只弹一次，关闭后重置`
- `结果行：标题「judge 代批 · 代决策/代审批」、引擎/operator/理由，绝不冒充客户`
- `五角色显示名与需求确认卡：verifier=验收 Proof 可见；intent-confirm 用「需求确认 · 客户」徽标`
- `回落提示：代审批/代决策人话原因；row-failed 单列「判断已完成」`
- `preload 暴露 decision 四方法与结果行订阅；不暴露 Node 原语`
- `主进程接线：两开关各自复位；approval/decision 分组各读自己的开关；开关不写 localStorage`

## f8-classification-chain.test.ts.retired

- `F-8 链一致性（非零退出）：投影措辞=已执行完成（退出码 3）；classify=exited-nonzero；activityOf 中性标签`
- `F-8 链一致性（超时终止）：投影「超时终止」+ process.timedOut；classify=timed-out；activityOf 独立一类且仍显著`
- `F-8 链一致性（spawn 失败不被吞）：投影仍「执行失败」；classify=null（无结构化完成事实）；activityOf 仍标红`
- `F-8 旧行兼容（无结构化事实）：classify=null、activityOf 文本口径逐字保留（过渡期不误伤）`

## g-desktop.test.ts.retired

- `G1 文案四态（真实执行）：已思考 N 秒[下限 1]／推理内容／已思考（内容由平台省略）／带时长的省略态`
- `G2 可展开性（真实执行）：仅 complete 且正文非空才给开合；omitted/空正文/坏形不摆空展开器`
- `G3 choices⇒select 控件：首项留空＝未设态；值域即选项；域外现值如实附选项；自由文本字段逐字现状`
- `G4 折叠行接线：实时/回放同解（同一 appendReasoningFromDetail）；默认折叠；esc 纯文本；独立成行不进工具组；诊断如实一行`
- `G5 回放载体：投影形逐字透传（幂等）；实时/回放形状同解；坏件/旧数据回落既有路径（不携带新字段）`

## h-scope-audit.test.ts.retired

- `H1 探针纯本地：G-5 探针文件零真实网关端点（仅回环）＋监听面仅 loopback（动态枚举，不点名引用——兼容既有零引用钉）`
- `H2 env 键读取面单点：三键字面量仅出现在定义（reasoning.ts）与注册表/面板（settings/pi-config/model 注释）；适配器零直读`
- `H3 归一模块零网络/零文件面：reasoning.ts 无 URL 字面量、无 fetch/io import（纯函数模块）`
- `H4 渲染/桌面 G-5 面零网络调用：renderer/tool-rows/runtime-history/runtime-config 无 fetch/XHR/WebSocket`
- `H5 对照索引（机读锚点）：未设/关如实/计费文案三口径的取证位置（跨域测试文件在场性）`

## k-scope-audit.test.ts.retired

- `K1 stdio 限定全链：契约/读取器/两适配器装配面无 http/url/headers 字段；名特殊字符全链拒（读取器＋handler 行为）`
- `K2 安装链零二次卡：handler/工具/读取器三处源码切片零 request_confirmation；配置文件模板不含真实网关调用面`
- `K3 探针纯本地：V2/既有探针文件零真实网关端点（仅回环/.invalid）；不被 test 全局匹配（动态枚举，不点名引用）`
- `K4 诚实面三处在位（卡/schema/系统行）＋能力位仅 su（桌面/编排判据字面）`
- `K5 tools-only 无资源工具放行面：三名不在 Pi 前缀白名单命中面；Codex 桥名恒 mcp__<server>__（无资源工具特例）`
- `K6 桌面UI：`[系统·安装]` 归类复用零改动——MCP 行经 tool-rows.classifyInjectedMessage 归 system 类`

## render-md-ready-probe.mjs.retired

- (no `test("...")` declarations; probe/script)

## scope-audit-and-fold.test.ts.retired

- `审计①：三开关默认关且只在适配器源码（设置面板字段未做）；渲染/共享零引用`
- `审计②：首批工具集——Pi 注册表恰 web_search/web_fetch；Claude 只升 WebSearch（无 WebFetch）；Codex 不落 [tools] 键`
- `审计④：无自动剥离重试——全仓 src 零 agent_before_settle；Pi 扩展恰三 handler；无第二重试实现`
- `审计⑤：行样式与工具行/折叠口径合流——适配器走 projectToolEvent；渲染侧零搜索专属代码`
- `审计③：查询串不进诊断落盘——Pi 的 server_tool.* 诊断调用字段面全在白名单内；桌面渲染诊断不携行文`
- `审计边界：客户 live 探针脚本在位（由客户运行）；本套件对真实网关零请求`
- `callSummary：空表与单相位；两相位合并为一次调用；不同 callId 各占一行（turnId 参与身份）`
- `callSummary：工具分解首现序 + ×k 仅 k>1；名字取终态相位（终态缺失回退首相位、双缺失为「工具」）`
- `callSummary：denied/failed 拆分（同相位行 denied 优先、timed-out 并入 failed、exited-nonzero 中性不计数）`
- `渲染侧计时器纪律（settle 驱动）——唯一豁免为一次性开启警告自动收起；折叠挂点在批尾`
- `渲染侧默认态三判据（运行中不折叠的唯一入口）与手动优先守卫在位`
- `渲染侧折叠行文案模板（含未放行/失败/未记录三段与分解连接符）源码在位`
- `渲染侧：未放行相位并入同轮同 callId 组行（组不切断）；独立未放行行照旧直显`

## scope-audit.test.ts.retired

- `裁定 1（2026-10-18 修订）：完成态静默收束已移除——无 silenceMs/静默阈值；tick 30s 且仅 env 可调`
- `裁定 2：阈值表＝§3.2 批准默认（100%/10min/5/10min-10min-15min×3-30min/15min≤5）；#1 由 90% 改 100%（2026-10-17 到点检查）`
- `裁定 3：恢复动作集恰 {abort-turn, rebuild-session, redeliver}——编排/通道/schema 三面同一三值；增/减即拒绝`
- `裁定 4：恢复卡**不设限**——行为钉（挂起 1.2s 真实时间仍 pending、无计时器触发）+ 源码钉（mount 不带 cleanupAfterMs）`
- `裁定 6：工具名 role_status / session_tail / propose_recovery——schema 可描述、su 卡引用同名（无别名漂移）`
- `裁定 8（2026-10-18 修订）：完成态静默收束已移除——看护无 silent 谓词/完成态状态机；四信号仍在`
- `裁定 9：V1 无界面级告警——无 OS 通知/托盘/新角标；watchdog 不进入渲染侧代码；告警只进 su 会话与聊天流系统行`
- `非目标零实施：看护器不自动做恢复（无 abort/rebuild/drain 调用）；源码导入面不含任何判定/门禁件`
- `看护永不改判定：四类渲染输出的正文零授权语义（行为面——逐字检视）`
- `G：su 卡「看护职责」段——三要素齐备；位置（J-1 段之后、末段边界之前）；段级零命中授权词`
- `范围落点：W1-W5/R1/R2/O1/G/U1 逐项文件与关键符号在位（存在性审计）`

## u1-notice-restick-probe.mjs.retired

- (no `test("...")` declarations; probe/script)

## u1-renderer.test.ts.retired

- `U1：queueSourceLabel——system=「系统」（非角色）；既有三类不回归`
- `U1：recoveryActionView——恰三枚冻结枚举映射；未知动作 ⇒ null（只呈现原始 token，不编语义）`
- `U1 恢复卡源码钉：恰 allow:true 才作为执行请求回传；取消/Esc/关闭均 false；默认焦点＝取消；恢复卡零计时器（唯一豁免＝一次性开启警告自动收起）`
- `U1 系统消息/系统通知行源码钉：分类器单一来源＋is-system/.sys-notice 行钩子＋shield 图标＋撤回判据只认 message`
- `U1 系统通知分类（真实执行）：【系统通知】/【系统通知·<子类>】⇒ system-notice；正文/用户正文分离；近似文本不误伤`
- `U1 归类与编排契约一致性（独立复核）：三真实前缀回放/回显均归 system；既有两类仍归原类`

## ui-reacceptance-renderer-regression.mjs.retired

- (no `test("...")` declarations; probe/script)

## uiux-anchor-drift-probe.mjs.retired

- (no `test("...")` declarations; probe/script)

## uiux-anchor-probe.mjs.retired

- (no `test("...")` declarations; probe/script)

## uiux-rowgap-detached-probe.mjs.retired

- (no `test("...")` declarations; probe/script)

## uiux-v2-renderer-regression.mjs.retired

- (no `test("...")` declarations; probe/script)

