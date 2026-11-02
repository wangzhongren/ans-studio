---
id: acceptance-return-card-a3-implementation
type: change
title: 验收回交卡 A3 实施记录：报告卡/决定卡/CSS/组件守卫
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: implemented-unverified
related: [acceptance-return-card]
events:
  - date: "2026-11-02"
    kind: created
    summary: A3 实施：ReportBody 验收分支、DecisionDialog 验收决定卡、三份 CSS、组件/源码守卫
  - date: "2026-11-02"
    kind: implemented
    summary: A3 代码/CSS/测试/记录写入；30/30 测试、typecheck:renderer、build:renderer 通过；未 commit/push、未启动应用
---

# 验收回交卡 A3 实施记录：报告卡 / 决定卡 / CSS / 组件守卫

- **实施角色 / 上下文**：桌面UI（渲染层 `app/renderer/`），本上下文只承担该角色。
- **节点**：团队计划 §五 **A3（报告卡/决定卡/CSS/组件测试）**；输入 A1/A2 已冻结。
- **状态**：**implemented-unverified**。A3 代码/CSS/测试已写盘；A3 必测 30/30、`typecheck:renderer`、`build:renderer` 均通过；**未 commit/push、未启动应用、未跑 E2E、未接触客户、未判验收**。真实 DOM/E2E 由 A5/D1 补证。

## 一、输入与基线

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| A1 冻结 `zh-CN` | `src/common/shared/i18n/messages/zh-CN.ts` | 1971 | `2bea07fca5adba6bec5a670c99101618c9f568969b998e03340e8596dd295283` |
| A1 冻结 `en-US` | `src/common/shared/i18n/messages/en-US.ts` | 2239 | `48e35b824161f5011cdac3696e8d06a6c4285ca5191371cd427bcaf3321b3eb3` |
| A2 冻结 `role-view.ts` | `app/renderer/src/chat/role-view.ts` | 159 | `05a2225c50b21b4c752564053d1b5947597c4cb4d3b497b93f7e40fd21465843` |
| A2 冻结 `decision-dialog.ts` | `app/renderer/src/chat/decision-dialog.ts` | 231 | `c62d44b4e34308255ed8217539a4ec3f238429512cfd556c223f7f6c3b4d1679` |
| P1 审核记录 | `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-P1-review.md` | 168 | `8a114aab2d6f1fa61bc7df8a1ef09f81d65afdb17d2990bf78a4ead50ca080d2` |
| 桌面UI P1 提案 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 463 | `e2eb138e17f0090495bf4d9be3c7b45ef152f631095e90893b63be374a5e4402` |
| 团队计划 / V1 / 方案 P1.2 / 复核 / B0 | 见 P1 提案 §1.1（哈希一致：`05a94dd0…` / `f0cb9465…` / `51057be9…` / `6f8f8121…` / `b4c4808f…`） | — | — |

- 分支 / HEAD：`feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`。
- 编辑前 A3 各文件哈希见 §四 before 列；`git diff --cached --name-only` 为空。
- A1/A2 冻结哈希复核一致；本上下文**未修改** A2 两个源码与两个纯测试。A4（桌面窗口）并行改动不属本候选。

## 二、改动内容

### 2.1 `app/renderer/src/shell/ReportCard.tsx`

- 新增 `reportAcceptance(report, roles)`：`isVerificationRole(findRole(roles, report.source.roleId))`；`ReportCard` 与 `DeliveryCard` 各自对同一报告计算一次 `acceptance` 并传入共享 `ReportBody`（`acceptance?: boolean`），`ReportBody` 不二次判定。
- `ReportBody` 验收分支：
  - `.report-top` / `.report-body` 加 `is-acceptance`；标题 `ui.reportCard.acceptanceTitle`；标题后 `.report-acceptance-badge`（`ui.reportCard.acceptanceBadge`）。
  - 正文用完整 `full`（`summary.text`，`markdownHtml(full)`），不用 `reportPreview`；不渲染 `.report-complete` 折叠。
  - `projection-flags` 保留 `flags`（净化/截断/`evidenceOmitted` 省略提示），验收时**不追加** `folded` 文案。
  - `.acceptance-evidence`：标题 `ui.reportCard.evidenceCount`（`{count}`），`.hb-evidence` 列出全部 coverage 内 `evidence` 及逐条 `textFlags`；空列表用 `ui.reportCard.noEvidence`。
  - `report-facts` 精确替换 `independentAcceptance`/`notConfirmed` 行为 `acceptanceDecision`/`acceptanceDecisionPending`；`includeSave` 的存储事实行保留。
  - 免责声明 `ui.reportCard.acceptanceDisclaimer`；`report-actions` 只保留来源按钮，无折叠。
  - 普通分支保持 `reportPreview` + `folded` + `report-complete` 的结构/文案/开合；不支持版本仍走既有 `unsupportedVersion` 早退。
- `ReportCard`：`const supported = reportVersionSupported(report); const acceptance = supported && reportAcceptance(report, roles);`；外层仅验收时追加 `is-acceptance`。既有 `is-blocked`（`status !== "completed"`）保持原语义（见 §三 P1-ARC-01 说明）。
- `DeliveryCard`：每份报告 `supported && reportAcceptance`；报告段类名为 `delivery-report`，验收时追加 `is-acceptance`，且 `blocked = acceptance && status !== "completed"` 时才追加 `is-blocked`；普通交付段类名逐字不变（P1-ARC-02）。

### 2.2 `app/renderer/src/chat/DecisionDialog.tsx`

- 新增局部 `markdownHtml(text)`（只调用 `@/chat/markdown::renderMarkdown`；不新增第二 Markdown 管线）。
- 对话框类名验收时加 `is-acceptance`；`dd-kind` 验收时加 `is-acceptance` 并使用 `ui.decisionDialog.acceptanceKind`（不再显示机器值 `acceptance`）；其他卡种仍显示原始 `cardKind`（O1 不实施）。
- preview：普通卡仍是 `<pre className="dd-preview">{view.preview}</pre>`；验收卡若 preview 存在且与报告文本规范化后不完全重复，包在 `.dd-acceptance-preview` 中并显示 `ui.decisionDialog.acceptancePreviewLabel`；完全重复时去重。
- `.dd-acceptance-report`（`aria-label` = `ui.decisionDialog.acceptanceReportTitle`）：
  - 可见标题 `acceptanceReportTitle`；
  - `acceptanceReport.path !== ""` 时显示 `ui.decisionDialog.reportPath`（O2，`.dd-report-path`）；
  - 有报告：`.dd-acceptance-body` 经 `markdownHtml(acceptanceReport.text)` 安全渲染；`truncated` 显示 `acceptanceReportTruncated`，`redacted` 显示 `shared.common.redacted`；
  - 无报告：有 preview 用 `acceptanceReportFallback`，无 preview 用 `acceptanceReportMissing`；不伪造原文/路径。
- 问题、选项、推荐、可作答性、提交/拒绝/稍后处理、焦点陷阱、Esc、二次确认、`aria-labelledby`/`aria-describedby`、`data-*` 均未改。

### 2.3 CSS

- `shell.css`：`.msg-handback.is-acceptance` 冷色边框/左边条、`.msg-handback.is-acceptance.is-blocked` 危险色优先、`.report-top.is-acceptance` 冷色头、`.msg-handback.is-acceptance.is-blocked .report-top` 危险背景、`.report-acceptance-badge`、验收正文/证据卡内限高滚动、`.acceptance-evidence` 最小宽度。
- `phase4b.css`：`.delivery-report.is-acceptance` 冷色左边条（交付批无 `.msg-handback` 外层，单独覆盖）、`.delivery-report.is-acceptance.is-blocked` 危险色优先、200% 守卫加入 `.acceptance-evidence`。
- `phase4a.css`：`.decision-dialog.is-acceptance`、`.decision-dialog.is-acceptance.is-high-risk`（`--danger-border`）、`.decision-dialog.is-acceptance.is-destructive`（`--warning-border`，compound 规则写在 `.is-acceptance` 之后）；`.dd-kind.is-acceptance`、`.dd-acceptance-preview`、`.dd-acceptance-report`、`.dd-acceptance-title`、`.dd-acceptance-body`（限高 46vh/滚动/换行）、`.dd-report-path`、`.dd-acceptance-missing`；480px 查询补原文区换行。
- 只使用 `index.css` 既有令牌（`--info*`/`--danger*`/`--warning-border`/`--selected`/`--text-*`/`--radius-*`/`--font-mono`），无裸色值。

### 2.4 测试/记录

- `test/桌面UI/dialog-a11y.test.ts`：新增验收决定卡源码断言（本地化徽标/原文区/路径/preview 纯文本非折叠）与验收危险色优先/480px 规则断言；既有 ARIA/焦点/二次确认断言未改。
- `test/桌面UI/source-guard.test.ts`：新增验收报告卡 Markdown 管线/普通折叠保留守卫；P1-ARC-01/02 守卫（两处 `supported && reportAcceptance`、`blocked = acceptance && …`、普通交付段基类不变）。
- `test/桌面UI/theme-tokens.test.ts`：新增 `--info*`/`--danger*`/`--warning-border` 令牌存在断言。
- `report-view.test.ts` 只读回归，未改动。
- `角色卡/桌面UI/api-spec.md` 增补「独立验收展示（A3）」契约说明；`memo.md` 追加 A3 状态。

## 三、P1-ARC-01 / P1-ARC-02 落点

- **P1-ARC-01（supported 门控）**：`ReportCard` 与 `DeliveryCard` 均使用 `const supported = reportVersionSupported(report);` 与 `const acceptance = supported && reportAcceptance(report, roles);`；不支持的 verifier 报告在 `ReportBody` 走既有 `unsupportedVersion` 早退，外层无 `is-acceptance`、无验收标题/徽标。`source-guard.test.ts` 的 `P1-ARC-01/02` 用例静态钉住两处门控（`supported` 共 3 处：ReportBody 既有早退 + 两处外层门控；`acceptance` 2 处）。
  - `ReportCard` 既有 `is-blocked`（普通/受阻报告状态类）保持原语义不变；验收危险色选择器要求 `.is-acceptance` 同时存在，因此不支持的 verifier 报告不会获得验收冷色/危险验收样式。这样同时满足 P1-ARC-01 与 AC-4 普通卡类名不变。若审核要求连既有 `is-blocked` 也对不支持版本移除，需要另行确认（会改变既有普通卡 DOM）。
  - P1-ARC-01 要求的「组件/E2E 负例」：A3 以源码守卫落实门控；真实 DOM 的 unsupported verifier 负例留 **A5 E2E** 执行，本记录不声称已完成该动态用例。
- **P1-ARC-02（交付批 is-blocked 窄化）**：`DeliveryCard` 的 `is-blocked` 仅在 `acceptance && status !== "completed"` 时追加；普通交付段仍为 `delivery-report`，类名逐字不变；`source-guard.test.ts` 断言不存在 `"delivery-report" + status` 的无条件状态类写法。该裁决按 P1 记录接受并在此留痕。

## 四、验证结果

### 4.1 A3 必测套件

| 项 | 值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 test/桌面UI/report-view.test.ts test/桌面UI/dialog-a11y.test.ts test/桌面UI/source-guard.test.ts test/桌面UI/theme-tokens.test.ts` |
| 时间（+08:00） | 2026-11-02T16:01:30 |
| 退出码 | **0** |
| tests / pass / fail / skipped / todo | **30 / 30 / 0 / 0 / 0** |
| 原始日志 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A3-evidence/01-a3-tests.log`（43 行 / `65740ecdfd168bc2e2e3f4bfbf7a845c199a43c7fcc65054e6355aa98ccb7c00`） |

### 4.2 `typecheck:renderer`

| 项 | 值 |
| --- | --- |
| 命令 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） |
| 时间（+08:00） | 2026-11-02T16:00:34 |
| 退出码 | **0**（0 类型错误） |
| 原始日志 | `.../A3-evidence/02-typecheck-renderer.log`（9 行 / `f6e791d3a32e43f741a32903e031a0092cddf366d453fd2ae207c5d001ff29a7`） |

### 4.3 `build:renderer`

| 项 | 值 |
| --- | --- |
| 命令 | `npm run build:renderer`（`vite build --config vite.config.ts`，vite 8.3.4） |
| 时间（+08:00） | 2026-11-02T16:00:38 → 16:00:47 |
| 退出码 | **0**（2793 modules transformed，4.67s） |
| 产物（写入 gitignore 的 `app/renderer/dist/`，非候选） | `index.html` 0.59 kB；`index-76pNUf-s.css` 150.74 kB；`index-HVgRWhIZ.js` 1,300.35 kB；icon 55.05 kB |
| 警告 | 既有 chunk >500 kB 提示与 `decision-center-store.ts` `INEFFECTIVE_DYNAMIC_IMPORT` 提示（B0 同项，非失败） |
| 原始日志 | `.../A3-evidence/03-build-renderer.log`（32 行 / `ccdccdf01ce0477d4b9a8c709b983f916204c199a4b8b1487ceba6c10f20ed62`） |

### 4.4 环境

Node `v24.22.1` / npm `11.19.1` / `MINGW64_NT-10.0-26300 3.6.10-710e5275.x86_64` / Git Bash `5.3.15(2)-release`；日志 `.../A3-evidence/05-environment.log`（5 行 / `3f143e86389d3282dad6e2051059227c3cd9269b81c7282f86d6660cd0552485`）。

## 五、候选哈希（before / after）

| 文件 | before `git hash-object` | before sha256 | after `git hash-object` | after sha256 | 行数 |
| --- | --- | --- | --- | --- | --- |
| `app/renderer/src/shell/ReportCard.tsx` | `571dad4b7f1d2f62eb7d3ddce3b1f4112520bc27` | `c29a2ef7d4e59066a85ccb3b625af94c7ba15448dd2f4f7e697c83e875ec24ed` | `1ca05b64faef4d1b532ada2788262d6bc751018f` | `787db0208bc370c0c3f5d61348010c21fa413a9f3b84be7cbce48a04e6956285` | 388 → 461 |
| `app/renderer/src/chat/DecisionDialog.tsx` | `2f5e12f914ca48dd5b6eb9ed744e8a0b8069cd54` | `b41e9ced4cb71f623baa2a3baf413442ae9cc254e779e618845eee03f62f860a` | `1301ca0f3594a7f079d7fbaf352ec2473632f749` | `f7969e3f1e2f112a3d7b8ec9964ddaa258460f489251a3aafaa22a514e4e4355` | 332 → 391 |
| `app/renderer/src/shell/shell.css` | `b2877760cf41bcb674a6b3bb0524395d794cb78a` | `60d2aa36688f2f9cd7bdc3bb2459104437766b20be93d350ec877a1d3da7d870` | `d5c469fc7964ffcc45c05d2240704b7079d64f24` | `12bf211c4a1a18e63c64e11d14956101ecf892efc74a0ea7eeff23d7806d6fb9` | 3316 → 3355 |
| `app/renderer/src/shell/phase4a.css` | `84cb0ad0308257789e25a812c95d592653d0ce35` | `ebbf326cc0e98b2de3da06f94c2cd80aecc682ec9a2b8d997159ff6e23d376fc` | `7c6ebdf1b72dd96571337f6b8cd118e2e3de1232` | `79fe070362c38ae3e0009a9d5fa8b6f50becaa1278eabdbc3ef9568b22b20cae` | 1734 → 1776 |
| `app/renderer/src/shell/phase4b.css` | `b6143190a66f36ba22228752de3fbde98ea2f86a` | `13bbddc8c9267436ddae62b4cb15deae019ff1714c5ab61d0d4016d8503cdf18` | `87cceeaa7c9acce96ad2a600e55828043a4defc9` | `0c05f4d4dc0ab743ba2916a75209fb3fa07dd60fb034ba418d2ab36fcc00fc60` | 1070 → 1088 |
| `test/桌面UI/dialog-a11y.test.ts` | `078db9e53b23787dc0f9bd4eee3762aeeedd2b50` | `409fbe835098bc938324f5ea3547f5d59bb2112aab7853a47b9a6b2926fbe2a4` | `4c3be9bf59b3e5b46562d2d140c6d48ff69b95bf` | `7ac0d1c1f71e06d5c8cab65ba6f95db80f02c430bdfacfb937e5d2966d29ff35` | 52 → 74 |
| `test/桌面UI/source-guard.test.ts` | `1a1253e54a253c1fbebf7ea0e368432339ae9f7a` | `f3ee74119529df386e29d9af5215ec309426743007aaecdae540255fb2483f39` | `b2ed60fa0c4d923acedd97eebac20e9a197b4f2f` | `52cbc7a178183900301683f8853dac279e461edb2d38e32703d519ed750f4d67` | 239 → 265 |
| `test/桌面UI/theme-tokens.test.ts` | `a618a288715ef933707f49756bad82631103d309` | `f97f4b92c21c1e90918140007beb296ad72d8afc4bce89e0d8a312613bc95f5f` | `4aedc3a474019ca400c66ead7e821933e36291f0` | `79a4fe443333e8d363ea5965ed0d05e3ed89dcbc9abdb7eca669b3fb699a8a1f` | 43 → 57 |
| `test/桌面UI/report-view.test.ts`（只读回归） | `93e8e88fbef0fae0bca18574028d583f3eccf3c4` | `c4842b734596fa9f9adb0abb78a6be421887b5ef72dca779d2916b2ac6c46d3b` | 同 before（未改） | 同 before | 178 |

- A3 产品/测试候选 = 上表 8 个改动文件的 after 哈希；`git diff --stat` 仅这 8 个文件（+349 / −58）。
- A2 冻结复核：`role-view.ts` / `decision-dialog.ts` 与冻结哈希一致（§一），本上下文未改。
- 哈希/状态原始记录：`.../A3-evidence/04-hashes-status.txt`（146 行 / `a3a7d41347930d828aca005faf993906989bf285c03f3234f08414bf0f168507`）。

## 六、写集与纪律核对

- **本上下文写盘**：上述 5 个产品/CSS 文件 + 3 个测试文件；`角色卡/桌面UI/api-spec.md`、`memo.md`；本记录与 `A3-evidence/` 日志；此前 P1 提案/A2 记录。
- **未写**：A2 的 `role-view.ts`/`decision-dialog.ts`（冻结）、A4/桌面窗口、`app/desktop/**`、`src/**`（含 i18n）、E2E harness（A5）、`test/桌面应用/**`、其他角色测试、角色卡/边界/changelog、`docs/scheduling|acceptance|communication|planning`。
- **未 commit / 未 push / 未启动应用 / 未跑 E2E / 未接触客户 / 未判验收**；`git diff --cached --name-only` 为空。
- 工作树中的 A1/A4 并行改动与既有治理/管理记录不属本候选（`04-hashes-status.txt` 逐项标注）。

## 七、偏差、限制与下一步

- **偏差/裁决**：
  1. P1-ARC-01：外层 `is-acceptance` 与 DeliveryCard 新增 `is-blocked` 均以 `reportVersionSupported` 门控；ReportCard 既有 `is-blocked`（普通状态类）保持原语义，以免改变普通/不支持版本报告的既有 DOM；验收危险色只在 `.is-acceptance` 同时存在时生效（§三）。
  2. P1-ARC-02：普通交付段类名保持 `delivery-report`，`is-blocked` 只在验收段（`acceptance && status !== "completed"`）。
  3. A3 未新增 React DOM 渲染测试；组件证据以 `dialog-a11y`/`source-guard` 源码守卫 + `report-view` 纯回归为主；不支持 verifier 报告的真实 DOM 负例与两处位置/危险色/窄屏/200% 的 DOM 证据由 **A5 E2E** 补足，本记录不声称已完成。
- **限制**：`ReportCard.tsx` 的 diff 含 JSX 重排（58 deletions），普通分支的 DOM 预期不变，但本阶段未启动 Electron 做真实 DOM 对照；A5/D1 必须验证普通报告 180 字预览/`report-complete` 折叠与两处验收卡。未跑根 `typecheck`（A3 出口只要求 `typecheck:renderer`；D1 全量）。构建警告为 B0 既有项。
- **下一步**：A5 在 A3+A4 后最小追加 E2E（含 P1-ARC-01 不支持 verifier 负例、P1-ARC-02 普通交付段对照）；D1 在同一候选跑受影响套件/双 typecheck/build/E2E；A3 状态保持 `implemented-unverified`，最终由 E2 按 V1 判定，本记录不是验收结论。
