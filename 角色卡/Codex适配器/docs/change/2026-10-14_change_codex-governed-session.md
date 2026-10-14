---
id: codex-governed-session-implementation
type: change
title: Codex 使用 ANS 动态代理和原始轮次信号执行工具
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: implemented-unverified
related: [codex-governed-transport-design, codex-governed-session, multi-runtime-integration-v2]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: 完成受治理 Codex 适配器及 14 项真实 MCP 无模型测试，稳定运输待装配复核
---

# Codex 使用 ANS 动态代理和原始轮次信号执行工具

原来仓库没有 Codex 适配器；现在运行时核心可以通过 `src/provider/codex/session.ts::createCodexRuntimeAdapter` 创建这个引擎。适配器先检查有效配置，关闭全部 native MCP、shell/hooks/apps 等旁路，再注册调用方注入的 ANS 代理。真实写入、编辑、shell、交互和回交仍由原 handler 执行，适配器不复制授权判断。CLI/桌面入口及依赖安装由原属主接续，当前尚未部署。

具体选型与独立影响评估见[设计](../design/2026-10-14_design_codex-governed-transport.md)，使用流程见[当前功能](../feature/codex-governed-session.md)。实现全部位于本角色 Section 1；没有改 Model、其他角色源码、构建配置、真实 `.env`、账户登录状态、依赖或 lockfile，也没有 commit/push/模型请求。

## 已观察到的结果

原生服务端请求提供 threadId/turnId/callId，适配器据此调用真实内存 MCP。队列保存原始 signal；中止后旧轮次、旧队列和迟到请求都会拒绝，下一轮使用独立信号。模型请求成功不等于报告成功，注入回执失败原样返回。结果事件带 `toolName/name/toolCallId`，call ID 含实例 UUID 和原轮 ID，重启不会复用。

客户等待暂停 prompt 计时。普通停止可继续下一轮；停止握手挂住时 750ms 内拒绝并隔离会话，不能假称还能继续。上游取消、错误、终止和 dispose 都使原信号失效。每轮只有一个 settled，带 completed/failed/aborted/timed_out；旧 handler 在轮次结束后不能追加成功事件。

实际 npm `@openai/codex@0.162.1` 的 `bin/codex.js` 会 spawn 原生程序、继承 stdio、转发 SIGINT/SIGTERM/SIGHUP，并等待原生 exit；只对 wrapper PID 发 SIGKILL 会留下原生程序。因此 POSIX 默认运输创建独立进程组，TERM 后按有界期限 KILL 整组并确认退出。新增实际子进程测试使 wrapper/native 都忽略 TERM，dispose 小于一秒，900ms 延迟文件没出现，子进程 PID 返回 ESRCH。Windows 分支使用实际 owned PID 的 `taskkill /T /F` 先清整树，不先杀 wrapper；此分支未在本次 macOS 环境运行。期间 group kill(0) 短暂 EPERM 被当作“存在性未知，继续等待复查”，不能当作已清理；最终 ESRCH 才结束。

持久化只读取注入角色/runtime 的记录，原生目录使用核心 validate/prepare 回调。thread/resume RPC 与返回沙箱验证成功才记 resumed；明确恢复失败后新建记 recovered/warning。后续一般模型失败不改写成恢复失败。ANS 回放由核心维护，不当作原生上下文。没有 storage 时原生工作根和状态在系统临时目录，dispose 删除；图片亦只保存在该临时根。

配置先尝试读取、枚举 native MCP，再以含每个 ID 的 `enabled=false` 根 TOML map 重启、重读验证。根 map 会合并，quoted dotted override 也不能可靠表达任意 key，两者都由实际 alpha 探针纠正。线程新建和恢复使用同样限制，并检查返回 readOnly/never；实际 native MCP 目录必须为空。原生文件/command 审核都回复 decline，权限审核回复空授权。流式事件不被当成写前防线。

## 原始验证与实际限制

环境：Node `v24.14.0`、macOS arm64、TypeScript `7.0.2`；基线 HEAD `906abd3ee275cba82b2f9e54ceef1cd9473c2d5c`。本角色未提交候选如下；测试仅临时目录和假凭据。

- `ANS_CODEX_TEST_MCP_ROOT=/tmp/ans-codex-test-harness/node_modules/@modelcontextprotocol/sdk node --test 'test/codex-adapter/**/*.test.ts'`：最终 **14 passed / 0 failed / 0 skipped**，exit 0。这里真实库为 `@modelcontextprotocol/sdk@1.32.1`，模型端是可注入 fake RPC，另有一项真正子进程 JSON-RPC double 验证生产 parser 与 `serverRequest/resolved` 清理。默认生产 loader 不包含 `/tmp` 路径；依赖安装后测试默认直接导入安装库。
- `./node_modules/.bin/tsc --ignoreConfig --noEmit --target esnext --module nodenext --moduleResolution nodenext --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly --isolatedModules --types node src/provider/codex/session.ts src/common/codex-adapter/*.ts test/codex-adapter/*.ts`：exit 0。TypeScript 7 的首次指定文件命令要求 `--ignoreConfig`，添加后通过，没有改 tsconfig。
- `npm run typecheck`：当前 exit 1，仅报告并行 Claude 源码/测试缺少 `@anthropic-ai/claude-agent-sdk`、`zod`、MCP 依赖及由此产生的 implicit-any；Codex 自身首轮 unknown/string 错误已修复。须待装配安装后重跑，不能称全仓通过。
- `node test/codex-adapter/native-probe.mjs '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex' '0.162.0-alpha.17.2'`：exit 0。真实 alpha CLI 只做版本/schema/help 和本地 initialize/config/read，没有 thread/start、模型、登录、MCP discovery 或远端 API。有效 native MCP 为 `[]`，项目层排除，外部 marker 没出现，read-only/never/shell_tool=false 可见；真实 schema 具有动态调用 threadId/turnId/callId，以及函数 name/description/inputSchema 和 experimentalApi。
- 静态导入检查：Provider 仅调用外部设施并引用 Model/shared/本角色 common；common 不导入运行层；没有 peer Provider、Service/Pipeline 或他人 private common 导入。自有新增文件逐行 whitespace、允许路径、文档链接和候选哈希检查通过。最后一次全仓 `git diff --check` 报他人并行文件 `src/interface/cli/run.ts:94` 的 EOF 空行，本角色只报告给项目管理，没有越界修正。

首轮行为测试有一项只因断言的错误文案预期不同而失败：核心对 native symlink 的真实错误为“会话目录不是普通目录”，改成核对这个实际拒绝原因并保留零副作用检查后重跑全部通过。首次实际 CLI 探针揭示 quoted dotted trust override 不能排除项目配置，修改为已证明有效的根 TOML map 后重跑成功，没有取消相关断言或放宽限制。

进程树清理增加后，快速退出的 native fixture 曾遇 group probe EPERM；sandbox 和一次受控外部 runner 均重现，排除了“只因工具沙箱”的早期猜测。实现保持 fail-closed，把 EPERM 作为未确认存活状态在既有截止时间内复查，直到 ESRCH；重新运行全部 14 项通过。已更新共享 CODEX_ACCESS_TOKEN 的脱敏用例；最后一轮测试和类型检查使用下列最新依赖。

装配仍须安装 `@openai/codex@0.162.1` 和 MCP `1.32.1`，然后运行 **`node test/codex-adapter/native-probe.mjs`**（默认断言稳定 CLI `0.162.1`），再跑自有 suite 和全仓 typecheck。alpha 的通过不能替代稳定版；类型生成/配置探针也不能证明动态代理在线执行或 OS 全面沙箱。真实模型、账号权限与网关兼容性本次没调用。

MCP 客户端请求期限 `2147483647ms`，prompt 时钟在交互等待暂停。官方/current schema 没有建立 app-server 动态工具的服务器期限或关闭开关，所以不宣称无限等待。上游提前 resolved 时已实测原 handler Signal 中止并拒绝迟到结果。

## 候选身份

按路径、NUL、内容、NUL 排序计算 SHA-256，源码/测试组合为 `1f67ede1f4b62aad3a87cc9ff941c8fe8e224ce2f29f959bcfdca180da05c2b7`。

| 路径 | SHA-256 |
| --- | --- |
| `src/provider/codex/session.ts` | `7b82419ed8a406b6e55d09289b017edae700445afb0fdfb515facb8e97128d89` |
| `src/common/codex-adapter/config.ts` | `1f45114605e171b2ec9b516ecbc9a03645597c04234d7c1e37d64d869a663fc6` |
| `src/common/codex-adapter/protocol.ts` | `11cb4a624b060933e28407e2a26812e6d3a6b80d8b6494c5945c54f23b606e50` |
| `test/codex-adapter/fixtures.ts` | `8f25c7a9b97ac91330ae36e8c0cee345767cb3d97a05e0ba6bc262f79506f8b3` |
| `test/codex-adapter/session.test.ts` | `18b1250d255b532599e5bee4ad15c1b18e9e8a4b99aa74f1948448ad683374f1` |
| `test/codex-adapter/native-probe.mjs` | `20efbb67824aa1a7d7a94b3013c36761012f847f474f5d927e9e1bec933fab52` |
| `test/codex-adapter/fixtures/native-cli.mjs` | `a2369b32c590ec96bf327ab58f94b04cd7efffb585a2c80ccef206fd181f306d` |

| 最后一轮只读依赖 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `a0e2b0686cf90f76d1736fa6219f3add89ae32c5e485b850a1deab18e2d3eee8` |
| `src/provider/runtime/tools.ts` | `7b4e5a7975e7733634c6deffd1ac97b0b54b33429010f117d552dd69b12bf245` |
| `src/provider/runtime/session-store.ts` | `9fbdd32e5bb9df0aea64f2c8ac58dbdf3a1b19bd30cd74ace44e3830294548a2` |
| `src/common/shared/runtime-shared.ts` | `fcaa56d7d5e952dc1092b84e34875719d0e2943ae2b00e8ca14b1217b343f9da` |
