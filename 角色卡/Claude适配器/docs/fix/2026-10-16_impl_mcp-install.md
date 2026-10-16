---
id: claude-mcp-install-implementation
type: fix
title: G-4 V2 P1（Claude）——按角色安装的外来 MCP 接入实施记录
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: 已实施待独立验证（未 git 提交）
related: [claude-mcp-surface-probe, role-mcp-install-assessment, claude-session]
---

# G-4 V2 P1（Claude）：外来 MCP 按角色安装接入——实施记录

客户 2026-10-16 批准 G-4 V2 口径与 P0 探针轮；本批＝**P1（Claude 路径）实施**，按 PM 派发（探针结论落地点逐条）与运行时核心评估 [`2026-10-16_assess_role-mcp-install.md`](../../../运行时核心/docs/fix/2026-10-16_assess_role-mcp-install.md) §二；P0 结论见本角色[探针记录](2026-10-16_probe_mcp-surface.md)。契约（已由运行时核心 wave A 落盘、本批纯消费）：`RuntimeProviderOptions.installedMcpServers?: readonly InstalledMcpServerV1[]`（`src/model/runtime.ts:422/646`；读取器 `src/common/runtime-core/mcp-declarations.ts`；Service `providerFor` 按角色注入 `src/service/runtime/session.ts:128`），`InstalledMcpServerV1{name,command,args,env?}`，env 值＝字面量或 `env:NAME` 引用。

## 一、改了什么（逐点，行号以落盘后工作树为准）

### 1.1 `src/provider/claude/session.ts`（本角色边界内唯一生产文件）

| 位置 | 改动 |
| --- | --- |
| `:6` | `import { fileURLToPath } from "node:url";`（launcher 路径解析） |
| `:46-56` | 新常量：`INSTALLED_MCP_TOOL_TIMEOUT_MS = 60_000`（外来 server 逐调用超时：单次挂起不得吃满整轮；ANS 自家 server 保持上游上限——其 handler 自持时限）、`MCP_ENV_LAUNCHER = fileURLToPath(new URL("../../common/claude-adapter/mcp-launcher.mjs", import.meta.url))` |
| `Engine`（`:29-42`） | 新增 `statusReported: boolean`（每引擎一次状态报告）；`nativeCalls` 值新增 `toolName`（结果配对泛化到非 WebSearch 原生工具） |
| `systemPrompt` 之后（`:77-99`） | 构造期装配：`resolveInstalledEnv`（`env:NAME` 对**构造期 env 快照**展开；引用目标缺失 ⇒ 该键省略——server 自行失败经状态面可见）＋ `installedServers/installedNames/installedToolPrefixes/installedAllowedTools/installedMcpConfigs`（每项＝launcher 包装配置，见 §三） |
| `emitUnattributed` 之后 | `reportInstalledServerStatus(current, turn)`：`query.mcpServerStatus()` 一次、只对**已安装名**中 `failed`/`needs-auth` 条目发一条 message 行（类别＝前导 `CODE` token，否则截断首段 ≤80 字符；**绝不落 error 正文全文**）；查询抛错被吞 |
| `queryOptions`（`:317-325`） | `allowedTools: [...names, ...installedAllowedTools, ...(webSearchEnabled ? ["WebSearch"] : [])]`（安装集＝server 级 `mcp__<name>` 登记；无安装时逐字旧数组）；`mcpServers: { ans: server, ...installedMcpConfigs }`；`strictMcpConfig: true` **维持不变** |
| PreToolUse（`:341-354`） | ans 分支与 WebSearch 分支之间**新增放行分支**（判据见 §二）；命中 ⇒ 发 `native-start` 行＋`permissionDecision:"allow"`、**不注入 `updatedInput`**（模型入参原样到第三方 server；ANS 请求上下文 token 绝不外泄） |
| 消息泵（`:369-395`） | ① WebSearch 注册补 `toolName`；② 新增已安装工具帧注册（`block.name` 命中 `mcp__<已安装名>__` 前缀 ⇒ `nativeCalls` 登记**只做结果配对**——start 行已由 hook 发）；③ 结果消费门改 `webSearchEnabled || installedToolPrefixes.length > 0`，配对行 `toolName` 取登记值（WebSearch 路径逐字等价：`text \|\| call.toolName`） |
| `prompt()`（`:466`） | 首轮输入前：`if (!current.statusReported) { current.statusReported = true; await reportInstalledServerStatus(current, turn); }`（每引擎一次；不毁轮次） |

### 1.2 `src/common/claude-adapter/mcp-launcher.mjs`（新增；env 收窄交付面）

P0 探针实锤「CLI 对进程 server 全量继承 env（含 `ANTHROPIC_API_KEY`）」。收窄方案＝命令包装器：装配侧注入的 `command` **恒为本启动器**（`process.execPath`），由它以白名单 env 重 spawn 声明的真命令。协议（与装配侧成对，改动须两处同改）：

- **argv**：`<real-command> [args…]`（argv 无秘密，沿声明面纪律）。
- **env 入**：`ANS_MCP_LAUNCHER_PASSTHROUGH`＝JSON 名单（＝声明的 env 键；真值已由 CLI 按常规通道合入启动器自身 env，按名转发）；该变量本身与 `ELECTRON_RUN_AS_NODE` 永不转发。
- **env 出（真命令）**：基线定位键（`PATH/HOME/TMPDIR/TEMP/TMP/SystemRoot/WINDIR/LANG/LC_ALL/SHELL/USER/LOGNAME/TERM` 按存在透传）＋恰为名单内的声明键；**其余一律不传**。名单损坏 ⇒ 只保留基线（宁窄勿宽）。
- **stdio 三通道逐字继承**（MCP stdio JSON-RPC 直通；启动器自身绝不写 stdout，只写 stderr 报错）。
- **信号**：SIGINT/SIGTERM/SIGHUP 转发真命令；真命令退出后启动器以其退出码/信号退出（信号路径先摘自装 handler 再自击，避免 handler 吞默认终止）。
- **打包面**：`electron-builder.yml` `asar: false`（`files` 含 `src/**`）⇒ 启动器以**明文真实路径**随包分发（`import.meta.url` 解析在 dev/打包两态一致，无 asar 读面问题）；Electron 主进程态由装配侧置 `ELECTRON_RUN_AS_NODE=1`（仅 `process.versions.electron` 时；纯 node CLI 态不置），使 `process.execPath`（Electron 二进制）以 Node 语义运行启动器。

### 1.3 测试

- `test/claude-adapter/session.test.ts`：**+4 例（该文件 33→37）**；`fake()` 夹具扩展可选 `mcpServerStatus` 注入＋`statusCalls` 计数。新例：①装配（未注入⇒`mcpServers` 恰 `["ans"]` 逐字现状＋零状态查询；注入⇒launcher 包装逐字、`env:NAME` 展开、引用缺省省略、`alwaysLoad:true`＋`timeout:60000`、server 级 allowedTools）；②放行对抗（活轮＋名命中＋`source==="dynamic"`＋前缀一致⇒allow 且**无 `updatedInput`/无 `__ans_call_context`**；九种对抗：他名/source=sdk/user/无 provenance/未绑定/未知 prompt_id/前缀错位/Bash/WebSearch 能力位关 ⇒ 全 deny；ans 分支逐字不动）；③消息泵配对（start/result 同 `toolCallId`、结果文本如实、未登记迟到结果不消费不归轮）；④状态报告（failed/needs-auth 各恰一行、connected 静默、error 正文不落、每引擎一次（两轮一查）、查询抛错不毁轮、零安装零查询）。
- `test/claude-adapter/mcp-launcher.test.ts`：**新增 3 例（launcher 边界直测）**——env 收窄（基线键＋声明白名单达真命令；`ANTHROPIC_API_KEY`/`ELECTRON_RUN_AS_NODE`/messaging token/config dir/透传变量本身全缺席）、名单损坏宁窄（不宽于基线）、退出码透传与 spawn 失败 127＋有界 stderr。**套件合计 40/40**。
- `test/claude-adapter/mcp-installed-loopback.probe.ts`：**新增常备回环探针**（P0 探针的「转正」形态：**生产装配零包裹**——声明文件 `docs/mcp/<name>.md` → 读取器 → 装配 → launcher → 放行 → 配对，唯一包裹＝免扰流量 flags）。3 相位全绿（见 §四）。
- P0 探针（`mcp-surface-loopback.probe.ts` 等）保留为冻结未知项的历史证据，不在本批改动。

## 二、放行判据（逐条）

命中全部条件才 `allow`（否则落回既有兜底：活轮内 blocked 行＋deny；无轮 emitUnattributed）：

1. `hook.mcp_server` 存在，且 `hook.mcp_server.name ∈ 已安装名集合`（集合＝本适配器实例构造期由 `options.installedMcpServers` 冻结——读取层已拒非法字符/保留名（`ans`/`ans_codex`）/重名文件，装配侧纯信任）；
2. `hook.mcp_server.source === "dynamic"`（P0 冻结实值；`strictMcpConfig:true`＋`settingSources:[]`＋`plugins:[]`＋无 agents 已封死其余来源，source 并核作纵深防御）；
3. `hook.tool_name` 以 `mcp__<该名>__` 开头（前缀一致，防 provenance 与工具名错位）；
4. 轮次活性（照抄 ans 分支）：`prompt_id` 已绑定原轮 ∧ 原轮＝当前活动轮 ∧ 原轮/原轮信号/引擎信号/hook 信号四者皆未中止。

返回体**不含 `updatedInput`**（P0 与 WebSearch 先例同纪律）；`:239` 的 `canUseTool` deny-all **未动**（P0 实证 hook-allow 不经它）。

## 三、装配形态（queryOptions 增项逐字）

```jsonc
// mcpServers 追加项（每已安装 server）：
{
  "type": "stdio",
  "command": "<process.execPath>",
  "args": ["<MCP_ENV_LAUNCHER>", "<声明 command>", "…声明 args（argv 原样，不经 shell）"],
  "env": { "<声明键>": "<字面量或展开值>", "ANS_MCP_LAUNCHER_PASSTHROUGH": "[\"<声明键…>\"]",
           "ELECTRON_RUN_AS_NODE": "1" /* 仅 Electron 态 */ },
  "alwaysLoad": true,          // 工具不进检索延迟（沿评估 §2.2-①）；顺带阻塞至连接有果（P0：本组成下与缺省无异）
  "timeout": 60000             // INSTALLED_MCP_TOOL_TIMEOUT_MS：逐调用时限，单挂不得吃满整轮
}
```

`strictMcpConfig` 维持 `true`（恰保证「除本宿主显式注入外一概不生效」）。状态报告行文案：`已安装 MCP「<name>」未连接：<类别>`。

## 四、验证与证据

证据目录：[2026-10-16-mcp-installed-evidence](2026-10-16-mcp-installed-evidence/)（`probe-mcp-installed.json` 全量报告、`probe-stderr.txt`、`unit-claude-adapter.txt`、`typecheck.txt`、`full-suite.txt`、`diff-check.txt`）。环境 Node v24.14.0 / Darwin 25.6.0；SDK 0.3.299＋bundled CLI 2.1.299。

**常备回环探针（真 CLI＋127.0.0.1 假网关＋假凭据；唯一包裹＝免扰 flags；零真实网关请求）3 相位全绿**，原始数字：

1. `installed-execute`（声明 `docs/mcp/probe.md`，含 `FAKE_MCP_ECHO_REF=env:PROBE_REF_VALUE` 引用）：
   - **env 收窄链实测**：假 server 收到 env **恰 8 键**——`FAKE_MCP_DELAY_MS / FAKE_MCP_ECHO_REF / FAKE_MCP_MODE / FAKE_MCP_RECORD_DIR / HOME / PATH / TMPDIR / __CF_USER_TEXT_ENCODING`（末项为 macOS CoreFoundation 强制注入）；`ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/`CLAUDE_CONFIG_DIR`/messaging token/socket/session id/`ANS_MCP_LAUNCHER_PASSTHROUGH`/`ELECTRON_RUN_AS_NODE` **全部缺席**（逐键断言）；引用值真值只达 server env（只落键名；报告断言值不入证据）。
   - 生产放行分支实测命中：模型发 `mcp__probe__echo` ⇒ 假 server `tools-call-received`（`argumentKeys=["text"]`——无 `__ans_call_context`）⇒ 结果 `fake-echo:probe-input` 回模型（tool_result is_error=false）；事件面恰一对 `tool_call(start)`＋`accepted(result)`（同 `toolCallId`），零 denied；settled completed；`mcpServerStatus` `probe=connected`，其 `config.args=[launcher, node, fakeServer]`（launcher 包装在状态面可见）。
2. `installed-broken`（命令不存在）：行 `已安装 MCP「brokenprobe」未连接：Connection closed` 恰一条（launcher 级 spawn 失败 ⇒ CLI 侧类别＝传输关闭；深层 ENOENT 在 launcher stderr/CLI 日志，不落行）；首轮请求零 probe 工具；settled completed；状态 `failed/Connection closed`。
3. `installed-hang`（initialize 永不答）：首请求于 spawn 后 **~27s** 释放（P0 同界），工具缺席、无事件行、settled completed；状态 `failed/Request timed out`；**本轮不出「未连接」行**（报告时点该 server 仍 pending——见 §五残余 3）。

**门禁与全量**：`test/claude-adapter/*.test.ts` **40/40**；`npm run typecheck` 退出 0；`git diff --check` 干净；全量 `node --test "test/**/*.test.ts"`＝**1931 计 / 1922 过 / 8 红 / 1 skip**——**8 红全部在 `test/测试/`**（`g1-verify/g1-copy-and-nails`×3、`g4-skill-verify/{c-preauth,d-card-guard,h-scope-audit}`×5），逐条属**测试角色旧钉待翻新**（PM 派发已预告「不处理」）：其断言口径为「V2 未实施」（如 `h-scope-audit` 逐字「产品路径不得出现 MCP 安装工具名」）与旧预授权/卡文本形态；红因＝**并行 V2 wave（运行时核心/门禁引擎/编排/桌面）落盘**，命中文件列表全部是他角色文件（`boundary-core.ts`/`model/runtime.ts`/`run-role.ts`/`runtime/{schema,tools}.ts`/`app/desktop/session.ts`），**本批文件零命中**（`provider/claude` 不在其清单内）；实施前本批自跑基线＝1814 计 / 0 红（Task-1 快照），8 红为本批开始后并行批次落盘所致，**非本批引入**。

## 五、未验边界与残余（如实）

1. **客户真网关/真第三方 server 未验**（本轮全离线假件）；首装真 server 的端到端（装-开-调-卸）属集成态验证。
2. **名清洗碰撞残余**（读取器明确不做、评估 §5.3 残余 2）：`a-b` 与 `a_b` 两声明并存时是否在 CLI 工具面合并/混淆未验；本适配器判据对错位一律 **fail-closed**（deny＋blocked 行），但「应当可用而不可用」的形状未定格——建议随 P2/P3 配置侧拒绝一同裁定。
3. **挂起 server 的状态行时点**：状态报告为「引擎首轮前一次查」；此刻仍 `pending` 的 server（挂起连接）本轮不出行（工具缺席仍如实、次会话出行）。「耐心重查/轮末复查」未做（会引阻塞与晚发语义，须另裁）。
4. **`ELECTRON_RUN_AS_NODE` 打包态未实跑**（本机测试为纯 node 态）；Electron 主进程启动器路径属打包回归项（启动器/打包面逻辑已按 `asar:false` 对表，未在真包内运行）。
5. **Windows**：launcher 直 spawn 语义在 Windows 下对 `.cmd` 壳（如 `npx`）需声明侧用 `cmd /c` 形态（沿既有纪律不动 shell:true）；未实机验证。
6. **超时值 60s 为适配器定值**（常量单点，易调）：未按 server 逐项可配（声明面无该字段，属后续契约面）。
7. **`needs-auth` 路径未在真 CLI 复现**（单元已按形状覆盖；真件为 HTTP 型 server 场景，V1 声明面 stdio 限定）。
8. 家族残余（P0 记录 §五）依旧：HTTP/SSE、tool search 组合等未验。

## 六、边界声明

只写本角色边界内文件：`src/provider/claude/session.ts`、`src/common/claude-adapter/mcp-launcher.mjs`（新增）、`test/claude-adapter/{session.test.ts,mcp-installed-loopback.probe.ts}`（后者新增；P0 探针与夹具未动）、本记录与 changelog/memo/证据目录。**未碰** `src/model/runtime.ts`、`src/service/**`、`src/common/runtime-core/**`（契约与读取器为运行时核心 wave A 已落盘产物，本批纯消费）、其它角色文件；未 git 提交；零真实网关请求（全程 127.0.0.1 假件＋假凭据，逐请求断言）。
