---
id: g1-independent-verification
type: change
title: 2026-10-16 G-1 批次独立验证报告（契约/工作流落盘 + 派发按地址引用；测试角色）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: verified
related: [contract-workflow-dispatch, kanban-fixes-pm-review, change-contract-workflow-dispatch-a1, fix-g1-dispatch-required-reading, su-planning-workflow-card-fix, core-dispatch-task-address-reference]
events:
  - date: "2026-10-16"
    kind: verified
    summary: G-1 独立复验完成——冻结绑定（HEAD 89c95fe + 37 条目 sha256，结束复算逐字节一致）、全量 1528/1527/0红/1skip + typecheck 0（含我 24 例后 1552/1551/0/1）、范围审计 A1–A4 全落地且未勾选事项（A5/A6/A7、pin 并入）未实施、本地副本全仓不复现；对抗 24/24 全绿（含关键「拒投→补齐→重派同一文本必须受理」去重键陷阱与定格语义）；f2 金文本收口跟进独立复核为非放松（等价且更贴单一来源，台账在案）；发现 0 项不通过、5 项备注/存疑（均不影响判定）
---

# 2026-10-16 G-1 批次独立验证报告（测试角色）

**验证对象**：客户 2026-10-16 批准「G-1 按提案实施」后、四个实施上下文（编排 A1 / 桌面窗口 A2 / 门禁引擎 A3 / 运行时核心 A4）交回的「契约与工作流落盘 + 派发按地址引用」V1 最小闭环（批准范围＝实施基线见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-1 客户批准与 PM 裁定」；设计规格 `角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md`）。

**整体结论：通过（0 项不通过；5 项备注/存疑，均如实列明、不影响批准范围的落地判定）。**

本报告全部原始证据落在本角色证据目录 `角色卡/测试/docs/change/2026-10-16-g1-verification-evidence/`（下称「证据目录」；`raw/` 下为原始输出）；独立用例在本角色边界内 `test/测试/g1-verify/`（3 文件 24 例）。全程只写 `test/测试/` 与 `角色卡/测试/`；未改任何 `src/`、`app/`、他角色文件与测试；未 git 提交；`ans-testbed/kanban-live-3`、`/private/tmp` 轮次目录与 2026-10-15 证据目录只读未碰。

---

## ① 冻结绑定（本结论对应哪一版代码）

- HEAD＝`89c95fed60ff99c2c6daf33f1516c929fcb252a6`（branch `main`；批次全部改动**未 commit**、停在**工作树**——本就如此交付；`raw/environment.txt`）。
- 冻结时工作树：`git status` **26 个已跟踪文件修改 + 11 个新增条目 = 37 条目**（`raw/git-status-frozen.txt`）——G-1 批次本体（A1–A4 源码/测试/记录 + f2 收口跟进 + 桌面UI 注释跟进）＋同窗相邻条目（G-2 设计文档、PM 评审记录更新、产品导航）。结论绑定**该 37 条目整体**。
- **全部 37 个条目的 sha256 已冻结**：`raw/freeze-sha256-before.txt`；复验结束（全部用例跑完后）逐文件重算并 diff → **逐字节一致（37/37）**（`raw/freeze-sha256-after.txt`；命令输出 `IDENTICAL`）——本报告全部结论绑定且仅绑定该版本。验证者自身的产出（`test/测试/g1-verify/`、证据目录、本报告、memo）不在冻结集内（不构成对批次的改动）。

关键实现与测试文件指纹（摘自冻结清单，完整 37 条见该文件）：

| 文件 | sha256（前 16）|
|---|---|
| `app/desktop/session.ts`（A2 接线） | `c21edf79ed3afb6f` |
| `src/common/编排/handback.ts`（A1 三件套） | `e6503b8cf6561f49` |
| `src/common/门禁引擎/boundary-core.ts`（A3 卡文本） | `6fe59c3e51bfc9ba` |
| `src/provider/runtime/schema.ts`（A4 工具描述） | `47c08a47544f9b69` |
| `app/renderer/tool-rows.js`（桌面UI 注释跟进） | `f4e19c45c37cc4c3`（与其 changelog 自报 `f4e19c45` 一致） |
| `test/编排/dispatch-reads.test.ts`（A1 新增 14 例） | `74c1b3b118f888ba` |
| `test/桌面应用/dispatch-delivery.test.ts`（A2 金文本重写 + 6 例） | `f9365f14268f6a3d` |
| `test/门禁引擎/su-doc-surface-convention.test.ts`（A3 +3 例） | `6fe6c93b1e58b15d` |
| `test/runtime-core/tools.test.ts`（A4 +1 例） | `81fffb74dafcf872` |
| `test/测试/kanban-fixes-verify/f2-claim-release.test.ts`（收口跟进） | `2d5acc908248542b` |

## ② 全量复跑

| 命令 | 原始计数 | 证据 |
|---|---|---|
| `node --test "test/**/*.test.ts"`（冻结版本、**不含**我的用例） | **tests 1528 / pass 1527 / fail 0 / skipped 1 / exit 0**（18s） | `raw/full-run.txt` |
| `npm run typecheck` | **0 错误**（exit 0） | `raw/typecheck.txt` |
| `node --test "test/**/*.test.ts"`（**含**我 24 例后） | **1552 / 1551 过 / 0 红 / 1 skip**（= 1528 + 24，零相互干扰） | `raw/full-run-with-g1-verify.txt` |
| `npm run typecheck`（**含**我 3 个新用例文件后重跑） | **0 错误**（exit 0） | `raw/typecheck-with-g1-verify.txt` |
| `node --test "test/测试/**/*.test.ts"`（本角色全区域） | **206 / 206**（此前 182 + 我 24） | `raw/test-area-run.txt` |

- **1 skip 归属**＝`规范化：Windows 大小写不敏感（仅 win32）`（`raw/full-run.txt:2183`）——与既往一致（darwin 本机）。
- **与实施记录的计数对账（零差异）**：实施轮各记录报 `1528 计 / 1525 过 / 2 红 / 1 skip`——2 红为 f2 套件锁定**已按批准删除**的桌面旧单行模板（A2 记录 §六.1、A3 记录 §六.5 交叉登记）；该 2 红经前一测试上下文的**批准范围内格式收口跟进**（§④.5 独立复核）转绿 ⇒ 1527 过。与我复跑的 1527/0/1 精确一致。
- 记忆中「2 条基线红」（检出目录名 `ans-cli` 断言 / macOS `/var` 符号链接）在当前 HEAD **不复现**——与 PM 收口记录及多个上下文独立报告一致。

## ③ 范围审计（对照批准表逐项）

### 3.1 批准实施项是否真实落地——逐项核对（读码 + 行为证据）

| 批准项（PM 派发四上下文） | 落点核对（冻结版本） | 判定 |
|---|---|---|
| A1 编排：`renderDispatchPrompt` 必读块**单一来源**渲染 | `handback.ts` 新增 `extractDispatchReadPaths`（固定提取：只认 `docs/workflow.md` + `docs/contracts/**.md`；复用同角色 `confirmed-writes.ts::extractPathCandidates` 剥离、不另写正则）、`planDispatchDelivery`（fail-closed 判据单一来源；拒投结论**结构上无 `text` 字段**）、`renderDispatchPrompt(req, opts?)` 扩展（无引用逐字旧格式；有引用按设计 §四.1 渲染）；`test/编排/dispatch-reads.test.ts` 14 例 | 通过 |
| A2 桌面窗口：投递时算 sha256、契约缺失拒投、渲染切单一来源并收口本地副本 | `session.ts::routeDispatch`——`extractDispatchReadPaths(task)` → 逐路径 `filePrint`（`<missing>` 原样传入）→ `planDispatchDelivery`；**判据紧挨去重登记之前**（`reject` 分支 `return fail(plan.message, plan.systemRow)`，不入队/不登记/不开会话）；`text: plan.text` 入队即定格；`renderDispatchPromptLocal` 删除（`filePrint` 哨兵协议注释）；`test/桌面应用/dispatch-delivery.test.ts` 金文本重写 + 6 例、`dispatch-fresh-enum.test.ts` 断言跟进 | 通过 |
| A3 门禁引擎：su 卡文本（规划落盘契约/工作流、派发引用地址） | `boundary-core.ts::BUILT_IN_ROLE_CARD_TEXT` 新增「规划纪律」段（先落盘再派发/冻结契约不可变/工作流步骤表·完成口令·变更与重验/两分写盘口径/必读与 blocked 纪律/契约变更流程）＋ J-1 段加「按地址引用」扩展（不嵌全文/不手算哈希/拒投）；**判定逻辑零改动**（同文件仅文本+头注）；`su-doc-surface-convention.test.ts` +3 例（关键词/位置 + 反向断言 + 5 组违规变体非空洞验证）；J-1 守卫（`dispatch-after-landing-convention.test.ts`）随套件全绿未动 | 通过 |
| A4 运行时核心：`dispatch_task` 描述同步 | `schema.ts` 仅文案（注释/英文 task 描述/中文描述/promptGuidelines 第三条）：先落盘再派发（契约预置直写／工作流走 preview 两分口径）、按地址引用、必读块由投递系统附上并算哈希、契约缺失拒绝（回执如实）、workflow 缺失不拒投；既有 H-1 三条 +「不改变任何角色的写权」原句逐字保留；参数形状 `required=["roleId","task"]`、`executionMode` undefined 未动；`tools.test.ts` +1 例（正向 + 反向断言 + 参数形状钉子） | 通过 |

### 3.2 未勾选项**必须未实施**——逐项核查（全部「未实施」成立）

| 未勾选项（PM 裁定 4/2） | 核查 | 判定 |
|---|---|---|
| A5 manifest 留痕 | `src/common/编排/finalize.ts` **不在本批改动列表**（`git diff HEAD` 零命中）；pin 集合组装（`:195-199`）仍＝治理边界文档 + 各角色 `boundary.yaml`，全文无 contracts 指称 | 未实施 ✓ |
| A6 O-1 指纹集扩展 | `session.ts` 指纹定格（`:1023-1040`）仍＝角色边界 + 项目治理边界（若有）+ `.ans/project.json`——未纳入契约/workflow | 未实施 ✓ |
| A7 `write_file` 回执附 sha256 | `src/provider/runtime/tools.ts` **不在本批改动列表** | 未实施 ✓ |
| 契约并入 `.ans/project.json` pin 集合（裁定 2：不并入） | 同上：pin 组成未动 | 未实施 ✓ |

### 3.3 桌面本地副本全仓不复现（实现与调用）

- `grep -rn -E "renderDispatchPromptLocal\s*\(" app src` → **零命中**；全词 grep 仅剩 `session.ts:74/1656` 两处**注释性指称**（收口登记的如实记录）。`raw/code-nails-grep.txt`。
- `[派发] 来自` 在 `session.ts` **零出现**（无内嵌模板）；旧桌面单行模板特征（`——完成后请交回报告` / `的任务：`）在 `app/` `src/` **全仓零命中**。
- 代码级钉子在独立用例中也各自成立（`test/测试/g1-verify/g1-copy-and-nails.test.ts`）。

### 3.4 两分写盘口径与机制实况一致

- 机制实况：`SU_PREAUTHORIZED_WRITE_DIRS: readonly string[] = ["docs/su", "docs/contracts"]`（`run-role.ts:871`）——**恰为两棵目录树**；`run-role.ts` 非本批改动（HEAD 既有，客户 2026-10-16 预授权裁定的落地）。
- 四处文案一致（§4.4 用例逐短语验证）：契约＝已预置直接写；`docs/workflow.md`＝**不在预置两目录内**、列入同一次规划确认 preview + `confirmed:true`；治理会话文案两处「预授权」句点名**恰两棵**、无 workflow.md 混入。

### 3.5 测试改动性质审查（无放水）

| 测试改动 | 性质 | 判定 |
|---|---|---|
| `dispatch-reads.test.ts`（A1 新增 14 例） | 纯新增；含单一来源复用断言（plan 放行文本 ≡ render 输出逐字）与授权语义反向断言 | 无放水 |
| `dispatch-delivery.test.ts`（A2） | 旧单行模板金文本 → 单一来源三行**金文本整体重写**（A2 记录 §五.1 已声明「非标点级 diff」）；新增 6 例（含 A2-2 去重键陷阱钉子、A2-5 定格、A2-6 代码级判据） | 格式收口（批准范围），断言面净增 |
| `dispatch-fresh-enum.test.ts` | 断言由**子串包含** `[派发] 来自 su 的任务：开工` 改为**逐字相等** `t === renderDispatchPrompt({roleId:"开发",task:"开工"})`——**加强**（includes → ===） | 无放水 |
| `su-doc-surface-convention.test.ts`（A3 +3） | 关键词/位置断言 + 反向断言 + 变体非空洞验证（5 组违规变体全捕获；实施中曾发现初版漏捕并扩模式，如实记录） | 无放水 |
| `tools.test.ts`（A4 +1） | 纯新增（正向 11 短语 + 保留面 + 反向 + 参数形状） | 无放水 |
| `f2-claim-release.test.ts`（前一测试上下文本批跟进） | 见 §④.5 独立复核 | 非放松 |

## ④ 对抗性行为核对（独立构造，不复用实施方断言）

独立用例 `test/测试/g1-verify/`（3 文件 **24 例**；金文本逐字手写、哈希用 `node:crypto` 独立计算、夹具自建）——**24/24 全绿**（`raw/adversarial-g1-verify.txt`）。

### 4.1 提取/渲染域（9 例：提取 3 + 渲染 6）

- **嵌套契约路径捕捉**：`docs/contracts/api/nested/deep-v2.md` ✓ 捕捉；**`docs/contracts/.md` 空名防串** ✓ 不捕（长度守卫）。
- **不误捕**：产物路径（`temp/…`、`src/…`）、目录式（尾 `/` 与无斜杠 `docs/contracts`）、URL、绝对路径、`docs/contracts2/` 前缀、CJK 紧贴（`…x.md的` 保守跳过）——全部不注入、不校验。
- **无引用派发逐字旧格式不变（零回归）**：`renderDispatchPrompt` 无引用（含原因段/多行任务）输出逐字＝独立手写三行金文本；且**渲染纯函数性**成立（任务文本提到契约而 opts 缺省 ⇒ 不注入块——提取/判据归 plan 阶段）。
- **引用块格式**：workflow 恒置首/契约首现序/重复去重；块头、`  1. <path>（sha256:<hex>）` 缩进、哈希逐字、`任务：` 前缀逐行金文本比对；授权语义反向断言（`授权|获准|放行|写权` 零命中）。
- **完成句变体仅在 workflow 引用在场**：仅契约 ⇒ 全文不出现 workflow.md / 「第 2 节」；workflow 在场 ⇒ 变体指向第 2 节；workflow 缺失 ⇒ 旧句。
- **降级两形态**：workflow 缺失（含仅 workflow 引用的极端形态）⇒ 逐字标注 `（本项目未提供 workflow.md）`、该行缺席、编号重排、不指向不在场文件。
- **矛盾输入**：references 含 workflow + `workflowMissing: true` ⇒ 引用为准（抑制标注、完成句指回第 2 节）。

### 4.2 判据域（4 例）

- **契约缺失 ⇒ 拒投**：探测值 `undefined`/空串/`<missing>`/非 hex/63 位/**大写 hex**/含 `g` 的 64 位——一律按缺失（fail-closed 保守侧）；回执**逐字**＝`派发未受理：引用的契约 docs/contracts/miss-v1.md 不存在——未投递。`；系统行含 `**未投递**`；**结构上无 `text` 字段**。
- **多缺报首现序第一个**（后现的缺失不报）；**契约缺失优先于 workflow**（即便 workflow 在场仍拒）。
- **workflow 缺失 ⇒ 降级照投**（编号重排、标注在场）；**多余探测项被忽略**（未被引用的契约即使缺失也不触发拒投）。
- **全齐放行文本逐字＝独立手写完整金文本**（plan 与 render 无第二份渲染）。

### 4.3 接线域（5 例，端到端经真实 `SessionManager`）

- **无引用零回归（wire 级）**：投递文本（含原因段）逐字＝独立金文本；并证明 **f2 收口处使用的单来源调用输出 ≡ 同一旧三行**（见 4.5）。
- **★去重键陷阱回归（关键）**：拒投（`ok:false` + 回执逐字 + su 系统行含 `**未投递**`）→ 断言目标**零投递/零 send/零开会话/A 队列零条目** → 补齐契约 → **重派同一任务文本** ⇒ `ok:true` 且**非**去重回执，恰投一次、文本含当刻契约字节 sha256（独立计算）——「拒投不污染去重键」成立（判据先于登记）。
- **常规队列期去重未受波及**：目标忙 ⇒ 入队；同文重派 ⇒ 去重回执；settled 后按到达序放行、派发恰投一次。
- **定格语义**：排队期间契约文件 C1→C2 变更 ⇒ 已入队条目按**派发那一刻**的 C1 哈希投递（逐字金文本）；送达后同文再派才用 C2 哈希（新版本地址）。
- **workflow 缺失降级（wire 级）**：照投且逐字含标注与契约当刻哈希。

### 4.4 文案/代码钉子域（6 例）

- 代码级钉子：`session.ts` 无本地副本实现/调用、无内嵌模板、接线走三件套；`SU_PREAUTHORIZED_WRITE_DIRS` 恰两棵。
- 卡文本独立反向断言（**非空洞验证**：内存变异 3 组「workflow.md 已预置/免确认/预授权」违规变体全被捕获）；J-1 守卫语义独立复核（含 授权/获准/放行 的小句全部否定式；「原地改」「自己算/转抄」小句紧贴否定——**验证中实发现我初版谓词被同句他处「不」误放行（「不可变…可原地改」变体漏捕），已收紧为紧贴否定后捕获**，此即非空洞验证之效）+ 授权面变异非空洞；卡文本正向短语清单 25 条逐字在场。
- **四处文案口径一致性抽查**（渲染块/卡文本/工具描述/治理会话文案）：块名「必读（按序」×3、「先读完再动手」×3、哈希归属（系统投递时算 + 「不要自己算或转抄哈希」）×卡/工具、「按地址引用/不内嵌契约全文/先落盘再派发」×卡/工具、两分写盘口径 ×4、拒投语义 ×3——互对一致。

### 4.5 f2 收口跟进独立复核（专项）

- **diff**（`raw/g1-followup-diff.txt`，前一上下文台账；我已独立复核）：仅 3 处——① 新增值导入 `renderDispatchPrompt`；② `dispatchTemplate` 由本地单行内联字面量改为 `renderDispatchPrompt({roleId:"A",task})`；③ 4 个调用点签名跟进。**时序断言（跨目标不阻塞 / 同目标排队 / 并发峰值 ≤1）、夹具与用例结构零改动**。
- **断言强度**：仍为逐字 `deepEqual`（非宽松包含）；期望值从「已删除的桌面旧模板」改为「现行单一来源输出」——**f2 断言不再独立钉版面**是唯一强度取舍，其承接件＝编排 14 例 + 桌面 6 例 + 我的 24 例（其中 W1 用例证明：`renderDispatchPrompt({roleId:"A",task})` 输出与我独立手写的旧三行金文本**逐字等价**，f2 的期望值未弱于文档化格式）。
- **改前红态与复跑**：前一上下文实跑记录（2 红仅末段金文本比对、时序全过）经其证据文件抽验（`g1-followup-f2-file.txt` 2/2、`g1-followup-full-run.txt` 1528/1527/0/1）与**我的独立复跑精确一致**。判定：**格式收口跟进，非放松、非为变绿改测试**。

### 4.6 说明

上述每例均在本报告或证据文件中有原始输出；命令＝`node --test "test/测试/g1-verify/"*.test.ts`（`raw/adversarial-g1-verify.txt`，24 例 0 红）。

## ⑤ 判定汇总、备注/存疑

### 汇总

| 域 | 通过 | 不通过 |
|---|---|---|
| ① 冻结绑定（37 条目 + 复算一致） | 1/1 | 0 |
| ② 全量复跑 + typecheck | 2/2 | 0 |
| ③ 范围审计（A1–A4 落地；未勾选项未实施；本地副本不复现；两分口径一致） | 4/4 | 0 |
| ④ 对抗性核对（独立 24 例） | 24/24 | 0 |
| ④.5 f2 收口跟进独立复核 | 1/1 | 0 |
| **合计** | **32/32** | **0** |

### 备注/存疑项（均不影响「通过」判定；如实登记）

1. **拒投措辞字面差**：实现回执用「拒投」（`派发未受理：引用的契约 <path> 不存在——未投递。`），工具描述（A4）与卡文本（A3）分别用「拒绝」「拒投」概述——语义一致（fail-closed + 补落盘后重派），字面不统一属载体语气差异，非缺陷；系统行与回执的权威措辞以 `handback.ts` 单一来源为准（已逐字钉住）。
2. **提取保守正则的漏检面**（CJK 紧贴、URL 形态等不捕）：与设计 §八及 A2 记录 §七「漏检即不校验也不拒投」口径一致，属 V1 已知残余，非本批缺陷。
3. **f2 金文本改接单一来源后不再独立钉版面**（取舍见 §4.5）：版面金文本由编排 14 例、桌面 6 例、我的 24 例承接；如后续要求 f2 恢复独立字面量，属可做项而非必须项。
4. **su 仍可把契约全文内嵌派发文本无机械拦截**（V1 已知残余，设计 §八末行/实施记录已登记）：本批为文案引导，真机观测属 E2E 轮。
5. **大写 hex 探测值按「不存在」处理**：fail-closed 保守侧（合法 sha256 恒小写 hex）；已由独立用例钉住，如实登记。

## 证据索引（均在本报告同目录 `2026-10-16-g1-verification-evidence/raw/`）

环境：`environment.txt`（HEAD/branch/node v24.14.0/npm 11.9.0/Darwin 25.6.0）｜冻结：`git-status-frozen.txt`、`freeze-sha256-before.txt`、`freeze-sha256-after.txt`（终局复算 IDENTICAL 37/37）｜复跑：`full-run.txt`、`typecheck.txt`、`full-run-with-g1-verify.txt`、`typecheck-with-g1-verify.txt`、`test-area-run.txt`｜对抗：`adversarial-g1-verify.txt`（终版重捕）｜代码钉子：`code-nails-grep.txt`。

## 只读引用（未改动）

- 批准与裁定：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-1 客户批准与 PM 裁定」
- 设计规格：`角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md`
- 四份实施记录：`角色卡/编排/docs/change/2026-10-16_change_contract-workflow-dispatch-a1.md`、`角色卡/桌面窗口/docs/fix/2026-10-16_fix_g1-dispatch-required-reading.md`、`角色卡/门禁引擎/docs/fix/2026-10-16_fix_su-planning-workflow-card.md`、`角色卡/运行时核心/docs/fix/2026-10-16_fix_dispatch-task-address-reference.md`
- f2 收口跟进台账：`角色卡/测试/docs/change/2026-10-16-kanban-fixes-verification-evidence/raw/g1-followup-*`（抽验一致）

---

本报告为**独立复验**：未改任何 `src/`、`app/`、他角色文件与测试；未 git 提交；未碰 `ans-testbed/kanban-live-3`、`/private/tmp` 轮次目录与 2026-10-15 证据目录。相关导航见[测试功能导航](../../feature-map.md)。
