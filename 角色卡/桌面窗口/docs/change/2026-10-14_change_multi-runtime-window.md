# 桌面多引擎会话与设置实施记录

报告 **D1-R1**，生产者：桌面窗口；契约 ANS-RUNTIME-V2 revision 1，必要实现沿用客户既有授权。对应[窗口独立设计](../design/2026-10-14_design_multi-runtime-window.md)与[当前功能说明](../feature/multi-runtime-desktop.md)。节点 D1；此报告提交项目管理核验，不自行宣称全项目或真实窗口验收完成。

用户选定引擎后，会话、发送、排队、派发、回交、事件和历史都按项目/角色/runtime 固定身份。选择另一个引擎不会把后台输入投到新引擎。设置保存只写所选字段；真实文件原子保存成功才递增配置 revision。忙 Pi 的 ambient token 留到所有旧 Pi 轮次结束，下一输入重建后应用；跨项目等待消息在最后一个 Pi 轮次结束时自动继续。

## 实际改动

- `app/desktop/session.ts`：三元缓存与重建链、source runtime 队列、profile 版本、Pi 安全点唤醒、旧句柄身份守卫、原生上下文实际映射；投递失败恢复队首并保留期间新到输入。
- `app/desktop/runtime-config.ts`：消费共享设置 registry；有效 file/env/fallback/default 来源、完整 secret 掩码、空白值按未设置、白名单字符串与 URL 校验；只调用共享 env-file 原子写，不改真实开发 .env。
- `app/desktop/runtime-history.ts`：Pipeline ANS 回放 → ReplayRow；可用工具/交互锚点元数据保留；Pi 旧 JSONL 仅展示 fallback，Codex/Claude 不读取。
- `app/desktop/interface.ts`：generic 工厂、runtimeOptions 测试注入、设置/历史/精确目标 API 与 group/groupDuty 原样转发。旧 Pi/demo 注入接缝保留实际 boundary。
- `app/desktop/customer-input.ts`、`operator-channel.ts`：customer 原 signal，shell 精确句柄串行轮次的本地 signal，abort/dispose/terminal/失败清 pending；统一失效通知与迟到回答 expired。原 signal 不序列化；不扩 Model/O1 shell 签名。
- `app/main.ts`、`app/preload.cjs`、`push-batcher.ts`：新增白名单 IPC 与原样桥、runtime 历史、恢复选择和按三元身份去抖。
- 边界内旧 `boundary-refresh`、`message-queue`、`operator-channel` 源码钉子按实际三元寻址和确认生命周期更新；未删除行为断言。`pi-config.test.ts` 的默认路径以自身模块位置独立推导，不再硬编码检出目录名 ans-cli。新增 `multi-runtime.test.ts`。

没有 renderer、共享/Model/Core/Pipeline/适配器、package/env/Git 写入。boundary 定义由 Governance 在其他固定上下文更新，非本角色修改。

## 当前证据

环境 Node v24.14.0 / macOS，真实下游 Pipeline/Service 与假 Provider；所有配置/持久化测试只写系统临时目录。SDK/模型网络请求零次。

| 检查 | 实际结果 | 覆盖 |
| --- | --- | --- |
| Window 自有 22 个单元文件 | 171/171，exit 0，无跳过 | 全部逐文件授权窗口单元；包含新增 15 项 |
| 新 multi-runtime 单元 | 15/15（同全组中） | 四引擎真实 Pipeline/Service；跨项目/引擎、source 派发/回交/队列、profile 成败与多 Pi 跨项目安全点、file/env 空白+fallback 掩码、URL 拒绝、确认原 signal与shell终态/关闭、旧流守卫、Pi legacy 不串其他引擎、IPC/层导入检查 |
| strict tsc --noEmit --pretty false | exit 0，无输出 | 当前仓库 src/test/app 全 include；只读检查，非全仓行为验收 |
| scoped git diff --check | exit 0 | 本角色 app/desktop/main/preload、逐文件窗口测试与资料 |

原始输出：[窗口单元](2026-10-14_multi-runtime-window-tests.txt)、[类型检查](2026-10-14_multi-runtime-window-typecheck.txt)。实际候选/消费依赖 SHA-256、Node、OS、只读 HEAD 与检查结果：[manifest](2026-10-14_multi-runtime-window-manifest.txt)。全组命令：`node --test test/桌面应用/{ans-wiring,boundary-refresh,composer-images,diagnostics,dispatch-delivery,dispatch-fresh-enum,genesis-bootstrap,handback-delivery,hot-path,interface,message-queue,operator-channel,operator-wiring,p0-halt-and-images,pi-config,project,queue-withdraw-lru,session-history,session-rebuild-race,session,su-effective-boundary,multi-runtime}.test.ts`。

## 限制与下一阶段

窗口层单元已通过，可释放 U1/T1 消费此[实际 API](../../api-spec.md)。真实 Electron、renderer 切换/配置/失效卡、布局及完整任务流由 U1/T1 另行验证，未在本报告冒充通过。真实在线账号/模型和 OS 沙箱范围也不由假 Provider 单元证明。

新 generic 工厂与历史只经 Pipeline，不直接创建 Provider/SDK。既有公开门禁枚举/规则导入，以及 legacy demo/request-anchor 的 Provider 工具/常量接缝延续已批准旧结构；未借此次任务迁移这些 unrelated legacy 路径。
