---
id: claude-tool-display-ac-assessment
type: design
revision: 2
status: draft
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
---

# Claude 工具详情与报告元数据接入评估 r2

固定角色 Claude适配器；已加载 boundary.yaml Section 1 为唯一写入白名单。本轮仅设计，未实施、未测试、未部署，不代表客户已授权代码实施。相关[当前功能](../feature/claude-session.md)。评审输入为 Core [A/r3](../../../运行时核心/docs/design/2026-10-15_design_tool-display-contract-a.md)、[C/r2](../../../运行时核心/docs/design/2026-10-15_design_report-provenance-contract-c.md)及[PM接口计划](../../../项目管理/docs/design/2026-10-15_design_complete-flow-interface-plan.md)。本次完整重读A/r3、C/r2，并重核实际session事件、profile、hook和SDK输入路径。结论为 **recommend approval（限定Claude接入影响），r1提出的合同阻塞已闭合，无新增Claude设计阻塞**。这是同版设计回签，不是实现通过或客户实施授权；公共预算/内容政策/保存策略仍由PM提交客户确认。本文件不复制公共schema。

例如 read_file 返回 ENOENT 时，用户应能查看实际请求路径和真实失败消息；SDK仍收到原来的工具文本。成功、拒绝、失败和中止事实只取实际调用，不根据输出文字猜状态。

## 真实源码映射与所需改动

依据 `src/provider/claude/session.ts`：44–57捕获环境及redact，81–84发事件，155–188注册实际MCP handler，212–224处理PreToolUse，270–291构造原始turn与SDK输入。现 `test/claude-adapter/session.test.ts` 包含真实MCP注册、shell拒绝、异常、跨轮nonce、标记净化、图片和Core持久集成测试；本轮只读，未重跑。

| 事实 | 拟接入与缺席语义 |
| --- | --- |
| start | handler剥离 `__ans_call_context` 后的 publicArgs 是实际传给 ANS handler 的args。仅交Core投影器，不在公开detail复制args。run_shell.command及read/write/edit.path由公共同源目标选择规则取值，不能携带正文、nonce或整个hook对象。 |
| call/turn | 有效context的原Turn.id、原native tool_use_id组成既有toolCallId；顶层actualturn保持原Turn.id。sdkUuid/native prompt_id均不是公共turn。 |
| result | 直接交真实ToolResult.ok/message及新增可选execution；执行结构只来自Core handler返回。Claude没有独立的native工具stdout/stderr/exit事实，不从MCP文本或message反解析。返回SDK的content仍是既有redact(result.message)，isError仍为!ok。 |
| thrown error | 当前catch丢弃异常且向SDK回通用失败文案。拟仅对展示捕获Error.message，交统一投影保护；未知对象不String/JSON展开，不透传stack/cause。SDK通用失败文案原样保持。 |
| blocked | 只有真实PreToolUse deny且确实能证明原Turn时才发phase=blocked，不能为每个result.ok=false增造blocked。现拒绝分支借active，不能沿用此方式把旧未知hook贴到新turn；无真实原始关联只可无业务结论诊断/不发关联工具行。不得制造缺失hook。 |
| aborted | signal中止或closed后现handler丢结果，不补completed/failed或虚构exit。settled仍是唯一真实aborted/timed_out终态。队列中尚未执行的handler不发start。 |

预期路径为真实MCP事实 → 注入projectToolEvent(source, redact) → 原身份事件队列 → Core actualturn归一及最终防线 → 保存/窗口。Provider只引用Model公共类型和注入能力，禁止导入Core私有common或复制其预算、敏感格式与summary构造。不能把投影错误改成治理失败；展示诊断不能改变ToolResult或turn outcome。

## 净化、兼容及明确待修点

1. 当前emit只净化summary，detail不净化；增加display/error/process/compat字段若仍直发会绕过旧保护。所有工具展示字符串、summary和别名必须经注入投影器与adapter profile redactor。现profile快照替换已知凭据、清除内部wire标记、Bearer及URL userinfo；Core随后统一处理query/fragment、quoted敏感赋值和UTF-8预算。保留内部marker去除，不能用新净化替换现有SDK消息的净化行为。
2. redact仅允许处理允许展示的字符串，不能遍历改写runtime/roleId/turnId/toolCallId/toolName/phase等metadata。假凭据碰巧等于身份片段也不能让redactor改身份；身份过长交公共typed diagnostic，不截断或造拒绝。不承诺任意未知位置参数/自然语言秘密全能识别。
3. A/r3已提供完整RuntimeToolEventSource union、error/result.execution、native text/unsupported fallback及结果优先级；无需Claude自建同名类型。Claude正常路径只提供handler-start/handler-result，不虚构native-result；直接使用真实handler result.ok/message/execution，throw用实际error事实。仅公共确有native事实时才采用native.isError优先级，不能从SDK text反推native状态。原r1 schema阻塞已闭合。
4. A/r3以toolDisplayMode:'required-v1'固定生产协议，projectToolEvent/registerToolDisplayProfile缺失或非函数时0 SDK load/query/MCP效果早拒；Core factory另行断言。Claude在bind阶段用构造时同一env快照登记实际credentialName及Core明确toolDisplayCredentialEnvNames的选中键值；不得传整个env、不得发事件/日志，不以当前process.env重新取值。同profile幂等、绑定后不同profile拒绝要求新session。无mode/legacy-standalone保旧夹具语义；不能用currentTurnId或tools启发式推生产模式。此项仅新增展示登记，不使SDK提前加载，不扩大权限。r1生产漏接阻塞已闭合。
5. A/r3给ToolDefinition.displayInputRule并要求Core同源解析；Claude原样传tool.displayInputRule与publicArgs，缺rule不按同名工具猜路径。规则内path非string不回退、空command不回退等由Core统一处理，适配器不复制其算法。原r1目标选择精确性问题已闭合。
6. A/r3明确metadata不scrub、已投影对象直接薄出口入queue，不能再次经当前emit(summary:redact)处理。旧未知hook只走origin:diagnostic/CALL_CONTEXT_UNATTRIBUTED，不带active/call/phase/ok；有真实originalTurn且未被现有stale/stop规则抑制时才发真实blocked。原r1旧hook误关联与身份改写问题已闭合；现源码尚未修，属于后续实现必需工作，不是假称已验证。
7. C/r2新inputProvenance/inputPresentation/onDeliveryProgress由Core在Provider prompt前剥离；Claude当前只读取images并显式构造wire，不展开promptOptions，这点应保留。Claude不新增报告store、不实现Core persistence闭包、不将typed报告或观察回调塞进SDK options/message。disabled及legacy live兼容由Core/编排负责，不能据Claude native目录判断持久模式。完整C/r2已明确最终receipt持久来源与Window唯一enqueue owner，对Claude无新增生产能力要求；该跨角色行为最终由其owner和独立测试回签。

A预算、未知秘密政策、超长身份诊断及C保存失败策略均需PM汇总客户具体确认；本评估只接受其可落实的技术方向。B受限文档读取没有Claude适配器写集或新能力，报告evidence不会因此赋予工具读权。

## 未来精确写集及验证

本轮实际写集只有本文件。未来必要生产写集仅 `src/provider/claude/session.ts`；测试 `test/claude-adapter/session.test.ts`；原生受控回环如需扩展为 `test/claude-adapter/native-loopback.probe.ts`。资料为本角色 `api-spec.md`、`memo.md`、`changelog.md`、`docs/feature/claude-session.md`及自身design/change/fix记录。均落现边界；不修改Model、Core、装配依赖、其他adapter或桌面文件。无新增可选硬化项目。

前置：本r2已对A/r3+C/r2完成Claude范围同版回签 → PM整体验收方案审核/客户授权具体方案实施 → Core实现与测试 → Claude接线验证 → 跨角色独立验收。公共类型或策略再发生实质变动时需复核受影响内容，不沿用旧通过报告。

计划命令：`node --test test/claude-adapter/session.test.ts`、`npx tsc --noEmit`。受控真实bundled CLI回环命令 `node test/claude-adapter/native-loopback.probe.ts` 仅按其假凭据本地loopback前提运行；不是在线模型测试。本轮这些命令均未运行。

必要回归：真实MCP start目标与result/execution、失败Error与unknown、无重复blocked、旧hook不借新turn、signal/stop/late callback不冒出成功；nonce及正文不进display、各展示旁路假secret净化、metadata恰等secret仍不改身份、投影throw只诊断；生产缺projector或register各自0 SDK load/0 query/0效果、绑定登记实际自定义键与同快照值、不同profile拒绝、profile未ready只诊断、standalone保兼容；真实Core→Claude SDK转录用sentinel断言C三个新增options以及execution不入SDK，原文本/图片引用及MCP content逐字等于接线前行为。UTF-8/总JSON预算oracle由Core和独立测试验证，适配器不复制算法。既有20/20历史结果不能当这些未来测试证据。

受控在线真实模型/账户、用户桌面与最终完整flow本轮均未测，也未读取秘密。后续在线证据不能由离线MCP或loopback替代。


## r2同版回签记录

A/r3已闭合r1的精确source、实际输入选择、required生产注入、profile内存登记、身份不净化及未知hook误关联问题；接受C/r2的Core先剥离SDK外元数据与原文保持约束。没有新增Claude写集、依赖包或可选硬化。未来精确生产/测试/资料写集仍为上节所列路径，本轮实际只修改本文件。现源码仍是接线前实现，所有必要回归、受控loopback和在线测试都未运行；本回签不证明实现行为。

## r2补充回签：A/r4 与 C/r2 text_policy_revision:1

本次实际读取A/r4新增legacy桥完整尾段及C/r2文本政策补充1，接受其在Claude接入范围的增量设计，无新增Claude阻点。A/r4保持已签A/r3的Source、required/profile、身份及hook规则不变；新增legacy user-text/assistant-text/tool-record由Window转换事实、经Pipeline到Service纯保护，连续后缀1MiB/4096条预算与Window原规范键hash anchor不要求Claude增加读取、投影或身份转换。其runtime:'pi'值契约不扩为Claude native历史；真实toolCallId/turn仍不hash、不净化。桥不授新读权，最终合法接线和预算验收由对应owner及测试负责。

接受C/r2 text_policy_revision:1将新可信C交接的modelPromptText与displayInputText分开：Claude inner.prompt继续逐字收到原模型文本、原图片引用，现native引擎记录语义保持；Core只向本次新C的ANS user/typed输入/summary、IPC及补存材料写安全显示副本与真实flags。inputSaved仅表示该安全记录已保存；投影失败Provider前TEXT_PROJECTION_FAILED，不回退raw、不由Claude伪造工具失败。此policy不修改普通无C metadata chat、既有ANS或native日志。SDK前剥离inputProvenance/inputPresentation/onDeliveryProgress的字段名及职责不变，现有sentinel/逐字转录回归继续适用，不能用安全副本重新生成模型输入。

精确scope不扩：未来生产仅 `src/provider/claude/session.ts`，测试仅 `test/claude-adapter/session.test.ts`，如需真实受控回环扩展仅 `test/claude-adapter/native-loopback.probe.ts`，本角色资料路径仍按上节。本轮只在本canonical revision2末追加回签；未实现、未测试、未部署，未跑模型或桌面。推荐批准仍限Claude影响评估，不替其他属主或客户决定预算、内容政策与实施授权。
