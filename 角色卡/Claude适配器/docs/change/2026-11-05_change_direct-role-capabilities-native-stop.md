# Claude 原生停止事实（T1.1）

用户从角色停止/重启路径触发 R 的 `RoleSession.nativeLifecycle`。旧 `abort` 会主动 reject turn，再请求 interrupt/close；这只能结束 ANS 等待，不能证明 SDK 子进程退出。按客户已确认 T1.1（root scheduling 文档 SHA256 D2AFC929DF7D1AFD8294C50582E159449EB58C143454DF63F948615FBD2DF064）及冻结 R hook 实施，无新公共契约。

## 实现层提案（代码前）

- `src/provider/claude/session.ts::bindRole/startEngine/prompt`：每 bind 一个独立 instanceId；实际输入交付捕获 coreTurnId、SDK wire uuid，保留原生 result 终态、消息 pump 的真实自然/异常终结。主动 reject/closed/interrupt 返回不能制造 settled/transport closed。
- ANS MCP handler 从 callback 进入到真实 Promise finally 追踪（含排队）；外来 MCP/内置工具只按已观测 start/result 配对；关闭不清空事实。历史引擎仍有 pump 或工具时不能被后来的引擎遮蔽。
- `nativeLifecycle.inspect/stopAndInspect` 复用 Model 字段。停止先校验 instance 与最后实际 coreTurnId，再请求现有 owned SDK interrupt/close，有界等待观察事实；重复调用共享停止请求，取消/超时只返回保守事实。SDK 不暴露 Query PID、进程树、退出码、HTTP 完成事件，故 processes=[] 且 processCoverage=unknown、status 不冒报 quiescent。即使 pump ended 也不等于 CLI/tree exited。
- 只改授权 session.ts / session.test.ts 与本角色指定文档；保留旧差异，不动配置/权限/Model/依赖/Git，不发真实模型/SDK网络/账号请求，不加 OS helper。

验证命令：`node --test test/claude-adapter/session.test.ts`、`node node_modules/typescript/bin/tsc --noEmit`、`git diff --check -- src/provider/claude/session.ts test/claude-adapter/session.test.ts 角色卡/Claude适配器`。同文件新增受控 query seam + 真实 owned Node child close驱动iterator终态；正例仅验证可见运输结束（覆盖仍unknown），负例延迟/不关闭/活工具/超时/dispose早返/重复stop/错实例旧turn。原始失败与自然退出日志保存在本角色授权 evidence 目录；当前源前 hash：session 6DB0C08448C43867A8C1BC742E89BC6D850B1BD468548DD96FF2DE183AA3ABBE；test EDB68AF20F701A7BAB665C19B21342DDD1E3FBF2CF4DC8A4589A64836F072903。

当前是已批准 T1.1 的实现细化；本角色自测不代替 Q 跨角色验证/独立验收。[当前行为](../feature/native-stop.md)。

## 实施结果与边界

公开hook位于 session.ts 的 bindRole；inspectNative、nativeLifecycle.stopAndInspect、startEngine的SDK hook/pump和MCP callback为实际实现位置。结果按上文提案落地；transport closed仅指可见消息泵自然结束，异常退出运输unknown；进程/HTTP/整树事实缺口不变，不能放行正常Claude stop/restart或Git受管面。

- 最终源SHA256：`4567E58A875425F5AFE985199CD9A03FC7D7E9D2547480D49F4C2AE3B7401E0C`；最终test：`94818BB22ECDC3DE842B983391FADF7106B74431252320DBED555E67E74618CC`。旧脏差异保留；未git写/commit/push。
- Node v24.22.1 / win32 x64；精确测试 `node --test test/claude-adapter/session.test.ts`，最终自然exit0、61/61、0skip/0cancel：见[最终完整原日志](2026-11-05_native-stop-evidence/session-final-61.log)。新增6个native用例真实owned child.close观测code0/signalnull；live工具在Query泵已结束后仍保留。初始活工具用例曾错误预期pump仍running，真实linked MCP client.close先释放Query、handler仍活；修正为分别断言raw settled和activeTools仍1/status stopping，原红保留于native-targeted-first.log，不把local reject变终态。
- `node node_modules/typescript/bin/tsc --noEmit` 最终exit0：[原日志](2026-11-05_native-stop-evidence/typecheck-delivery.log)。初始可选abort测试类型错误原输出保留，改为现有能力存在断言，不放宽类型。
- 首次沙箱完整单测exit1包含TEMP atomic rename EPERM：[原日志](2026-11-05_native-stop-evidence/session-first-run.log)。同精确命令经授权自动审批提权对照使用本机TEMP `C:/Users/51054/AppData/Local/Temp`，rename错误消失；不是产品拒绝保护。提权后原完整59/61、两红保留于session-final-confirm.log：`actual shell tool deny prevents marker and allow returns actual command output`（Windows无printf）、`native symlink and storage runtime mismatch fail before SDK query`（未标type的目录symlink报EPERM）。经统筹确认，同授权test内换等价真实Node stdout/marker命令与win32真实junction/POSIX dirsymlink，所有原断言保留，额外lstat/realpath/canary可达与目标不改断言，最终61/61；不skip、不加依赖、无新fixture文件/OShelper/系统权限。
- 动态覆盖只证明公开adapter seam与本机owned夹具/真实MCP运输。进程树、真实CLI退出、HTTP完成、真实模型、桌面整链未验证；本角色自测不是独验或三引擎停稳交付。风险沿已批T1.1/T3，由Q/根独验汇总。

## C5：Q96 暴露的 host-only schema 转换修复（代码前）

Q96 原始 Claude 自然 exit1（测试角色 q2-q96-t3-claude-01-early.stdout.log）表明：R 的 write/edit 根 not.anyOf 单键 required 禁止列表进入 Claude 注册时被严格转换器拒绝。已核每工具23键；不删除安全约束、不改R schema/handler。C4只读提案及C5统筹GO：仅 session.ts 注册前将精确形状副本等价映为 properties[key]=false；任何一般not/错误形状仍拒，required/additionalProperties/nonce不变。session.test以真实MCP逐23键拒绝/零handler、正常write/edit/read、源schema不变和一般not拒绝验证。保持原61断言/native负例；首写前源4567E58A875425F5AFE985199CD9A03FC7D7E9D2547480D49F4C2AE3B7401E0C、test94818BB22ECDC3DE842B983391FADF7106B74431252320DBED555E67E74618CC。冻结解除后才实施；无新增生产/测试文件/依赖/公共契约/模型网络。

C5 实际结果：注册前仅精确根 not.anyOf 单required禁止形状转换，副本保留所有23键为false；保nonce冲突拒绝、一般/错误形状not拒绝。真实MCP新增定向2/2（46项逐键null拒绝＋context=false＋正常write/edit/read、原schema不改），主type自然exit0。完整session自然exit1：63计62过/1红、0skip/0cancel；唯一红为 `core Service receives real Claude MCP reports/dispatch receipts and saves replay with actual metadata`，实际 `tool input.reviewTarget.candidate.allOf: unsupported JSON Schema keyword if`。R schema.ts:612-613 objectFormat→sha1/sha256 hex长度条件、同dispatch根:692-693 resumeController条件不在C5窄形状内，保持严格拒绝，未忽略/删除安全条件；交统筹具体delta判断。证据：`c5-schema-targeted-first.log`、`c5-typecheck.log`、`c5-session-final.log`。source SHA E711F7BFCE737B60D50A6204B92FBD0FA10FE04AC46D9A767985D248D8CC80CC；test SHA 829BC547C21838C31A805E3FA69E2C6A2622363B9C7FC22B634FF868092AA0C7；当前FROZEN，不能称完整回归已过。

C6 代码前等价规则：统筹GO同原两文件消费dispatch_task实际两条件。只精确认R:612–613 Oid条件（sha1/sha256→40/64十六进制）与:692–693 resume条件（完整resume→convener并禁止reviewTarget/sourceTaskId）；复制完整object拆anyOf，无resume支属性false，resume支保五个必填及原idempotency等字段。保required/additionalProperties/23键及nonce，不认其它if/额外条件，不改R schema/handler。MCP验证合法组合与零handler负例，再跑完整真实回归；C5原62/63红保留。

C6 实施完成/FROZEN：只dispatch_task两处真实条件改写，GitOid严格比对原enum/hex/唯一条件后复制完整object两支；resume严格比对原条件后复制无resume或完整resume+convener+禁冲突两支。nonce先加入完整分支，原required/additionalProperties、host-only禁止、idempotency和普通dispatch字段保留；未知if/额外anyOf/错误not保持原拒。真实MCP定向4/4；完整精确 `node --test test/claude-adapter/session.test.ts` 自然exit0，65/65、0skip/0cancel、1244.9327ms；主 `node node_modules/typescript/bin/tsc --noEmit` 自然exit0，diff-check0。source SHA A2C63547D4C43C2A9255D2E1F94832853CDAA3AFEB37A768063C5A88D832E7E7；test SHA 3ACB2B7CFC07C145E69B3E0A57C8378846E7A45F910E1EA4A5D9429557A09D4C。原C5红与C6沙箱TEMP rename EPERM首对照保留；最终精确elevated只隔离已知环境影响，无真实模型/网络/SDK请求。见c6-conditional-targeted-first.log、c6-session-final.log、c6-typecheck.log、c6-delivery-manifest.json。没有修改R schema/host-handler；原native/processCoverage unknown限制不变，不代表三引擎stop/restart可放行。
