# 三项接口方案的独立验收要求

日期：2026-10-15。固定测试角色 root。状态：已独立核对 A/r4、B/r2、C/r2 的具体合同与可测性，最终客户批准以 PM 汇总中的同版范围为准。本轮只设计，没有实现接口或执行新行为测试。

用户已确认 UIUX v2 P1–P7 交互方向，并要求相关角色补齐三项接口实施方案、评审后再确认。本记录约束后续如何证明接口及桌面改进成立，不能把原型演示、旧重复修复测试或下列测试计划当作已通过。

## A：可显示的工具详情

源端真实工具输入/返回→适配器→Core事件及回放→窗口映射→UI展开必须用同一事实。针对每个最终采用的字段、UTF-8与总量预算、敏感内容规则，测试必须给明确期望，不仅做对象形状快照。

- read_file成功/ENOENT；shell退出0、非0、spawn错误、signal、中止、审核拒绝分别保真。未启动不得造exit，未知/缺字段不是空输出或exit0。
- command/path来自实际输入，stdout/stderr/exit来自真实结构，不用本地化message正则提取。write/edit正文、确认preview、图片与内部上下文不意外进入诊断。
- 空文本、中文/emoji、多字节预算边界、单超大chunk、各字段合计超预算；精确截断标志、展示长度与实际字节相符。展示预算不暗改给模型的既有工具返回语义。
- 使用虚构凭据验证进入replay/IPC前保护；检查detail、summary及错误旁路，不只检查新display字段。不能声称有限已知值替换能识别所有未知秘密。
- Pi/Codex/Claude/demo受控同场景；在线Pi真实运行额外核对命令/失败/输出。其它引擎若缺配置，分别标受控通过与在线未测。
- 同turn不同call、同文不同call、跨turn、blocked与失败result、晚结果、无身份旧数据均按现合同保留；刷新历史与实时一致，不能按文字相同合并或重写旧日志。

## B：受限项目文档只读阅读

主进程必须证明所读的是当前项目的已允许文档，不是渲染进程提供任意路径即读。正式方案应给输入范围、错误码、文件清单来源、格式/体积上限及平台竞态策略，测试逐条核对。

- 已列文件可读；目录、无权限、不存在、过大、二进制、无效编码、非允许扩展名分别返回确定结果；失败不改变报告卡、草稿或聊天位置。
- 绝对路径、`..`、混合分隔符、符号链接外逃、项目/角色范围混淆、`.env`或其它未列秘密、任意URL/HTML脚本均拒绝或按明确静态文本规则处理。
- 受控替换文件/父目录竞态验证已选择的文件句柄策略；确无可跨平台保证的场景如实记录限制，不能以一次realpath检查等同所有竞态已防住。
- 请求发出后切项目/角色/引擎、关抽屉、打开另一报告，迟到返回不得覆盖新范围；请求ID只是关联，不授予路径权限。
- 阅读前后项目文件哈希与mtime不变；资料文件数不把目录计入；返回角色资料/关闭回实际入口，原入口消失才采用稳定后备焦点。

## C：报告来源与接收记录

源报告身份、目标投递尝试和实际目标turn分别验证；typed来源来自可信编排，不由renderer、用户前缀或模型正文自行声明。

- 合法submit_report、任务兜底unreported/blocked/failed/aborted、普通聊天无报告、普通聊天主动报告分别符合原语义；completed不是独立验收通过。
- 源scope与目标scope重开后报告内容/成员身份一致；单份、批次、屏障、同文不同turn、runtime隔离及未知taskId正确；原模型指令逐字保留，UI元数据不进入SDK模型输入。
- 源记录成功/失败、目标用户记录失败、Provider未启动、事件记录失败、部分写入/损坏行、目标处理失败后重试，逐一检查实际调用次数、保存状态、报告键与目标turn。
- 当前Core的onTurnStarted在user append之前，ACK仅证明turn已创建。append失败且inner.prompt未调用必须区别于模型已处理，不拿ACK当持久或投递完成。
- 当前appendReplay只做串行appendFile，不是源/目标跨文件事务；方案必须明确失败策略。测试不擅自断言跨进程exactly-once、崩溃后队列恢复或未设计的事务保证。
- 缺字段、未知版本、旧纯文字报告诚实降级；不前缀升级、不补taskId、不自动重写JSONL。evidence只是证据文字，不授予B的文件读取能力。

## 桌面与既有流程保持

后续集成必须回归已验收的导入前禁选、三引擎缺配及设置、实际invoker回焦、非空草稿保护、普通选择未默认作答、权限确认原决定链、独立pending/queue、入队/撤回/停止收尾、图片/IME、阅读位置、不同项目/角色/引擎隔离及重复事件。UIUX原型本地能演示不替代真实Electron验收。

实施后证据应记录：确切源码哈希/版本、OS/Node/引擎、输入、真实结果、退出码、失败日志及未覆盖项。先跑属主测试，再做独立跨角色与真实桌面流程；仅新增文档时不运行不存在接口的“通过测试”。

## 具体版本独立审查

实际阅读了 [A/r4](../../../运行时核心/docs/design/2026-10-15_design_tool-display-contract-a.md)、[B/r2](../../../桌面窗口/docs/design/2026-10-15_design_restricted-document-read.md)、[C/r2](../../../运行时核心/docs/design/2026-10-15_design_report-provenance-contract-c.md)，以及 Window A/C r3、编排消费 r2 和 UI 消费方案。不是由角色报告代替阅读具体类型和失败策略。

| 接口 | 评审中返回的必要修订 | 当前合同与后续明确断言 |
| --- | --- | --- |
| A | 不制造 synthetic denied；legacy 不跳层调用Service；中立source、必需注入、实际凭据来源具体化；旧锚点不能含raw title侧车 | 16KiB文本段、4KiB目标/错误、56KiB display、64KiB新工具事件；先净化后按UTF-8及JSON总量限制。超身份只投影诊断，无新业务结论。生产required-v1缺注入应在SDK/工具零副作用时失败。legacy桥走Pipeline→Service纯操作，旧parser/读取面保留，身份不改；最新连续后缀最多1MiB/4096条，文本16KiB，省略/非法/原解析跳过计数分别验证；不是底层整文件IO预算 |
| B | 不能以既有Interface directfs作为新能力跳层例外；不能由renderer任意listProject根路径授予阅读scope | 合法Interface→Pipeline→Service→Provider，原生pickProject的主进程grant才可签发引用；只读已列md/txt、262144字节，精确边界/失败/句柄关闭/迟到测试可定义。新增8个Model及下层文件与1测试的职责/边界由独立Governance先落实，本轮未改权限 |
| C | ACK不等于保存或模型调用；真实bound持久能力替代caller布尔；disabled不能阻旧live；必须有可执行的仅保存恢复API和唯一入队owner | 真实capability提供record/retry/query/change；source saved/failed与target inputSaved/providerMayHaveStarted/history分别验证。只有实际最终delivery-receipt才能支持最终重开结论，boundary不当最终回执。Window唯一同步归并先queued后await，Promise/订阅任意顺序enqueue1，Pipeline enqueue0。16MiB恢复材料、128成功详细回执、无timer、FIFO expired、单在途、dispose失效均可独立测试；仅补已知完整尾段/index，partial或外来后续拒修；补保存绝不prompt |

C 增加以下必测：Core实际factory持久化覆盖；source/target disabled无目录且原live回交继续；自定义unknown-live不伪造saved；源保存失败只存储重试且snapshot不重算；最终receipt缺失仍保守不自动重发；重复按钮/状态通知任意顺序不双投；详细receipt淘汰不能让seenAttempt再次执行，ID集满时在新turn前拒绝；16MiB、128的边界用独立计数oracle，不镜像实现。

已进一步读C/r2 `text_policy_revision:1`：新C可信handback的modelPromptText只在内部原样传SDK；新增ANS user、typed-input的text/summary、IPC与历史补存使用同一安全有界副本。测试一方面比较SDK输入原文/图片不变，另一方面只对**本次受保护字段**断言已知假凭据在落盘前、IPC前被处理，不能对含旧记录/opaque身份/SDK native的整个文件宣称无秘密。正文16KiB、summary1KiB，新user/event连同provenance总1MiB；核对modelInputRecorded:false、redacted/truncated/summaryTruncated及UI“安全显示副本，不是完整模型输入”标签。TEXT_PROJECTION_FAILED必须Provider0、retryDeliveryAllowed:false、不rawfallback。普通聊天及旧ANS/native输入保存政策不因本C泛改。

编排还已核对原writeEvidence业务consumer：新display只能在accepted/result/oktrue、已知写工具且display.target.kind=path、完整未redacted/truncated时产生可定位证据。用raw路径诱饵验证隐藏/截断/非法新display不回旧alias或summary绕保护；旧无display事件单列兼容。C源保存重试成功可以首次继续原待投递回交，并非“保存后绝不投递”；目标历史重试只补存，不启动Provider。上述均须计实际工具/prompt与Window入队次数，而非比卡片数量。

P3具体落地入口应按产品/UX与PM最终同版意见：从可信来源角色的当前B引用清单显式选择文档，不解析evidence赋权、不自动选首项、不假称该文件就是报告。测试选文档时不切当前聊天角色/引擎或开会话，返回清单保位置，关闭回来源卡；精确一键报告读取不在此最小版本的能力声明内。

需要客户明确批准的实质范围包括：A展示内容/预算和已知凭据保护限制，legacy展示省略但不改原文件；B可信本地macOS/Linux受测文件系统、Windows及能力不足环境拒读、重启后重新原生选择项目、md/txt256KiB及并发本地恶意写者非严格隔离的限度；C持久失败门控、可能已启动后不自动重prompt、仅会话内有界保存恢复以及源/目标非事务。它们是实施方案的具体选择，不是本角色已经验证的产品保证。

独立结论：当前三份合同已能给出确定的正反例、计数和失败预期，root发现的主要可测性/兼容问题已在上述版本闭合。支持交PM完成同版消费者评审并呈客户确认；不替各属主接受写集，不把设计推荐当实施/测试通过。需要新公共入口或未覆盖写集的地方由PM列精确Governance前置，测试角色不越权修生产或边界。本轮生产app/src/test及配置未改，未运行不存在接口的测试。
