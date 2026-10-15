---
id: runtime-tool-display-contract-a
type: design
title: A 可显示工具详情中立合同
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: draft
revision: 4
related: [complete-flow-core-assessment, uiux-desktop-complete-flow-20261015]
---

# 一次调用能查清目标、结果和失败原因

这是客户已确认 UX v2 P1–P7 方向后的具体接口提案 A/r4，尚待适配器、窗口、UI、PM及客户确认实施。前轮[影响评估](2026-10-15_design_complete-flow-core-assessment.md)不作为本合同批准。本轮仅写本设计，没有改代码或测试，没有运行尚不存在的API。所属[当前功能](../feature/runtime-core.md)。

r3综合Pi/Codex/Claude独立评估后补齐精确source/profile/required合同；此前r2已采纳PM纠正：超长身份只产生无业务结论的typed message投影诊断，不造denied；历史读取沿Service→Pipeline→Window，公开读取签名与当前凭据保护限制明确。配套[C/r2](2026-10-15_design_report-provenance-contract-c.md)采用真实bound-session能力与仅保存恢复，A的纯文本保护供同owner复用。r1/r2同路径旧草稿由本r3取代，仍待adapter/UI/Window独立评审及客户具体确认。

本r3已只读合入三源输入：[Pi评估r1](../../../Pi适配器/docs/design/2026-10-15_design_tool-display-and-report-consumer.md)、[Codex评估r1](../../../Codex适配器/docs/design/2026-10-15_design_tool-display-and-report-consumer.md)、[Claude评估r1](../../../Claude适配器/docs/design/2026-10-15_design_tool-display-ac-assessment.md)。这些是设计输入，不冒称三属主已回签本r3。

## 真实输入与选择

Core ToolResult 当前只有 ok/message；shell 内部有 code/signal/stdout/stderr/error，但公开结果只拼接字符串。Pi 真实start有args、end有native content，当前事件丢command/resultText；Codex start保留args且结果summary有message；Claude start不保args且结果summary有message；demo有call/result。Service持久原event，Window再丢部分字段。因此选一个中立投影器，四个adapter只提供实际事实，通过注入调用；不在四个adapter各复制格式化/限额/脱敏逻辑，不从message反解结构数据。

## schema v1

以下全为候选 TypeScript 公开Model类型，名称与数字以本r3供评审；不是当前API。

```ts
type DisplayTextV1 = {
  text: string;
  truncated: boolean; // 展示预算裁去字符，或源已明确截断
  redacted: boolean;  // 这段文本实际发生替换
};
type ToolDisplayV1 = {
  version: 1;
  target?: { kind: 'path' | 'command'; value: DisplayTextV1 };
  resultText?: DisplayTextV1;
  error?: DisplayTextV1;
  process?: {
    exitCode?: number;
    signal?: string;
    stdout?: DisplayTextV1;
    stderr?: DisplayTextV1;
  };
  durationMs?: number;
  omissions: ('budget' | 'unsupported-input' | 'unsupported-content')[];
};
type ToolEventDetailV1 = {
  toolName: string; toolCallId?: string; turnId?: string;
  phase: 'start' | 'blocked' | 'result';
  ok?: boolean; status?: 'completed' | 'failed'; errorCode?: string;
  display?: ToolDisplayV1;
};
```


### 精确瞬时source与投影输出

以下类型一并发布于Model；原始args/结果只作为函数瞬时入参，不能进入队列/日志/IPC。Native未知对象由adapter在本边界转为unsupported标记，不把对象交给projector猜。

```ts
type ToolDisplayInputRuleV1 = 'core-path-v1' | 'core-command-v1' | 'none';
type RuntimeToolExecutionFactsV1 = {
  exitCode?:number; signal?:string;
  stdout?:string; stderr?:string; error?:string;
  stdoutTruncated?:boolean; stderrTruncated?:boolean;
};
type RuntimeToolResultFactsV1 = {
  ok:boolean; message:string; execution?:RuntimeToolExecutionFactsV1;
};
type RuntimeToolErrorFactsV1 = { message?:string; code?:string };
type RuntimeNativeToolResultFactsV1 = {
  isError:boolean;
  content:readonly ({type:'text';text:string}|{type:'unsupported'})[];
};
type RuntimeToolEventIdentityV1 = {
  toolName:string; toolCallId?:string; turnId?:string;
  runtime?:RuntimeKind; roleId?:string;
};
type RuntimeToolInputFactsV1 = {
  rule?:ToolDisplayInputRuleV1;
  args:Readonly<Record<string,unknown>>;
};
type RuntimeToolEventFactsV1 = RuntimeToolEventIdentityV1 & {
  input?:RuntimeToolInputFactsV1;
  durationMs?:number;
} & (
  | {phase:'start';origin:'native-start'|'handler-start'}
  | {phase:'blocked';origin:'governance-hook';
     result?:{ok:false;message:string};error?:RuntimeToolErrorFactsV1}
  | {phase:'result';origin:'handler-result'|'native-result';
     result?:RuntimeToolResultFactsV1;error?:RuntimeToolErrorFactsV1;
     native?:RuntimeNativeToolResultFactsV1}
);
type RuntimeToolEventSource = RuntimeToolEventFactsV1
  | {origin:'projected-event';event:SessionEvent}
  | {origin:'legacy-event';event:SessionEvent}
  | {origin:'diagnostic';code:'CALL_CONTEXT_UNATTRIBUTED'};
type RuntimeToolDisplayDiagnosticDetailV1 = {
  version:1;source:'tool-display-diagnostic';
  code:'IDENTITY_TOO_LARGE'|'PROJECTION_FAILED'|'RESULT_OUTCOME_UNAVAILABLE'
    |'DISPLAY_PROFILE_NOT_READY'|'CALL_CONTEXT_UNATTRIBUTED';
};
type ProjectedRuntimeToolEventV1 = Omit<SessionEvent,'kind'|'detail'> & (
  | {kind:'tool_call'|'accepted'|'denied';detail:ToolEventDetailV1}
  | {kind:'message';detail:RuntimeToolDisplayDiagnosticDetailV1}
);
type RuntimeToolEventProjector = (
  source:RuntimeToolEventSource,
  redactText?:(text:string)=>string
) => ProjectedRuntimeToolEventV1;
// ToolResult兼容增加 execution?:RuntimeToolExecutionFactsV1。
// ToolDefinition兼容增加 displayInputRule?:ToolDisplayInputRuleV1。
```

origin:diagnostic分支只允许指定固定代码，不接受rawhook对象/原因/身份，由同一投影器生成有界无业务结论消息。source身份来自原始关联：Pi execution_start/end及同call handler捕获值；Codex校验后的original Turn/call；Claude关联context原Turn与tool_use_id；demo自有实际call。没有原Turn的旧/迟到hook不能读取当前active补身份。Claude只有能证明原Turn的真实PreToolUse deny才有blocked；缺关联时用CALL_CONTEXT_UNATTRIBUTED投影诊断（同无业务结论输出形状），不造blocked。Codex没有独立hook，不为handler.ok=false制造blocked：它仍只有真实start/result。Pi真实hook blocked和native end/result都保留。

resultText优先source.result.message；没有handler事实时，仅按native.content中type:text的原顺序以LF拼接，再走统一保护；unsupported不JSON/String展开，任一非文本内容标omissions:unsupported-content。没有任何text则resultText缺席，不造空输出。execution只位于source.result.execution，native content不能供exit/stdout反解；error仅Error.message/已有明确机器码，无stack/cause/未知对象展开。展示error优先source.error.message，再真实execution.error，再实际失败result.message；不把stderr或文字猜成错误码。

result的最终ok/status：native存在时以明确native.isError决定，否则以真实result.ok决定，真实throw且无上述结果则按实际error事实为失败。全部结果事实缺失不能猜accepted或denied，返回RESULT_OUTCOME_UNAVAILABLE诊断。保留handler.message/execution不等于允许已停止迟到结果回到新turn；adapter仍先执行现有stale/stop规则，未公开的迟到结果不因A补发。duration仅显式有限非负实测值，不从排队/turn时间推测。

projected-event分支只接受经运行时验证的version1白名单display/身份；Core最终防线重做预算与净化时truncated/redacted只能OR保留，不重置。legacy-event分支仅消费该原event真实已保存字段，按kind降级，未知version不升级，绝不把summary反解process。两分支不允许unknown/raw detail混入输出。

已有SessionEvent.kind保持：start→tool_call、blocked→denied、result→accepted/denied，实际失败决定ok；缺phase旧消费者继续按既有kind降级。blocked和result各是一个事实，同call不互吞。事件顶层actual turn优先，展示投影器不产生/截断/猜ID，不把native ID替代Core turn。toolName/call/turn缺席时仍可显示独立记录，禁止相邻行或同文配对。

`target`由source.input.rule选择，不按toolName或schema外观猜。Core buildGovernedTools给真实标准handler的ToolDefinition.displayInputRule定格：read/write/edit为core-path-v1，shell为core-command-v1，其它为none；adapter只携带注入tool上的真实rule。自定义同名工具没有声明rule时目标缺席并标unsupported-input。core-path-v1严格等价当前readTargetPath：candidate=args.path ?? args.file_path ?? args.filePath，再判断candidate为string；前项非空但非string时不回退。core-command-v1严格等价readStringArg：依command、cmd选择第一个string（空string也是选中，handler会拒绝空而不回退）。Core自己的helper与实际handler复用同一私有选择原语，保持旧行为；adapter/UI不再复制别名算法。原path未要求normalize，command保留实际获审字符串；不把argv重新拼成另一条命令。九工具均有phase/结果，交互/派发/报告无文件目标就缺席。

`resultText`来自真实ToolResult.message；result.ok=false时 `error`默认用同一个真实message的4KiB预览，不从其文字造机器码。adapter handler确实抛出Error时error取捕获的Error.message（无stack/cause任意对象），没有真实message就缺席并以通用失败summary说明。stderr不等于error，exit非0不伪造ENOENT。

给ToolResult兼容新增可选 `execution?: {exitCode?:number;signal?:string;stdout?:string;stderr?:string;error?:string;stdoutTruncated?:boolean;stderrTruncated?:boolean}`，仅Core shell真实内部outcome填充。未经启动不填exit；signal退出无数字就缺数字；已收集输出未知就缺席，不把unknown填空。此metadata不自动送SDK：四adapter给模型仍只发送原message/ok对应既有content。原返回message、输出收集阈值、argv、审核、停止均不变；本A不修收集器精确1MiB行为。源已明确有截断标志才置true，现收集器丢过数据但不知道长度时不得谎称完整：Core shell在既有丢弃分支只记boolean事实，不改变已收集字节。无准确原始总字节数，不提供originalBytes。

## 推荐预算（待批准的一组具体值）

全部按脱敏后的UTF-8字节计算，截取Unicode码点完整前缀，不保留半个UTF-8/代理字符。不把字符数当字节数。

| 字段 | 推荐上限 |
| --- | --- |
| target.value | 4 KiB |
| resultText / stdout / stderr（各自） | 16 KiB |
| error | 4 KiB |
| 新工具事件summary | 1 KiB |
| display JSON编码整体 | 56 KiB |
| 新工具事件JSON编码整体（含身份、summary、detail） | 64 KiB |

理由：目标和首错误便于首屏核对，16KiB足以读典型ENOENT/测试末端诊断；两流与resultText不无界叠加，64KiB使replay/IPC/DOM有明确单事件上界。这里是统一推荐，未获客户批准，不按本提案提前限流。

处理顺序固定：取得实际允许的展示字符串→adapter存在时的既有profile净化（Pi当前无此函数，可缺席）→下述统一脱敏→字段UTF-8上限→JSON整体上限检查。JSON转义也计入总预算；超整体时按 stdout、stderr、resultText、error、target 顺序收缩剩余文本，以保目标/原因优先；每次截断置对应truncated=true并记omissions:budget，不用“未保存”掩盖截断。必要时该字段保空text但仍有truncated。最后重算编码大小。身份/enumeration不截断，若单是既有身份元数据就超64KiB，省display仍不能容纳，发有界 `kind:message`、detail `{source:"tool-display-diagnostic",version:1,code:"IDENTITY_TOO_LARGE"}` 的投影诊断；不带虚构call/ok/status/phase，不产生synthetic denied、不改原工具结果或turn outcome，handback不得将此消息当真实拒绝。完整事实仍仅在原运行路径返回模型，展示记录明确无法在预算内关联。消费者及测试须确认这个异常分支。

新工具event.summary统一由投影后的目标/真实结果短预览构造，不再旁路放raw result.message；未知错误走相同脱敏预算。原detail.args/call.args/result/native content不复制进新事件，旧path/command兼容别名若保留也只能从已净化target派生且计预算。治理denied的真实路径可显示，raw错误栈、全部env、SDK对象绝不进入。非工具事件不借本A整体重写；C自己的report内容按C约定处理。

## 精确敏感内容规则 v1（推荐，待批准）

1. 每个提供方绑定时捕获 `RUNTIME_CREDENTIAL_ENV_VARS`、实际apiKeyEnvVar及Core extraCredentialEnvVars对应的非空值，去重后按长度降序、逐字大小写敏感替换为 `[REDACTED]`。值只留内存闭包，不写env/名单值到日志或事件。Codex/Claude调用投影器时可传现有profile redactor，仅处理允许展示字符串；Pi没有现成redactor，不声称已有、也不复制净化器。实际解析profile所选apiKeyEnvVar及当次env的值经下述纯内存register回调补入Core闭包，Core再以已捕获值统一替换。
2. 不保留任意args。仅target的path/command、结果文本、异常message和上述结构process字段可进入；write/edit文件正文、old/new、确认preview、choice选项全文、图片、内部context参数不进入诊断。不因“展开”而再读任何文件。
3. 对每个允许字符串，大小写不敏感识别 Bearer 后连续非空白串；`api_key/api-key/apikey/access_token/auth_token/oauth_token/password/secret/authorization/cookie` 后以 `:`或`=`或命令选项空白赋的值，值支持完整成对单/双引号或连续非空白/逗号/分号串，保留键只替值；缺闭引号且已出现敏感键时隐藏该字段剩余值。识别HTTP(S) URL时去user/password、query与fragment，解析失败的URL token替为 `[URL]`。不把“含token一词”的普通内容全文删掉。
4. 去除 `[ANS_INPUT_CONTEXT:<UUID>]` 专用内部标识及紧随换行；非内部UUID不删除。原私有context参数在步骤2根本不投影。控制符除tab/LF/CR外替为可见替代字符，UI仍用文本/安全Markdown，禁止HTML执行。
5. 原值替换和完整token识别都先于截断，防secret被截半后无法识别。summary/error/target/process与compat别名使用同一函数；Core pump对未经过该注入投影器的legacy工具事件也走此allowlist，不让raw旧summary/detail绕过replay或IPC。

规则保护当前已知凭据和明确敏感格式，不能识别所有未知任意文件秘密；未知位置参数/自然语言秘密不承诺通用DLP。r3推荐仍允许经过规则的真实工具输出供当前项目操作者展开，必须由客户确认这一具体内容政策。不能写“所有输出已安全”来替代限制。

## 公开能力与接线归属

Model导出上节精确source/projector类型，RuntimeProviderOptions兼容增加以下字段（不是新SDK选项）：

```ts
type RuntimeToolDisplayProfileV1 = {
  apiKeyEnvVar?:string;
  credentials:readonly {name:string;value?:string}[];
};
type RegisterRuntimeToolDisplayProfileV1 = (profile:RuntimeToolDisplayProfileV1)=>void;
// RuntimeProviderOptions新增：
// toolDisplayMode?: 'required-v1'|'legacy-standalone';
// projectToolEvent?:RuntimeToolEventProjector;
// registerToolDisplayProfile?:RegisterRuntimeToolDisplayProfileV1;
// toolDisplayCredentialEnvNames?:readonly string[];
```

Core composition无条件写固定toolDisplayMode:'required-v1'并注入projector/register，名字数组只含本轮公共已知名单、opts实际apiKeyEnvVar与extraCredentialEnvVars。不得由renderer、模型args、tools是否存在或currentTurnId是否存在推断该标志。Core先捕获当次process.env中上述明确键的非空值；adapter解析实际cfg之后，在SDK加载/原生query或任何工具效果前调用register：只将实际apiKeyEnvVar及toolDisplayCredentialEnvNames在自己同一次profile env快照中选中的键/值传入，**不传整个env、不写这些值到日志**。默认Pi cfg.apiKeyEnvVar或显式config override都以这次解析结果为准；Codex/Claude亦用各自实际选中profile。Core只接受实际apiKeyEnvVar或自身给出的toolDisplayCredentialEnvNames所列键的登记值，空值不登记；追加捕获，纯内存闭包不向adapter返还凭据，不依赖Pi私有resolver。demo用空credentials登记，Core已捕获额外值仍有效。

required-v1下缺projector/register或非函数，adapter在SDK load/query/MCP效果之前明确拒绝构造；Core在调用factory前也断言其自己生成的必需选项。实际profile必须在bind阶段登记，Core完成bind后核对已登记才允许首prompt；同一profile重复登记幂等，已绑定后不同profile拒绝并要求新session，不偷偷重绑活跃工具。投影被异常提前调用且profile未ready仅产生DISPLAY_PROFILE_NOT_READY诊断，绝不发raw。配置/登记失败是构造错误，不伪装成某次工具denied。

standalone/direct helper明确legacy-standalone或省略mode时兼容原事件语义，可以无projector/register且无A安全保证；若显式声明required-v1就必须满足同样早拒。生产是否required由Core固定契约，不以启发式猜测或optional字段静默绕过。测试需证明Core工厂始终required、每adapter缺注入0 SDK/0效果、standalone原夹具仍可用。自定义providerFactory也是可信内部实现，若不实现required协议只能明确unsupported，不能把它冒作A已接线。

Core Service构造并注入唯一纯投影器，实现在Core私有 `src/common/runtime-core/tool-display.ts`；adapter只调用注入函数，不导Core私有common，也不导其他Provider。redactText是adapter内存profile纯函数，不能由模型args指定。runtime/roleId/turnId/toolCallId/toolName/phase与schema枚举是身份/机器事实，不传给redactText或文本净化器，不遍历scrub，不截断改写。Codex旧emit递归scrub、Claude旧summary净化不能套在已投影对象上：采用直接queue的薄出口且不再补rawsummary/detail。敏感值恰好等于身份片段的测试必须保原ID，不能为了字符串隐藏而破坏身份；这也属于A非通用DLP边界。无resource/网络/文件副作用，不形成新读权。若profile redactor或统一投影发生异常，隐藏该字段并产生有界typed projection diagnostic，不回退raw文本、不把投影错误造为工具denied或改实际outcome。

Pi/Codex/Claude：真实start/hook拒绝/result提供原捕获call及事实，投影发生在公开emit前；各自既有给模型content保持。结果outcome/phase只按上面的真实映射，Codex不额外制造blocked、Claude未知hook不借active。Core pump在actualturn归一后再走同一投影规则作为最终replay/IPC防线，已经投影的display需支持幂等（truncated/redacted只能保持true不能重置）；demo亦走该流程。store仅存净化后的事件，不在readReplay时重写旧文件。

旧历史没有display的，由现有Service历史读取入口在返回前对当时真的保留过的path/args.command/result.message/summary应用相同投影保护，再经既有Pipeline `readRoleSessionHistory` 到Window；Interface不直调Service，不导私有common。没有数据写未保存；不得从summary反解stdout/exit或补原文。旧native自动补读不在A范围，旧JSONL不改写。未知display.version整体当未知，仍显示净化短summary。

## 精确候选写集与前置

Core：`src/model/runtime.ts`（本文精确source/projector/profile/required/rule及execution类型）、`src/service/runtime/session.ts`（固定required装配/凭据闭包/登记断言/最终防线/历史公开保护）、`src/provider/runtime/tools.ts`（真实execution、截断事实及displayInputRule）、新增 `src/common/runtime-core/tool-display.ts`；`test/runtime-core/tool-display.test.ts`、`tools.test.ts`、`session.test.ts`；本角色api-spec/feature/memo/changelog和本设计/后续证据。现边界覆盖，schema命令执行说明无需重改，收集器策略与门禁不在写集。

Pi/Codex/Claude各自session/真实adapter及测试；Window runtime-history/session-history和回放接线；UI tool-rows/runtime-ui/renderer及展示测试。精确peer文件由各原属主独立填写，Core不替其授权。历史公共签名明确为 `readRuntimeSessionHistory({projectRoot,roleId,runtime,credentialEnvNames?:readonly string[]}):Promise<{record?:RuntimeSessionRecord;entries:RuntimeReplayEntry[]}>`（C兼容增加reports/reportErrors）；Pipeline的readRoleSessionHistory同scope入口可在自己已有运行时配置中取得该runtime实际apiKeyEnvVar/extra名称，并只向Service传可信键名，不由renderer提供任意env键。Service读取时捕获当前process.env中公共已知名单+这些明确名称的值，只作内存净化，不构造provider、不加载SDK、不读取原生历史或建目录。若Pipeline现读取路径没有实际profile，传缺省并诚实限定为公共已知当前值与模式保护；不能为补旧secret触碰.env。旧日志secret已轮换或不在当前可用值中时无法恢复其值进行匹配，模式过滤也不保证全DLP；UI须按这个保护范围表述，不称历史全面脱敏。legacy Pi JSONL fallback按文末r4保原Window reader/parser，只把中立产物经Pipeline→Service纯保护再返回，不能让Window直调Service或裸发raw。旧缺注入替身可保原降级，但生产必须注入，不能拿optional作漏接理由。

验证严格采用[三接口独立验收A](../../../测试/docs/design/2026-10-15_three-interface-verification-plan.md)：真实read成功/ENOENT，shell exit0/非0/spawn/signal/中止/审核拒绝，中文emoji与单超大chunk、各字段及JSON编码总预算，假secret穿summary/detail/error及重放/IPC、四源同事实、旧未知版本/缺身份与blocked/result并存。新增同源别名边界（path非string不回退、空command不回退）、custom同名无rule、native text/unsupported/empty、结果状态优先级、required缺注入0 SDK/0效果、Pi真实cfg键登记无自身redactor、三adapter身份含假secret仍保持原ID、Claude无原context只诊断，均用具体独立事实验证。每个new数值要有独立UTF-8 oracle，不镜像实现；原message/模型SDK content逐字与本A前一致。按Core→adapter→Window/UI→独立真实桌面依赖顺序重测；本设计没有测试通过声明。

客户实质待决项明确为：本r3整组UTF-8预算/总量优先级；已知值+格式规则后仍允许当前项目工具输出展开的内容政策与未知秘密限制；超长身份只发无业务结论投影诊断；当前凭据无法恢复旧secret的历史保护限制。请先评审这些项与注入能力，再冻结A/r3交客户确认。C仅复用纯文本净化/限额能力，使用不同schema与身份，不向工具详情里塞报告。

## r4：保留 native-only Pi 历史的纯保护桥

本节是r4唯一接口增量；r3的RuntimeToolEventSource/projector/required/profile/rule定义、现工具预算及给模型语义保持原样。采用[Window AC/r3](../../../桌面窗口/docs/design/2026-10-15_design_complete-flow-ac-consumers.md)的真实parser事实，不以禁读legacy为默认收尾，不迁parser、不复制SDK/Window私有类型。

链路固定：Window按当前既有目录/最新文件规则读取和解析 → 把必要产物转为以下Model中立值 → Interface调用Pipeline公开纯包装 → Service纯保护 → Window映回现ReplayRow → IPC。现reader整文件readFile/split无字节/行数上限，本r4只限制**返回投影**，不声称修复底层IO内存或增加读取面。Service不接文件路径、不读FS、不建Provider/store、不加载SDK；projectRoot只在Pipeline/Window原scope绑定层使用。

### Model中立输入与输出（schema 1）

```ts
type LegacyAnchorTokenV1 = {
  token:string; position:'request'|'conclusion';
  nativeCallId?:string;
};
type RuntimeLegacyToolFactsV1 = {
  toolName:string;
  phase:'start'|'result';
  toolCallId?:string;
  turnId?:string; // 只保当时实际details.turnId；不假装新Core ACK
  ok?:boolean;
  reportedStatus?:'completed'|'returned'|'failed'|'unknown';
  statusSource?:'native-result'|'tool-details'|'legacy-classifier';
  target?:{
    kind:'path'|'command';value:string;
    source:'argument'|'tool-detail'|'same-call';
  };
};
type RuntimeLegacyHistoryEntryV1 = {
  at?:string;
  anchor?:LegacyAnchorTokenV1;
} & (
  | {kind:'user-text'|'assistant-text';text:string}
  | {kind:'tool-record';text:string;tool:RuntimeLegacyToolFactsV1}
);
type RuntimeLegacyHistoryProjectionInputV1 = {
  scope:{roleId:string;runtime:'pi'};
  readOk:boolean;
  entries:readonly RuntimeLegacyHistoryEntryV1[];
  source?:string; // 原reader选中的文件名，仅显示值，不是读指令
  error?:string;
  skipped:number;
  credentialEnvNames?:readonly string[];
};
type RuntimeProtectedLegacyToolFactsV1 = Omit<RuntimeLegacyToolFactsV1,'target'> & {
  target?:{
    kind:'path'|'command';value:DisplayTextV1;
    source:'argument'|'tool-detail'|'same-call';
  };
  display?:ToolDisplayV1;
};
type RuntimeProtectedLegacyHistoryEntryV1 = {
  at?:string;anchor?:LegacyAnchorTokenV1;
  metadataOmissions:readonly ('timestamp'|'anchor-token'|'oversize-identity')[];
} & (
  | {kind:'user-text'|'assistant-text';text:DisplayTextV1}
  | {kind:'tool-record';text:DisplayTextV1;tool:RuntimeProtectedLegacyToolFactsV1}
  | {kind:'projection-diagnostic';text:DisplayTextV1;
     code:'IDENTITY_TOO_LARGE'|'INVALID_ENTRY'}
);
type RuntimeLegacyHistoryProjectionV1 =
  | {
      ok:true;version:1;scope:{roleId:string;runtime:'pi'};
      origin:'legacy-native';
      entries:readonly RuntimeProtectedLegacyHistoryEntryV1[];
      reader:{ok:boolean;source?:DisplayTextV1;error?:DisplayTextV1;skipped:number};
      projection:{invalidEntries:number;omittedEntries:number;truncated:boolean};
      protection:'current-known-values-and-patterns';
    }
  | {
      ok:false;version:1;code:'INVALID_INPUT'|'PROJECTION_FAILED';
      message:DisplayTextV1;entries:readonly [];
    };
```

这是一组历史事实值，不是ReplayRow/Window权限对象。没有eventKind、写权、SDK对象、raw args、图片/thinking，也没有凭空execution/exit/errorCode。Window的call-phase映为start，旧denied工具行仍是tool-record的真实历史报告状态，不制造新的blocked阶段或任务终态。

Window只从本次native记录明确字段转换：user/assistant text来自message.content的text；callId来自toolCall.id/result.toolCallId；结果turn只来自实际details.turnId；target来自真实argument、tool-detail或相同真实callID先前的目标。现parser从工具首行模板识别的command/exit不升级为新structured target/process；template-only仍可在保护后的原text阅读，若旧失败分类必须保留则reportedStatus注明legacy-classifier，不能冒称native机器事实。没有实际时间/身份就缺席，不能从文本、相邻行、mtime或最近turn补造。

### 确切公共签名与配置来源

```ts
// Service: src/service/runtime/session.ts，纯同步投影
export function projectRuntimeLegacyHistory(
  input:RuntimeLegacyHistoryProjectionInputV1
):RuntimeLegacyHistoryProjectionV1;

// Pipeline: src/pipeline/orchestration/run-role.ts，纯包装
export function projectRoleLegacyHistory(
  input:{
    projectRoot:string;roleId:string;runtime:'pi';readOk:boolean;
    entries:readonly RuntimeLegacyHistoryEntryV1[];
    source?:string;error?:string;skipped:number;
  },
  context?:{credentialEnvNames?:readonly string[]}
):RuntimeLegacyHistoryProjectionV1;
```

Pipeline检查原scope值、仅转Model输入到Service，不调用adapter/provider。context只由可信Window当前已解析runtime设置/已有配置中的实际apiKeyEnvVar与extra名字传入，不由renderer/history正文指定；没有当前profile时可缺省并明示有限保护。Service每次调用捕获当前process.env中的公共凭据名单+这些明确名字的非空值，仅在本次内存纯保护闭包使用，复用A同一个文本/工具投影实现；不读取.env/旧密钥、不构造provider。Service函数虽然捕获当前环境配置，仍无FS/网络/执行副作用；相同捕获配置下结果确定。读取到旧轮换secret而当前值不可用时不能保证识别，限制同r3，不称全DLP。

scope只标该次已由Window原历史调用绑定的role/Pi，不是凭scope发新读请求。Service接收到entries本身不证明文件授权，不反向读取/列举任何路径。raw文本及source/error仅在主进程内存通过Interface→Pipeline→Service函数调用，不成为新renderer IPC请求入参；Window必须只把返回的protected值发IPC，不能再附原rows/source/error为侧车。reader失败但保护成功时外层ok:true且reader.ok:false，Window继续按reader失败呈现，不能当原文件读成功；投影失败则只显示固定安全错误，绝不fallback raw。

### 旧锚点保护而不改真实ID

现anchorKey是kind+NUL+raw title，属于内容派生展示键，不是opaque nativeCallId。Window唯一owned `request-anchor.ts::interactionAnchorKey`拟改为 `legacy-anchor-v1:` + SHA256(UTF8(原kind+NUL+title))；live/customerInput、ANS和native历史沿同一个helper同步，先对**原始规范键**做hash，不对redact后的标题算key，避免不同标题被统一替换后撞为同锚点。Core不导此helper、不重新计算请求标题。

Model只接严格匹配 `^legacy-anchor-v1:[0-9a-f]{64}$` 的token，原raw title/raw anchorKey不进Service或IPC。nativeCallId与toolCallId保持实际原值，不redact、不hash、不借op-N替代；有实际callID时正常保request/conclusion位置。无token或格式错误只省anchor并记metadataOmissions，不以文本重建。token仅保原卡/决定阅读定位，不是新的call身份、权限凭据或同标题请求去重键；不能因此吞两个同标题不同call。已有决定/失效仍原语义。

### 返回预算与缺失事实

新增推荐值待客户具体批准：每条user/assistant/工具原text 16KiB；target 4KiB、reader.error 4KiB、reader.source 1KiB；每entry JSON 64KiB；整个返回JSON **1MiB、至多4096条**（二者均检查）。工具display沿r3字段/56KiB规则，纯legacy无真实process则不产生；raw原text与display若同内容重复计入JSON预算。所有允许文本先A同规则净化，再UTF-8裁切，标truncated/redacted；source/error也不能旁路泄露。时间只保有效ISO且≤64字节的已记录值，无法合法显示则省略并标timestamp，不造当前时间。实际身份超entry预算用projection-diagnostic代该行，不改ID，不变工具失败；scope本身无效/超预算则整体INVALID_INPUT且不反射raw输入。

总量选择从原entries尾部开始能容纳的**连续后缀**，返回仍保持原先顺序；不跨过中间行挑选、不重排请求与结论。`omittedEntries`准确记录因总预算未返回的前缀条数，`invalidEntries`单列不合法条目数量，reader.skipped保原解析计数，三者不能混称坏文件。truncated=true表示返回发生截断/省略，Window明确“仅显示最近记录/部分文本已截断”，不能声称完整历史。token配对的一端被预算省略时不造另一端，也不把剩余位置改为新请求；UI保原锚点退化和阅读位置，需独立验证。

readOk:false时不展示其entries，保reader已保护error/source/skipped；输入格式整体无效或投影异常只返回固定安全错误。旧实际内容缺路径、exit、输出、错误结构就保持未保存；不会为展开再读文件或反解本地化summary。此输出上限不修底层整文件读取无界风险，不自动修改旧JSONL。若以后要分页/底层流式读取，需另审，不偷塞本兼容桥。

### 增量owner写集与验收

Core r4只追加Model中立legacy类型、Service上述纯入口及同role `tool-display.ts`复用、`test/runtime-core/legacy-history-projection.test.ts`；不动Provider或store。Pipeline wrapper由编排独立在既有run-role.ts公开入口实现并验层方向；Window在现session-history/runtime-history转换、唯一request-anchor helper及其现有测试接入，源/error/skipped侧车也保护；UI消费原映射后需保卡/决定/锚点，不接raw entries。三adapter A/r3 source/required/profile实现集没有增量，C/r2没有业务扩展。

实施后必测native-only目录仍能阅读user/assistant/call/result，显式缺身份/模板-only字段不造新事实，marker/call/turn与两个同标题卡/决定仍定位，fake secret穿text/target/source/error/旧anchor title不裸出IPC，真实call/turn不改，emoji/JSON总预算与连续后缀/省略计数正确，reader失败与projection失败分开、无rawfallback。Service测以FS/SDK禁止接缝证明纯调用不做I/O，Pipeline消费者测合法层入口，原文件hash/mtime不变。仅设计，未运行这些未来测试。
