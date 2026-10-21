---
id: change-ui-platform-phase5b-test-domain-cleanup
type: change
title: Phase 5B 测试域旧渲染器引用清理——tsc 0 错；22 文件退役并登记
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified（测试域清理；5B 全量待步骤 c）
related: [change-ui-platform-phase5a-final-verification, design-ui-platform-phase5-test-plan]
events:
  - date: "2026-10-21"
    kind: migrated
    summary: 旧 renderer/vendor/旧守卫测试删除后，清理 test/测试 对 renderer.js/tool-rows.js/ui-labels.js/styles.css 的导入与源码读取；用新渲染器 events/replay/judge/governance-view 等价重写 6 个文件，22 个旧渲染器专属文件退役并登记；tsc 0；测试 714/715，唯一红为环境缺真实 rg 二进制
---

# Phase 5B 测试域旧渲染器引用清理

**背景**：5B 步骤 a/b 已删除旧 `app/renderer` 渲染器/vendor/旧守卫测试，新入口 `app/renderer/dist/index.html` 构建。`test/测试/**` 中仍有旧文件导入/源码读取，阻断根 tsc 与测试。**只写 `test/测试/` 与 `角色卡/测试/`**；未改产品/产品测试/配置。

证据：[2026-10-21-phase5b-test-domain-cleanup-evidence](2026-10-21-phase5b-test-domain-cleanup-evidence/)。

## 一、修改（按新渲染器等价纯逻辑重写）

| 文件 | 迁移 | 结果 |
| --- | --- | --- |
| `test/测试/uiux-v2-replay-regression.test.ts` | 旧 `tool-rows.js`/`ui-labels.js` → 新 `app/renderer/src/chat/events.ts`（`historyRowToDescriptor`/`classifyInjected`/`isSpecialTool`/`toolStatus`）与 `replay.ts`（`rowSignature`/`planReplay`） | **6/6 pass**；保留调用/结果目标、失败诚实、特殊工具锚点、回放 skip/append/full、系统通知分类 |
| `test/测试/shell-judge-verify/fixture.ts` | `loadUiLabels` → 新 `chat/judge.ts`（`judgeToggleView`/`judgeWarningLines`/`shellJudgeToggleResult`/`shellJudgeResultView`） | 该套件 **38/38 pass** |
| `test/测试/governance-pin-recovery-verify/fixture.ts` | `loadUiLabels` → 新 `chat/governance-view.ts::governanceActionFor` | 该套件 **11/11 pass** |
| `test/测试/existing-project-compat-verify/a-state-preview.test.ts` | `canEstablishGovernance` → 新 `governanceActionFor` | **14/14 pass** |
| `test/测试/existing-project-compat-verify/b-establish.test.ts` | `canEstablishGovernance`/`governanceFailureView` → 新 `governance-view.ts`；B4 源码守卫改指新 `GovernancePanel.tsx` + `governance-store.ts` | **13/13 pass** |
| `test/测试/governance-judge-cards-verify/fixture.ts` | 旧 `loadUiLabels` 删除（抛退役错误）；其唯一调用者 f-ui 已退役 | 其他 judge 卡套件不受影响 |

## 二、退役（22 文件 / 95 test 声明）

全部移至 `test/测试/retired-5b/*.retired`（不再编译/运行），逐文件哈希见证据 `retired-sha256.txt`；逐 test 名见 [retired-checks.md](2026-10-21-phase5b-test-domain-cleanup-evidence/retired-checks.md)。退役依据：5B 已删除旧渲染器，以下文件属旧 renderer/DOM/vendor 源码钉或旧入口探针；其行为覆盖由新渲染器纯逻辑与 5A e2e 承担。

| 文件 | 替代覆盖 |
| --- | --- |
| `existing-project-compat-verify/d-scope-audit.test.ts`、`e-contract-wiring.test.ts` | 5A 契约/治理 e2e；a/b 服务行为保留 |
| `g2-verify/contract-freeze.test.ts`、`u1-renderer.test.ts`、`scope-audit.test.ts` | 新 `events.ts`/`governance-view.ts` + 5A RUNTIME/JUDGE/G2 |
| `g3-search-verify/scope-audit-and-fold.test.ts` | 新 `events.ts` 分类 + 5A TOOLFOLD/VISUAL |
| `g4v2-mcp-verify/k-scope-audit.test.ts` | 新 `classifyInjected`/`isSpecialTool` + 5A e2e |
| `g5-reasoning-verify/g-desktop.test.ts`、`h-scope-audit.test.ts` | 5A RUNTIME/VISUAL/MOTION |
| `governance-judge-cards-verify/f-ui.test.ts` | 新 `judge.ts` 纯逻辑 + 5A JUDGE 33/33 |
| `governance-liaison-verify/d-mirror-advance.test.ts` | 新 `governance-view.ts` + 5A MIRROR/GOV |
| `governance-trio-verify/e-ui.test.ts` | 新 `governance-view.ts` + 5A GOV |
| `kanban-fixes-verify/f8-classification-chain.test.ts` | 新 `events.ts` 映射 + 5A UIUX |
| `su-shell-approval-verify/d-card-data.test.ts` | 新 `ConfirmCard`/`confirm-store` + 5A RUNTIME/JUDGE |
| `render-md-ready-probe.mjs`、`u1-notice-restick-probe.mjs`、`ui-reacceptance-renderer-regression.mjs`、`uiux-anchor-drift-probe.mjs`、`uiux-anchor-probe.mjs`、`uiux-rowgap-detached-probe.mjs`、`uiux-v2-renderer-regression.mjs`、`su-shell-approval-verify/card-probe.mjs` | 5A IME/VISUAL/TOOLFOLD/RUNTIME/branch e2e；旧入口已删除 |

> 上述退役按 5B 允许差异/178 项台账登记；不静默丢弃，原文件内容保留在 `retired-5b/` 供审计。

## 三、门禁

- 根 `npx tsc --noEmit`：**exit 0**（清理前唯一 TS2882 为 `uiux-v2-replay-regression.test.ts` 的旧 tool-rows/ui-labels side-effect import）。
- `node --test "test/测试/**/*.test.ts"`：**715 tests / 714 pass / 1 fail / 0 skip**。
  - 唯一红：`test/测试/lightweight-permission-repairs.test.ts:164 D3 AC4`；`spawnSync("rg", ["--version"]).status` 为 null。本机 `rg` 只是 Claude shell function，`/opt/homebrew/opt/ripgrep/bin` 无真实二进制；属**环境缺真实 ripgrep**，非本次清理引入，未改断言/不静默跳过。
- 修改文件哈希：[modified-sha256.txt](2026-10-21-phase5b-test-domain-cleanup-evidence/modified-sha256.txt)；原始日志/证据见目录。

## 四、待 5B 全量（步骤 c 落盘后）

- 桌面窗口步骤 c 落盘后，按 5B 计划跑新入口全量、packaged smoke、最终回归；本轮只清测试域引用与映射登记。
- 旧端快照/5A 证据仍保留；5B 不再复跑旧端。
