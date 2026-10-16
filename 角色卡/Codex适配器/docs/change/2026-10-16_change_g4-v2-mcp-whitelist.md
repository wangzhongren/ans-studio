---
id: codex-mcp-whitelist-change
type: change
title: G-4 V2（P2）Codex 侧白名单化：定义注入单条 root map＋三处恰等＋mcpToolCall 行映射＋降级行
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [codex-mcp-surface-probe, codex-web-search-change, role-mcp-install-assessment]
---

# G-4 V2（P2）：Codex 外来 MCP 白名单化实施（按 P0 探针结论落地）

依据：客户 2026-10-16 批准的 V2 分批（P1 Claude→**P2 Codex**→P3 Pi）与 PM 派发；实施规格＝产品提案 revision 2 §5.3「Codex（P2）」行必做项①-⑤，形状事实＝本角色 P0 探针记录 [probe_mcp-surface](2026-10-16-probe_mcp-surface.md)（逐项定格，本批按其落地）。契约面＝运行时核心已落盘 `RuntimeProviderOptions.installedMcpServers`（`InstalledMcpServerV1{name,command,args,env?}`；Service 在 `providerFor` 读取 `docs/mcp/**` 后注入——本适配器**纯消费**、不找文件、不写盘）。

## 改动（本角色边界内 6 文件；0 git 提交）

- **`src/common/codex-adapter/config.ts`**（+40）：
  - `INSTALLED_MCP_TOOL_TIMEOUT_SEC = 300`（评估 R6 per-call 超时；P0 探针实证 `tool_timeout_sec` 键与 0.25s 生效——集中单点可调）。
  - `mcpServersOverride(disabledServers, installed)`（新增；`:79`）：**单条合并 root map 的单一编码来源**——白名单定义（command/args/env＋`default_tools_approval_mode="approve"`＋`tool_timeout_sec`）与禁用集（`{enabled=false}`）编入**同一条** `mcp_servers={…}`；全字符串 `JSON.stringify` 编码（探针转义铁律）；零条目 ⇒ `undefined`（不产覆盖）。`safetyOverrides` 增第 4 参 `installed`（缺省 `[]`＝逐字现状，白名单空时输出与旧实现逐字节同）。
- **`src/common/codex-adapter/protocol.ts`**（+30）：`mcpToolName(server, tool)`＝`mcp__<清洗 server>__<tool>`（清洗 `-`→`_`；探针实证桥形态）；`mcpToolCallNative(item)`＝`mcpToolCall` item → native-result 事实块（文本块保真、其余 `unsupported`；`status:"failed"`/error ⇒ `isError`；纯函数容错不抛）。
- **`src/provider/codex/session.ts`**（+203/-56）：
  - `prepareInstalledMcpServers(declared, environment)`（导出；`:51`）：校验（名/保留名/command/args/env——与读取器同口径，纵深防御）＋**清洗碰撞拒绝**（`-`→`_` 归一后重名＝配置侧直接拒；探针 §5.3 残余 2 的 P2 落点；含同名重复；大小写保留不折叠）＋**env 引用展开**（`env:NAME` 取 bind 时环境快照真值；真值缺失/空 ⇒ 该变量不带入）。装配前抛错、零副作用（`:313-314`）。
  - **进程级恰等**（`:402-414`）：禁用集收窄为 `allServers.filter(n => !allowed)`（无白名单外 server 时**不**二次起进程；白名单空＝旧「全量 disable」路径逐字同）；生效 `enabled` 集必须**恰等于**白名单名集（残留/缺失皆拒开工）。
  - **线程级恰等**（`:500`）：`mcp_servers: {…{enabled: allowed.has(name)}}`（白名单空＝全 false 逐字现状）。
  - **目录级恰等（名字集）**（`:584-591`）：catalog `data` 名字集恰等于白名单集＋游标空——**不沿用「data 必须为空」判据**（探针：失败白名单条目仍在 data）。
  - **降级行**（`:359-368` helper＋`:593-596` catalog 扫掠＋`:516-524` 通知路径）：白名单 server `failed`/`cancelled` ⇒ 一条 `message` 行（摘要类别化「已安装 MCP「X」未连接：启动失败/已取消」；detail v1 `{source:"mcp-startup", name, state, error(截 300＋经 scrub)}`）；**去重单点**（catalog 扫掠与 `mcpServer/startupStatus/updated` 通知两路共用、每 server 至多一行）；通知面订阅**提前**到目录复核之前（缩小「状态先于监听」丢失窗）；**不拒开工、不毁轮次**。
  - **`mcpToolCall` 行映射**（`:548-575`）：`item/completed` 新增分支——走核心投影单点（emitTool `{origin:"native-result", phase:"result", toolName: mcp__…, toolCallId: item.id, input:{rule:"none", args}, native:{isError, content}, error?, durationMs?}`；legacy 路径 kind accepted/denied、摘要截 1024＋「…」）；status/error/result 三态如实；**不进隔离**（白名单调用＝已授予能力的执行事实，非越权信号——探针建议、本批落定）。
- **`test/codex-adapter/fixtures.ts`**（+38）：Behavior 增 `mcpServers`/`mcpCatalog`/`catalogNextCursor`（config/read 的 enabled 从 `-c` 覆盖里 `"name"={enabled=false}` 词条推导；catalog 缺省从线程配置推导 enabled 集——**线程级禁用不进 catalog**，镜像 P0 探针实况）；新增 `startup()`/`mcpToolCall()` 发射器。旧行为面（foreign/catalogForeign/configFails）逐字保留。
- **`test/codex-adapter/mcp-whitelist.test.ts`（新；230 行 12 例）**：探针单元格转正——①转义/单条 map 逐字（含引号/反斜杠/空格/中文/空串/approve/300）；②白名单单进程＋env 引用按快照展开；③白名单外 server 收进**同一条** map 禁用条目；④进程级恰等（残留/缺失拒开工）；⑤目录级名字集恰等（failed 白名单过、白名单外/缺失/游标拒）；⑥坏 server 降级一行（无 turnId、脱敏、会话照常）；⑦startupStatus 通知降级（去重/foreign 无声/starting 无声）；⑧两路径去重单行；⑨`mcpToolCall` → native-result 事实（字段全集、非文本→unsupported、不隔离）；⑩legacy 路径三态＋截断标记；⑪声明校验（碰撞/保留名/坏形状＋装配前零副作用）；⑫零安装逐字现状。
- **`test/codex-adapter/native-probe.mjs`**（+21）：新增真 CLI 单元格——**生产编码器**（`safetyOverrides` 第 4 参→单条合并 map）对 pinned 0.162.1 `--strict-config` 校验：readback `enabled` 恰为白名单、foreign disabled、`default_tools_approval_mode:"approve"`、`tool_timeout_sec:300`、args 含空格/引号转义逐字往返、config 面不启动夹具。

## 单条 root map 形态（生产逐字；示例）

```
mcp_servers={"probe-mcp"={command="/usr/bin/node",args=["server.mjs"," arg with spaces","quote\"q"],env={"K"="v"},default_tools_approval_mode="approve",tool_timeout_sec=300},"foreign"={enabled=false}}
```

（探针铁律：**连续两条 `-c` 同根键＝后者整体覆盖不合并**——定义与禁用集必须一条。禁外与定义同源单一编码器，`safetyOverrides` 白名单空时输出与旧实现逐字节相同。）

## 验证（本机 darwin 25.6.0 / Node v24.14.0）

- 自有 `node --test test/codex-adapter/*.test.ts` ⇒ **47/47** 绿（基线 35＋新 12；0 skip）。
- `npm run typecheck` ⇒ 全仓 0 错。
- `node test/codex-adapter/native-probe.mjs` ⇒ pinned 0.162.1 **exit 0**：`whitelistMap {enabledAfter:["ans_probe_whitelist"], disabledForeign:false, approvalMode:"approve", toolTimeoutSec:300, argsRoundTrip:4}`＋既有全项（sandbox/approval/features/动态工具 schema）；外部模型 0、无登录、无真实网关。
- 全量 `node --test "test/**/*.test.ts"` ⇒ **1931 计 / 1922 过 / 8 红 / 1 skip**；8 红**全部**在 `test/测试/g1-verify/**`（3）与 `test/测试/g4-skill-verify/**`（5）＝测试角色旧钉（V2「零产品实施」断言随他批 V2 波在飞而红，非本批文件；本批 12 新例 0 红）。

## 未验边界与残余（如实登记）

1. **真实网关对 `type:"namespace"` 桥的接受性**（P0 探针已登记）：本地全 loopback 绿；真实 ANS 网关的下发/回传属**验收轮**（禁真实网关约束下不可验）——P2 开工前置项由派发方另排。
2. **真机端到端**（装-看-用-撤全链、真机桌面）属测试/客户跑；本批验证＝假 engine 全链＋真 CLI 配置面（未在真 app-server 上跑完整受治理轮——探针轮已在真 app-server 上定格全部原生形状，本批改动只把我方编码对齐该形状）。
3. **env 引用真值经 `-c` argv 传递**：真值随 app-server 命令行参数传递（进程生命周期内对同机进程可见，如 `ps`；Windows 命令行动全面）。声明文件零凭据面（只存 `env:NAME`）原纪律保持；route (a)（`-c` 注入）机制固连，替代路线（如经 app-server env 中转）另行评估（登记残余）。
4. env 引用真值缺失/空 ⇒ 该变量**不带入**（server 自会以启动失败走降级行；不拦会话）——语义已定、残余在于无法为「真值拼错但 server 不报错」兜底。
5. `approve` 审批模式的完整语义边界（对 write 型工具/guardian 复核）未深挖（沿探针未定格项）；Windows 全项未跑；清洗碰撞归一仅 `-`→`_`（大小写不折叠——无证据 codex 折叠大小写，保留原字符集语义）。
6. `mcpToolCall` 行经核心 `native-result` 事实（投影单点）；桌面 required-v1 折叠沿既有工具行体系（未新造行面）；桌面侧样式微调如有属桌面UI 小件。
7. `test/测试` 8 旧钉随他批 V2 波待翻新（本批未处理，沿派发约束）。

## 边界声明

只写本角色 Section 1 内文件（`src/provider/codex/session.ts`、`src/common/codex-adapter/**`、`test/codex-adapter/**`、本记录与 changelog/memo/feature-map）；**未碰**运行时核心/门禁引擎在飞文件、`app/**`、`src/service/**`、其他角色文件；未 git 提交；未发真实模型请求、未碰真实网关与真机轮目录。
