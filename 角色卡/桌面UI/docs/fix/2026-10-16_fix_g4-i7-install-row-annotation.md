---
id: desktop-ui-g4-i7-install-row-annotation
type: fix
title: G-4/I7（桌面UI）：安装工具行/系统行如实标注——「零改动」实证 + 断言守卫（复用既有工具行与 [系统·…] 先例）
created: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [role-capability-install, kanban-fixes-pm-review, toolrow-turn-collapse]
events:
  - date: "2026-10-16"
    kind: created
    summary: 客户批准 G-4 V1（技能安装全链，I1–I4＋I6＋I7）后按派发做 I7（行样式，属主桌面UI）；核查结论＝渲染平面零改动，新增 4 例断言守卫 + 零特判实证登记
  - date: "2026-10-16"
    kind: implemented
    summary: app/renderer/** 零触碰（字节指纹与工具行折叠批逐位一致）；test/桌面应用/ 新增 4 例（tool-rows 3 + renderer 1）；桌面目录 358/358、typecheck 全仓 0 错、全量 1814/1809/4红（4 红＝他域已登记预期红，与本批零交集）；独立验证与真机 E2E 交测试/桌面窗口轮
---

# G-4/I7（桌面UI）：安装工具行/系统行如实标注——零改动实证

## 0. 依据与冻结口径

- 客户 2026-10-16「都按推荐批准，开始实施」＝G-4（角色能力安装）V1 十项裁定全采纳；批准范围含 **I7（行样式，属主桌面UI）**——设计 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §5.4/§九：*「安装行（su 会话）：`install_mcp` 调用按既有工具行渲染＋激活后一条定格系统行（沿 `[系统·<子类>]` 形态，如 `[系统·安装]`；不可撤回面同 `system` kind）……不新造一套行体系」*（V1 技能面同口径，I7 行＝*「安装工具行/系统行的如实标注（复用既有工具行与 `[系统·…]` 先例）」*）。
- 冻结面（本批只依赖这三条，不依赖其余实施细节）：
  - 工具名：`install_skill` / `uninstall_skill`（src 常量单一来源：`src/provider/runtime/tools.ts` `INSTALL_SKILL_TOOL_NAME`/`UNINSTALL_SKILL_TOOL_NAME`；只给 su 注入、调用本身成行）；
  - 系统行子类：`[系统·安装]`（安装/卸载完成后的定格系统行，文首标记形态沿既有 `[系统·<子类>] ` 先例）；
  - 呈现面判据：复用既有工具行渲染与系统行渲染链，**不加新样式体系、不加逐工具/逐子类特判**。
- 系统行正文的**措辞**属产出方（I3 桌面窗口 handler / 文案单一来源）——本批断言只钉**标记形态**与分类器契约字段，不钉全文（防与产出方措辞演进耦合）。

## 1. 核查结论：渲染平面零改动（逐环节）

推理链：渲染侧对两工具名与子类标记**零引用**（§3 实证）⇒ 无特判面 ⇒ 新名字按构造走通用链；通用链覆盖面由 §2 断言钉住。逐环节：

### 1.1 `[系统·安装]` 系统行（聊天流）

- **归类**＝`app/renderer/tool-rows.js::classifySystemMessage`（L74–L90）：判据只依赖 `[系统·<子类>] ` **标记形态**（`SYSTEM_HEAD` 开头、子类闭合于 `]`、长度 ≤12、其内无括号/换行、后随空白或文末）——**不逐子类登记**；`安装`（2 字）天然满足。产出 `{kind:"system", label:"系统消息 · 安装", sourceRoleId:"", body, displayBody}`（`displayBody`＝W6b 已定格的去文首标记正文）。
- **呈现**＝`renderer.js::buildInjectedElement`（L2299–L2313）：类名 `"msg msg-injected is-" + inj.kind` ⇒ `is-system` 单一族样式；图标 `ICONS.shield`；chip＝`esc(inj.label)`；正文取 `displayBody`（缺席回退 `body`）——W6b/视觉收敛 v3 已定格，零子类分支。
- **回显/回放同解**：实时＝`prompt-input` 回显经 `classifyInjectedMessage`（L2462–L2466）；回放＝历史 `kind:"user"` 行经同一分类器（L3361）。两条路都零改动。
- **队列面**：`ui-labels.js::queueSourceLabel("system") ⇒ 「系统」`；撤回判据 `v.kind === "message"` ⇒ system 行**不可撤回呈现**（G-2/U1 已定格，L3669）——「不可撤回面同 system kind」零改动达成。
- **前缀去重**：`displayBody`（chip 已承载「系统消息 · 安装」）沿 W6b 既有口径，无新逻辑。

### 1.2 工具行（`install_skill`/`uninstall_skill`）

- **入口**：`renderer.js` L2470——`(kind==="tool_call"||kind==="accepted") && Tr.isToolActivity(ev)` ⇒ `appendActivity(pane, Tr.activityOf(ev))`；`denied` 同款（L2472–2474）；回放 `kind:"tool"|"denied"` 同函数（L3356–L3358）。均**按事件事实**（`detail.toolName`），无工具名白名单。
- **事实映射**＝`tool-rows.js::activityOf`：工具名取 `d.toolName` 等既有来源；`SPECIAL_TOOLS`（卡片/屏障表）不含两新名 ⇒ `barrier` 仅由 `hasDisplay`/`anchorKey` 决定（真实投影事件恒带 display ⇒ 走生命周期独立行 `.tool-call-record`（工具名直出，L1193）；无 display/legacy ⇒ 进轮内工具组）；`ok:false` 回执（护栏拒绝＝未执行零副作用）走既有 failed 口径，「失败原因头」如实保留。
- **瘦身映射**＝`slimToolRow`：`^([\w.-]+)[:：]` 的 `\w` 含下划线 ⇒ `install_skill：…` 解析零漂移；重名去重、含路径不折叠、140 硬上限——全部既有规则，零改动。
- **折叠摘要**：`mergePhases`/`callSummary` 按**工具名计数**（首现序 `[{name,count}]`，名字取终态相位）——无白名单；`renderer.js::foldSummaryText`（L1036–L1043）自 `sum.tools` 直出「本轮 N 个调用：a / b ×k」——新名字自动入摘要。**确认：无需特判**。

### 1.3 样式体系

系统行唯一 `is-system` 钩子（`styles.css` L877–L879），无按子类/按工具名派生样式类；零新增。

## 2. 测试与断言（本机实测，2026-10-16）

新增 **4 例**（全部新增、零修改既有断言）：

- `test/桌面应用/tool-rows.test.ts`（+3，纯函数）：
  1. `[系统·安装]` 归类——实时回显/回放同解、chip 标签「系统消息 · 安装」、来源=系统、`displayBody` 去标记、仅标记无正文、行内提及不归类；
  2. `install_skill`/`uninstall_skill` 工具行——结构化（发起/结果/`display.target` 目标单点）＋ `ok:false` 回执（failed 口径、护栏 reason 保留在可见首行）＋ legacy 文本（`调用工具 install_skill` 正则命中）＋ 瘦身（下划线工具名、含路径不折叠、140 上限、重名去重）；
  3. 折叠分解——新工具名进 `callSummary.tools`（首现序/×k/与既有工具同路径）。
- `test/桌面应用/renderer.test.ts`（+1，源码守卫）：**零特判实证**——渲染平面四个源文件（renderer.js/tool-rows.js/ui-labels.js/styles.css，去注释后）对 `install_skill`/`uninstall_skill`/`[系统·安装]`/`系统·安装` **零引用**；`tool-rows.js` 代码不含任一子类名（看护/收束/恢复/安装——不逐子类登记）；无 `.is-system-` 样式变体；渲染侧不持第二份特殊工具表（单点在 tool-rows）；生命周期行工具名直出、折叠分解按 `t.name` 直出。

**结果**：`node --test "test/桌面应用/*.test.ts"` → **358/358**（原 354＋4）；`node --test "test/桌面应用/renderer.test.ts"` 54/54、`tool-rows.test.ts` 21/21；`npm run typecheck` → **全仓 0 错**。

**全量** `node --test "test/**/*.test.ts"` → **1814 计 / 1809 过 / 4 红 / 1 skipped**。4 红＝他域**已登记预期红**（与本批零交集，未触碰）：`test/测试/g1-verify/g1-copy-and-nails.test.ts` ×3（G-1 独立钉子：预授权目录「恰为两棵」待随 I5 第三棵 `docs/skills` 翻转；卡文本两钉待随 I6 卡文本演进同批收口）＋ `test/测试/g3-search-verify/pi-loopback-verify.test.ts` ×1（G-3 探针旧行为钉，随 cleanPatterns 轻修归测试角色同批翻转——PM 2026-10-16 已登记口径）。跳过＝既有 Windows 专用用例。

## 3. 「零改动」实证

- **字节级**：`app/renderer/**` 未触碰（`git status` 无任何 app/renderer 条目）；五个渲染侧文件 sha256 前 8 位与工具行折叠批指纹**逐位一致**（§5 表）——非「改了不算」而是**逐字节未动**。
- **符号级**：四个源文件去注释后在代码中对 `install_skill`/`uninstall_skill`/`[系统·安装]` **全仓零命中**（`renderer.test.ts` 新守卫钉住，可重跑复验；G-3「合流即桌面零改动」同款证据形态）。
- **行为级**：§2 纯函数断言证明通用链对新名字确有覆盖（归类/工具行/折叠分解三面）。

## 4. 未验边界（如实登记）

1. **产出方未落树**：`[系统·安装]` 行的实际产出属 **I3（桌面窗口）**，本批核查时未落树——本批按冻结形态（沿 `[系统·<子类>] ` 先例）核查与断言；真机/离线 e2e 观测属 E2E 轮（沿各批先例）。
2. **标记形态契约**：若 I3/编排产出方改掉 `[系统·` 标记形态（或标记前有非空白字符），归类会**静默回落普通气泡**——单点＝`tool-rows.js::SYSTEM_HEAD` 一带（注释即契约），与 G-2 memo 既有注记同款。
3. **卸载行子类命名**：本批按任务冻结面「`[系统·安装]`（安装/卸载完成后的定格系统行）」断言；若文案单一来源后续为卸载另立子类（如 `[系统·卸载]`），渲染侧**零登记**同样覆盖（形态判据）——命名归属产出方裁定，不属本批。
4. **呈现路径的两条**：真实投影事件恒带 display ⇒ 走**生命周期独立行**（`.tool-call-record`，工具名/目标/状态直出）；无 display 的 legacy/降级路径 ⇒ 进轮内工具组（折叠摘要按名计数）。两条路共用 `activityOf` 事实単点、都零特判；**未**在真机上观测两新工具实际落哪条（取决于投影面，E2E 轮观测项）。
5. **队列条目前缀**：工作概览队列条目的 `[系统·X]` 摘要由主进程产出（W6b 只含聊天流——沿 v3 memo ⑤），本批未动。
6. **回放仿前缀残余边界**（既有，非本批）：历史行无投递身份，手输仿 `[系统·安装]` 前缀文本回放会被归成注入行（呈现层来源张冠李戴；U1 批已如实登记）。

## 5. 文件与指纹（sha256 前 8 位）

| 文件 | 指纹 | 说明 |
| --- | --- | --- |
| `app/renderer/renderer.js` | `27d72e8e` | **零触碰**（与工具行折叠批一致） |
| `app/renderer/tool-rows.js` | `2fd2335f` | **零触碰**（同上） |
| `app/renderer/ui-labels.js` | `564fdb9a` | **零触碰**（G-2/U1 批起未变） |
| `app/renderer/styles.css` | `7cf067d4` | **零触碰**（同上） |
| `app/renderer/index.html` | `a39e3652` | **零触碰**（G-2/U1 批起未变） |
| `test/桌面应用/tool-rows.test.ts` | `52c2c4e7`（改前 `a599d1da`） | +3 例（G-4/I7 段） |
| `test/桌面应用/renderer.test.ts` | `3bce42fb`（改前 `db80beee`） | +1 例（零特判守卫） |

## 6. 边界与纪律

- 只触碰 `test/桌面应用/tool-rows.test.ts`、`test/桌面应用/renderer.test.ts` 与本角色 docs/changelog/memo；`app/renderer/**` 零触碰（I7 结论＝无需适配）；未碰 `src/**`、`app/desktop/**`、`test/测试/**`、其它角色文件。
- 未 git 提交（沿各批先例，由 PM 统一提）。
- 独立验证与真机 E2E 交测试角色/桌面窗口轮。
