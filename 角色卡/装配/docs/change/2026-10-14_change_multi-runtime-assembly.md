# 多运行时依赖与 CLI 装配记录

依据 [ANS-RUNTIME-V2 revision 1](../../../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md) 与本角色 [独立设计](../design/2026-10-14_design_multi-runtime-assembly.md)，本次完成固定依赖与 CLI 两个命令的运行时接线。B0 已安装验证，B1 自有启动/真实核心接线已验证；全仓剩余问题已交原属主。当前流程见 [CLI 装配](../feature/cli-runtime-assembly.md)。无在线模型、账户登录、实际 `.env` 读取/修改、commit 或 push。

## B0 原始结果（2026-10-14）

环境：Node `v24.14.0`、npm `11.9.0`、TypeScript `7.0.2`、macOS arm64；基线 HEAD `906abd3ee275cba82b2f9e54ceef1cd9473c2d5c` 加现有各角色未提交改动。源码和依赖候选指纹见 [b0-candidate.json](2026-10-14-multi-runtime-evidence/b0-candidate.json)，装配修改前快照见 [baseline.json](2026-10-14-multi-runtime-evidence/baseline.json)。

- 安装命令：`npm install --save-exact @openai/codex@0.162.1 @modelcontextprotocol/sdk@1.32.1 @anthropic-ai/claude-agent-sdk@0.3.299 zod@4.6.7 @anthropic-ai/sdk@0.93.0 --cache /private/tmp/ans-runtime-assembly-npm-cache --no-audit --no-fund --fetch-retries=0`。最初沙箱 DNS `ENOTFOUND`，中断退 130；同一受管提权安装成功 exit 0，`added 92 packages, and changed 1 package in 3m`。未改 npm 账户/用户配置；已有 npm mirror 字段告警原样保留。精确直接版本见 [npm ls](2026-10-14-multi-runtime-evidence/dependencies.json)。Pi `1.1.0`、yaml `2.9.0`、Node `>=23.6` 不变；Pi 原有 Anthropic SDK `0.129.0` 从 root 移到其自身嵌套依赖，版本仍保持。
- `node test/codex-adapter/native-probe.mjs`：exit 0，实际 `codex-cli 0.162.1`。[原始输出](2026-10-14-multi-runtime-evidence/codex-native-probe.txt)。实际 app-server 命令为 `--listen stdio:// --strict-config` 加原属主 `safetyOverrides` 的 `-c` 配置；所有 16 项原生功能开关关闭、`read-only`、`never`、web_search disabled，项目 untrusted。先读有效配置枚举 native MCP，再以每个已发现 ID 的 `enabled=false` 根 map 重启核验，最终 native MCP `[]`；项目配置未进入，假外部 MCP 未启动。initialize 的 `experimentalApi=true/explicitGatewayOauth=true` 被接受；`generate-ts --experimental` 验证 dynamicTools function/name/description/inputSchema 和 `threadId/turnId/callId/tool/arguments`。无 thread-start/login/模型请求，不能据此声称完整在线运输或 OS 沙箱验收。
- `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude --version`：exit 0，`2.1.299 (Claude Code)`；只是版本检查。
- `node --test 'test/runtime-core/**/*.test.ts' 'test/codex-adapter/**/*.test.ts' 'test/claude-adapter/**/*.test.ts' 'test/pi-adapter/**/*.test.ts'`：正常安装依赖下 **240 tests / 239 pass / 1 fail / 0 skipped**，exit 1。[首次原始输出](2026-10-14-multi-runtime-evidence/adapter-core-tests.txt)。唯一失败是既有 Pi timeout 用例 `listen EPERM 127.0.0.1`（沙箱不允许本地 listen），不是源码断言失败。
- 唯一失败精确重测 `node --test 'test/pi-adapter/real-adapter.timeout.test.ts'`：受管提权允许假凭据/纯 `127.0.0.1` 回环，**1/1**，exit 0，实际 prompt 810ms 中止。[原始输出](2026-10-14-multi-runtime-evidence/pi-loopback-retest.txt)。首次失败保留，不把两次独立执行冒充一次全绿；核心/Codex/Claude 正常依赖验证包含于上述组合。
- `npm run typecheck`：exit 0，全仓 strict tsc，配置没有修改。[原始输出](2026-10-14-multi-runtime-evidence/typecheck-b0.txt)。
- `node --test 'test/装配/**/*.test.ts'`：接线前 **54/54**，exit 0。[原始输出](2026-10-14-multi-runtime-evidence/assembly-baseline-tests.txt)。

本阶段只改 `package.json/package-lock.json` 与装配自有文档/证据。新 SDK 已在正常路径可用；Claude 原生 hook/轮次/updatedInput 回环证明仍由 Claude 固定属主完成，当前结果不代替 A1V。后续任一适配器源码或公共依赖变化都需要重新验证受影响项。

## B1 实际行为

以前 root 只为 Pi 动态导入 Pipeline 工厂，govern 不接收 root runtime 选择。现在 `src/index.ts::main` 把 project/scope/runtime/runtimeOptions 交给 Interface `runRoleCommand/governCommand`，真实引擎由正常 Pipeline→Service 创建；root 无 Service/Provider/Pipeline 运行对象或类型引用。类型引用统一 Model，demo 原装配替身保留。`main` 的可选第三参 `{runtimeOptions}` 是 Interface 输入的兼容超集；不传时原调用方式保持。

flag 优先于 ANS_RUNTIME，role run 默认 demo，govern 默认 Pi；缺配置/SDK 时所选引擎明确失败，不自动切换。role run help 在缺 Pi 凭据时也可显示。help/doctor/module import 不加载 SDK 或启动原生会话。CLI shell 未 arm，run_shell 不注册。外来 govern 目标目录的换根和有界创世逻辑保持。仓库回退表登记原六个及新三份运行时卡/各自边界，原单文件 task writeSet 不扩大。

README、`.env.example` 同步真实配置与 Codex app-server 实验代理；Claude 最终 no-bare + settings.disableAllHooks 的 bundled CLI 回环证据及上游 24.8 天限制。示例可选 Codex base 键以注释省略，当前源码对显式空串 base 的默认语义问题已交 X1 属主复核，装配不改其设置实现。

## B1 原始结果与候选

本角色最终 22 份配置/源/测试/README/示例文件按路径排序、`path + NUL + bytes + NUL` 合成 SHA-256：`38f896e0ace0de540606080595e322c3e81cb80d8f3dab2a8b6506fba45a105c`。逐文件见 [b1-candidate.json](2026-10-14-multi-runtime-evidence/b1-candidate.json)，关键只读依赖见 [b1-dependencies.json](2026-10-14-multi-runtime-evidence/b1-dependencies.json)。早期候选和原始失败也保留，不能把早期结果当成最终当前版本。

- 初测 `node --test 'test/装配/**/*.test.ts'`：65/66，唯一新测试误以为 Claude 诊断英文，实际是准确中文；改为精确中文断言，未删除或放松断言。[首次输出](2026-10-14-multi-runtime-evidence/assembly-b1-first.txt)。随后 66/66，[输出](2026-10-14-multi-runtime-evidence/assembly-b1.txt)。
- 新增实际缺 SDK 用例后首次 66/67：Codex 的 CJS package 定位未被 Node resolve hook 拦截，子测试 10 秒 SIGTERM。[原始输出](2026-10-14-multi-runtime-evidence/assembly-b1-final.txt)。只读进程核查确认无遗留 owned Codex 进程。测试改为线程创建前的真实 MCP import 缺依赖；断言真实 Codex 依赖错误、非零退出和假 key 不回显，Pi/Claude 则拦截实际 SDK import。没有改生产适配器或增加其 fallback；该模块当前 13/13，[原始输出](2026-10-14-multi-runtime-evidence/multi-runtime-final.txt)。
- 最终 `node --test 'test/装配/**/*.test.ts' 'test/桌面应用/session.test.ts'`：**78/78**，exit 0（装配 67 项、窗口 session 受影响 11 项）。[最终输出](2026-10-14-multi-runtime-evidence/affected-b1-final.txt)。root 四 runtime × flag/env × role/govern 通过正常 Interface→Pipeline→Service 与外部引擎 double，调用实际公共 write handlers，边界/F4 拒绝零写盘；各命令 capability 注入与无 storage 验证通过。实际 bin 默认工厂路径验证 Pi/Codex/Claude 缺配置的准确失败；SDK 懒加载包括 module import、四引擎 help/doctor/命令 help。原 demo、三个新角色卡与实际入口收敛通过。
- 当前 `npm run typecheck`：全仓 strict tsc **exit 0**，包含 A1V 最终源码；[最终输出](2026-10-14-multi-runtime-evidence/typecheck-b1-final.txt)。没有改 tsconfig 或 strict 策略。`git diff --check` 通过。
- 当前全仓 `node --test 'test/**/*.test.ts'` 在允许本地回环环境：**1168 tests / 1165 pass / 2 fail / 1 skipped**，exit 1。[原始输出](2026-10-14-multi-runtime-evidence/full-b1.txt)。两失败为窗口 pi-config 写死目录名 ans-cli（当前 ans-runtime），窗口 session 首 file entry 断言（当时边界把新测试排在 app/main.ts 前）。前者交 D1；后者由 Governance 恢复既有 entry 顺序后，上述最终 11 项窗口 session 原断言全部通过，装配未改 peer 测试。没有把独立受影响重测冒充一次全仓通过。

Claude A1V 原属主已完成正常 **20/20**、strict tsc 与真实 bundled CLI **2.1.299** 的严格假凭据 loopback，实际 SDK hooks 与 updatedInput 已证明；见其 [最终修复验证](../../../Claude适配器/docs/fix/2026-10-14_fix_claude-native-hook-identity.md)。本角色不复制其测试证据为自己的在线结果。独立最终合并/桌面接线仍由项目管理与测试角色接续。
