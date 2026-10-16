---
id: pi-role-mcp-install-p3
type: change
title: G-4 V2（P3 Pi）——按角色安装的外来 MCP：装配/前缀放行/env 收窄/dispose 收口
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [pi-probe-mcp-surface, role-mcp-install]
---

# G-4 V2（P3 Pi）：按角色安装的外来 MCP 已实施待验证

**状态：已实施 / 待验证**（独立验证与真机复验未进行；未 git 提交）。依据＝客户 2026-10-16 批准 G-4 V2（分批 P1 Claude→P2 Codex→**P3 Pi**）；契约面＝`src/model/runtime.ts` 已落盘的 `InstalledMcpServerV1` / `RuntimeProviderOptions.installedMcpServers`（Service 按角色注入、适配器纯消费）；实施口径＝本轮 PM 派发六条；技术定格＝本角色 P0 探针 `docs/fix/2026-10-16_probe_mcp-surface.md`（32/32 PASS）。

## 一、改了什么（全部本角色 Section 1 内）

### 1.1 `src/common/pi-adapter/real-adapter.ts`（唯一产品文件；`src/provider/pi/session.ts` **零改动**——`installedMcpServers` 经 `RuntimeProviderOptions` 原样流入）

- **:106** 新增 `loadPiMcp()`：动态 import `@earendil-works/pi-mcp`（自持 StdioTransport 用；同 `loadPi` 先例——仅本文件 import Pi 包且全走动态）。**依赖声明登记**：该包是 pi-coding-agent 的传递依赖，运行期可解析；如需在打包/裁剪面固化，应把 `@earendil-works/pi-mcp` 显式加进 `package.json`——**归装配角色**，本角色未越界（已上报）。
- **:478-540 新节「G-4 V2：按角色安装的外来 MCP（stdio 限定）」**：
  - 导出 `mcpToolAllowedByWhitelistedServer(toolName, whitelistedServerNames): boolean`——**放行判据（P0 探针草案逐字；供接线测试）**：`mcp__` 起始 ＋ 任一白名单名（按 SDK 同名清洗 `[^A-Za-z0-9_]`→`_`）的 `mcp__<清洗名>__` 前缀命中；`__` 分隔防近似串。
  - 导出 `resolveInstalledMcpServers(servers, env)`（纯函数）＋ `ResolvedInstalledMcpServer`：`env` 值 `env:NAME` ⇒ **只自传入的进程环境展开**（生产传 `process.env`）、缺失/空引用 ⇒ **抛错**（构造期 fail-closed，先于任何子进程/网络；绝不静默省略）；字面量原样。**绝不落盘/落日志**（值只存活内存与子进程环境）。
- **:570-577** `buildGovernanceExtension` 的 `context.allowedToolNames` 类型由 `ReadonlySet<string>` 放宽为结构面 `{ has(name: string): boolean }`（**只消费 `.has`**；`ReadonlySet` 天然满足，既有调用零变化；文档同步）。
- **bindRole（:1171-1229 装配块）**：
  - `installedMcp` 复制自注入面（**不读任何盘上来源**——不读 `mcp.json`/`~/.pi`/项目信任面）；**无声明 ⇒ `mcpActive=false` ⇒ 以下全部零装配**（扩展不加载、bindExtensions 不调用、放行面＝原快照 Set）。
  - 有声明：`resolveInstalledMcpServers(installedMcp, process.env)`（缺失引用即抛）→ `mcpExtension = createMcpExtension({...})`：
    - `loadConfig: () => ({servers: 注入声明逐一映射, errors: []})`——`exposure:"direct"`、`source:"ans-installed"`；
    - `createTransport`（**自持 transport，环境收窄**）：`new StdioTransport({ command, args, cwd, env: { PATH: process.env.PATH ?? "", ...声明env }, inheritEnv:false, stderr:"pipe" })`——P0 探针实据：SDK 默认 transport 会把**全量宿主 env**（含凭据）交给第三方 server；
    - `startupWaitMs`：仅当 `opts.mcpStartupWaitMs` 显式给出（测试接缝/慢 server 场景）；缺省＝SDK 默认 10000。
  - **放行面（:1211-1213）**：`allowedSurface = mcpActive ? {has: 注入集.has || 前缀判据} : allowedToolNames`——**构造期 1128 与门禁 499-504 同一判据**；`extensionFactories: [governance, ...(mcp? [mcp]: [])]`（:1228）。
- **:1297-1317**：1128 硬校验改用 `allowedSurface`；**`session.bindExtensions({})` 置于校验之后、仅在 `mcpActive` 时补调**（全仓此前 0 调用）、失败先 `session.dispose()` 再抛（防悬挂会话/子进程）——顺序钉子：校验在 bindExtensions 前 ⇒ 构造期快照**只可能看到注入名**（MCP 未建连；恢复路径的转录装载同样受 registry 过滤，`agent-session.js:1155-1159`），前缀面参数化为未来顺序变化留防；**运行期唯一活口闸＝门禁（逐调用执行前拦）**。
- **:1041-1052 / :1346-1349 dispose 收口（必做项）**：`RoleSessionDeps.sessionShutdown?`（仅装配 MCP 时提供）：`makeRoleSession.dispose` 在 `session.dispose()` **之前**补发 `session.extensionRunner.emit({type:"session_shutdown",reason:"quit"})`——`withTimeout(…, 5000)` 有界、try/catch best-effort（失败只记诊断 `session.shutdown.failed`，不抛出；最终兜底＝宿主退出时 pi-mcp exit-hook 杀进程组）。**无 MCP ⇒ 不提供 ⇒ dispose 逐字旧行为。**
- **:1070** `RealPiAdapterOptions.mcpStartupWaitMs?`（测试接缝，文档注明）。

### 1.2 tools-only（V2 裁定①：资源工具三名不接）

放行面**只含** `mcp__` 前缀与精确注入名 ⇒ 资源工具三名（`list_mcp_resources`／`list_mcp_resource_templates`／`read_mcp_resource`）**不在放行面**，调用一律被门禁拒绝；构造期硬校验不受影响（先于建连）。**如实登记（实测定格）**：若白名单 server **自报 resources**，SDK 会把三名登记并声明给模型（SDK 行为，非本合同面；实测活动面 `["mcp__srv_r__echo","list_mcp_resources","list_mcp_resource_templates","read_mcp_resource"]`）——「不接」的保证面＝**不可执行**（门禁拒）；若 PM 要求模型面**不可见**，需 SDK 侧挂点或另裁（loadout 快照按请求粒度、扩展钩子按轮粒度，strip 无法给全确定性，本轮不做——诚实说明见 P0 探针 §六）。

## 二、实证（探针单元格转正；全离线 faux＋本地 stdio 夹具）

测试 `test/pi-adapter/installed-mcp-servers.test.ts`（**8 例**）：

| 例 | 断言要点 | 实据 |
|---|---|---|
| 判据单元 | 前缀命中/清洗（-→_）/`__` 边界/空白名单/未清洗原名不中；`env:NAME` 展开、缺失即抛、不改输入 | 纯函数 |
| 接通＋放行＋端到端 | `bindRole`（内含 bindExtensions 补调）后 direct 工具进活动面（名字＝`mcp__srv_a__echo`）；门禁放行 ⇒ 工具真跑到服务端（call-log）且结果进转录；settled 恰 1/轮 | 生产适配器真实路径＋faux |
| 无声明零变化 | 不注入 ⇒ 扩展清单仅 `<inline:ans-governance>`、活动面＝注入集、bindExtensions 不调用 | 同上 |
| env 收窄 | 子进程 env 键＝`[PATH, PROBE_ENV_DUMP, PROBE_MARKER]`∪平台注入 `__CF_USER_TEXT_ENCODING`（macOS 级，`env -i` 亦见；探针单核）；`env:NAME` 展开为真路径；宿主哨兵键不泄漏 | 夹具 dump env 键名 |
| env 缺失 | `env:NAME` 不存在 ⇒ `bindRole` 构造期抛错（不静默省略、不拉子进程） | assert.rejects |
| tools-only | 带 resources 的 server 照常接通（硬校验不误伤）；资源工具被 SDK 激活时调用被拒（`非注入的 ANS 工具，拒绝执行：list_mcp_resources`）；同轮 tools 调用照常真执行 | 转录＋事件双面 |
| dispose 收口 | `RoleSession.dispose()` 后子进程退出（≤5s） | pid 存活轮询 |
| startupWaitMs | 慢 server（init 延迟 2500ms）＋上限 700ms ⇒ 首轮 **707ms** 钳位、次轮 2ms 不再等；上限 0 ⇒ 首轮不等；后台接通后工具动态出现 | 生产 RoleSession.prompt 计时 |

## 三、验证与归因

- `node --test "test/pi-adapter/"*.test.ts` → **278/278 绿**（基线 270 ＋ 本批 8）。
- `npm run typecheck` → **全仓 0 错**。
- 全量 `node --test "test/**/*.test.ts"` → **1931 计 / 1921 过 / 9 红 / 1 跳**。**9 红逐条归因（均非本批文件）**：
  - 8 红在 `test/测试/`（`g1-verify/g1-copy-and-nails`、`g4-skill-verify/h-scope-audit` 等）——G-4 wave 落地后的**旧钉待翻新**（su 预授权三棵/四棵、`docs/mcp`、卡文本措辞、「MCP V2 零产品实施」等）：**PM 派发口径已明示「test/测试 旧钉待翻新，不处理」**，归测试角色随批同步。
  - 1 红在 `test/codex-adapter/mcp-whitelist.test.ts:50`（「foreign native MCP … combined map」，报错抛自 `src/provider/codex/session.ts:674`）——**Codex 适配器角色 P2 在飞批次**（该目录本轮前后持续新增测试：全量计数 1814→1919→1931 随他角色批次增长），与本批零交集（本批不 import 其任何符号）。**如实登记：该红由在飞写入产生，随其收口自消解或由其处理。**
  - 排查中发现并修复：测试角色新钉 `h-scope-audit.test.ts`「范围⑥：*.test.ts 不得引用 .probe 探针」曾因本批测试初版引用探针夹具而红——已按钉改为**独立非探针夹具** `test/pi-adapter/mcp-fixture-server.ts`（探针文件仅被探针驱动引用，探针不灭）；复查该钉转绿。

## 四、未验边界（如实）

1. **Windows**：`StdioTransport` 的 taskkill 进程树路径与 dispose 收口未在本机验（本轮 darwin）。
2. **真实第三方 server**（npx/uvx 包裹、多进程树、异常退出、stderr 大流量）：夹具为最小实现；POSIX 进程组关闭语义由传输层承担、未真机复验。
3. **resources 面**：模型面可见性（SDK 声明行为）已实测；「模型面不可见」若要实现需另裁（§一.2）。
4. **OAuth/HTTP**：契约面已限定 stdio-only（`InstalledMcpServerV1` 注释），HTTP 不在本批（P0 探针 §五已如实注明等价环境面差异）。
5. **`pi-mcp` 依赖声明**（装配角色）与**真机端到端**（装-连-用-卸全链、断点观测）属独立验证/客户跑。
6. `mcpStartupWaitMs` 生产缺省＝SDK 默认 10000（未在装配面覆写）。

## 五、边界声明与回滚

只写：`src/common/pi-adapter/real-adapter.ts`（唯一产品文件）、`test/pi-adapter/**`（新增测试＋夹具；探针夹具补 `--resources`）、本记录/changelog/memo。**未碰** `src/provider/pi/session.ts`（零需求）、`src/model/runtime.ts`（契约只读消费）、运行时核心/门禁引擎/Codex/Claude 在飞文件、`package.json`（依赖声明归装配角色，已上报）。未 git 提交；未发真实网关请求。

**回滚**：`real-adapter.ts` 回滚本文件 diff（无声明路径零行为变化；有声明路径＝整体摘除 MCP 装配块＋放行面回 Set＋dispose 接缝）＋删新测试/夹具/本记录；无数据/状态迁移（会话 JSONL 里的 `toolsAdded` 元数据由 SDK 自管，属既有语义）。
