---
id: claude-tool-display-implementation
type: change
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
---

# Claude 工具详情保留真实目标和结果，SDK原内容不变

客户已批准总方案r2/A4/C2.tp1/[Claude consumer2](../design/2026-10-15_design_tool-display-ac-assessment.md)，CLAUDE-A-1窄包由trusted operator转发并由PM预留。批准13文档与Core final14文件逐一SHA256匹配后实施；未修改批准文档或manifest。所属[当前功能](../feature/claude-session.md)。这份证据只覆盖Claude适配器，最终桌面及跨角色完整流程仍待集成属主验收。

用户经Core选择Claude后，工具详情可显示真实handler输入规则、路径/command、真实message及Core shell execution；失败展示捕获的Error.message。`src/provider/claude/session.ts::createClaudeRuntimeAdapter`在required-v1缺projector/register时于SDK加载前早拒；bindRole向Core闭包登记实际credentialName与明确名单在同一构造env快照中的值，不登记整个环境、不写值到日志。工具source只瞬时传入注入能力，投影结果直接入队，不再经旧emit改写身份，也不把raw source/detail作侧车发出。

实际MCP handler仍收到剥离nonce后的同一publicArgs。模型仍得到既有redact(result.message)和原isError，execution不进入content。catch保留原通用模型失败文案，只为展示提供Error.message，未知对象不展开。投影throw仅固定安全typed诊断，不改handler成功/失败，不rawfallback。身份过长投影诊断不被出口重新附回被省略身份。

PreToolUse的治理deny没有放宽：仅真实originalTurn可以发blocked，未知关联只CALL_CONTEXT_UNATTRIBUTED诊断，不借active新turn；原旧/迟到轮次信号、单次nonce、串行handler与取消后丢结果保持。没有hook就不制造blocked，普通result.ok=false仅真实result。C两类metadata由Core先剥离，Claude只消费原text/images，不实现报告存储、queue或保存重试。

## 验证范围与结果

环境Node v24.14.0/darwin arm64；正式SDK0.3.299、bundled CLI2.1.299及项目已安装依赖。未来依赖或Core输入变化必须重测，旧20项基线不单独替代本轮证据。

- `node --test test/claude-adapter/session.test.ts`：28/28，通过。原20项保持，新增8项验证生产缺注入/同快照profile、真实source/rule/execution、异常与unknown、未知/旧hook隔离、投影throw、C live/durable元数据运输、opaque身份及抑制身份不复活、真实read ENOENT及Node进程exit3/stdout/stderr。
- `node test/claude-adapter/native-loopback.probe.ts`：通过。真实Core required-v1+真实bundled CLI，本地127.0.0.1假Messages服务共4请求/2轮UserPromptSubmit/2轮PreToolUse/2次真实MCP；两个catalog只有ANS工具，updatedInput真实生效，投影start/result各2条。假凭据，外部模型调用0。初次sandbox listen EPERM，按授权以require_escalated自动审查批准后运行成功；最终候选再跑通过。
- `npm run typecheck`：exit0。曾见并行编排测试taskId缺失，交其属主修复；最终全仓通过，没有改同伴文件。
- `git diff --check`：exit0。

测试开发中曾误用与Core不同的自定义turn，造成受控集成夹具等待；修正测试为实际Core turn并独立验证opaque身份，未放宽生产匹配。C最初空reports夹具被Core INVALID拒绝，修为真实公开投影与保存snapshot后分别检验live/durable运输，没有降低Core验证。最终日志对应通过的候选，早期失败不算成功证据。

[机器清单](2026-10-15-claude-tool-display-evidence/manifest.json)、[测试日志](2026-10-15-claude-tool-display-evidence/tests.txt)、[类型检查](2026-10-15-claude-tool-display-evidence/typecheck.txt)、[原生回环](2026-10-15-claude-tool-display-evidence/native-loopback.txt)。机器清单记录本候选源码/测试hash及Core依赖匹配，不把工作区其他角色的并行修改纳入Claude交付。

本轮精确生产写集只有 `src/provider/claude/session.ts`；测试只有 `test/claude-adapter/session.test.ts` 和实际需要的 `native-loopback.probe.ts`；资料仅自身api-spec/feature/memo/changelog及本change/证据。没有新增依赖、源码文件或他角色写入。未运行在线模型/真实账户、用户桌面或目标项目操作；不承诺未知秘密全DLP，不把安全copy当完整native转录。
