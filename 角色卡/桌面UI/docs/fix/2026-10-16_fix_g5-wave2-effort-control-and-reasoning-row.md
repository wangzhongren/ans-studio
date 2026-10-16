---
id: desktop-ui-g5-wave2-effort-control-reasoning-row
type: fix
title: G-5 wave 2（桌面UI）：推理强度档位控件＋推理折叠行——实现（行文案终形/开合状态机复用/回放同解接线）
created: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [reasoning-and-effort, g4v2-mcp-row-annotation, toolrow-turn-collapse]
events:
  - date: "2026-10-16"
    kind: created
    summary: 客户 2026-10-16 批准 G-5 后按派发做 wave 2 呈现面（属主桌面UI）：①档位控件（设置元数据 choices 非空字段⇒选择控件）；②推理折叠行（「已思考 N 秒 ▸」默认折叠含运行中、回放同解、复用工具行折叠状态机）
  - date: "2026-10-16"
    kind: implemented
    summary: 改动行级 5 文件 +243/−3（renderer.js +102/−2、tool-rows.js +28/−1、styles.css +11、测试 +102）；纯函数 26/26、renderer 57/57、桌面目录 388/388；typecheck 本域 0 错；全量 2036 计/2033 过/2 红（他域在飞，与本批零交集）；回放行载体 `row.reasoning` 为跨边界对齐点（主进程行映射未落树，已冻结契约）
---

# G-5 wave 2（桌面UI）：档位控件＋推理折叠行——实现记录

## 0. 依据与冻结口径

- 客户 2026-10-16「按推荐批准，开始实施」＝G-5（推理与推理强度）；呈批依据＝设计 `角色卡/产品/docs/design/2026-10-16_design_reasoning-and-effort.md`（§3.4 字段元数据与控件、§5.2 折叠行形态定格、§5.3 三处接口）＋评估 `角色卡/运行时核心/docs/fix/2026-10-16_assess_reasoning-and-effort.md`（§六 呈现面事实）。wave 2 派发口径（协调方）：
  - **档位控件**：设置面板对 `choices` 非空字段以**选择控件**呈现（值域即选项；缺省/自由文本字段保持现状）——沿既有设置面板渲染体格，最小面；
  - **推理折叠行**：新行形态「已思考 N 秒 ▸」——**默认折叠（含运行中）**、点击展开 `text` 纯文本（信息零丢失）；`status:"omitted"` ⇒ 如实文案；`durationMs` 仅存在时显示时长（不许发明）；复用**工具行折叠状态机**（手动开合优先/焦点保护/轮结束定型/批尾落地/锚点零位移）；不进工具组、不加 `[系统·]` 前缀、不新造样式体系；回放/历史行同解（投影形已幂等）。
- **投影冻结点**（消费输入，`src/model/runtime.ts` L537–545）：`RuntimeReasoningDisplayDetailV1 {version:1, source:"reasoning", reasoning:{text: DisplayTextV1, status:"complete"|"omitted", durationMs?}}`；诊断形 `{source:"reasoning-diagnostic", code:"PROJECTION_FAILED"}`（summary 由 Service 定格「推理内容无法安全显示」）。Service 在 emit/历史读取对 `detail.source==="reasoning"` **恰一次**过核心投影单点（脱敏＋预算）后经既有事件面到账（`src/service/runtime/session.ts` L66–71/190–199）——渲染侧只渲染投影形。
- **元数据**（`src/common/shared/runtime-settings.ts`，项目管理落树）：`RuntimeSettingField.choices?: readonly string[]`——三平台推理强度字段（pi/claude 五档 `off/low/medium/high/xhigh`、codex 无 off ⇒ 四档；**选项逐字＝规范值**）；保存侧（`app/desktop/runtime-config.ts`）按 choices 校验、空串＝清除该键（留空＝平台默认）。
- 文案终形（本批裁定；设计 §5.2 授权「文案终形归桌面UI」）与行为注记见 §3。

## 1. 实现（改动行级）

### 1.1 档位控件（`app/renderer/renderer.js::applyPiView::fieldHtml`，+24/−2 行；`styles.css` +2 行）

- **判据**＝`Array.isArray(f.choices) && f.choices.length > 0`（元数据单一来源；值域按运行时——codex 无 off 档自动成立）。非空 ⇒ 渲染 `<select id="pi-inp-<key>" class="pi-input pi-select">`：
  - 首项 `<option value="">留空（平台默认）</option>`＝**未设态**（保存侧空串＝清除该键＝维持平台默认——与 help/保存错误文案同口径）；
  - 选项＝`choices.map(c => <option value=c>c</option>)` **逐字**（面板显示值＝保存接受值＝适配器认识值；不加别名映射、不美化）；
  - **现存值不在选项内**（手编 .env 坏值）⇒ 附一条**原值选项**如实显示（不静默改写、不假装未设；保存时由主进程按 choices 校验如实拒绝「取值无效」——前端不复制值域判定）；
  - choices 字段均非机密；机密字段/自由文本字段（choices 缺席/空）**逐字现状**（`<input>` 路径原样保留）。
- **预填与保存读取沿 `.value` 单点**（`inp.value = …` / `var v = inp.value`——input/select 同解，无按控件类型分叉）；`renderPiConfigWarning`/`missingKeys` 判据不受影响（`required:false` 不报警、不算缺）。
- CSS：`select.pi-input { cursor: pointer; }`（盒形复用 `.pi-input`，不新造控件样式体系）。
- 旧注入替身路径（`app/desktop/pi-config.ts` 自建 fields 无 `choices`）⇒ 该路径回落文本输入（桌面窗口批注已声明「值域校验单一来源在注册表保存链，此处不复制」）；生产面（`getRuntimeConfig` 视图含 choices）⇒ 选择控件。

### 1.2 推理折叠行

**文案/可展开性＝纯函数单点**（`app/renderer/tool-rows.js`，+29 行——renderer 只取用 `Tr.reasoningLabel`/`Tr.reasoningFoldable`，不另写文案）：

| 输入（`detail.reasoning`） | 折叠行文案 | 可展开 |
| --- | --- | --- |
| complete ＋ durationMs | **「已思考 N 秒」**（N＝四舍五入到整秒、下限 1） | ✓（正文非空时） |
| complete 无（或非法）durationMs | **「推理内容」**（不发明时间） | ✓（正文非空时） |
| omitted（± durationMs） | **「已思考（内容由平台省略）」/「已思考 N 秒（内容由平台省略）」** | ✗ |
| complete 但正文空串（仅签名） | 同上完整档文案 | ✗（无内容可展——不摆空展开器） |
| 诊断形（投影失败） | Service 定格 summary「推理内容无法安全显示」 | ✗ |

**行构造**（`renderer.js::appendReasoningRow`/`appendReasoningFromDetail`，+~80 行；`styles.css` +9 行）：
- `registerRow(pane, …, 34, { kind: "reasoning", … })`——行经既有行表/虚拟窗口/批量收尾机制进场（**批尾落地**：布局由 `flushBatchSideEffects`/`updateVirtualWindow` 统一落定，**无计时器**）。
- 可展开 ⇒ `<details class="reasoning-record" open?>`＋`<summary>「已思考 N 秒」＋ ICONS.chev</summary>`＋`<div class="reasoning-body">`（**esc 纯文本**、`white-space: pre-wrap`、`font: 11px/1.65 var(--mono)`——**不做 Markdown**，视觉层级低于助手正文）；正文前带投影如实标记（`Rt.textFlags` →「已净化/已截断」，既有单点）。
- 不可展开 ⇒ `<div class="reasoning-record is-plain"><div class="reasoning-line">文案</div></div>`（omitted/仅签名/诊断——无内容可展，**不摆空展开器**）。
- **默认折叠（含运行中）**：`open` 初始＝仅「手动开合」恢复值（`manual === true`）；行构造**零 roleBusy 依赖**（与工具行「运行中默认展开」的刻意差异，设计 §5.2）。
- **状态机复用（逐条对位）**：
  - **手动开合优先并在会话内保持**：手动开合记 `activityOpen[roleId]["reasoning:<turnId>:<N 段序位>"]`（同轮第 N 段＝稳定序位；回放重建同序 ⇒ 同 id ⇒ 重开后恢复手动态）；程序化改动以 `data.open` 为守卫（**不记成手动**——与工具组同款「先 data 后 el」）。
  - **焦点保护**：本行到达即终形、无自动开合动作（无 settle 折叠/无默认态翻转）——键盘焦点天然不被自动动作吞；toggle 不重建元素。
  - **轮结束定型**：wave 2 事件契约＝单段**完成**事实（无「思考中」进行中相位）——行到达即终形，settle 无动作（若后续事件面加增量相位，定型/更新点即本函数）。
  - **批尾落地**：见上（registerRow 进场；`appendReasoningRow` 不自行 `updateVirtualWindow`）。
  - **锚点零位移**：开合＝`captureChatReading(pane)` → 改 `data.open`/`el.open` → `refreshActivityHeight(pane, rec, reading)`（与工具组 toggle 逐字同款）。
- **不进工具组 / 不加 `[系统·]` 前缀**：行独立成行；组切断由 `registerRow` 既有「非 activities 行 ⇒ `rl.activityGroup = null`」语义承担（＝「组=同轮**连续**工具行」的真实序位）；文案纯函数切片零 `[系统·`（守卫钉）。
- **live 接线**（`renderOneEvent` message 分支，+7 行）：`detail.source==="reasoning"` ⇒ `appendReasoningFromDetail`；`detail.source==="reasoning-diagnostic"` ⇒ 如实单行（文案取 Service 定格 summary，缺省兜底）。
- **回放接线**（`appendReplayRow`，+2 行）：行数据通道结构化字段 **`row.reasoning`**（＝投影形 `reasoning` 子对象逐字；同「投递历史状态」族的结构化行字段）⇒ **与 live 同一入口**（`appendReasoningFromDetail`——实时/回放渲染同一行形）。**不靠摘要文本猜**（无该字段＝不是推理行，普通行路径逐字不变）。去重沿既有键（`[turnId, "message", 摘要]`）与 live 计数机制——live/回放不重影。

### 1.3 样式（`styles.css` +9 行，不新造样式体系）

`.reasoning-record` 块镜像 `.tool-records` 同族数值（`max-width: min(760px, 100%)`、色 `#767D73`、12px、左缘 2px 边、`padding: 4px 0 6px 13px`）＋ details/summary 折叠语法（chev 旋转 = 既有 `transition: transform 0.12s ease` 同款，**非新动效**——v3spin 仍恰两条规则）。

## 2. 测试与断言（本机实测，2026-10-16）

新增 **4 例**（全部新增、零修改既有断言）：

- `test/桌面应用/tool-rows.test.ts`（+2，纯函数）：
  1. `reasoningLabel` 文案边界——complete±时长（5200→「已思考 5 秒」；1500→2 秒）／无时长→「推理内容」／omitted±时长→「（内容由平台省略）」／亚秒下限 1 秒（999/200ms）／非法时长（负/NaN/Infinity/字符串）按无信号／缺对象防御；
  2. `reasoningFoldable`——仅 complete 且正文非空可展开；omitted/空正文/缺 text 坏件＝单行。
- `test/桌面应用/renderer.test.ts`（+2，源码守卫）：
  1. **档位控件**——判据 choices 非空、选项逐字、留空项、非选项原值项、`<select>` 走 `.pi-input`、自由文本/机密字段路径逐字未动、预填与保存两路径 `.value` 单点、`select.pi-input` 样式；
  2. **推理折叠行接线**——live 两 source 分支、回放 `row.reasoning` 与 live **同一入口**（恰两处入口计数）、`open` 仅手动态＋行构造零 roleBusy、不进组/不经 appendActivity/不自行落定窗口、状态机四点（手动态读取/程序化守卫/锚点先读后改/记档）、可展开性分支（is-plain）、esc 纯文本不做 Markdown、投影标记、文案单点在 tool-rows 且零 `[系统·`、样式钩子与无新动效。

**结果**：`tool-rows.test.ts` **26/26**（原 24＋2）；`renderer.test.ts` **57/57**（原 55＋2）；桌面目录 **388/388 全过**；`npm run typecheck` **本域 0 错**（全仓 6 错全部在并行在飞的 `test/codex-adapter/reasoning.test.ts`——Codex适配器域，未触碰）。

**全量**（`node --test "test/**/*.test.ts"`）：**2044 计 / 2041 过 / 2 红 / 1 skip**（批内首快照 2036/2033，计数随并行落地增长、红集不变）。两红均属他域在飞（与本批零交集；派发时基线 0 红，随并行落地出现）：
1. `test/测试/t29-pi-config-roundtrip.test.ts`——`PI_PANEL_KEYS` 新增 `ANS_PI_REASONING_EFFORT` 后旧「3 必填+1 可选」面板钉待翻转（触发面＝桌面窗口/项目管理在飞的 `app/desktop/pi-config.ts`＋`src/common/shared/runtime-settings.ts`；属测试/项目管理轮）；
2. `test/测试/g3-search-verify/scope-audit-and-fold.test.ts`「审计④」——Pi 服务端工具扩展「恰三 handler 须在启用判据内部」钉（`src/common/pi-adapter/real-adapter.ts` 在飞重构；属 Pi适配器轮）。

## 3. 文案终形与裁定注记（本批，沿「文案终形归桌面UI」授权）

1. **「已思考 N 秒」的 N**＝四舍五入到整秒、**下限 1 秒**——防「已思考 0 秒」措辞坏件；亚秒真实信号仍如实呈现为「已思考过」。
2. **无时长**（real 信号缺席或非法）⇒「**推理内容**」（设计 §5.2 定格措辞；不发明时间）。
3. **omitted** ⇒「已思考（内容由平台省略）」（设计 §5.2 示例措辞落为终形；有真实时长时一并如实「已思考 N 秒（内容由平台省略）」）——绝不拿「发生」冒充「内容」。
4. **诊断形**（投影失败）＝不可展开单行「推理内容无法安全显示」（取 Service 定格 summary——单一来源，渲染侧不复制文案）。
5. **「思考中… N 秒」运行中相位不在实现内**：wave 2 事件契约＝单段**完成**事实（`RuntimeReasoningFactsV1` 无进行中相位；设计 §5.2 的该行依赖增量事件面，属未落树机制）——派发口径「默认折叠（含运行中）」按「行到达即折叠、含轮仍在跑时」落实。
6. **非选项原值项**：手编坏值如实显示、保存由主进程拒绝——**值域判定单一来源不复制**（纪律）。
7. **多段推理**：V1 逐段各一行（设计 §5.2 定格；不合并；组外真实序位）。

## 4. 未验边界（如实登记）

1. **回放/历史行载体未落树（跨边界对齐点）**：`row.reasoning` 字段需主进程行映射（`app/desktop/runtime-history.ts`——桌面窗口域）在 reasoning message 事件的行映射处携带 `detail.reasoning`（键名/形状已在本批冻结＋测试钉住：字段＝投影形 reasoning 子对象逐字）。落树前：回放面推理事件回落为既有 assistant「已思考」文本行（现状行为），实时面本批即完整。
2. **三平台适配器事实→事件发射面在并行各波**（Claude/Codex/Pi wiring）——渲染侧只消费投影形；真机观测属各波/ E2E 轮。
3. **真机 Electron e2e 未跑**（本批＝纯函数＋源码守卫，沿 I7 分工）：档位控件实际渲染（三平台值域）、长正文展开、≥150 行虚拟窗口下开合、批尾锚点实测——E2E 轮观测项。
4. **legacy 注入替身路径**（`pi-config.ts` 自建 fields 无 choices）回落文本输入——该降级为该路径已登记形状（值域校验单一来源在注册表保存链），生产面不受影响。
5. 若后续事件面引入增量/「思考中」相位或每轮聚合行（设计 §十一-6 候选增强），行更新/定型点应落 `appendReasoningRow` 一带（今日无该输入，占位注记）。

## 5. 文件与指纹（sha256 前 8 位）

| 文件 | 指纹 | 说明 |
| --- | --- | --- |
| `app/renderer/renderer.js` | `7d18858b`（原 `27d72e8e`） | +102/−2：档位控件分支、推理行构造/入口/状态机、live/回放接线 |
| `app/renderer/tool-rows.js` | `a116119e`（原 `2fd2335f`） | +28/−1：`reasoningLabel`/`reasoningFoldable` 纯函数单点＋导出 |
| `app/renderer/styles.css` | `6029a281`（原 `7cf067d4`） | +11：`.reasoning-record` 折叠行块、`select.pi-input` 光标态 |
| `app/renderer/ui-labels.js` | `564fdb9a` | 零触碰 |
| `app/renderer/index.html` | `a39e3652` | 零触碰 |
| `test/桌面应用/tool-rows.test.ts` | `fbca6143`（原 `225e69ae`） | +2 例（G-5/wave2 段） |
| `test/桌面应用/renderer.test.ts` | `6d164c91`（原 `d06e7bfc`） | +2 例（控件/折叠行守卫） |

## 6. 边界与纪律

- 只触碰上表五个文件与本角色 docs/changelog/memo；未碰 `src/**`、`app/desktop/**`（并行在飞的 `runtime-settings.ts`/`runtime-config.ts`/`pi-config.ts`/`runtime-history.ts` 等仅只读引用其已落树事实）、`test/测试/**`、其它角色文件。
- 未 git 提交（沿各批先例，由 PM 统一提）。
- 独立验证与真机 E2E 交测试角色/桌面窗口轮；回放载体对齐点已在 §4-1 具名交回。
