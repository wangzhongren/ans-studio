---
id: ui-platform-phase5-acceptance
type: design
title: UI 平台 Phase 5 独立验收标准——切换、下线与双端等价
version: A1
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: ready
related: [ui-platform-round, ui-platform-round-review, check-ledger-phase3a, ui-platform-phase4b-governance-receipts]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 PM §16.5 新立项，在 5A/5B 交付前固定候选身份、AC1–AC8、证据要求、三态判断与 missing-evidence 边界；本文件只定标准，未验收任何候选
---

# Phase 5 切换验收：旧渲染器下线后，新入口要拿得出同等证据

旧渲染器要下线，新入口要接班。这件事不能只用一句「测试都过了」收尾：同一套检查，旧端和新端要逐名对齐；删除旧端之前，旧端的结果要先留档；三项已知缺口要在**官方套件**里真正通过；构建、预算、性能、本地打包和视觉审计都要有原始输出。本文件先把「怎样算完成」写死，等 5A/5B 交付后再逐条判断。

**本轮判什么**：macOS 本机、离线夹具、本地构建与本地 electron-builder 打包范围内的 Phase 5 切换。
**本轮不判什么**：真实模型/网络/`.env`、Windows 原生/DPI/屏读、签名/公证/安装器、发布流水线/CI。它们不阻塞 Phase 5 范围内通过，但也不能被 macOS 离线结果、本地包或测试自述冒充。见 §六。

## 一、依据、版本与当前状态

- **授权与口径**：项目管理 [UI 平台化评审与实施口径](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md) revision 10（status: approved）§16.2（Phase 5 授权范围）、§16.3（5A→5B 硬顺序与门前置）、§16.4（派发与写集）、§16.5（最终验收安排）、§16.6（约束）。本文件按 §16.5 在 Phase 5 交付前固定标准。
- **产品方向**：[UI 平台化提案 revision 2](../../../产品/docs/design/2026-10-21_design_ui-platform-round.md)。本文件只把它作为方向与判据来源；提案中的「未实施」状态不因 Phase 5 授权自动变为已实现。
- **4B/Phase 4 门**：PM §16.1 记载 4B pass、Phase 4 完成；测试 [4B 独立验证](../../../测试/docs/change/2026-10-21_change_phase4b-independent-verification.md)、[返工重验](../../../测试/docs/change/2026-10-21_change_phase4b-fix-reverification.md)、[200% 收口重验](../../../测试/docs/change/2026-10-21_change_phase4b-200pct-reverification.md)、UIUX [4B 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4b-review.md) 是**证据输入**，不是本角色的最终判断，也不重开已关闭的 Phase 4 门。
- **台账**：[check 台账 §七/§八](../../../测试/docs/change/2026-10-21_check-ledger-phase3a.md)，尤其 §7.2 的 Phase 5 组 11 名、§8.4 的 DELIVERY_NOTE/COMPLETE_FLOW/VISUAL 4B 与 Phase 5 分界、§8.6 的 4B 门必过清单。
- **本文件状态**：**标准就绪（A1），尚未验收任何候选**。Phase 5 的 5A/5B 代码、构建产物、测试报告与 UIUX 审计尚不存在；候选未冻结，AC1–AC8 均未判断。下文所有「必须」都是交付后的核对条件，不是已发生事实。
- **角色独立**：本上下文只承担独立验收，只写 [boundary.md](../../boundary.md) Section 1 与本任务共同许可的路径；不改产品代码、测试、断言、他人报告、权限或调度状态，不代跑全部测试，不派发。测试与 UIUX 的结论只是证据，验收独立判断。

## 二、验收对象与候选身份

### 2.1 最终候选（5B）

Phase 5 的验收对象是**5B 交付完成后的最终候选**，由四部分组成，缺一不可：

1. **代码候选**：冻结时点的 git 工作树——`HEAD` 提交 + 全部未提交改动（含新增、修改、删除、未跟踪文件）。本仓库当前（2026-10-21）UI 平台化工作就在未提交工作树上，HEAD `224cf83` 不能单独标识候选。
2. **构建产物**：`npm run build:renderer` 从同一候选 clean build 出的 `app/renderer/dist/`（最终入口 HTML + JS + CSS 及全部引用资产）。
3. **本地打包产物**：`electron-builder` 本地打包出的 `release-output/` 包（实际路径以装配记录为准），以及包内容清单。
4. **证据目录**：各角色 `docs/change/` 下的 Phase 5 证据目录、原始输出、截图与索引。

验收同时读取 **5A 快照**（见 2.2）作为旧端唯一依据。Phase 5 判定 = 5A 门通过 + 5B 门通过 + 最终候选上 AC1–AC8 全部满足；5A 或 5B 任一未过，Phase 5 不能记完成。

### 2.2 5A 快照与 5B 新入口的候选边界

PM §16.3 规定 5A→5B 硬顺序：**5A 门通过前不得删除旧渲染器/旧测试/vendor**；全量双端证据以 5A 快照为准，5B 删除后不得再声称旧端可复跑。据此固定边界：

| 项 | 5A 快照 | 5B 最终候选 |
| --- | --- | --- |
| 生产默认入口 | 旧 `app/renderer/index.html` 仍是生产默认；`app/main.ts` 生产路径不得指向构建产物 | 唯一最终入口为构建产物；`app/main.ts` 生产路径只指向它 |
| 入口路径 | 新渲染器过渡入口 `app/renderer/dist/src/index.html` 可继续使用 | PM §16.2：最终路径只允许一个并写入契约/提案；优先 `dist/index.html`；若保留 `dist/src/index.html`，必须说明理由并统一 `main.ts`、e2e、打包冒烟三处 |
| 旧渲染器/vendor/旧守卫测试 | 仍在，**不得删除**；旧渲染器文件相对 4B 关闭状态零 diff，或仅有已登记的行为不变基线变更 | 按批准清单删除；先迁移 XSS 负例与仍有价值的纯逻辑测试，再删除 |
| `app/main.ts` | 可落地 dev/prod 加载策略，但生产仍加载旧入口（PM §16.3 允许暂不切换） | 生产加载最终构建入口；旧入口路径不再被引用 |
| 三项缺口 | 在**新入口**实现，并在官方 `uiux-v2` 检查中通过 | 随 5B 候选复跑并保持通过（不得只在 5A 过、5B 回退） |
| 双端对照 | 旧端 + 新端同套件、同机同日、逐 check 名快照 | 新入口全量套件；旧端值只能引用 5A 快照，不能再跑旧端 |
| 本地打包 | 本地打包 dry run | 本地打包 + packaged smoke |
| UIUX | 最终视觉审计**计划**（关键面/三档/旧新对照） | 最终视觉审计**执行**与结论 |
| 证据 | 5A 独立验证（测试角色） | 5B 独立验证（测试角色） |

**5A→5B 允许的 delta（默认封闭集）**：

- `app/main.ts` 生产入口切换与最终路径统一；
- 旧渲染器/vendor/旧守卫测试的删除，以及迁移到 `test/桌面UI/` 的测试；
- e2e 目标切换（只允许入口/环境变量注入，不改断言、不加新端专用分支）；
- 打包/装配本地 release 准备（不接发布流水线）；
- 最终 UIUX 视觉审计、文档、契约面与证据更新。

**边界规则**：

- 三项缺口若在 5A 已实现并通过，5B 不得再改其行为，只复跑确认。
- 任何**产品行为变更**（含聊天热路径、行模型、工具组折叠/懒挂载、C1 呼吸位、滚动/贴底、卡族、治理、报告/回执、设置、队列）都不属于 5B 默认 delta。若确需变更，必须在 5A（旧端尚在）完成并重做旧/新对照；5B 才发现的此类变更必须先回 PM，不能靠「旧端已删」绕过双端证据。
- 5B 之后任何超出默认 delta 的改动，都会使 5A 双端对照对该面失效，按 §五判 missing-evidence 或 needs-work。
- 5A 的旧端文件必须相对 4B 关闭状态零 diff；若 4B 关闭后已有经 PM/安全派发批准并登记的行为不变改动（例如 vendored markdown-it 15.0.2→15.0.3 安全升级），必须列入「基线变更清单」并说明行为不变与测试回跑，不能默默改动；未登记改动不得算入旧端基线，须 PM 明确批准重基线，否则不得作为对照依据。

### 2.3 候选身份记录（冻结清单）

每个候选（5A、5B 各一份）至少提供：

| 项 | 要求 |
| --- | --- |
| `HEAD` | `git rev-parse HEAD` 的完整 SHA |
| 工作树清单 | `git status --porcelain` 的完整原始输出；逐项区分新增/修改/删除/未跟踪 |
| 内容摘要清单 | `candidate-manifest.sha256`：对本阶段写集内每个文件给出 SHA-256；删除文件标 `DELETED`；按路径排序。至少覆盖 `app/main.ts`、`app/preload.cjs`、`app/desktop/`、`app/renderer/src/**`、`app/renderer/dist/**`、`test/桌面应用/e2e/**`、`test/桌面UI/**`、`test/桌面应用/*.test.ts`、`package.json`、`package-lock.json`、`vite.config.ts`、`electron-builder.yml`、`tsconfig*.json`（以实际写集为准） |
| 代码差异 | `git diff HEAD`（含二进制标记）存档路径；未跟踪文件逐个列名并给摘要，不能只用「新增若干」 |
| 构建产物清单 | `dist/` 全部文件路径 + 大小 + SHA-256；clean build 命令、时间、退出码；入口 HTML 实际引用的 JS/CSS |
| 打包产物清单 | 包路径 + 大小 + SHA-256；包内容清单能证明旧渲染器/vendor 不在包内 |
| 环境 | OS/架构、Node/npm、Electron、electron-builder、Vite、套件版本、窗口尺寸/缩放、夹具项目、环境变量名（不记录值）、日期与同机同日标记 |
| 同期无关改动 | 工作树中与 Phase 5 无关的并行改动须单独列名并说明不进入 Phase 5 判定；若其影响构建/依赖/共享配置，则必须计入环境并说明影响 |

验收会**独立复算** AC 关键文件的摘要（至少入口、`app/main.ts`、`preload.cjs`、e2e 套件、`dist` 入口与资产、本地包），与清单比对。任何不一致都按「候选已变化」处理，不能沿用旧结论。

### 2.4 冻结与证据失效

- 判定前先冻结候选；冻结后产品代码、测试、断言、构建配置、依赖或入口路径的任何变化都使**受影响证据失效**，需重新冻结并重跑受影响门。
- 仅文档/证据文字更新不改产品候选，但若改动了结论或名单，须在验收记录中记 delta 并重判受影响 AC。
- 重新构建产生不同产物摘要即为新候选身份；不能用「同一源码」口头保证代替产物摘要。
- 5A 快照冻结后，5B 删除旧端之前不得再改旧端；否则旧快照失效。

## 三、完成标准 AC1–AC8

> 判定范围是 Phase 5（5A + 5B）。5A 未过不得删除旧端；5B 未过不得判 Phase 5 完成。每条 AC 都以冻结候选上的**原始证据**为准；计数、自述、只读补证副本不能代替名单与官方运行。

| AC | 主题 | 主要阶段 | 主责（证据提供） |
| --- | --- | --- | --- |
| AC1 | 生产入口唯一、旧渲染器/vendor/旧守卫测试下线 | 5A/5B | 桌面窗口 + 桌面UI + 装配 |
| AC2 | 新入口真实 Electron 启动、严格 CSP、preload 桥、关键流程 | 5B | 桌面窗口 + 桌面UI + 测试 |
| AC3 | 全量双端逐 check 名对照与 5A→5B 一致性 | 5A/5B | 测试（主导）+ 桌面窗口/桌面UI |
| AC4 | 三项 Phase 5 缺口关闭 | 5A/5B | 桌面UI + 测试 |
| AC5 | 质量门（类型/构建/CSP/gzip/单测/旧基线/IME/懒挂载/bench/C1） | 5A/5B | 装配 + 测试 + 桌面UI |
| AC6 | 本地打包与 packaged smoke（不接发布流水线） | 5B | 装配 + 桌面窗口 + 测试 |
| AC7 | UIUX 最终视觉审计（1360/960/200%，关键面） | 5A/5B | UIUX |
| AC8 | 证据、候选身份与文档同步可核对 | 5A/5B | 全部 + 独立验收复算 |

### AC1 生产入口唯一，旧渲染器/vendor/旧守卫测试按批准范围下线

**必须观察到**

1. **最终入口唯一**：PM 与契约面记录一个最终入口路径；生产 `app/main.ts` 只加载它；不存在第二个生产入口或回退到旧 `app/renderer/index.html` 的路径。若最终保留 `dist/src/index.html`，`main.ts`、全部 e2e 套件（含 IME）与打包冒烟必须使用同一路径，并在契约/提案写明理由。
2. **dev/prod 策略**：dev 仅非打包环境可加载 Vite server 或构建产物；打包/生产只加载构建产物；生产不放宽 CSP。
3. **5A 旧端完整性**：5A 期间旧 `app/renderer/index.html`、`renderer.js`、`styles.css`、7 个经典脚本（`engine-selector.js`、`markdown.js`、`renderer.js`、`role-status.js`、`runtime-ui.js`、`tool-rows.js`、`ui-labels.js`）、`vendor/` 均未删除；旧端相对 4B 关闭状态零 diff，或仅有已登记的行为不变基线变更（如 markdown-it 15.0.3 安全升级）并附依据与回跑；`app/preload.cjs`、`app/desktop/` 未改（除 PM 批准的新 IPC）；`app/main.ts` 只做授权的 dev/prod 实现，生产仍加载旧入口。
4. **5B 删除清单**：按 PM §16.2 与桌面UI 写集删除旧 `index.html`、`renderer.js`、`styles.css`、7 个经典脚本、`vendor/` 与旧渲染器源码/模块守卫测试。以 5A 台账逐文件名单为准；至少包括 `test/桌面应用/renderer.test.ts`、`markdown.test.ts`、`runtime-ui.test.ts`、`tool-rows.test.ts`、`hot-path.test.ts` 中依赖旧渲染器文件的部分（是否整文件删除或拆分迁移，以 5A 清单为准）。
5. **先迁移后删除**：XSS 负例与仍有价值的纯逻辑测试先迁移到 `test/桌面UI/` 并在新封装上全绿，再删除旧文件；提供「旧测试名 → 新测试名/路径」逐条映射，或 PM 批准的明确退役理由。XSS 负例不得因迁移丢失；Markdown 仍为单一 npm 精确版本（当前为安全升级后的 15.0.3，以装配依赖记录/安全派发为准；Phase 5 不得再更换），配置钉子（`html:false`、链接白名单、图片/表格禁用等）保留。
6. **无悬挂引用**：构建、`main.ts`、preload、e2e、`package.json`/`electron-builder.yml` 中不再引用被删文件；包内容清单不含旧渲染器/vendor。
7. **发布冻结不变**：`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs` 零 diff；不接发布流水线；不改签名/公证/安装器配置。

**判失败情形**：仍有两个生产入口或旧入口仍被生产引用；5A 阶段删除/改动了旧端导致快照失真；旧守卫测试未迁移即删除或 XSS 负例丢失；删除后仍有悬挂引用；release 文件被改动。

### AC2 新入口真实 Electron 启动、严格 CSP、preload 桥与关键流程

**必须观察到**

1. **真实 Electron 启动**：用真实 Electron（非 jsdom、非静态检查）加载最终构建入口；`loadFile` 成功、首屏渲染、无 load failure、无未捕获异常、控制台零 error。
2. **严格 CSP**：
   - 生产入口 HTML 的 CSP 为 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`（与现有生产 meta 同义，不放宽）；
   - 构建产物零内联 `<script>`、零内联 `<style>`、零 `style=` 内联属性；无 `unsafe-inline`/`unsafe-eval`；`modulePreload` polyfill 关闭；
   - 真实 Electron 运行中 `securitypolicyviolation` 零事件、零 CSP/CORS 控制台错误；file:// 下 ES 模块/分块加载正常。
3. **preload 桥**：`app/preload.cjs` 相对 4B 关闭状态零 diff，或新增 IPC 已经 PM/契约评审批准并登记；`contextIsolation=true`、`nodeIntegration=false`、`sandbox=false` 等既有窗口设置不变；渲染层仍只能经 preload 暴露的桥访问主进程。
4. **关键流程可用**：以旧端基线为清单，至少覆盖项目/角色加载、会话打开与历史回放、发送/停止/排队撤回、附件、受控 Markdown、operator/shell/恢复/治理卡、报告/持久化/回执、三引擎设置、资料/文档抽屉、工作概览/队列、引擎切换、窗口控制/主题、960 与 200% 布局。对应官方 check 名在 5B 新入口全部可达且通过（与 AC3 共用证据）。
5. **无新端专用分支**：e2e 只允许入口/环境变量切换；不得为让新入口通过而加测试专用分支或改断言。

**判失败情形**：只做静态检查或 jsdom 代替真实 Electron；CSP 放宽或出现内联/unsafe；preload 被未授权修改；关键流程只在探针/补证副本中过、官方套件未到达；为新端加专用分支。

### AC3 全量双端逐 check 名对照（5A 旧快照 → 5A 新入口 → 5B 新入口）

**必须观察到**

1. **套件范围**：`uiux-v2`（全部段/模式）、`main.mjs`（整机自检全部具名 report 行）、`uiux-design-audit`（全部 `v3check` 名）、`bench-storm`（指标；基准台不是通过/失败套件）。`ime-enter` 的 24 名基线同样做双端同名对照，作为 AC5 的 IME 证据。
2. **同套件、同机同日、只换入口**：5A 时旧端与新端用**同一份**套件源码、同机同日运行；除入口/环境变量外不改断言、不加分支。旧端必须在 5A 真正跑完并留档。
3. **逐名对照表**：每个套件每个段输出一份对照表，列至少：
   - check 名（逐字，不用计数代替）；
   - 5A 旧端值；
   - 5A 新端值；
   - 5B 新端值；
   - 判定（同过/同红/旧过新红/旧红新过/不适用）；
   - 允许差异登记（旧名→新名、旧值→新值、依据、PM 批准引用）。
   对照表必须覆盖运行报告中的**全部名字**；`main.mjs` 的 `NAME=value` 行、`uiux-design-audit` 的中文 check 名、`bench` 的每个指标都要列出。计数只能作汇总，不能代替名单。
4. **等价规则**：
   - 旧端通过 → 新端必须通过；
   - 旧端失败 → 新端可以同红（双端同值）或转绿（记录为改进），不得更差；
   - 新端出现旧端没有的失败、或值比旧端差（含 C1/bench/IME/懒挂载/gzip/CSP）→ needs-work；
   - 新端独有检查只允许是新增覆盖，必须列名并说明，不得替换旧名。
5. **允许差异**：只允许逐条登记并经 PM 批准的差异。至少包括已批准的 C2 重锚/退役（PM §15.6/§16.1）、MIRROR 四角色→五角色（PM §15.2）、Phase 4 已登记的 DOM 例外（延迟挂载 40、失效/排队卡动作 hidden）。任何未登记的改名、退役、降级、删断言都不接受。
6. **Phase 5 已知组必须到达并通过**：默认段 Phase 5 组 11 名、`DELIVERY_NOTE` Phase 5/回归 4 名、`COMPLETE_FLOW` Phase 5 名单、`VISUAL` Phase 5 组 29 名（见附录 A）。这些组在 5A/5B 的官方 `uiux-v2` 运行中必须真正到达、跑完并通过；不能再用「只读补证副本跳过 Phase 5 阻断项」代替。5A 时若官方套件仍被 Phase 5 项阻断，阻断项本身必须在本阶段关闭，而不是用探针绕过。
7. **5A→5B 一致性**：5B 新入口与 5A 新入口逐名对比；默认 delta 内只允许相同或更好。若某 check 在 5B 变化，必须给出对应 delta 依据并在受影响面重做证据；旧端已删，不得声称旧端复跑。
8. **`main.mjs` 与 `uiux-design-audit` 目标切换**：这两个套件当前写死旧入口；Phase 5 必须由属主加入入口切换（只注入路径，不改断言），5A 时能在旧端运行并留档。若某套件确实无法在旧端或新端运行，必须逐项列名说明并 PM 批准，不能用计数略过；新端无法运行而旧端可运行，按 needs-work/missing-evidence 处理。
9. **`bench` 对照**：按 §10.3 同机同日旧/新交替，列每个指标旧/新中位、p95、单轮最大、阈值与结论；5B 复跑新端并与 5A 新端非回归比较（见 AC5）。

**判失败情形**：用计数代替名单；只跑默认段不跑其余段；用探针/补证副本代替官方到达；旧端快照未在删除前完成；新端比旧端差；未登记的改名/退役；5B 变化超出默认 delta 且无 PM 批准与重做双端证据。

### AC4 三项 Phase 5 缺口关闭

三项必须在**官方 `uiux-v2` 运行**中通过（不是探针、不是跳过），且在 5B 复跑保持：

| # | 缺口 | 必须通过的官方 check 名 | 必须观察到的结果 |
| --- | --- | --- | --- |
| 1 | Sidebar 身份徽标 | `builtin identity stays data and accessible without duplicate third visible line` | 主入口树项保留 `builtin` 语义与 `aria-description`（含「内置」「主入口」）；**没有**重复的第三行可见徽标（`.ti-badge` 不存在）；身份仍可被辅助技术读到 |
| 2 | P7 角色树「待选择」文案 | `P7 choice pending separated from empty queue` | `#role-tree` 与 `#right-body` 均出现「待选择」；空队列文案为「无进行中或排队消息」；待选择与空队列语义分开，不混淆 |
| 3 | 虚拟窗口阅读锚点 | `full replay preserves content identity` | full replay 前后同一段正文的文本相同，阅读偏移差 `<2px`；官方默认段真正到达该检查并跑完后续检查 |

**证据**：5A 与 5B 的 `uiux-v2` 官方 `report.json` 中对应名字为 true，附段名、报告路径与截图（左树/角色树/长会话阅读位置）。只读补证副本、单元测试或冒烟可以补充，不能替代官方 check。

**判失败情形**：任一项只在探针中过；官方段未到达；5B 回退；用隐藏角色/缩小字号/删除文案等方式「过图」；用 `.ti-badge` 或第三行可见文本冒充身份可访问。

### AC5 质量门（类型/构建/CSP/gzip/单测/旧基线/IME/懒挂载/bench/C1）

**必须观察到**（每项都要命令、退出码、原始输出；数值以同一冻结候选的 clean build 为准）：

| 门 | 要求 |
| --- | --- |
| 根类型检查 | `npm run typecheck` exit 0 |
| 渲染类型检查 | `npm run typecheck:renderer` exit 0 |
| 构建 | `rm -rf app/renderer/dist && npm run build:renderer` exit 0；产物含入口 HTML + JS + CSS；无旧入口被卷入 |
| CSP 静态 | 严格 meta；零内联 script/style/`style=`；无 `unsafe-inline`/`unsafe-eval`；modulepreload polyfill 关闭；与 AC2 同口径 |
| gzip 预算 | 入口 HTML 实际引用的资产（JS+CSS）gzip level 9 合计 **≤307,200B（300KiB，即任务/PM「≤300KB」在本项目 3B/4A/4B 证据中的既有口径）**；沿用同一度量脚本，其报告同时列出 HTML 字节明细；逐文件列出 JS/CSS/HTML 字节数；不得换更宽口径 |
| 新单测 | `node --test "test/桌面UI/*.test.ts"` 全绿、0 失败；4B 基线 96 名全部保留或按映射迁移；新增不设上限；不得删除覆盖而不登记 |
| 旧基线（删除前） | 5A 在任何旧测试迁移/删除**之前**，`node --test test/桌面应用/*.test.ts` **679/679**、0 失败；迁移/删除后剩余旧测试全绿，并附「679 → 新计数」的逐名 delta 与迁移/退役依据 |
| IME | 新入口 `ime-enter.mjs` 24 个基线 check 全 true、0 false、`E2E_DONE=1`；名称与旧端同名对照（AC3） |
| 懒挂载 | `test/测试/phase3a-lazy-toolgroup-check.mjs` **10/10**、`LAZY_TOOLGROUP_DONE=1`；DOM 例外仍只有延迟挂载 40 + 失效/排队卡动作 hidden，无新增 |
| bench §10.3 | 同机同日、旧/新交替、预热排除、每目标 ≥3 有效轮；`stormA/stormB.maxGap` 新中位 ≤ max(旧中位, 25ms)；`stormA_handler.maxMs`/`stormB_handler.maxBatchMs`/`replay.replayMs`/`scrollToBottom.ms` 新中位 ≤ max(旧中位×1.2, 旧中位+5ms)；有效轮 p95 ≤35ms；单轮 ≤50ms。5B 复跑新端，相对 5A 新端非回归，且仍满足上述护栏；旧端数据只能引用 5A 快照 |
| C1 | TOOLFOLD `fold anchor offsets` 新 Δ **≤32px**，目标 **≤20px**；5B 不得比 5A 新端更差；不得用放宽断言换绿 |
| 依赖/例外/断言 | 零新增依赖（除 PM 四问批准，本轮预期零）；无新增 DOM 例外；不弱化/删除断言；preload 零 diff 或经批准；release 文件零 diff |

**判失败情形**：任一命令非 0；gzip 超 307,200B；单测/旧基线/IME/懒挂载/bench/C1 任一红；旧基线 679 未在迁移前取得；用旧日/异机 bench 数据；新增依赖/DOM 例外/断言弱化。

### AC6 本地打包与 packaged smoke（不接发布流水线）

**必须观察到**

1. **构建顺序**：先 `npm run build:renderer`，再由 `electron-builder` 本地打包；`dist` 被包覆盖；不改 `electron-builder.yml`（`files: app/**/*` 已覆盖 `dist`），除非 PM 批准。
2. **包内容**：最终入口与全部引用资产在包内；旧渲染器/vendor 不在包内；`release-output` 包路径、大小、SHA-256 记录。
3. **真实打包产物启动**：用真实 Electron 运行本地打包产物（不是源码目录、不是 dev server），加载最终入口；窗口创建、首屏渲染、preload 桥可用、关键 IPC 往返成功；控制台零 error、零 CSP violation、零 load failure。
4. **离线**：packaged smoke 使用离线夹具/替身；不连接真实模型/网络、不读 `.env`。
5. **不接发布流水线**：`.github/workflows/release.yml`、`release-policy.mjs` 零 diff；不签名/不公证/不做安装器/不 publish；不声称发布或 CI 通过。

**判失败情形**：只在源码目录启动、只用 dev server、只做静态检查；包内仍含旧渲染器/vendor；packaged smoke 缺失或失败；改了 release 文件或接入流水线；把本地包说成发布件。

### AC7 UIUX 最终视觉审计（1360/960/200%，关键面）

**必须观察到**

1. **三档**：1360×860、960×620、200%（在 960×620 窗口 `setZoomFactor(2)` 或等价真实 Electron 方式）。每档都要有真实 Electron 截图与可复核的测量断言，不能只放图片。
2. **关键面**：治理状态/预览、三权/五角色树、镜像卡、报告/完整摘要/证据、交付/回执、队列/工作概览、三引擎设置、资料/文档抽屉、菜单配置状态、聊天/输入区、空态/错误态。每面至少在 1360/960 覆盖，200% 覆盖治理预览、报告/完整摘要、角色树、缺配提示、输入区等关键面。
3. **旧新对照**：与旧端同尺寸截图/几何对照；不出现第二套设计系统/令牌/图标/动画；Nova × 深色石墨的对比度不下降；状态不靠颜色单独传意；焦点可见；200% 逐容器 `scrollWidth<=clientWidth+1`，无横向滚动条；报告 facts 标签/值分隔；树行不重叠、可滚动到达；长路径/长证据/按钮不被裁切。
4. **4B 延后的打磨项**：UIUX [4B 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4b-review.md) §四/§九 列出的可随 Phase 5 项（镜像卡截图、真实迁移回包、治理 flow 四态、聚合 Clock、gp 按钮尺寸、delivery blocked 竖条、报告 details 长文等）若纳入 Phase 5 派发清单，则按清单判；未纳入的不作为 Phase 5 阻断条件，但必须在审计记录中逐项写明「未纳入/已修/仍留」，不能静默消失。
5. **结论**：UIUX 审计结论 pass；验收读取其原始截图、测量输出与限制说明，不把「UIUX 说 pass」直接当成最终判断。

**判失败情形**：缺 200% 关键面；只给截图不给测量；出现新设计源/裸色值/第二图标/热路径动画；200% 横溢或内容被裁；960 树重叠；对比度下降；把未纳入的打磨项说成已修。

### AC8 证据、候选身份与文档同步可核对

**必须观察到**

1. **候选可复算**：§2.3 的清单齐全；验收独立复算关键摘要一致；5A/5B 各自有冻结记录；同期无关改动已分开标识。
2. **原始证据**：每个门有命令、工作目录、退出码、原始 stdout/stderr、执行时间、环境、候选摘要；套件有 `report.json`/`report.txt` 路径；bench 有每轮原始 JSON/日志；失败/跳过/探针逐项保留，不删失败记录。
3. **官方与探针分开**：官方运行（未改套件、跑到套件完成标记）与只读补证副本/探针分目录、分标签；探针只用于诊断，不作为 AC3/AC4 通过证据。
4. **文档同步**：
   - 契约面 `角色卡/桌面UI/docs/feature/ui-contract-surface.md` 最终更新：最终入口路径、目标切换、Phase 5 三态、DOM 例外、驱动面；最终入口路径同时写入提案/PM 记录，三处一致；
   - 组件台账 `ui-components.md` 保持登记，不引第二设计源；
   - 产品最终产品面复核（轻量）记录在案，不新增功能；
   - 各角色 Phase 5 交付记录区分「已实现/已验证」与「未验证/留待」；不得宣称全量等价或最终验收；
   - 验收标准（本文件）与后续验收报告互相链接。
5. **无过期引用**：证据中的候选摘要、入口路径、套件版本与冻结候选一致；旧端删除后，文档不再写「旧端可复跑」或引用已删文件为当前证据。
6. **结论可追溯**：每个 AC 的通过/返工/证据不足都能落到具体证据路径与候选摘要；不以日期、会议纪要、工作者自述或测试/UIUX 结论替代验收判断。

**判失败情形**：候选摘要缺失或不一致；证据只在临时目录、无原始输出；官方与探针混用；文档仍写旧入口/旧端可复跑；交付记录把计划写成结果；用他人结论代替本角色判断。

## 四、证据要求

1. **每条结论都要能回到原始输出**：命令、cwd、退出码、stdout/stderr、时间、执行者、环境。只给「通过」「已测」不算证据。
2. **候选绑定**：所有证据必须绑定 §2.3 的候选摘要；跨候选拼接的证据无效。重建产物摘要不同即为新候选。
3. **逐名而非计数**：双端对照、旧基线迁移、单测、IME、懒挂载、UIUX 检查都要名单；计数只作汇总。
4. **官方优先**：AC3/AC4 只认官方套件运行；探针/补证副本必须标「probe」，只作诊断。
5. **截图**：给出路径、窗口尺寸、缩放、界面、旧/新；删除 `user-data`，不含凭据/隐私/`.env` 内容。
6. **环境**：macOS/arm64、Node/npm、Electron、electron-builder、Vite、套件版本、夹具、离线状态、同日标记；bench 必须同机同日。
7. **断言强度**：提供旧/新共同 check 名的逐字对照，证明没有 pass→fail 弱化；新增检查列名；删除/退役逐条登记。
8. **失败与限制**：失败、跳过、环境受限、探针替代、未覆盖面逐项保留并写明归属；不得隐去失败或把 skipped 记通过。
9. **证据索引**：每个角色一份索引表（证据项 → 路径 → 候选摘要 → 环境），验收按索引抽查并复算。
10. **证据位置**：证据放在各角色获准的 `docs/change/`/`docs/fix/` 下；不依赖只存在于系统临时目录、聊天记录或 `user-data` 的文件。

**测试与 UIUX 结论的定位**：测试角色的独立验证报告、UIUX 的审计结论都是**证据**，不是最终判断。验收会读原始输出、复算摘要、按需抽查/复跑关键门；不把「测试说 pass」「UIUX 说 pass」直接抄成验收结论。

## 五、判断规则

### 5.1 三种结论

| 结论 | 条件 | 后续 |
| --- | --- | --- |
| **通过（pass）** | 5A 门与 5B 门均有当前候选的有效独立证据；AC1–AC8 全部满足；允许差异逐条经 PM 批准；无未解决失败；证据未过期；结论注明范围（macOS 本地离线/本地打包、Phase 5 范围内） | 交给统筹记录 Phase 5 验收通过；不授权提交/发布/部署 |
| **返工（needs-work）** | 已有证据证明不满足某条 AC：旧入口仍在、旧文件未删/未迁移、官方 check 红、新端比旧端差、三项缺口未过、质量门超限、packaged smoke 失败、UIUX 审计失败、断言弱化、越权改动、未登记差异等 | 列出 AC、证据、差异、应回到哪个所有者；由统筹安排修复与复测；保留原失败 |
| **证据不足（missing-evidence）** | 无法判断：旧端快照未在删除前取得、官方套件未跑到、只给探针、候选摘要缺失/不一致、原始输出/退出码/环境缺失、679 未在迁移前取得、bench 非同日/<3 轮、packaged smoke 缺失、截图/审计缺失、5A/5B 候选拼接、证据过期 | 写明缺什么、谁提供、补证后重判；不能记通过 |

### 5.2 分项与整体

- 允许分项结论，例如「5A pass；5B missing-evidence」「AC1–AC6 pass；AC7 needs-work」。**Phase 5 整体 pass 要求 5A 与 5B 都 pass 且 AC1–AC8 全过**；任一分项未过，整体不能记完成。
- 同一候选同一范围已有有效结论可复用；候选、契约、允许差异或相关规则变化后，重新判断受影响 AC 与套件段。

### 5.3 证据失效

- 产品代码、测试、断言、构建配置、依赖、入口路径、最终包或套件版本变化 → 受影响证据失效，需重新冻结并重跑受影响门。
- 只改文档/证据文字且不改结论 → 记 delta，不重跑产品门；若改动影响名单/结论 → 重判受影响 AC。
- 旧端删除后，任何「旧端复跑」声明都无效；只能引用 5A 快照。

### 5.4 不降低标准

- 不接受计数代替名单、探针代替官方、截图代替测量、自述代替原始输出。
- 不接受 macOS/离线/本地包代替 Windows/DPI/屏读/真实网络/发布件。
- 不接受「同因既有红」在 Phase 5 继续作为不修理由；C2 已在 4B 重锚并通过，Phase 5 应保持绿。
- 不接受用放宽断言、删除覆盖、隐藏角色、缩小字号、跳过检查来换通过。
- 验收通过不改变任何客户/PM 的发布决定。

## 六、missing-evidence 边界（本轮不判，也不许冒充）

| 项 | 本轮是否判 | 允许的证据形态 | 不允许的替代 |
| --- | --- | --- | --- |
| 真实模型/网络/`.env` 生产验证 | **不判** | 离线夹具/替身可作套件与冒烟证据；只能证明离线行为 | 用离线/本地打包/夹具结果声称线上模型可用；读取或记录 `.env` 值 |
| Windows 原生路径、DPI 缩放、屏读 | **不判** | 无；另立平台轮次与授权 | macOS、模拟、字符串测试、skipped 记通过 |
| 签名、公证、安装器、自动更新 | **不判** | 无；本地 zip 包只作 packaged smoke | 把本地未签名包当发布件/安装器 |
| 发布流水线与 CI（`release.yml`/`release-policy.mjs`） | **不判**（M1：本轮不改） | 两文件零 diff 证据 | 接入流水线、改 release 文件、声称 CI 通过 |
| Linux/其他平台 | **不判** | 无 | macOS 结果代替 |
| 真实主进程卡通道/真实引擎会话（非替身） | **不判** | 离线 IPC 替身/夹具 | 把替身结果说成真实引擎/真实通道验证 |

**边界规则**：

- 这些项**不阻塞** Phase 5 范围内通过，但验收报告必须逐项写「本轮未判」，不能写成「已通过」。
- 若客户另行授权其中某项，需新增标准附录/授权记录与证据，不能从本轮 pass 推定。
- 反过来，**本轮范围内的缺失**（5A 旧快照、官方套件、679、packaged smoke、截图、候选摘要等）不能拿这些边界当借口，按 missing-evidence 处理。

## 七、与客户决定分离

- **验收通过 ≠ 提交/推送/部署/合并/发布**。本角色不授权也不执行这些动作；候选是否提交由客户/统筹另行决定。
- **发布决定属于客户**：下一次冻结源/新发布轮、是否接入发布流水线、是否签名/公证、是否对外发布，均由客户决定；Phase 5 验收通过不构成发布批准，也不改变 `release.yml`/`release-policy`。
- **PM 门记录与验收结论分开**：PM 记录 5A/5B 门与阶段状态，独立验收只给 AC 结论；统筹引用验收结论，但不能替验收改结论。
- **候选提交后的身份**：若冻结候选之后被提交，提交哈希必须与冻结清单内容一致；若不一致，按新候选重新冻结并重判受影响 AC。
- **客户扩大范围**（Windows、真实网络、签名等）：另立授权与标准，不自动并入本轮。

## 八、后续判断所需材料清单

| 提供者 | 判定前必须交出的材料 |
| --- | --- |
| 项目管理 | Phase 5 派发/写集与最终入口路径决定；5A、5B 门记录；允许差异登记（逐条旧→新/依据 + 批准引用）；任何范围变更 |
| 桌面窗口 | `app/main.ts` dev/prod 策略与最终入口；CSP 方案；`main.mjs` 目标切换与 5A 旧端运行；packaged smoke 记录；写集/差异清单 |
| 桌面UI | Phase 5 变更记录与证据目录；删除清单；旧守卫测试迁移「旧名→新名/退役」映射；三项缺口实现与官方 check 证据；`uiux-v2`/`ime-enter`/`bench`/`uiux-design-audit` 目标切换；契约面最终更新；组件台账；1360/960/200% 截图与测量；`dist` 产物清单 |
| 装配 | `build:renderer` + electron-builder 本地打包记录；包内容清单；`release.yml`/`release-policy.mjs` 零 diff 证据；本地 verify 输出 |
| 测试 | 5A 独立验证（旧端/新端同套件同日快照、逐 check 名对照表、679/679、bench/C1/IME/懒挂载门）；5B 独立验证（新入口全量、packaged smoke、质量门）；官方/探针分目录；断言强度对照；原始日志与退出码；证据索引 |
| UIUX | 最终视觉审计计划与报告；1360/960/200% 关键面截图与测量；旧新对照；4B 延后打磨项逐项处置；无新设计源声明 |
| 产品 | 最终产品面轻量复核记录；不新增功能声明 |
| 独立验收（本角色） | 本标准的版本与 SHA-256；5A/5B 候选冻结清单与摘要复算；逐 AC 判断、原始证据链接、剩余问题与范围声明（报告写在自身 `docs/change/` 或 `docs/fix/`） |

## 附录 A：Phase 5 已知 check 名单（按台账，交付时以运行报告逐字为准）

### A.1 默认段 Phase 5 组（11 名，台账 §7.2）

```
closed no horizontal overflow 1360
closed no horizontal overflow 960
historical own-template failures direct
historical failure reasons visible without expand
virtual visible nonempty
group materialized and open
user-open group survives unrelated incremental
stable group restored after full prefix insertion
detached-pane role rowlist built before mount
detached-history role mounted windowed
detached-history pane reads same row gap as attached pane
```

### A.2 `DELIVERY_NOTE` Phase 5/回归（4 名，台账 §8.4）

```
all real tool names phases and genuine failed result remain
known legacy live metadata remains an actual named tool
builtin identity stays data and accessible without duplicate third visible line
long project path is single line ellipsis with full actual title
```

其中 `builtin identity…` 是 AC4 缺口 1 的官方 check。

### A.3 `COMPLETE_FLOW` Phase 5 名单（台账 §8.4；台账文字计数与名单行数不一致时，以名单和运行报告为准）

```
fresh empty context never mistakes loader for history
empty fresh session has no above-history warning
A same call one accessible lifecycle with true target and nonzero exit completion
A safe detail streams exit error and flags readable
A different same-text actual call remains separate
A unknown display never falls to raw args
P6 config save retains existing conversation draft
P6 missing setting closes back to actual notice invoker
P7 choice pending separated from empty queue
```

其中 `P7 choice pending separated from empty queue` 是 AC4 缺口 2 的官方 check。

### A.4 `VISUAL` Phase 5 组（29 名，台账 §8.4）

```
V2 ordinary chat stays ordinary before any structured report
V2 accepted structural positions and real window controls
V2 ordinary chat work overview has no invented report
V2 modal declares dialog and makes whole background inert
V2 document drawer matches 18px heading source block and outlined right reading action
V2 native window controls retain visible icons and real IPC while business background is inert
V2 Shift Tab wraps from first to last actual drawer control
V2 Tab wraps last to first without escaping modal
V2 background focus cannot escape into composer
V2 Escape restores actual visible report invoker draft and same chat reading
V2 real geometry 1360
V2 dark theme: no visible light surfaces 1360
V2 modal width is 424 at 1360
V2 dark theme: no visible light surfaces in drawer 1360
V2 real geometry 960
V2 dark theme: no visible light surfaces 960
V2 modal width is 424 at 960
V2 dark theme: no visible light surfaces in drawer 960
V2 sidebar default width 248 and resizer aria
V2 sidebar double click resets 248
V2 sidebar keyboard shift right +24
V2 sidebar collapse preserves custom width
V2 sidebar collapsed geometry 1362
V2 sidebar expanded restored 1362
V2 sidebar collapsed geometry 1280
V2 sidebar expanded restored 1280
V2 sidebar collapsed geometry 960
V2 sidebar expanded restored 960
V2 import selects primary su and keeps it inside tree viewport
```

### A.5 三项缺口与关键质量名

```
builtin identity stays data and accessible without duplicate third visible line   （AC4-1）
P7 choice pending separated from empty queue                                     （AC4-2）
full replay preserves content identity                                           （AC4-3）
fold anchor offsets                                                              （C1；5B 不得比 5A 新端更差）
```

### A.6 套件入口切换现状（供 5A 核对）

- `uiux-v2.mjs`、`ime-enter.mjs`、`bench-storm.mjs` 已支持 `ANS_RENDERER_ENTRY`（默认旧入口）。
- `main.mjs`（L80/L1614/L1661）与 `uiux-design-audit.mjs`（L192）当前写死旧入口；Phase 5 由属主加目标切换，只注入路径，不改断言。
- 旧端在 5A 必须由同一份套件跑完；5B 删除旧端后，旧端值只引用 5A 快照。

## 附录 B：核对方式与状态声明

- **只读核对的文件**：本角色 `role-card.md`、`boundary.md`、`boundary.yaml`、`feature-map.md`、`memo.md`、`functional-description.md`；技能 `acceptance-role.md`、`evidence.md`、`documentation.md`、`documentation-design.md`；PM 评审 revision 10 §十至§十六；产品提案 revision 2；测试 4B 独立验证/返工重验/200% 收口重验；UIUX 4B 评审；台账 §七/§八；桌面UI 契约面；`package.json`、`vite.config.ts`、`electron-builder.yml`、`app/main.ts` 加载段、`app/renderer` 目录、`test/桌面应用/e2e/` 套件入口段、`test/桌面应用/*.test.ts` 读取旧渲染器的文件清单。
- **执行过的只读命令**：`ls`、`wc -l`、`grep`、`sed`、`git rev-parse`、`git status`、`node --test test/桌面应用/*.test.ts` 一次（只看到尾部 `fail 0`，未取得完整计数，未作为任何 AC 证据）。**未运行**应用、e2e 套件、构建、打包、bench、真实模型/网络，未读 `.env`。
- **状态**：本文件是**验收标准**（version A1，status: ready），不是实施、测试、验收报告或发布记录。候选未冻结，AC1–AC8 未判断；Phase 5 仍按 PM §16.3 的 5A→5B 顺序实施。标准若因授权、候选或契约变化需要修订，先记录依据并按原确认流程处理，不在判断时降低标准。
