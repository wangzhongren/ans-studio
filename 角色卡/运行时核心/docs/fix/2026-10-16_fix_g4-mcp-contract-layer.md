---
id: core-g4-mcp-contract-layer
type: fix
title: "G-4 V2 wave A：外来 MCP 安装契约层（InstalledMcpServerV1 / 声明读取器 / Service 注入 / install_mcp-uninstall_mcp 工具面）"
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [role-capability-install, core-g4-install-skill-tools, role-mcp-install-assessment]
---

# G-4 V2 wave A：外来 MCP 安装契约层（运行时核心实施记录）

**状态：已实施待验证（未部署）。** 依据：客户 2026-10-16「按推荐批准，开始实施」＝V2（外来 MCP 按角色安装）分批实施；设计规格＝`角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` revision 2（§五 机制已按评估＋三平台 P0 探针回填、§5.1 严格面、§5.2 按角色生效、§九 V2＝P1 Claude→P2 Codex→P3 Pi）；评估＝`角色卡/运行时核心/docs/fix/2026-10-16_assess_role-mcp-install.md`（§5.1 产物形态、§5.4 注入面、§6 安全面）。PM 派发：运行时核心＝**wave A 契约层全套**。**本记录只覆盖契约/读取器/Service 注入/工具面**；`docs/mcp` 预授权扩列（编排，同批已落）、su 卡「安装纪律·MCP 部分」（门禁引擎，同批已落）、三平台适配器装配与呈现行（P1–P3 各属主）、桌面安装 handler 接线（桌面窗口）各自实施。

## 冻结符号（逐名清单；`src/model/runtime.ts` 为**单一来源**，读取器/Service/桌面与三适配器按此接线）

| 符号 | 形状 |
|---|---|
| `InstalledMcpServerV1` | `{ name: string; command: string; args: readonly string[]; env?: Readonly<Record<string, string>> }`——**stdio 限定**（HTTP/URL 不列入，裁定③）；`env` 值只允许**字面量**或 `env:NAME` **引用**（真值由适配器自持展开自进程环境，**绝不落声明文件**）；`name` 仅 `[A-Za-z0-9_-]` |
| `InstallMcpPayload` | `{ roleId: string; name: string }`（MCP 名＝稳定短 slug，声明落点 `docs/mcp/<name>.md`） |
| `InstallMcpReceipt` | `{ ok:true; action:"installed"\|"uninstalled"; roleId; name; path; digest; effective:"rebuilt"\|"next-session"; note? } \| { ok:false; reason: string; message: string }`（**沿 `InstallSkillReceipt` 体格冻结**；`path`＝`docs/mcp/<name>.md`、`digest`＝声明文件当刻字节 sha256） |
| `InstallMcpFn` / `UninstallMcpFn` | `(payload: InstallMcpPayload, metadata?: ReportHandbackMetadata) => Promise<InstallMcpReceipt>` |
| `GovernedToolsOptions.installMcp?` / `.uninstallMcp?` | 两个可选能力位（**注入才注册**，各自独立；旧调用方逐字兼容） |
| `RuntimeProviderOptions.installedMcpServers?` | `readonly InstalledMcpServerV1[]`（Service 注入面；适配器**纯消费**、不各自找文件；缺省＝无声明可装配） |
| 读取器（`src/common/runtime-core/mcp-declarations.ts`） | `readMcpDeclaration(projectRoot: string, name: string): McpDeclarationView \| undefined`；`listInstalledMcpServers(projectRoot: string, roleId: string, onDiagnostic?): readonly InstalledMcpServerV1[]`；`McpDeclarationView`＝`InstalledMcpServerV1`＋`{ purpose; roles: string[]; status; date; path }` |
| 工具名常量 | `INSTALL_MCP_TOOL_NAME = "install_mcp"` / `UNINSTALL_MCP_TOOL_NAME = "uninstall_mcp"`（`tools.ts` 导出） |

`reason` 建议机读枚举（沿技能版；JSDoc 登记，形状冻结为 string）：`not-registered` / `role-not-listed` / `role-not-found` / `not-customer-turn`（护栏）/ `registration-unchanged` / `rebuild-failed`。

## 声明文件格式（本项目冻结；su 经 `write_file` 落盘）

```markdown
# MCP 声明：<name>                    ← 标题行（非权威；名字以文件名为准）
- 用途：<一句话>
- 启动：<command>                     ← 单行、非空；按 argv 直接 spawn（不经 shell）
- 参数：<arg1> ｜ <arg2> …            ← 可选；`｜`/`|` 分隔、各项 trim、空项丢弃；不做引号解包
- 环境：NAME=env:REF；NAME2=字面量     ← 可选；`；`/`;` 分隔
- 适用角色：<roleId>、<roleId>
- 状态：installed                     （installed｜uninstalled；其余值＝坏件）
- 安装日期：2026-10-16
```

行式解析沿 skills 登记先例：行首 `-`/`*` 可省、全角/半角冒号均可、同键首现为准、其余行忽略；BOM/CRLF 容错。

## 读取器判据表（两函数共用同一解析来源 `loadDeclaration`，测试双向钉住）

| 判据 | 行为 | 原因码（列表侧诊断） |
|---|---|---|
| `projectRoot` 空/空白/非字符串；`name` 非字符串/空/`.`/`..`/含 `/` `\`（入口防御） | `undefined` / 空数组（静默） | —（入参错误，非文件坏件） |
| 名字符集非 `[A-Za-z0-9_-]`（含点、空格、控制字符、中文——裁定②「特殊字符＝坏件」） | `undefined` / 跳过 | `name-invalid` |
| 名＝`ans` 或 `ans_codex`（与内置 server 重名） | `undefined` / 跳过 | `reserved-name` |
| `docs/mcp/<name>.md` 不存在（ENOENT） | `undefined` / 跳过 | `declaration-missing` |
| 读取失败（非 ENOENT，如 EISDIR）/必填字段（用途/启动/适用角色/状态/安装日期）缺失或空/状态值未知/`command` 含控制字符/参数含控制字符 | `undefined` / 跳过 | `declaration-parse-failed` |
| env 值以 `!` 开头（命令引用形态——评估 §6.2 Pi `!command` 建连前执行） | 同坏件 | `declaration-parse-failed` |
| env 项缺 `NAME=值` 形态 / 名非法（须 `[A-Za-z_][A-Za-z0-9_]*`）/ 值为空 / `env:` 引用名非法 / 同名重复 | 同坏件 | `declaration-parse-failed` |
| `docs/mcp` 存在但不可读/不是目录 | 整体空数组（防御） | `mcp-root-unreadable` |
| `docs/mcp` 不存在 | 空数组（**正常「未安装任何 MCP」态**，静默零诊断） | — |
| 状态 `uninstalled` / 角色不在 `适用角色` 列表 | 静默过滤（**非坏件**；读取器对二者仍原样返回视图，判读归调用方） | — |
| 子目录 / 符号链接 / 非 `.md` 文件 | 静默忽略（不是声明条目） | — |
| 两个公开函数**绝不抛错**；坏件 IO 异常降级「跳过＋诊断」；可选回调抛错被吞；`env` 引用**原文**保存不展开 | — | — |

排序与形状：列表按 name 字典序；收录项**只含** `InstalledMcpServerV1` 字段（不带 purpose/roles/status/date/path）；**只读**——绝不建目录。

## 改动文件清单（全部在本角色边界内）

| 文件 | 实施内容 |
|---|---|
| `src/model/runtime.ts` | 上表全部符号＋docs 注释（纪律：工具不写盘；校验/激活在能力侧；失败 fail-closed 零副作用；**诚实面**：外来 MCP 工具在 ANS 门禁之外执行＝能力级授予、非逐调用受审；卸载＝下次会话摘除、已发生的副作用不可撤；安装不改变任何角色写边界——二分如实） |
| `src/common/runtime-core/mcp-declarations.ts` | **新增**：声明读取单一来源（格式冻结＋判据表全部；`McpDeclarationView`/诊断型/两公开函数） |
| `src/service/runtime/session.ts` | `providerFor` 按角色调 `listInstalledMcpServers(options.projectRoot, role.id)` 注入 `RuntimeProviderOptions.installedMcpServers`（纯读、绝不建目录、坏件不影响开会话；每次 provider 重建即重读＝「安装/卸载 ⇒ 下次开会话生效」） |
| `src/provider/runtime/tools.ts` | 两工具名常量；`makeMcpReceiptTool` 共用实现＋两 maker（**只路由 `{roleId,name}` 载荷、如实转达三态回执、绝不写盘**；回执形状归一**共用 `skillReceiptOf`**——同一冻结体格）；`buildGovernedTools` 两处「注入才注册」；`abortedToolResult` 两条中止文案 |
| `src/provider/runtime/schema.ts` | `install_mcp` / `uninstall_mcp` 文案（仅客户明示/不得自主发起/先落盘再激活/不写盘/**门禁之外执行＝能力级授予、不是逐调用受审**/不改变写边界/卸载＝下次会话摘除、已发生副作用不可撤；失败文案枚举沿技能版逐字含护栏 `not-customer-turn`）；**＋PM 并入本轮的机械同步**：`request_confirmation` 预授权目录陈述三棵→**四棵**（增 `docs/mcp/**`；逐字与门禁引擎 V2 新卡文本同口径，工具语义零变化） |
| `test/runtime-core/mcp-declarations.test.ts` | **新增 6 用例**：好件七字段＋env 原文/坏件两档（入口防御/名非法/保留名/解析失败逐项）/列表判据与诊断/根防御＋回调吞错/接线注入（纯读＋新 bind 重读＋按角色过滤＋坏件不扰） |
| `test/runtime-core/install-mcp-tools.test.ts` | **新增 6 用例**：注入才注册（含与技能对互不搭车、四全注入）/两组文案钉住＋负向断言/三态回执与载荷路由/失败如实＋契约外 fail-closed/参数校验＋metadata＋预中止 |
| `test/runtime-core/tools.test.ts` | 「注入才注册」全量注入用例扩到 **16 工具**（14→16；MCP 两能力加入注入面）；`request_confirmation` 文案断言同步**四棵**（含 `docs/mcp/**` 点名、写入句按四棵计数、旧「三棵/两棵」计数防回退负向） |
| 本记录 + `changelog.md` + `memo.md` + `feature-map.md` + `api-spec.md` | dated 记录与导航 |

## 行为钉点（测试逐条钉住）

- **接线注入**：真实 Service（`createRuntimeAdapter` + 桩 provider）下，`docs/mcp` 无 ⇒ 注入 `[]` 且**绝不建目录**；装入本角色声明 ⇒ 新 bind 重读并注入（按角色过滤、坏件跳过不扰）；置 `uninstalled` ⇒ 再开不再注入。
- **注入才注册**：缺省三工具；`installMcp`/`uninstallMcp` 各自独立（未注入 ⇒ 工具不存在，结构性 fail-closed）；与技能对互不搭车；全量注入面＝16 工具。
- **参数**：`roleId`（容忍 `role_id`/`role` 别名）与 `name` 非空字符串；非法/缺失 ⇒ 拒绝且**不触达能力**（零副作用）。
- **ok:true 呈现**：`MCP「<name>」已安装/已卸载 → 角色「<roleId>」`＋`声明：docs/mcp/<name>.md（sha256 <digest 前 12 位>）`＋生效态（`rebuilt`＝已重建该角色会话、即刻生效；`next-session`＝该角色正在运行轮次（不打断）——新会话起生效）＋`note` 如实附上＋**重申「本次未改变任何角色的写边界」＋「外来 MCP 工具在 ANS 门禁之外执行（能力级授予），不是逐调用受审」**；卸载呈现「**效果已撤；声明保留于 <path>**」二分＋「**已发生的副作用不可撤**」；延迟态不得称「即刻生效」。
- **失败如实**：`ok:false` ⇒ `reason`＋回执 `message` 原文＋「零副作用」＋「不要当它已安装/已卸载」；`not-customer-turn` 护栏文案逐字转达；**绝不**出现伪成功。
- **能力抛错** ⇒ 「MCP**未能安装/卸载**（原因）——不要当它已安装/已卸载」；**契约外回执**（缺失／缺字段／action 与工具不符／旧字符串形状）⇒ fail-closed「未返回明确回执——按未执行处理」。
- **metadata** 沿 dispatch 先例透传；预中止不调能力（`abortedToolResult` MCP 专条）。
- **工具层全程不写盘**：handler 只解析参数→调注入能力→转达回执（无任何 fs 调用面）。

## 跨上下文对齐（本批并行，已核）

1. **编排（同批已落）**：`SU_PREAUTHORIZED_WRITE_DIRS` 已含第四棵 `docs/mcp`（其记录 `角色卡/编排/docs/change/2026-10-16_change_g4v2-mcp-preauth.md`）——与本波「先落盘再激活」口径一致（su 直写 `docs/mcp/<name>.md` 无卡）。
2. **门禁引擎（同批已落）**：su 卡「确认制要点」已四棵、「安装纪律」段已含 MCP 部分（其测试 `test/门禁引擎/su-doc-surface-convention.test.ts` 四棵与 MCP 段在场）——与本 schema 文案同口径。
3. **PM 并入本轮的机械同步（单列）**：`request_confirmation` 描述/guideline 的预授权目录陈述「三棵」→「**四棵**」（增 `docs/mcp/**`，`docs/su/**`、`docs/contracts/**`、`docs/skills/**` 逐字保留；写入句「写入这四棵目录树**无需逐次确认**」与门禁引擎新卡文本同口径），`test/runtime-core/tools.test.ts` 对应断言同步（含旧「三棵/两棵」计数防回退负向）；**该工具语义零变化**（写盘仍一律先经本工具确认；preview 逐条列路径；`confirmed:true` 唯一凭据）。
4. **桌面 handler / 编排能力透传接口点（未落，fail-safe toward 现状）**：注入端判据沿技能对先例（编排 `suppressHandback ? input.installMcp : undefined`／桌面 `role.builtIn === true`）；handler 校验面＝`readMcpDeclaration`（**单一解析来源**：声明缺失→`not-registered`、未含角色→`role-not-listed`、卸载未撤销→`registration-unchanged`；护栏 `not-customer-turn`）→激活（复用既有重建；在跑不打断 ⇒ `next-session`）→回执（`path`＝`docs/mcp/<name>.md`、`digest`＝声明文件当刻字节 sha256）。**平台面尚未接入时的如实拒绝**（设计 §3.3「运行时尚未接 MCP 安装」文案）归 handler/批次轮，本层不造文案。
5. **三平台装配（P1–P3，各属主）**：`RuntimeProviderOptions.installedMcpServers` 为冻结消费面（Service 已注入；本波**不改任何适配器**——未消费即对既有行为零影响）；文件头诚实面（门禁外执行）为批文案底线。

## 实测（本机 macOS arm64 / Node v24.14.0）

`test/runtime-core/**` **125/125**（基线 113＋本批 A 6＋B 6）；`npm run typecheck` **0 错**；全量 `test/**/*.test.ts`（与并行角色已落改动同工作树）**1898 计 / 1889 过 / 8 红 / 1 skip**——8 红逐条归属：①-⑦＝**编排/门禁引擎并行已落改动**对 `test/测试/` 旧钉子的红（g4 c-preauth「docs/mcp 未预授权」、g4 d-card-guard「三棵树话术/非空洞」、g1「恰为三棵/卡文本三目录/反向断言/非空洞」——非本波，本波未触碰 `test/测试/**`）；⑧＝`test/测试/g4-skill-verify/h-scope-audit.test.ts` 范围②「MCP V2 零产品实施」——**本波（＋门禁引擎卡文本提及）的已声明预期红**（该钉钉的是 V1 时点事实，归测试角色同轮翻转，V1 先例）。

## 未验边界

- **工具当前不注册**（桌面/编排未接线注入 ⇒ 结构性 fail-safe toward 现状）；端到端可用性待桌面 handler＋平台批次（P1 起）＋独立验证。
- 三平台装配/放行/呈现行（P1–P3）、`env:NAME` 在适配器的**真值展开**、`!` 之外形态（如 `${VAR}`）的平台侧处理、名**清洗碰撞**拒绝（`a-b` vs `a_b`；§5.3 残余 2 属平台/配置侧）、HTTP/OAuth 面——均不在本波（读取器不做清洗碰撞）。
- 未做真机装-看-用-撤 E2E（设计 §十观测项；待桌面＋P1 齐后合并验收批）；未 git 提交；未触碰 `test/测试/**`、在飞他方改动（编排/门禁引擎/桌面）与真机轮目录。
