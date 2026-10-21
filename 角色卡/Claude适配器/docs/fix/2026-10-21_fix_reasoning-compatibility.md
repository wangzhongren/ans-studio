---
id: claude-reasoning-light-compatibility
type: fix
created: "2026-10-21"
updated: "2026-10-21"
status: owner-verified-awaiting-independent-verification
---

# Claude：思考参数被拒时，以真正无参数请求继续

客户已批准 [ANS-REASONING-LIGHT D1](../../../项目管理/docs/design/2026-10-21_design_reasoning-effort-lightweight-repairs.md)（SHA-256 `30eb803b2482eea9a308ca2bf51507bb2a8d9c56dc2137fdc5749d85a4dcda09`）并指示实施测试。本记录落实该同版方案，不增加审批或选装项；验收依据为 [R1](../../../独立验收/docs/design/2026-10-21_design_reasoning-light-criteria.md)。当前功能见 [Claude 会话](../feature/claude-session.md)。

原实现返回空 SDK 选项，CLI 却重新添加默认 thinking/effort，导致 low 被拒后实际发送 high，还提前提示去参成功。修复使用仅属于兼容 SDK 子进程的 `CLAUDE_CODE_EFFORT_LEVEL=unset` 与 `CLAUDE_CODE_DISABLE_THINKING=1`，不传显式选项，不改保存配置。

只在明确的参数拒绝且本轮没有正常输出、没有工具启动时重放一次。SDK 合成错误帧不当正常输出；ANS、外来 MCP、WebSearch 在放行/执行前记已启动。鉴权、限流、普通服务错误及 model 错误不触发。尝试与完成提示分开，以活动轮内普通 system message 发出；兼容完成后才记住会话策略，失败/取消不污染下一轮。

实施范围：`src/provider/claude/session.ts`、`test/claude-adapter/session.test.ts`、`test/claude-adapter/reasoning-loopback.probe.ts` 及本角色当前功能/API/备忘录。本轮不改 UI、共享契约、SDK、依赖、真实配置或其他角色文件，不提交 Git。

## 验证计划与边界

运行本角色单元测试与真实 SDK 0.3.299 / CLI 2.1.299 localhost 回环：原档→参数拒绝→无参数成功→下一轮无参数；兼容失败/取消后下一轮恢复原档；错误分类负例；输出/工具启动后不重放；仅一次最终结算及 system 消息阶段。捕获字段摘要，不保存真实凭据或用户数据。项目类型检查由集成协调，必要记录本角色诊断。

模型自身忽略或钳位 effort 的行为保持；两个开关证明请求体字段缺席，不证明任意 beta header、第三方网关或服务端实际思考行为。已有输出/副作用后的透明续接不在本次范围。

## 当前候选验证结果

macOS arm64，Node 24.14.0，SDK 0.3.299 / bundled CLI 2.1.299；完整命令、退出码、环境与文件 SHA-256 见 [manifest.json](2026-10-21-reasoning-light-evidence/manifest.json)。

- `node --test 'test/claude-adapter/*.test.ts'`：57/57，无跳过。覆盖正常六档、default/off/low兼容、配置不写回、结构化/文本错误正负例、失败/取消/超时恢复原配置、正常文本/思考输出及三种工具启动保护、system消息阶段；原有失败/停止/持久化/MCP测试保持。见 [unit.log](2026-10-21-reasoning-light-evidence/unit.log)。
- 真 SDK 回环：19个直接SDK相位＋1个Service→适配器装配相位＋6个兼容相位全通过。拒 effort 或 thinking 时，前3次SDK原生尝试仍带low，ANS兼容请求真正不带thinking/output_config，下一轮也不带，两轮completed；不改主进程环境和传入配置。兼容请求本身失败/取消/超时，下一轮真实wire恢复low。工具先真实执行一次后遇拒绝，只有原引擎、工具计数1、没有整轮兼容重放。见 [probe.json](2026-10-21-reasoning-light-evidence/probe.json)。
- 旧模型独立对照：Sonnet4.5/Haiku4.5的low与xhigh均无effort、budget_tokens=31999；Sonnet4.6/Opus4.6把xhigh钳到high。记录SDK事实，不增模型表或预算实现。
- `npx tsc --noEmit`：退出1，仅 `test/测试/g5-reasoning-verify/e-pi.test.ts` 3条旧Pi契约消费错误，属于QA同步中的其他角色文件；Claude相关零诊断，未跨界修改。整项目类型检查仍须集成在同步后重跑，不能将该次称为通过。见 [typecheck.log](2026-10-21-reasoning-light-evidence/typecheck.log)。
- 改动文件 `git diff --check` 通过。未运行全仓测试、未提交Git、未改UI/真实配置/SDK或依赖，未访问真实模型端点。

当前结果为所有者验证，不替代独立集成及R1验收。旧历史记录中的“返回空选项就去参”已被本记录替代。原生会话恢复及失败清理保持既有语义；此修复不承诺非持久会话重建后的历史无损，也不重新执行已有输出或工具作用的轮次。

