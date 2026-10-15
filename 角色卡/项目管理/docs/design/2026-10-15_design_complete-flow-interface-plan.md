---
id: complete-flow-interface-plan
type: design
title: P1–P7三项接口实施方案统一审核与确认范围
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: designed
revision: 2
related: [desktop-complete-flow-review, uiux-desktop-complete-flow-20261015]
---

# 三项具体接口已评审，等待客户确认实施

**唯一审核结论：recommend approval（本总方案revision2列明的具体范围与取舍）。** 客户已确认[UX v2 P1–P7交互方向](../../../UIUX设计师/docs/design/2026-10-15_design_desktop-complete-flow.md)，另授权本轮相关角色准备接口方案及评审；**当前尚无生产实施授权**。本次没有修改app/src/test/.env或角色边界，没有运行未来接口测试。原型、旧回归和设计回签不能当新接口已实现。

本轮已由实际属主读真实源码，准备A/B/C公开合同和消费者方案，并由PM独立审查、root给[独立可测性审核](../../../测试/docs/design/2026-10-15_three-interface-verification-plan.md)。首轮字段、失败恢复、兼容、跨层及敏感旁路问题均已纳入下列当前版本；调查经过不再作为当前未决状态。文件指纹见[本版清单](2026-10-15-complete-flow-interface-evidence/review-manifest.json)。

## 当前canonical版本与独立回签

| 唯一合同/消费者 | 当前版本与职责 |
| --- | --- |
| [A工具详情](../../../运行时核心/docs/design/2026-10-15_design_tool-display-contract-a.md) | Core A/r4；Model、唯一安全投影、真实shell结构、历史与native-only纯保护桥 |
| [B文档读取](../../../桌面窗口/docs/design/2026-10-15_design_restricted-document-read.md) | Window B/r2；只读清单/grant、邻层路径、平台与风险、精确治理前置 |
| [C报告持久](../../../运行时核心/docs/design/2026-10-15_design_report-provenance-contract-c.md) | Core C/r2 + text_policy_revision:1；真实bound能力、源报告/目标attempt与receipt、仅保存恢复、安全显示副本 |
| [编排消费](../../../编排/docs/design/2026-10-15_design_report-provenance-consumer-c.md) | r2，实际同版接受A4/C2.tp1/WindowAC3；薄Pipeline入口、终态保存、原模型输入、writeEvidence兼容 |
| [窗口A/C消费](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-ac-consumers.md) | r3，实际同版接受A4/C2.tp1；固定批次、唯一入队归并、5受限方法/2状态事件、安全历史映射 |
| [UI总消费](../../../桌面UI/docs/design/2026-10-15_design_complete-flow-consumer-plan.md) | r3，实际同版接受A4/B2/C2.tp1/WindowAC3；A/B/C及P5–P7、请求取消/回焦/同卡更新 |
| [Pi](../../../Pi适配器/docs/design/2026-10-15_design_tool-display-and-report-consumer.md) | r2末窄回签A4/C2.tp1；真实call事实私有映射，不复制投影器 |
| [Codex](../../../Codex适配器/docs/design/2026-10-15_design_tool-display-and-report-consumer.md) | r2末窄回签A4/C2.tp1；无hook不造blocked，身份不经scrub |
| [Claude](../../../Claude适配器/docs/design/2026-10-15_design_tool-display-ac-assessment.md) | r2末窄回签A4/C2.tp1；未知旧hook不借当前turn，薄安全出口 |

各角色只写自身设计资料；Codex/Claude用新独立上下文绑定已有accepted角色，未创建新角色。Core独自维护A/C重叠Model/Service/tools写集，不能让两个实现者并发覆盖同文件；适配器通过公开注入能力使用投影，不导Core私有common。

## A：真实工具详情与有界安全展示

中立Source明确start/blocked/result及原始事实来源，公开result/error/execution/native-text fallback联合、Core实际handler inputrule、required-v1和实际profile纯内存登记。没有真实hook不制造blocked，真实call/turn不被redactor或hash改写；缺事实不解析message/邻近聊天补造exit、stdout、路径或身份。给模型的原message/content、argv/shell:false、门禁与停止语义保持。

推荐预算按先净化后UTF-8完整码点计算：目标/错误各4KiB，resultText/stdout/stderr各16KiB，summary1KiB，display JSON56KiB、整个工具event JSON64KiB。明确truncated/redacted/omissions；超大身份或投影错误只出typed message诊断，不伪造denied、完成或关联。保护当前已知凭据与明确敏感格式，不承诺识别任意未知秘密；旧已轮换密钥也可能无法匹配。这是客户本次需批准的展示内容政策，不称全DLP。

native-only旧Pi保原Window读取/parser，不新增读面或复制parser；中立legacy entries经Interface→Pipeline公开纯入口→Service同一保护→Window/UI。raw文字、source/error及原raw标题锚点均无IPC侧车；唯一Window helper把内容派生anchor转稳定hash token，两侧一致，真实call/turn不变。模板推断target/exit不升级结构事实。返回至多1MiB/4096条**连续最近后缀**，每文本16KiB，准确区分omitted/invalid/parserSkipped并显示“部分记录/文字已省略”；不承诺完整旧历史或已修旧整文件读取无界风险，不改旧日志。

A影响一个既有业务consumer：编排writeEvidence对新display只在真实accepted/result、ok===true、已知write/edit、完整未redacted/未truncated的path下记录可定位文件证据；隐藏/截断不退raw别名或新summary猜路径。旧事件保原兼容，实际行为用例纳入原handback-lifecycle测试。不能让“仅展示”悄悄丢失或伪造兜底报告证据。

## B：只读已列文档，范围与平台明确

推荐UTF-8 md/txt，fatal解码、NUL拒绝，256KiB精确原字节上限，超限失败而非假全文。原生pickProject成功由main登记每窗口grant；renderer任意listProject(root)不能授权。只有当前grant与有效projectViewId/documentId引用能读取已列角色资料/文档file，目录不算文件，evidence文字不是授权。重启无可信grant须重新原生选择目录；同项目刷新不扩大权限。

新能力按Interface→Pipeline→Service→Provider，Service唯一scope registry/资格/预算，Provider才做路径与句柄IO。词法/realpath、拒子路径symlink、O_NOFOLLOW、同句柄有界读与前后身份变化检查、明确错误/迟到scope失效/关闭句柄均在规范中；不把一次realpath检查当零竞态保证。

**客户须明确接受本版仅可信本地macOS/Linux受测文件系统，Windows/能力不足环境拒读。** 不保证对抗恶意本地writer的瞬时祖先替换/恢复或硬链接来源；若要求严格攻击者隔离，必须改选原生目录句柄/沙箱Provider方案，不能以本版检查假承诺。md/txt以外、超256KiB、符号链接文档可能不可读。静态安全Markdown不执行HTML/脚本，不自动载入图片/资源，不绕file:读取；不记录文档正文到诊断。

### 与原v2的明确P3交互差异

C未新增artifact文件schema，不能从evidence猜准确报告文件。最小方案是卡上**“查看来源角色文档”→该角色当前B引用列表→用户显选文件→阅读**，不是已定位的一键“阅读该报告”。未知来源、无refs、未grant、不支持平台分因提示，不自动首项。浏览不切聊天角色/引擎、不开会话，正文回列表保位置，关闭回原卡invoker。产品和[UIUX短评](../../../UIUX设计师/docs/design/2026-10-15_design_complete-flow-interface-ux-review.md)均接受其满足就地核对目标，但多一步必须在本次确认；冻结v2原型没有被暗改，也不把此前v2确认冒记为已批此变化。

## C：报告、投递与保存状态各自真实

Core实际bound session能力决定enabled/disabled/unknown，不由caller布尔猜。Pipeline在终态覆盖及清理后保存最终报告，source reportId、目标固定deliveryId、每次attemptId和实际targetturn分开；source原子文件与目标user/boundary/finalreceipt不是跨存储事务或跨进程exactly-once。ACK只证明turn创建。跨handle最终结论只来自有效最终receipt，只有boundary/缺settled仍保守未知，不能当未执行。

推荐source summary16KiB、evidence最多32条各2KiB、snapshot JSON96KiB；provenance最多256成员且每新user/event总1MiB。超限Provider前明确失败，不丢成员/拆批/变模型输入。enabled源保存失败暂不自动投递；disabled/legacy仍保原live自动回交、标未保存/未知，不暗建目录。原批次成员/顺序/模型text固定，新到报告不混入重试单元。

只对C可信handback，已可能调用Provider或receipt未知时不自动重prompt。显式“重试保存报告/历史”只接受ID、用原handle已冻结材料、每ID单在途，无timer/自动退避。Window是唯一同步enqueue owner：原业务对象+saved同时满足且await前先queued，Promise/订阅/初始结果任意顺序仍仅入一次。source补存成功可**首次继续原待投递回交**，不重源模型；target补历史绝不启动Provider或再次投递。16MiB会话内恢复材料、128详细成功receipt、FIFO expired/seenAttempt保留、dispose/重启失效，均需客户具体批准。只补可证明完整已知尾段/index，损坏、外来后续或材料失效拒补，不修猜旧日志。

C文本政策补充1把modelPromptText与displayInputText分开：原文/图片仍原样给SDK；新增C ANS user/typed text/summary、IPC及补存只用先净化安全副本（正文16KiB/summary1KiB，连flags和provenance每记录1MiB）。RuntimeInputTextProjection标modelInputRecorded:false与真实净化/截断，UI称“交接内容（安全显示副本）”，不称完整模型原文；rawTaskHandback/modeltext只内部，不做安全字段侧车。投影失败TEXT_PROJECTION_FAILED，Provider0且不rawfallback/自动重发。普通chat、既有ANS/native不改变，不宣称整份日志全无秘密。

## P5–P7及恢复动作的UI范围

P5用实际历史/实质转录而非chat-empty DOM判断，不让loading制造“以上为历史”；当前上下文放固定区域，保真实不同重开/恢复/失败，不加generation或假用nativeSessionId/profileRevision。P6记录实际invoker，消失才用稳定后备，设置保存不清草稿或把已有会话退ready。P7按request.kind区分待选择/待确认，pending与正式queue独立，不把choice变写许可，不默认代选，原卡定位/决定/失效保持。

保存动作只更新原ID同卡，不新增完成成果；query不保存/不prompt，expired不给假按钮。UX短评已明确source保存后可能首次续投与target仅补存不同，按钮消失后回同卡安全焦点。本次客户需确认这些具体状态动作，而非假定原型已经实现。

## 精确实施范围与治理先行

各链接canonical内的精确源码/测试write set是范围上限；没有其它全仓清理、包升级、自动重试或新业务选装。

| 原固定角色 | 精确必要源码范围；测试范围以该角色canonical为准 |
| --- | --- |
| Core | model/runtime.ts，service/runtime/session.ts，provider/runtime/tools.ts、session-store.ts；新增自有common/runtime-core/tool-display.ts、report-provenance.ts。自有工具/投影/legacy/报告/store/session/ACK行为测试 |
| 编排 | src/common/编排/handback.ts，pipeline/orchestration/run-role.ts、govern-session.ts；原列8个编排测试，含报告consumer新用例与writeEvidence行为 |
| Pi | common/pi-adapter/real-adapter.ts，必要私有tool-event-facts.ts，必要provider/pi/session.ts只作显式类型转出；自有4项测试候选 |
| Codex | provider/codex/session.ts；session.test.ts及必要fixtures.ts |
| Claude | provider/claude/session.ts；session.test.ts及必要受控native-loopback.probe.ts |
| Window A/C | app/desktop/session.ts、runtime-history.ts、session-history.ts、interface.ts、request-anchor.ts；main/preload的5受限方法及2通知接线，自有canonical列明测试 |
| Window B（先治理） | 下列8新Model/lowerlayer文件与1测试；现main/preload/interface/project接线及已列测试 |
| UI | app/renderer/index.html、styles.css、renderer.js、tool-rows.js、runtime-ui.js、role-status.js；tool-rows/runtime-ui/renderer/markdown/e2e五测试 |
| 测试 | 独立A/B/C合同与实际Electron验收，在测试角色白名单内；当前仅验收设计，不把计划当通过 |

B的精确新增8文件：src/model/project-document.ts；src/pipeline/project-document/read-project-document.ts；src/service/project-document/abstract/document-reader.ts、public/read-project-document.ts、impl/read-project-document.ts；src/provider/project-document/abstract/file-reader.ts、public/file-reader.ts、impl/file-reader.ts。新增测试仅test/桌面应用/project-document.test.ts。

**当前Window没有上述新层写权。** 推荐客户本次一次明确批准“先由独立Governance核无重叠所有权，更新Window职责/functional-description/必读资料、boundary.yaml及boundary.md中8+1逐文件范围和B Model唯一主属，再由原固定属主实施”。不新建角色、不授权整个src/common；若治理发现实际归属冲突或需改变本范围，退PM修订，不能自行扩权。同版获此具体批准后不再为相同依赖重复请求许可。本轮未改治理文件。

## 执行依赖、验收和当前限制

本次客户确认后建议顺序：Governance精确B前置与Core A/C公开基础可按依赖分别准备；治理未完成不写B新文件。Core先实现/验证A与C重叠写集；三适配器和编排接线，各自静态/行为通过后Window B与A/C、UI消费，再由root独立跨角色和真实Electron回归。改依赖后调用方重测，不沿用旧证据。不要复刻投影器、旧parser、私有类型或从文本反解事实。

root验收框架已明确预算独立oracle、真实调用次数、假凭据旁路、文件竞态/错误/无写副作用、ACK/持久/Provider边界、失败保存恢复与唯一入队、旧数据降级以及原selector/config/dup/merge/队列/图片/IME/卡DOM/阅读保护。线上Pi可实际验证；Codex/Claude缺凭据时明确受控与在线未测，屏读/平台安全必须按实际覆盖记录。**当前没有新接口测试通过或部署声明。**

## 一次客户审批简报

建议确认A4、B2、C2.tp1及本总方案revision2，批准上述精确Governance先行→owner实现→独立验收范围，并明确接受：A有界展示/有限敏感保护与legacy最近后缀；B可信本地macOS/Linux、Windows拒读、重启原生重选、md/txt256KiB及非恶意writer隔离保证；P3来源角色列表显选多一步；C保存失败门控、可能已启动后不自动重模型、16MiB/128会话内仅保存恢复与非事务限制。没有隐性选装。

若不接受某项实质取舍，保留已确认UX方向并只修相应接口方案；不把沉默、原型可点击、设计回签或本推荐当实施许可。确认前继续只读设计，生产与权限保持现状。
