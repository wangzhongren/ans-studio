---
id: g4v2-mcp-install-independent-verification
type: change
title: G-4 V2（su 安装外来 MCP 全链）——独立验证报告
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: verified
related: [kanban-fixes-pm-review, role-capability-install, g4-skill-install-and-cleanpatterns-independent-verification]
events:
  - date: "2026-10-16"
    kind: verified
    summary: 测试角色独立验证：G-4 V2（su 安装外来 MCP）全链——契约/读取器、Service、工具、编排（第四棵树）、门禁卡文本、桌面 handler、Claude P1（env 收窄启动器）、Codex P2（白名单化）、Pi P3（自持 transport/dispose 收口）、桌面UI 复用、范围审计（stdio 限定/零二次卡/诚实面）——**整体通过（0 不通过、6 备注）**；自建 64 例全绿；V2 面冻结绑定 82 条目开工/收工逐字节一致；全量 1998/1997/0红/1skip＋typecheck 0
---

# G-4 V2（su 安装外来 MCP 全链）——独立验证报告

**结论：整体通过（0 不通过、6 备注）。** 独立自建 64 例全绿（`test/测试/g4v2-mcp-verify/`，11 个测试文件＋3 个自包含夹具，不复用实施方断言）；V2 面冻结绑定 82 条目开工/收工逐字节一致（两次复算）；全量 1998 计 / 1997 过 / 0 红 / 1 skip（＝基线 1934/1933/0/1 ＋本批自建 64；1 skip＝既有「仅 Windows」项）；`npm run typecheck` 0 错。批准口径逐项对照：stdio 限定 ✅、server 名仅 `[A-Za-z0-9_-]`（特殊字符拒）✅、Pi 限 tools-only ✅、P1 Claude→P2 Codex→P3 Pi 三批次均落地 ✅、**无二次确认卡** ✅、卸载＝下次会话摘除＋已发生副作用不可撤 ✅、「能力级授予（非逐调用受审）」诚实面四处文案在位 ✅。

方法：对抗性独立构造、逐项取证（自建夹具＝真实临时项目盘＋可控 SessionManager 假件＋自建假 SDK/假 Codex 引擎/自建 Pi stdio 夹具 server＋真实 launcher 子进程＋真实 Pi SDK faux 模型＋自写 mini TOML 解析器做转义往返），只写 `test/测试/**` 与 `角色卡/测试/**`；未改任何产品文件与探针；未 git 提交；**零真实网关请求**（仅回环 `.invalid`，两枚真 CLI 探针为本批对既有探针的**复跑**，非改动）。

---

## 一、结论逐项（A–M）

| 域 | 结论 | 要点 |
| --- | --- | --- |
| A. 契约与读取器 | ✅ | 符号逐名冻结（编译期 canary＋读取器两函数两参可用）；判据表全分支 15 类坏件（缺必填×5/未知状态/env 坏项×5/控制字符×3）⇒ `undefined` 且与列表坏件集**同口径**；名非法（含 `.`/`..`/分隔符/空格/控制字符/非字符串）/保留名（`ans`/`ans_codex`）/根不可读 ⇒ `undefined`/空清单＋`mcp-root-unreadable` 诊断，**绝不抛**；`uninstalled`/角色不命中**静默**（不算坏件、零诊断）；排序＝name 字典序；扫描面＝`docs/mcp/*.md` 普通文件（目录/软链/其它扩展名忽略）；BOM+CRLF+首现为准；`env:NAME` **原样保存不展开**；空盘零声明**绝不建目录**；回调抛错被吞 |
| B. Service 接线 | ✅ | 经 `createRuntimeAdapter` 真装配：按角色注入（X/Y 注入面互异）、别角色/卸载/坏件不注入；纯读零写盘（盘快照逐字节＋不建 `.ans`）；空盘零副作用；重建（新会话）重读当刻盘面（装入/卸载语义随新会话更新）；同适配器按角色冻结 |
| C. 工具面 | ✅ | 注入才注册四组合矩阵（两能力**互不搭车**、未注入名结构性不存在）；回执冻形逐字段（path/digest 前 12 位/rebuilt·next-session 两文案/note 透传/诚实面在文案）；契约外回执（null/缺 digest/action 不符/effective 非法/缺 ok/抛错）与预中止全 fail-closed（绝不称已装/已卸）；能力 `reason+message` 原样透传（5 类枚举）＋schema 枚举模板**同代入逐字互核**；**零写盘两路**＝源码切片零写盘原语＋fs 写原语 spy 下成功/失败两路恰零调用、盘面零变化；描述含能力级授予诚实面且「受审」小句全否定式 |
| D. 编排 | ✅ | 第四棵树 `docs/mcp` 经 `openRoleSession` 真装配捕获 gate：树内（相对/子路径/绝对/`..` 归一回树内）免确认直写**零卡**、树外确认前拒→经确认恰一次发行后放行（精确集合）；`docs/mcp2`/`docs/mcpX` 前缀负例拒；`..` 归一逃出（`docs/su2`）拒；非 su（项目角色 X）写 `docs/mcp` 仍拒（预授权不扩散）＋X 写自身边界照常；重建（新开会话）后四棵树仍免确认；透传链＝su 两能力**同一引用**透传、项目角色即便误给也零注入（`AdapterCapabilities` 判据 `suppressHandback`）；行为侧把捕获能力面喂回生产工厂：su 注册 `install_mcp`、未注入者不注册、项目角色零注册 |
| E. 门禁卡文本 | ✅ | 确认制要点段四棵树（`docs/su`/`contracts`/`skills`/`mcp`）＋「预置四棵不受重建影响」；规划纪律段「`docs/workflow.md` 不在预置四目录内」负例；MCP 安装纪律段四要点全在场（仅客户明示/不自主发起/非客户轮次如实拒绝；不设二次确认卡＋「安装工具没有确认通道」；先落盘再激活＋`env:NAME` 引用＋**凭据值绝不写入文件**＋工具不写盘；诚实告知口径「必讲、不得省略」＋门禁之外执行＋能力级授予＋不得表述为逐调用受审＋不改变写边界；卸载＝先改声明＋下次会话摘除＋**已发生的副作用不可撤**＋不得暗示已回滚）；**J-1 守卫全文小句级零违规**（独立重实现谓词）＋「受审」小句全否定式＋内存变异非空洞（4 变异全被捕获） |
| F. 桌面 handler | ✅ | 成功链（rebuilt）：digest 独立复算一致、X 旧会话 dispose＋重开、`[系统·安装]` 系统行经第四类通道真投递（含「能力级授予，非逐调用受审」诚实面）、**不可撤回**（withdraw 拒）、诊断 `mcp.installed` 落盘；拒绝全分支（10 类）reason 映射＋文案逐字（跨源与 schema 同代入互核）＋盘快照/零重建/无系统行三重零副作用；护栏矩阵（无轮次/dispatch/system/handback ⇒ `not-customer-turn` 逐字；message 轮与无 active 条目放行）；激活三态（busy ⇒ next-session 不打断；无会话 ⇒ next-session＋note 且**绝不自动开户**；重开失败 ⇒ `rebuild-failed` 如实「未假装已生效」）；卸载链（先改声明→校验→二分回执「效果已撤/声明保留/副作用不可撤」）；排队客户消息轮放行；`mcp.refused` 诊断 reasonCode 如实 |
| G. Claude P1 | ✅ | 装配：命令恒 launcher（`process.execPath`+argv）、`alwaysLoad`、`timeout=60s`、`allowedTools` 加 server 级名、`env:NAME` 按构造期快照展开（缺失省略）、`ANS_MCP_LAUNCHER_PASSTHROUGH` 名单＝已解析键恰等；hook 放行五条件对抗 10 例（合法 allow；名错位/近似前缀 `mcp__ext2__↛ext`/未安装名/`source=sdk`/`source=user`/无 `mcp_server`/未绑定 prompt_id/prompt_id 缺失/hookOptions 已中止 ⇒ 全 deny）＋**放行分支无 updatedInput**（入参原样）；审计两行配对（hook start 行＋消息泵 tool_result 行，legacy 与**生产投影**两路；非文本块 `unsupported`）；status 行类别化（首 CODE token；空 error 用状态词；connected/未安装名静默；每引擎恰一次；查询失败不毁轮）；**env 收窄对抗**（launcher 真子进程）：子进程 env 键**恰为基线键（在场者）∪ 声明名单键**（∪ mac 平台注入），三枚哨兵（ANTHROPIC_API_KEY/AWS/未声明键）零泄漏、`ANS_MCP_LAUNCHER_PASSTHROUGH`/`ELECTRON_RUN_AS_NODE` **永不转发**、名单损坏（非法 JSON/非数组/混入非字符串）**宁窄**、exit 127 两路（缺命令/不可执行）＋真命令退出码原样＋SIGTERM 转发（真命令无孤儿、启动器同信号退出）＋stdout 直通；**真 CLI 回环探针复跑 exit 0**（bundled CLI 2.1.299，实测子进程 envKeys＝声明键＋基线，start/result 两行、broken/hang 阶段轮次照完、零外部 API 调用） |
| H. Codex P2 | ✅ | 单条 root map：自写 mini TOML 解析器转义往返逐字（引号/空格/反斜杠/中文/空串/**注入串不破图**——伪 `},"sneak"={enabled=false}` 不得产出第三键）；`safetyOverrides` 恰一条同根 `-c`；`approve`＋`tool_timeout_sec=300` 在位；`prepareInstalledMcpServers`：保留名（大小写/`-` 归一形态）/清洗碰撞（`a-b` vs `a_b`）/坏形状（名/命令/args/env）抛错、`env:NAME` 快照展开（缺失/空 ⇒ 不带入不拦会话）、纯函数不改输入；会话级**三处名字集恰等**：进程级 5 组负例全拒（外来残留/白名单缺席读回/读回不含白名单/目录多一名/少一名），线程级 `mcp_servers` 白名单 true 其余 false 恰等；降级行去重单点（catalog 与 startupStatus 双路恰一行）、error 截断 ≤300、白名单起不来**会话照开轮次照完**；`mcpToolCall` 映射字段全集（`mcp__<server>__<tool>` 桥名/status/arguments/result.content/error/durationMs）三态如实、失败 ⇒ denied 行、**不进隔离**；**真 CLI native-probe 复跑 exit 0**（0.162.1：`whitelistMap.enabledAfter=["ans_probe_whitelist"]`、`approvalMode:"approve"`、`toolTimeoutSec:300`、args 往返 4 项、foreign 未启动） |
| I. Pi P3 | ✅ | 判据（清洗名命中/近似串 `mcp__srv_ax__` 不中/空白名单不中/未清洗原名不中）；**声明驱动**（项目根 rogue `mcp.json`＋`.pi/mcp.json` 零搭车，活动面仅声明 server）；前缀面放行真实执行（服务端收到调用＋结果进转录）；**tools-only 对抗**：server 自报 resources ⇒ SDK 登记资源三名（无 `mcp__` 前缀）但调用被门禁逐字拒（「非注入的 ANS 工具，拒绝执行：list_mcp_resources」）、服务端零收到；**自持收窄**（真链）：子进程 env 键＝PATH＋声明键（∪ mac 平台注入）、宿主哨兵零泄漏；`env:NAME` 缺失 ⇒ bindRole 构造期抛错**且子进程从未拉起**（无 state 落盘）；**dispose 收口**（真路径）：dispose 后 MCP 子进程 ≤5s 退出；治理回归（MCP 激活下 settled 恰 1、server-tools 声明照常启用行在场、门禁放行 MCP 工具）；零声明逐字旧行为（扩展仅治理一件、活动面为空、settled 恰 1）。边界负例/清洗命中/前缀同源另由 K 域源码切片钉（allowedSurface 单构造、1128 与门禁同一 `.has`） |
| J. 桌面UI | ✅ | MCP 安装行经 `tool-rows.classifyInjectedMessage` 归 `system` 类（label「系统消息 · 安装」、displayBody 剥文首标记=事实原文）；技能行同归类（两族一套判据）；伪形态（`[系统·安装]伪行` 无空白）不归类（判据未放松）；`app/renderer/**` **零改动**（git status 证据）——复用零改动实证 |
| K. 范围审计 | ✅ | `InstalledMcpServerV1` 字段面**恰等** [name, command, args, env]（stdio 限定，无 url/headers/HTTP 面）；读取器/Codex 编码器/launcher 零 `http/url/headers/fetch(/net.connect`；名特殊字符/保留名 5 例行为全拒（not-registered、零重建）；安装链三处源码切片**零 `request_confirmation`**（结构上没有二次卡）；MCP 探针**动态枚举**（5 个）端点全为回环/保留域（127.0.0.1/`.invalid`），不被 test 全局匹配；诚实面三处（卡/schema/系统行）字面在位；能力位仅 su 判据两处字面（`role.builtIn === true`／`suppressHandback ? input.installMcp : undefined`）；特殊字符全链拒；V2 新增行零真实网关字面量 |
| L. 冻结绑定 | ✅ | V2 面 82 条目 sha256 开工/收工**逐字节一致**（两次复算；清单＝worktree `git status` 全量去除并发非 V2 面，含 runtime/model/三适配器/desktop/orchestration/boundary/package.json+package-lock＋对应测试与夹具＋实现角色 docs/证据）——见 §四。并发面（产品角色新设计文档＋changelog、PM 记录追加 14 行）为非 V2 面，见备注 1 |
| M. 全量 | ✅ | `node --test "test/**/*.test.ts"` → **1998 计 / 1997 过 / 0 红 / 1 skip**（基线 1934/1933/0/1＋本批 64；skip＝既有 Windows-only）；`npm run typecheck` 0 错 |

---

## 二、范围审计明细

1. **stdio 限定（裁定③）**：契约块字段集恰等（抽取核）；读取器/命令编码器/启动器零 HTTP 面；V2 新增行零真实网关字面量（`git diff src app` 新增行扫掠为零）。
2. **名与保留名（裁定②）**：读取器判据（`[A-Za-z0-9_-]`、`ans`/`ans_codex` 保留）＋三平台纵深防御（Codex 兼顾大小写与 `-`→`_` 归一的保留判定）＋桌面 handler 行为侧全拒（零副作用）。
3. **零二次卡（客户裁定）**：`applyMcpChange`/`makeMcpReceiptTool`/读取器三处切片零 `request_confirmation`/`confirmed:true`；行为侧 F 域全链客户通道零调用。
4. **诚实面（§5.3）**：卡片文本（E）、schema 描述与 promptGuidelines（C6）、`[系统·安装]` 系统行（F1/F5）三处字面在位；「逐调用受审」类小句全否定式；「能力级授予」不含 J-1 守卫三词（E4）。
5. **能力位仅 su**：桌面 `role.builtIn === true`、编排 `suppressHandback`（两处字面核）＋行为侧双证（D3/D4）。
6. **探针纯本地**：MCP 探针动态枚举零真实端点、零被 `*.test.ts` 引用（V1 范围⑥钉 7/7 复跑通过——本批 K3 以**动态枚举**实现，不点名引用探针，兼容该钉）；CI 零执行（既有钉）。
7. **tools-only（裁定①）**：Pi 资源三名不在放行面（判据＋行为双证，J2/K5）；Codex 桥名恒 `mcp__` 前缀（无资源工具别名面）。

---

## 三、用例计数与关键对抗

- **本批自建**：`test/测试/g4v2-mcp-verify/` 11 个测试文件＋夹具（`helpers.ts`/`f-fixture.ts`/`pi-server.fixture.ts`），**64 例全绿**（日志 `g4v2-verify-dir.log`）。
- 复跑证据（各自独立日志）：实施方 V2 六文件 **72/72**；翻转钉子 13 文件 **223/223**；V1 范围⑥钉（h-scope-audit）**7/7**；全量 **1998/1997/0/1**；typecheck 0；**真 CLI 复跑两枚**——Claude installed-loopback probe **exit 0**（env 收窄/两行/降级/挂起释放全阶段断言通过，零外部 API 调用）、Codex native-probe **exit 0**（白名单单图 approve/300s/args 往返）。
- 关键对抗原始回执（节选）：hook 合法放行 `{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow"}}`（**无 updatedInput 键**）；九类反例全 `deny`；launcher 子进程 envKeys＝`[FAKE_MCP_*…, HOME, PATH, TMPDIR]`∪平台（哨兵三枚零泄漏）；Codex 三处恰等负例错误 `enabled set differs`／`catalog does not match`；Pi 资源工具拒绝行逐字「非注入的 ANS 工具，拒绝执行：list_mcp_resources」；护栏拒绝 `{ok:false,reason:"not-customer-turn",message:"本动作仅可在客户消息发起的轮次执行——未执行。"}`。

### 备注（6 条，均非不通过）

1. **并发面（非 V2 面）**：验证窗口内产品角色新增 `角色卡/产品/docs/design/2026-10-16_design_reasoning-and-effort.md`＋`角色卡/产品/changelog.md` 改动，PM 记录 `kanban-fixes-pm-review.md` 追加 +14 行。三者均非 V2 改动面；V2 面 82 条目经两次复算逐字节一致（冻结有效），并发活动未触任何产品代码/测试。
2. **`CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 警告**（真 CLI 回环探针复跑日志可见）：server 级 `allowedTools` 条目会使 SDK 对该等工具不咨询 `canUseTool`。与设计一致（canUseTool 保持 deny-all 兜底；实例判定实际由 PreToolUse hook 五条件先行、hook deny 优先）；提示性观察，供 PM 参。
3. **schema 枚举句用占位符**（`<name>`/`<roleId>`）：与桌面 handler 实际产出经「同代入」逐字互核一致（C4/F2）；两源（schema 模板 ↔ handler 文案）互为契约。
4. **导出符号更名**：`SKILL_INSTALL_SYSTEM_PREFIX` → `CAPABILITY_INSTALL_SYSTEM_PREFIX`（技能/MCP 两族共用系统子类，语义相符）；全仓零旧引用（grep 证据 `scope-audit-git.txt`），自包含改名，无消费方破坏。
5. **Codex 清洗碰撞判据为大小写敏感**：`a-b` vs `a_b` 拒（探针定格面），`A-b` vs `a_b` 不判碰撞（大小写折叠面未验，登记为边界）；与探针残余②的例示（`a.b`/`a_b`）一致。
6. **空 name 拒绝文案**为 `MCP 未登记：docs/mcp/.md 不存在——先落盘再安装；未执行。`（实施实现原样，F2 逐字核）：措辞小瑕、语义如实、零副作用，非缺陷。

### 未验边界（如实）

- 三平台真实网关/真实第三方 server 面（禁真实网关约束、与探针「未定格/未验边界」同口径）：Codex namespace 桥真实网关接受性（P2 已知前置）、Claude ~27s 成因与 HTTP/SSE/needs-auth、OAuth 全项、Windows 全项——不在本批，沿各探针记录原文。
- Claude 打包态 Electron launcher（`ELECTRON_RUN_AS_NODE` 真实路径）：本批仅断言装配面「非 Electron 不注入该键」＋launcher 单测「永不转发」；打包真机链路归桌面验收。
- Pi 资源三名是否被 SDK 登记随 server 自报行为而变（J2 以活动面实测为准，非固定断言）。
- 大小写折叠下的 server 名碰撞（备注 5）。

---

## 四、冻结绑定（V2 面 82 条目，开工＝收工逐字节一致）

开工（`freeze-start-v2face.sha256`）与收工（`freeze-end-v2face.sha256`，两次复算）`diff` 为空。原始全量清单 `freeze-start.sha256`（worktree 实况 83 条目）与 `freeze-end.sha256`（103 条目）留档；V2 面＝全量去除并发非 V2 面（备注 1 三文件）。

| 文件 | sha256 |
| --- | --- |
| app/desktop/interface.ts | 976cf5c99db795799233c818e9f740c3e95de97cd6f0c902c175680a0f74004a |
| app/desktop/session.ts | 58f522571dad78938b0e4f8b6bac736a83d1ef7a6c827a467eeadee5a25900a8 |
| package-lock.json | 51e07418ee72b047723b39c920b179e5996681401e87a2096aec43df68a44ab2 |
| package.json | af3560fb7d798bc48e1419cd124fcf0b0759381be9331cdb676fc8d1d391588a |
| src/common/claude-adapter/mcp-launcher.mjs | 1f1258ff3bf02032daa5be8ee45428737a521ba9034a0bd9898f9e6bfec10960 |
| src/common/codex-adapter/config.ts | b0ba2eb066244be6b92606e12ad159763af30032e499b8a5e4be0f15a622016c |
| src/common/codex-adapter/protocol.ts | e41035d5ddf8b3e08c46288e087ca7e4dd2062337bcdac3e3cd33271d878ded1 |
| src/common/pi-adapter/real-adapter.ts | a80f6816962ed4afa2348e086846a560a06eddbfa299606680e3273afc45976f |
| src/common/runtime-core/mcp-declarations.ts | 7d86ebf307d067bfe6cabd6b90a0166b43f1f30d34d263dd07087efb070e4fa5 |
| src/common/门禁引擎/boundary-core.ts | 3400e034d7854b3351e6e91455fdae91b45732cc262944767f0fe7d5a147ff56 |
| src/model/runtime.ts | 618b1b8cdf2c9e19962c069a68bdee2a5d1ecfb657fa3a659e456f4ac728e0dc |
| src/pipeline/orchestration/govern-session.ts | 828589e41b1037a85912e48013a9f6e20d8739ac1d0d6df9444c9d314045a84f |
| src/pipeline/orchestration/run-role.ts | 1f56ac29d297314d609cf4d5a224978065f4ee33b461963e66136cfc844d2551 |
| src/provider/claude/session.ts | 8c95325e2b8075b901806c37669f277d52a0c17a77b35772773748de1a75840e |
| src/provider/codex/session.ts | 495b5ae29e181bde4f810184acaac4098279de59f2090c3f2e6bd58b835801da |
| src/provider/runtime/schema.ts | eecd0409d65e2d1b19f82c15cea0223bffc5e392e9b4cfcd84e48e50ff060675 |
| src/provider/runtime/tools.ts | 553f871d7b85d00aa7e1a8c69d83b074b92e1f1ee907606dc0ee3d10c58c9b83 |
| src/service/runtime/session.ts | 7c0710ceb7451a6a686af1710709f98415321a31d6b9580d534211c7bb96fb86 |
| test/claude-adapter/mcp-installed-loopback.probe.ts | dcabd6744e002d49bf8cf5bae790a1832eaa5890989d6acdb033aed88d5604c0 |
| test/claude-adapter/mcp-launcher.test.ts | 8c7201bff6a66a07b2ba89de77c7603c31b021eb418a52a77f9686234b30ab87 |
| test/claude-adapter/session.test.ts | 937487a9a9520e162bd17902dd64f0c8c0b84b54ff2e5cc66f3fddda5aa3ee08 |
| test/codex-adapter/fixtures.ts | f5b6f6ce2d8e2362d8d02f1dfe9666f1bad1476411daf54480e1d503360c6427 |
| test/codex-adapter/mcp-whitelist.test.ts | 37271bfed43addd8fbd663ddaa02a3027f32b9a899e31c7b57a56d579bae927b |
| test/codex-adapter/native-probe.mjs | e4d3311bedce7c4d685ab41b80d52f69262532df46e79edfc504d5cb0d06015b |
| test/pi-adapter/installed-mcp-servers.test.ts | 2d3528738631fe915a00e761d114338f251b4e56f3731d8b9b4cb19cd27e4145 |
| test/pi-adapter/mcp-fixture-server.ts | 4a92896c93719a4d5309587f1d0b312c9bde97eedc8b152417e5f0d2d185871e |
| test/pi-adapter/mcp-probe-server.probe.ts | e73993255a0819557fe65041826b8c5af4cb438e7b9bfdf949b3514f5808223d |
| test/runtime-core/install-mcp-tools.test.ts | 49d6bf1a141e917c784a90816e028b61064c6c748250a3dcd208cb1be178567a |
| test/runtime-core/mcp-declarations.test.ts | 9b4965b3f2cb13593ae74b5309f3d429b72bba67ff3c0bd404e45a53c1f62573 |
| test/runtime-core/tools.test.ts | 6746a93803a6ad130991a35fa9fd307f05b7dfe0ec84ab1ae492a6c5c8e50d8c |
| test/桌面应用/boundary-refresh.test.ts | 33e8b2d47baba6492a2f3130d0ddf899e45ffa90bf189be3763182adad43b66e |
| test/桌面应用/dispatch-delivery.test.ts | 02a9d8bdb8e3eefcf57beb1f1a06d594998fd93500c67606fee4b7d444c83aea |
| test/桌面应用/renderer.test.ts | d06e7bfcee4580b58d2bf1ed91c55f8c8bf6838591cd0c70d88cd6ef0f88d603 |
| test/桌面应用/tool-rows.test.ts | 225e69ae9c3d92c068bcd8e03181afdd55215114af73909347082d9b8ff24578 |
| test/测试/g1-verify/g1-copy-and-nails.test.ts | bfa45638baafd90b0f51d2e30d0f7223d74d8cffc76c9145f24b50f9dbaabd44 |
| test/测试/g4-skill-verify/c-preauth.test.ts | f5e240fbca1880d1c49f0572f01f47d4e77a8341301419a8d9841321aada6acc |
| test/测试/g4-skill-verify/d-card-guard.test.ts | 4ec1ed611590a500a905c9763db80f2f45459b173c2cc24e29053b1f6c55bb27 |
| test/测试/g4-skill-verify/h-scope-audit.test.ts | 6dfc964b955848bd0d1942cea407945ad68d0c156a274e2189d88a81bbfe4df4 |
| test/编排/confirmation-gated.test.ts | af672de63d86b7e11971d576c7ca4be7bfb1683ae6da7788a6418b0eec5599dd |
| test/编排/installed-skills.test.ts | 27047805e588fa4f6545194aef868b52f27eab7a1abd4a619a5c2c9c60c97a3c |
| test/编排/session-handle.test.ts | 6bbee5615ef8f0db042450cdafac7b6241e1bbdc475b13e19c0e741ce36f011c |
| test/门禁引擎/su-doc-surface-convention.test.ts | 12b40ba26bca0a63120bade87acfee12d51a5422f6b482e955819c6f1552b8e4 |
| 角色卡/Claude适配器/changelog.md | 84486cedebbf9c80dcdf9f75a19d8fc518d49ec1785188269a4e4d0c5398d75c |
| 角色卡/Claude适配器/docs/fix/2026-10-16-mcp-installed-evidence/diff-check.txt | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| 角色卡/Claude适配器/docs/fix/2026-10-16-mcp-installed-evidence/full-suite.txt | 860a701e85616225b50c01454ed01b15c76dd746c7475a26953fad47eb2c417e |
| 角色卡/Claude适配器/docs/fix/2026-10-16-mcp-installed-evidence/probe-mcp-installed.json | 13f1dfb19351022f35aa7c3a111770d460e0ebd3d1dbd54e4124e1057e9ffff3 |
| 角色卡/Claude适配器/docs/fix/2026-10-16-mcp-installed-evidence/probe-stderr.txt | 80754a7df115e01d6bf5d888f653aa15af2196aa852589aec30cf095e7bbbeae |
| 角色卡/Claude适配器/docs/fix/2026-10-16-mcp-installed-evidence/typecheck.txt | 6696b45e50417af0c1a0be3ee11016ae6ca06ebaaa27db31287992a4affe3957 |
| 角色卡/Claude适配器/docs/fix/2026-10-16-mcp-installed-evidence/unit-claude-adapter.txt | 464be7a5f48167b6e465e7e02b318ce97ec3ea75c2eb859b58f311f19f1ae237 |
| 角色卡/Claude适配器/docs/fix/2026-10-16_impl_mcp-install.md | bc3bb3fe691ed394bddae9d8c52936b04e1d3336149f83e0fbd2c028d21eebc7 |
| 角色卡/Claude适配器/memo.md | e14d1ed5965236db1c5a8bc612b96d8d4a98cb2570e796ec7bb5d4cb8457d1f2 |
| 角色卡/Codex适配器/changelog.md | 0f9c5dcd95b179dc114aef837aee5d4b58ea2825f069f2661c0e468eea0e7389 |
| 角色卡/Codex适配器/docs/change/2026-10-16_change_g4-v2-mcp-whitelist.md | 66a906953933a70e9fafb359ef1e92b672ca1002b16d4dc1770423662b66b612 |
| 角色卡/Codex适配器/feature-map.md | 4c070d0aa52e374c690627c47bfd93e02c1ea8a0f89a6ab793c4ab4bfe424f9d |
| 角色卡/Codex适配器/memo.md | 5cdf043e913253abf1b8f6fcdfc76b799e644fbeedf5226d2b20a0255fcdacad |
| 角色卡/Pi适配器/changelog.md | 40f3ec658a4cc2c7274e49efd5d27e095855855f274225b0d695b1d3c0172ee9 |
| 角色卡/Pi适配器/docs/change/2026-10-16_change_role-mcp-install-pi.md | 9fdc1db45bcb6f54c8e7c10a35f76003438a41ca900d87229b4f407d5d3d3797 |
| 角色卡/Pi适配器/memo.md | 2542e08c3a3268d8f2ffea4e3a347344ed7126ab6048cec1dcc898d915e5d183 |
| 角色卡/桌面UI/changelog.md | 9cdb1974f367fbc0124161c512513ae7b6bb5185051ba093117d2d0be418de7f |
| 角色卡/桌面UI/docs/fix/2026-10-16_fix_g4v2-mcp-row-annotation.md | d857af77df109874d2df4b17dacee53f39c552807c1c44d6c1ec589df17f34dc |
| 角色卡/桌面UI/memo.md | 6c7031b13c76d64dde650048a038a94a505a21112a9419193a75d41a8bb3cfac |
| 角色卡/桌面窗口/changelog.md | b6c6e43bca2071c6c05ffd5f3d2bcb312b5968bddc3dccf21a08c3602a6a640e |
| 角色卡/桌面窗口/docs/fix/2026-10-16_fix_g4-skill-install-handler.md | aab1985c329b54053e72ba822008560ba9463ddface77a0a43a29003cbee3d34 |
| 角色卡/桌面窗口/memo.md | c5a02513d8af1fc4659d125060d6a5e9c784c4eacea185fa7a26352e8d906262 |
| 角色卡/测试/changelog.md | caaa7c32f784290c10ca35affa03714e58e1197eaad44243e1ad67f0480f6d28 |
| 角色卡/测试/docs/change/2026-10-16-g4v2-verification-evidence/baseline-full-suite.log | 57b2e877148b337a06c4749017c660fe01b85c1249c9461ac5a74d3d859537a6 |
| 角色卡/测试/docs/change/2026-10-16-g4v2-verification-evidence/freeze-start.sha256.raw | 56637dbb362afdb8514326c5fead55343239f92a535b9e47f378f5d457ee16cf |
| 角色卡/测试/docs/change/2026-10-16-g4v2-verification-evidence/typecheck.log | 6696b45e50417af0c1a0be3ee11016ae6ca06ebaaa27db31287992a4affe3957 |
| 角色卡/测试/memo.md | 2dadc3a27daff3061c36a11b9ef340b161f744795b4a91664cd70a0c7ccc62f0 |
| 角色卡/编排/changelog.md | b7550aadf718981c89b49ad4eebdf56711be6dd38d3b5a701df705d60197d8d7 |
| 角色卡/编排/docs/change/2026-10-16_change_g4v2-mcp-preauth.md | e0ad45561b8f74b99160c42fc5898d73e75aa9584790bca6b08d917094de9aef |
| 角色卡/编排/memo.md | adf69e1aa5f0eda3cd6d555662ecf4c51ae041f970f9d6da38d3a635865955bd |
| 角色卡/装配/changelog.md | b3829227bd6e18b3a4f79e02a0812d8a4b99040a19419dc9cb1acf1890aa9aca |
| 角色卡/装配/memo.md | 7a541f79069e7d0755da27e6484549b1d6cff818f1aae1ff31f5d9fc81f9b95b |
| 角色卡/运行时核心/api-spec.md | 0e5713423531fafb4948e24d95785840e3541772061658df87caf9d5d9b44142 |
| 角色卡/运行时核心/changelog.md | 6d2a876fa27cf0d4a13eca388af57fe360fa9836e0382e5be42d837ef4f2fcf8 |
| 角色卡/运行时核心/docs/fix/2026-10-16_fix_g4-mcp-contract-layer.md | 8656a2a5ef682917c4ae2a63a590ff21947498f4f5635eb3b63467087b2b5c2d |
| 角色卡/运行时核心/feature-map.md | d59c2ec390a6965d27a82b85cbc4baad9685594defbafc377a947f8164586181 |
| 角色卡/运行时核心/memo.md | 0996b82a6413cdf5d8bf4ebbafe6b548bfaa61416208d8e40d87c5c35e20de97 |
| 角色卡/门禁引擎/changelog.md | 39ae7dc27fbc87f448f9934fe26f884738d9984fac41cf2bd9c60abf1bcf5887 |
| 角色卡/门禁引擎/docs/fix/2026-10-16_fix_g4-v2-su-mcp-card.md | e25ac5d8184c3bd45fe749189135a32028d920bf27d86c8a5ff280c8e2937bac |
| 角色卡/门禁引擎/memo.md | 33aa33a08a6826a47b3059d830b6f91250fb2cdf1b2770284d0f40ab96e99a02 |

---

## 五、证据索引

目录 `角色卡/测试/docs/change/2026-10-16-g4v2-verification-evidence/`：`baseline-full-suite.log`（基线 1934/1933/0/1）、`freeze-start.sha256`/`freeze-end.sha256`（工作树全量开工/收工）、`freeze-start-v2face.sha256`/`freeze-end-v2face.sha256`（V2 面冻结）、`g4v2-verify-dir.log`（自建 64/64）、`implementer-v2-files.log`（实施方 V2 六文件 72/72）、`flipped-pins.log`（翻转钉子 13 文件 223/223）、`full-suite.log`（全量 1998/1997/0/1）、`typecheck.log`（0 错）、`scope-audit-git.txt`（renderer 零改动/旧符号零引用/网关字面量零）、`claude-installed-loopback-rerun.log`（真 CLI 回环复跑 exit 0）、`codex-native-probe-rerun.log`（真 CLI 复跑 exit 0）。

本报告为**独立验证记录**：未改任何产品文件与探针、未 git 提交、零真实网关请求。相关导航见[测试角色备忘](../../memo.md)与 [G-4 V1 独立验证](2026-10-16_change_g4-skill-install-and-cleanpatterns-independent-verification.md)。
