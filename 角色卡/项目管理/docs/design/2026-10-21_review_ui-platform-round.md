---
id: ui-platform-round-review
type: design
title: UI 平台化（shadcn/ui Nova × 深色石墨）——项目管理评审与实施口径
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: approved
revision: 19
related: [ui-platform-round, enterprise-stability-uiux, post-v1-product-roadmap]
events:
  - date: "2026-10-21"
    kind: reviewed
    summary: 对产品提案 revision 1 完成只读评审；结论「需修订」，两项实施前必须修订（Phase 1 release 步骤与冻结 v1.4.0 发布配方冲突；A5 双端等价判据缺可执行契约面）；方向与六个默认值成立
  - date: "2026-10-21"
    kind: revised
    summary: 复审产品 revision 2（§十三）：M1/M2 已逐条落实，结论改为通过；Phase 0/1 可按阶段派发，Phase 2 起每阶段门通过后进入下一阶段
  - date: "2026-10-21"
    kind: reviewed
    summary: Phase 3 门裁定：Phase 3A 聊天流核心子门放行（狭义口径，全量双端对照后移 Phase 5）；toolfold 尾部锚点为既有基线红（3B/5 收敛）；bench 采用预热排除+中位/p95/单轮 50ms 规则；批准大工具组懒挂载为唯一 DOM 契约例外；3B 前置与范围约束见 §10.5
  - date: "2026-10-21"
    kind: reviewed
    summary: 3B 前置复核通过（§10.6）：A/B/C/D 台账逐名（B 82 具名）、C1 判据未放宽、契约面 §七登记、延迟挂载正向检查 10/10；放行 Phase 3B，无剩余前置；带条件见 §10.6
  - date: "2026-10-21"
    kind: verified
    summary: Phase 3 整体门完成（§11.1）：3B test pass、UIUX 5 项修正后 pass、C1 收敛 Δ=16、45/45 冒烟与各门禁通过；全量双端与 main.mjs 留 Phase 5。授权 Phase 4（§11.2），拆 4A→4B，4A 派发前置见 §11.4
  - date: "2026-10-21"
    kind: reviewed
    summary: 4A 复核与放行（§十二）：QUEUE_VIEW 归 4B（4A 只做抽屉队列 VISUAL 子集）；批准 4A 写集（Slider 允许新增单文件）；UIUX 10 问逐条裁定；不新增 runtime 持久化；最近回交仅 handback；零新增依赖+热路径重基线；C2 仅旧入口；放行 4A 实现，4A 门前条件见 §12.5
  - date: "2026-10-21"
    kind: reviewed
    summary: 4A 实施期裁定（§十三）：批准 ChatRow 最小例外（失效 operator 动作按钮 hidden，合旧语义）；judge 历史行跨引擎重放归 4B；C2 同因既有红并重锚检查；左树只保留 .ti-count 一种可见计数；4A 条件放行，重跑 4A 门禁+RUNTIME/视觉通过后关门
  - date: "2026-10-21"
    kind: verified
    summary: 4A 门关闭（§14.1）：UIUX M1–M6 pass、测试独立验证与重验 pass、99/99+32/32 冒烟、67/67、679/679、IME 24/24、懒挂载 10/10、bench p95 18.2、C1 Δ=16；C2 同因红；queueView tab 切换非预期，4B 修。授权 4B（§14.3），派发前置见 §14.4
  - date: "2026-10-21"
    kind: reviewed
    summary: 4B 复核与放行（§十五）：批准解冻清单（App 保持冻结）；治理模型标签统一「三权 · 五角色」并重锚 MIRROR；批准 operator 聚合落点、菜单配置缓存、治理宿主；C2 口径测试提出、桌面UI 落文件、测试复验；明确 DELIVERY_NOTE/COMPLETE_FLOW/VISUAL 的 4B 子集；批准新组合组件；放行 4B 实现，门前条件见 §15.10
  - date: "2026-10-21"
    kind: verified
    summary: 4B 门关闭、Phase 4 完成（§16.1）：两项真红修复（C2 原因可见、已答卡锚点）、UIUX 4 项 + 200% 收口 pass；70/70 冒烟、96/96、679/679、IME 24、lazy 10/10、gzip 286,348B、bench p95 24.7、C1 16；RUNTIME 17/17、VISUAL 54/54、QUEUE 4/4、MIRROR 8/8（五角色）、GOV 7/7、JUDGE 33/33、G2 5/5；无新依赖/DOM 例外。授权 Phase 5（§16.2），顺序 5A→5B，最终验收由独立验收角色（§16.5）
  - date: "2026-10-21"
    kind: reviewed
    summary: 5A 复核与放行（§十七）：批准最终入口 dist/index.html（5B 原子移源/改 Vite input/切 main）；批准 renderer-entry.ts 唯一路径事实源；dev/prod + 8s 回退 + smoke-only 入口参数；main.mjs 323→324 与健壮化；P1-3 忙时切换条件下重锚（待 5A 安全证据）；三项缺口语义；178 项迁移台账；删除仅 5B；package:local/verify:local（verify 放 test/装配）；双端差异模板；AC1–AC8 为最终判据；5A 放行，门前条件见 §17.11
  - date: "2026-10-21"
    kind: reviewed
    summary: 5A 实施期追加裁定（§17.12/§17.13）：批准 Markdown 链接双层修复（桌面UI 拦截 + 桌面窗口 will-navigate/setWindowOpenHandler 兜底，不改 preload/IPC）；main.mjs 103 值差异/1 仅旧/10 仅新/10 项新端 repair 失败按 MATCH/RENAME/NEW-ONLY/OLD-ONLY/REMOVED 逐名处理，PM 批准；旧 RECOVERY 红按 C 类同因；5A 门 MATCH-FAIL=0、无未批准差异，候选冻结在修复与台账之后
  - date: "2026-10-21"
    kind: reviewed
    summary: 5A 门复核（§十八）：needs-work，5A 门不通过；A 组 8 项全部 5A 修（无允许差异）；B 组 9 项行为/fail-closed 修、诊断条件批准、timeout 归因；C 组 12 条旧夹具 10 重锚/2 待 UIUX；D 组 102 值差异等不整表批准，按 G1–G5/9 NEW-ONLY/1 OLD-ONLY 分组重出台账后 PM 逐组批准；toggleDrift 与 role reading 5A 修；授权修复轮，门保持关闭至重跑通过
  - date: "2026-10-21"
    kind: reviewed
    summary: 5A 修复轮 harness-only 批准（§17.13 更新）：4 项夹具泄漏场景隔离（recovery 前 rejectAllPending，不改断言；RECOVERY_SAME 新端 true/旧端 false C 类）+ PROMISE_TIMEOUT 驱动改为 presenter request id+input.click+submit（不改判据/阈值）；新快照 old 373/new 380/common 372/only-old 1/only-new 8/值差 91（中间态）；剩余 6 项 SESSION_REPAIR×5+DIAGNOSTICS 为渲染侧真实缺陷，修后 main 新端应全绿；5A 门保持关闭至全部重验
  - date: "2026-10-21"
    kind: reviewed
    summary: UIUX 5A 新端视觉审计（§18.7）：needs-work，P0 200% composer 不可达、P1 200% 错误态横滚/loading+尾行缺转轮/密度等价未立；P2 注入盒行高/状态条叠压/200% 镜像交付目标缺失/证据命名；加入 5A 门条件：P0/P1 清零 + 候选重冻后重跑审计；可见行不降阈值（≥9/≥8/≥4），转轮保留 0.9s 重锚 `.status-spinner`
  - date: "2026-10-21"
    kind: reviewed
    summary: 5A 最终分组裁定（§十九）：main E2E_PASS=true/10 repair 全 true；G1 19 整组批准、G2 12 逐名批准、G3 25 条件待精确等价检查名、G4 21 中 6 批准重锚/移除、5 条件、10 修或补等价；MERGE `window.__mergeCard` 重锚语义身份、DEFAULT toggleDrift 重锚 `closest('.chat-pane')`；design audit 旧 `.tool-records` 选择器批准重锚；5A 门仍关闭
  - date: "2026-10-21"
    kind: verified
    summary: 5A 门关闭（§20.1）：冻结候选 HTML f372e111/JS f568e2aa/CSS b52cfca1，gzip 288,552B；5A 36/36、design audit 31/31、uiux 23 段全绿（C1 Δ=20）、main E2E_PASS=true、G1–G5 无未批准/MATCH-FAIL=0、142/142、683/683、IME 24、lazy 10/10、bench 过、密度 12/11/8、200% 遮挡清零；S0 六名接受等价覆盖；授权 5B 原子批次 a–f；独立验收按 AC1–AC8
  - date: "2026-10-21"
    kind: reviewed
    summary: 5B 实施完成、独立验收 needs-work（§二十一）：AC1/2/4/5/6/7 pass，AC3/AC8 文档/台账/候选分离补正；F1 OPEN_CARD_AT_ARRIVAL 台账、F2 契约面、F3 产品复核、F4 同期无关改动分离、F5 旧套件限制、F6 计数统一、F7 probe 口径；PM 复核无关改动不进入 Phase 5 判定；5B 门未关闭，补正后独立验收重判 AC3/AC8
  - date: "2026-10-21"
    kind: verified
    summary: 独立验收重判 pass（§二十二）：AC1–AC8 全过（AC3 以 424 名 0 回归证实质等价、AC8 以独立 378 文件清单+16 DELETED 补齐）；5B 门关闭、Phase 5 实施与独立验收完成（macOS 本地离线/本地打包范围）；候选 HTML 3c4da2a2/JS f568e2aa/CSS 76fad7ce、包 edeeef19；六类 missing-evidence 未判、非阻塞遗留登记；PM 不自我验收，验收不授予提交/发布
---

# UI 平台化——项目管理评审与实施口径

**审查对象**：产品提案 [UI 平台化——用 shadcn/ui Nova × 深色石墨重建渲染层](../../../产品/docs/design/2026-10-21_design_ui-platform-round.md)（status: proposed，revision 1，2026-10-21）。
**评审基线**：HEAD `fc1a39c`；工作树含产品本提案相关未提交改动（`角色卡/产品/` 三个登记文件与新提案）及本角色一份未提交的权限修复草案，评审按实际文件只读核对。
**评审性质**：只读评审与实施口径，未改任何代码、依赖、构建配置或他人文件；未启动应用、未运行测试、未调用模型或网络、未读 `.env`。本文不是客户批准、实施授权或验收记录。
**客户授权状态**：客户 2026-10-21 已确认方向并指示「开干」，接受六个推荐默认值。该确认是**方向与实施意向**，不等于对某个具体文件写入的逐一授权；实施范围、顺序与归属仍以本评审结论、修订后的提案版本和逐角色派发为准。

## 一、结论

**结论：需修订（needs revision）。** 提案的方向、产品原则、六个默认值与分阶段替换策略成立，不要求重新决策；但有两处**实施前必须修订**，因为按 revision 1 直接实施会分别撞上现有发布机制的硬约束、并使本轮最关键的切换判据不可执行。**以下 §1.1–§1.3 针对 revision 1；产品 revision 2 的复审结论见 §1.4（已通过）。**

### 1.1 实施前必须修订（M1、M2）

**M1：Phase 1 的「release 构建步骤」与 v1.4.0 冻结发布配方冲突，必须从本轮移除。**
- 事实：`.github/workflows/release.yml` 绑定的 `source_ref` 默认 `v1.4.0`；`src/common/装配/release-policy.mjs` 把 `SOURCE_SHA` 钉死在 `83eec7e`，并用 `selectOverlay` 只接受白名单内的文件——**任何 `app/` 或未列名的 `src/` 变更都会使 `release-prepare` 直接失败**。
- 后果：在 Phase 1 往 `release.yml` 加 `npm run build:renderer`，冻结源里既没有 Vite 也没有新依赖，构建必失败；把 `app/renderer/**` 加进 overlay 又会被 `Unreviewed production overlay` 拒绝。也就是说，这不是「改一行 workflow」就能完成的事。
- 精确修订：§六 Phase 1 产出删除「release 构建步骤」；§六 Phase 5 的「发布验证」改为「本地打包夹具验证（真实 Electron 载入构建产物）」并注明**发布流水线接入属于下一次冻结源/新发布轮**；§十一 Q14 按此回答。发布轮何时开、以哪个 source tag 冻结，是客户在 Phase 5 前后的发布决策，不在本轮实施范围。

**M2：§五 A5 的「同一套 e2e 双端等价」判据缺少可执行面，必须补成契约清单。**
- 事实：现有 e2e 不只依赖 `id`/`aria`。`uiux-v2.mjs` 有 387 行出现 `check(`、180 行引用 `window.__ansRenderer`；`main.mjs` 有 94 行引用同一测试驱动；`bench-storm.mjs` 依赖 `window.__ansRenderer`、`#chat .chat-pane`、`.virt-spacer` 与全局 `window.ANSMarkdown`；除 `bench-storm` 有 `BENCH_RENDERER_DIR` 外，其余套件把 `app/renderer/index.html` 写死在 `loadFile` 里。
- 后果：只写「id/aria 原样保留」时，Phase 5 的「等价通过」无法执行——测试驱动的 JS 方法、class/data 属性、套件目标路径都不在承诺内，实施者可以「合法地」做出跑不过旧套件的界面。
- 精确修订：§五 A5 扩为三件事并写入 §六 Phase 3/5 验收口径与 Q5——
  1. **契约面清单**：e2e 与单测守卫实际使用的 id、class、`data-*`、aria 与 `window.__ansRenderer` 方法（Phase 2 由桌面UI 产出清单文档，作为实现与验收输入）；
  2. **测试驱动兼容**：新渲染器提供同名 `window.__ansRenderer` 驱动，方法必须接到真实的 store/动作，不得另做一套「测试专用逻辑」；
  3. **套件可切换目标**：各套件通过显式环境变量指向旧入口或新构建产物；双端运行同一套件、逐 check 名对照，作为切换证据。

### 1.2 评审通过、无需修订的部分

- 方向「行为不变，换生产方式」与产品原则；Nova × 深色石墨、整页等宽、既有交互语义保留。
- 六个默认值：Vite 仅渲染层、分阶段替换、移植虚拟滚动、不引 vitest、dnd-kit 按需、base-nova。
- 依赖宪法与禁入清单、One-shot 五事实源/白名单/状态矩阵/机器守卫/黄金样板。
- 分阶段路线的主体划分（Phase 0 观感门、Phase 5 切换门），除 M1/M2 涉及的条目外。
- 架构红线 A2–A4、A6–A9 的口径。

### 1.3 实施中确认（不阻塞修订，但各有判定方法与责任人）

| 项 | 判定方法 | 责任与时点 |
| --- | --- | --- |
| 依赖精确版本与 Electron 44 Chromium 构建目标 | 解析后在依赖台账记录版本；真实 Electron 读取 `process.versions.chrome` 并设定 `build.target`；PM 按四问批准 | 装配，Phase 1 |
| 生产 `file://` 下 Vite ES 模块/分块能否加载 | 真实 Electron `loadFile(dist 入口)`，要求脚本执行、零 CSP/CORS 错误；失败按 §2.1 两个回退之一，自定义协议须回 PM | 装配 + 桌面窗口，Phase 1 首件 |
| shadcn CLI 是否提供 base-nova 及生成结果 | 以固定 CLI 版本在仓库内实际生成一组组件并核对；不可用即回 PM | UIUX + 桌面UI，Phase 0 |
| zustand 允许切片冻结 | 门禁引擎/桌面窗口在各自固定上下文给只读评估；PM 汇总后冻结清单 | 门禁引擎、桌面窗口，Phase 2 前 |
| DOM/测试驱动契约清单 | 从现有套件提取 id/class/data/aria/驱动方法，形成清单文档并与实现逐项对照 | 桌面UI，Phase 2 开始 |
| IME 项数重锚 | 以套件实际 check 名单为准并记录；不把「26 项」写成已验证事实 | 桌面UI + 测试，Phase 3 前 |
| bench「不劣化」阈值 | 先用旧渲染器固化基线 JSON，测试提出阈值，PM 批准 | 测试，Phase 3 前 |
| 预算度量脚本 | 构建后按入口引用资产 gzip 求和输出数字；Phase 5 由测试复核 | 装配 + 测试，Phase 1/2 |
| `typescript` 的 `^7.0.2` 规范化 | 改精确版本或由装配记录例外 | 装配，Phase 1 |
| 新冻结源/发布轮 | 客户决定 source tag 与发布时间；装配更新 release 配方与验证 | 客户 + 装配，Phase 5 前后 |
| 是否新建通用 CI | 客户可选；若建，Team Formation 需为装配新增 workflow 边界 | 客户，候选 |
| Electron 内 dev HMR | 仅开发便利；环境变量门控、非打包路径；不作为门禁 | 桌面窗口，可选 |

### 1.4 复审结论（revision 2，2026-10-21）

**复审对象**：产品提案 revision 2（354 行，2026-10-21，§十三「项目管理评审响应」）。本次只核对 M1/M2 与 §十三 的 PM 技术结论落点，不重审未变部分。

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| M1 发布冻结 | **已落实** | §六 Phase 1 改为「仅本地构建，不接发布流水线」；Phase 5 改为「本地打包与真实 Electron 冒烟（不接发布流水线）」；§六说明、R15、Q2、Q14 均明确发布接入留到下一次冻结源/新发布轮、由客户决定。全文无 Phase 1 release 步骤 |
| M2 契约面 | **已落实** | A5 扩为「id/class/data/aria + 同名 `window.__ansRenderer` 驱动 + 套件目标切换 + 双端逐 check 名对照」；Phase 2 产出契约面清单并列为门；Phase 3/5 门写双端逐 check 名；Q5/Q12 同步 |
| §十三 技术结论 | **一致** | devDependencies 与预算计数、markdown-it 于 Phase 3 改 npm 精确 15.0.2、不引 vitest/纯逻辑单测、`test/桌面UI/`、Phase 1 `file://` 首件验证、过渡期入口、tsconfig/typecheck、zustand 边界、图标共 10 条，与评审逐条一致，未发现新冲突 |

**复审结论：通过（approve）。** 无进一步必要修订。

**派发口径**：Phase 0/1 可按阶段派发（前置：产品 revision 2 已交付；Team Formation 更新装配 `vite.config.ts` 与 `test/桌面UI/` 边界并经客户确认）；Phase 2 起每阶段门通过后进入下一阶段。一条**派发注记（非修订）**：Phase 1 的「shadcn 配置」不得在客户观感门之前初始化 `components.json`（提案 §3.2 与 Phase 0 门更具体，按此执行）。本复审不改变「未收集的受影响角色评估」与各「实施中确认」项的待办状态；评审通过不等于实施授权或验收。

revision 1 修订的复核范围仅限 M1/M2 及受影响条目（已在 §1.4 执行）；其余内容不重复评审。

## 二、架构影响评估

### 2.1 构建只覆盖渲染层（A1）

- **配置口径成立**：Vite `root=app/renderer`、`base:'./'`、产物 `app/renderer/dist/`、`modulePreload.polyfill=false`。前两项保证 `loadFile` 下资源相对路径可用；关闭 polyfill 是严格 CSP 的必要条件——Vite 默认注入的 modulepreload polyfill 会以 fetch/link 方式预取模块，在 `default-src 'none'` 下会被 CSP 拦截（无论它出现在入口块还是 HTML 中）。
- **过渡期入口命名必须明确**：旧渲染器在 Phase 5 前必须继续可用，而旧入口就叫 `app/renderer/index.html`。因此新渲染器在过渡期应使用独立 HTML 入口（例如 `app/renderer/index.react.html`，或 `app/renderer/react/index.html`），并在 Vite 里显式指定 `build.rollupOptions.input`，避免误把旧 `index.html` 及其 7 个经典脚本打进构建；Phase 5 再把新入口定名/切换到 `index.html`，使生产 `loadFile(dist/index.html)` 的承诺成立。这是实施细节，不改变 A1 的实质约束（仅渲染层、产物在 `app/renderer/dist/`、相对路径、严格 CSP）。
- **生产 `file://` 下的 ES 模块加载必须在 Phase 1 首件实测**：Vite 默认产出 `<script type="module">` 与代码分块，而 Chromium 对 `file://` 的模块脚本有 CORS 限制；Electron 44 的实际行为本评审未运行验证，**不作断言**。判定方法：Phase 1 用真实 Electron BrowserWindow `loadFile('app/renderer/dist/<entry>.html')` 载入脚手架，要求脚本执行、`securitypolicyviolation` 零事件、控制台零 CSP/CORS 错误。若不通过，两个既定回退：(a) 构建为经典脚本单包（`format:'iife'`、禁用代码分块与动态导入），仍是纯 Vite；(b) 由桌面窗口注册受控自定义协议（如 `app://`）并用 `loadURL`——这会引入主进程加载路径变更，须回到 PM 评审并计入桌面窗口工作量，不在 Phase 1 自行决定。
- **构建目标**：在 Phase 1 读取真实 Electron 44 的 `process.versions.chrome`，把 Vite `build.target` 钉到对应 Chromium；Tailwind v4/Base UI 的兼容性按 R13 在真实 Electron 夹具验证。
- **严格 CSP 与生产零内联**：生产 `index.html` 维持 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`。Vite 构建产物为外部 JS/CSS 文件时满足该策略；React 的 `style` prop 与 motion 通过 CSSOM 设置样式，不受 `style-src` 对 `<style>`/`style` 属性的限制，但**禁止运行时注入 `<style>` 标签或内联脚本**。生产构建后静态扫描 `dist/index.html`：不得出现内联 `<script>`、`unsafe-inline`、`unsafe-eval`。
- **dev 只放宽**：dev server 的 React Refresh 前导脚本与样式注入需要放宽，机制建议用 Vite `transformIndexHtml` 插件按 `apply:'serve'` 注入 dev CSP（或 dev 不设 meta），构建时注入严格 meta；源码 HTML 不长期保留 dev 弱策略。`index.html` 的 CSP meta 属桌面UI 边界，但其安全属性需桌面窗口在 Phase 5 一起确认。

### 2.2 主进程无构建与 `app/main.ts` 加载策略

- **现状**：`app/main.ts` 没有 dev/prod 分支，`loadInterface()` 固定 `win.loadFile(path.join(HERE,"renderer","index.html"))`；主进程与 preload 由 Electron 44 原生类型擦除/CommonJS 直接运行，无构建管线。这与 A2 一致。
- **Phase 2 不依赖桌面窗口先落 dev 切换**：骨架阶段可用两条路并行——(a) 浏览器预览 Vite dev server（需要渲染侧自带一个 dev 用的 `window.desktop` 假桥，放在 `app/renderer` 内，属桌面UI）；(b) 真实 Electron e2e 夹具直接 `loadFile` 新构建产物并挂真实 preload/桩通道。两条路都不经过 `app/main.ts`。
- **桌面窗口的强制改动只在 Phase 5**：切换产品默认入口（`renderer/index.html` → `dist/index.html` 或最终入口）必须由桌面窗口修改 `app/main.ts`。若团队希望开发期在 Electron 内用 HMR，可另加仅非打包环境生效的 dev `loadURL` 分支，但这是**便利项，不是门禁**，且不得把 dev 放宽带进生产分支。
- **Phase 5 配套**：打包冒烟（`packaged-smoke`）与 `release-verify` 需确认实际载入的是 dist 入口；`release-verify.mjs` 属装配，但其改动只能在新的冻结源发布轮生效（见 M1）。

### 2.3 tsconfig 策略与 JSX / `node --test` 机制缺口（Q6）

- **根 `tsconfig.json` 现状**：`include: ["src","test","app"]`，无 `jsx`、`lib` 仅 `esnext`、`types:["node"]`。新渲染器含 JSX/DOM，必须拆分：
  - 根 `tsconfig.json` 由装配加 `exclude: ["app/renderer"]`；
  - `app/renderer/tsconfig.json` 归桌面UI：`jsx: "react-jsx"`、`lib: ["ES2023","DOM","DOM.Iterable"]`、`moduleResolution: "bundler"`、`types: []`（不引 Node 类型）、`noEmit`；
  - `package.json` 增 `typecheck:renderer`（`tsc -p app/renderer/tsconfig.json --noEmit`）归装配。
- **一个容易忽略的机制点**：TypeScript 的 `exclude` 只过滤根文件集合，**被 include 文件 import 的排除文件仍会进入根程序**。因此 `test/` 下的单测若 import 渲染层模块，那些模块仍受根配置（无 DOM lib、无 JSX）约束。结论：可被单测 import 的渲染层模块必须是**不依赖 DOM 的纯逻辑 `.ts`**；含 JSX 或 DOM 的模块只能由 e2e 覆盖。
- **Q6 结论（同意任务给出的建议，并补一条约束）**：单元测试只测纯逻辑（`.ts`，无 JSX）；DOM 行为交给真实 Electron e2e；不引入 vitest，也不在 Phase 1 引入 esbuild 测试转译加载器。理由：`node --test` 的原生类型擦除不处理 JSX；为 JSX 单测加 loader 会把「测试侧转译」变成第二套构建事实源，且 jsdom 与 Electron Chromium 的行为差异会让「行为等价」判据失真。客户已确认的「jsdom + testing-library 如需」保留为**批准的备选**：仅当某个组件的纯逻辑无法从 JSX 中拆出、且 e2e 无法经济覆盖时，才由 PM 逐项批准启用（候选，未启用）。
- **Phase 5 的 typecheck 组合**：新冻结源里 `typecheck` 脚本应组合根检查与 `typecheck:renderer`（或发布步骤显式跑两条），否则渲染层类型错误在发布链路里不可见。

### 2.4 打包与发布

- **electron-builder 已覆盖 dist**：`files: app/**/*` 包含 `app/renderer/dist/**`；`!**/*.{log,map}` 排除 sourcemap；`asar:false` 下 `loadFile` 直接读磁盘文件。**无需修改 `electron-builder.yml`**。构建产物若含 `.map` 会被排除，符合现状。
- **release.yml 不能在本轮增加构建步骤（M1）**：工作流以 v1.4.0 冻结源 + overlay 白名单运行；`npm ci` 安装的是 v1.4.0 的锁文件，其中没有 Vite；`release-policy.mjs` 对 `app/` 变更直接抛错。因此 Phase 1 只在本地/开发链路落 `build:renderer` 与 typecheck；发布接入放到**下一次冻结源**（新版本 tag）：
  - 新源冻结时 `release.yml` 在 `npm ci` 后、typecheck 前增加 `npm run build:renderer`，并让 typecheck 覆盖渲染层；
  - `release-verify.mjs` 增加「包内存在 dist 入口且冒烟加载的是它」的断言；
  - 这些都属于新发布轮的装配工作与客户发布决策。
- **Phase 5「发布验证」的边界**：本轮可做的是本地打包 + 真实 Electron 冒烟（不经 GitHub Release）；正式发布需要客户决定新 source tag、更新 `release-policy` 并重走发布验证。

### 2.5 DOM 契约与 e2e parity 判据的可执行性（M2 的评估依据）

- **套件事实**（grep 行计数，非运行结果）：
  - `test/桌面应用/e2e/uiux-v2.mjs`：1542 行，387 行出现 `check(`（含函数定义与调用），180 行引用 `window.__ansRenderer`；覆盖抽屉、角色树、确认卡、治理卡、队列、滚动等。
  - `main.mjs`（桌面窗口属主）：1683 行，94 行引用 `window.__ansRenderer`；真实主进程装配 + preload + renderer 的整机自检。
  - `ime-enter.mjs`：9 处 `check(`，覆盖中文/英文组合、`keyCode 229`、Shift+Enter、附件随消息清除。
  - `bench-storm.mjs`：无人值守基准台，依赖真实 renderer 的 `window.__ansRenderer.loadProject/selectRole/state.roleMeta`、`#chat .chat-pane`、`.virt-spacer`、全局 `ANSMarkdown`；有 `BENCH_RENDERER_DIR` 可指向其他目录。
  - `uiux-design-audit.mjs`：载入 `renderer/index.html`，少量驱动调用；`uiux-prototype-measure.mjs` 测 UIUX 原型，不涉渲染器。
- **锚点/IME/bench 的迁移门**：
  - 锚点与行模型：现有 `rowModelDebug` 返回 `{count,lastIndex,operators,rowGap}`，e2e 用它断言「确认卡落在锚点而非行表尾」与行距口径；新实现必须保留同义驱动与 `.virt-spacer` 行结构。
  - IME：`ime-enter.mjs` 可直接复用，前提是新渲染器保留 `#inp-message`、`#btn-send`、`#btn-attach-image`、`#attach-row .attach-chip`、`#chat .msg-user` 与组合事件语义。该项作为 Phase 3 硬门。
  - 左栏拖拽：`#sidebar-resizer` 的 `role=separator`、`aria-valuenow/min/max`、键盘 ±8/Shift ±24、双击复位与 localStorage 宽度是既有契约；引入 `react-resizable-panels` 后必须对照其默认键盘/aria 行为补回同义语义，不能只换组件不保行为。
  - bench：先把旧渲染器基线（`stormA/stormB` 最大帧间隔与处理耗时、`replay`、`scrollToBottom`、`mounted`）固化为 JSON 证据，再由测试在 Phase 3 前提出「不劣化」阈值；新基准台必须测同一组量，不得换指标。「26 项 IME」以套件实际 check 为准，Phase 3 前重锚并记录，不把未核对的数字写成事实。
- **结论**：A5 的意图正确，但必须按 M2 扩成契约面清单 + 驱动兼容 + 套件目标切换，否则「同一套 e2e 双端等价」不可执行。

### 2.6 依赖归属：React 等渲染库放 `devDependencies`

**结论：所有只被渲染层 import、由 Vite 打进 `dist` 的库放 `devDependencies`。** 理由：
- Vite 构建后运行时不需要 `node_modules` 里的这些包；`app/main.ts`、preload、`app/desktop/` 也不 require 它们。
- electron-builder 只把 `dependencies` 的生产依赖复制进安装包（当前 `release-verify` 就在检查包内 `node_modules` 的 SDK）。放进 `dependencies` 会在安装包里多出一份用不到的 React/Base UI/motion，扩大体积与供应链面，且与 `dist` 内已打包副本形成两个版本事实源。
- `dependencies` 仅保留主进程运行时真正 require 的包（现有三套 SDK、yaml、zod 等）。
- `markdown-it` 若改为 npm 精确版本，同理放 `devDependencies`。
- 现有 `typescript: "^7.0.2"` 与依赖宪法「精确锁定、无 `^`/`~`」不一致；Phase 1 编辑 `package.json` 时一并改为精确版本，或由装配记录例外理由（实施中确认）。
- 预算计数按 Q11 口径：渲染运行时库（含 React/react-dom）计入 ≤12；构建工具、类型包、已被替换的 markdown-it 不计入「新增」。

### 2.7 markdown-it：改为 npm 精确版本并删除 vendor

**结论：采用 npm `markdown-it@15.0.2` 精确版本（devDependency）+ 对应 `@types/markdown-it` 精确版本，删除 `app/renderer/vendor/` 的 UMD 单文件；不保留 vendored 形态。** 理由：
- vendor 存在的前提是「无打包器、浏览器全局脚本」；引入 Vite 后，UMD 全局要么靠 `<script>` 标签维持加载顺序（与模块图、单一事实源冲突），要么依赖 CJS 互操作（脆弱），两条路都比直接 import 差。
- 供应链强度不下降：锁定精确版本 + `package-lock.json` 的 integrity 哈希（含传递依赖）替代单文件 sha256；仍可在升级时用 `npm pack` 人工核对。
- 安全语义不变：`markdown.js` 的 `html:false`、链接白名单、图片/表格禁用、类名与 `rel` 规则原样迁移到 TS 封装；XSS 负例测试必须先在新封装上全绿，再删除 vendor 与旧 pin 测试（`markdown.test.ts` 中的 sha256 pin 改为版本 + 锁文件断言）。
- 若实施时因环境限制无法走 npm（例如离线约束），备选是 vendor **ESM 构建**并 import，而不是继续用全局脚本；该备选需 PM 另行批准。无论哪条路，不引第二套 Markdown。

## 三、跨角色影响与工作量（相对量级，不写日历工期）

| 角色 | 涉及内容 | 量级 | 依赖/说明 |
| --- | --- | --- | --- |
| UIUX设计师 | Phase 0：Nova×石墨规范、令牌映射表、组件清单、状态矩阵、关键屏可检查原型；Phase 2/5 视觉复核 | L | 可与 Phase 1 并行；观感门在 `components.json` 初始化前 |
| 装配 | Phase 1：`vite.config.ts`、依赖与锁文件、scripts（`build:renderer`、`typecheck:renderer`）、根 tsconfig、`.gitignore`、构建/预算/重复版本检查；新发布轮的 release 接入 | M | 依赖 Team Formation 边界更新；release 接入另属新发布轮（M1） |
| 桌面UI | Phase 2/3/4 全部渲染实现；测试驱动兼容；Phase 2 契约清单；组件台账与机器守卫配合 | L | 依赖 Phase 0 观感门与 Phase 1 工具链；是工作量主体 |
| 桌面窗口 | Phase 5 生产入口切换；打包冒烟路径确认；可选 dev HMR 分支；若走自定义协议回退则承担协议实现 | S（回退时 M） | Phases 2–4 不阻塞；仅 Phase 5 强制 |
| 测试 | 旧渲染器基线固化、各阶段独立复核、双端等价证据、依赖审计/预算/守卫、Phase 5 切换复核；新发布轮冒烟 | M | 基线采集可在 Phase 0/1 并行；阈值须在 Phase 3 前定 |
| 产品 | revision 2（M1/M2）；Phase 0/2/5 产品面复核；方向与文案审阅 | S | revision 2 是 Phase 1 派发前置 |
| ANS Team Formation | 边界更新（见 §四）；同步 `boundary.yaml` 与 `boundary.md` | S | 需客户确认边界变更；应先于装配 Phase 1 |
| 项目管理 | 评审、口径与门禁定义、跨角色协调、审批简报、证据汇总 | M | 持续 |

**依赖顺序与可并行关系**：
1. 产品 revision 2（M1/M2）与 Team Formation 边界更新可并行，且都先于装配 Phase 1。
2. UIUX Phase 0 与上述并行（纯设计，不写代码）；其观感门是 Phase 2 的前置，不阻塞 Phase 1 工具链（`components.json` 初始化除外）。
3. 测试可在不改代码的前提下先固化旧渲染器 e2e/bench 基线。
4. 装配 Phase 1 通过后，桌面UI Phase 2 → 3 → 4 顺序推进（同一批人，建议串行）；每阶段门由测试复核、产品/UIUX 按需参加。
5. Phase 5 由测试主导双端等价与切换复核，桌面窗口完成入口切换，PM 汇总后交客户确认；发布流水线接入留到新冻结源。
6. 桌面窗口在 Phase 5 前无强制任务，可在 Phase 2 后按需提供 dev 便利分支（非门禁）。

## 四、边界缺口（交 ANS Team Formation）

### 4.1 精确清单

1. **装配 Section 1 新增文件条目**：`vite.config.ts`（根级，用途：渲染层 Vite 构建配置，仅渲染层）。这是本轮唯一必须新增的根级授权。
2. **装配既有条目无需改动**：`package.json`、`package-lock.json`、`tsconfig.json`、`.gitignore`、`electron-builder.yml`、`.github/workflows/release.yml` 均已在 Section 1；本轮不新增 release 步骤（M1），所以 release.yml 无需新授权。
3. **桌面UI 的 `app/renderer/` 目录授权已覆盖新文件**：`components.json`、`tsconfig.json`、`src/**`、`public/**`、构建产物 `dist/**` 都落在 `kind: directory, path: app/renderer/` 内。判断依据：Section 1 的目录条目按目录整体授权（本项目既有惯例：角色可在已批准任务内扩展自己的私有目录，不必逐文件改边界；2026-10-14 拆分时也是按 `app/**` 目录路由）。`dist/` 是构建生成物，由装配的 `build:renderer` 写出，不需要额外的角色写权，但应加入 `.gitignore`（装配）。
4. **桌面UI 的新测试文件是真实缺口**：现有授权只列了 `test/桌面应用/` 下的**精确文件**（`renderer.test.ts`、`markdown.test.ts`、`tool-rows.test.ts`、`runtime-ui.test.ts` 与五个 e2e）。Phase 2 起需要新增纯逻辑单测/新渲染器测试与可能的 parity 夹具，不能靠改现有文件无限承载。建议由 Team Formation 增加：
   - `test/桌面UI/`（目录，用途：新渲染器的纯逻辑单测、契约清单测试与 parity 夹具），或
   - `test/桌面应用/e2e/react/`（目录，仅新渲染器 e2e），与桌面窗口的 `main.mjs` 精确文件互不重叠。
   推荐前者：与角色拆分后的命名一致，且避免和桌面窗口的文件同目录交叉。
5. **测试角色无需新授权**：`test/测试/` 已是目录条目，可承载依赖宪法守卫、预算检查、双端证据汇总。
6. **UIUX/产品无需新授权**：Phase 0 产物在各自 `docs/design/` 目录内。
7. **桌面窗口无需新授权**：`app/main.ts` 在 Section 1；即使走自定义协议回退，也在该文件内。
8. **项目管理自身无变化**。

### 4.2 同步要求

- Team Formation 更新装配边界时，必须**同时更新 `boundary.yaml` 与 `boundary.md`**（本项目两文件并存且同范围），并在根 `changelog.md` 记治理变更。
- 边界更新经客户确认后才生效；在生效前，装配不得创建 `vite.config.ts`。
- 更新完成后，项目管理在 `docs/project-rules.md` 记「构建配置归属」的已确认事实（见本次同步更新）。

## 五、替代方案比较

| 选择 | 备选 | 推荐 | 理由与代价 |
| --- | --- | --- | --- |
| 迁移方式 | 一次性重写 | **分阶段替换 + 最后切换（客户已选）** | 现有 1000+ 行 e2e/守卫构成行为基线；一次性重写无法在新旧之间做等价对照，回归只能靠人眼。代价是过渡期双渲染器维护，用 A8（新需求只进新渲染器、旧渲染器只修阻断缺陷、窗口有界）控制。 |
| 虚拟滚动 | TanStack Virtual | **移植现有行模型（客户已选）** | 现有实现包含确认卡锚点物化、`rowGap` 缓存修复（2026-10-14 锚点漂移）、底部跟随与惰性挂载，均被 e2e 钉住；换库会重新引入未知差异，且新增依赖。移植代价是 Phase 3 工作量集中，但语义可逐项对照。 |
| 构建 | electron-vite | **纯 Vite（客户已选）** | electron-vite 的价值在主进程/preload 构建与 HMR 编排；本项目 A2 明确主进程无构建，引入它反而制造第二套构建入口和依赖面。纯 Vite 只做渲染层，配置更小、边界更清楚。 |
| 无障碍基底 | radix-nova | **base-nova（客户已选）** | 禁入清单禁止 Radix/React Aria 混源；base-nova 是当前 CLI 默认基底。风险是生态成熟度与 API 变动，用精确锁版、组件台账、状态矩阵与真实 Electron e2e 缓解；若 Phase 0 实测 CLI 不支持 base-nova，回 PM 重新决策，不得静默改用 radix-nova。 |

## 六、14 个待评审问题（Q1–Q14）

### Q1 依赖落地与版本冻结

**结论**：装配落 `package.json`/`package-lock.json`；所有新增版本精确锁定（无 `^`/`~`）；具体版本号由 Phase 1 解析后写入依赖台账并交 PM 按四问批准，评审不预先编造版本。安装顺序：先构建工具链（`vite`、`@vitejs/plugin-react`、`@tailwindcss/vite`、`tailwindcss`），再按阶段加入运行时库；shadcn CLI 以 npx 固定版本使用，**不作为项目依赖**。`npm ls` 重复版本检查：**本地先做**（脚本 + `test/测试/` 守卫），CI/发布链路检查延到新冻结源（当前没有通用 CI，release.yml 不能动，见 M1）。
**依据**：package.json 现状、release 冻结机制、依赖宪法。
**实施中确认**：具体版本与 Electron 44 Chromium 目标；`typescript` 的 `^` 规范化。

### Q2 根级构建配置的写入边界

**结论**：新增根级 `vite.config.ts` 归装配，须由 Team Formation 更新 Section 1（`boundary.yaml` 与 `boundary.md`）并经客户确认；`package.json`、`package-lock.json`、`tsconfig.json`、`.gitignore` 已在装配边界内；`electron-builder.yml` 无需改动；`release.yml` 本轮不改。`app/renderer/` 内的 `components.json`、`tsconfig.json`、`src/`、`dist/` 已在桌面UI 目录授权内（判断见 §4.1）。
**依据**：§四与各角色 boundary。

### Q3 shadcn 取件与可复现

**结论**：桌面UI 负责取件与留痕：记录 shadcn CLI 版本、`components.json` 全文、生成参数与每个 copy-in 组件的来源（原样/改动 diff），与源码同批提交；装配审依赖变更但不代取件。运行时不联网；Phase 0 实测 CLI 是否提供 base-nova（R8），不可用即回 PM。
**依据**：提案 §3.2/§7.2、R12。

### Q4 组件目录、台账与守卫归属

**结论**：copy-in 组件放 `app/renderer/src/components/ui/`（桌面UI）；台账放桌面UI 的 `docs/feature/ui-components.md`（桌面UI 的 `docs/feature/` 已授权）；守卫按归属拆分——跨仓库的依赖宪法/禁入清单/`npm ls` 守卫放 `test/测试/`（测试），渲染源码级守卫（无裸色值、无手绘 SVG、无 Node import、无 `src/` import）放进桌面UI 的渲染测试（扩展既有文件或 `test/桌面UI/`，取决于边界更新）。
**调整点**：提案建议「守卫测试由测试角色维护、桌面UI 配合」只适用于跨角色规则；源码级守卫由桌面UI 自己维护更可持续。

### Q5 测试迁移与「双端等价」判据

**结论**：五个套件全部保留：
- `main.mjs`（桌面窗口）：整机自检继续跑；新增目标切换，Phase 5 验证新入口。
- `uiux-v2.mjs`、`ime-enter.mjs`、`uiux-design-audit.mjs`（桌面UI）：原样保留断言；增加目标切换（环境变量），新渲染器需满足同一 check 名。
- `bench-storm.mjs`（桌面UI）：作为基准台而非通过/失败套件；先固化旧基线，Phase 3 前由测试定义「不劣化」阈值。
源码子串守卫的翻译顺序：**先补行为断言/机器守卫，再删对应源码守卫**；禁止一次性删除整份 `renderer.test.ts` 后再补。IME 项数：以套件实际 check 为准，Phase 3 前重锚并记录；「26 项」不与现有套件冲突时不作为独立判据。双端证据由测试按套件输出逐 check 名对照，记录到 Phase 5 验收材料。
**依据**：§2.5 的实际套件读数（未运行）。

### Q6 组件级测试的运行方式

**结论**：见 §2.3。单元测试只测纯逻辑 `.ts`（无 JSX、无 DOM）；DOM/组件行为由真实 Electron e2e 覆盖；不引 vitest，不引测试侧转译加载器。`node --test` 的 TS 擦除不能处理 JSX，这是机制事实，不靠配置绕开。jsdom + testing-library 保留为已批准的**备选**，仅在出现无法拆分且 e2e 无法覆盖的场景时由 PM 逐项批准。
**依据**：package.json 脚本、Node 类型擦除行为、根 tsconfig 的 import 包含规则。

### Q7 严格 CSP 与 dev/prod 差异

**结论**：生产 `index.html` 保持现有严格 meta，构建后静态断言无内联脚本/`unsafe-*`；dev 通过 Vite 插件的 `apply:'serve'` 放宽（或 dev 无 meta），构建时注入严格策略；`modulePreload.polyfill=false` 并断言构建产物无内联 polyfill。`index.html` 的改动归桌面UI；桌面窗口在 Phase 5 确认打包载入路径与 CSP 行为。**额外门**：Phase 1 实测 `file://` 下 Vite 模块产物能否加载（§2.1）；失败按既定回退处理。
**依据**：index.html 当前 meta、Vite 构建产物形态（未运行）。

### Q8 zustand 的边界评审

**结论**：批准「仅投影 + 视图状态，主进程唯一权威」。在 Phase 2 前冻结允许的切片：项目/角色列表投影、当前选择（角色/引擎/右栏 tab）、按角色的事件/历史行投影、待确认卡与队列的只读投影、纯视图偏好（左栏宽度/收起，沿用现有 localStorage 键）。禁止：任何边界判定、任何治理事实的持久化、任何把「卡已批准」写入 store 的路径、任何绕过 IPC 的写入。行/卡投影必须来自主进程事件，store 不推导治理结论。**待办**：门禁引擎与桌面窗口的只读评估需在各自固定上下文给出（本评审未代填）；未收到评估前，切片清单不得视为冻结。
**依据**：提案 §7.1、architecture.md 的判定归属。

### Q9 Markdown 集成形态

**结论**：改为 npm `markdown-it@15.0.2` 精确版本 + `@types/markdown-it`，删除 vendored UMD；保留全部受控渲染配置并迁移为 TS 封装；XSS 负例先全绿再删 vendor；`markdown.test.ts` 的文件 sha256 pin 改为版本 + 锁文件断言。Phase 3 随聊天流迁移一并完成。理由见 §2.7。归属：封装与测试归桌面UI；依赖落盘归装配。
**依据**：vendor README、markdown.test.ts 的 pin 结构、Vite 模块图。

### Q10 虚拟滚动移植的验收面

**结论**：移植行模型、`rowGap` 口径、锚点物化、底部跟随、惰性挂载；保留 `rowModelDebug` 同义字段（`count/lastIndex/operators/rowGap`）供 e2e；`rowGap` 修复（脱离文档 pane 的缓存问题）必须在 React 实现中保持。U1 偶发项：以「同一时段旧渲染器基线是否复现」判定，不在新渲染器上单独放宽。阈值与采样数量由测试在 Phase 3 前书面定义。
**依据**：renderer.js 行模型与 2026-10-14 拆分记录。

### Q11 预算度量与执行点

**结论**：React/react-dom **计入** ≤12 口径；按此现有清单为 10 个运行时库（React、react-dom、@base-ui/react、lucide-react、motion、react-resizable-panels、zustand、clsx、tailwind-merge、class-variance-authority），dnd-kit 安装后为 11；构建工具、类型包与「从 vendor 改为 npm 的 markdown-it」不计入新增。度量：构建后入口 HTML 实际引用的 JS+CSS（`<script src>`、`<link rel=stylesheet>`、`<link rel=modulepreload>`）分别 gzip 求和 ≤300KB；由装配的构建脚本输出数字、测试守卫在 Phase 5 复核。Phase 2 报告不阻断、Phase 5 阻断；超标时交 PM 与客户裁定，不静默放宽。
**依据**：提案 §4.4、Vite 产物结构（未运行）。

### Q12 过渡窗口与切换权

**结论**：切换由 PM 在收齐「测试双端等价证据 + UIUX 视觉确认 + 产品复核 + 客户验收」后宣布；「阻断缺陷」定义为：崩溃/数据丢失、治理卡无法确认或拒绝、IME 误发/无法发送、越界提示失真、打包冒烟失败——由桌面UI 修复，争议由 PM 裁定，测试复验。旧渲染器在 Phase 5 一次性下线，旧文件随同批变更删除，Git 历史即归档；不另建归档目录（与 `角色卡/桌面应用` 的历史归档场景不同，那是角色目录）。
**依据**：A8、既有角色拆分归档惯例。

### Q13 图标守卫与豁免

**结论**：功能性图标全部 `lucide-react`，包括窗口控制（最小化/最大化/还原/关闭）与空态插图（用 lucide 对应图形）；品牌字标 `ANS` 是文字（`<span>`），不属 SVG 守卫对象；应用图标 PNG 不在渲染层守卫范围。豁免清单由 UIUX 在 Phase 0 给出，初始应为空；确需保留的手绘资源逐项登记理由与来源。
**依据**：index.html/renderer.js 的 SVG 现状、提案 §7.4。

### Q14 发布与 CI 的接入批次

**结论**：**不在 Phase 1 接入 release**（M1）。v1.4.0 冻结源 + overlay 白名单使 `build:renderer` 无法加入；接入放在 Phase 5 之后的**下一次冻结源/新发布轮**：新源包含 Vite 工具链与渲染器后，release.yml 在 `npm ci` 后构建渲染层，`release-verify` 断言 dist 入口与冒烟。是否新建通用 CI（如 `.github/workflows/ci.yml`）是客户可选决策，需 Team Formation 给装配新增边界；本轮建议不建。
**依据**：release.yml、release-policy.mjs、release-verify.mjs。

## 七、风险与缓解

| # | 风险 | 表现 | 缓解 | 验证点 |
| --- | --- | --- | --- | --- |
| G1 | 治理红线回归 | 渲染层出现第二份边界判定、读取 Node/fs、绕过 IPC 写事实 | 机器守卫：渲染源码禁止 `node:`/`require(`/`src/` import；状态矩阵评审；卡回包仍按请求快照校验 | Phase 2–5 每门 |
| G2 | 聊天热路径性能 | React 全树重渲染导致合帧失效、长转录卡顿 | 保留 16ms 合帧/100ms 去抖；按角色 store 切片与行级 memo；虚拟窗口移植；bench 同指标对照 | Phase 3 门 |
| G3 | CSP 与 `file://` 产物 | 生产内联被拦、模块脚本无法从 `file://` 加载 | 严格 meta + 零内联扫描；Phase 1 实测；回退经典单包或自定义协议（回 PM） | Phase 1 首件、Phase 5 |
| G4 | 打包/发布冻结 | 误改 release.yml 导致 v1.4.0 CI 失败 | M1；本轮不改 release；新发布轮统一接入 | 每次发布准备 |
| G5 | 迁移期双渲染器 | 同一缺陷两边修、需求分叉 | A8 有界窗口；阻断缺陷定义；新需求只进新渲染器 | Phase 5 复核 |
| G6 | 组件库供应链 | shadcn 取件不可复现、Base UI API 变动、Radix 混源 | copy-in 源码入仓 + 台账 + 精确锁版 + 禁入清单守卫；Phase 0 实测 CLI | Phase 1/5 审计 |
| G7 | one-shot 一致性 | AI 不读契约、自由发挥 | 五事实源 + 白名单 + 状态矩阵 + 机器守卫 + 黄金样板；每批先过守卫 | 每批交付 |
| G8 | 契约面漂移 | 新渲染器只保 id/aria，e2e 驱动与 class 不兼容 | M2：契约清单 + 驱动兼容 + 目标切换 | Phase 2 清单、Phase 5 双端 |
| G9 | 测试守卫空窗 | 删源码守卫后行为断言未补齐 | 先补后删；删除清单逐项对应新断言 | Phase 1–5 每门 |
| G10 | 预算超标 | React+Base UI+motion 超过 300KB gzip | 按需 import、只 copy 用到的组件、Phase 2 早测 | Phase 2/5 |
| G11 | Markdown 安全路径 | React 封装改坏受控渲染 | 保留 markdown-it + 原配置；XSS 负例先绿再删 vendor | Phase 3 门 |
| G12 | Nova/base-nova 事实偏差 | CLI 不支持或行为与方向记载不符 | Phase 0 实测；不可用回 PM，不硬套 | Phase 0 门 |
| G13 | 依赖重复/双份 | React 进 `dependencies` 导致安装包内重复；重复版本 | devDependencies 归属结论；精确锁版；`npm ls` 守卫 | Phase 1/5 |

## 八、客户审批简报

**评审版本**：产品提案 revision 2（2026-10-21，§十三「项目管理评审响应」）；本评审文档 revision 19。**复审结论：通过**（M1/M2 已落实，见 §1.4）。**阶段进度**：Phase 3 完成（§11.1）；Phase 4 完成（§14.1、§16.1）；**5A 门关闭（pass）**（§20.1）；**5B 门关闭、Phase 5 实施与独立验收完成（范围内 pass，AC1–AC8 全过）**（§22.1）；范围限 macOS 本地离线/本地打包，六类 missing-evidence 未判。

**要解决什么**：桌面界面已获认可，但生产方式仍是 6833 行单文件 + 2086 行叠加 CSS，控件与风格靠手写，AI 每轮产出不一致。提案要用 shadcn/ui Nova × 深色石墨与仅渲染层的 Vite 构建替换生产方式，界面行为、信息架构与视觉基调不变。

**推荐与理由**：方向和六个默认值成立，推荐继续。分阶段替换 + 同一套 e2e 双端等价是唯一能证明「行为不变」的路径；纯 Vite（主进程不构建）、移植现有虚拟滚动、base-nova 都与现有边界和禁入清单一致；把 React 等打包库放 `devDependencies`，安装包不重复携带；markdown-it 改为 npm 精确同版本并删除 vendor，安全和可复现性不降。

**评审结论**：revision 1 曾需修订（两处执行口径），产品 revision 2 已逐条落实，复审通过；方向无需重议。两处修订为：
1. **Phase 1 不能接入 release 流水线**。现行发布绑定 v1.4.0 冻结源，overlay 白名单拒绝 `app/` 变更；加构建步骤会让发布 CI 直接失败。改为下一次冻结源/新发布轮接入，Phase 5 先做本地打包冒烟。
2. **「同一套 e2e 双端等价」要写清契约面**。现有套件依赖 `window.__ansRenderer` 测试驱动、class/data 属性与写死的入口路径，只承诺 id/aria 不足以执行。修订后要求 Phase 2 产出契约清单、新渲染器提供同名驱动、各套件可切换目标。

**受影响角色与成本量级**：UIUX L（Phase 0 规范/状态矩阵/原型）、装配 M（工具链，另加新发布轮）、桌面UI L（实现主体）、桌面窗口 S（Phase 5 入口切换）、测试 M（双端证据/守卫/基线）、产品 S（revision 2）、Team Formation S（边界）。无日历工期承诺。

**主要风险**：治理红线回归、聊天热路径性能、`file://` 模块加载与严格 CSP、发布冻结、双渲染器过渡、组件供应链、one-shot 一致性。均有对应门禁（§七）。

**未决问题**：具体依赖版本（Phase 1 定）、`file://` 模块加载实测（Phase 1 首件）、base-nova CLI 实际可用性（Phase 0）、zustand 切片冻结需门禁引擎/桌面窗口只读评估（Phase 2 前）、IME 项数重锚与 bench 阈值（Phase 3 前）、新发布轮时间（Phase 5 前后客户决定）。

**批准范围（精确到阶段）**：
- 批准：方向、六个默认值、Phase 0 设计工作、Phase 1 工具链（按 M1 修正：不含 release 接入）、Phase 2–4 按阶段门推进。
- 条件：产品先出 revision 2 落实 M1/M2；Team Formation 先更新装配边界（`vite.config.ts`）与桌面UI 新测试目录；每阶段门通过后才进入下一阶段。
- 不批准：本轮接入/改动 v1.4.0 发布流水线；一次性重写；引入 vitest/TanStack Virtual/electron-vite/Radix 混源；把渲染库放进 `dependencies`；跳过 Phase 0 观感门直接初始化 `components.json`；未经新评审扩大边界或新增依赖类别。

## 九、后续动作建议（派发顺序）

1. **产品**：出 revision 2，只改 M1/M2 涉及条目（Phase 1 产出、Phase 5 口径、A5、Q5/Q14），S。
2. **ANS Team Formation**（并行）：更新装配 Section 1（`vite.config.ts`）与桌面UI 测试目录；同步 `boundary.yaml`/`boundary.md`；客户确认边界变更，S。
3. **UIUX设计师**（并行）：Phase 0 规范、令牌映射、组件清单、状态矩阵、关键屏原型；安排客户观感门，L。
4. **测试**（并行，只读）：固化旧渲染器 e2e/bench 基线，准备依赖宪法守卫方案，S。
5. **装配**：Phase 1 工具链（Vite/Tailwind/依赖/scripts/tsconfig/gitignore；`file://` 加载首件验证；预算与 `npm ls` 脚本），M。前置：步骤 1、2 完成。
6. **桌面UI**：Phase 2（骨架 + 契约清单 + 测试驱动）→ Phase 3（聊天流）→ Phase 4（资料与设置），每阶段门由测试独立复核；Phase 2 前置：Phase 0 观感门 + Phase 1 通过，L。
7. **桌面窗口**：Phase 5 入口切换（及可选 dev 便利分支），S；若 Phase 1 的 `file://` 验证失败并选择自定义协议回退，提前到 Phase 2 前评估，M。
8. **测试 + PM**：Phase 5 双端等价、切换复核与客户验收；新冻结源发布轮另行决策。

**当前进度（2026-10-21）**：Phase 3、Phase 4 完成；5A 门 pass；**5B 门关闭；Phase 5 实施与独立验收完成（范围内 pass，AC1–AC8 全过）**。最终候选 HTML `3c4da2a2…`/JS `f568e2aa…`/CSS `76fad7ce…`，本地包 `edeeef19…`（406,507,281B），生产入口唯一 `dist/index.html`，旧渲染器/vendor/旧测试已删。范围限 macOS 本机离线夹具/本地构建/本地打包；六类 missing-evidence（真实模型/网络/.env、Windows/DPI/屏读、签名/公证/安装器、发布流水线与 CI、Linux/其他平台、真实主进程通道/真实引擎会话）**未判、不得写成已通过**。非阻塞遗留：`.ti-badge` 死 CSS、CSS 85B 说明、rg 环境红、UIUX 证据位置、产品时点措辞、提供方 manifest。PM 未自我验收；验收通过不授予提交/推送/合并/部署/发布/签名；客户发布决定另行。不得把范围内 pass 写成全平台/全环境通过。

## 十、Phase 3 门裁定（2026-10-21）

**裁定依据**：测试角色的 [Phase 3A 独立验证报告](../../../测试/docs/change/2026-10-21_change_phase3a-independent-verification.md) 与其[证据目录](../../../测试/docs/change/2026-10-21-phase3a-verification-evidence/)、[UIUX Phase 3A 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase3a-review.md)（3A2 pass）、桌面UI 的 [Phase 3A 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3a-chat.md)、[契约面清单](../../../桌面UI/docs/feature/ui-contract-surface.md) 与 bench [阈值预注册](../../../测试/docs/change/2026-10-21-phase3a-verification-evidence/bench/00-threshold-preregistration.md)。本裁定只读核对上述材料，未重跑测试、未改代码。

**总体裁定：Phase 3A（聊天流核心）子门放行（pass）；Phase 3 整体门尚未完成。** 3A 的聊天流核心、虚拟窗口、状态、operator 锚点、IME、Markdown 安全与 3A2 设计对齐已达到可进入 3B 的质量；但提案 §六 Phase 3 所列的确认/恢复/审批卡族、shell 卡、停止本轮、完整附件 UX 等仍属 3B，Phase 3 不得据此标记完成。**全量双端逐 check 名等价仍是 Phase 5 切换判据**；Phase 3 只对照本阶段范围内的 check 子集。

### 10.1 裁定点一：Phase 3 门口径

**接受狭义 Phase 3 门，双端全量对照后移 Phase 5。** 具体口径：

- **Phase 3 必须通过的检查**：`ime-enter` 新入口 24/24 且 check 名与旧端同名（「26 项」未被仓库证据核实，以套件实际 24 名为准，沿 Q5）；operator `toolCallId` 锚点冒烟；`bench-storm` 按本裁定 §10.3 的阈值；新纯逻辑单测 18/18；旧基线 679/679；typecheck/build/CSP/预算；3A2 冒烟 12 组与 UIUX 3A2 pass。
- **`uiux-v2` 在 Phase 3 只对照 3A 范围内已实现的 check**：默认段前 8 项（工具组折叠、失败/未放行直显、助手原文、写入语义、拒绝目标/unknown 计数）与 toolfold 段前 12 项布尔检查。默认段第 9 项「one independent work list without duplicated role documents」依赖工作概览/队列抽屉（3B/4 未实现），**不是 3A 缺陷**；其余 90+ 项随 Phase 4/5。
- **全量双端逐 check 名对照**（含 `main.mjs` 整机自检）在 Phase 5 执行；Phase 4 完成后逐步扩大对照段。这不是放松 M2：契约面清单、同名驱动、目标切换仍是硬要求，只是把「全量等价」的时点放回切换门。
- **check 清单台账（3B 派发前置）**：测试角色须把实际报告整理为四类并附 check 名，不能只给计数——A 本阶段范围内双端通过；B 因功能未实现而按阶段延期（注明阶段与属主）；C 既有基线红（单独登记，不计新红）；D 新渲染器独有/旧端不适用。台账存入 Phase 3 门记录，PM 复核后随 3B 派发。
- 提案 revision 2 §六 Phase 3 行含「双端逐 check 名对照通过」，按本裁定解释为**Phase 3 范围内子集**；产品可在下次修订同步文字，不影响本裁定生效。

### 10.2 裁定点二：toolfold 尾部折叠锚点

**不阻塞 3B；登记为既有基线红，作为 3B/5 收敛项。** 事实：同一检查在旧入口也失败（150→182，Δ=32px > 20px），新入口 150→201，Δ=51px > 20px；即该检查不是 3A 新引入的红，但新入口比旧基线差 19px。

- **登记**：写入 C 类既有基线红，附旧/新 Δ 与阈值 20px；Phase 3 不以该检查判 3A 失败。
- **收敛责任**：桌面UI 在 3B 或 Phase 5 前修复，测试复验；不得把它留到切换后。
- **Phase 5 判据**：同一环境下新入口 Δ ≤ 旧基线 Δ（32px）；若旧端仍为红，新端可以同红（双端同值）或转绿（≤20px，记录为改进差异），但**新端不得更差（>32px）**，也不得用放宽断言换绿。目标值 ≤20px 是收敛目标，不是切换阻断条件；**新 Δ 大于旧基线（如当前 51>32）不得进入切换**。

### 10.3 裁定点三：bench 阈值

**批准测试的预注册口径，并补充离群与重基线规则。** 最终规则：

1. **预热**：每个目标在测量会话中的首轮为预热，不计入统计，但原始值必须保留；有效测量每目标 **≥3 轮**，同机、同 Electron、新旧交替。
2. **主阈值**：`stormA/stormB.maxGap` 新中位 ≤ max(旧中位, **25ms**)；`stormA_handler.maxMs`、`stormB_handler.maxBatchMs`、`replay.replayMs`、`scrollToBottom.ms` 新中位 ≤ max(旧中位×1.2, 旧中位+5ms)。
3. **离群护栏**：有效轮次中 **p95 ≤35ms**，且**单轮不得 >50ms**（长任务红线）。
4. **本次证据适用**：新入口首轮 43.2ms 按预热排除后，其余 5 轮 stormA 为 18.0/18.0/25.1/18.6/22.8（中位 18.6、p95≈25.1、单轮最大 25.1），满足主阈值与护栏；旧端按同规则保留有效轮次，25ms 下限仍成立。handler/replay/scroll 中位规则已通过。**Phase 3 判定：通过。**
5. **重基线**：3B 任何聊天热路径变更后，必须按同一规则重跑并重新记录；旧端同日在同机重测，不得拿旧日数据比较。若 3B 后超标，按新证据回 PM，不得回溯修改本轮阈值。
6. 不采用「每轮 ≤25ms」：该要求会把正常的单轮抖动当回归；单轮上限用 50ms 长任务红线，分布用中位 + p95 表达。

### 10.4 裁定点四：大工具组懒挂载的 DOM 契约例外

**批准为唯一、限定范围的已登记例外。** bench 优化对「同一轮 >40 个调用且默认折叠」的工具组延迟挂载明细；旧渲染器对闭合组始终挂载。现有 e2e 没有任何断言在闭合大组内部取行（最大夹具 12 调用），故当前套件不受影响。

- **例外边界**：仅 `>40` 行且闭合的大工具组；摘要、失败/未放行计数与直显必须保持；展开后明细立即挂载；**≤40 行的小工具组保持旧契约（闭合也挂载）**；新开/运行中的组按既有展开语义挂载。
- **登记**：桌面UI 在 `ui-contract-surface.md` 登记常量 `DEFER_TOOL_ROWS_WHEN_CLOSED=40`、行为、理由与测试规则「查询闭合大组内部行前必须先展开」。
- **补正向覆盖**：不能只靠豁免。测试角色须新增一个检查（3B 或 Phase 5 前）：闭合 >40 行组内部活动行 **0**、摘要计数/异常可见；展开后内部行挂载且内容正确；再次折叠/滚动后状态稳定。该检查在新端可为新增 check（旧端不要求存在）。
- **唯一性**：这是本轮批准的唯一 DOM 契约例外；再出现其他 DOM 差异须另行报 PM，不得在套件适配中静默扩展。

### 10.5 Phase 3B 派发前置与范围约束

**前置清单（全部完成后派发 3B）**：
1. 测试角色产出 §10.1 的 A/B/C/D check 清单台账，附 check 名与阶段归属；PM 复核。
2. C 类既有基线红登记完成：toolfold 尾部锚点（旧 32/新 51）与旧入口 `expired old shell shown disabled in its own runtime`；不把旧红算作 3A 新红。
3. 桌面UI 在契约面登记 §10.4 例外，并给出「展开后挂载」的实现确认；测试安排上述正向检查。
4. bench 规则与本次原始数据入 Phase 3 门记录；3B 重基线计划明确（同机、同日、预热排除、≥3 轮）。
5. UIUX 3A2 pass 已满足；3B 的卡族仍须 UIUX 复核。

**范围约束**：
- 3B 只做提案 §六 Phase 3 剩余项与桌面UI 未实现清单中标注 3B 的项（确认/恢复/审批卡族、真实 shell 卡、停止本轮、完整附件 UX 等）；**不得为了通过 `uiux-v2` 第 9 项把工作概览/队列抽屉、设置/资料等 Phase 4 项拉进 3B**。
- 旧渲染器零改动；`app/main.ts`、preload、`app/desktop/` 零改动；不改发布流水线；不新增依赖除非经 PM 四问批准；不弱化既有断言；不新造 DOM 契约例外。
- 3B 通过后，Phase 3 整体门才算完成；Phase 4/5 仍按原计划。任何「全量双端等价」结论只允许由 Phase 5 的逐 check 名证据得出。

### 10.6 3B 前置复核与放行（2026-10-21）

**复核输入**：测试角色的 [A/B/C/D check 名台账](../../../测试/docs/change/2026-10-21_check-ledger-phase3a.md)、[延迟挂载正向检查](../../../../test/测试/phase3a-lazy-toolgroup-check.mjs)（证据[目录](../../../测试/docs/change/2026-10-21-phase3a-verification-evidence/lazy-toolgroup/)）、[Phase 3A 报告](../../../测试/docs/change/2026-10-21_change_phase3a-independent-verification.md)（§7.3 更新）、桌面UI [契约面 §七](../../../桌面UI/docs/feature/ui-contract-surface.md)。复核只读报告、脚本与证据，并用脚本比对 old/new `uiux-v2` 报告的名字与值；未重跑 Electron。

| 前置 | 结论 | 复核依据 |
| --- | --- | --- |
| A/B/C/D 逐名台账 | **满足** | A：45 具名 check + 7 项门禁级；B：82 个 uiux-v2 具名（B1 1 + B2 81，已核 B2 代码块 81 行），另列 3B 6 个、Phase 4 5 个功能面与属主；C：2 红含属主与 Phase 5 判据；D：30 冒烟 + 10 延迟挂载，唯一新增 39，D2 含脚本路径。未用计数代替名单 |
| C1 判据 | **清晰、未放宽** | 台账与 §10.2 一致：旧 Δ=32、新 Δ=51、阈值 20；Phase 5 新 Δ≤32、目标≤20，当前 51>32 不得切换；属主桌面UI（3B/5） |
| §10.4 契约面登记 | **满足** | 契约面 §七登记 `DEFER_TOOL_ROWS_WHEN_CLOSED=40`、精确条件、摘要/失败直显保持、展开即挂载、≤40 保持旧契约、测试规则「查询闭合大组前先展开」及实现确认 |
| 延迟挂载正向检查 | **满足（10/10）** | `report.json`/`run.log`：闭合 >40 组内部活动行 0、摘要「45 个调用…含 1 条未放行」、`.sys-denied` 直显；展开 45 行且首/末/拒绝相位正确；再折叠 0；160 行前置正文离屏后回窗仍闭合、摘要完整、再展开 45；≤40 三调用小组闭合仍挂载 3 行；零 console |
| bench 规则与数据 | **满足** | 规则与原始数据见 §10.3、预注册与 `bench/` 证据；3B 重基线要求见下 |

**交叉核对结果**：old/new `uiux-v2` 报告逐名比对——A2 的 8 个默认段检查双端均 true；A3 的 12 个 toolfold 检查双端均 true；C1 双端均 false；C2 旧端 false。A1 的「旧端同名」由「e2e 仅加目标切换、断言未改」保证（本轮未单独跑旧端 ime，属结构性同名，可接受）。D1 的脚本路径可在测试报告 §六与证据索引追溯；台账正文建议补一行（非阻塞）。

**放行结论：Phase 3B 派发放行（pass），无剩余前置。** 以下为随 3B 交付的**不变约束**（不是派发阻断）：

1. 3B 完成后按 §10.3 同机同日重基线（预热排除、≥3 轮、p95 ≤35ms、单轮 ≤50ms），结果纳入 3B 门证据。
2. C1 在 3B 尽量收敛，最迟 Phase 5 前达到新 Δ≤32（目标≤20）；未达不得切换。
3. 聊天行/工具组实现变更后重跑 `test/测试/phase3a-lazy-toolgroup-check.mjs`，保持 10/10 与例外边界。
4. 3B 不得扩围到 Phase 4（工作概览/队列、设置/资料）；不得改旧渲染器、`app/main.ts`、preload、`app/desktop/` 或发布流水线；不得新增 DOM 例外或依赖（除 PM 四问批准）；不得弱化断言。
5. Phase 3 整体门在 3B 通过后才完成；全量双端等价仍在 Phase 5。

**台账完善项（非阻塞，随 3B 测试更新）**：D1 补脚本路径一行；A1 备注「同名由未改断言的同一脚本保证」。不影响本次放行。

## 十一、Phase 3 关闭与 Phase 4 授权（2026-10-21）

**依据**：测试角色 [3B 独立验证](../../../测试/docs/change/2026-10-21_change_phase3b-independent-verification.md) 与 [3B 五项修正聚焦重验](../../../测试/docs/change/2026-10-21_change_phase3b-fix-reverification.md)、UIUX [3B 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase3b-review.md)（needs-work → 5 项修正 → 复核 pass）、桌面UI [3B 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3b-cards-composer.md) 与 [3B 证据](../../../桌面UI/docs/change/2026-10-21-phase3b-evidence/)、[A/B/C/D 台账](../../../测试/docs/change/2026-10-21_check-ledger-phase3a.md)。只读核对，未重跑测试。

### 11.1 Phase 3 整体门：完成（按 §10.1 的范围内口径）

- 3A 子门已放行（§10.6）；3B 范围内 test **pass**、无 needs-work/missing-evidence；UIUX 5 项「Phase 4 前必须」修正后 **pass**。按 §10.5「3B 通过后 Phase 3 整体门才算完成」，**Phase 3 整体门完成**。
- **门禁证据**：干净重建/typecheck/build 通过；gzip9 **241,273B ≤300KB**；CSP 严格、零内联；单测 **33/33**；旧基线 **679/679**；IME **24/24**；延迟挂载 **10/10**；自写离线冒烟 **45/45**；bench 新有效轮 **p95=33.3ms ≤35**、单轮最大 33.3 ≤50（主阈值通过）；`uiux-v2` 新入口 **JUDGE 33/33、G2 5/5、TERMINAL 22/22、TOOLFOLD 17/17**；**C1 收敛 Δ=16px**（旧 32、目标 ≤20）；旧渲染器/`app/main.ts`/preload/`app/desktop/` **零 diff**；3B **零新增依赖**、断言未弱化。
- **Phase 3 已覆盖**：3A 的 listing/角色树、会话开/历史回放、事件路由、虚拟窗口、工具行、状态徽标、operator 锚点、IME、Markdown 安全；3B 的真实 shell/su/恢复确认卡族、judge 结果行与双开关、发送/停止/队列撤回/附件完整 UX、system 行。
- **未覆盖/后移**：全量双端逐 check 名对照与 `main.mjs` 整机自检 → **Phase 5**；真实模型/网络、真实主进程卡通道、打包安装包、Windows/DPI/200% 文字/屏读 → Phase 5/后续真机轮；台账 B 类失败（工作概览/队列抽屉、SEND_FACTS P7、QUEUE_VIEW）→ **Phase 4**；C2 旧入口既有红随 Phase 5 下线退役。
- **C1**：3B 独立报告 §七与 UIUX 复核记录新入口 150→166（Δ=16，非累积），满足 Phase 5 判据与收敛目标。**台账 C1 行仍是 3B 前置时的 51px 快照**，以 3B 报告为准；要求测试在台账下次更新时把 C1 标为「已收敛 Δ=16」（文档同步，不阻塞本关闭）。
- **C2**：旧入口既有红，旧渲染器零 diff、本轮未重跑；随 Phase 5 旧渲染器下线退役，不以新端未跑到该名为由掩盖。
- **文档差异（非阻断）**：桌面UI 3B 记录写「单测新增 16 项、累计 33」，测试报告核实为新增 **15**（累计 33，总量正确），属文字笔误；请桌面UI 在变更记录中更正。gzip 与 bench 数值的实例差异按测试报告为准，阈值未改。

### 11.2 Phase 4 授权（4A / 4B）

**授权 Phase 4 实施，拆为 4A → 4B 两个子门**（默认顺序；并行仅限 PM 已确认写集互不重叠的部分）：

- **4A（引擎、设置与资料/队列）**：真实引擎切换与每引擎会话/历史/草稿（SEND_FACTS P7）；设置（Pi/Codex/Claude 字段、掩码、保存、高级档位）；角色资料抽屉；工作概览；队列抽屉（位次/来源/撤回的 VISUAL 子集；**QUEUE_VIEW 段归 4B**）。
- **4B（治理与回执面）**：治理三权卡/镜像/排队聚合（含 `ANS_QUEUE_VIEW_UI_ONLY` 4 项与 `.op-queue-aggregate`）；治理记录建立/重新接受与迁移预览；报告全文/persistence/delivery 回执；operator 镜像；`replayAnchorDebug`；single 模型切换时刷新一次性警告（3B 观察项）。

**子门口径**：每个子阶段由桌面UI 交付、UIUX 对受影响界面做设计对齐评审、测试独立验证；4A 通过后才进入 4B（或 PM 书面确认可并行的不重叠写集）。**Phase 4 完成不等于全量双端等价**；`main.mjs`、全量逐 check 名对照、入口切换与打包仍在 Phase 5。

**4A 验收面**：台账 B1（工作概览/队列抽屉）、B5（设置/Pi 面板、资料抽屉、引擎选择真实动作）、SEND_FACTS P7；契约面行 #7/#9/#10/#15/#16/#18/#19/#20 的「部分/未满足」转「已满足」；UIUX 状态矩阵与 Nova 规范；不弱化既有断言。**QUEUE_VIEW 不在 4A**（见 §12.1）。

### 11.3 范围约束（4A/4B 共同）

- **只做 Phase 4 项**；不拉 Phase 5（生产入口切换、全量双端、`main.mjs`、打包/发布/安装包）；不把 4B 项提前塞进 4A 或反之；任何扩围先回 PM。
- 不改旧渲染器核心、`app/main.ts`、preload、`app/desktop/`、发布流水线；不新增依赖（除 PM 四问批准）；**不新增 DOM 契约例外**；不弱化/删除既有断言。
- 聊天行/工具组热路径变更后按 §10.3 同机同日重基线（预热排除、≥3 轮、p95 ≤35ms、单轮 ≤50ms）；重跑延迟挂载检查保持 10/10；C1 保持新 Δ≤32（目标≤20）。
- 新测试放 `test/桌面UI/`；e2e 只加目标切换/必要的新检查，不改为新端专用分支；契约面与驱动方法随 4A/4B 更新并留三态表。
- 4A/4B 各自的交付记录须区分「已实现/已验证」与 Phase 5 未验证项，不得宣称全量等价或最终验收。

### 11.4 4A 派发前置

1. 桌面UI 产出 4A 范围与写集清单（文件、驱动方法、契约面行、测试计划），并确认与 4B 不重叠；PM 复核。
2. UIUX 对 4A 界面（引擎/设置/资料抽屉/工作概览/队列）做设计确认：沿用 Nova 规范与状态矩阵，新组件先登记白名单；不引第二设计源。
3. 测试更新台账：C1 标为已收敛 Δ=16；把 B1/B2/B5 映射到 4A、B4/治理/回执映射到 4B，并列出 4A 将新增的 check 名（默认段工作概览、SEND_FACTS P7 等；**QUEUE_VIEW 四项归 4B，不列入 4A**）。
4. 契约面登记 4A 驱动方法与三态目标；不新增 DOM 例外。
5. 确认 4A 无需新增依赖；如确需，先走 PM 四问与精确锁版。
6. 证据计划：独立验证 + UIUX 复核；若动聊天热路径，附 bench 重基线与延迟挂载 10/10。

**授权边界**：本节授权 Phase 4 实施与 4A 派发，不授予 Phase 5 入口切换、发布接入或最终验收；4A 通过后另报 4A 门结论再进 4B。

## 十二、4A 复核与放行（2026-10-21）

**复核输入**：桌面UI [4A 范围与写集](../../../桌面UI/docs/design/2026-10-21_design_ui-platform-phase4a-scope.md)、UIUX [4A 设计附录](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4a-design.md) 与[原型证据](../../../UIUX设计师/docs/design/2026-10-21-phase4a-prototype-evidence/)、测试[台账 §七](../../../测试/docs/change/2026-10-21_check-ledger-phase3a.md)。只读核对，未改实现、未重跑测试。

### 12.1 QUEUE_VIEW 归属：裁 (a)，留 4B

`ANS_QUEUE_VIEW_UI_ONLY` 的 4 个 check 实际断言 `#chat .op-queue-aggregate` 与 `queuedDebug`（operator 排队聚合），属 §11.2 的 4B 面；4A 的队列抽屉只做位次/来源/全文/撤回的 VISUAL 子集。**裁定 (a)：QUEUE_VIEW 留 4B，不扩 4A 写集**——避免 4A 触碰 `chat-store`/`ChatStream` 聊天热路径与 4B 的 operator 聚合。

- 4A 验收不含 QUEUE_VIEW；4A 仍交付抽屉队列（VISUAL 子集）。
- 台账 §7.1 把 `queued baseline shows two` 标为 4A 是映射错误；测试须在 4A 门前把 **QUEUE_VIEW 四项全部移到 4B**，并保留 `queuedDebug` 与 `.op-queue-aggregate` 的区别说明。
- 4B 的排队聚合不得为通过 QUEUE_VIEW 而提前进入 4A；若 4A 实施中发现必须改 operator 聚合，停手回 PM。

### 12.2 4A 范围与写集：批准

**批准**桌面UI 列出的 4A 新文件与修改文件（runtime-config/runtime-view/document-view/work-view、settings/drawer stores、SettingsPanel/ProfilePanel/WorkOverview/QueuePanel/DocumentView、phase4a.css、chat/extensions 与 driver-extensions 机制、测试与冒烟证据），以及修改 `chat/ipc.ts`、`Drawer.tsx`、`ChatHeader.tsx`、`EngineSelect.tsx`、`Composer.tsx`、`test-driver.ts`、`lib/platform.ts`、契约面文档。

条件与澄清：

1. **不修改清单保持**：`App.tsx`、`chat-store.ts`、`ChatRow.tsx`、`ChatStream.tsx`、`events.ts`、`judge.ts`、`confirm-store.ts`、`confirm-logic.ts`、`Sidebar.tsx`、`shell.css`、`main.tsx` 与现有 `components/ui/**` 文件。实施中若发现必须改动其中任一文件，**停手回 PM**，不得静默扩围。
2. **Slider 位置例外**：批准新增 `app/renderer/src/components/ui/slider.tsx`（copy-in 单文件，Base UI Slider，不新增依赖）；「不修改 components/ui/**」按「不修改**现有**文件」执行。若团队坚持零新增，可放 `shell/Slider.tsx`，但需登记；推荐标准位置。
3. **扩展点只建机制**：4A 的 `chat/extensions/`、`driver-extensions/` 只放注册机制与 README，空目录、无 4B 功能、无生产行为；4B 再新增文件，不编辑 4A 文件。
4. `phase4a.css` 独立，不改 `shell.css`；`ipc.ts` 的 runtime 路由只做引用/转发判定，不解析正文、不深拷贝；若缓存开销影响 bench，按范围文档 §六 优化。
5. **驱动方法与契约面属 4A**：`selectRuntime` 真实语义、`openPiPanel/loadPiConfig/savePiConfigFromForm/piKeys`、`state.rightTab` 扩展与契约面 #7/#9/#10/#15/#16/#18/#19/#20 的更新是 4A 门证据的一部分；UIUX §9.2 中「新驱动/契约/守卫」的表述按「4B 增量」理解，不把 4A 必需项推迟。
6. 4A 新建 `docs/feature/ui-components.md` 并登记 Slider、SettingsPanel、ProfilePanel、WorkOverview、QueuePanel、DocumentView（来源/用途/状态矩阵/升级责任人）；4B 追加自己的节。

**写集补正（复核发现的两处边界）**：

- **`Sidebar.tsx` 必须允许最小修改**：UIUX 4A 把设置常驻入口放在左栏底部 `#tab-pi`，并把角色角标改为「当前+排队」；当前新渲染器的 `Sidebar.tsx` 中 `#tab-pi` 是 disabled 演示占位（`title="演示占位：设置未接入（Phase 4）"`），角色徽标也在该文件渲染。原写集「不修改 Sidebar.tsx」与这两项设计冲突。批准把 `Sidebar.tsx` 加入 4A 写集，**仅限**：启用 `#tab-pi`（去演示 title、点击经 drawer-store 打开设置）、角色角标计数按 §12.3 第 1 条、必要的 aria/文案；不改树结构、拖拽/收起/宽度、导入流程。若实现还需改 `App.tsx` 或 `chat-store`，停手回 PM。
- **工作概览「待处理」定位的 4A 深度**：4A 只做**已挂载** operator 卡的基本定位（关闭抽屉 + DOM 滚动/聚焦）；完整虚拟行 locator、键盘 locate、`pending locator` 相关检查属 **4B**（台账 B4）。若基本定位必须修改 `chat-store`/`ChatStream` 才能实现，则整项留 4B，不扩 4A 写集。

### 12.3 UIUX 10 个开放问题：逐条结论

| # | 问题 | 结论 |
| --- | --- | --- |
| 1 | 角标拆分 | **按设计执行**：工作概览角标 = 待确认/待选择数；角色角标 = 当前工作 + 排队。两者都有文字/aria 标签，不靠颜色单独传意；作为已批准的 UI 差异登记，旧合并计数的断言若存在须按「旧→新」记录，不得删除。 |
| 2 | 设置入口 | **只留左栏底部为常驻入口**；缺配提示条的「打开 X 设置」保留为上下文入口；不恢复会话头设置图标。 |
| 3 | 三引擎 Tabs 属 4A | **确认 4A**：设置面板覆盖 Pi/Codex/Claude 三引擎，字段/校验以主进程元数据为准。 |
| 4 | 配置预取 | **4A 不在导入/恢复时预取三引擎**；菜单打开、切换引擎、打开设置、保存成功后按需读取并缓存（可菜单打开时并行读三引擎一次），不得阻塞会话。完整预取/缓存策略优化留 4B。 |
| 5 | 固定 64px 保存条 | **按设计执行**；须真实 Electron 1360/960 与 200% 文字验证，滚动内容留出底部 padding，不得遮住字段；若不可用，4A 内回退为流末保存并复核。 |
| 6 | 跨引擎草稿 | **保留在内存（runtime×role）**：切换角色/引擎/抽屉不丢弃；成功发送、显式移除或切换项目时清除；不做持久化。比「关闭抽屉即丢弃」更保守，避免丢用户输入。 |
| 7 | 队列子视图 | **按设计执行**：工作概览/角色资料内子视图，不新增独立顶栏入口；`#right-queue-body` 唯一。 |
| 8 | 960 抽屉 | **必须真实 Electron 复测**：1360/960 截图、无横向溢出、焦点进入/返回、Esc、inert、200% 文字（可行时）；原型证据不足。若 960 不可读，在 4A 内调整并交 UIUX 复核，不带病过门。 |
| 9 | 切换中菜单 | **按设计执行**：切换时菜单关闭、触发器 `aria-busy`、不重复提交；失败保留新视图并显示配置/会话错误，不自动回退。 |
| 10 | 长队列虚拟化 | **留 4B**；4A 用简单滚动/上限（如前 N 条 + 「查看更多」）避免无界 DOM，不引第三方虚拟库。 |

**Slider 批准**：新增 shadcn/base-nova copy-in `Slider`（复用 `@base-ui/react` slider，无新依赖），仅用于 Pi 的两个 7 档 range；登记台账与状态矩阵，验证 aria-valuemin/max/now、键盘（←→/Home/End）、焦点环、隐藏 input 持规范值；不得出现第二套 slider。

### 12.4 其它确认

- **runtime 持久化**：确认 4A **不新增渲染侧持久化**——默认 Claude；恢复状态/显式会话 runtime 优先；不写 localStorage。主进程 `runtime-selection.json` 仍服务于冷启动/自动派发，渲染侧不得覆盖；若要「记住上次选择」，作为单独产品决定，不在 4A 顺手加。
- **工作概览最近回交深度**：确认 4A 只呈现聊天流现有 handback 行（按真实报告身份去重）；完整报告、persistence、source 文档按钮属 4B；不显示「完整/已持久化」的假状态。
- **依赖与热路径**：确认 4A 零新增依赖（Slider 为 copy-in）；4A 完成后按 §10.3 同机同日重基线、延迟挂载 10/10、C1 Δ=16；`ipc.ts` 路由不得逐事件解析正文/深拷贝，超标按范围文档 §六 优化。
- **C2**：`expired old shell shown disabled in its own runtime` 只作为**旧入口**既有基线红，不作 4A 失败项；**新入口同名 check 仍须独立记录**——若失败，须证明与旧红同因或按新红处理，不得自动豁免/掩盖。

### 12.5 4A 放行结论与门前条件

**放行 4A 实现（pass），无阻塞性派发前置**；实现可立即开始。以下为 **4A 门证据前置**（不阻塞开工，门前必须完成）：

1. 测试更正台账：QUEUE_VIEW 四项移到 4B；C1 标 Δ=16；4A/4B 映射与 4A 新增 check 名清单。
2. 桌面UI/UIUX 完成 Slider 与新项目组件台账登记（含状态矩阵/来源/升级责任人），Slider 仅新增单文件。
3. 契约面登记 4A 驱动方法与三态目标；确认驱动/契约属 4A。
4. 4A 交付证据：独立验证 + UIUX 复核；1360/960 截图；若动热路径，附 bench 重基线、延迟挂载 10/10、C1 记录。
5. C2 新旧入口分别记录；写集若需扩围，停手回 PM。
6. 桌面UI 更新 4A 范围文档：把 `Sidebar.tsx` 最小写集与「工作概览定位 4A 深度」写成与本节一致，避免实施按旧写集拒绝必要改动。
7. UIUX 对齐 4A 设计附录：配置读取时点（不在导入时预取三引擎）与草稿保留口径（内存保留至成功发送/显式移除/切项目）按本节执行，避免文档与实施冲突。

**4A 门口径**：4A 范围内通过即放行 4B；全量双端、`main.mjs`、入口切换与打包仍在 Phase 5。4A 放行不等于 Phase 4 完成或最终验收。

## 十三、4A 实施期裁定（2026-10-21）

**输入**：4A 门禁结果（typecheck/build/CSP、gzip 263,085B、旧基线 679/679、单测 67/67、IME 24/24、懒挂载 10/10、4A 冒烟 67/67、bench p95 19.6、C1 Δ=16；uiux-v2 SELECTOR 26/26、CONFIG 20/20、ROLE_RETURN_FOCUS 9/9、SEND_FACTS 8/8、默认段 4A 项含 `one independent work list without duplicated role documents`）；唯一 RUNTIME 失败子句 `.op-confirm.hidden`；桌面UI 按「停手回 PM」未扩写集。只读核对 `ChatRow.tsx`、旧 `renderer.js::freezeOperatorCard`、`Sidebar.tsx` 与 RUNTIME 断言，未重跑。

### 13.1 ChatRow 最小例外：批准

- **事实**：新 `ChatRow` 对失效 operator 卡仅 `disabled` 未 `hidden`（`app/renderer/src/chat/ChatRow.tsx`，`closed = state !== "open"`）；旧 `freezeOperatorCard` 对 `.op-actions button` 同时 `disabled=true; hidden=true`（`app/renderer/renderer.js` L3376–3387）；RUNTIME 断言 `[data-request-id="pi-old-confirm"] .op-confirm.hidden`，属 4A「每引擎恢复」面。
- **裁定：批准对 `ChatRow.tsx` 的最小例外**。在 `closed` 时隐藏 operator 卡的动作按钮（`op-confirm/op-deny/op-submit/op-cancel` 全部；至少覆盖 confirm/deny），保留 `disabled`、`finalNote`、`aria` 与卡片容器；**只改这一处**，不改 ChatRow 其他行为。与旧 `freezeOperatorCard` 语义一致。
- **要求**：桌面UI 在 4A 变更记录登记「冻结写集例外 + 旧实现依据 + 范围」；重跑 4A 门禁与 RUNTIME 段；UIUX 复核失效卡视觉（无死按钮、原因可见）。该例外不改变 4A 其他冻结文件。
- **不选择**把它归 4B：这是 4A 已承诺的每引擎恢复语义，且一行级修正有旧实现依据；归 4B 会留下已知行为差异并扩大 4B。

### 13.2 judge 结果行跨引擎重放：归 4B

- **裁定：确认归 4B。** `confirm-store` 是 4A 冻结文件；4A 的 judge 结果行只保证当前视图的实时/会话内呈现，**切回时不重放历史 judge 行**。
- **要求**：4A 范围/变更记录与契约面明确写「judge 历史行跨引擎重放属 4B」，不得宣称每引擎 judge 状态完整恢复；4B 经扩展点实现并新增对应 check。若 4A 能在 `runtime-view/ipc.ts` 内不改 `confirm-store` 地补齐，可提前做，但不得为此扩冻结文件。
- **门影响**：4A 现有检查未断言该重放，不阻塞 4A 门；属已记录的范围修正。

### 13.3 C2：同因既有红 + 要求重锚

- **事实**：新实现对失效 shell 卡按 2026-10-18/3B 决定**收起**并在别处如实提示；旧入口该 check 也失败（旧渲染器核心零 diff），结合同一决定按「同因既有红」记录——检查期望（`shown disabled`）与当前批准的收起语义冲突，属期望过期，不是 4A 新缺陷。新入口本轮未到达该 check。
- **裁定：确认按「同因既有红」记录，不作 4A 失败项**；但不得自动豁免新入口同名 check——一旦到达，如实记录值；测试在 4B/Phase 5 前把该 check **重锚到已批准语义**（收起 + 原因仍可见/可追溯）或退役，不能长期保留一个与批准行为冲突的红色期望。

### 13.4 左树双徽标：只保留一种可见计数

- **事实**：`Sidebar` 的状态徽标 `statusBadge(status, queueDepth)` 在标签里带「N 待办」（=队列深度）；同一行又渲染 `.ti-count`（`roleBadgeCount` = 当前工作 + 排队）。两个可见数字语义不同，易误读。
- **裁定：只保留一种可见计数**——`.ti-count` 作为唯一数字徽标（当前+排队），状态标签只表达状态（工作中/空闲/等待你确认/错误，调用 `statusBadge(status, 0)` 或等价方式），队列深度放 `.ti-count` 的 `title`/`aria-label` 与工作概览。与 §12.3 第 1 条「角色角标 = 当前+排队」一致。
- **要求**：4A 在 `Sidebar`（已批准的 4A 写集）内做最小修正，UIUX 复核；若 UIUX 有相反理由，回 PM，不默认双显示。

### 13.5 4A 验证放行结论

**4A 验证：条件放行（唯一阻塞已批准修复）。** 现有门禁与四个 uiux-v2 段、默认段 4A 项均通过；唯一失败子句由 13.1 的最小例外解决。**应用 ChatRow 例外、完成 13.4 单计数修正，并重跑 4A 门禁 + RUNTIME/视觉检查通过后，4A 门关闭，可进 4B。** 13.2/13.3 为已记录的范围修正与测试重锚，不阻塞 4A 门。

**边界**：本裁定只批准上述最小例外与 Sidebar 单计数修正，不重开 4A 写集、不批准其他冻结文件改动；4A 门关闭后 4B 仍按 §11.2/§12 的范围与约束执行。全量双端、`main.mjs`、入口切换与打包仍在 Phase 5。

## 十四、4A 门关闭与 4B 授权（2026-10-21）

**依据**：UIUX [4A 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4a-review.md)（needs-work → M1–M6 修正 → 复核 pass）、测试 [4A 独立验证](../../../测试/docs/change/2026-10-21_change_phase4a-independent-verification.md) 与 [M1–M6 聚焦重验](../../../测试/docs/change/2026-10-21_change_phase4a-fix-reverification.md)、桌面UI [4A 变更/证据](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md)。只读核对，未重跑。

### 14.1 4A 整体门：关闭（pass）

- **4A：pass。** 测试独立验证与 M1–M6 重验均无 needs-work/missing-evidence；UIUX M1–M6 复核 pass；§13.1 ChatRow 最小例外与 §13.4 单计数已落地并被独立复现（失效 operator 动作 hidden、`.ti-count` 唯一数字、状态标签无「待办」）。
- **门禁证据**：typecheck/build/CSP；gzip 约 263–264KB（测试重建 **264,983B**；桌面UI 不同重建实例 263,085–263,904B）≤300KB；单测 **67/67**；旧基线 **679/679**；IME **24/24**；懒挂载 **10/10**；4A 冒烟 **99/99（桌面UI）/ 32/32（测试独立，修正后）**；bench 新有效轮 **p95=18.2ms ≤35**、单轮 18.2 ≤50；C1 **Δ=16**；旧渲染器/main/preload/desktop 零 diff；零新增依赖、零新增 DOM 例外（仅已批准两处）。
- **uiux-v2 新入口**：SELECTOR **27/27**、CONFIG **21/21**、ROLE_RETURN_FOCUS **9/9**、SEND_FACTS **8/8**（P7 每引擎会话关闭）、默认段 **44/45**（唯一 `historical own-template failures direct` 属 Phase 5）、VISUAL **3/4**（唯一报告 source 卡属 4B）、TOOLFOLD **17/17**、RUNTIME **14/15**（唯一 C2 同因既有红）。QUEUE_VIEW 按 §12.1 未运行（4B）。
- **4A 已覆盖**：引擎真实切换与每引擎会话/历史/草稿（含迟到/异引擎不覆盖、SEND_FACTS P7）；三引擎设置（metadata 字段、掩码、保存/失败/晚到、Slider、Tabs 键盘、64px 保存条 1360/960/200%）；角色资料/文档只读（四节、错误/重试/焦点/迟到失效）；工作概览（待处理/当前/排队/最近回交、已挂载卡定位、角标拆分）；队列抽屉与子视图（位次/来源/全文/撤回/成功失败回执、960）；左栏设置入口与单计数；失效 operator 卡隐藏动作。
- **未覆盖/延期**：QUEUE_VIEW/operator 排队聚合、治理三权卡/镜像/聚合、治理记录动作、报告全文/persistence/delivery、operator 镜像、`replayAnchorDebug`、single 警告刷新、judge 跨引擎重放、菜单配置状态文字 → **4B**；`historical own-template failures direct`、全量双端、`main.mjs`、入口切换、打包/Windows/DPI/屏读、真实模型/网络/`.env` 写入 → **Phase 5/真机**；C2 检查重锚 → 4B/5。
- **C2 处理**：新入口 RUNTIME 段到达且 false，旧入口同段同样失败；按 §13.3「同因既有红」记录，不作 4A 失败，4B/5 前重锚到「收起 + 原因可见」语义或退役。
- **文档同步项（非阻断）**：契约面行 8 仍写「选择仅本地演示」，与 4A 真实切换不符，桌面UI 随 4B 同步；3B「单测新增 16/15」笔误仍建议一并更正。

### 14.2 队列子视图 tab 切换观察：非预期，4B 修

队列子视图打开时点击会话头「角色资料」，当前仍保留 `queueView`、抽屉显示队列子视图（标题「角色 · 队列」），**不是预期**。裁定：**任何顶层 tab 切换（工作概览/角色资料/设置/文档）都清空 `queueView`，显示目标 tab 的基础视图**；Esc/返回仍按来源视图语义。4B 修复并新增检查：从工作概览进入队列子视图 → 点角色资料 → 显示角色资料；从角色资料队列 → 点工作概览 → 显示工作概览（不是队列子视图）；抽屉保持打开、标题/焦点正确。

### 14.3 4B 授权范围

**授权 4B 实施**，范围：

- **QUEUE_VIEW / operator 排队聚合**（含 `ANS_QUEUE_VIEW_UI_ONLY` 4 项与 `.op-queue-aggregate`）。
- **治理面**：三权卡/镜像/排队聚合；治理记录建立/重新接受/迁移预览。
- **回执面**：报告全文/persistence/delivery；operator 镜像。
- **驱动与状态**：`replayAnchorDebug`；single 模型切换时刷新一次性警告；judge 结果行跨引擎历史重放（§13.2）。
- **收尾项**：菜单项配置状态文字（设计 §1.4，按需读取/缓存，不导入预取）；C2 检查重锚/退役；§14.2 queueView tab 切换修复；契约面行 8 与 3B 笔误同步。
- **不做 Phase 5**：`main.mjs`、全量双端逐 check、生产入口切换、打包/发布/安装包、真实模型/网络验收。
- UIUX 4A 列出的 4B/5 打磨项（当前引擎点语义、进行中文字、HH:MM、资料待办定位、Drawer × 图标、草稿关闭语义、保存条字号等）可在 4B 顺带，但不作为 4B 门必过；若要纳入门，须在 4B 派发清单中列名。

### 14.4 4B 派发前置

1. 桌面UI 产出 4B 范围与写集清单：明确要改的保留文件（如 `confirm-store`、`chat-store`、`ChatStream`、`App`、`ChatRow` 等）及理由、扩展点用法、与 4A 已交付文件的边界；PM 复核。任何超出清单的改动停手回 PM。
2. UIUX 对 4B 界面做设计确认：治理三权卡/镜像/聚合、报告/持久化/回执卡、菜单配置状态、single 警告；沿用 Nova 规范与状态矩阵，新组件先登记白名单，不引第二设计源。
3. 测试更新 check 台账：QUEUE_VIEW 四项、默认段剩余、VISUAL 报告卡、C2 重锚、judge 重放、queueView tab 切换、菜单状态；列名并标注 4B/5；保留 4A 已通过项作基线。
4. 契约面登记 4B 驱动方法（`replayAnchorDebug`/`governance` 等）与三态行 #12/#13/#17/#19 等；不新增 DOM 例外（除经 PM 单独批准）。
5. 依赖：4B **零新增依赖**；如确需，按 PM 四问提交包名/原因/版本并精确锁版，未批准不安装。
6. 热路径：4B 若触碰 chat-store/ChatStream/confirm-store/ChatRow，完成后按 §10.3 同机同日重基线、延迟挂载 10/10、C1 Δ≤32（目标≤20）、IME 24/24；不弱化断言。
7. 证据计划：测试独立验证 + UIUX 复核；1360/960/200%（适用时）截图；4B 门通过后另报结论，Phase 4 完成；全量双端仍在 Phase 5。

### 14.5 4B 范围约束

- 只做 4B 项；不拉 Phase 5（入口切换/全量双端/`main.mjs`/打包发布）；不把 4B 之外的功能提前实现。
- 不改旧渲染器核心、`app/main.ts`、preload、`app/desktop/`、发布流水线；不新增依赖/DOM 例外；不弱化/删除断言。
- 4B 交付记录区分「已实现/已验证」与 Phase 5 未验证；不得宣称全量等价或最终验收。
- 队列子视图 tab 切换、C2 重锚、judge 重放、菜单状态为 4B 门必过项；UIUX 打磨项按派发清单决定。

## 十五、4B 复核与放行（2026-10-21）

**依据**：桌面UI [4B 范围/写集](../../../桌面UI/docs/design/2026-10-21_design_ui-platform-phase4b-scope.md)、UIUX [4B 设计确认](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4b-design.md)、测试[台账 §八](../../../测试/docs/change/2026-10-21_check-ledger-phase3a.md)。只读核对，未改实现、未重跑。

### 15.1 解冻清单：批准（带边界）

批准 4B 解冻 `chat-store.ts`、`ChatRow.tsx`、`ChatStream.tsx`（仅治理空态/必要 pane 级）、`confirm-store.ts`（judge 订阅/警告刷新/decision 可用性）、`events.ts`（最小 delivery/report 字段），以及范围文档列出的 4A 文件最小修改（ipc/runtime-view/ChatHeader/EngineSelect/drawer/settings/work-view/ProfilePanel/lib-platform/row-model/replay 按需）。

边界：**只做 4B 项，不做 store/行模型重构**；不得改变虚拟窗口、行高口径、工具组折叠/懒挂载、C1 呼吸位、滚动/贴底语义；`App.tsx` 保持冻结（治理状态/预览由 ChatHeader、空态由 ChatStream 承载）；新增 `shell/phase4b.css`，不编辑 `shell.css`/`phase4a.css`；扩展点只经 4A 机制。若实施发现必须改 `App.tsx` 或清单外文件，**停手回 PM**。解冻与范围记入 4B 变更记录与契约面。

### 15.2 治理模型标签：以「三权 · 五角色」为准

**裁定：统一为「三权 · 五角色」**。依据：README v1.4.0 明示「三权 · 五角色」；当前内置治理角色为 liaison/rapporteur/nominator/convener/verifier 五个；`uiux-v2` MIRROR 段的「三权 · 四角色」及其四角色夹具是 verifier 加入前的旧口径，已过期。

- 渲染实现按「三权 · 五角色」固定文案（不从 listing 动态推导，避免夹具差异导致漂移；角色集变化先改 README/设计再改实现）。
- **文件责任**：`uiux-v2.mjs` 属桌面UI 边界，由桌面UI 更新 MIRROR 夹具与断言——加入 verifier、治理组期望 `rapporteur/nominator/convener/verifier`、状态行 `治理模型：三权 · 五角色`，并把「four-role」检查名/描述改为 five-role 或等价；测试角色提出重锚口径并独立复验，**不直接改桌面UI 文件**。
- 不得保留「四角色」双期望；旧断言按新口径重锚，不删除覆盖。

### 15.3 operator 聚合落点：批准

批准用 `chat-store` 行 + `ChatRow` 渲染 `.op-queue-aggregate`（唯一行、trio 主入口、原位更新、`queuedDebug`、切引擎/项目清空、主进程重推重建、expired/呈现后移除）。不改为 pane 级 DOM，不触碰 ChatStream 的行分发/虚拟窗口。

要求：聚合行不可聚焦/无按钮/无请求内容；只信主进程 `operator-queued` 事实；`queuedOperator` 不进 runtime 快照、切回不复活；同一 id 不与可操作卡/镜像重复计数；聚合行不改变行高口径与热路径动画。新增检查覆盖 4 项 QUEUE_VIEW 与 tab 切换清空。

### 15.4 菜单配置状态缓存：批准

批准按需读取/缓存、不导入预取：项目切换/引擎切换/保存成功后读当前引擎；菜单打开只读未缓存/未知项（可三引擎并行一次），已缓存不重复读；per-engine summaries + 版本/项目守卫；状态文字「已配置/缺配置/配置未知/检查中」，不靠颜色单独传意。

要求：保持 SELECTOR 既有「每次切换/提交恰一次读取、当前项 Enter 不重读」断言；新增 `ENGINE_MENU_CONFIG_STATUS_TEXT` 与读取次数检查；菜单展示读 `settings-store`，不新增读取路径；读取失败显示「配置未知」而非「缺配置」。

### 15.5 治理空态/状态行宿主：批准

批准 `#governance-status`/`#governance-preview` 由 `ChatHeader` 承载、空态由 `ChatStream` 承载，不动 `App.tsx`。要求：非模态、唯一、不改变聊天布局/滚动；状态行只显示模型/流程/动作，不自动打开/切换会话；预览零写入、确认才写；`governance-next-step` 只显示状态行；键盘可达；若必须改 App，停手回 PM。

### 15.6 C2 重锚/退役：口径与文件责任分离

- **口径**：测试角色提出重锚（「收起 + 原因可见/可追溯」）或退役方案，PM 批准；新入口到达时如实记录值，不自动豁免。
- **文件**：`uiux-v2.mjs` 属桌面UI，C2 断言的改名/重锚/退役由桌面UI 执行；测试角色独立复验。台账 §8.1/§8.2 的「属主桌面UI」应补成「**口径测试提出、PM 批准；文件桌面UI 落；测试复验**」，避免把测试写成文件写者。
- 4B 门前列名；不得长期保留与批准语义冲突的红色期望。

### 15.7 DELIVERY_NOTE / COMPLETE_FLOW / VISUAL 的 4B 门子集

**4B 必过**（报告/回执/来源/镜像/治理/聚合功能面）：

- `DELIVERY_NOTE` 中与交付注记/报告分类直接相关的项（如 `real ten-call history plus old delivery note...`、`old anonymous delivery event...`、`new actual wire delivery note is full system fact...`、`history rebuild preserves system notes...`）；其余工具/历史/标识项按 4A/5 回归，不新增门。
- `COMPLETE_FLOW` 中 C/P3 报告、持久化、交付、来源文档子集（如 `C source declared result...`、`C source same card once save success...`、`C target safe display copy flags...`、`C target only save updates same original card...`、`C expired original report removes unsafe retry`、`C source report mismatched role...`、`C fallback abort...`、`C disabled live report...`、`C outer ok inner failed...`、`C unreadable report record...`、`C expired material cannot keep old receipt retry...`、`P3 source B documents browsing...`）。
- `VISUAL` 中报告/回执/来源/折叠/去重/冷报告时间子集（如 `V2 source report uses separate layered top...`、`V2 preview is deterministic real summary...`、`V2 report status unknown...`、`V2 report declaration alone cannot fold...`、`V2 true settled folds...`、`V2 late exact turn reply...`、`V2 task request folds...`、`V2 local state refresh preserves...`、`V2 received report shares layered safe report ordering...`、`V2 target batch facts...`、`V2 independent work overview includes own and actual received structured reports`、`V2 work de-duplicates only real report identity...`、`SV13 receiver...`、`cold reports reverse.../sorted.../unknown time...`）。
- `MIRROR` 8/8（五角色重锚后）、`GOVERNANCE_REACCEPT` 5/5、QUEUE_VIEW 4/4、JUDGE 33/33、G2 5/5 回归；治理/镜像/记录/报告新增 check 由测试在 4B 台账定稿。
- **4A 段回归**：SELECTOR、CONFIG、ROLE_RETURN_FOCUS、SEND_FACTS、TERMINAL、TOOLFOLD 保持 4A 基线全绿；4B 触碰聊天行/卡后必须复跑，不因新功能降低标准。

**留 Phase 5**：`main.mjs`、全量双端逐 check、入口切换、打包/发布/安装包、真实模型/网络/`.env`、Windows/DPI/屏读；`COMPLETE_FLOW` 中 A/B/A4/P6/P7 的聊天/设置/文档既有项与 `VISUAL` 非报告项（窗口控制/主题/几何/侧栏/树视口等）；`DELIVERY_NOTE` 的非交付注记工具/历史项。测试在 4B 台账列名定稿，计数不能代替名单。

### 15.8 新增项目组合组件：批准

批准 `GovernancePreviewPanel`、`ReportReceiptBlock`、`GovernanceQueueAggregate`，以及范围文档中的 `GovernancePanel`、`ReportCard`、`DeliveryCard` 等项目组合组件（非 shadcn 原语，零新增依赖）。要求：在 `docs/feature/ui-components.md` 登记来源/用途/状态矩阵/升级责任人；只组合既有 Button/Input/Badge/Separator/ScrollArea/Collapsible/Alert 等；不引第二套 UI/图标/动画/状态库；不修改 `components/ui/**` 现有文件（除非 PM 另行批准）。

### 15.9 依赖、热路径与纪律

确认：4B **零新增依赖**；不新增 DOM 例外（仅已批准两处：延迟挂载 40、失效 operator 动作 hidden）；不弱化/删除断言；触碰 chat-store/ChatStream/confirm-store/ChatRow/ipc 后按 §10.3 同机同日重基线（预热排除、≥3 轮、p95≤35、单轮≤50）、延迟挂载 10/10、C1 Δ≤32（目标≤20）、IME 24/24；旧渲染器/main/preload/desktop 零 diff；报告/交付/镜像卡不改变行高口径、无热路径动画。

### 15.10 4B 放行结论与门前条件

**放行 4B 实现（pass），无阻塞性派发前置**；实现可立即开始。**4B 门证据前置**（门前必须完成）：

1. 测试在台账 §八补全 DELIVERY_NOTE/COMPLETE_FLOW/VISUAL 的 4B 精确 check 名与 Phase 5 分界；计数不能代替名单。
2. 桌面UI 更新 `uiux-v2` MIRROR 夹具/断言为五角色（含 verifier、状态行、组期望）；测试独立复验；不得保留四角色双期望。
3. C2 重锚/退役按 §15.6 的责任分离执行并记录；新入口到达如实记录。
4. 契约面行 #12/#13/#17/#19 及 4B 驱动（`replayAnchorDebug`/`governance`）更新；不新增 DOM 例外。
5. 新组件台账登记；UIUX 状态矩阵/1360/960/200% 复核。
6. 4B 证据：测试独立验证 + UIUX 复核；1360/960/200% 截图；热路径 bench/懒挂载/C1/IME；零新增依赖。
7. 任何清单外文件改动停手回 PM。

**4B 门口径**：4B 范围内通过后 **Phase 4 完成**；全量双端、`main.mjs`、入口切换、打包发布仍在 Phase 5，不得宣称全量等价或最终验收。

## 十六、4B 门关闭、Phase 4 完成与 Phase 5 授权（2026-10-21）

**依据**：UIUX [4B 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4b-review.md)（revision 3：needs-work → 返工 → 200% 收口 → pass）、测试 [4B 独立验证](../../../测试/docs/change/2026-10-21_change_phase4b-independent-verification.md) / [返工重验](../../../测试/docs/change/2026-10-21_change_phase4b-fix-reverification.md) / [200% 收口重验](../../../测试/docs/change/2026-10-21_change_phase4b-200pct-reverification.md)、桌面UI [4B 变更/证据](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md)。只读核对，未重跑。

### 16.1 4B 门关闭、Phase 4 完成

- **4B：pass；Phase 4 完成。** 首轮 needs-work 的两项真红已修复并独立复现：C2「失效 shell 收起 + 原因可见」pass（新增无 authorize 跟随断言）；已答卡 full rebuild 锚点 pass（`opIndex=requestIndex+1`、`conclusionIndex=opIndex+1`、DOM 同节点保留）。FLOW 证据表述已更正：官方段到达 4B C/P3 **5/12**，只读补证副本在跳过 Phase 5 阻断项后 **12/12** 通过，不再声称官方段已到达全部 C 检查。UIUX 4 项与 200% 两项收口均 pass。
- **门禁证据（200% 收口候选）**：clean typecheck/build/CSP；gzip **286,348B ≤300KB**；单测 **96/96**；旧基线 **679/679**；IME 24 基线保持（26 true）；懒挂载 **10/10**；4B 冒烟 **70/70**；bench **p95≤24.7ms、单轮≤24.7ms**；C1 **Δ=16**；旧渲染器/main/preload/desktop **零 diff**；零新增依赖、无新增 DOM 例外（仍两处）。
- **uiux-v2 新入口**：RUNTIME **17/17**、VISUAL **54/54**、QUEUE_VIEW **4/4**、MIRROR **8/8**（五角色：`rapporteur,nominator,convener,verifier`，状态行「三权 · 五角色」）、GOVERNANCE_REACCEPT **7/7**、JUDGE **33/33**、G2 **5/5**；SELECTOR/CONFIG/ROLE/SEND/TERMINAL/TOOLFOLD/FRESH 全绿。C2 重锚后 pass，无四角色双期望。
- **4B 已覆盖**：治理三权卡/镜像/排队聚合；治理记录建立/重新接受/迁移预览；报告全文/persistence/delivery；operator 镜像；`replayAnchorDebug`；single 警告刷新；judge 跨引擎重放；菜单配置状态；queueView tab 切换；C2 重锚。
- **延期 Phase 5**：`DELIVERY_NOTE` 左树身份徽标、`COMPLETE_FLOW` P7 角色树「待选择」文案、默认段官方 `full replay preserves content identity` 虚拟窗口阅读锚点；`main.mjs` 整机自检、全量双端、生产入口切换、打包/发布/安装包、真实模型/网络/`.env`、Windows/DPI/屏读；UIUX 视觉打磨（镜像卡截图、迁移实际回包、治理 flow 四态、聚合 Clock、gp 按钮尺寸、delivery blocked 竖条、报告 details 长文）。
- **五角色重锚**：MIRROR 8/8 以五角色夹具与「三权 · 五角色」状态行通过；旧四角色双期望已删除；C2 与五角色语义一致。C2 检查重锚后的新名与「收起 + 原因可见」契约一致，契约面 #14 文字与实现一致。

### 16.2 Phase 5 授权范围

**授权 Phase 5 实施**，范围：

1. **生产入口切换（桌面窗口）**：`app/main.ts` dev/prod 加载策略（生产 `loadFile` 构建入口；dev 仅非打包加载 Vite server 或构建产物）、生产严格 CSP、packaged smoke；最终入口路径只允许一个并写入契约/提案（优先 `dist/index.html`；若保留 `dist/src/index.html` 须说明并统一 main/e2e/打包冒烟）。
2. **旧渲染器与 vendor 下线（桌面UI）**：删除旧 `index.html`、`renderer.js`、`styles.css`、7 个经典脚本、`vendor/` 与旧渲染器源码守卫测试；**先迁移 XSS 负例与仍有价值的纯逻辑测试到 `test/桌面UI/`，再删除**；e2e 套件保留并改为新入口目标。
3. **Phase 5 既有缺口**：Sidebar 身份徽标（identity 在 data/aria，无重复第三行可见徽标）、P7 角色树「待选择」文案、虚拟窗口阅读锚点 `full replay preserves content identity`。
4. **全量双端逐 check 对照**：`uiux-v2`、`main.mjs`、`uiux-design-audit`、`bench`，在旧渲染器删除前完成旧/新快照与逐名对照；允许差异须列「旧名→新名/旧值→新值/批准依据」。
5. **本地打包/真实 Electron 冒烟**：electron-builder 本地打包、真实 Electron 加载新入口、preload/IPC/窗口/首屏冒烟；不接发布流水线。
6. **最终 UIUX 视觉审计**：1360/960/200%、治理/镜像/报告/回执/队列/设置等关键面，与旧基线对照；无新设计源。
7. **装配构建/release 本地准备（M1）**：`build:renderer` 先于本地打包；electron-builder 覆盖 dist；**不改 `.github/workflows/release.yml`、`release-policy.mjs`，不接发布流水线**；下一次冻结源/新发布轮由客户决定。
8. **不做**：发布流水线接入、签名/公证、Windows/DPI/屏读最终验收（除非另获证据）、真实模型/网络/`.env` 的生产验证（见 §16.5）。

### 16.3 Phase 5 顺序（5A → 5B，硬顺序）

- **5A 对照与准备**：旧渲染器仍为生产默认；完成全量双端快照/逐名对照、补齐三项缺口、`main.ts` dev/prod 实现（生产仍可暂不切换）、本地打包 dry run、最终 UIUX 审计计划；测试独立验证。**5A 门通过前不得删除旧渲染器/旧测试/vendor。**
- **5B 切换与下线**：切换 `main.ts` 生产入口到构建产物；删除旧渲染器/vendor/旧测试；新入口全量套件、packaged smoke、最终 UIUX 审计、装配本地 release 准备；测试独立验证。
- **Phase 5 门**：5A + 5B 均通过；随后交独立验收角色（§16.5）。全量双端证据以 5A 快照为准，5B 删除后不得再声称旧端可复跑。

### 16.4 Phase 5 派发前置与角色写集

- **桌面窗口**：先定最终入口路径并记录；提交 `app/main.ts` 与 `app/desktop/`（packaged smoke）写集、dev/prod 策略、CSP 方案、`main.mjs` 目标调整；不改 `preload.cjs` 除非新增 IPC 且经 PM/契约评审；生产不放宽 CSP。
- **桌面UI**：提交 Phase 5 写集与删除清单（旧源码/旧测试/vendor），先给 XSS/纯逻辑迁移计划；三项缺口实现；e2e 目标改新入口；契约面最终更新；1360/960/200% 证据；热路径变更按 §10.3 重基线、懒挂载 10/10、C1、IME。
- **装配**：本地 `build:renderer` + package 顺序、dist 被 electron-builder 覆盖、本地 verify；不改 release.yml/release-policy（M1）；新冻结源发布轮另行客户决策。
- **测试**：全量双端对照计划（旧快照、新跑、逐名 diff、允许差异清单）、删除前快照、5B 新入口全量、packaged smoke、证据索引；不弱化断言；独立验证。
- **UIUX**：最终视觉审计计划（关键面/三档/旧新对照），审计结论；不新增设计范围。
- **产品**：最终产品面复核（轻量）；不新增功能。
- **Team Formation**：预计无新边界；如出现根级新文件/新目录，先交 Team Formation。
- **独立验收**：见 §16.5，标准必须先于 Phase 5 交付固定。

### 16.5 最终验收安排

- 本项目已有 **独立验收角色**（`角色卡/独立验收/`），其职责是先固定验收标准、再对候选与原始证据判断 pass / needs-work / missing-evidence；**项目管理不自我验收**，测试与 UIUX 结论只是证据，不是最终判断。
- 该角色当前固定任务为 ANS-PERMISSION-REPAIR D3；UI 平台 Phase 5 需由主上下文/统筹在**新的独立验收上下文**中立项，先写 Phase 5 验收标准（候选身份、覆盖范围、证据要求、允许差异），再在 5B 后判断。未启动该上下文前，Phase 5 只能记为「实施完成、待独立验收」，不得宣称最终完成。
- **Phase 5 证据不等于真实模型/网络、Windows/DPI/屏读验证**：这些须由验收标准明确纳入或另列 missing-evidence；不能用 macOS 离线/本地打包结果代替。客户发布/上线决定与验收结论分开。

### 16.6 Phase 5 约束

- 只做 Phase 5 范围；不接发布流水线（M1）、不改 release.yml/release-policy；不新增依赖/DOM 例外；不弱化断言；不改旧渲染器/main/preload/desktop 超出本阶段写集；不提前删除旧渲染器（5A 前）。
- 全量双端对照必须先于删除；允许差异逐条登记；新端不得比旧端更差（含 C1、bench、IME、lazy、gzip、CSP）。
- Phase 5 完成 → 独立验收；验收通过不授予提交/发布/部署权限；客户发布决定另行。

## 十七、Phase 5A 复核与放行（2026-10-21）

**依据**：桌面窗口 [5A 入口方案](../../../桌面窗口/docs/design/2026-10-21_design_ui-platform-phase5a-entry-scope.md)、独立验收 [AC1–AC8](../../../独立验收/docs/design/2026-10-21_design_ui-platform-phase5-acceptance.md)、桌面UI [5A 写集/删除/迁移](../../../桌面UI/docs/design/2026-10-21_design_ui-platform-phase5a-scope.md)、装配 [本地构建/打包](../../../装配/docs/design/2026-10-21_design_ui-platform-phase5a-build.md)、测试 [全量双端计划](../../../测试/docs/design/2026-10-21_design_ui-platform-phase5-test-plan.md) 与 [套件清单](../../../测试/docs/design/2026-10-21_phase5-suite-inventory.md)、UIUX [终审计划](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5-visual-audit-plan.md)。只读核对，未改实现、未重跑。

### 17.1 最终入口：批准方案 A（`dist/index.html`）

批准最终入口 **`app/renderer/dist/index.html`**。5A 生产仍加载旧 `app/renderer/index.html`；5B 同批完成：桌面UI 删除旧入口并把 `app/renderer/src/index.html` 移至 `app/renderer/index.html`（内容逐字、`/src/main.tsx` 相对 root 仍有效）、装配把 Vite `rollupOptions.input` 指向根 `index.html`（或删除 input 用 root 默认）、桌面窗口把唯一常量/`main.ts`/`main.mjs` 默认切到 `dist/index.html`、桌面UI 各 e2e/bench/design-audit 默认目标同批翻转。**5B 原子顺序**：删旧+移源 → 改 Vite input → build → 切 main.ts 常量 → main.mjs/套件默认 → packaged smoke；任一步失败停住，不切默认。最终路径写入契约面与提案，AC1 按方案 A 判定，不再保留 B 的双路径。

### 17.2 `app/desktop/renderer-entry.ts`：批准

批准新增 `app/desktop/renderer-entry.ts`（桌面窗口，`app/desktop/` 目录授权内）：只含路径事实与 `resolveRendererEntry`，只用 `node:path`，无 Electron/IPC/业务。5A 两个常量（生产旧入口、构建 `dist/src/index.html`），5B 收敛为一个；`main.ts`、`main.mjs`、packaged smoke 全部经它解析，不得再写死字符串；`ans-wiring`/source guard 钉住。**验证点**：确认 `main.mjs` 在 Electron 44/Node 24 下可 import `.ts` 模块；若不可，改为同目录 `renderer-entry.mjs` 单一事实源并让 main.ts 也 import 它，**不得退回两份常量**。

### 17.3 dev/prod 策略与 packaged smoke：批准

- 生产 `app.isPackaged` ⇒ `loadFile` 最终构建入口；打包时忽略 dev URL。dev 仅 `!app.isPackaged` 且显式 `ANS_DEV_SERVER_URL`（http/https、仅 localhost/127.0.0.1/[::1]、无凭据）时 `loadURL`；8s 限时、`did-fail-load` 同一守卫、一次性回退到已构建入口；回退后重载不再等 8s；未构建⇒恢复页；不自动构建、不静默换旧入口。
- 生产 CSP 逐字维持现有 meta；主进程不注入 CSP header、不加 `connect-src`/`unsafe-*`；dev 放宽只走 Vite `apply:'serve'` 插件，build 不经过。恢复页保持现状（`data:` + 内联 onclick，不作为产品页面）。
- packaged smoke 按方案重锚：`entry`（`pathToFileURL` 比较）、`rootMounted`、`driver`、CSP 指令集逐一、`cspViolations`、`consoleErrors`、`dom/preload/ipc/importDisabled/missingConfiguration/envPathMatches`；无项目时 `#tab-pi` 禁用替代旧「打开设置」断言（有项目开/关由 main.mjs 覆盖）。**批准 smoke-only `--ans-renderer-entry=<abs>`**：仅与 `--ans-packaged-smoke` 同用，绝对路径、位于 `<app>/app/renderer/dist/` 内、`.html` 结尾，否则解析失败；不暴露给渲染进程、不改变普通启动。
- **环境变量名统一**：以桌面窗口方案为准使用 **`ANS_DEV_SERVER_URL`**；装配 README/计划中的 `ANS_RENDERER_URL` 属笔误，须改为同一名，禁止双名并存。

### 17.4 `main.mjs` 目标切换、323→324 与 P1-3 忙时切换确认条

- **批准 main.mjs 目标切换与健壮化**：`ANS_RENDERER_ENTRY` 优先、默认经 `resolveRendererEntry`；三处写死加载替换；非法目标 fail-fast 并写 `RENDERER_ENTRY_ERROR`；报告加首行 `RENDERER_ENTRY=`（323→324），旧名全保留。`repairCheck` 累计失败并在末尾给 `E2E_PASS`、可空节点改空安全——这是**让失败可见**，不是放宽断言；旧端全绿时行为不变，新端失败仍为 false。
- **P1-3 忙时切换项目确认条**：**裁定 (b) 允许重锚/登记允许差异，但附安全条件**。5A 必须以运行证据确认切换项目不会停止/丢失旧项目后台会话（旧会话仍在 `session:live` 可返回/可继续）；若证据显示旧会话会停止、排队丢失或不可返回，则 **(a) 在 5A 补等价确认/保护实现（扩桌面UI 写集）或阻塞 Phase 5**，不得以「Phase 6」绕过数据丢失风险。重锚需在 allowed-diff 登记 `SWITCH_CONFIRM_*` 为 OLD-ONLY/REMOVED，并新增新语义检查（忙时切换立即生效、旧会话仍 live/可返回）；确认条本身作为 Phase 6 产品待办由产品/客户决定。此项须在客户简报中明示。
- **P1-3 实施证据（2026-10-21）**：桌面窗口 5A §四实测 `P13_OLD_PROJECT_BUSY=true`、`P13_QUEUE_BEFORE_SWITCH` ok（position 1）、`P13_SWITCH_IMMEDIATE=true`、`P13_OLD_SESSION_LIVE_AFTER_SWITCH=true`、`P13_RETURN_RESUMES_SESSION=true`、`P13_QUEUE_SURVIVES_SWITCH=true`、`P13_CONTINUE_AFTER_RETURN` ok；**满足 (b) 安全条件**，无需扩桌面UI 写集。`SWITCH_CONFIRM_*` 按 OLD-ONLY/REMOVED 登记，确认条留 Phase 6 产品待办。

### 17.5 桌面UI 三项缺口语义：批准

- **Sidebar 身份**：删除可见 `.ti-badge`；保留 `.primary`/`.builtin`，新增 `data-primary="true"`/`data-builtin="true"`，`aria-description` 含「主入口」「内置」，`title` 含身份；不隐藏角色/不缩小字号；source guard 禁 `.ti-badge`；1360/960/200% 证据。
- **P7 待选择**：`pendingKindFor(pendingOperator, roleId)` 按 surfaces 聚合，任一未决 `choice` ⇒「待选择」，否则「等待你确认」，无 pending ⇒ 原状态；不显示数量、不改变状态优先级；覆盖 choice/confirm/混合/镜像/终态；官方 P7 与工作概览分离检查 pass。
- **阅读锚点**：新增 `chat/reading-anchor.ts`；full replay 前记录首个可见行稳定文本前缀+相对 chat 顶偏移+stick；`applyHistory`/`VirtualPane` 版本后测量并调整 `scrollTop`；**仅非贴底恢复，找不到同一行则不调整**；不改变行模型/行高/虚拟窗口/工具组/懒挂载/C1；无动画/计时器；单测 + 官方 `full replay preserves content identity` pass + 贴底/前插/尾随/重写检查；bench/lazy/C1/IME 重跑。

### 17.6 178 项旧测试逐名迁移台账：批准为 5A 门前置

批准 5A 门前提交并复核 178 项（renderer 108 + markdown 5 + tool-rows 53 + runtime-ui 12）的 **old file::test name → new file/action/退役理由** 逐名台账，不用计数代替；XSS 负例与有价值纯逻辑先迁 `test/桌面UI/` 并在新封装全绿，再删旧守卫；旧源码子串守卫由新 `source-guard.test.ts` 替代，逐项列「旧守卫→替代断言」；不静默丢弃覆盖。测试角色复核台账与迁移后的实际运行；`hot-path.test.ts`/`message-queue.test.ts` 的旧段属桌面窗口，按交接表在 5B 删除前替换/退役，桌面UI 提供新纯逻辑覆盖。

### 17.7 删除清单仅 5B 执行：批准

批准 5B 删除旧 `app/renderer/index.html`、`renderer.js`、`styles.css`、7 个经典脚本、`vendor/` 与桌面UI 四个旧测试（renderer/markdown/tool-rows/runtime-ui）；**5A 门 + 旧/新快照 + 逐名对照 + 迁移台账全绿前禁止删除**。`hot-path.test.ts`/`message-queue.test.ts` 旧段由桌面窗口在 5B 前替换/退役；`uiux-design-audit` 保留并改目标，不退役；`uiux-v2`/`ime-enter`/`bench-storm` 保留并改目标；旧证据归档只读，不删除。删除后核对归档哈希，旧端不可复跑。

### 17.8 打包：批准，verify 工具放 `test/装配/`

- 批准新增 `package:local`（内嵌 `build:renderer`，`electron-builder --publish never -c.directories.output=release-output/local`）与 `verify:local`；`package`/`release:prepare`/`release:verify` 不动；`.github/workflows/release.yml`、`release-policy.mjs` 零 diff（M1）；`electron-builder.yml` 不改（`app/**/*` 覆盖 dist）。
- **verify 工具位置裁定：放 `test/装配/verify-local-package.mjs`**，不放 `src/common/装配/`。理由：它是本地验证工具，不应进入安装包或未来发布源的产品面；electron-builder 排除 `test/**`，而 `src/**` 会入包。`test/装配/` 在装配边界内。`package:local` 调该路径；若必须放源码目录，需 PM 另批并证明不随包/发布源分发。
- 本地仅 macOS arm64：批准；Windows/DPI/屏读、签名/公证/安装器、发布流水线均按 AC 边界另列 missing-evidence，不用本地包代替。verify 校验：ZIP 唯一、解包路径、必含 `app/main.ts`/preload/dist 入口/assets、必无 `.env`/`.ans`/`.git`/settings.local/test/map、devDependencies 不重复携带、packaged smoke `ok:true`；记录 sha256/大小/环境到 `local-smoke.json`（不写 release manifest 名）。

### 17.9 测试 5A/5B 门与允许差异模板：批准

批准 MATCH/RENAME/NEW-ONLY/OLD-ONLY/REMOVED 模板与逐 check 名对照；计数只作汇总；旧端 5A 真跑并在删除前冻结快照；官方运行与探针分目录、探针不作门证据；安全/fail-closed/持久化/权限类检查不得退役；阈值/超时/负向断言不得放宽。允许差异须逐条 PM 批准并写「旧名→新名/旧值→新值/依据」；C2/五角色/P7/identity 已批准差异单列；`SWITCH_CONFIRM_*` 按 §17.4 条件登记。
- **5B 门不是最终验收**：测试计划中「PM 最终验收」表述须改为「PM 5B 门记录 + 独立验收角色按 AC1–AC8 判断」；PM 不自我验收。
- 5A 门/5B 门条件按测试计划 §十执行，并增加：最终入口 A、`ANS_DEV_SERVER_URL` 单名、verify 工具位置、P1-3 安全证据。

### 17.10 独立验收 AC1–AC8：批准为 Phase 5 最终判据

批准 [AC1–AC8](../../../独立验收/docs/design/2026-10-21_design_ui-platform-phase5-acceptance.md)（version A1）为 Phase 5 最终验收标准：候选冻结/摘要、5A 快照与 5B 候选边界、逐名双端对照、三项缺口官方通过、质量门、本地打包 smoke、UIUX 终审、证据可复算；missing-evidence 边界（真实模型/网络/.env、Windows/DPI/屏读、签名/公证/安装器、发布流水线、Linux、真实主进程通道）本轮不判，也不能被 macOS 离线/本地包冒充。最终入口按 §17.1 的 A 判定；PM 5A/5B 门记录与验收结论分开，客户发布决定另行。

### 17.11 5A 派发顺序与放行结论

**确认派发顺序**：桌面窗口 + 桌面UI + 装配 **并行实现**（写集互不重叠：桌面窗口 `app/main.ts`/`app/desktop/`/`main.mjs`/其测试；桌面UI `app/renderer/src/**`/`test/桌面UI/**`/其 e2e/设计证据；装配 `package.json` scripts/`test/装配/`/文档；无交叉）→ 候选冻结后 **测试双端快照 + UIUX 5A 视觉快照** → 测试独立验证 + PM 5A 门。5A 期间旧渲染器不得删；5B 只在 5A 门通过后开始。

**放行 5A 实现（pass），无阻塞性派发前置。** 5A 门前必须完成：§17.6 的 178 项迁移台账、§17.4 的 P1-3 安全证据与 allowed-diff、§17.1 最终入口 A 记录、§17.3 的 env 单名与 packaged smoke、§17.5 三项缺口官方通过、§17.8 的 verify 工具位置与本地 dry run、§17.9 的双端逐名对照。任何清单外文件/行为改动停手回 PM。**注：本处放行仅指实现派发；5A 实际门复核结果为 needs-work，见 §十八。**

### 17.12 Markdown 链接导航回归：批准双层修复

桌面窗口 5A 实测：新渲染器点击 `.md-link` 会导航整个应用窗口（`NAVIGATION_BLOCKED=https://example.com/x`、`LINK_OPEN_EXTERNAL_CALLED=false`），旧端经 `app:open-external` 外开。**批准双层修复**：

1. **桌面UI（主修，已在 5A 派发）**：聊天流（及受控 Markdown 预览）拦截 `.md-link` 点击，`preventDefault`，只对 http/https 调现有 `openExternal` 桥；非法协议不导航、不打开；补单测/e2e（外开一次、窗口 URL 不变、`javascript:`/`file://`/`data:` 不执行）。
2. **桌面窗口（产品侧兜底，批准）**：在真实主进程窗口加 `will-navigate` 与 `setWindowOpenHandler` 防御：只允许初始加载/同 URL reload（dev 仅允许同一回环 dev URL）；其余导航一律 `preventDefault`；http/https 经既有 `openExternalFn`/`shell.openExternal` 外开（或至少阻止，不加载），`file:`/`data:`/`javascript:` 等一律阻止。**不改 preload、不新增 IPC**；不把 e2e harness 的拦截当产品兜底。补主进程测试：https 外开、窗口 URL 不变；恶意协议不导航。
3. 双重保障但**不双重外开**：渲染侧已 `preventDefault` 时不会触发 `will-navigate`；兜底只处理漏网导航。该修复计入 5A 候选，候选冻结在修复与测试之后。

### 17.13 main.mjs 双端差异与 10 项新端失败：按模板逐名裁定，不得静默豁免

**确认按测试计划模板处理**：初版快照 old 357 / new 366 / common 356 / only-old 1 / only-new 10 / 值差异 103（中间态，不作为门证据）；修复轮新快照 old 373 / new 380 / common 372 / only-old 1 / only-new 8 / 值差异 91。逐名输出 MATCH-PASS / RENAME / NEW-ONLY / OLD-ONLY / REMOVED，附「旧名→新名/旧值→新值/依据/替代覆盖」；**PM 逐条批准后才可进 5A 门**；未批准差异一律 5A 门失败。安全/fail-closed/持久化/权限类检查不得退役；负向/精确值/阈值不得放宽。

- **值差异 103**：按原因分组处理——已批准的 UI/设计差异（`op-kind-*`/`is-flash`/`.active`/debug 字段、状态徽标 `●` 前缀、`PI_FIELD_COUNT 5→6`、`piKeys` 名集、`RESTORE_*` 形状等）登记 RENAME/NEW-ONLY/REMOVED 并给替代覆盖；真实行为回归不得用「载体差异」解释，必须修复。C2、五角色、P7、identity 等已批准差异单列。
- **旧端 `RECOVERY_SAME_PENDING_CARD_ONCE=false`**：按 C 类既有红处理，测试核实同因（旧端历史/重复卡），不作为新端红；旧端其余值如实记录。
- **新端 10 项 repair 失败**（5 会话修复、1 PENDING、3 RECOVERY、1 DIAGNOSTICS）：逐项归因——真实产品缺陷（尤其会话修复/恢复/PENDING 可达性）必须在 5A 门前修复；仅旧载体/调试字段差异且已有等价新检查的，登记 RENAME/NEW-ONLY 并经 PM 批准；**不得因为旧端也红就自动继承、不得留到 5B/Phase 6 静默豁免**。每项给出证据、替代覆盖与关闭/批准结论。
- **5A 门追加条件**：`MATCH-FAIL=0`、无未批准差异、10 项 repair 失败全部关闭或经 PM 批准且有替代覆盖；旧 RECOVERY 红同因核实；候选冻结在 Markdown 双层修复、main.mjs 差异台账/10 项处理、P1-3 安全证据、178 项迁移、三项缺口、最终入口记录全部完成之后。5A 通过后才进 5B；5B 不得用新端结果冒充旧端。

**2026-10-21 修复轮更新（harness-only，批准）**：

- **4 项夹具泄漏修复（批准）**：`PENDING_EXPLICIT_SAME_ROLE`、`RECOVERY_OLD_REQUEST_STILL_ANSWERABLE`、`RECOVERY_ENDED_REQUEST_NOT_REPLAYED`、`RECOVERY_SAME_PENDING_CARD_ONCE` 在恢复段前对 `customerChannel.rejectAllPending` 做场景隔离；**不改任何断言/判据**。`RECOVERY_SAME` 新端已转 true、旧端仍 false（C 类同因）。要求：清理只发生在场景之间，不得掩盖产品 pending 清理缺陷；另保留产品侧「恢复后 pending 清理/旧请求不复活」检查；测试独立复验。
- **PROMISE_TIMEOUT 归零（批准）**：OPX/OP1-4/anchor 的 harness 驱动由直接 `.checked` 改为「按 presenter 请求 id 精确定位 + `input.click()` + submit」——React 受控 input 不响应直接改属性，点击才是真实用户路径；**仅驱动方式，不改检查名/判据/阈值/期望值**。要求：不得绕过组件直接调 store；测试独立复验驱动等价性；记入证据 ledger 为 harness-only。
- **剩余 6 项阻塞**：`SESSION_REPAIR×5` + `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 已确认均为**渲染侧真实缺陷**（桌面UI 修复中）；修后 main 新端应全绿。这 6 项关闭前 **5A 门不通过**；不得以 harness 改动或旧 C 类豁免。
- **5A 门仍关闭的其它条件**：A 组 8 项官方通过、design audit 12 条重锚/UIUX 裁定、D 组新快照 91 值差异/8 NEW-ONLY/1 OLD-ONLY 分组批准、toggleDrift/role reading、候选重冻、测试重验。修复轮完成后按新候选重新跑双端并重出 §17.13 台账；初版/中间快照不得作为最终门证据。

## 十八、5A 门复核与修复授权（2026-10-21）

**依据**：测试 [5A 独立验证](../../../测试/docs/change/2026-10-21_change_phase5a-independent-verification.md) 与新端证据（[main 差异台账](../../../测试/docs/change/2026-10-21-phase5a-new-entry-evidence/main-diff/allowed-diff-ledger.md)、[repair 归因](../../../测试/docs/change/2026-10-21-phase5a-new-entry-evidence/main-diff/repair-failures.md)、[uiux 台账](../../../测试/docs/change/2026-10-21-phase5a-new-entry-evidence/uiux-allowed-diff-ledger.md)、[design audit 失配](../../../测试/docs/change/2026-10-21-phase5a-new-entry-evidence/design-audit-failures.md)）、旧端快照、PM §十七/§17.12/§17.13。只读核对，未改实现、未重跑。

**结论：5A 门不通过（needs-work）；授权 5A 修复轮，5A 门保持关闭至修复 + 台账分组批准 + 重跑通过。** 三项缺口中 Sidebar/P7 已关闭；虚拟锚点仅拆分为部分通过（toggleDrift 未闭）；新端 6 个 uiux 模式早停、main 10 项 repair 失败、design audit 12 条旧夹具失配、允许差异台账未分类，均不得进入 5B。

### 18.1 A：uiux 新端 8 项逐项裁定

| 项 | 裁定 | 归属/要求 |
| --- | --- | --- |
| TERMINAL_MERGE（同轮 denied+settled 出现两条终局） | **真实产品缺陷，5A 修** | 桌面UI：终局行按 turn/outcome 合并为一条；保留原断言，不得以「新载体」豁免 |
| PROJECT_RESET（新项目首 DOM 未清旧徽标） | **真实重置缺陷/夹具，5A 修** | 桌面UI：fresh project 时先清旧徽标/队列/状态再收事件；补证据；不得退役 |
| DUP（history-first + live 重复回交投递） | **真实去重缺陷，5A 修** | 桌面UI：按报告/交付身份去重，history 与 live 同源只一条；保留断言 |
| MERGE（full rebuild 丢未持久 live 报告/原 pending 卡） | **真实状态保留缺陷，5A 修** | 桌面UI：full rebuild 保留未持久 live 报告、终局行与原 pending 卡；不得以重建丢失换取通过 |
| NOTICE（系统通知成用户气泡/无系统徽标） | **真实呈现缺陷，5A 修** | 桌面UI：实时系统通知独立 sys 行 + 系统徽标，不混入用户气泡；保留断言 |
| BLANK（后台 pane 缺 queue/status 行） | **真实 pane 级缺陷或夹具，5A 修** | 桌面UI：后台 pane 建 queue/status 行；若新产品语义有意不显示，须回 PM 书面批准，不得静默退役 |
| DEFAULT toggleDrift `anchor paragraph materialized 960` | **真实虚拟锚点缺陷，5A 修** | 桌面UI：toggleDrift 后锚点段落物化/阅读保持；见 §18.5；不得算作已关闭 |
| COMPLETE_FLOW `role reading fixture must really scroll` | **夹具/阅读面缺口，5A 修** | 测试+桌面UI：让夹具真实滚动（内容/高度），保留「必须真滚动」守卫；不得放宽/删除；若产品 pane 不可滚则修产品 |

**A 组结论：8 项全部 5A 修复，无一项批准为允许差异。** 修复后必须由官方模式自然跑完整段，不以探针/补证替代。

### 18.2 B：main.mjs 10 项 repair 与 only-new 裁定

- **SESSION_REPAIR×5**（`SAME_ROLE_CONFIRMS_BACKEND`、`EXPLICIT_RECOVERY_DELIVERS_ONCE`、`FAILED_OPEN_DOES_NOT_SEND`、`FAILED_OPEN_NO_USER_BUBBLE`、`FAILED_OPEN_NO_REPLAY`）：**真实行为/fail-closed 缺陷，5A 修**（桌面UI 渲染侧 + 桌面窗口会话/IPC 侧按归因）；不得退役/放宽。
- **PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE**：**真实可达性缺陷，5A 修**；不得以旧载体差异豁免。
- **RECOVERY_SAME_PENDING_CARD_ONCE**：旧端 false 属 C 类同因，但新端同名 false 且伴随新端恢复链失败，**不能按旧 C 豁免**；先修新端恢复链（同 id 去重/单卡），再由测试复判同因。
- **RECOVERY_OLD_REQUEST_STILL_ANSWERABLE / RECOVERY_ENDED_REQUEST_NOT_REPLAYED**：**真实恢复语义缺陷，5A 修**；旧请求可作答、已结束不复活，属 fail-closed/数据正确性，不得退役。
- **DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS**：**条件允许差异**——仅当桌面UI/桌面窗口新增等价新诊断检查（覆盖 `renderer.event-error/viewport/replay/recovery` 等）并在新端全绿，方可登记 RENAME/NEW-ONLY；否则按可观测性缺陷 5A 修。当前**未批准**。
- **PROMISE_TIMEOUT / WAIT_TIMEOUT**（only-new）：**不自动批准**；逐项归因——若卡片未呈现/等待超时是真实行为，5A 修；若属 harness 超时/夹具时序，只调 harness（不改断言）并重跑，仍须 PM 批准。
- **NAVIGATION_BLOCKED 已消失**：确认 Markdown 双层修复生效，保留新导航检查；不另立差异。

### 18.3 C：design audit 12 条旧 DOM 夹具逐条裁定

**批准重锚（须有新 DOM/测量等价，不得删除/放宽）**：

| 检查 | 处置 |
| --- | --- |
| `1-W1-行距16±1` | 重锚到新 `.chat-row` padding/rowGap 16±1；保留数值断言 |
| `S3-无chip时尾行兜底` | 重锚到新 chip/tail 组件；保留「无 chip 时尾行兜底」行为 |
| `W6b-系统正文去前缀` | 重锚到新系统通知 DOM；保留前缀剥离断言 |
| `W6-注入盒行高1.6` | 重锚到新注入盒类；保留 1.6 行高，不改存在性 |
| `S2-chip对齐阅读列≤8` | 重锚到新阅读列；实测 ≤8 |
| `S1-截断目标仍可见` | 重锚到新截断载体；保留可见性 |
| `9-W9-徽标12pxSVG` | 重锚到新徽标 SVG；保留 12px |
| `11-W11-loading同款转轮` | 重锚到新 loading/转轮 DOM；保留同款 |
| `10-W10-尾行含转轮` | 重锚到新尾行；保留转轮 |
| `12-reduced-motion静止弧` | 重锚到新 reduced-motion 实现；保留静止弧 |

**保留/待 UIUX 裁定（不得直接退役）**：

- `6-可见行≥9`：新端 fullyVisibleRows=6 vs 旧阈值 9，可能是真实密度/可见行回退；由 UIUX 按新行高/窗口档给出可接受阈值或要求修复，**不得直接放宽/退役**。
- `9-W9-转轮0.9±0.2s`：保留转轮时长断言；若新设计改为静态/不同时长，须 UIUX 书面批准为设计差异并给等价检查，不得静默退役。

**责任**：桌面UI/UIUX 提供新 DOM 锚点与状态矩阵；测试不改产品断言，按新锚点复验。12 条全部有结论前，5A 门不通过。

### 18.4 D：允许差异台账（102 值差异 / 9 NEW-ONLY / 1 OLD-ONLY）

**当前台账不具批准条件**：102 行大多仍标「待分类」，无原因/替代覆盖；**不按计数或整表批准**。按以下分组规则重出「组 + 精确名单 + 代表行 + 替代覆盖」后，PM 逐组批准；未列入批准组的行一律未批准、5A 门不通过。

- **G1 环境/实例归一化**（版本/路径/time/实例差异，非行为）：可整组批准；代表 `ELECTRON/NODE` 等；测试归一化后比较。
- **G2 已批准 UI/设计差异**（五角色、状态 `●` 前缀、`PI_FIELD_COUNT 5→6`、`piKeys` 名集、已批准类名/文案/布局）：凭 §15.2/§12.3/§17 依据整组批准；须列精确名单。
- **G3 旧载体/调试字段且有新等价检查**（如 `OP_*`/`OPX_*`/`ANCHOR_*`/`OPEN_CARD_*`/`BADGE_*`/`TAB_*_ACTIVE`/`RIGHT_QUEUE_*`/`RESTORE_*`/`DRAWER_*` 等）：**条件批准**——每条须写新等价检查名/路径并证明未丢失安全/fail-closed/持久化/权限语义；无等价即按 G4 修复，不得仅凭「旧类名不存在」批准。
- **G4 真实行为/夹具缺陷**：如 `ANCHOR_*` 的 false、`OPEN_CARD_*` 的 false、`DRAWER_ESC_CLOSES`、`DENIED_OPEN_COUNT 2→0`、`HAS_DENIED_INLINE 2→0`、`BOOTSTRAP_*` 重置、`INJECTED_CHIP_LABEL` 等；**5A 修**，不得列入允许差异。
- **G5 派生行**：`E2E_FAILURES`/`E2E_PASS` 随底层 10 项裁定，不单独批准。
- **9 NEW-ONLY**：仅批准「旧端无此能力且新检查为新增覆盖」者；`PROMISE_TIMEOUT`/`WAIT_TIMEOUT` 未归因前不批准；其余逐条给旧端缺失证据。
- **1 OLD-ONLY/REMOVED**：测试点名并给等价替代或旧能力已废弃依据；安全/fail-closed/持久化/权限类不得退役。

**5A 门要求**：重出的分组台账经 PM 逐组批准、无未批准行、`MATCH-FAIL=0`；否则不通过。

### 18.5 虚拟锚点 toggleDrift 与 role reading：5A 修

- **toggleDrift `anchor paragraph materialized 960`：5A 修**（桌面UI）。这是虚拟窗口阅读保持的一部分，不能以 `incremental/full replay` 已过为由放行；修复后官方 DEFAULT 段必须自然跑完后续检查。
- **COMPLETE_FLOW `role reading fixture must really scroll`：5A 修**（测试+桌面UI）。保留「必须真滚动」守卫；若新布局使夹具不溢出，调整夹具内容/高度使真实滚动，不得删除/放宽断言；若产品 pane 不可滚，修产品。
- 两项关闭后，AC4 #3（`full replay preserves content identity` + 默认段完整到达）才成立。

### 18.6 5A 修复轮授权与重验条件

**授权 5A 修复轮**：
- **桌面UI**：A 组 6 个真实缺陷（TERMINAL_MERGE/PROJECT_RESET/DUP/MERGE/NOTICE/BLANK）+ toggleDrift + role reading 产品面；B 组 9 项行为（SESSION_REPAIR×5、PENDING、RECOVERY_OLD/ENDED、RECOVERY_SAME 新链）按归因修；C 组重锚的新 DOM/测量；D 组 G3 等价新检查。
- **桌面窗口**：B 组涉及会话/IPC 的修复、DIAGNOSTICS 等价或修复、PROMISE/WAIT 归因；Markdown 双层修复保持；不改 preload/新增 IPC。
- **测试**：修复后重跑受影响 uiux 模式（含 6 个早停 + DEFAULT/COMPLETE_FLOW）、main 旧/新、design audit；重出 G1–G5/9 NEW-ONLY/1 OLD-ONLY 分组台账；逐名、候选哈希、原始输出；不弱化断言；独立复验。
- **UIUX**：design audit 阈值/转轮/可见行与 200% 视觉复核；最终审计前再次确认。
- **装配**：本修复轮无新增构建/打包变更；若涉及 package scripts 另报 PM。

**5A 重验门（保持关闭至全部满足）**：
1. A 组 8 项在官方模式自然跑完整段并通过；toggleDrift/role reading 官方通过。
2. main 旧/新重跑；10 项 repair 全部关闭或 PM 批准且替代覆盖；`PROMISE/WAIT` 归因；`MATCH-FAIL=0`。
3. design audit 12 条全部重锚/UIUX 裁定并有等价；无删除/放宽。
4. D 组分组台账 PM 逐组批准；无未批准行；5A 快照/候选哈希重冻；旧端快照仍有效（旧文件未改）。
5. 测试独立复验通过；5A 门重判；通过后才进 5B。
6. **UIUX 5A 新端视觉审计 P0/P1 清零并在候选重冻后重跑**（§18.7）；P2 按记录处置。

**边界**：修复轮不得扩到 5B/Phase 5 之外；不得删旧渲染器/旧测试/vendor；不得改 release 配方；不得新增依赖/DOM 例外；任何清单外行为改动停手回 PM。

### 18.7 UIUX 5A 新端视觉审计：needs-work，P0/P1 为 5A 门阻塞

**依据**：UIUX [5A 新端视觉审计](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-new-visual-audit.md)（1360/960/200% A–L，75 PNG+metrics；结论 needs-work）。审计 hash 为旧构建（18:22），当前 dist 已在 18:48 重建；**候选重冻后必须对新 hash 重跑审计**，不能把本报告直接贴到当前 dist。

- **P0（阻塞）**：200% 下 `#chat` 随虚拟转录总高撑开，composer 被推到 5,075–1,341,790px，长历史输入区不可达。桌面UI 修 200% 聊天/输入区布局（聊天内部滚动、输入区贴底/固定，不让虚拟总高撑开 flex 项）；补「composer 首屏可见/可达」断言与真实长历史 200% 证据，不能只查 `scrollWidth`。
- **P1（阻塞）**：① 200% 无角色/会话失败态中栏横向滚动条；修长错误/路径文案换行，`.col-mid` 200% 禁横滚，补该状态逐容器断言。② `sys-loading`/`tool-current` 只有文字、缺 12px 工作转轮；两处复用 `.status-spinner`+Lucide `LoaderCircle` 12px，保持尾行 26.6±2，补 0.9s/reduced-motion 等价检查。③ 密度等价未立：当前 `fullyVisibleRows=6` 低于等价阈值；UIUX 裁定**不降阈值到 6、不压正文**，须清残留/规范化夹具（固定行类型/行数，隔离上一场景 pending），按 **≥9（无提示条）/≥8（57.8px 提示条叠）@1360、≥4@960** 复测；不足则压 chrome（合并提示条、上内边距 20→16、输入区 ≤121），不得压正文 15/27。
- **P2（记录，不阻塞 5A 门，但须在 5B 前处置/记录）**：注入盒 `.msg-injected/.mi-body` 行高 1.6 未锁（当前约 1.68），桌面UI 显式 `line-height:1.6`；1360/960 多层状态条叠压（合并/折叠）；200% 镜像/交付目标截图缺失（missing-evidence）；`04-profile`/`12-composer` 证据命名错配；phase4b 冒烟图测试壳标记。P2 不得静默消失，审计记录逐项写「已修/仍留」。
- **对 §18.3 的更新**：`6-可见行≥9` 按 UIUX 裁定不退役，改规范化夹具 ≥9/≥8/≥4（当前 6 为 P1）；`9-W9-转轮0.9±0.2s` 保留 0.9s，重锚到 `.status-spinner`+Lucide+Motion（CSS `animationName` 为空不算失败）；W10/W11 缺转轮为 P1 产品缺口；`S2` 批准「chip 右缘对齐阅读列」并重锚；`W6` 行高 1.6 为 P2 产品微差；其余重锚仍按新 DOM/夹具落地，未落地前不得记 pass。
- **5A 门条件**：P0/P1 全部清零 + 候选重冻后重跑 UIUX 审计（新 hash）通过；P2 有逐项处置记录。UIUX 审计通过不等于最终验收，仍由独立验收按 AC1–AC8 判断。

## 十九、5A 最终分组裁定与重锚批准（2026-10-21）

**依据**：测试[最终重分报告](../../../测试/docs/change/2026-10-21_change_phase5a-ledger-regroup-final.md)、[最终 main 台账](../../../测试/docs/change/2026-10-21-phase5a-new-entry-evidence/post-fix3/main-diff/final-regroup-ledger.md) 与 [JSON 台账](../../../测试/docs/change/2026-10-21-phase5a-new-entry-evidence/post-fix3/main-diff/final-allowed-diff-ledger.json)、post-fix3 证据索引。只读核对，未重跑。

**现状**：main old 373/new 379/common 372/only-old 1/only-new 7/值差异 80；`E2E_PASS=true`、`E2E_FAILURES` 空，10 项 repair 全 true。uiux 除 MERGE `window.__mergeCard` 与 DEFAULT toggleDrift `parentNode` 两个旧 DOM 身份断言外全过；design audit 仍 abort 于旧 `.tool-records` 选择器；UIUX P0/P1 仍在修。**5A 门仍不通过。**

### 19.1 G1–G5/NEW-ONLY/OLD-ONLY 总裁定

| 组 | 裁定 |
| --- | --- |
| **G1（19）** | **整组批准**：`OUTDIR`/`RENDERER_ENTRY`/`SHOT_*`/`ELECTRON`/`NODE` 等环境/实例归一化；测试归一化后比较，不改断言 |
| **G2（12）** | **逐名批准**（见 §19.2），须在最终台账写已批准依据引用 |
| **G3（25）** | **条件组批准，尚未最终批准**：当前报告 coverage 仅写「新端等价检查/路径」，**没有精确等价检查名**；25 行须逐名补「新检查名/路径」后才生效。无等价的行降 G4 修复。候选等价方向见 §19.3 |
| **G4（21）** | **不得整组列差异**；逐名裁定见 §19.4：6 项批准重锚/移除、5 项条件待等价、10 项修复或补等价证据 |
| **G4-RESOLVED（1）** | `RECOVERY_SAME_PENDING_CARD_ONCE false→true` **已关闭**，不列差异 |
| **G5（2）** | `E2E_FAILURES`（旧 1→新空）、`E2E_PASS`（false→true）随底层全绿，**批准为派生行**，不单独列差异 |
| **NEW-ONLY（7 P13_*）** | **批准**：P1-3 新语义 7 项（`P13_OLD_PROJECT_BUSY`/`P13_QUEUED_BEFORE_SWITCH`/`P13_SWITCH_IMMEDIATE`/`P13_OLD_SESSION_LIVE_AFTER_SWITCH`/`P13_RETURN_RESUMES_SESSION`/`P13_QUEUE_SURVIVES_SWITCH`/`P13_CONTINUE_AFTER_RETURN`），取代旧 `P13_NEW_SEMANTICS` |
| **OLD-ONLY（1）** | `P13_NEW_SEMANTICS` **批准退役**，由上述 7 项替代；P1-3 安全证据见 §17.4 |

### 19.2 G2 12 名逐名批准

`PI_FIELDS_MATCH_REGISTRY`、`PI_FIELD_COUNT`（Pi 字段 5→6）、`PI_KEYS_ARE_FIVE`、`PI_SAVE_STATUS`、`RESUME_HINT`、`ROLE_STATE_BADGE_HAS_ICON`、`ROLE_STATE_BADGE_HOVER_FULL`、`STATUS_BADGE_TEXT`（`●` 前缀去除，单计数/状态-only）、`SYS_ROWS`、`U1_NORMAL_TO_BOTTOM`、`U1_NORMAL_TO_BOTTOM_DIST`、`U1_PANE_HEIGHT`——**全部批准为已批准 UI/设计/布局差异**，最终台账须引用 §12.3/§13.4/§15.2/§17 的批准依据；其中 U1 三项须保留 U1 行为检查（不得只删数值）。

### 19.3 G3 25 名条件批准与等价方向

当前报告**未提供逐名等价检查名**，因此 25 行**尚未最终批准**；测试须在最终台账逐名填写精确的新检查名/路径。可用的等价方向（须具体到 check 名，不得只写套件名）：

- `OP_*`/`OPX_*`（present/frozen/radio/checkbox/pointer）→ uiux MIRROR 8/8、JUDGE 33/33、4B 独立冒烟中的 operator 卡/镜像/冻结/选项检查。
- `RESTORE_*`（divider/snippet/replay rows/restored flag）→ RUNTIME 17/17、FRESH 4/4、恢复卡检查。
- `RIGHT_QUEUE_*`（running first/sources）→ QUEUE_VIEW 4/4、WorkOverview 队列位次/来源检查。
- `BADGES_*`（clear on empty/work while collapsed）→ 单计数/WorkOverview/PROJECT_RESET 新检查。
- `ANCHOR_*`（card at arrival/row after switchback）→ 新 `ANCHOR_*`/`OPEN_CARD_*` 行为检查（索引差异可归一化，行为必须仍 true）。
- `DIAGNOSTIC_EVENT_NAMES`/`PENDING_DIAG`/`RECOVERY_CARD_DIAG`/`REPAIR_*_CALLS` → 诊断事件集合/计数等价检查；事件集合须包含旧端全部必要事件，顺序差异可归一化。
- `DISPATCH_ROW_NO_WITHDRAW`/`DRAWER_CLOSED_AFTER_PI`/`REPORT_DELIVERY_DETAILS_COLLAPSED` → 队列撤回/抽屉/报告 details 的 4A/4B 等价检查。

**无精确等价名的行降 G4 修复**；不得以「旧类名不存在」批准。安全/fail-closed/持久化/权限类检查不得退役。

### 19.4 G4 21 名逐项裁定

| 名称 | 裁定 |
| --- | --- |
| `SWITCH_CONFIRM_ON_BUSY` | **批准 OLD-ONLY/REMOVED**：P1-3 新语义 + 7 项 P13_* 覆盖；确认条留 Phase 6 产品待办（§17.4） |
| `SWITCH_CONFIRM_RELOADED` | 同上 |
| `SWITCH_IDLE_HINT` | 同上 |
| `ROLE_STATE_BADGE_WORKING_PENDING` | **批准重锚**：新单计数 `.ti-count` + 状态-only（§12.3/§13.4）；补新 badge 检查 |
| `ROLE_STATE_QUEUE_ROW` | **批准重锚**：WorkOverview/QueuePanel 队列行新检查 |
| `INJECTED_CHIP_LABEL` | **批准重锚**：新 4B 文案「回交投递 · 来自 …」；补新 label 检查（UIUX/4B 设计依据） |
| `BOOTSTRAP_CENTER_CTA_PRESENT` | **条件**：若新空态设计有意无 CTA，须 UIUX/产品书面依据 + 新空态检查；否则修 |
| `BOOTSTRAP_MENTION_COUNT` | **条件**：新空态文案若有意变化，须 UIUX/产品依据 + 新检查；否则修 |
| `BOOTSTRAP_MENTION_IN_CENTER_EMPTY` | 同上 |
| `P1_ARRIVAL_DEBUG` | **条件**：新 pending/anchor debug 字段等价检查；无则修 |
| `STATUS_LAST_EVENT_RECORDED` | **条件**：新状态字段等价检查；无则修 |
| `P1_ARRIVAL_SCROLLED` | **修或新等价**：到达滚动是用户行为，须新 work overview/operator 等价检查；无则 5A 修 |
| `P1_CHIP_CLICK_LOCATES` | **修或新等价**：chip 点击定位；无则 5A 修 |
| `P1_CHIP_COUNT1_AFTER_TERMINAL` | **修或新等价**：终态后 chip 计数 1；无则 5A 修 |
| `P1_CHIP_HIDDEN_AFTER_ALL_TERMINAL` | **修或新等价**：全部终态后 chip 隐藏；无则 5A 修 |
| `P1_CHIP_SECOND_CARD` | **修或新等价**：第二张卡 chip；无则 5A 修 |
| `P1_CLEANUP_CHIP_HIDDEN` | **修或新等价**：清理后 chip 隐藏；无则 5A 修 |
| `P1_SWITCHBACK_SCROLLS_TO_CARD` | **修或新等价**：切回滚到卡；无则 5A 修 |
| `DENIED_OPEN_COUNT` | **修或新等价**：旧 2→新 0 属 denied 行呈现；须新 denied-inline 检查，否则 5A 修 |
| `HAS_DENIED_INLINE` | 同上 |
| `REPLAY_DEDUP_REBUILD` | **修或新等价**：full rebuild 去重；须新 dedup 检查，否则 5A 修 |

**计数**：批准重锚/移除 6（SWITCH×3 + ROLE_STATE×2 + INJECTED_CHIP_LABEL）；条件待等价 5（BOOTSTRAP×3 + P1_ARRIVAL_DEBUG + STATUS_LAST_EVENT_RECORDED）；修复或补等价 10（P1 七项 + DENIED/HAS_DENIED + REPLAY_DEDUP_REBUILD）。后 15 项未关闭前 5A 门不通过。

### 19.5 MERGE `window.__mergeCard` 与 DEFAULT toggleDrift `parentNode`

- **MERGE**：批准**重锚为语义身份**——同一 `data-request-id`、`data-state=open`、confirm 可见、无借用 token；不再要求 `window.__mergeCard` 的同一 DOM 节点身份。产品行为由 main `ANCHOR_*`/`OPEN_CARD_*` 与新检查覆盖；桌面UI/测试按其属主落文件，测试不改产品断言。
- **DEFAULT toggleDrift**：批准**重锚为 `closest('.chat-pane')` 祖先关系**（新 `.chat-row` 包裹），保留其余全部断言；重锚副本 110 checks 全过作为证据，但原断言未改前不得记 pass。桌面UI 落 uiux-v2 文件，测试复验。
- 两项均不得删除/弱化；重锚后需重跑对应段并记录 check 名/值。

### 19.6 design audit 旧 `.tool-records` 选择器

批准**重锚**旧 audit 脚本的选择器到新工具组 DOM（`.tool-records`/新 `details` 载体），保留 12 条 v3 检查：§18.3 已批准的 10 条按新锚点落地，`6-可见行≥9`/`9-W9-转轮0.9s` 按 UIUX §18.7 裁定；不得整体退役 audit。若某条确实无等价，须 UIUX 书面批准退役并给新端等价几何/行为检查；不得静默删除。测试不改产品断言。

### 19.7 5A 门重验条件（保持关闭）

1. **G1/G2 已批准；G3 25 行逐名补精确等价检查名后按组生效**；无等价降 G4。
2. **G4 后 15 项**（5 条件 + 10 修复/等价）全部关闭/批准；G4 前 6 项重锚落地；G4-RESOLVED/G5/NEW-ONLY/OLD-ONLY 已批准。
3. MERGE/toggleDrift 重锚落地并重跑 pass；design audit 选择器重锚、12 条检查有结论。
4. **UIUX P0/P1 清零 + 候选重冻后新 hash 重跑视觉审计**（§18.7）。
5. main `E2E_PASS=true` 保持、`E2E_FAILURES` 空；双端最终逐名台账无未批准行、`MATCH-FAIL=0`。
6. 候选重冻、测试独立复验、PM 5A 门重判；通过后才进 5B。5A 期间旧渲染器不删。

**当前状态：5A 门仍不通过；剩余修复/补证清单见上。** 桌面窗口落 main.mjs 重锚（其文件）、桌面UI 落渲染侧修复/重锚与 UIUX P0/P1、测试重跑并补台账；只写 `角色卡/项目管理/`。

## 二十、5A 门关闭与 5B 授权（2026-10-21）

**依据**：测试 [5A 冻结候选最终独立验证](../../../测试/docs/change/2026-10-21_change_phase5a-final-verification.md)（status: verified，5A pass）、UIUX [最终视觉审计](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md)（revision 3，pass，P0 0/P1 0/P2 4）、装配最终冻结包、final3/final4 证据。只读核对，未重跑。

### 20.1 5A 门：关闭（pass）

- **最终候选（5A 冻结）**：HTML `f372e111…`、JS `f568e2aa…`、CSS `b52cfca1…`；clean rebuild 与桌面UI 冻结值逐字节一致；gzip **288,552B（测试扫描 289,120B）≤307,200B**；严格 CSP；typecheck/build exit 0。
- **门禁**：5A 冒烟 **36/36**；design audit **31/31**；uiux **23 段全绿**（DEFAULT 110/110、MERGE 12/12、COMPLETE_FLOW 41/41、VISUAL 54/54、TOOLFOLD 19/19 C1 **Δ=20**（目标≤20、硬门≤32）、其余段全过）；main 新端 **397 名、`E2E_PASS=true`、`E2E_FAILURES` 空**；G1–G5/NEW-ONLY/OLD-ONLY **无未批准行、`MATCH-FAIL=0`**；单测 **142/142**、旧基线 **683/683**、IME 24、懒挂载 10/10；bench 全过（stormA 中位 17.7、stormB 18.7、单轮最大 23.7）；密度 **12/11/8**（1360 无提示/带提示/960，阈值未降、正文 15/27 未压）；200% 遮挡门全过（480/680 目标 `bottom ≤ composer.top`、composer 95、预览 static、内容列 ≥200、无横滚）。
- **旧端**：391 名，唯一 `E2E_FAILURES=RECOVERY_SAME_PENDING_CARD_ONCE`（C 类同因）；双端差异以 5A 快照为准；旧端不删。
- **覆盖**：Phase 3/4 全部功能面 + 5A 三项缺口（Sidebar 身份、P7 含 role reading、虚拟锚点含 toggleDrift）+ 全量双端 + 200%/密度/遮挡 + design audit 12 条重锚 + Markdown 导航双层修复 + P1-3 安全语义。**P2 4 条已登记**（480 镜像 chip 与动作重叠、480 完整卡标题在视口外、main 3× 200 截图位/命名、harness 标记），不阻塞 5A 门，随 5B/后续打磨记录。
- **结论**：§18/§19 的 needs-work 为历史；**5A 门 pass**，最终候选冻结。5A 期间旧渲染器仍为生产默认、未删除。

### 20.2 S0 命名说明：接受等价覆盖

`BOOTSTRAP_S0_*` 六名未出现在 main.mjs 官方名单；其行为由官方 5A 冒烟 36/36 中的 S0 检查（标题/说明/CTA/单一提及/无治理 CTA/点击+键盘开会话/1360/960/680）与独立 S0 探针 **9/9** 覆盖，且 480 补充 25/25。**裁定：接受为等价覆盖**，登记为 `NEW-ONLY/EQUIVALENT`，不按「缺失旧 main 名」处理；5A 门记录须列出六个 `BOOTSTRAP_S0_*` 名及对应 5A smoke/S0 探针 check 名。若其中任一实为**旧 main.mjs 既有名**，则必须在 5B 前补名，不得以等价覆盖替代旧名。5B 终审仍可按需补 main 名，但不作为 5A 门条件。

### 20.3 5B 授权范围与原子批次

**授权 5B 实施**，按以下顺序；**a/b/c 为同一原子批次**（避免旧入口已删而新入口未就绪）：

1. **a. 桌面UI**：按 5A 删除清单删除旧 `index.html`、`renderer.js`、`styles.css`、7 个经典脚本、`vendor/` 与四个旧守卫测试（先确认 178 项迁移台账关闭、XSS 负例已迁 `test/桌面UI/` 全绿）；把 `app/renderer/src/index.html` **移动**为 `app/renderer/index.html`（内容逐字，`/src/main.tsx` 相对 root 仍有效）。
2. **b. 装配**：`vite.config.ts` `rollupOptions.input` 指向根 `index.html`（或删除 input 用 root 默认）；`build:renderer` 产出 **`dist/index.html`** + `dist/assets/*`；`base:'./'`、`modulePreload.polyfill=false`、target 不变；不改 release 配方。
3. **c. 桌面窗口**：`renderer-entry.ts` 收敛为唯一 `renderer/dist/index.html`；`main.ts` 生产 `loadFile` 切到它；`main.mjs` 默认目标与三处加载、packaged smoke 期望入口同批切换；dev 策略/回退保持；**生产 CSP 不放宽**。
4. **d. 桌面UI/桌面窗口**：`uiux-v2`/`ime-enter`/`bench-storm`/`uiux-design-audit` 默认目标翻到新入口；main.mjs 默认同批；旧路径常量清理；断言不改。
5. **e. 装配**：`npm run package:local` + `verify:local` 重打包；包内仅 `dist/index.html` + assets，旧渲染器/vendor 不在包内；packaged smoke 新契约面 14/14；记录 ZIP/入口/assets sha256 与大小。
6. **f. 测试 + UIUX + 独立验收**：新入口全量套件（uiux 23 段、main、ime、bench、design audit、单测/旧基线/懒挂载）、packaged smoke、最终 UIUX 新入口终审；随后独立验收按 AC1–AC8 判断。

**失败处理**：a/b/c 任一步失败 → 停住并回滚该原子批次（恢复旧入口/旧构建/旧 main 常量），不得留下「旧入口已删、新入口未就绪」或「生产指向缺失入口」的状态；d/e/f 失败 → 停住，保留 5A 快照与旧入口（若尚未删除）或按已批准回滚路径恢复；不得静默切回旧入口/发布。

### 20.4 5B 前置与约束

- **前置**：5A 门 pass（本节）；178 项迁移台账关闭/XSS 迁移全绿；最终入口 A 已记录；`ANS_DEV_SERVER_URL` 单名；verify 工具在 `test/装配/`；5A 快照冻结（旧端文件清单/哈希/报告/截图）；候选重冻后再开始 5B。
- **写集**：桌面UI `app/renderer/**`、`test/桌面UI/**`、其 e2e/design-audit；桌面窗口 `app/main.ts`/`app/desktop/`/`main.mjs`；装配 `vite.config.ts`/`package.json` scripts/`test/装配/`；测试 `test/测试/`；UIUX/产品文档。不得越界。
- **约束**：不接发布流水线（M1），`.github/workflows/release.yml`/`release-policy.mjs` **零 diff**；不签名/公证/安装器；不新增依赖/DOM 例外；不弱化断言；旧渲染器/vendor 删除后**旧端不可复跑**，双端结论只引用 5A 快照；5B 变更若超出默认 delta（入口切换/删除/迁移/e2e 目标/打包/文档），先回 PM；产品行为变更须在 5A 已冻结，5B 不得改。
- **P2**：480 镜像 chip 与动作重叠、480 完整卡标题在视口外、main 3× 200 截图位/命名、harness 标记——5B 记录「已修/仍留」，不阻塞 5A 门；若影响 5B 最终审计可读性，按 UIUX 意见处理。

### 20.5 独立验收安排

- 5B 完成后由**独立验收角色**在**新的固定上下文**按 [AC1–AC8](../../../独立验收/docs/design/2026-10-21_design_ui-platform-phase5-acceptance.md) 判断；标准已先行固定（version A1），PM 不自我验收，测试/UIUX 结论只是证据。
- 验收对象：5B 冻结候选（代码工作树 + clean build `dist/` + 本地打包产物 + 证据目录）、5A 快照；AC1 最终入口唯一/旧端下线、AC2 真实 Electron/CSP/preload、AC3 全量双端逐名、AC4 三项缺口、AC5 质量门、AC6 packaged smoke、AC7 UIUX 终审、AC8 证据/候选身份。
- **Phase 5 证据不证明真实模型/网络/`.env`、Windows/DPI/屏读、签名/公证/安装器、发布流水线**；这些按 AC 边界另列 missing-evidence，不能用 macOS 离线/本地包冒充。验收通过不授予提交/发布/部署；客户发布决定另行。
- 若独立验收上下文未能启动，5B 只能记「实施完成、待独立验收」，不得宣称 Phase 5 完成。

**当前状态：5A 门 pass；授权 5B 原子批次；5B 完成后交独立验收。** 5B 期间不得声称旧端可复跑或 Phase 5 已完成。

## 二十一、5B 实施完成与独立验收补正（2026-10-21）

**依据**：独立验收 [Phase 5 验收报告](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)（status: needs-work）、测试 5B 最终验证与 5B 证据、UIUX 5B 终审、装配冻结包。只读核对，未改实现、未重跑。

### 21.1 5B 实施与验收状态

- **5B 实施：完成**（产品门全部通过）。生产入口唯一 `app/renderer/dist/index.html`；旧渲染器/vendor/旧守卫测试已删除；本地包 `release-output/local/ANS-Studio-1.4.0-mac-arm64.zip`（406,507,281B，sha256 `edeeef19…`）；候选 HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`。
- **独立验收：needs-work**（AC1、AC2、AC4、AC5、AC6、AC7 **pass**；AC3、AC8 **needs-work**）。产品行为、质量门、双端对照、打包、UIUX 终审的原始证据成立；缺口为台账/文档/候选分离，不要求重跑产品门。
- **5B/Phase 5 门：未关闭**。补正落盘后由独立验收角色重判 AC3/AC8 受影响部分；PM 记录最终结论，不自我验收。5B 已删旧端，旧端结论只引用 5A 快照。

### 21.2 补正清单（F1–F10）与分派

| # | 缺口 | 补正动作 | 属主 |
| --- | --- | --- | --- |
| F1 | final G1–G5 漏登 `OPEN_CARD_AT_ARRIVAL` 207→206；post-fix3 台账记为 MATCH 207/207 | 补 G3 行「索引归一化」，依据 PM §19.3 + `OPEN_CARD_STABLE_AT_ANCHOR=true`；同步修正 JSON/MD 台账；不改产品 | 测试 |
| F2 | 契约面仍写旧入口/旧文件/`dist/src`/「生产入口切换待收尾」 | 最终更新 `ui-contract-surface.md`：唯一入口 `dist/index.html`、目标切换、Phase 5 三态、DOM 例外、驱动面；清理过期引用 | 桌面UI |
| F3 | 产品最终复核缺失；提案仍 `status: proposed`/未实施、未写最终入口 | 补轻量产品复核记录；提案状态与最终入口与契约面/PM 记录三处一致 | 产品 |
| F4 | 候选含 `src/common`/`provider`/`model`/`service` 与 adapter 测试等同期无关改动，未分离 | 测试列精确清单与影响说明；PM 复核确认不进入 Phase 5 判定；若影响构建/依赖/共享配置则列入环境并注明 | 测试 + PM |
| F5 | 旧端 uiux 快照套件 `d568bf82` ≠ 最终 `fa3f74d4`，旧端已删不可补跑 | 记录「5A 快照限制」；不再声称「同套件源码」；以实质对照（旧通过名新端全过、旧失败逐条登记）为准 | 测试 |
| F6 | `old-red-status.md` 679/681 与 raw 683/683 不一致；5B 504 | 统一为 683（679+4）与 5B 504，附 raw 路径；文字过期项更正 | 测试 |
| F7 | `RELATIVE_ASSET_REFS` probe 按 5A `../assets/` 判断，5B `./assets/` 输出 false；CSS 85B 变化解释不精确 | 更新 probe 到 `./assets/`；CSS 变化逐项说明或如实记为入口迁移差异；CSP 事实不受影响 | 测试 + 装配 |
| F8 | `.ti-badge` 死样式残留（无 DOM） | 非阻塞；**补正轮不改产品文件**。如清理，作为独立产品变更重新冻结并重跑受影响门；否则记录后续清理 | 桌面UI（后续） |
| F9 | UIUX 证据在 `docs/design/` 而非 AC8 字面 `docs/change`/`docs/fix` | 记录角色边界允许，不迁移；AC8 位置口径说明 | 独立验收记录 |
| F10 | `test/测试` 1 红（真实 `rg` 缺失，ENOENT） | 环境红，非 Phase 5 产品回归；不 skip/不改断言；记录本机无法验证该用例 | 测试 |

**补正原则**：只改文档/台账/证据索引，不改产品代码、测试断言、构建配置、依赖或入口路径。若补正过程中改动产品文件，必须重新冻结候选并重跑受影响门，不能沿用当前 AC 结论。

### 21.3 同期无关改动复核（F4）

测试已列名的同期改动类别：`src/common/`（codex/pi adapter、runtime-core、shared、门禁引擎）、`src/provider/`（claude/codex/runtime）、`src/model/runtime.ts`、`src/service/`（gate/runtime），以及 `test/{claude,codex,pi}-adapter/` 的测试/探针；共约 24 个 tracked/untracked 条目。**PM 复核确认**：

- 它们属其他已授权工作流（权限修复、推理强度/适配器等），**不是 UI 平台 Phase 5 的产品证据**，不进入 AC1–AC8 的 UI 行为判定。
- 它们不触及 `app/renderer/`、`app/main.ts`、`app/preload.cjs`、`vite.config.ts`、`electron-builder.yml`、release 配方；`package.json`/lock 的变化是 Phase 5/4A 已批准的 scripts/依赖，**无同期无关新依赖**。
- 它们进入候选与本地包；其中共享运行时模块（如 `src/common/shared/atomic-write.ts`）的行为影响由各自属主的测试/证据负责；Phase 5 不把 UI 行为归因于它们，也不以它们替代 UI 证据。
- 独立验收若要求共享模块影响说明，附测试清单 + 各属主测试证据；若这些改动后续变化，候选身份变化，须重新冻结并重跑受影响门。
- **PM 结论：分离后不进入 Phase 5 判定，不影响 UI 平台入口/构建/CSP/渲染层结论；候选中保留其既有授权状态。**

### 21.4 5B 门与复核安排

- **5B 门：实施完成、验收 needs-work；门未关闭。** 产品门 pass 不等于最终验收；AC3/AC8 补正后由独立验收角色重判受影响部分。
- **复核顺序**：测试补 F1/F5/F6/F7 + F4 清单 → 桌面UI 补 F2 → 产品补 F3 → PM 复核 F4 并确认无产品文件变化 → 独立验收重判 AC3/AC8（及 AC8 文档同步）→ PM 记录 5B 门/Phase 5 最终状态。
- **不需重跑产品门**：补正仅文档/台账/证据索引；若候选/产品文件变化，按 AC 标准 §2.4/§5.3 重新冻结并重跑。
- **最终验收**：独立验收角色新上下文按 AC1–AC8 判断；PM 不自我验收；Phase 5 完成/发布决定分离；真实模型/网络/Windows/DPI/屏读/签名/发布流水线仍按 missing-evidence 边界另列。

## 二十二、5B 门关闭与 Phase 5 完成（范围内，2026-10-21）

**依据**：独立验收 [Phase 5 验收报告](../../../独立验收/docs/change/2026-10-21_change_ui-platform-phase5-acceptance.md)（updated 2026-10-21，**status: verified**，**AC1–AC8 全部 pass**）、其 378 文件独立候选清单 + 16 DELETED、测试/UIUX/装配最终证据。只读核对，未重跑。

### 22.1 5B 门关闭

- **5B 门：关闭（pass）。** 独立验收 AC1–AC8 全部满足；5A 门与 5B 门均有当前候选的有效独立证据；AC3/AC8 的补正已复核关闭（`OPEN_CARD_AT_ARRIVAL` 207→206 已补 G3，380 行值不匹配 0；旧 uiux 套件版本限制以 424 个旧通过名 0 回归证实质等价；契约面/产品复核/无关改动分离/计数与 probe 已收口）。
- **最终候选（5B 冻结）**：HEAD `224cf83` + 冻结工作树；生产入口 **`app/renderer/dist/index.html`**；HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`；本地包 `ANS-Studio-1.4.0-mac-arm64.zip` **406,507,281B，sha256 `edeeef19…`**；候选身份由独立验收 378 文件清单（`ad19be24…`）+ 16 DELETED（`8520fa49…`）补齐。
- **证据要点**：main 新端 397 名 `E2E_PASS=true`、`E2E_FAILURES` 空；uiux 23 段全绿；design audit 31/31；5A 冒烟 36/36；单测 142/142；旧基线删除前 683/683、删除后 504/504；IME 24；懒挂载 10/10；bench 全过（C1 Δ=20）；gzip 288,530/289,095B ≤307,200B；packaged smoke 14/14；发布配方零 diff。
- **PM 与验收分离**：本记录是项目管理门记录，不代替独立验收；**PM 未自我验收**。验收通过不授予提交、推送、合并、部署、发布或签名权限。

### 22.2 完成范围与 missing-evidence

- **Phase 5 范围内完成（pass）**：macOS 本机、离线夹具/替身、clean build、本地 electron-builder 打包与本地 Electron 冒烟；最终入口唯一、旧渲染器/vendor/旧守卫测试下线、全量双端逐名对照、三项缺口、质量门、packaged smoke、UIUX 终审、证据可复算均满足 AC1–AC8。
- **六类本轮未判（不得写成已通过）**：真实模型/网络/`.env` 生产验证；Windows 原生/DPI/屏读；签名/公证/安装器/自动更新；发布流水线与 CI（`release.yml`/`release-policy.mjs` 零 diff，M1 不接）；Linux/其他平台；真实主进程卡通道/真实引擎会话（非替身）。这些不阻塞本轮范围内 pass，但客户另行授权时须新增标准/证据，不能用 macOS 离线或本地包代替。
- **发布决定**：下一次冻结源/新发布轮、是否接发布流水线、签名/公证、对外发布均由客户决定；本轮不改 release 配方，也不声称 CI/发布通过。

### 22.3 非阻塞遗留清单

| # | 项 | 状态/属主 |
| --- | --- | --- |
| 1 | `.ti-badge` 死 CSS 规则（无 DOM，不影响 AC4） | 保留以维持冻结 hash；后续清理（桌面UI） |
| 2 | 装配对 5B CSS 85B 变化的说明精度 | 行为证据逐名一致；说明可后续补精（装配） |
| 3 | `test/测试` 的 `rg` 环境红（真实 ripgrep 缺失） | 本机环境红；安装真实 `rg` 后可转绿；不 skip/不改断言（测试） |
| 4 | UIUX 证据位于 `docs/design/` 而非 AC8 字面 `docs/change`/`docs/fix` | 角色边界允许；记录口径，不迁移（独立验收记录） |
| 5 | 产品复核/提案中「AC3/AC8 补正中」的时点措辞 | 下次文档更新改为「已补正」；不影响当前结论（产品） |
| 6 | 提供方 manifest 10 文件 vs 独立验收 378 文件清单 + 16 DELETED | 独立验收已补完整清单；提供方可后续补同格式 manifest（非阻塞，测试/装配） |

### 22.4 最终状态

- **5B 门：关闭；Phase 5 实施与独立验收：完成（范围内 pass）。** 项目管理记录阶段门与证据索引；独立验收结论为最终判断；两者分开。
- **发布/提交/合并/部署/签名**：未授权、未执行；客户决定。`release.yml`/`release-policy.mjs` 零 diff；下一次冻结源/新发布轮另行。
- **文档同步**：本评审文档、changelog、feature-map、memo、工程法案 §三同步；其他角色文档由其属主维护，本角色不代写。

## 附：核对方式与状态声明

- **只读核对的文件**：`角色卡/项目管理/role-card.md`、`boundary.yaml`、`docs/project-rules.md`、`docs/architecture.md`；`角色卡/产品/docs/design/2026-10-21_design_ui-platform-round.md`；`package.json`、`package-lock.json`（规模）、`tsconfig.json`、`electron-builder.yml`、`.github/workflows/release.yml`、`src/common/装配/release-prepare.mjs`、`release-policy.mjs`、`release-verify.mjs`、`app/main.ts`、`app/preload.cjs`（头部）、`app/renderer/index.html`、`app/renderer/styles.css`（令牌段与 `:root` 位置）、`app/renderer/renderer.js`（测试驱动与虚拟行片段）、`app/renderer/vendor/README.md`、`test/桌面应用/renderer.test.ts`（头部）、`test/桌面应用/markdown.test.ts`（pin 片段）、`test/桌面应用/e2e/{ime-enter,bench-storm}.mjs` 全文与 `{main,uiux-v2,uiux-design-audit,uiux-prototype-measure}.mjs` 的载入/驱动面；各相关角色 `boundary.yaml` 与部分 `boundary.md`。
- **执行过的只读命令**：`wc -l`、`grep`、`sed`、`git rev-parse`、`git status`、目录列举。**未运行**应用、e2e、`node --test`、`npm ls`、构建或任何网络请求；未读 `.env`。文中所有套件计数是 grep 行计数，不是通过结果。
- **Phase 3 门裁定另只读核对**：测试角色的 Phase 3A 独立验证报告与证据索引（含 bench 预注册、DOM 契约评估、uiux-v2 新入口报告）、A/B/C/D check 台账、延迟挂载正向检查脚本与 10/10 证据、UIUX Phase 3A 评审（3A2 复核）、桌面UI Phase 3A 变更记录与 `ui-contract-surface.md`；3B 阶段另只读核对 3B 独立验证与五项修正重验、UIUX 3B 评审（修正后 pass）、桌面UI 3B 变更记录与证据目录；4A 阶段另只读核对桌面UI 4A 范围/写集、UIUX 4A 设计附录与原型证据、测试台账 §七；4A 实施期另只读核对 `ChatRow.tsx` 失效卡行为、旧 `renderer.js::freezeOperatorCard`、RUNTIME 断言与 `Sidebar.tsx` 双徽标；4A 门关闭另只读核对 UIUX 4A 评审（M1–M6 复核）、测试 4A 独立验证与 M1–M6 重验、桌面UI 4A 变更/证据；4B 阶段另只读核对桌面UI 4B 范围/写集、UIUX 4B 设计确认、测试台账 §八，并核对 README v1.4.0 的五角色口径与 `uiux-v2` MIRROR 旧四角色夹具；4B 门关闭另只读核对 UIUX 4B 评审（返工/200% 复核）、测试 4B 独立验证/返工重验/200% 收口重验、桌面UI 4B 变更/证据；Phase 5 授权另只读核对独立验收角色卡/边界与 `main.ts` 当前加载路径；5A 阶段另只读核对桌面窗口入口方案、独立验收 AC1–AC8、桌面UI 5A 写集/删除/迁移、装配本地构建/打包、测试全量双端计划/套件清单、UIUX 终审计划，并核对 `ANS_DEV_SERVER_URL`/`ANS_RENDERER_URL` 命名与 `test/装配/` 归属；5A 实施期另只读核对桌面窗口 5A 报告 §四/§五/§七/§八、`report-diff.md/json`、`main.ts`/preload 的 `openExternal` 与导航面、`chat/markdown.ts` 的 `.md-link` 输出；5A 门复核另只读核对测试 5A 独立验证、main/repair 台账、uiux 台账、design audit 12 条失配与旧端快照；5A 修复轮另只读核对桌面窗口 harness 归因（4 项夹具泄漏、PROMISE_TIMEOUT 驱动）与新快照计数；UIUX 5A 新端视觉审计另只读核对 P0/P1/P2、12 条重锚复核与候选 hash 时效；最终分组另只读核对重分报告、`final-regroup-ledger.md`、`final-allowed-diff-ledger.json` 与 post-fix3 证据索引；5A 门关闭另只读核对测试最终验证、UIUX 最终审计、装配冻结包与 final3/final4 证据；5B 验收另只读核对独立验收报告 AC1–AC8、F1–F10、候选/包/证据索引、契约面现状、产品提案状态、同期无关改动清单与 `package.json`/构建配置 diff；最终重判另只读核对独立验收报告 status: verified、AC1–AC8 全过、378 文件候选清单/16 DELETED、非阻塞遗留与 missing-evidence 六项。未重跑任何测试，裁定/放行中的数值均来自上述报告原文。
- **第三方事实**：Nova/base-nova 的发布时间与 CLI 默认值来自客户确认的方向正文，本评审未独立复核，Phase 0 以实际 CLI 为准。
- **未收集的受影响角色评估**：本上下文只承担项目管理角色，未派发桌面窗口、门禁引擎、测试、UIUX、产品的独立评审意见。文中对这些角色的影响判断是 PM 基于文件与边界的只读核对，不表示其已同意；需要其独立评估的条目（Q8 的 store 边界、Phase 5 载入路径、测试阈值与套件改造、Phase 0 视觉门）在派发后于各自固定上下文收集，未收到前按显式缺口处理。
- **状态**：本文是评审与实施口径（revision 19，status: approved；revision 1 结论为「需修订」，revision 2 复审通过见 §1.4，revision 3 追加 Phase 3 门裁定见 §十，revision 4 追加 3B 前置复核见 §10.6，revision 5 追加 Phase 3 关闭与 Phase 4 授权见 §十一，revision 6 追加 4A 复核放行见 §十二，revision 7 追加 4A 实施期裁定见 §十三，revision 8 追加 4A 门关闭与 4B 授权见 §十四，revision 9 追加 4B 复核放行见 §十五，revision 10 追加 4B 门关闭/Phase 4 完成/Phase 5 授权见 §十六，revision 11 追加 5A 复核放行见 §十七，revision 12 追加 5A 实施期 Markdown/双端差异裁定见 §17.12/§17.13，revision 13 追加 5A 门复核与修复授权见 §十八，revision 14 追加 5A 修复轮 harness-only 批准与新快照见 §17.13，revision 15 追加 UIUX 5A 新端 P0/P1 门阻塞见 §18.7，revision 16 追加 5A 最终分组裁定与重锚批准见 §十九，revision 17 追加 5A 门关闭与 5B 授权见 §二十，revision 18 追加 5B 实施完成与独立验收补正见 §二十一，revision 19 追加 5B 门关闭与 Phase 5 范围内完成见 §二十二），不是实施、测试或部署记录；评审通过、门裁定与授权均不构成最终验收；最终验收结论以独立验收报告为准。
