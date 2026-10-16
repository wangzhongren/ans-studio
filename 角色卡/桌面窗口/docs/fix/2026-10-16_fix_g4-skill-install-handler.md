---
id: fix-g4-skill-install-handler
type: fix
title: G-4/I3＋V2 技能与外来 MCP 安装/卸载 handler＋裁定④轮次护栏＋裁定⑤ O-1 指纹扩展（桌面窗口实施记录）
created: "2026-10-16"
updated: "2026-10-16"
status: 已实施待验证（单测全绿；「注入→工具注册」端到端待编排透传落树；独立验证与真机 E2E 待测试/root）
---

# G-4/I3＋V2（技能与外来 MCP 安装/卸载 handler）桌面窗口实施记录

来源：客户 2026-10-16「都按推荐批准，开始实施」＝ G-4 V1 十项裁定全采纳（[PM 评审 §「客户批准」](../../../项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md)）。设计规格＝[角色能力安装（技能＋MCP）](../../../产品/docs/design/2026-10-16_design_role-capability-install.md)（下称「设计」）。PM wave-2 派发桌面窗口＝**I3（handler：校验／激活复用 rebuildSession／三态回执／系统行／诊断）＋裁定④（轮次触发护栏：仅客户消息发起的轮次可执行）＋裁定⑤（O-1 指纹集扩展：登记＋内容文件，settle 即收敛）**。冻结符号（PM）：工具名 `install_skill`/`uninstall_skill`＋`install_mcp`/`uninstall_mcp`；能力位 `installSkill`/`uninstallSkill`＋`installMcp`/`uninstallMcp`；回执冻形 `{ok:true, action, roleId, name, path, digest, effective, note?}` / `{ok:false, reason, message}`（MCP 沿技能版体格，`path`＝`docs/mcp/<name>.md`）；护栏拒绝 `reason:"not-customer-turn"`；系统行 `[系统·安装]`（技能与 MCP **共用同一子类**）。**客户随后批准 V2（外来 MCP，wave A 契约层）**——桌面侧 MCP handler 沿技能 handler 同构同日追加（§六）。

**状态：已实施（全部落点在本角色边界内）／单测已过／独立验证与真机 E2E 未做**（按 PM 安排由测试角色/root 执行）。

---

## 一、改动总表（全部在边界内）

| 项 | 落点（本角色文件） | 要点 |
|---|---|---|
| I3 注入点 | `app/desktop/session.ts::openInternalUnsafe` | 判据 `role.builtIn === true`（沿 G-2 `role_status`/`propose_recovery` 先例）——**仅 su 会话注入** `installSkill`/`uninstallSkill` 两能力位（形状＝契约家 `model/runtime.ts`，**只读导入、不复制形状**）；经 `openRoleSession` 输入透传（`...(installSkill ? { installSkill } : {})`）。**注入才注册**：未注入 ⇒ 工具不存在（结构性 fail-closed）；项目角色会话不注入（零感知） |
| I3 handler | `app/desktop/session.ts` 新段「G-4：技能安装/卸载 handler（I3）」——`applySkillChange(action, projectRoot, runtime, suRoleId, d)` 共用实现＋两薄包装（`applySkillChange("installed"…)`/`("uninstalled"…)`） | 分支顺序：护栏 → 载荷防御 → 角色 → 登记 → 内容件/digest → 激活 → 回执＋系统行＋诊断。**工具不写盘**（落盘永远由 su 的 `write_file` 完成＝「先落盘再激活」）；**失败一律 fail-closed＝未执行、零副作用**；**不改变任何角色的写边界** |
| 裁定④ 护栏 | `session.ts::isCustomerInitiatedTurn`（`applySkillChange` **第①步先判**） | **当刻**读活会话状态（`activeDeliveries`/`busy`——不靠界面推测）：有在跑投递条目 ⇒ 仅 `kind === "message"` 放行（忙时排队的客户消息投出的一轮）；`handback`/`dispatch`/`system` 三类投递轮次拒绝；无在跑条目 ⇒ **直接 `send`**（唯一调用方＝客户聊天 `sendSession`）放行；会话不在/不在轮次 ⇒ 拒绝。拒绝回执＝PM 冻结文案 `本动作仅可在客户消息发起的轮次执行——未执行。`（`reason:"not-customer-turn"`），零副作用 |
| 裁定⑤ 指纹 | `session.ts::currentSkillPaths`＋`LiveSession.skillPaths`＋`boundaryDiff` 扩展＋开会话/重建快照处 | 「该角色已安装技能」参与文件（`docs/skills/<name>/SKILL.md`＋`install.md`）随边界快照**同处定格**（加入 `boundaryPaths`/`boundaryPrints`）＋单独 `skillPaths` 冻结集；**检查时刻以同一推导重算当前集合**、比对**集合差**（新增/移除）——内容编辑由既有冻结路径逐字节比对覆盖。判据与渲染器注入节**同集合**（登记读取＝编排 `readSkillRegistration` 单一来源，不复制解析逻辑；`uninstalled`/角色不命中/坏件跳过）。**零技能＝空集**（既有指纹语义逐字不变）；读目录防御失败（非 ENOENT）⇒ 跳过本轮集合比对（绝不误重建） |
| 陈旧重建行 | `session.ts::rebuildIfBoundaryStaleUnsafe` | 变化路径在 `docs/skills/` 下 ⇒ 专用如实措辞「该角色**已安装技能**已变更（…），已作废旧会话，按新技能登记重开；…」（技能不是边界——不误称「边界」）；其余分支**逐字沿用**既有文案（测试已钉） |
| 系统行 | `session.ts`：成功收尾经 `watchdogDeliver`（**既有 `kind:"system"` 第四类通道**真投递给 su——忙时排队/未开自动开/失败保留重试全复用；不可撤回） | 文首＝导出常量 `CAPABILITY_INSTALL_SYSTEM_PREFIX = "[系统·安装]"`（**技能与 MCP 两类安装动作共用同一子类**；形态契约＝`[系统·<子类>] `＋一个 ASCII 空格，与桌面UI `tool-rows.js::SYSTEM_HEAD` 归类判据对齐）；正文如实：动作/角色/技能名/生效态/路径/`sha256` 前 12 位；卸载含「效果已撤，文件保留于…」二分；队列行摘要 `系统·安装 · 已装/卸技能「X」· 角色「R」· …`；去重键 `watchdog\0<root>\0install-row\0<uuid>`（独立、不去重——重装/重卸是合法事件） |
| 回执 | `InstallSkillReceipt`（冻形逐字段） | `path`＝`docs/skills/<name>/SKILL.md`（项目相对）；`digest`＝**运行期算的当刻字节 sha256**（复用 `filePrint` 缓存件——与渲染器/finalize 同算法）；`effective` 三态如实（见 §二.2） |
| 诊断 | `skill.installed` / `skill.uninstalled` / `skill.refused`（含 `reasonCode`）/ `skill.rebuild.failed`（error 级），字段全走 `diagnostics.ts` 白名单（`toolName`/`targetRoleId`/`path`/`state`/`reasonCode`） | 只存元数据（skill 名经 `path` 承载；不新增字段名） |
| Interface 镜像 | `app/desktop/interface.ts::DesktopDeps.openRoleSessionFn` 输入型 | 增 `installSkill?`/`uninstallSkill?` 两可选字段（镜面透传面；H-1 先例——**编排 `run-role.ts` 同名字段透传落地前被其静默忽略，零行为影响**，登记见 §四） |

## 二、关键设计裁定（实施口径，均如实登记）

1. **护栏判据＝「当刻活状态」而非 metadata**：设计 §6.4 明文「桌面 handler 读该角色当前 `activeDeliveries` 的 kind 即可判定」——`activeDeliveries` 无条目 ⇔ **直接 send** 开跑的轮次（全仓唯一调用方＝客户聊天 `sendSession`，`interface.ts:530/554`），故放行；这正是「空闲 su 收客户指令」的主路径（若拒它，工具在正常用法下不可用）。工具层 metadata（turnId 等）属展示面，本层**不接收、不消费**、不作判定依据。
2. **生效态三态**（`effective`）：目标会话 idle ⇒ 复用 `rebuildSession` ⇒ `"rebuilt"`（即刻生效）；**在跑 ⇒ 不打断** ⇒ `"next-session"`（ok:true 延迟态，**不是错误**）；**目标无会话 ⇒ `"next-session"` ＋`note` 如实**（「该角色当前没有打开的会话（并非在跑轮次）——新会话打开即生效」——设计未枚举的边：无旧上下文可重建、**绝不自动开目标会话**（激活≠开户）；note 同时纠正工具层按 `effective` 渲染的通用句在「无会话」下会读成「正在运行轮次」的歧义）。重建失败（重开失败）⇒ `{ok:false, reason:"rebuild-failed", …}`（登记仍在、会话未重建——不假装已生效；不投系统行）。检查后开跑的竞态 ⇒ 按其如实延迟（不报失败）。
3. **卸载「先改登记再卸载」**：登记仍含角色且 `installed` ⇒ `registration-unchanged` 拒绝（PM 冻结文案逐字）；登记视图缺失/不可解析 ⇒ 如实拒绝（`not-registered`，文案按卸载口径改述——「没有可撤销的登记」）；`uninstalled` 或不含角色 ⇒ 受理。
4. **安装的状态面**：`roles` 不含 ⇒ `role-not-listed`；`status !== "installed"` ⇒ `not-registered` 类如实（「技能**未登记为已安装**：…状态为「uninstalled」——先改登记再安装；未执行。」）；`SKILL.md` 缺失/不可读 ⇒ `not-registered` 类如实**（安装与卸载同处理**——回执冻形要求 `path`＋`digest` 非空且卸载须能如实作「文件保留」陈述，**不拿 `<missing>` 哨兵充数**）。
5. **激活运行时绑定**：以 **su 会话的 runtime** 定位目标会话（`sessionKey(projectRoot, targetRoleId, runtime)`，确定性绑定）；目标无该运行时会话 ⇒ 上述 `next-session`。多运行时下他运行时会话不在此次即时重建范围，由其自身既有检查点（含裁定⑤ 指纹）在下次发言/续接/投递/settle 扫描收敛（登记为口径）。
6. **陈旧重建行措辞**：技能文件变化走专用句（§一表）；边界/`.ans`/运行时配置分支逐字不变（`test/桌面应用/hot-path.test.ts`、`boundary-refresh.test.ts` 既有钉子全部保持绿）。
7. **零副作用的确切边界**：一切拒绝不触目标会话、不读登记？——不：「先判」护栏在登记读取**之前**；其后各拒绝分支只读不写；诊断事件（白名单元数据）与 `emitEvent` 系统行**只在成功路径**产生。拒绝路径仅写诊断（`skill.refused`——观察面，沿 `recovery.refused` 先例；不写盘面、不改内存判定链）。
8. **「客户确认的恢复动作」重建行**：激活复用的 `rebuildSession` 会向**目标角色**聊天流发 W4 既有行（「已按要求（客户确认的恢复动作）重建…」）——**逐字沿用未改**（其文案在 G-2 已钉、且安装同为客户指令动作）；安装动作的权威记录是 su 侧 `[系统·安装]` 行。

## 三、测试与证据（本机实测，2026-10-16）

- `test/桌面应用/dispatch-delivery.test.ts` **31/31**（净增 7 例 G-4 组）：注入才注册（su 有/项目角色无）；安装成功（冻结回执逐字段＋digest＝测试侧独立 `createHash` 复算＋`rebuilt`＋目标确已重建）；`[系统·安装]` 行（队列快照 kind=system／`withdraw` 驳回「不是客户消息」／settle 后经第四类通道真投递、digest 与回执一致）；校验全分支（role-not-found〔su 自身/未知〕/not-registered〔缺登记、未生效态、缺内容件〕/role-not-listed/registration-unchanged——全部零副作用：目标未开、无系统行）；护栏（无轮次拒绝；`[系统·看护]` 轮次拒绝；客户直聊放行；排队客户消息 `kind:"message"` 放行；拒绝零副作用）；生效态（无会话 ⇒ next-session＋note、不自动开目标；在跑 ⇒ next-session、目标重建计数不变＝不打断）；重建失败（注入开会话失败 ⇒ rebuild-failed、原因原文、不投系统行）；卸载（先改登记 ⇒ rebuilt；SKILL.md 文件保留；系统行「效果已撤，文件保留于」二分）。
- `test/桌面应用/boundary-refresh.test.ts` **12/12**（净增 6 例 G-4 组）：新增（落盘 ⇒ `refreshStaleBoundaries`（＝Interface su-settle 扫描入口）即重建、行点名 `docs/skills/lint/SKILL.md`、重建后不振荡；**零技能逐字不变**）；内容编辑（`SKILL.md` 字节变化 ⇒ 发言前既有检查重建；未变不重建）；移除（登记取消角色 ⇒ 点名 `install.md`；目录整体消失 ⇒ `<missing>` 参与比对）；负例（他角色技能/uninstalled 件内容变化零触发——与渲染器过滤口径同集合）；接线钉（`readSkillRegistration` 单一来源、集合差双向、注入才注册、护栏判据行、重建行技能措辞、Interface 镜像字段）。
- `test/桌面应用/` 全目录 **371/371**（358→371，净增 13；含桌面UI 并行批次文件，零触碰）；`npm run typecheck` 全仓 **0 错**。（**V2 增量后同批计数**：dispatch-delivery **38/38**、全目录 **382/382**——见 §六。）
- 全量 `test/**/*.test.ts` **1827 计 / 1826 过 / 0 红 / 1 skipped**（skip＝既有 Windows 专用用例）——**该快照为 V1 单批时点**；V1 前登记的 4 条他域预期红（`test/测试/g1-verify/g1-copy-and-nails.test.ts`×3 预授权钉、`test/测试/g3-search-verify/pi-loopback-verify.test.ts`×1）当时已由测试角色并行落树的钉子同步消解（复跑 12/12 绿）。**V2 批次落树后的当前快照与红清单见 §四.4**。

## 四、未验边界与依赖登记（如实）

1. **端到端注册依赖编排透传**（截至本记录时点）：技能对（`installSkill`/`uninstallSkill`）的编排透传**已由编排属主落树**（`run-role.ts` `AdapterCapabilities`/输入型/`suppressHandback` 判据同名字段——桌面侧自此端到端接通）；**MCP 对（`installMcp`/`uninstallMcp`）编排侧尚未透传** ⇒ V2 两工具当前**端到端尚不注册**（桌面侧已透传就位，H-1 先例；编排补同名字段即点亮，无需再改本层）。**归 PM 路由编排属主补线**。
2. **独立验证与真机 E2E**：设计 §十 的装-看-用-撤全链观测项（无卡、工具行、`[系统·安装]` 行、注入生效、在跑不打断、卸载、偏离可见）交测试/root；本批未做。
3. **未覆盖的窄边**：多运行时（目标会话在他 runtime）即时性＝延迟收敛（§二.5）；`docs/skills` 读目录非 ENOENT 失败 ⇒ 跳过本轮集合比对；LRU 竞态窗口内目标会话被并发释放 ⇒ 按 rebuild-failed 如实报因（内容为「没有打开的会话」原文——保守但如实）；MCP 在跑目标的延迟**无 settle 收敛**（裁定⑤ 指纹只覆盖技能文件——MCP 生效＝下次开会话，与 `mcp-declarations.ts` 模块头「生效语义＝下次开会话」同口径；未扩不属本批）。
4. **test/测试 旧钉（预期红，待测试角色翻新）**：G-4 V1 独立验证套件等对**V1 范围**的断言随 V2 批次落树转红（全量快照 **1907 计 / 1898 过 / 8 红 / 1 skip**；8 红全在 `test/测试/`：`g1-verify/g1-copy-and-nails.test.ts`×3〔预授权「恰三棵」/卡文本三棵两钉〕、`g4-skill-verify/c-preauth.test.ts`×1〔「docs/mcp 未预授权」钉〕、`g4-skill-verify/d-card-guard.test.ts`×2〔「三棵树话术」/变异点按旧卡文本定位〕、`g4-skill-verify/h-scope-audit.test.ts`×2–3〔范围①「恰三棵」/范围②「MCP V2 零产品实施」/范围⑥「mcp-surface 探针」——Pi 侧探针文件在飞未全落盘〕）——由 **V2 批次整体**（契约/工具/门禁卡四棵/编排预授权/本层 handler 五方）触发，**非本批单方回归**；本批范围的**行为钉全绿**（`g4-skill-verify` 的 e-handler/f-fingerprint/g-splicing/b-render/a-tools **31/31**、范围③行为〔真实装配全链零二次卡〕/范围③补⑤〔桌面注入判据〕/范围④〔卸载链无删除原语，切片含 `applyMcpChange`〕均过）。按 PM 口径「旧钉待测试角色翻新，不处理」如实登记（工作树在多方并行落树中，红数以复跑时点为准）。
5. **跨边界零触碰**：`src/**`（只读导入 `readSkillRegistration`/`readMcpDeclaration`/契约类型）、三适配器、`app/renderer/**`、`test/测试/**` 与他人测试文件均未改；未 git 提交；未跑真实网关。

## 五、回滚

单点回滚：`session.ts` 的注入两行（`...(installSkill ? …)`/`...(uninstallSkill ? …)`；V2 同款 `...(installMcp ? …)`/`...(uninstallMcp ? …)`）移除 ⇒ 对应工具不注册（其余为纯新增方法/字段，无既有路径行为改变）；`boundary-refresh`/`dispatch-delivery` 的新增用例可按批删除。指纹扩展与重建行分支若单独回滚：还原 `boundaryDiff`（去掉集合差段）＋open 处移除 `skillPaths` 注入＋行分支还原单句——但会回落到「安装后需换会话生效」的延迟窗（设计 §4.3 登记口径）。

## 六、V2 增量（外来 MCP handler，同日追加）

**依据**：客户批准 V2（wave A 契约层）；运行时核心落盘契约（`InstallMcpFn`/`UninstallMcpFn`/`InstallMcpReceipt`——`model/runtime.ts`；`readMcpDeclaration` 单一解析来源——`src/common/runtime-core/mcp-declarations.ts`；schema/tools 两工具案与 maker）后，桌面侧 handler 沿技能 handler **同构实施**。

| 项 | 落点 | 要点 |
|---|---|---|
| 注入点 | `session.ts::openInternalUnsafe` | `installMcp`/`uninstallMcp` 两能力位（判据同 `role.builtIn === true`）；经 `openRoleSession` 透传（`...(installMcp ? …)`/`...(uninstallMcp ? …)`）；**注入才注册**、项目角色零感知；`interface.ts` 镜像字段同款 |
| handler | `session.ts::applyMcpChange`（两薄包装同技能版） | 链：护栏（同 `isCustomerInitiatedTurn`）→ 载荷防御 → 目标角色（缓存 miss 重枚举同款）→ **声明校验**（`readMcpDeclaration` 单一来源：undefined ⇒ `not-registered`〔含名非法/保留名 `ans`/`ans_codex` 的坏件集〕；`roles` 不含 ⇒ `role-not-listed`；`status !== "installed"` ⇒ `not-registered` 类如实；卸载未撤 ⇒ `registration-unchanged`）→ **声明文件存在性与 digest**（`docs/mcp/<name>.md` 当刻字节 sha256——复用 `filePrint`；缺件如实拒绝不拿哨兵充数）→ **激活**（共用件 `activateRoleRefresh`——由技能版**等价提取**，三态/竞态语义逐字不变）→ 冻结回执＋`[系统·安装]` 系统行＋诊断 |
| 激活共用件（重构） | `session.ts::activateRoleRefresh` | 技能与 MCP 两族共用（idle⇒`rebuilt`／在跑⇒`next-session` 不打断／无会话⇒`next-session`＋note 不自动开／重开失败⇒error 交调用方组 `rebuild-failed`）；技能版行为经既有 31 例全量复跑逐条不变（等价重构） |
| 系统行 | 同 `watchdogDeliver` 第四类通道；文首同 `CAPABILITY_INSTALL_SYSTEM_PREFIX`（常量由 `SKILL_INSTALL_SYSTEM_PREFIX` **改名**——两类安装共用同一子类；无外部引用） | install：`已安装 MCP「X」→ 角色「R」；<生效语>；声明：docs/mcp/X.md（sha256 …）；外来 MCP 工具在 ANS 门禁之外执行（能力级授予，非逐调用受审）。`；uninstall：`已卸载 MCP「X」（角色「R」）；效果已撤，声明文件保留于 docs/mcp/X.md（sha256 …）；已发生的副作用不可撤；<生效语>。`（二分如实＋诚实面必讲）；摘要 `系统·安装 · 已装/卸 MCP「X」· 角色「R」· …`；去重键 `watchdog\0<root>\0mcp-install-row\0<uuid>` |
| 回执 | `InstallMcpReceipt`（沿技能版体格） | `path`＝`docs/mcp/<name>.md`；`digest`＝声明文件当刻字节 sha256；`effective` 三态同技能版（含无会话 note 的如实纠正） |
| 诊断 | `mcp.installed` / `mcp.uninstalled` / `mcp.refused` / `mcp.rebuild.failed`，字段同白名单口径（`toolName`＝`install_mcp`/`uninstall_mcp`；MCP 名经 `path` 承载） | 同技能版 |
| 诚实面（钉死） | handler/系统行**不得宣称逐调用受审**——门禁之外执行＝能力级授予写进系统行与状态行 | 与 schema/tools/卡文本同口径 |

**V2 测试与证据**：`test/桌面应用/dispatch-delivery.test.ts` **38/38**（净增 7 例 V2 组：注入才注册／安装成功〔回执冻形＋digest 测试侧独立复算＋`[系统·安装]` 行含诚实面真投递〕／校验全分支零副作用〔含保留名 `ans`、坏名 `bad.name`、未生效态〕／护栏矩阵／三态〔无会话 note、在跑不打断〕／重建失败不投行／卸载二分＋声明保留）；`test/桌面应用/boundary-refresh.test.ts` **12/12**（接线钉同测扩展 V2：两注入行、`applyMcpChange` 两处、`readMcpDeclaration` 单一来源行、`activateRoleRefresh` 共用件、Interface MCP 镜像）；`test/桌面应用/` 全目录 **382/382**；`npm run typecheck` 全仓 **0 错**；全量快照见 §四.4（`test/测试/` 8 红＝V1 范围旧钉与在飞探针，待测试角色翻新）。
