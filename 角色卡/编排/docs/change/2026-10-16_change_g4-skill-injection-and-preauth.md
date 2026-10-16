---
id: change-g4-skill-injection-and-preauth
type: change
title: G-4 I4+I5——会话开局注入渲染单一来源（renderInstalledSkillsSection）＋ su 预授权扩列 docs/skills
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [role-capability-install, kanban-fixes-pm-review, run-role, installed-skills, handback, finalize]
---

# G-4 I4+I5：开局注入渲染单一来源 + 预授权扩列（客户 2026-10-16 批准 V1，十项裁定全采纳）

**状态：已实施 / 待验证**（独立验证与真机复验未进行；未 git 提交）。全部落点在**编排**角色 `boundary.yaml` Section 1 内：**新增** `src/common/编排/installed-skills.ts`、**新增** `test/编排/installed-skills.test.ts`（13 例）、`src/pipeline/orchestration/run-role.ts`（常量与注释）、`src/pipeline/orchestration/govern-session.ts`（两处模型可见文案）、`test/编排/session-handle.test.ts` 与 `test/编排/confirmation-gated.test.ts`（既有预授权用例扩展断言）。**不碰** `app/**`、三适配器、运行时核心/门禁引擎任何文件——三适配器的接线（I4 的「各拼接一行」）由其属主实施，接口说明见 §五。

## 一、来源与权限

- 客户 2026-10-16 批准 **G-4（角色能力安装）V1 实施，十项裁定全采纳**（来源：提交 `d8eaa1c` 产品提案 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` + PM 评审呈批简表）。本批实现提案 §九 表的 **I4**（属主编排＋三适配器配合）与 **I5**（属主编排）。
- 相关裁定：**裁定 1**＝预授权扩列候选 1（扩 `docs/skills`；§4.6）→ I5；**裁定 2**＝加载路径终选 C「会话开局注入」（§4.2）→ I4 的机制；**裁定 3**＝登记形态两文件（`SKILL.md`＋`install.md`）、角色粒度＝角色列表（§4.1）；**裁定 6**＝技能可迭代、以文件当刻字节为准（不复刻契约冻结版本化，§4.3）。
- 本批**只做 I4 的渲染单一来源 + I5 常量扩列与测试面**。I1/I2（工具定义与 maker）、I3（桌面 handler）、I6（su 卡文本，门禁引擎）、I7（行样式，桌面UI）归各自属主；三适配器系统提示拼接归三适配器属主（本批交付其契约：导出路径与签名）。

## 二、结论

「已安装技能」注入节的**读登记 → 算 digest → 渲染**此前不存在（G-4 全链未实施）。本批按 §4.2-C 把三者收进编排一处 `src/common/编排/installed-skills.ts`（沿 `handback.ts`/`watchdog.ts` 单一来源先例与 `finalize.ts`「哈希只能由代码算」先例），导出**冻结签名** `renderInstalledSkillsSection(projectRoot, roleId): string`；同时按 §4.6 候选 1 把 `SU_PREAUTHORIZED_WRITE_DIRS` 由两棵扩为三棵（`docs/su`、`docs/contracts`、`docs/skills`）。**零放行面松动的其余部分**：判定链其余环节（F6/F7/边界/条件）逐字不变；注入节是纯资料指针（不含正文、不含任何授权语义），坏件只跳条不拒会。

## 三、改了什么

### 3.1 新文件 `src/common/编排/installed-skills.ts`（I4 主体）

- **导出面（落盘即契约——三适配器与桌面 handler 按此接线）**：
  - `renderInstalledSkillsSection(projectRoot: string, roleId: string, onDiagnostic?: (d: InstalledSkillsDiagnostic) => void): string`——**同步返回**；**默认两参调用可用**（第三参为可选诊断回调）。
  - `readSkillRegistration(projectRoot: string, name: string): SkillRegistrationView | undefined`（**I3 前置，PM 小扩展派发 2026-10-16 同日落**）——登记读取的**公开视图**：桌面安装 handler 的「登记含/不含角色」校验面；与渲染器**共用 `loadRegistration` 同一判据**（**单一解析来源**，配置侧不得复制解析逻辑）；坏件/缺失（名非法/登记缺失/解析失败/未知状态）⇒ `undefined`（与渲染器坏件集**逐字同口径**，测试双向核）；`uninstalled` 与角色不命中**非坏件**、原样返回视图（角色/状态判读归调用方）；**不检查** `SKILL.md`；入口防御（空/`.`/`..`/含分隔符的名字 ⇒ undefined，工具入参防穿越）。仿射改动**仅增导出**——渲染器行为与文案逐字未变（内部仅把登记读取/解析抽为共用 `loadRegistration`，判据/诊断 path/reason/detail 逐字同前，既有 13 例全绿）。
  - `SkillRegistrationView`（视图型：`purpose` / `roles: string[]`（已分词/trim/去包裹）/ `status`（installed 或 uninstalled）/ `date`（首个 `YYYY-MM-DD`，无则原文））与 `InstalledSkillsDiagnosticReason`（五值）、`InstalledSkillsDiagnostic { path; reason; detail? }`。
- **判据链（每步坏即跳该条）**：扫 `docs/skills/` 子目录（扫描序**确定化**＝name 代码单元序；非目录条目忽略）→ 读 `docs/skills/<name>/install.md` → 解析四字段（用途/适用角色/状态/安装日期）→ 状态 `uninstalled` 静默跳过、状态非 installed/uninstalled 值＝坏件跳过＋诊断 → 适用角色列表精确命中 `roleId`（角色不命中的条目**不读** SKILL.md——登记为别角色坏掉不该扰乱本角色会话）→ 读 `docs/skills/<name>/SKILL.md` 校验存在性并**按当刻字节**算 sha256（`createHash("sha256")`，同 `finalize.ts::sha256File` 算法：原始字节、不经 UTF-8 解码、不剥 BOM）→ 命中的按 **name 排序、编号自 1 递增**渲染。
- **冻结文案（逐字，测试内独立重打对照）**：

  ```markdown
  ## 本角色已安装技能（动手前先读，按序）
  1. docs/skills/<name>/SKILL.md（用途：…；sha256:<hex>；安装于 <date>）
  内容以文件当刻字节为准；读到与派发描述/版本不符 ⇒ 停止并交 blocked 报告（不得猜）。
  ```

- **零技能 ⇒ 返回空串**（`docs/skills` 不存在＝从未装过技能的正常态，静默空串；调用侧零渲染）。多技能 1..N 编号。
- **坏件语义（绝不拒开会话——沿 `resolve-role.ts` 坏件警告跳过的防御先例）**：`install.md` 缺失（ENOENT）/读取失败/解析失败（四字段缺一、状态值未知）/`SKILL.md` 缺失或不可读（含 EISDIR）/目录名含控制字符（防注入文本被破坏）/`docs/skills` 根不可读（ENOTDIR/EACCES）——一律**该条跳过＋诊断**，函数**绝不抛错**；可选回调抛错也被吞（观察面不得影响会话开启）。
- **登记解析（宽容但有界）**：行式；显式四键（用途/适用角色/状态/安装日期）；行首 `-`/`*` 可省、全角/半角冒号均可、BOM 剥离、CRLF 兼容；同键**首现为准**；其余行忽略。适用角色按 `、`/`，`/`,` 分词、trim、去反引号包裹；**安装日期取行内首个 `YYYY-MM-DD`**（如「2026-10-16（按客户指令）」→ 渲染 `2026-10-16`），无则原文照录。
- **诊断面（定形说明）**：① **内部面**——函数内 `createDiagnosticLogger({component:"orchestration.installed-skills", projectRoot, roleId})`，坏件逐条 `record("installed-skills.skip", { path, reasonCode })`（字段在诊断白名单内：`path`/`reasonCode`；未 `configureDiagnostics` 时自然 no-op，与 handback/session 同模式）；② **回调面**——可选第三参 `onDiagnostic`，坏件逐条如实（`path` 指向坏在哪件文件：登记问题指 install.md、内容问题指 SKILL.md），测试与调用方程序化观察用。**默认两参调用不受影响**。

### 3.2 I5：`SU_PREAUTHORIZED_WRITE_DIRS` 扩列 `docs/skills`（`src/pipeline/orchestration/run-role.ts`）

- 常量 `["docs/su", "docs/contracts"]` → **`["docs/su", "docs/contracts", "docs/skills"]`**（与既有两棵并列）；上方裁定注释块同步改写（「两棵」→「三棵」＋第三棵来源：G-4 V1 裁定 1＝§4.6 候选 1，技能文档树；`docs/mcp` 未扩、V2 另议）；文件头预授权摘要行（L19-21）同步列三棵；背景指针补本记录。
- **语义零变化**（除多一棵树）：仍仅内置治理角色（`kind === "built-in-governance"`）、仍是初始 writeSet 的一部分（不经发行器、开会话/重建都生效）、仍只放开 F4 一环（F6 接受门/F7 逃逸复核/边界条目/条件激活逐字不变）、`docs/skills2` 类前缀仍按段比较不覆盖。
- **`govern-session.ts` 两处模型可见文案同步**（与实现一致、可操作——F-5-main 先例）：`runGovernSession` 确认制说明行与 `buildGovernPrompt` 的 confirmRule 预授权清单并列加 `docs/skills/`。**su 卡文本（`BUILT_IN_ROLE_CARD_TEXT`）归门禁引擎 I6 另行实施**——本角色不做（见 §六跨角色）。
- 安装动作与写权的关系不变（§4.6 边界钉子）：扩列只扩这一棵树的**写权面**；安装不改变任何角色边界/写权，预授权不制造边界覆盖（边界未覆盖 `docs/` 的项目照旧「未匹配」拒）。

## 四、测试（`test/编排/installed-skills.test.ts` 新增 18 例；既有两文件扩展断言）

新增 18 例（全部系统临时目录、不触网；冻结文案在测试内独立重打——模块常量漂移必红；前 13 例为渲染器面，14-16 为读取器面，17-18 为能力位接线面）：

1. **金文本**：单技能命中 → 标题/编号/用途/digest/日期/尾句逐字（日期带后缀取 ISO 片段；默认两参调用）。
2. **digest＝当刻字节**：含非 UTF-8 字节的 Buffer 上对原始字节算哈希（先解码再哈希会得不同值）；内容变化 digest 变化。
3. **多技能排序编号**：乱序落盘 → 按 name 代码单元序渲染、编号 1..N、用途/digest 各归各位、无多余行。
4. **零技能零渲染**：无 `docs/skills`/空目录/仅有非目录文件/空 projectRoot——空串且**零诊断**。
5. **角色过滤**：别角色静默跳过（其坏件面不扰本角色——不读其 SKILL.md、无诊断）；多角色列表 `、`/`，`/反引号/空格 宽容分词后精确命中；未列出角色不命中。
6. **状态过滤**：`uninstalled` 静默跳过（已知停用态、无诊断）；未知状态值＝坏件跳过＋诊断（不猜）。
7. **坏件跳过不拒会**：登记缺失/字段缺失/SKILL.md 缺失逐条跳过＋诊断（诊断按目录扫描序、path 指向坏件），同目录好件照常注入；两参调用与三参渲染一致。
8. **四字段缺一即坏件**：用途/适用角色/状态/安装日期各自缺失 → 该条跳过＋解析失败诊断（绝不猜补）。
9. **SKILL.md 是目录（EISDIR）** → 按缺失跳过＋诊断、防御不抛错。
10. **防御**：`docs/skills` 是文件 → 空串＋skills-root-unreadable 诊断；控制字符目录名 → 该条跳过（name-invalid）、注入文本不被破坏（FS 不支持时该段不虚报）。
11. **解析宽容**：BOM/CRLF/半角冒号/无前缀横线均可；重复字段首现为准（状态重复＝按首现停用）；无关行忽略。
12. **内部诊断**：`configureDiagnostics` 后坏件落 jsonl——event `installed-skills.skip`、component/reasonCode/path/roleId 逐项核对。
13. **可选回调**：坏件逐条如实；无坏件不触发；回调抛错被吞（好件注入不受影响）。
14. **读取器正例**（I3 前置）：命中登记 → 公开视图四字段逐字（角色分词去包裹/日期取 ISO）；`uninstalled` 原样返回视图（状态判读归调用方）。
15. **读取器坏件面**：登记缺失/字段缺失/未知状态/登记 EISDIR ⇒ `undefined`；入口防御——空名、空/空白 projectRoot、`a/../b` 与 `..`（防穿越）、名含控制字符 ⇒ `undefined`（同渲染器 name-invalid）。
16. **读取器与渲染器双向核（同夹具）**：坏件 `undefined` ⟺ 渲染器诊断跳过（path/reason 对齐）；`uninstalled`/别角色有视图 ⟺ 渲染器静默过滤不注入、无诊断。
17. **能力位接线（桩捕获）**：`openRoleSession` 的 `installSkill`/`uninstallSkill` **只给 su** 透传（同引用）；项目角色误给不注入；未给不注入（能力缺席 = fail-closed）。
18. **能力位接线（端到端，真实 Service 装配 + 假外部引擎）**：su 会话注册两工具（注入才注册）、handler 直达注入实现（载荷 `{roleId,name}` 逐字；成功回执含 path＋重申「未改变任何角色的写边界」；`registration-unchanged` 如实「未执行」）；不注入与项目角色 ⇒ **零注册**。

**既有预授权用例扩展（I5 测试面同步）**：`test/编排/session-handle.test.ts` 五例各加 `docs/skills` 断言（开局免确认含子路径＋标题更新；`docs/skills2` 前缀负例；非 su 无预授权；静态 scope 同口径；重建后仍可写）＋`test/编排/confirmation-gated.test.ts` ⑥b E2E 加两笔 `docs/skills/t1/{install.md,SKILL.md}` 真落盘断言（客户通道仍零调用；`docs/其他.md`/`角色卡/` 仍 F4 拒、零副作用）。既有断言零改动、未为变绿放松。

**结果**：`node --test "test/编排/"*.test.ts` → **318/318** 全绿（基线 300 + 18）；`npm run typecheck` → **全仓 0 错**；全量 `node --test "test/**/*.test.ts"` **收口终跑 1829 计 / 1828 过 / 0 红 / 1 skipped（全绿，exit 0）**——相对派发基线 1827/1826/0/1 **零新红**（本批早期快照曾见 4 红，均为 `test/测试/` 钉子随并行批次（本裁定/I6/运行时核心在途）待同步所致；至终跑已全部由各属主收口，逐条归因见 §七）。环境：Node v24.14.0、Darwin 25.6.0。

## 五、给三适配器（Claude/Codex/Pi）与假适配器的接口说明（跨边界；接线由其属主实施）

**导入（落盘即契约）**：

```ts
import { renderInstalledSkillsSection } from "../../src/common/编排/installed-skills.ts";
// 桌面窗口（I3 安装 handler）另用登记读取器：
// import { readSkillRegistration } from "../../src/common/编排/installed-skills.ts";
```

**接线要点**（系统提示拼装处，每个新会话/重建各调一次）：

1. 调 `renderInstalledSkillsSection(projectRoot, roleId)`（**两参即可**；同步返回 string，无需 await——会话构造期可直接拼接）。
2. **返回空串 ⇒ 逐字不渲染**（零技能/从未安装/空 projectRoot——对照会话与未装技能角色逐字无变化）；非空 ⇒ 作为一段**拼接**进既有系统提示（建议整段独立成节，前后用换行分隔；函数返回不含尾随换行）。
3. **不得改写/重排返回文本、不得另写一份模板**（本模块是注入节单一来源；三处拼装只做「非空则拼一行/一段」）。
4. 判据与坏件处置全在函数内（坏件跳过不拒会）；调用侧**不需要**也不应预扫 `docs/skills`。
5. 假适配器同步接同一函数（测试面跨运行时逐字一致）。
6. 生效语义：安装激活＝重建目标角色会话（G-2/W4 `rebuildSession`）——重建后新会话自然带上新注入节；在跑会话不自动更新（延迟窗与 O-1 指纹扩展是否做属 §4.3 候选，本批未做、如实登记）。

**另（I3 前置，桌面窗口安装 handler——PM 小扩展派发 2026-10-16）**：登记校验用本模块 `readSkillRegistration(projectRoot, name): SkillRegistrationView | undefined`——**不得复制解析逻辑**；非 `undefined` 即「登记存在」、`registration.roles.includes(roleId)` 判「登记含/不含角色」、`registration.status` 判装/卸态（`uninstalled` 非坏件、原样返回视图；坏件/缺失 ⇒ `undefined`）；回执文案与三态（含 `next-session`）沿提案 §3.3 表，归 I3 实施。

## 六、未做与残余（如实登记）

1. **I1/I2**（`install_skill`/`uninstall_skill` 工具定义与 maker，运行时核心）与 **I3**（桌面 handler：校验/激活/三态回执/系统行）由各自属主**已并行落盘**；本角色**末环接线已同日落**（PM 收口派发）：`AdapterCapabilities` 与 `openRoleSession` 输入型增 `installSkill?: InstallSkillFn` / `uninstallSkill?: UninstallSkillFn`（只读导入 `model/runtime.ts`、字段名逐字），**只给 su**透传（判据复用 `suppressHandback`；项目角色零感知），`createRuntimeAdapterFactory` 逐名并入会话构造（`GovernedToolsOptions` 同名能力位——「注入才注册」）。测试 +2（桩捕获＋端到端真实装配）；直至工具能力注入前，渲染器对任何项目都返回空串（零渲染），无副作用。
2. **I6 su 卡文本**（门禁引擎）：卡内「确认制要点/预置豁免」段原说**两棵**——已核其工作树**在途改三棵**（含 `boundary-core.ts` 注释），随其收口；`test/门禁引擎/su-doc-surface-convention.test.ts` 现要求点名前两棵（加第三棵不会红，改文案时一并复核）。
3. **I7 行样式**（桌面UI）未做（随行样式批次）。
4. **O-1 指纹集扩展**（§4.3 候选，未裁入 V1）：安装/卸载后在跑会话的延迟窗如实存在（重建路径已含新节）。
5. **派发必读块扩面（§4.2-B 候选）**未做：`extractDispatchReadPaths` 未扩 `docs/skills/**`（开场注入已覆盖全触发面；B 若另裁属后续小改）。
6. **测试角色 g1 钉子过时（跨角色，见 §七注）**。
7. 真机 E2E（装-看-用-撤全链、注入节断点观测、对照组零变化）属测试/客户跑；三适配器实际拼接效果未验（接线归其属主）。

## 七、边界声明与全量归因

只写本角色 Section 1 内文件（`src/common/编排/installed-skills.ts` 新增、`src/pipeline/orchestration/run-role.ts`、`govern-session.ts`、`test/编排/**`、本记录与 changelog/memo/feature-map）。**未碰** `app/**`、`src/provider/**`、`src/common/运行时核心/**`、`src/common/门禁引擎/**`、`src/common/{claude,codex,pi}-adapter/**`、其它角色文件与测试证据目录；未 git 提交；未发真实模型请求、未跑真实项目、未碰真机轮目录。

**全量四红归因**（均**非本批文件**、未处理——全在 `test/测试/`，属测试角色的独立钉子，随并行实施批次待其同步）：

1. `test/测试/g1-verify/g1-copy-and-nails.test.ts:26`——「su 预授权写目录恰为两棵（docs/su + docs/contracts）」代码级钉子**随本裁定过时**（实得 `['docs/su','docs/contracts','docs/skills']`）：需**测试角色**把断言与标题更新为三棵（`["docs/su","docs/contracts","docs/skills"]`；`docs/工作流` 负例行照旧）。**本角色不越界改**（`test/测试/` 归测试角色），请 pm 转达。
2. `test/测试/g1-verify/g1-copy-and-nails.test.ts:35`（卡文本反向断言的变异点「不在预置两目录内」替换失败）与 3. `:99`（正向短语清单「不在预置两目录内」缺失）——**门禁引擎 I6 在途**（`src/common/门禁引擎/boundary-core.ts` 的 su 卡文本已在其工作树改为「三棵」「不在预置三目录内」），钉旧措辞的测试随之红，随其收口更新。
4. `test/测试/g3-search-verify/pi-loopback-verify.test.ts:210`——**运行时核心并行在途**（`cleanpatterns-url-greedy`：`src/common/runtime-core/tool-display.ts` 的 URL 排除集扩 CJK 标点块已在其工作树），钉旧「URL 贪吃吞第 2 条标题」行为的备注断言（`:255`）随之翻转。**已复验**：本批改动零交集（该测试不导入本批任何符号）；在 pristine HEAD（`git worktree`，read-only）该文件 **6/6 全绿**⇒ 红由工作树内运行时核心在途改动所致，随其收口自消解。

注：四红的共同形态＝**实施角色落盘新裁定/新行为，测试角色的钉子按「实施后独立更新」流程随后同步**（与 G-1/G-2 批次同型，见 changelog 各条「测试角色…将红/随其更新」先例）；本批只交付编排侧渲染器与常量，钉子更新归测试角色/门禁引擎各自。

## 八、回滚

两个源码改动均为**纯增量**：删除 `installed-skills.ts` 整文件（无导入方时零影响；已接线的适配器需同回）＋常量删第三项、注释回两棵＋govern-session 两处清单回两棵＋测试批删除/回退。无类型迁移、无数据/状态迁移、无判定链触点。相关导航见[编排功能导航](../../feature-map.md)；同族先例见 [su 预授权记录](2026-10-16_fix_su-notes-preauth.md)（本批扩列其第一棵外第三棵）与 [G-1 派发引用块记录](2026-10-16_change_contract-workflow-dispatch-a1.md)（同「指针＋运行期哈希」家族）。
