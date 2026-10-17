# 装配实现报告

对应项目管理 [ANS-RUNTIME-V2 revision 1](../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md)。B0 正常依赖与稳定原生协议已验证；B1 两个 CLI 命令的四运行时接线已实施，自有启动/实际核心 handlers 已验证。桌面和独立最终合并验收由原属主接续，没有在线模型证据。

`package.json/package-lock.json` 精确固定：`@openai/codex@0.162.1`、`@modelcontextprotocol/sdk@1.32.1`、`@anthropic-ai/claude-agent-sdk@0.3.299`、`zod@4.6.7`、`@anthropic-ai/sdk@0.93.0`；Pi `1.1.0`、yaml `2.9.0`、Node `>=23.6` 保持。正常安装元数据及当前候选见 [原证据](docs/change/2026-10-14_change_multi-runtime-assembly.md)。Codex app-server 为实际运输，不是 TS SDK callback；Claude bundled CLI 版本 `2.1.299`，最终 no-bare/disableAllHooks 与真实 hook/updatedInput 回环已由原属主 [A1V](../Claude适配器/docs/fix/2026-10-14_fix_claude-native-hook-identity.md) 验证，24.8天上游限制保留。

稳定 Codex `node test/codex-adapter/native-probe.mjs` exit 0，证明无模型初始化/配置/schema 检查中的 native MCP 全禁用及 read-only/never 实际限制。B0正常核心/Codex/Claude/Pi测试组合239/240，唯一沙箱本地listen EPERM精确回环重测1/1；原始失败保留。B1装配67项+已修边界顺序的窗口session11项共78/78、当前全仓strict tsc0。全仓原结果1165/1168、2失败、1跳过，桌面目录名断言交D1；另一边界顺序项精确重测通过。SDK加载与root接线有当前证据，初次失败均留在报告。无真实模型/登录/线上 API 调用。

root 公开导出 `main(argv,env?,options?:MainOptions)`、`loadInjection(targetDir?)`、`buildDemoProjectConfig()`、`buildDemoTaskScope()`、`resolveProjectRoot()`、`resolveSkillRoot` 及配置类型。`MainOptions.runtimeOptions` 直接引用 Interface `RunRoleCommandDeps.runtimeOptions`；`RunRoleDeps` 是带必需project/scope的Interface依赖类型。入口只持Interface公开操作、不导入Pipeline/Service/Provider对象或类型。命令默认role=demo/govern=pi，flag>ANS_RUNTIME>命令默认；demo默认保留原装配替身，测试显式runtimeOptions可走正常Service。CLI shell gate不在本次授权内。

内置回退新增三份已接受运行时角色卡/各自边界，保持原任务writeSet；外来govern不复用本仓库角色表。README和.env.example仅占位符。B1当时的Codex显式空base问题已由原属主[X1S修复](../Codex适配器/docs/fix/2026-10-14_fix_blank-base-url-default.md)，示例继续省略该可选键。B1原源码/配置候选SHA256 `38f896e0ace0de540606080595e322c3e81cb80d8f3dab2a8b6506fba45a105c`，逐项和命令见[原报告](docs/change/2026-10-14_change_multi-runtime-assembly.md)；当前功能见[CLI运行时接线](docs/feature/cli-runtime-assembly.md)。

B1D仅文档同步：README准确区分CLI四值和桌面正式三选项、当前引擎设置、ans/native隔离与Pi旧JSONL兼容、实际恢复及ANS等待/上游限制。21份自有生产配置测试未变，链接/矛盾/格式检查通过；没有新产品、原生或最终T1验收。当前README指纹及证据见[文档收尾](docs/change/2026-10-14_change_readme-multi-runtime-desktop.md)。

## 2026-10-17 — `ans govern <目录>` 治理模型注入（评审 §5.4「CLI 同步」）

`loadInjection(targetDir?)` 现在把治理模型写进注入的 `ProjectConfig.governanceModel`：对外来目标目录调用 PM 属主共享组件 `readGovernanceModel(projectRoot)`（`src/common/装配/config-loader.ts` 薄转发、只读导入，不复制实现），判定顺序与 `listProject` 同口径——explicit → 显式值；unreadable → `single`（保留既有 `ans-invalid`/fail-closed 语义）；absent + 无 `.ans/project.json` 记录且无项目角色子目录（`角色卡/`、`role-cards/`，空目录不算）→ `trio`（新空项目）；其余 → `single`（旧项目，行为逐字不变）。`ans govern`（缺省）与显式 `ans govern <ans-cli 根>` 不做目标推断、仍用载入配置；`ans role run` 不经本函数，语义不变。`ConfigInjection`/`governCommand` 契约无需改动——`project.governanceModel` 已随 `GovernSessionInput.project` 透传给 `resolveRole`/`resolveBoundarySection`。修复测试角色报告的阻塞缺陷：新空目录经 `listProject` 选到 rapporteur，但 `resolveRole` 按缺省 `single` 报「三权角色在 single 治理模型下不可用」。新增 `test/装配/governance-model-injection.test.ts` 9 例；`govern-target.test.ts` 空目录链路改用 trio/rapporteur 提案写盘并覆盖 `--function proposal`。证据：`test/装配/` **82/82**、typecheck **0 错**、全量 **2669/2648/18/3**（18 红均为既有环境/他角色：Windows symlink EPERM、桌面UI renderer、schema 文案、vendor pin 等；4 条 CLI 红转绿、0 新红）。
