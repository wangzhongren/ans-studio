---
id: desktop-ui-g4v2-mcp-row-annotation
type: fix
title: G-4/V2-MCP（桌面UI）：MCP 工具行/安装行如实标注——「零改动」实证 + 断言守卫（复用既有工具行、折叠计数与 [系统·安装] 子类）
created: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [role-capability-install, claude-mcp-surface-probe, codex-mcp-surface-probe, pi-probe-mcp-surface, g4-i7-install-row-annotation]
events:
  - date: "2026-10-16"
    kind: created
    summary: 客户 2026-10-16 批准 G-4 V2（MCP 安装）分批实施后按派发做 MCP 行的渲染最小确认面（属主桌面UI）；核查结论＝渲染平面零改动，新增 4 例断言守卫（tool-rows 3 + renderer 1）＋三层零改动实证登记
  - date: "2026-10-16"
    kind: implemented
    summary: app/renderer/** 零触碰（五文件字节指纹与 G-4/I7 批逐位一致）；test/桌面应用/ 新增 4 例（下划线 MCP 名/折叠计数/install_mcp 工具行＋系统行子类复用/零特判守卫）；桌面目录 375/375、typecheck 全仓 0 错；全量红均属他域在飞翻转钉（V2 wave A＋卡文本批），与本批零交集；独立验证与真机 E2E 交测试/桌面窗口轮
---

# G-4/V2-MCP（桌面UI）：MCP 工具行/安装行如实标注——零改动实证

## 0. 依据与冻结口径

- 客户 2026-10-16 批准 G-4 V2（MCP 安装）分批实施（P1 Claude → P2 Codex → P3 Pi，三平台可并行、验证分批）；V2 范围之「⑤ 呈现行」属主**桌面UI**——设计 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §5.4（L291）：*「安装行（su 会话）：`install_mcp` 调用按既有工具行渲染＋激活后一条定格系统行（沿 `[系统·<子类>]` 形态，如 `[系统·安装]`；不可撤回面同 `system` kind）……与技能同链，不另造行体系。」*（与 V1/I7 同口径；V2 使用行形态＝§5.3 回填定格：Claude＝hook start＋泵 result、Codex＝`mcpToolCall` item 映射、Pi＝既有工具管道行。）
- 冻结面（本批只依赖这三条，不依赖其余实施细节）：
  - **外来 MCP 工具名形态＝`mcp__<server>__<tool>`**（三平台探针定格——Claude：`mcp__probe__echo`〔PreToolUse 实测分发、`source:"dynamic"`〕；Pi：`mcp__<清洗后 server>__<清洗后 tool>`（`[^A-Za-z0-9_]`→`_`；超长/同名冲突走 `_<sha256前8>` 缩短、前缀仍完整，实测 `mcp__probe_srv_v2__tool_name_…__731aa8e9`）；Codex：server 名 `-`→`_`（`mcp__probe_surface` namespace）；Codex `mcpToolCall` item 字段全集定格 `{type,id,server,tool,status:"inProgress"|"completed"|"failed",arguments,…,result,error,durationMs}`——**适配器→行映射在 wave B 落地**）；
  - **安装工具名＝`install_mcp`/`uninstall_mcp`**（设计 §3.2 冻结名；本批核查时运行时核心契约已落树：`src/model/runtime.ts` 增 `install_mcp`/`uninstall_mcp` 能力契约〔+103 行，只给 su 注入〕）；
  - **系统行子类＝`[系统·安装]`**（MCP 安装/卸载完成后的定格系统行，沿用 I7 冻结面与既有 `[系统·<子类>] ` 先例——**子类已识别**、无需新登记）。
- 三平台到渲染侧的**收口形态同款**：`kind:"tool_call"|"accepted"|"denied"` ＋ `detail.toolName`（Claude/Pi 现链路同形；Codex item 由 wave B 适配器映射成同款）——渲染侧只认这一形态。
- 系统行正文**措辞**与各平台适配器映射细节属各自产出方；本批只钉**标记形态/工具名形态**与渲染侧通用链覆盖（沿 I7 §0 口径）。

## 1. 核查结论：渲染平面零改动（逐环节）

推理链：渲染侧对 MCP 名形态与安装工具名**零引用**（§3 符号级实证）⇒ 无特判面 ⇒ 新名字按构造走通用链；通用链覆盖面由 §2 断言钉住。逐环节：

### 1.1 `mcp__<server>__<tool>` 使用行（三平台收口后同走此链）

- **名称解析（结构化）**＝`tool-rows.js::activityOf`：工具名取 `d.toolName` 等既有来源（L190）**逐字直出**——双下划线/连字符/缩短 hash 后缀均原名保留，无任何名称改写/截断/白名单。
- **名称解析（legacy 文本）**：`/(?:调用工具 |请求调用 |开始执行 )([\w.-]+)/`、`/^([\w.-]+)[:： ]/`、相位判据 `/^调用工具 [\w.-]+$/`——字符类 `[\w.-]` 含下划线，`mcp__server__tool` 全名命中、不因字符集失配；`slimToolRow` 的 `^([\w.-]+)[:：]\s*(.+)$` 同款（MCP 结果正文可含 JSON 花括号/内层冒号——首段解析不受影响）。
- **专属解析面不误伤**：仅有的两处工具名特判（`run_shell` 已执行正则、`read_file 失败` 正则，L198–199）对 MCP 名不命中 ⇒ 直接回落通用路径，零副作用。
- **屏障表**：`SPECIAL_TOOLS`（卡片/屏障 5 名）不含 MCP 形态名；`barrier`＝`hasDisplay || SPECIAL_TOOLS.indexOf(tool)>=0 || anchorKey`——真实投影事件恒带 display ⇒ 走**生命周期独立行**（`.tool-call-record`，工具名 `esc(activity.toolName)` 直出）；无 display/降级 ⇒ 进轮内工具组。两条路共用 `activityOf` 事实单点、都零特判。
- **折叠计数**：`mergePhases`（同一 toolCallId 两相位并一行，身份＝turn+call）与 `callSummary`（**按工具名计数**，首现序 `[{name,count}]`、未放行/失败分桶）——无白名单；`renderer.js::foldSummaryText` 自 `sum.tools` 直出「本轮 N 个调用：a / b ×k」，`t.name` 逐字（含下划线）不美化。**确认：无需特判**。
- **详情（展开面）**＝`toolDetails(activity)`：**只读 `display`/状态契约**（display v1 的 target/error/resultText/process/omissions），对工具名零比对（§2 新守卫钉死）——MCP 工具详情按 display 通用呈现；详情目标标签＝`kind==="command"?"实际命令":"目标文件"`（display v1 枚举恰 path|command，`ToolDisplayV1` 合同 `src/model/runtime.ts` L656–658），零新增分支。

### 1.2 安装工具行（`install_mcp`/`uninstall_mcp`）

- 与 I7 技能两工具逐环节同构：入口 `renderer.js` L2470–2474（`(tool_call|accepted|denied) && isToolActivity` ⇒ `appendActivity`）按**事件事实**（`detail.toolName`）无白名单；`SPECIAL_TOOLS` 不含两名；`ok:false` 回执（护栏拒绝＝未执行零副作用）走既有 failed 口径、护栏 reason 在可见首行如实保留；`slimToolRow` 对 `install_mcp：…` 解析零漂移、重复工具名段去重（转义构造对 `_` 无变义）；折叠分解按名计数自动收录。**确认：无需特判**。

### 1.3 `[系统·安装]` 系统行（MCP 语境复用）

- **归类**＝`classifySystemMessage`（I7 已钉：判据只依赖 `[系统·<子类>] ` **标记形态**——`安装` 2 字 ≤12、无括号/换行、后随空白或文末；**不逐子类登记**）；MCP 安装完成行（正文含 MCP server 名/`docs/mcp/…` 路径）与技能行走**同一条既有子类路径**——**无需新登记**（§2 以 MCP 语境用例复证）。
- **呈现/回显回放/队列/不可撤回面**：全部沿 I7 §1.1 定格链（`buildInjectedElement` 既有 `is-system` 单一族、chip「系统消息 · 安装」、W6b `displayBody`；回显/回放同解；「系统」标签；只认 `message` 类 ⇒ 不可撤回）——零新逻辑。

### 1.4 样式体系

系统行唯一 `is-system` 钩子、工具行既有 `.tool-activity`/`.tool-call-record` 族——无按子类/按工具名派生样式类；零新增（守卫同批钉「无 `.is-system-` 变体」不破）。

## 2. 测试与断言（本机实测，2026-10-16）

新增 **4 例**（全部新增、零修改既有断言）：

- `test/桌面应用/tool-rows.test.ts`（+3，纯函数）：
  1. **`mcp__<server>__<tool>` 名称解析/瘦身零特判**——结构化（start/result/blocked 三相位：名逐字、display 目标单点、非 SPECIAL_TOOLS ⇒ 无屏障发明、真实投影带 display ⇒ 生命周期行）＋ legacy 文本（`调用工具 mcp__probe__echo`、冒号结果行含 JSON）＋ 清洗/缩短形态逐字保留（`mcp__probe_a__echo`、`mcp__probe_srv_v2__…__731aa8e9`、连字符防御面）＋ 瘦身映射（重复段去重/长无路径折叠/含路径不折叠/140 上限）；
  2. **折叠计数**——同 callId 两相位并一行、MCP 名首现序 ×2 与既有工具同路径；未放行/超时分桶照旧（未放行优先）；
  3. **安装工具行＋系统行子类复用**——`install_mcp` 发起/结果（目标＝`docs/mcp/<name>.md` 声明路径）/护栏拒绝（reason 保留）；`uninstall_mcp` legacy 路径；`[系统·安装]` MCP 语境归类（chip 标签「系统消息 · 安装」、`displayBody` 去标记、回显/回放同解）——子类**复用既有路径、无需新登记**。
- `test/桌面应用/renderer.test.ts`（+1，源码守卫）：**零特判实证**——渲染平面四个源文件（renderer.js/tool-rows.js/ui-labels.js/styles.css，去注释后）对 `mcp__`/`install_mcp`/`uninstall_mcp` **零引用**；详情物化点 `toolDetails` 源码切片**零 `toolName` 引用**（display 驱动——详情面零特判）；解析字符集 `[\w.-]+` 在 tool-rows（含下划线命名可命中）。

**结果**：`node --test test/桌面应用/tool-rows.test.ts` → **24/24**（原 21＋3）；`renderer.test.ts` → **55/55**（原 54＋1）；桌面目录 `node --test "test/桌面应用/*.test.ts"` → **375/375 全过**（在并行 wave A 已落树窗口内复跑，仍全绿）；`npm run typecheck` → **全仓 0 错**。

**全量**（`node --test "test/**/*.test.ts"`，两个批内快照，数字随并行落地变动）：
- 快照甲：**1884 计 / 1879 过 / 4 红 / 1 skipped**——红＝`test/测试/g4-skill-verify/c-preauth`（预授权矩阵：docs/mcp 未预授权钉）、`test/测试/g1-verify/g1-copy-and-nails`（三棵钉）、`test/测试/g4-skill-verify/h-scope-audit` 范围①②（三棵字面量＋「MCP V2 零产品实施」钉）。
- 快照乙（同窗口稍后）：**1884 计 / 1872 过 / 11 红 / 1 skipped**——追加 `g1` 卡文本 ×2、`g4-skill-verify/d-card-guard` ×2、`test/门禁引擎/su-doc-surface-convention` ×3（确认制要点/规划纪律）。
- **定性**：全部红均在 `test/测试/**`＋`test/门禁引擎/**`（测试/门禁引擎/编排属主），主题＝ **V1 期钉子随并行在飞的 G-4 V2 wave A**（`SU_PREAUTHORIZED_WRITE_DIRS` 已见四棵含 `docs/mcp`；`install_mcp`/`uninstall_mcp` 契约定型于 `src/model/runtime.ts`）**＋卡文本批的翻转过渡态**——数量随并行落地而变（4→11），**与本批零交集**（本批只写 `test/桌面应用/**`，不含任何 src/卡文本读取路径）。跳过＝既有 Windows 专用用例。

## 3. 「零改动」实证（三层，沿 G-4/I7 体格）

- **字节级**：`app/renderer/**` 未触碰（`git status` 无任何 app/renderer 条目）；五个渲染侧文件 sha256 前 8 位与 **G-4/I7 批指纹逐位一致**（§5 表）——非「改了不算」而是**逐字节未动**。
- **符号级**：四个源文件去注释后在代码中对 `mcp__`/`install_mcp`/`uninstall_mcp` **零命中**（`renderer.test.ts` 新守卫钉住，可重跑复验）；`toolDetails` 切片零 `toolName`（详情面 display 驱动，守卫钉住）。G-3「合流即桌面零改动」同款证据形态。
- **机制级**：§1 逐环节（名称解析→屏障/生命周期路由→折叠计数→详情物化→系统行归类/呈现）全部既有单点、零新分支；§2 纯函数断言证明通用链对三种新名字形态（含下划线/清洗/缩短）确有覆盖。

## 4. 未验边界（如实登记）

1. **三平台适配器发射面未落树/未接**：Claude 两发射点（hook start＋泵 result）探针实测「现均不存在」——P1 落地；Codex `mcpToolCall` item→行映射 wave B 落地（探针注：是否列入隔离属 P2 评审，**建议不隔离**）；Pi 尚属 P3。本批只核查**渲染侧收口形态**（tool_call/accepted/denied＋detail.toolName）；真机/E2E 观测属各平台实施轮与 E2E 轮。
2. **Codex item 的呈现名选择**（`server:"probe-surface"`＋`tool:"echo_probe"` → 行内 toolName 用 `mcp__probe_surface__echo_probe` 还是 `server/tool`）由 wave B 裁定——渲染侧两种形态均逐字覆盖（名称直出），不属本批。
3. **失败态映射**：Codex 审批拒绝（`status:"failed"`＋`error.message:"MCP tool call requires approval, but approval policy is never"`）经适配器映射后的行分类文案由 wave B 定——渲染侧按既有 `ok/status` 字段单点判类，不改。
4. **display 投影面**：MCP 工具事件的 `display.target` 取什么（kind path|command）由投影方产出、本批未观测；渲染侧按 display v1 通用呈现（未知 kind 回落「目标文件」标签属既有行为）。
5. **系统行产出方**（桌面窗口/V2 轮）文案未落树——本批按冻结面（`[系统·安装]`）核查与断言；标记形态契约单点＝`tool-rows.js::SYSTEM_HEAD` 一带（注释即契约，同 I7 未验 ②）。
6. **真机 Electron e2e 未跑**（本批＝纯函数＋源码断言，沿 I7 分工：装-看-用-撤链上各行的实际呈现属 E2E 轮观测项）。
7. **回放仿前缀残余边界**（既有，非本批；同 I7 未验 ⑥）。

## 5. 文件与指纹（sha256 前 8 位）

| 文件 | 指纹 | 说明 |
| --- | --- | --- |
| `app/renderer/renderer.js` | `27d72e8e` | **零触碰**（与 G-4/I7、工具行折叠批逐位一致） |
| `app/renderer/tool-rows.js` | `2fd2335f` | **零触碰**（同上） |
| `app/renderer/ui-labels.js` | `564fdb9a` | **零触碰**（G-2/U1 批起未变） |
| `app/renderer/styles.css` | `7cf067d4` | **零触碰**（同上） |
| `app/renderer/index.html` | `a39e3652` | **零触碰**（同上） |
| `test/桌面应用/tool-rows.test.ts` | `225e69ae`（改前 `52c2c4e7`） | +3 例（G-4/V2-MCP 段） |
| `test/桌面应用/renderer.test.ts` | `d06e7bfc`（改前 `3bce42fb`） | +1 例（零特判守卫） |

## 6. 边界与纪律

- 只触碰 `test/桌面应用/tool-rows.test.ts`、`test/桌面应用/renderer.test.ts` 与本角色 docs/changelog/memo；`app/renderer/**` 零触碰（结论＝无需适配）；未碰 `src/**`（并行在飞的 `src/model/runtime.ts`、`src/pipeline/orchestration/{run-role,govern-session}.ts` 仅只读引用其已落树事实）、`app/desktop/**`、`test/测试/**`、`test/门禁引擎/**`、`test/编排/**`、其它角色文件。
- 未 git 提交（沿各批先例，由 PM 统一提）。
- 独立验证与真机 E2E 交测试角色/桌面窗口轮。
