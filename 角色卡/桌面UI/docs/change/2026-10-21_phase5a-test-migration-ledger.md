# Phase 5A 旧测试逐名迁移台账

- 生成时间：2026-10-21（Phase 5A）
- 范围：`test/桌面应用/renderer.test.ts` 108 + `markdown.test.ts` 5 + `tool-rows.test.ts` 53 + `runtime-ui.test.ts` 12 = **178**。
- 5A **不删除**任何旧测试/旧渲染器/vendor；旧基线 **681/681**（原 679 + 桌面窗口 Phase 5A 新增 2 项）与新 `test/桌面UI/**`（136/136）必须同时全绿。删除只在 5B 门后执行。
- 结论口径：`迁移` = 新纯逻辑测试逐名承接；`迁移+e2e` = 纯逻辑 + 官方 e2e 段共同承接；`e2e` = 浏览器/DOM/布局行为由官方 e2e 段承接；`退役` = 旧实现/源码子串守卫不再保留，替代断言见「替代说明」；`交接` = 属桌面窗口/主进程职责，按测试交接表在 5B 前处理。
- 旧测试名保持原文（含历史日期/项目符号）；不静默丢弃覆盖，不弱化断言。

## 汇总

| 结论 | 数量 |
|---|---:|
| 迁移 | 103 |
| 迁移+e2e | 44 |
| e2e | 26 |
| 退役 | 3 |
| 交接 | 2 |
| **合计** | **178** |

## 逐名台账

| # | 旧文件::测试名 | 结论 | 新位置 / 替代说明 |
|---:|---|---|---|
| 1 | `renderer.test.ts::写入语义（桌面一律 pi）：明示写入真实落到导入项目，但受角色边界约束（越界写被拒）` | 退役 | 写边界属主进程/门禁；新 source-guard「渲染器边界」禁 fs/Node；e2e SEND 8/8 覆盖真实载荷 |
| 2 | `renderer.test.ts::V2r1：真实 Pi/Codex/Claude 可选，保留单一写入语义和退役 DOM 守卫` | 迁移+e2e | ui-store「默认引擎 Claude…」+ source-guard「配置与依赖」；e2e SELECTOR/VISUAL |
| 3 | `renderer.test.ts::默认引擎为 Claude：JS 初始 state 与 index.html 静态初始态一致，选项顺序不变` | 迁移+e2e | ui-store「默认引擎 Claude、选项顺序…」；e2e SELECTOR 27/27 |
| 4 | `renderer.test.ts::不再有一概而论的「V1 桌面：只判不写」（该说法仅 demo 路径成立）` | 退役 | 旧文案口径已被运行事实取代；source-guard 边界与 e2e SEND 承担 |
| 5 | `renderer.test.ts::生效配置来源如实呈现（T13）：.ans 不可用/缺 pin → 内联明示「未授权」，绝不静默` | 迁移+e2e | runtime-config「文案：缺配/齐备/application/来源…」；e2e CONFIG 21/21 |
| 6 | `renderer.test.ts::T17：su 主位/默认选中由 listProject 的 primaryRoleId 驱动（渲染侧不硬编码 "su"）` | 迁移+e2e | role-view「主入口由 primaryRoleId 驱动…」；e2e W6-C 左树 |
| 7 | `renderer.test.ts::T17：未-bootstrap 状态据 hasRoles===false 显示（客户裁定：此事只说一遍，且只在中栏正中）` | e2e | e2e FLOW「fresh empty context…」/空态；不再由旧 DOM 子串守卫 |
| 8 | `renderer.test.ts::T17：左树可刷新——订阅 project:changed 重取枚举；主入口/次级分组与主 CTA 齐备` | e2e | e2e 项目切换/刷新路径 + runtime-view「信封路由」；旧源码订阅守卫退役 |
| 9 | `renderer.test.ts::T20：来源角色保留报告，主入口不提前镜像，真实投递默认折叠` | 迁移+e2e | work-view「最近回交…」+ report-view「报告身份…」；e2e FLOW C 段 |
| 10 | `renderer.test.ts::T28：Pi 配置面板存在——3 项必填 + 2 项「高级」（可折叠、可留空）；provider 不在面板；token 掩码` | 迁移+e2e | runtime-config「控件矩阵」「字段分组」；e2e CONFIG |
| 11 | `renderer.test.ts::T28 扩展：高级设置组——CONTEXT_WINDOW + PROMPT_TIMEOUT 按序渲染、主区排除、单项兼容` | 迁移 | runtime-config「字段分组：range 进高级…」 |
| 12 | `renderer.test.ts::T28 扩展 2：预设档位滑块——值↔下标↔标签纯映射与 range 控件接线` | 迁移 | runtime-config「range 下标/规范值/标签…」 |
| 13 | `renderer.test.ts::2026-10-18：推理强度改回下拉（中文标签 / raw 值）；range 仅长档位；无 ticks、滑块恢复紧凑` | 迁移+e2e | runtime-config「短档位判定」「控件矩阵」；e2e SELECTOR |
| 14 | `renderer.test.ts::A-5：交互卡（确认/单选/多选/预览）取代收口确认卡；作答经 operatorRespond 回传（主进程按请求快照校验）` | 迁移+e2e | operator-view「镜像面」「终态文案」+ confirm-logic「卡片状态机」；e2e MIRROR 8/8 |
| 15 | `renderer.test.ts::A-5：确认卡预览按受控 Markdown 呈现（标题/列表/表格/加粗；纯文本多行可读；原文 HTML 仍转义）` | 迁移 | markdown「语法…」「XSS 负例…」 |
| 16 | `renderer.test.ts::A-5：收口面已删（断言「它不在」）——交互卡与确认制取代之，防回潮` | 退役 | 旧收口节点已不存在；source-guard 组件单一来源 + e2e 交互卡断言 |
| 17 | `renderer.test.ts::自绘标题栏：窗口无边框 + 去掉默认菜单栏（断言「它不在」）` | 交接 | 桌面窗口/主进程职责（5B 交接表）；渲染器只经 window.desktop |
| 18 | `renderer.test.ts::自绘标题栏：三个窗口按钮经 IPC 接主进程（最小化 / 最大化-还原 / 关闭）` | 交接 | 桌面窗口/IPC 职责；渲染器 TitleBar 只经 lib/platform（source-guard 边界） |
| 19 | `renderer.test.ts::B-1：消息经最小子集 Markdown 渲染（先转义后解析）；sys-* 状态行保持转义` | 迁移 | markdown「语法…」+ event-routing「事件→行」 |
| 20 | `renderer.test.ts::B-1（XSS 红线冒烟）：纯函数可独立断言——语法渲染 + `<script>`/`<img onerror>` 保持转义文本` | 迁移 | markdown「XSS 负例（护栏）…」 |
| 21 | `renderer.test.ts::B-2：selectRole 不得无条件 clearChat；每角色一个 pane；事件按 roleId 信封分发` | 迁移+e2e | runtime-view「路由…」「重放顺序…」；e2e 多 pane/MIRROR |
| 22 | `renderer.test.ts::空白兜底（2026-10-20）：loading 只看 transcript 行；回放/开会话后无 transcript 显示中性占位` | e2e | e2e FLOW「fresh empty context never mistakes loader…」 |
| 23 | `renderer.test.ts::B-3 + 状态准确性（2026-10-12 客户裁定）：状态→徽标纯函数（**图标 + 短标签**）；working 只由**真实信号**（busy/队列深度）派生` | 迁移 | status「状态优先级…」「徽标…」 |
| 24 | `renderer.test.ts::真机缺陷修复：交互卡严格投递所属 pane（不回落当前查看角色）+ 登记表补挂 + 跨 pane 只读指针 + 过期终态` | 迁移+e2e | operator-view「可见性指针」「镜像面」+ confirm-logic；e2e MIRROR/QUEUE |
| 25 | `renderer.test.ts::工具行瘦身（2026-10-12 客户裁定）：只显示状态与目标——长内容/读取正文的反向断言` | 迁移+e2e | tool-summary「phaseRowView…」；e2e TERMINAL 22/22 目标/长文反向 |
| 26 | `renderer.test.ts::F-8-b：非零退出中性类——红色错误预览让位、详情字段不假冒「错误」（判据单一来源在 tool-rows 结构化事实）` | 迁移 | tool-summary「activityPhaseLabel…」+ event-routing「工具事实…」 |
| 27 | `renderer.test.ts::H-1 附录：系统投递输入单独样式——分类器（两名渲染函数的前缀=单一来源）+ 手输防误伤 + 回放同类` | 迁移 | event-routing「注入/系统通知分类…」 |
| 28 | `renderer.test.ts::2026-10-19：`【系统通知…】` 归类为 system-notice——带「系统」标签、通知与用户正文分离；旧消息不受影响` | 迁移 | event-routing「注入/系统通知分类…」 |
| 29 | `renderer.test.ts::2026-10-19：无文件目标的工具行——占位为中性「无文件目标」（不暗示未保存/失败）` | 迁移 | event-routing「取消/失败目标取自 detail.path；无目标不伪造」 |
| 30 | `renderer.test.ts::K-1：输入区为**圆角胶囊**、发送箭头**内嵌框内**；快捷键与状态位保持可达（旧行结构退役）` | e2e | e2e VISUAL 54/54（胶囊/箭头/可达性实测）；旧 DOM 结构守卫退役 |
| 31 | `renderer.test.ts::P0-1 图片接线：附件随消息**带载荷上送**（IPC→Interface 重校验→队列定格→句柄透传）；旧「未发送」提示退役` | 迁移+e2e | confirm-logic「附件类型呈现…」；e2e SEND 8/8（真实载荷） |
| 32 | `renderer.test.ts::P0-2 停止入口：#btn-halt 在输入框区（发送钮左侧）仅忙碌时出现；与发送钮并存；三态如实行；结束会话按钮不回归` | e2e | e2e TERMINAL 22/22（三态/并列/结束会话不回归） |
| 33 | `renderer.test.ts::D-1：会话记录恢复——主进程只读解析并推规范化行；渲染侧回放进该角色 pane（分隔提示 + is-replay）` | 迁移+e2e | runtime-view「重放顺序…」+ replay 四测；e2e RUNTIME 17/17 |
| 34 | `renderer.test.ts::D-1 文案分支（pm 2026-10-12 契约钉死）：resumed→无提示；文件在→「已从本地会话文件恢复」；缺失/损坏→（有历史才）「新会话」——唯一映射` | e2e | e2e RUNTIME 17/17（resumed/文件/缺失分支实测） |
| 35 | `renderer.test.ts::M-1：shell 确认卡——命令在 <pre>、摘要/人话原因、折叠详情、拒绝默认焦点；Esc 与关闭 = 不放行；无原生对话框` | 迁移+e2e | confirm-logic「shell 回包…」+ judge「确认卡标题…」；e2e TERMINAL |
| 36 | `renderer.test.ts::SU 命令审批卡：标题/档位/可见原因/绕过写边界警告/拒绝默认焦点；project 卡逐字回归` | 迁移+e2e | judge「确认卡标题/档位/恢复动作…」+ confirm-logic；e2e TERMINAL |
| 37 | `renderer.test.ts::G-2 U1：恢复确认卡——动作/目标角色/证据逐字；恰「执行」=allow:true；取消/Esc/关闭=不执行；等待不设限（无计时器）` | 迁移+e2e | confirm-logic「恢复卡回包…」；e2e G2 5/5 |
| 38 | `renderer.test.ts::G-2 U1：恢复动作纯映射——三枚冻结枚举的人话标签+后果说明；未知动作 null（不假装认识）` | 迁移 | judge「确认卡标题/档位/恢复动作…」 |
| 39 | `renderer.test.ts::G-2 U1：`[系统]` 消息行——聊天流单独样式（来源=系统）；队列视图来源标签与不可撤回呈现` | 迁移 | event-routing「注入/系统通知分类…」+ work-view「队列分组…」 |
| 40 | `renderer.test.ts::N-1：「导入项目 / 切换项目」按钮文案——纯函数两态 + 导入→清空回退；判据用已有状态（不靠界面猜测）` | e2e | e2e 左栏按钮文案/项目切换实测；纯两态并入 ui-store/项目态 |
| 41 | `renderer.test.ts::N-2：右栏角色卡走既有 Markdown 管线（同 esc 单一来源）；XSS 反向用例照旧；边界/变更/文档三组未动` | 迁移 | markdown 五测 + source-guard「Markdown 单一管线」；e2e FLOW 文档段 |
| 42 | `renderer.test.ts::N-3：右栏「待办 / 队列」——夹具逐条渲染（来源/摘要/位置/进行中）、长内容不铺开、空占位、切角色切数据` | 迁移+e2e | work-view「队列分组…」；e2e QUEUE 4/4 |
| 43 | `renderer.test.ts::N-4：变更记录/文档索引/回交卡摘要一并 Markdown 化（同一管线与卡-md 钩子；XSS 反向；证据列表仍 esc）` | 迁移+e2e | markdown + work-view「最近回交…」；e2e FLOW N-4 文档/回交段 |
| 44 | `renderer.test.ts::P-1：待确认卡可达性——到达即达（底部阈值内滚到卡/上翻不打断，阈值 120px）+ 常驻 chip（计数/逐张定位/终态灭）+ 切回滚到卡；三处指示同源` | 迁移+e2e | work-view「待处理…」；e2e chip/locate/切回段（P-1） |
| 45 | `renderer.test.ts::Q-2：窗口化行模型（阈值 150 / 缓冲 30 / spacer / rAF 合帧）；四条滚动语义逐条钉（贴底/卡定位/切回恢复/回放惰性）` | 迁移+e2e | row-model 四测；e2e VISUAL/bench（惰性 10/10） |
| 46 | `renderer.test.ts::助手消息即时 Markdown（2026-10-17 实机修复）：roleBusy/未 settled 也不再退化为纯文本` | 迁移 | markdown「语法…」；e2e VISUAL 即时渲染段 |
| 47 | `renderer.test.ts::S-1：流式输出双向语义——在底部才贴底（先量后挂）、上翻不拽回；窗口化下贴底在窗口更新**之后**` | 迁移+e2e | reading-anchor「贴底判定…」；e2e S-1 段（先量后挂/上翻不拽回） |
| 48 | `renderer.test.ts::U-1：点角色到底部（取代 B-2「恢复位置」；scrollMemo 删净）；有卡仍滚到卡（P-1 保留）；与 S-1 双向语义不互相污染` | e2e | e2e U-1 段（点角色到底/有卡滚到卡/双语义不污染） |
| 49 | `renderer.test.ts::U1：会话提示条（.session-notice）出现/增高——「在底部者」补一次贴底；上翻者不打扰；高度不变不动` | e2e | e2e U1 段（出现/增高/上翻不打扰） |
| 50 | `renderer.test.ts::锚点物化：重物化复用既有行（不重建落尾）；registerRow 支持锚点插入；回放锚点表登记与消费；兜底落尾写明且不丢卡` | 迁移+e2e | anchor-view 五测；e2e 交互卡锚点/回放段 |
| 51 | `renderer.test.ts::右栏抽屉：默认不占屏（col-right 退役）；图标簇两枚（待办/队列归角色）；点开展示/再点收起/Esc；角标=选中角色待办深度；Pi 面板迁入抽屉且抽屉内不溢出` | e2e | e2e 抽屉段 + VISUAL 54/54；旧 DOM 守卫退役 |
| 52 | `renderer.test.ts::D-1 修复：回放去重——同一份历史幂等（skip）、增长走增量（append）、其余全量重建；重推不再叠加副本` | 迁移 | replay「回放计划…」「实时去重…」 |
| 53 | `renderer.test.ts::data-state 修复：轮末回 idle——data-state 只随 role-state 真实快照（run/idle）` | 迁移+e2e | runtime-view「载荷 runtime…」；e2e role-state 段 |
| 54 | `renderer.test.ts::P1-1 UI：待办「全文」展开与「撤回」——仅客户消息且未投递者；派发/回交无撤回钮；撤回/无效各有如实行` | 迁移+e2e | work-view「队列分组…」+ confirm-logic「撤回回执…」；e2e QUEUE |
| 55 | `renderer.test.ts::P1-2：LRU 淘汰跳过 busy + 正在开启者不淘汰；settled 后下一时机再收（源码钉）` | e2e | e2e RUNTIME 17/17（busy/开启/收束时机实测）；旧源码钉退役 |
| 56 | `renderer.test.ts::P1-3：切换项目一次性防呆——有 busy 才出内联确认条（#chat 之外、不落聊天历史）；无 busy 逐字不变` | e2e | e2e P1-3 安全证据；确认条本身登记为 Phase 6 允许差异（PM §17.4） |
| 57 | `renderer.test.ts::V2 target batch receipt uses one compact factual dl without per-report execution claims` | 迁移+e2e | report-view「交付批次事实…」；e2e FLOW delivery 段 |
| 58 | `renderer.test.ts::SV13 received reply folding uses exact receiver turn independently of report source turn` | e2e | e2e FLOW 任务请求/回复折叠段（精确 turnId） |
| 59 | `renderer.test.ts::cold report snapshots sort copied list by valid actual times only, keeping ties and unknown wire order` | 迁移 | report-view「历史报告排序…」 |
| 60 | `renderer.test.ts::v3/W9–W11：全应用唯一一枚 12px SVG 弧线转轮——图源在 role-status.js 单点，字形/边框转轮退役` | 迁移+e2e | source-guard「视觉/组件单一来源…」；e2e VISUAL 54/54 |
| 61 | `renderer.test.ts::v3/W10+S3：尾行——「正在工作」带同款转轮；chip 可见时不显示「等待你确认」（同一刷新点联动）` | 迁移+e2e | status「徽标…」；e2e VISUAL 尾行/chip 同源段 |
| 62 | `renderer.test.ts::v3/W1–W6/W6b/S2：样式数值按批准默认档落位（实测口径见 e2e v3 段）` | e2e | e2e VISUAL 54/54（实测数值）；旧样式子串守卫退役 |
| 63 | `renderer.test.ts::v3/W6b+S1/S4+折叠口径：渲染线——system 正文 displayBody、折叠行文案与开合状态机经纯函数/单点` | 迁移 | event-routing「事件→行」「注入/系统通知…」+ tool-summary 折叠 |
| 64 | `renderer.test.ts::G-4/I7：安装工具行/系统行零特判——渲染平面对新工具名与 [系统·安装] 标记零引用（按构造走通用链）` | 迁移 | tool-summary「G-4/V2-MCP…」+ event-routing 系统归类 |
| 65 | `renderer.test.ts::G-4/V2-MCP：MCP 工具行/安装行零特判——渲染平面对 mcp__/install_mcp/uninstall_mcp 零引用（按构造走通用链）` | 迁移 | tool-summary「G-4/V2-MCP…」 |
| 66 | `renderer.test.ts::G-5/wave2：设置面板 choices 字段＝选择控件（值域即选项＋留空未设态）；自由文本字段逐字现状` | 迁移 | runtime-config「控件矩阵…」 |
| 67 | `renderer.test.ts::G-5/wave2：推理折叠行接线——默认折叠含运行中、状态机复用、可展开性分支、回放同解（结构化字段不靠猜）` | e2e | e2e TOOLFOLD 19/19 + tool-summary 状态文案 |
| 68 | `renderer.test.ts::I4：动作可见谓词单一来源——S1 显示；present/invalid/S0 不显示` | 迁移 | governance-view「动作可见谓词…」 |
| 69 | `renderer.test.ts::I4 修订：S1 角色数只计项目角色——内置 su（builtIn:true）不计入` | 迁移 | governance-view「项目角色计数排除 builtIn…」 |
| 70 | `renderer.test.ts::I4：S1 空态文案——含「尚无治理记录」与 ans govern 兜底、不含「项目尚未 bootstrap」；S0 逐字不变` | 迁移 | governance-view「状态行…」 |
| 71 | `renderer.test.ts::I4：预览面板——将写路径/pin 对象与角色数/采纳/授权来源/旧格式提示/不扩大声明；取消不调 establish` | 迁移 | governance-view「reaccept 预览…」「establish 预览…」 |
| 72 | `renderer.test.ts::I4：禁止重复点击——确认后 disabled＋「正在建立治理记录…」；phase=write 失败不得宣称零副作用` | 迁移 | governance-view「reaccept 成功/失败…」 |
| 73 | `renderer.test.ts::I4：成功——只认 ok＋phase=write＋completed；逐字 message＋重建提示；刷新 listProject 后动作隐藏` | 迁移 | governance-view「reaccept 成功/失败…」 |
| 74 | `renderer.test.ts::D2：applyListing 接受 pin-mismatch 并保留 pinFiles/pinCount；未知状态 fail-closed` | 迁移 | governance-view「动作可见谓词…」「pin-mismatch 状态/空态…」 |
| 75 | `renderer.test.ts::D2：状态行——reaccept 文案＋[检查并重新接受]；establish/invalid 行为不变` | 迁移 | governance-view「状态行…」「pin-mismatch 状态/空态…」 |
| 76 | `renderer.test.ts::D2：su 空态——reaccept 标题/说明/主按钮/次行；establish 行为不变；按钮已绑定` | 迁移+e2e | governance-view「状态行…」；e2e GOV 7/7 |
| 77 | `renderer.test.ts::D2：预览——共用 #governance-preview 宿主、mode 分支、按契约调 IPC、取消/关闭不调 IPC、无新增模态` | 迁移+e2e | governance-view「reaccept 预览…」；e2e GOV 7/7 |
| 78 | `renderer.test.ts::D2：重新接受成功/失败路径——成功文案单点、主进程驱动刷新；失败按 phase 区分` | 迁移 | governance-view「reaccept 成功/失败…」 |
| 79 | `renderer.test.ts::A1：结构——框线、900 内容列、同列 padding、贴底输入区（HTML/JS 零改动）` | e2e | e2e VISUAL 54/54（1360/960/200% 结构实测） |
| 80 | `renderer.test.ts::A2：重量——token/对比度、控件边框、圆角收敛、表格、浮层阴影、选中竖条` | e2e | e2e VISUAL 54/54（令牌/边框/阴影实测） |
| 81 | `renderer.test.ts::深色石墨主题：color-scheme/令牌/滚动条与选中文本/硬编码浅色残留守卫` | e2e | e2e VISUAL 暗色扫描 + source-guard 无第二 UI 库 |
| 82 | `renderer.test.ts::字体：整页等宽（2026-10-17 客户裁定）——--sans 与 --mono 同一等宽栈，无 system-ui/Segoe 主字体` | e2e | e2e VISUAL 字体栈实测 |
| 83 | `renderer.test.ts::可收起左栏：默认展开/toggle 类/localStorage 坏值回退/展开按钮可达/900 列保持` | 迁移+e2e | ui-store「宽度动作…」「存储不可用…」；e2e VISUAL 左栏段 |
| 84 | `renderer.test.ts::左栏宽度：默认 248 / 208–360 clamp / 坏值回退 / 持久化 / 拖动·键盘·双击 / 折叠保留` | 迁移+e2e | ui-store「左栏宽度：默认 248…」；e2e 拖动/键盘/双击段 |
| 85 | `renderer.test.ts::左树选中项可见（2026-10-17 实机）：最小位移、可见不动、不重置到顶` | e2e | e2e VISUAL/ROLE 11/11（最小位移/不重置） |
| 86 | `renderer.test.ts::P5：输入区两个复选框 + 一次性警告 + 手动回落提示的 DOM 结构（§9.1/§9.2/§9.3）` | 迁移+e2e | judge「双开关视图…」；e2e 开关 DOM/警告段 |
| 87 | `renderer.test.ts::P5：两个开关各自三态——启动取真实状态、推送同步、点击只信主进程回包；桥缺失禁用且无假开启态` | 迁移 | judge「开关回包…」「桥可用性…」 |
| 88 | `renderer.test.ts::P5：结果行接线——shell 与治理代批均按 roleId 落 pane、按 toolCallId 锚定、manual 不落行` | 迁移+e2e | judge「shell 判断结果…」「治理代批结果…」；e2e JUDGE 33/33 |
| 89 | `renderer.test.ts::P5：手动回落卡 judgeNotice 原样渲染（不改写、无值隐藏）；已挂起卡不受开关切换影响` | 迁移 | judge「确认卡标题…」 |
| 90 | `renderer.test.ts::P5 边界：不自动开会话/切角色、不写 localStorage/.env/项目文件、不接触 Node/fs` | 迁移 | source-guard「渲染器边界…」「治理/报告事实不持久化…」 |
| 91 | `renderer.test.ts::2026-10-18 真机：settled/失效回执后收起 shell 确认卡，不保留不可操作卡；等待中的卡不受影响` | 迁移 | confirm-logic「settled 只收起同角色…」 |
| 92 | `renderer.test.ts::W4：左树三组——主入口/治理职能（内置）/项目角色；治理行由 governanceFunction 派生（不硬编码三权 id）` | 迁移 | role-view「W4：左树三组…」 |
| 93 | `renderer.test.ts::W4：空态——报告员保留治理记录入口；提名/编排专属说明按 governanceFunction 呈现；pane 按角色取文案` | 迁移+e2e | governance-view「状态行…」；e2e FLOW 空态段 |
| 94 | `renderer.test.ts::W4：状态行——治理模型/当前流程/状态只信 interface；未给不猜；旧模型提示条与 V1 按钮不假装可用` | 迁移 | governance-view「状态行：模型未知…」 |
| 95 | `renderer.test.ts::W4：建立治理记录预览——single/trio 选择默认 single、客户点选、结果透传 interface；未接线禁用并说明` | 迁移 | governance-view「establish 预览/失败…」 |
| 96 | `renderer.test.ts::W4：决定卡——flowId/权力/写路径/摘要/哈希/排队提示；排队不可作答；UI 不自动合并/批准` | 迁移 | governance-view「治理卡元信息…」+ operator-view「镜像面…」 |
| 97 | `renderer.test.ts::W6-C：四角色左树——主入口仍由 primaryRoleId 驱动；治理职能组排除主入口；Liaison 文案经 ui-labels` | 迁移 | role-view「W4：左树三组…」「主入口由 primaryRoleId…」 |
| 98 | `renderer.test.ts::2026-10-19：左树取消折叠——所有角色平铺可见、无 tree-group-fold/details；主入口置顶不变` | 迁移+e2e | role-view 分组扁平测试；e2e VISUAL 平铺段 |
| 99 | `renderer.test.ts::2026-10-18：chat header/composer/右侧标题/系统行/来源显示 displayNameOf；项目角色仍 roleId` | 迁移 | role-view「W6-C：普通角色显示 roleId…」 |
| 100 | `renderer.test.ts::W6-C：空态优先级——S0 → 治理记录动作 → 治理角色专属 → 默认；Liaison 提示仅附加不替换，专属空态无重复 CTA` | e2e | e2e FLOW 空态优先级段；纯文案由 governance-view 状态行覆盖 |
| 101 | `renderer.test.ts::W6-C：镜像卡——同一请求 id 双呈现；镜像面追加末尾/不参与源锚点、不自动滚动；来源标签来自 ui-labels` | 迁移+e2e | operator-view「镜像面…」；e2e MIRROR 8/8 |
| 102 | `renderer.test.ts::W6-C：只答一次——任一侧作答调用同一 respond；成功后冻结两侧；第二侧/重复提交被终态与 submitting 双闸挡住` | 迁移+e2e | confirm-logic「卡片状态机…」+ operator-view；e2e MIRROR 双闸 |
| 103 | `renderer.test.ts::W6-C：排队与一项目一卡——排队事件只出聚合行、不物化可操作卡；single/su 不出现该行；呈现后从聚合移除` | 迁移+e2e | operator-view「排队计数…」「pending 按 surfaces…」；e2e QUEUE 4/4 |
| 104 | `renderer.test.ts::W6-C：冻结/排队状态在两侧一致——refreshEntryAwaiting 按 surfaces 刷新；排队启停遍历全部卡` | 迁移+e2e | operator-view「pending 按 surfaces…」；e2e MIRROR |
| 105 | `renderer.test.ts::V1b：迁移按钮按桥能力启用/禁用；点击只打开零写入预览（不直接写入）` | 迁移 | governance-view「迁移：按钮接线…」 |
| 106 | `renderer.test.ts::V1b：迁移预览字段——模型/写路径/modelField/manifestLine/pinChanges/保留文件/摘要前 8 位；确认按钮 fail-closed` | 迁移 | governance-view「迁移：预览摘要与 canConfirm…」 |
| 107 | `renderer.test.ts::V1b：确认升级只回传 snapshotDigest；成功由 project:changed 刷新；失败按 status/phase 如实` | 迁移 | governance-view「迁移：失败不假成功…」 |
| 108 | `renderer.test.ts::V1b：S1 模型选择继续透传 preview/establish，且模型由 listing 回报后不再禁用` | 迁移 | governance-view「establish 预览/失败…」 |
| 109 | `markdown.test.ts::语法：标题/粗斜/行内码/引用/列表/围栏码/链接/段落换行（markdown-it 输出形状）` | 迁移 | markdown「语法：…」 |
| 110 | `markdown.test.ts::XSS 负例（护栏）：<script>/<img onerror>/javascript: 链接/引号注入 href/图片/表格单元格——一律不产可执行 HTML` | 迁移 | markdown「XSS 负例（护栏）…」 |
| 111 | `markdown.test.ts::配置钉子：options.html 必须为 false（误开成 true 本测试必红）；并现场演示「开了会怎样」` | 迁移 | markdown「配置钉子…」 |
| 112 | `markdown.test.ts::库文件 pin：vendor 的 markdown-it 单文件 sha256 与记录一致（静默换文件/升级未同步必红）` | 迁移 | markdown「库 pin：npm markdown-it 15.0.3…」（vendor sha256 → npm 版本+lockfile） |
| 113 | `markdown.test.ts::B受限文档仍静态呈现：原文可读且不建立图片脚本或本地文件资源` | 迁移 | markdown「B受限文档仍静态呈现…」 |
| 114 | `tool-rows.test.ts::activity facts: accepted alone is unknown; explicit result succeeds; old call remains call` | 迁移 | tool-summary「activityPhaseLabel…」+ event-routing「工具事实…」 |
| 115 | `tool-rows.test.ts::known own tool first-line failures remain visible even with historical isError=false` | 迁移 | event-routing「取消/失败目标取自 detail.path…」 |
| 116 | `tool-rows.test.ts::tool replay state changes invalidate equality without exposing body` | 迁移 | replay「实时去重…」 |
| 117 | `tool-rows.test.ts::execution-before-denial never claims execution failed; known failures keep exact visible first line` | 迁移 | tool-summary「折叠文案：未放行优先…」+ event-routing |
| 118 | `tool-rows.test.ts::full known target survives slim summary for default failure location` | 迁移 | event-routing「工具事实…」「取消/失败目标取自 detail.path…」 |
| 119 | `tool-rows.test.ts::orphan own read_file failure keeps explicit first-line target without inspecting body` | 迁移 | event-routing「取消/失败目标取自 detail.path…」 |
| 120 | `tool-rows.test.ts::canonical start/result/blocked各自保留真实状态与实际工具名` | 迁移 | tool-summary「S1：mergePhases…」「activityPhaseLabel…」 |
| 121 | `tool-rows.test.ts::A4 consumer only reads public safe display target and rejects unknown versions` | 迁移+e2e | event-routing「工具事实…」；e2e A4 段 |
| 122 | `tool-rows.test.ts::tool identity never inferred for ordinary aborted terminal` | 迁移 | event-routing「工具事实：timedOut > exitCode…」 |
| 123 | `tool-rows.test.ts::delivery notes are not tool activities; known legacy and trusted tool metadata stay tools` | 迁移 | event-routing「注入/系统通知分类…」+ report-view |
| 124 | `tool-rows.test.ts::actual protected worker history retains all ten calls and failure result without adding a generic` | e2e | e2e TERMINAL/TOOLFOLD 19/19（十次调用全保留） |
| 125 | `tool-rows.test.ts::F-8-b：非零退出（结构化事实）→ 中性「已执行完成（退出码 N）」；事实优先于旧文本正则，旧文本行兼容不变` | 迁移 | tool-summary「activityPhaseLabel…」 |
| 126 | `tool-rows.test.ts::F-8-b：timedOut 独立一类；signal/error 事实与 spawn 失败不落中性；exit 0 仍「执行完成」` | 迁移 | tool-summary「activityPhaseLabel…」+ event-routing「timedOut…」 |
| 127 | `tool-rows.test.ts::G-2：system 投递归类——[系统·<子类>] 文首标记（回显/回放同解）；来源=系统（sourceRoleId 恒空）` | 迁移 | event-routing「注入/系统通知分类…」 |
| 128 | `tool-rows.test.ts::G-2：system 归类不误伤——行内提及 / 未闭合 / 空子类 / 无空白衔接一律 null；既有两类回归不变` | 迁移 | event-routing「注入/系统通知分类…」 |
| 129 | `tool-rows.test.ts::2026-10-19：系统通知归类——`【系统通知…】` 文首标记；通知与用户正文分离；原文不变` | 迁移 | event-routing「注入/系统通知分类…」 |
| 130 | `tool-rows.test.ts::W6b：system 展示正文剥离文首标记（displayBody）——判据/原文不变，仅呈现层取用` | 迁移 | event-routing「事件→行」系统映射 |
| 131 | `tool-rows.test.ts::内部治理反馈展示收敛：带来源短提示可区分（不转述原文），无来源回退；其他系统子类不变` | 迁移 | event-routing 系统分类 + governance-view |
| 132 | `tool-rows.test.ts::S1：mergePhases——同一 toolCallId 两相位并入一行（首相位定位，相位按到达序）；不同调用/无 callId 不并` | 迁移 | tool-summary「S1：mergePhases…」 |
| 133 | `tool-rows.test.ts::S4/折叠口径：callSummary——「N 个调用」+ 工具分解（首现序、×k）+ 未放行/失败拆分（未放行优先）+ 未知照旧如实` | 迁移 | tool-summary「S4/折叠口径：callSummary…」 |
| 134 | `tool-rows.test.ts::G-4/I7：`[系统·安装]` 定格系统行走既有 system 归类——判据只依赖 `[系统·<子类>] ` 标记形态（不逐子类登记）` | 迁移 | event-routing 系统归类 + tool-summary 工具计数 |
| 135 | `tool-rows.test.ts::G-4/I7：install_skill/uninstall_skill 工具行按事件事实通用渲染——结构化与 legacy 两路径零特判` | 迁移 | tool-summary「G-4/V2-MCP…」 |
| 136 | `tool-rows.test.ts::G-4/I7：折叠分解按工具名计数——新工具名进「本轮 N 个调用：a / b ×k」摘要数据面（无白名单/特判）` | 迁移 | tool-summary「G-4/V2-MCP…」 |
| 137 | `tool-rows.test.ts::G-4/V2-MCP：mcp__<server>__<tool> 形态工具名走通用工具行链——名称解析/瘦身零特判（下划线/清洗/缩短形态全收）` | 迁移 | tool-summary「G-4/V2-MCP…」 |
| 138 | `tool-rows.test.ts::G-4/V2-MCP：折叠分解按工具名计数——mcp__<server>__<tool> 名进「本轮 N 个调用：a / b ×k」数据面（无白名单）` | 迁移 | tool-summary「G-4/V2-MCP…」 |
| 139 | `tool-rows.test.ts::G-4/V2-MCP：install_mcp/uninstall_mcp 工具行通用渲染 + `[系统·安装]` 系统行＝既有子类复用（MCP 语境复证）` | 迁移 | tool-summary + event-routing 系统归类 |
| 140 | `tool-rows.test.ts::G-5/wave2：reasoningLabel 文案边界——时长仅真实信号才显示、省略不假装内容、无时长不发明时间` | e2e | e2e TOOLFOLD 19/19（真实时长/省略/无时长） |
| 141 | `tool-rows.test.ts::G-5/wave2：reasoningFoldable——仅 complete 且正文非空可展开；omitted/空正文/坏件＝如实单行` | e2e | e2e TOOLFOLD 19/19（可展开性分支） |
| 142 | `tool-rows.test.ts::D1：governanceActionFor 真值表——pin-mismatch ⇒ reaccept；missing ⇒ establish；其余 null` | 迁移 | governance-view「动作可见谓词…」 |
| 143 | `tool-rows.test.ts::D1：governancePinMismatchText/EmptyState——只列非零类别、全零用「存在不一致」、逐字` | 迁移 | governance-view「pin-mismatch 状态/空态…」 |
| 144 | `tool-rows.test.ts::D1：governanceReacceptPreviewView——逐文件行/写入行/pin 行/警示/blockers 逐字` | 迁移 | governance-view「reaccept 预览…」 |
| 145 | `tool-rows.test.ts::D1：governanceReacceptSuccessText 逐字` | 迁移 | governance-view「reaccept 成功/失败…」 |
| 146 | `tool-rows.test.ts::P5：approval 开关视图——未开启默认「替我审批」、开启琥珀标记、桥缺失禁用且不假开启` | 迁移 | judge「双开关视图…」 |
| 147 | `tool-rows.test.ts::P5：decision 开关视图——默认「替我决策」、开启标记、single 禁用并说明、桥缺失不假开启` | 迁移 | judge「双开关视图…」 |
| 148 | `tool-rows.test.ts::P5：一次性开启警告——每组各自一次、关闭/重绘不重现、关开关再开启才再显示` | 迁移 | judge「一次性警告…」 |
| 149 | `tool-rows.test.ts::P5：开关 IPC 结果——成功采用主进程实际值；失败/坏件保持原状态并给错误` | 迁移 | judge「开关回包…」 |
| 150 | `tool-rows.test.ts::P5：开启警告——同一块按开启组列行（approval / decision / 两组同开）` | 迁移 | judge「一次性警告…」 |
| 151 | `tool-rows.test.ts::P5：结果行 allow——标题/摘要/档位/引擎/operator；摘要缺失不编命令意图` | 迁移 | judge「shell 判断结果…」 |
| 152 | `tool-rows.test.ts::P5：结果行 allow + deny 档放行——标题与徽标必须一眼可分（客户 D1）` | 迁移 | judge「shell 判断结果…」 |
| 153 | `tool-rows.test.ts::P5：结果行 deny——理由/替代方案/客户说明/关闭开关后重试的出路` | 迁移 | judge「shell 判断结果…」 |
| 154 | `tool-rows.test.ts::P5：manual 不产生结果行；未知/坏件返回 null（不编裁决）` | 迁移 | judge「shell 判断结果…」 |
| 155 | `tool-rows.test.ts::P5：手动回落卡 judgeNotice——一般 manual 与 row-failed 分开且逐字（与通道同解）` | 迁移 | judge「确认卡标题…」 |
| 156 | `tool-rows.test.ts::P5：治理代批结果行——「judge 代批 · 代审批/代决策」+ 结论/理由/引擎/选中项或路径` | 迁移 | judge「治理代批结果…」 |
| 157 | `tool-rows.test.ts::P5：治理手动回落 notice——一般 manual 与 row-failed 分开（代审批/代决策）` | 迁移 | judge「确认卡标题/档位/恢复动作…」 |
| 158 | `tool-rows.test.ts::D1：governanceReacceptFailureView——phase≠write 可声明零写入；phase=write 只逐字 message` | 迁移 | governance-view「reaccept 成功/失败…」 |
| 159 | `tool-rows.test.ts::W4/W6-C：治理角色文案——五角色中文名+英文名/权力副标题/内置标识（按 governanceFunction 派生，未知不猜）` | 迁移 | role-view「W4/W6-C：五角色中文名…」 |
| 160 | `tool-rows.test.ts::W4/W6-C：治理角色空态——五角色说明逐字（Lead 客户入口/提案交接；组队/统筹/验收）` | 迁移 | role-view「W4/W6-C：五角色…」+ governance-view 状态行 |
| 161 | `tool-rows.test.ts::W4/W6-C：状态行——三权显示五角色；当前流程/四态逐字；未知不猜` | 迁移 | governance-view「状态行…」+ role-view |
| 162 | `tool-rows.test.ts::W6-C：镜像卡来源标签与主入口排队聚合文案逐字（同一请求的第二呈现，不是第二张审批）` | 迁移+e2e | operator-view「镜像面…」；e2e MIRROR 8/8 |
| 163 | `tool-rows.test.ts::W4/V1b：旧模型迁移按钮——未接线「升级入口待本版后续」禁用；桥齐备「查看差异 / 升级」启用；提示条文案逐字` | 迁移 | governance-view「迁移：按钮接线…」 |
| 164 | `tool-rows.test.ts::W4/V1b：迁移预览视图——旧模型→三权、写路径、modelField/manifestLine、pin 空、保留文件、摘要前 8 位` | 迁移 | governance-view「迁移：预览摘要…」 |
| 165 | `tool-rows.test.ts::W4/V1b：迁移成功文案逐字；失败按 status/phase 如实、绝不假成功` | 迁移 | governance-view「迁移：失败不假成功…」 |
| 166 | `tool-rows.test.ts::W4：决定卡元信息——cardKind→权力类型、flowId/stepId/路径/摘要/哈希；普通 write 与缺失不冒充治理决定` | 迁移 | governance-view「治理卡元信息…」+ operator-view「镜像面…」 |
| 167 | `runtime-ui.test.ts::三元视图身份不串项目或引擎，旧缺身份只兼容 Pi` | 迁移 | runtime-view「视图键：项目+runtime…」 |
| 168 | `runtime-ui.test.ts::只按 IPC 组摘要分组：组长置前、未知职责原文保留、缺组不推权限` | 迁移 | role-view「W4：左树三组…」「组名去空白…」 |
| 169 | `runtime-ui.test.ts::设置来源和应用时点只呈现窗口实际字段` | 迁移 | runtime-config「视图应用文案…」 |
| 170 | `runtime-ui.test.ts::上下文未知/只读历史不冒充原生恢复；重建原因准确呈现` | e2e | e2e RUNTIME 17/17（上下文/只读历史/重建原因实测） |
| 171 | `runtime-ui.test.ts::实际工具元数据保留 turn/call/runtime；未报告结果不称完成` | 迁移 | event-routing「工具事实…」 |
| 172 | `runtime-ui.test.ts::实际 Codex args/ok 和 Core call/result 消费明确目标与结果，Claude未报告继续未知` | 迁移 | event-routing「工具事实…」 |
| 173 | `runtime-ui.test.ts::renderer 仅消费 IPC，机密为空且无持久化，切引擎不停止后台任务` | 迁移+e2e | source-guard「渲染器边界…」「治理/报告事实不持久化…」；e2e RUNTIME 切引擎 |
| 174 | `runtime-ui.test.ts::权威turn/event/完整文本与逐次出现计数：不同轮同文、同轮重复、未知legacy不混` | 迁移 | replay「实时去重…」+ event-routing「事件→行」 |
| 175 | `runtime-ui.test.ts::客户端气泡只按窗口clientMessageId与真实turnId绑定，不猜最新/同文` | 迁移+e2e | event-routing 路由/本地行；e2e SEND 8/8 |
| 176 | `runtime-ui.test.ts::引擎菜单定位：下开、上翻、限高与横向视口夹取` | e2e | e2e SELECTOR 27/27（下开/上翻/限高/夹取实测） |
| 177 | `runtime-ui.test.ts::可信输入与工具使用actual turn/call/phase，不靠正文和嵌套turn` | 迁移 | event-routing「工具事实…」「取消/失败目标…」 |
| 178 | `runtime-ui.test.ts::P7选择与确认根据真实kind，保存状态不等于验收或重新投递` | 迁移+e2e | operator-view「pendingKindFor…」+ work-view「待处理…」；e2e FLOW P7 官方通过 |

## 旧源码子串守卫 → 替代断言（重点逐项）

| 旧守卫主题 | 旧断言对象 | 新替代 |
|---|---|---|
| 渲染器不碰 Node/fs/Electron | `renderer.js` 子串 | `source-guard`「渲染器边界…」扫描 `app/renderer/src/**` imports/require/network |
| 不写 localStorage 治理事实 | `renderer.js` 子串 | `source-guard`「治理/报告事实不持久化…」：仅 ui-store 两个键 |
| 单一 `esc` / Markdown 管线 | `markdown.js` 子串 + vendor sha256 | `markdown`「库 pin…」+ `source-guard`「Markdown 单一管线…」 |
| 唯一 12px 转轮、无自绘 SVG | `role-status.js` 子串 | `source-guard`「视觉/组件单一来源…」+ e2e VISUAL |
| 主入口第三徽标回潮 | `.ti-badge` DOM | `source-guard`「Sidebar 身份…」+ e2e DELIVERY_NOTE 官方 identity |
| 状态标签不显示数量 | `statusBadge(status,0)` 子串 | `source-guard`「Sidebar 身份…」+ `status` 两测 |
| 旧收口面/折叠树不回潮 | `renderer.js` 子串 | 旧节点已删；e2e 平铺/交互卡段 + source-guard 组件单一来源 |
| 下拉/设置字段白名单 | `ui-labels.js` 子串 | `runtime-config` 九测（字段矩阵/校验/文案） |
| 工具行零特判（安装/MCP） | `tool-rows.js` 子串 | `tool-summary`「G-4/V2-MCP…」+ `event-routing` 系统归类 |
| 治理/报告不持久化、不自动作答 | `renderer.js` 子串 | `source-guard` 边界/持久化 + `operator-view`/`confirm-logic` |

## 5B 删除前置

- 旧端 5A 真跑快照已冻结（当前工作区 **681/681** = 原 679 + 桌面窗口 Phase 5A 新增 2 项 `ans-wiring`/`diagnostics`；桌面UI 未改这两文件）；本台账逐名对照后，5B 才允许删除四个旧测试文件。
- `hot-path.test.ts` / `message-queue.test.ts` 的旧段属桌面窗口，按测试交接表在 5B 前替换/退役，不在本台账 178 项内。
- 旧证据归档只读；5B 删除后核对归档哈希，旧端不再声称可复跑。
