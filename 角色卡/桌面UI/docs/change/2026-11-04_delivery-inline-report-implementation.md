---
id: delivery-inline-report-implementation
type: change
title: 交付行默认内联报告正文（客户直修）实施记录
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - docs/communication/2026-11-04_issue-delivery-inline-body.md
  - 角色卡/桌面UI/docs/change/2026-11-04_delivery-inline-report-evidence/probe-delivery-inline.mjs
events:
  - date: "2026-11-04"
    kind: created
    summary: 按客户直修指令把交付行正文改为默认内联全文（不点击/不折叠）；批次标题与三列回执降级到卡片尾部默认折叠的「接收历史」区；保留 16 KiB 投影/flags/证据/重试/aria-live/安全副本；typecheck 0、build 0、UI 402/402、phase4b smoke 69/69、探针 before 6/6 / after 14/14
  - date: "2026-11-04"
    kind: updated
    summary: 复核发现首张截图为重绘前空帧；探针 shot() 改为 invalidate + 双帧等待 + 丢弃预热帧，按 baseline/candidate 临时还原重采 before/after（6/6、14/14，候选 SHA-256 复核一致）；before 冒烟 OUT 未留存改为只引用 raw 日志
---

# 交付行默认内联报告正文（客户直修）实施记录

- **任务 / 档位**：`2026-11-04_delivery-inline-report`（客户直修） / 渲染层最小修复（跳过调研/方案/独立复核）。
- **角色 / 节点**：桌面UI（渲染进程属主，固定角色上下文）/ 只改渲染层展示。
- **worktree / 分支 / 基线**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\delivery-inline-report-fix`（分支 `fix/delivery-inline-report`）；基线 `origin/main` `61bb0b2`。
- **状态**：**`implemented-unverified`**。已实现并完成本角色自测与真实 Electron 前后证据采集；**未 commit、未 push、未验收**。

## 1. 客户直修依据与边界

- 需求记录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\customer-authorization-plane\docs\communication\2026-11-04_issue-delivery-inline-body.md`（29 行，SHA-256 `ab602a0655746dfa835fe48b7efe9407d313ef71717ec773631cb73c3eb40d6b`；该文件为派发侧 worktree 的未跟踪输入，本次只读）。
- 客户原话摘要：「页面上的交付，不需要都应该显示返回的正文，不要搞这种卡片显示状态。不然的话，我还得进去看内容。」「『交付 · 本批 1 份（不表示全部收齐）』这种的就是纯傻逼的…就显示报告原文就行了。」
- 统筹决定：**直接修，本轮只改渲染层**；禁止改 `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`（含 shared i18n 文案）与报告投影形状；**不得新增 i18n key**。
- 本记录不改变任何主进程投影/持久化/交付批次结构：正文仍只取主进程给出的 `report.summary.text`（既有 16 KiB 保护上限/脱敏/截断投影），渲染层不自行造报告、不从助手正文拼正文。

## 2. 改动前行为 vs 改动后行为

| 场景 | 改动前（基线 `61bb0b2`） | 改动后（本候选） |
| --- | --- | --- |
| 交付行（`kind=delivery` → `DeliveryCard`） | 卡首 `<p>交付 · 本批 N 份（不表示全部收齐）</p>`；随后三列回执事实；每份报告经 `ReportBody` 只显示 180 字/4 行预览，全文与证据收在「查看完整报告摘要与证据」`<details>` 内 | 卡片开头直接是报告正文；每份普通报告默认内联 `summary.text` 全文（既有 Markdown 管线），无 `report-complete` 折叠、无「报告原文摘录」标签（避免展示全文却称摘录）；批次标题/三列回执/重试收进卡片尾部默认折叠的「接收历史」`<details>`；安全副本折叠保留在最后 |
| 交付行证据 | 只在「查看完整…」折叠里 | 正文后新增只含证据的小折叠 `details.report-evidence`，summary 复用既有 `ui.reportCard.evidenceCount`（「证据（N 条）」）；逐条 `redacted/truncated` flag 保留 |
| 交付行安全事实 | `projection-flags`（已净化/已截断/证据预算省略等）在摘要下 | 同样保留在正文下；批次数量/接收历史/目标输入/目标轮次/重试/错误/`role="status" aria-live="polite"`/`.safe-input-copy` 全部仍在 DOM（回执区或尾部折叠内） |
| 回交行（`kind=handback` → `ReportCard`） | 普通报告预览 180 字 + `report-complete` 折叠；验收报告全文 + 证据 | **不变**（`ReportCard` 不传 `inlineFull`，仍走 preview + `report-complete`；验收行为不变） |
| 验收报告（交付批内） | 全文 + 验收证据块，无 `report-complete` | **不变** |
| i18n / 投影形状 / 通道 | — | 零新增 key、零通道改动、零主进程改动 |

## 3. 写集与实际改动

### 3.1 修改（4）

| 路径 | 行数 | +/−（相对基线） | SHA-256 | `git hash-object` | 改动 |
| --- | ---: | --- | --- | --- | --- |
| `app/renderer/src/shell/ReportCard.tsx` | 492 | +74 / −43 | `5f4ae76cfb2f4de74ee797175ae70ac4ff3e0c1e922e4b7b4d2def6e452166ae` | `b4dc589e16b05d4d59a3f209db8e84906389ecf9` | `ReportBody` 新增 `inlineFull`（`showFull = isAcceptance \|\| inline`）；交付行内联全文、隐藏摘录标签与折叠提示；新增 `details.report-evidence`；`report-complete` 只在 `!showFull` 渲染；`DeliveryCard` 报告前置、批次/回执三列/重试整体移入尾部 `details.delivery-receipt`（summary「接收历史」+ 状态附注；内部保留 `.delivery-batch-title`） |
| `app/renderer/src/shell/phase4b.css` | 1155 | +50 / −8 | `d0ec50f99d80026be68fef599c325ee868a35d8584343b74cb2308e0489a940c` | `81dc78efecf765e1d49c09c0ac8473509779d062` | 删除 `.msg-delivery > p` 卡首标题规则；新增 `.delivery-receipt`/`> summary`/`.delivery-receipt-note`/`.persistence-state` 内缩进/`.delivery-batch-title`（小附注）；新增 `.report-evidence` 折叠样式；宽度包装白名单补 `.report-evidence` |
| `test/桌面UI/phase4b-electron-smoke.mjs` | 1297 | +9 / −6 | `e84ef409b82136eb096a1d1891cd507049a61fdc97aa73f45710cece059e47f8` | `8545bc8ae782c68538752499d4d8ba2bbc68c71e` | §9 交付夹具改为 >180 字正文（`DELIVERY-INLINE-PREFIX/TAIL-MARKER`）；断言改为「默认内联全文 + 回执折叠 + 三列/aria-live/重试/证据/安全副本仍在」；点击重试前先展开回执；A5 交付断言由「ordinary 有 `report-complete`」改为「ordinary 正文含 tail 且无 `report-complete`、有 `report-evidence`」 |
| `test/桌面UI/source-guard.test.ts` | 272 | +11 / −4 | `480564e15c49762911d8981533a23843b0f7685b2804b344d6e3ce66f7a33e9b` | `e40b4ca448881a412edad2599e83daa2207b2e01` | 守卫由 `markdownHtml(isAcceptance ? full : preview)` 改为等价新不变量：`showFull` 表达式、`markdownHtml(showFull ? full : preview)`、`showFull ? null` 才折叠、只有一处 JSX 传 `inlineFull`（交付行）、`report-evidence` 存在；保留普通 handback 的 preview+`report-complete` 守卫 |

合计 **+144 / −61**（净 +83 行；`raw/diff.patch`，覆盖上述 4 个文件）。无 i18n 文案改动、无新增依赖、无构建配置改动、无主进程/preload/src 改动。

### 3.2 新增（证据与探针，未跟踪）

- `角色卡/桌面UI/docs/change/2026-11-04_delivery-inline-report-evidence/probe-delivery-inline.mjs`（421 行；SHA-256 `ae7a67401f8cb212fa72d58cacc2918a29b0cd3da32ea7a5df3cc9ed13fc1b82`；`git hash-object` `0eded475e4626b8a2ccbbf28e3b4d629a8dfa0ed`）
- `角色卡/桌面UI/docs/change/2026-11-04_delivery-inline-report-evidence/before/`、`after/`、`raw/`（截图/探针结果/原始日志/基线快照/patch）
- 本记录。

### 3.3 未写

`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`package.json`/`tsconfig*`/`vite.config.ts`、其他角色资料、角色卡/边界、`docs/communication|scheduling|acceptance`。未 apply/pop 任何 git stash；未套用 2026-11-02 `full-report-display` 快照（仅只读查看其设计文档理解 16 KiB/证据上限）。

## 4. 实现要点

1. **单一渲染入口**：`ReportBody` 新增 `inlineFull?: boolean`；`showFull = isAcceptance || inlineFull === true`。摘要 div 使用 `markdownHtml(showFull ? full : preview)`，仍只经既有 `renderMarkdown`（`html:false`、链接白名单）。
2. **交付行只在内联模式下去掉**「报告原文摘录」标签与「摘要已折叠…」提示；`projection-flags`（净化/截断/证据预算省略）原样保留。`report-complete` 渲染条件改为 `showFull ? null`，因此交付普通报告没有第二次折叠；handback 普通报告（不传 `inlineFull`）仍保持 preview + `report-complete`。
3. **证据不丢**：交付普通报告在正文后渲染 `details.report-evidence`（默认折叠），summary 用既有 `ui.reportCard.evidenceCount`，列表结构与验收证据一致（`hb-evidence` + 逐条 `textFlags`）；空证据显示既有 `noEvidence`。`evidenceOmitted` 预算事实仍在 `projection-flags` 中。
4. **回执降级不丢失**：`DeliveryCard` 报告区在前；尾部 `details.delivery-receipt`（默认折叠）summary 为既有 `ui.reportCard.receiptHistory` + `historyLabel` 附注；内部保留 `.delivery-batch-title`（`deliveryBatchTitle` 原文，含「本批 N 份」）、`.report-facts.delivery-batch-facts` 三列、重试按钮、错误与提示文本；`role="status" aria-live="polite"` 挂在回执内容容器上。`.safe-input-copy` 保持在最后、默认折叠。
5. **验收不变**：交付批内验收报告仍全文 + `acceptance-evidence`，无 `report-complete`；`is-acceptance`/`is-blocked` 类与配色逻辑未动。
6. **无新文案**：仅复用既有 key（`receiptHistory`/`evidenceCount`/`acceptanceReportLabel`/`noEvidence` 等）；`deliveryBatchTitle` 未改、`report-view.test.ts` 未动。

## 5. 验证原始结果

环境说明：worktree 已 `npm ci`；Electron 二进制缺失时用 `node node_modules/electron/install.js` 补装（Electron **v44.7.0**，`node_modules/electron/dist/electron.exe` 存在）。以下均在本 worktree 内执行（隔离守卫禁止对该 worktree 执行 git 命令；git blob 哈希由 Node 按 `blob <len>\0` 计算，等价 `git hash-object`）。

| 步骤 | 命令 | 结果 | 原始输出 |
| --- | --- | --- | --- |
| 基线构建（改前） | `npm run build:renderer` | exit 0，`✓ built in 346ms`（以基线文件快照临时还原后重跑并留存；首次改前构建为 447ms） | `raw/before-build-renderer.log` |
| 基线冒烟（改前） | `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs "" <before/smoke-out>` | **69 checks / 0 failures**；zero console errors / zero CSP violations。说明：OUT 目录 `…/before/smoke-out` 当时未单独留存（后续探针输出目录清理时被复用删除），原始输出以 `raw/before-phase4b-smoke.log` 为准 | `raw/before-phase4b-smoke.log` |
| 改前探针 | `electron .../probe-delivery-inline.mjs before <before>` | **6 checks / 0 failures**；截图 `delivery-default-before.png`、`delivery-report-bottom-before.png` | `raw/before-probe.log`、`before/probe-result.json` |
| 类型检查 | `npm run typecheck:renderer` | exit 0，无错误输出 | `raw/typecheck-renderer.log` |
| 构建 | `npm run build:renderer` | exit 0，`✓ built in 347ms` | `raw/build-renderer-final.log` |
| 单测 | `node --test "test/桌面UI/**/*.test.ts"` | **tests 402 / pass 402 / fail 0 / skipped 0**（719.4ms） | `raw/renderer-ui-tests.log` |
| 冒烟（改后） | `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs "" <raw/smoke-after>` | **69 checks / 0 failures**；zero console errors / zero CSP violations；`report.json` 与 14 张截图已留存 | `raw/after-phase4b-smoke-rerun.log`、`raw/smoke-after/report.json` |
| 改后探针 | `electron .../probe-delivery-inline.mjs after <after>` | **14 checks / 0 failures**；截图 `delivery-default-after.png`、`delivery-report-bottom-after.png`、`delivery-receipt-open-after.png` | `raw/after-probe.log`、`after/probe-result.json` |

改前探针 DOM 断言（无点击）：`topLevelParagraph = "交付 · 本批 1 份（不表示全部收齐）"`；`.delivery-report .hb-summary` 长度 181、含前缀不含尾标记；`.report-complete` 存在且关闭、其 `.hb-complete-summary` 含尾标记；三列 `dt` = 3。

改后探针 DOM 断言（无点击）：`topLevelParagraph = null`；`.delivery-receipt` 存在且关闭、summary 含「接收历史」、内部 `.delivery-batch-title` 逐字为「交付 · 本批 1 份（不表示全部收齐）」；`.delivery-report .hb-summary` 长度 561、前缀与 `PROBE-DELIVERY-TAIL-MARKER` 均在；`report-complete = false`；无 `excerpt-label`；`.report-evidence` summary「证据（1 条）」、含证据项与「已截断」；正文 flags「已净化 · 已截断；部分证据显示已截断」；三列 `dt` = `接收历史/目标输入记录/目标轮次结果`；重试按钮「重试保存历史」；`role="status" aria-live="polite"` 在回执内；`.safe-input-copy` 存在且关闭；zero console errors。

- **截图首帧修正（复核后）**：`show:false` 窗口首张 `capturePage()` 可能返回重绘前旧帧（曾出现「尚未导入项目」空壳）；`shot()` 现先 `wc.invalidate()`、等两个 `requestAnimationFrame` 后丢弃一张预热帧再取图。before/after 全部截图已按「临时还原基线 → 构建 → before 探针 → 还原候选（SHA-256 校验）→ 构建 → after 探针」重采；本表 checks/failures 不变。

## 6. 截图与证据路径

证据目录：`角色卡/桌面UI/docs/change/2026-11-04_delivery-inline-report-evidence/`

- 探针：`probe-delivery-inline.mjs`（复用既有 `test/桌面UI/phase4b-smoke-preload.cjs`，未改动既有 preload）
- 改前：`before/delivery-default-before.png`（卡片顶部默认态：卡首「交付 · 本批 1 份（不表示全部收齐）」+ 三列回执 + 180 字预览 + 「查看完整报告摘要与证据」折叠）、`before/delivery-report-bottom-before.png`（预览尾/flags/折叠）、`before/probe-result.json`
- 改后：`after/delivery-default-after.png`（卡片顶部默认态：卡首直接是「任务报告」正文，全文含尾标记、证据折叠、尾部「接收历史」折叠）、`after/delivery-report-bottom-after.png`、`after/delivery-receipt-open-after.png`（展开回执：批次标题/三列/重试/安全副本）、`after/probe-result.json`
- 原始输出：`raw/before-phase4b-smoke.log`、`raw/before-probe.log`、`raw/typecheck-renderer.log`、`raw/build-renderer-final.log`、`raw/renderer-ui-tests.log`、`raw/after-phase4b-smoke-rerun.log`、`raw/after-probe.log`、`raw/smoke-after/report.json`
- 差异与哈希：`raw/diff.patch`、`raw/baseline/`（4 个改前文件快照）、`raw/candidate/`（2 个渲染候选，基线构建复核后已按 SHA-256 校验还原）、`raw/before-build-renderer.log`、`raw/candidate-hashes.txt`、`raw/hash-files.cjs`

## 7. 候选哈希（改前 → 改后）

| 文件 | 改前 SHA-256 | 改后 SHA-256 | 改后 `git hash-object` |
| --- | --- | --- | --- |
| `app/renderer/src/shell/ReportCard.tsx` | `787db0208bc370c0c3f5d61348010c21fa413a9f3b84be7cbce48a04e6956285` | `5f4ae76cfb2f4de74ee797175ae70ac4ff3e0c1e922e4b7b4d2def6e452166ae` | `b4dc589e16b05d4d59a3f209db8e84906389ecf9` |
| `app/renderer/src/shell/phase4b.css` | `97508bc3e46e7f022e1e425b558f679d41f66e1b6b9f4c96eac0460563ee8a98` | `d0ec50f99d80026be68fef599c325ee868a35d8584343b74cb2308e0489a940c` | `81dc78efecf765e1d49c09c0ac8473509779d062` |
| `test/桌面UI/phase4b-electron-smoke.mjs` | `bd6fdba15954da3e6c689d9fe8028d421e4e59200909a2c1f3a42f6b6bf409eb` | `e84ef409b82136eb096a1d1891cd507049a61fdc97aa73f45710cece059e47f8` | `8545bc8ae782c68538752499d4d8ba2bbc68c71e` |
| `test/桌面UI/source-guard.test.ts` | `52cbc7a178183900301683f8853dac279e461edb2d38e32703d519ed750f4d67` | `480564e15c49762911d8981533a23843b0f7685b2804b344d6e3ce66f7a33e9b` | `e40b4ca448881a412edad2599e83daa2207b2e01` |
| `…/probe-delivery-inline.mjs`（新增） | — | `ae7a67401f8cb212fa72d58cacc2918a29b0cd3da32ea7a5df3cc9ed13fc1b82` | `0eded475e4626b8a2ccbbf28e3b4d629a8dfa0ed` |

## 8. 未提交声明

**未 commit、未 push、未 merge、未发布。** 所有产品改动仅存在于 worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\delivery-inline-report-fix`（分支 `fix/delivery-inline-report`）的工作区；本会话的隔离守卫禁止对该 worktree 执行 git 操作（`git status`/`git diff`/`git hash-object` 被拒），因此差异与哈希由基线快照 + `diff -u` / Node 等价计算得出。

## 9. 风险与回归说明

1. **回执默认折叠**：保存状态/重试入口需一次点击才能看到；`role="status"` 位于关闭的 `<details>` 内，部分读屏器可能不播报。此为客户要求的「状态降级」直接后果，事实仍完整可达（DOM 断言覆盖）。
2. **卡片高度**：全文内联使长报告（≤16 KiB 投影上限）交付卡显著变高；虚拟窗口/行高口径未改动，超长正文沿用既有 `max-height: 40vh` + 卡内滚动样式，未引入新性能优化。无新增 DOM 净化/转义路径（仍走 `markdownHtml`）。
3. **证据折叠**：交付普通报告证据默认收起（只含证据，不含正文）；逐条 flags 与预算省略 fact 保留。若客户希望证据也默认展开，需另行指示（不在本次「正文直出」范围）。
4. **仅渲染层**：未触碰 16 KiB 投影/脱敏/交付批次结构；因此主进程若改变报告投影形状，本 UI 会按既有字段（`summary.text`/`evidence`/`evidenceOmitted`）如实降级，不会越界造正文。
5. **测试范围**：只跑渲染层 typecheck/build、`test/桌面UI/**` 单测与 phase4b 冒烟；未跑全仓 `npm run typecheck`、`test/装配/**`、其他 Electron smoke（超出本角色写集/任务范围）。
6. **隔离环境限制**：目标 worktree 的 git 命令被会话守卫拒绝，故 `git diff --stat` 以 `diff -u` 行数替代；候选哈希为真实文件字节计算。
