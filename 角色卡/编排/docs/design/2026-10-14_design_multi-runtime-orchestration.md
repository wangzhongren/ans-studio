# 多运行时编排接线

本次使角色执行与治理会话明确选择 demo、Pi、Codex 或 Claude，由运行时核心 Service 创建同一受治理工具集。客户已确认 ANS-RUNTIME-V2 revision 1 及必要 O1 迁移并授意开发；本文是编排独立影响评估与同范围实现细化，不增加角色权限。初始状态：未实施、未测试、未部署。

## 方案与独立影响

CLI 两个命令均解析 `--runtime`，显式参数优先于装配注入。role run 缺省继续 demo，govern 缺省继续 Pi；未知值返回用法错误，不静默选择另一引擎。共享 runtime-shared.ts 是枚举唯一来源，编排旧出口保留转出。

Pipeline 新增 `createRuntimeAdapterFactory(project, runtime, options?)`，委托 Service `createRuntimeAdapter`；保留 `createPiAdapterFactory` 兼容 alias。`selectAdapterFactory` 保留 demo createAdapter 与 piFactory 注入，新增 runtimeFactory/runtimeOptions。工厂固定所选 runtime，选项与 providerFactories 交 Service；实际引擎的 readRoot/writeRoot/shellCwd 固定项目根，demo 缺省继续只判定不落盘。

runRole/openRoleSession 与治理入口带可选 runtime。多轮持久化沿用既有开关，实际 Service store 按角色/runtime 隔离；旧自定义工厂 sessionDir 能力仍保留。shell 审读传源 runtime 并复用同一工厂；确认、报告、派发、只读 shell、verdict 的角色注入规则保持。

句柄新增可选 runtime/roleId/contextSource/nativeSessionId/contextWarning 动态属性。prompt 后读取适配器实际恢复状态；核心 resumed 表示原生恢复成功，recovered 表示恢复失败重建，桌面属主须显式转换其旧词汇。Pipeline 的 `readRoleSessionHistory({projectRoot, roleId, runtime})` 经 Service 读 ANS 回放。当前 Service 尚缺历史公开操作，已交核心属主补齐；编排不直达 Provider。

确认包装向前端原样传 CustomerInputMetadata。发行器在任何路径发行前检查原请求 signal；已中止不发行，迟到旧 yes 不能污染下一轮 writeSet。CLI settled 的 failed/aborted/timed_out 返回失败码；settled 不代表任务完成。

修改限本角色 CLI run/govern、四件 Pipeline、private common、test/编排、docs/API/map。Model/Providers/Service/shared/index/packages/app 只读。装配、桌面窗口受接口影响，由原属主接线；真实 Pi 迁移、依赖安装、Claude native hook 验证仍待对应属主。必要私有 timeout 违规引用将改为编排 shell 审核时限辅助，不扩展其他功能。

## 验证合同

基线为 2026-10-14 当前共享工作区；并行角色的路径不吸收、不改写。Pipeline 契约：`node --test test/编排/runtime-orchestration.test.ts test/编排/session-*.test.ts test/编排/shell-*.test.ts test/编排/confirmation-gated.test.ts test/编排/handback-*.test.ts`。Interface 与回归：`node --test test/编排/*.test.ts`。静态检查 `npm run typecheck` 区分本角色错误和依赖进行中。

必须验证四引擎到达正确工厂，角色/govern 能力保持，实际写根、runtime 存储隔离、动态恢复属性、失败 settled、未知值零执行。真实 Service + governed handler 验证客户确认等待→abort→旧 yes 迟到→下一轮未确认实际写入仍拒绝、文件零副作用。fake provider 只隔离模型，不替换 gate/issuer。实际依赖完成后补默认工厂离线兼容检查，不把 fake 测试称为在线模型验收。

结构验收检查 changed paths 白名单、类型引用 Model、Pipeline 不导入 Provider、common 不导入同伴私有 common、SDK 懒加载与失败不降级。当前历史缺口补齐前不声称该消费已通过。

## 本角色实施结果

2026-10-14：上述同范围方案已实施。C1H 的 Service 历史操作已就位；本角色 Pipeline 159/159、全部回归 238/238，严格 scoped TypeScript exit 0。首次全仓检查因 Claude 未安装依赖产生25项诊断；当前 SDK/MCP/zod 在 node_modules 可见后的最新全仓检查 exit 0。正常依赖清单/安装仍由 B0 验证，默认 Pi 尚待 P1。实际候选、路径与依赖指纹见 [O1 变更证据](../change/2026-10-14_change_multi-runtime-orchestration.md)。未部署、未调用模型。
