# 验收报告 E2：验收结果返回幕僚的卡片特殊显示 + 原文直出（acceptance return card）

- **任务 ID / flowId**：`2026-11-02-acceptance-return-card` / `acceptance-return-card`
- **记录角色 / 上下文**：ANS 独立验收（内置管理角色，唯一验收主上下文 E2；未启动取证子上下文，未接触客户）
- **日期**：2026-11-02
- **风险档位**：**T2**（跨渲染层、桌面 Interface 与共享 i18n 的展示/载荷变更；不改验收判定/选项/路由/报告持久化/声明语义/写权/边界；不新增共享 Model/公共导出；方案 §8.1 与闸门 1/2 已定档）
- **判定依据**：客户闸门 0/1/2 与实施授权记录 `docs/communication/2026-11-02_intent_acceptance-return-card.md`（E2 读取时 **137 行** / SHA-256 `654e432b5ba27ae73fddfd7bf2e7c598b5bc1b880986e8018e0d12f2ede3098b`，含闸门 0、闸门 1、闸门 2、实施授权小节；该文件是沟通管理记录、可能继续追加，本报告引用其确认小节而不依赖固定行号）；客户闸门 1 确认的方案 **P1.2** `docs/planning/2026-11-02_design_acceptance-return-card.md`（**873 行** / `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2`）；独立复核 `docs/planning/2026-11-02_review_acceptance-return-card.md`（**143 行** / `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f`）；闸门 2 确认的团队计划 `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md`（**429 行** / `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6`）；实施前冻结的验收标准 **V1** `docs/acceptance/acceptance-return-card-criteria-v1.md`（**926 行** / `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b`）；统筹变更包 **E1** `docs/scheduling/acceptance-return-card-change-v1.md`（**173 行** / `0013f95aac1079db9bd7252c527245c1acd0208459a03fa4a5b52d88d29b70f6`）。
- **候选身份**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`；**产品/测试候选树 `9c744add87d02bc98e143e605c94a3a7f4434588`**（19 路径：11 产品 + 7 修改测试 + 1 新增测试）；E2 独立复算一致；无写集外产品/测试改动；staged 空；**未 commit/push**。
- **选定检查**：T2 口径——受影响层测试 + 跨层 SessionManager 载荷 + `npm run typecheck` + `npm run typecheck:renderer` + `npm run build:renderer` + 官方 Electron E2E（phase4b）；**未执行 T3 全量回归**（T2 默认，未触发升档条件；§六）。另做仓库外临时探针补 AC-3 空证据与 AC-11 回放/旧 payload DOM；另跑既有 Markdown XSS 与回放纯逻辑套件。
- **复用证据**：B0/A1–A5/D1 均在本候选上；E2 逐项核对其冻结哈希后复用；未使用其它变更（acceptance-evidence-path、dispatch-guardrail-relax、i18n 等）的证据；候选、输入、依赖、夹具或构建变化时受影响证据失效（§六）。
- **E2E 状态**：官方 `phase4b-electron-smoke.mjs` **PASS 64 checks / 0 failures**，exit 0，console/CSP 0，13 张截图；E2 独立复跑 `report.json` 与 D1 完全相同（`07a3c900…`）。
- **结论**：**通过（pass）**。AC-1–AC-14 **14/14 pass**；F3/F5/Q5-A/O2 核对项全部满足；无 fail、无 insufficient evidence、无 not applicable。通过仅对当前候选（HEAD `5a35908` + 19 文件）；不授权提交/推送/合并/发布（E3/客户另行授权）。

---

## 一、输入、候选与独立复算

### 1.1 客户确认链与实施授权

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-02） | 沟通记录「闸门 0 确认记录」：Q1 两者都要；Q2 徽标 + 全文 + 证据。闸门 0 写盘快照 68 行 / `54f44bbb…`（历史快照，方案文件头引用） |
| 闸门 1：方案确认 | 已确认（P1.2 为唯一基线） | 客户原话「确认闸门 1：方案 P1.2，文案/冷色/preview/O2/Q5-A/F3 限制/Q4 全位置按推荐；仅 O2 纳入，其余选装不实施。」；方案 873/`51057be9…`；复核 143/`6f8f8121…` |
| 闸门 2：角色/写集/边界/档位/顺序/验收安排/证据口径 | 已确认（2026-11-02） | 客户原话「确认闸门 2：团队计划 v1 的参与角色、精确写集、B-1、T2、阶段顺序、验收安排与证据口径；实施授权另行给出。」；团队计划 429/`05a94dd0…` |
| 实施授权 | 已给（2026-11-02，不含提交/推送/发布） | 沟通记录「实施授权记录」：客户原话「授权实施：按团队计划 v1 与 V1 标准开始 B0/P1，随后按阶段实施；不含提交/推送/发布。」；派发前置核验记录闸门 2、IA、V1、H1 均满足 |
| 提交/推送/发布 | 未授权、未执行 | HEAD 未前进；`git log -1` 仍为 `5a35908 Merge pull request #31…`；staged 空 |
| B-1 边界（治理，非产品候选） | 已落地（人事 H1） | `角色卡/桌面窗口/boundary.md` 93/`4756558e…`、`boundary.yaml` 251/`ea766230…`、`changelog.md` 199/`6b6b9bc8…`；含 `test/桌面应用/acceptance-return-card.test.ts` 精确条目 |

### 1.2 候选身份与独立复算

E2 以临时索引从 `HEAD 5a35908` 出发，仅加入团队计划 §4.3 的 19 个产品/测试路径，`git write-tree` 复算候选树：

```text
recomputed_tree=9c744add87d02bc98e143e605c94a3a7f4434588
```

- `git status --porcelain -- src app test` 实测 **19 路径**，与 E1 §1.1 逐路径一致；无写集外产品/测试改动。
- 逐文件 `sha256sum` 与 E1/D1 清单 **19/19 一致**（见下表）。
- `git diff --cached --name-only` 为空；`package.json` 未改；`.ans/project.json` 不存在（无 task_ops）。
- `test/桌面应用/e2e/uiux-v2.mjs`、`test/桌面应用/e2e/main.mjs` 未修改（`git status` 空）。
- 受保护/范围外文件（`src/model/runtime.ts`、`src/common/runtime-core/tool-display.ts`、`report-provenance.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/run-role.ts`、`src/common/编排/handback.ts`、`app/desktop/interface.ts`、`app/renderer/src/chat/types.ts`、`markdown.ts`、`ChatRow.tsx`、`TaskCenterPanel.tsx`、`app/renderer/src/index.css`、既有 `acceptance-evidence.test.ts`/`optional-acceptance.test.ts`、`uiux-v2.mjs`、`main.mjs`、`package.json`）**零 diff**（E2 `12-protected-diff.txt` 为空）。

| # | 候选路径（相对 HEAD） | 状态 | SHA-256（E2 实测） |
| --- | --- | --- | --- |
| 1 | `src/common/shared/i18n/messages/zh-CN.ts` | M | `2bea07fca5adba6bec5a670c99101618c9f568969b998e03340e8596dd295283` |
| 2 | `src/common/shared/i18n/messages/en-US.ts` | M | `48e35b824161f5011cdac3696e8d06a6c4285ca5191371cd427bcaf3321b3eb3` |
| 3 | `test/项目管理/shared/i18n.test.ts` | M | `44dba1269878500963dcea81be0c4a38b1756c1034de76e41a27de89d12e6ed1` |
| 4 | `app/renderer/src/chat/role-view.ts` | M | `05a2225c50b21b4c752564053d1b5947597c4cb4d3b497b93f7e40fd21465843` |
| 5 | `app/renderer/src/chat/decision-dialog.ts` | M | `c62d44b4e34308255ed8217539a4ec3f238429512cfd556c223f7f6c3b4d1679` |
| 6 | `test/桌面UI/role-view.test.ts` | M | `a8f853e4b72ead394fa2d54837b02c2a8c58165378c0418cea5f6d7fcac2f5ff` |
| 7 | `test/桌面UI/decision-dialog.test.ts` | M | `50c7797220c2de27f457ac1678fe84c6c63948f429ac3e142282add38a72e062` |
| 8 | `app/renderer/src/shell/ReportCard.tsx` | M | `787db0208bc370c0c3f5d61348010c21fa413a9f3b84be7cbce48a04e6956285` |
| 9 | `app/renderer/src/chat/DecisionDialog.tsx` | M | `f7969e3f1e2f112a3d7b8ec9964ddaa258460f489251a3aafaa22a514e4e4355` |
| 10 | `app/renderer/src/shell/shell.css` | M | `12bf211c4a1a18e63c64e11d14956101ecf892efc74a0ea7eeff23d7806d6fb9` |
| 11 | `app/renderer/src/shell/phase4a.css` | M | `79fe070362c38ae3e0009a9d5fa8b6f50becaa1278eabdbc3ef9568b22b20cae` |
| 12 | `app/renderer/src/shell/phase4b.css` | M | `0c05f4d4dc0ab743ba2916a75209fb3fa07dd60fb034ba418d2ab36fcc00fc60` |
| 13 | `test/桌面UI/dialog-a11y.test.ts` | M | `7ac0d1c1f71e06d5c8cab65ba6f95db80f02c430bdfacfb937e5d2966d29ff35` |
| 14 | `test/桌面UI/source-guard.test.ts` | M | `52cbc7a178183900301683f8853dac279e461edb2d38e32703d519ed750f4d67` |
| 15 | `test/桌面UI/theme-tokens.test.ts` | M | `79a4fe443333e8d363ea5965ed0d05e3ed89dcbc9abdb7eca669b3fb699a8a1f` |
| 16 | `app/desktop/session.ts` | M | `73b1f70e0e567c59b6d7f6c684f62a55c3997f624da360b34ef065f605a4c4ce` |
| 17 | `app/desktop/customer-input.ts` | M | `059f080eb66758ced158c40fccac80f2202b35187b601ddc0ba28c6b07679d2d` |
| 18 | `test/桌面应用/acceptance-return-card.test.ts` | A（B-1） | `0c008cc574563a0a60a6f48b392b471b3464e8b6bf6426adc8123749fd62e9b4` |
| 19 | `test/桌面UI/phase4b-electron-smoke.mjs` | M（A5） | `bc6d1c7eb770023494ad530b1386c35320322bd1a98befd02e026f07b2a86daf` |

候选复算/哈希原始记录：`C:\Users\51054\AppData\Local\Temp\ans-acceptance-arc-e2\01-candidate.txt`（SHA-256 `b1493629c3632da8615c3881a773b315b90689f24077173ec6142554a7504da2`）；输入哈希：`00-inputs.txt`（`3277549d64f02559b3600c5bb50eb6f55619985339ab4d7164eb5011ebd1b638`）；受保护零 diff：`12-protected-diff.txt`（`525c91d8059c26510ea0f7140cd4531e20657295b1f69e78097c87d09e1640a6`）。

### 1.3 证据记录核对

E2 独立复算以下记录/证据的 SHA-256，与 E1 表一致：

| 证据 | 行数 | SHA-256 | 核对 |
| --- | --- | --- | --- |
| B0 基线 | 178 | `b4c4808fc66c4005273058dd9e20df28830a5df3ca89a4ee6b3b20aa12838f61` | 一致 |
| P1 审核（`recommend approval`） | 168 | `8a114aab2d6f1fa61bc7df8a1ef09f81d65afdb17d2990bf78a4ead50ca080d2` | 一致 |
| A1 实施 | 170 | `71b73c2f2e3424573d88e52c1ffc97063233a18d6a069327c8a5655a3e8b26b2` | 一致 |
| A2 实施 | 140 | `8aec3da0cdeb56c39dbb3c392d8896e2c3be8908e70a0ba9fcabb0fdbb85d2b7` | 一致 |
| A3 实施 | 159 | `fed6af622e04ab43599cc7737767f649c790bce587ec861a13fc8d24e68158f8` | 一致 |
| A4 实施 | 140 | `ae36e582a08333cc75daa2a9379349908d852a3a37e67321adb4149cbd119a97` | 一致 |
| A5 实施 | 112 | `282439ec79e14013e08ac3a82e7998bb774f661b001f03416305ba52dfede810` | 一致 |
| A5 基线修复 | 86 | `c5bbe48d7ddd4324688a081e4d5675cb7fefb8cd6631ddf7772d97124ee3665e` | 一致 |
| D1 回归 | 218 | `d4feab2b3b941dfee327fb9fc1857c8930fe839525a8ff6c29b11a71cf1d4791` | 一致 |
| D1 候选清单 | 20 | `738302086dd67ee26356133a2d2319f02682b863d4889e7c63cbec9beb1e810d` | 一致 |
| D1 report.json（实际路径 `D1-evidence/e2e-phase4b/report.json`） | — | `07a3c90047a80603a924fafb8ce72d269a349379527155e3ecd139801445e60e` | 一致（E1 表路径为简写） |
| D1 phase4b 日志 | 80 | `0495fe51d4fca882366e00711816795ed4055ab57609700ea1f700983e543765` | 一致 |
| A5 截图清单 | 13 行 | `791e7c6bcdd4c34860d62fa714dbc8f44f6724cf9a547e55b1e74ece8c6629a1` | 一致 |
| A5 15 项块指纹（`phase4b` 869–1194 行） | 326 | `b9cac689649ad593ebeec5c7d746eac9e400a7fbae5b0fe2af6fb3742cd82bb0` | E2 独立复算一致（块未改） |
| H1 boundary.md / boundary.yaml / changelog.md | 93 / 251 / 199 | `4756558e…` / `ea766230…` / `6b6b9bc8…` | 一致 |

D1 `11-post-run-verification.txt` 显示 E2E 后 HEAD 未前进、`WRITE_SET_MATCH=exact`（19）、staged 空、`package.json` 未改、本 worktree Electron 进程 0；E2 复核时 HEAD/status 仍相同。

### 1.4 环境

Windows 11 Pro 10.0.26300 / Git Bash；Node `v24.22.1` / npm `11.19.1`；Electron 44.7.0；`node_modules/.bin/electron` 存在；无 `.ans/project.json`（未启用 task_ops）；无 DEBUG 覆盖层；**未录屏**。

---

## 二、独立验证执行

### 2.1 方法与命令

E2 不只读取 E1/D1 自述，独立执行以下检查（均在 worktree 根目录、同一候选）：

| # | 检查 | 命令（摘要） | 结果 | E2 原始记录 |
| --- | --- | --- | --- | --- |
| 1 | 候选树/写集/哈希复算 | 临时索引 `read-tree HEAD` + `git add -- <19 路径>` + `write-tree`；逐文件 `sha256sum`；受保护文件 `git status`/`git diff --name-only` | 树 `9c744add…`；19/19 一致；受保护零 diff | `01-candidate.txt` / `12-protected-diff.txt` |
| 2 | 桌面UI 受影响套件 | `node --test --test-concurrency=1 test/桌面UI/{report-view,role-view,decision-dialog,dialog-a11y,source-guard,theme-tokens}.test.ts` | **47/47 pass**，0 fail/skip/todo | `02-suites.log` |
| 3 | 项目管理 i18n | `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts` | **14/14 pass**；计数 `ui 921 / main 559 / shared 62 / preferences 3 = 1545`；guard `scanned=131 allowlisted=20 violations=0` | `02-suites.log` |
| 4 | 桌面应用 SessionManager/回归 | `node --test --test-concurrency=1 test/桌面应用/{acceptance-return-card,acceptance-evidence,optional-acceptance}.test.ts` | **19/19 pass**（新增 10 例 + 既有 9 例） | `02-suites.log` |
| 5 | 投影/报告快照前提 | `node --test --test-concurrency=1 test/runtime-core/{tool-display,report-provenance}.test.ts` | **36/36 pass** | `02-suites.log` |
| 6 | 类型/构建 | `npm run typecheck`；`npm run typecheck:renderer`；`npm run build:renderer` | 均 **exit 0**（0 类型错误；vite 8.3.4 built 413ms；仅既有非致命警告） | `03/04/05-*.log` |
| 7 | 官方 Electron E2E | `node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html <fresh userData>` | **PASS 64 checks / 0 failures**，exit 0，console 0，CSP 0，13 截图；`report.json` `07a3c900…`（与 D1 完全相同） | `06-official-phase4b.log` / `e2e-run/report.json` |
| 8 | 仓库外临时补充探针（AC-3 空证据 / AC-11 回放/旧 payload） | 复制官方 `phase4b` 到仓库外临时目录，仅插入 3 项补充检查；同一候选构建、真实 Electron | **PASS 67 checks / 0 failures**；AC11 replay、AC3 empty evidence、AC11 old payload 均 true | `08-probe.log` / `probe-run/report.json` / `13-probe-block.txt` |
| 9 | 既有 Markdown XSS + 回放纯逻辑 | `node --test --test-concurrency=1 test/桌面UI/markdown.test.ts test/桌面UI/replay.test.ts` | **16/16 pass** | `10-markdown-replay.log` |

- 补充探针说明：官方 `phase4b` 未包含「AC-3 空证据」与「AC-11 历史回放/旧 payload」的动态 DOM 用例。为不降低 V1 标准，E2 将官方 harness 复制到仓库外临时目录（`C:\Users\51054\AppData\Local\Temp\arc-e2-probe\`），仅插入 3 项补充检查后运行；**未修改仓库内任何产品/测试文件**，临时文件不在产品候选内。该探针是补充证据，不替代官方 64/0；官方 64/0 已独立复跑并与 D1 `report.json` 哈希一致。
- 截图：E2 官方运行产生 13 张 PNG；`11-screenshot-manifest.txt`（`865a2d758a3507efc7f985b943374b841cc37cc1df817575b5152b032fba1bfc`）记录逐张 SHA-256。截图仅作辅助；V1 不要求录屏，缺少/不完美截图不构成 fail/insufficient（§七.3）。

### 2.2 证据复用与失效

- B0/A1–A5/D1 均在同一候选（HEAD `5a35908` + 19 文件）上产出；E2 核对记录与候选哈希后复用。D1 的 116/116、双 typecheck/build 0、官方 phase4b 64/0 与 E2 独立复跑一致；E2 未发现候选、输入、依赖、夹具或构建变化。
- 未使用其它变更（acceptance-evidence-path、dispatch-guardrail-relax、i18n、shell-escalation 等）的通过结论或证据；管理记录（`docs/planning|scheduling|communication|acceptance`）不计入产品候选。
- **T2 默认不做 T3 全量回归**：本次变更未触发升档条件（无共享 Model/公共导出/判定/路由/持久化/写权变化，§六），且受影响套件、双 typecheck/build、官方 E2E 与补充探针均通过；故未运行 T3 全量。若未来候选/契约变化或证据不足，按 V1 §2.3/§6.5 补证。

---

## 三、验收表（AC-1–AC-14）

### 3.1 总表

| ID | 方案 §9 标准（摘要） | 实际证据（本轮候选） | 结果 | 判断 |
| --- | --- | --- | --- | --- |
| AC-1 | 两处位置显示独立验收身份；普通卡不显示；项目角色不标记；F3 文案不声称通过 | 官方 phase4b A5 handback/delivery/blocked/ordinary/unsupported 检查（64/0，`report.json 07a3c900…`）；`role-view` 在桌面UI 6 文件 47/47 组内通过；F3 条件文案/非断言式短语断言 | 全过 | **pass** |
| AC-2 | 验收卡正文完整 `summary.text`；无 180 字预览/折叠；普通卡不变 | A5 handback 结束 marker 可见、无 `.report-complete`；A5 ordinary 保留 preview + `.report-complete`；`report-view` 在桌面UI 6 文件 47/47 组内通过 | 全过 | **pass** |
| AC-3 | 全部 evidence 逐条文本/flags；空列表「未提供证据」；省略提示 | A5 2 条 evidence（redacted/truncated）+ `evidenceOmitted=2` 断言；E2 探针空 evidence 显示「（未提供证据）」 | 全过 | **pass** |
| AC-4 | 普通报告 180 字/4 行 + 折叠；既有 e2e/冒烟断言通过 | `report-view` 在桌面UI 6 文件 47/47 组内通过；官方 phase4b 普通报告 1360/960/200% 检查 + A5 ordinary（无验收类、preview + fold）；`uiux-v2` 未运行（既有基线失败，§七.1） | 全过 | **pass** |
| AC-5 | 决定卡本地化徽标/冷色/16 KiB 原文/O2 路径/preview 始终可见/选项不变 | SessionManager 新测试 10/10（正常文件：ctx/payload、路径、options/preview 深等、作答、账本无正文、读复用、原文件哈希）；A2 17/17；A5 对话框 DOM 检查（徽标/原文/路径/preview marker 可见/选项/推荐/提交） | 全过 | **pass** |
| AC-6 | 缺失/不可读/无/非法 flowId/旧 payload 降级；可作答；不越界读 | SessionManager 五组夹具（空/缺失/目录 EISDIR/无 flowId/非法 flowId）+ sentinel 未读 + judgeContext/facts 报告路径缺失/artifacts 缺失/`unavailableReason` fail-closed；E2 探针旧 payload DOM fallback + preview + 选项可答 | 全过 | **pass** |
| AC-7 | 决定卡 ≤16 KiB UTF-8 投影/截断 flag；报告卡既有快照上限；原文件不改写 | SessionManager >16 KiB（`Buffer.byteLength<=16384`、`truncated=true`、原文件 sha 不变）；净化 `redacted=true`；A5 对话框 16384 文本 + 截断提示；`report-provenance` 36/36；A5 evidence 省略提示 | 全过 | **pass** |
| AC-8 | 14 key 中英成对/占位符一致/无硬编码中文/计数更新 | i18n 14/14；精确计数 `ui 921 / 1545`；14 key 契约测试通过；guard 0 违规；桌面UI 6 文件 47/47（含 source-guard 中文泄漏/管线检查） | 全过 | **pass** |
| AC-9 | 只经 `markdown.ts` 安全渲染；preview 纯文本；净化 flags；非法 flowId 不越界 | `source-guard` 随桌面UI 6 文件 47/47 通过（Markdown 单一管线/无新 innerHTML）；`markdown.test.ts` XSS 负例通过；SessionManager 伪 secret `[REDACTED]`/明文不泄漏；非法 flowId sentinel 未读 | 全过 | **pass** |
| AC-10 | 文字徽标；ARIA/焦点/二次确认不变；两处危险色优先；决定卡危险色优先；200%/窄屏无溢出 | `dialog-a11y`/`theme-tokens`（47/47 组内）；A5 回交行/交付批冷色/危险色、决定卡 high-risk/destructive、200% 对话框/报告无横向溢出；官方 64/0；截图辅助（§七.3） | 全过 | **pass** |
| AC-11 | 回放分类正确；无法解析普通显示；旧 payload 降级 preview | E2 探针：历史 `reports` 回放 verifier 报告仍 `is-acceptance` + 标题/徽标/全文/无折叠；旧 payload 对话框 fallback + preview + 可作答；`decision-dialog.test.ts` 无字段 → null/answerable；A4 旧 payload channel 用例；`replay.test.ts` 4/4 | 全过 | **pass** |
| AC-12 | 判定/选项/推荐/可作答性/优先级/代批/`request.resolved`/持久化/写权零变化 | 受保护文件零 diff；19 路径 diff 仅展示/载荷/i18n/测试/CSS；语义关键词 diff 仅非法 flowId 合成 `governanceModel:"trio"`（N4 保护）；`optional-acceptance` 19/19；无判定/路由/持久化改动 | 全过 | **pass** |
| AC-13 | 无新工具/能力位/IPC/cardKind/公共导出/共享字段；`acceptanceReport` 应用私有 | `src/model/runtime.ts`/public 入口/`interface.ts`/schema 零 diff；`acceptanceReport` 仅 `customer-input.ts` 定义 + `session.ts` 传递 + renderer 消费；SessionManager 断言 `request.created` 无字段、账本无报告正文；source-guard localStorage 既有断言 | 全过 | **pass** |
| AC-14 | 变更包含候选哈希/路径/节点/证据/档位/未提交声明 | E1 173/`0013f95a…` 字段齐全；E2 复算候选树 `9c744add…`、19/19 哈希；D1/B0/A1–A5 证据链接可核对；T2；HEAD 未前进/staged 空 | 全过 | **pass** |

**总体**：AC-1–AC-14 **14/14 pass**；无 fail/insufficient/not applicable。§四 核对项全部满足。

### 3.2 逐项核对说明

**AC-1（验收报告身份）**
- 官方 phase4b A5 块断言：回交行 `.msg-handback.is-acceptance` + 标题「独立验收报告」+ 徽标「独立验收」+ `report-top/report-body.is-acceptance`；交付批两个 `.delivery-report.is-acceptance`（completed/blocked），均含标题/徽标/全文/证据/无折叠；blocked 保留身份且 `is-blocked` 危险色 `rgb(201, 122, 109)`；普通报告无验收类/徽标、标题「任务报告」；不支持版本 verifier 交付段无任何验收类/标题/徽标（P1-ARC-01）。
- `role-view` 纯逻辑：`builtIn===true && governanceFunction==="verification"` 才 true；项目角色 `verifier`（`builtIn=false`）、缺字段、null/undefined false。
- F3：A5 断言事实行「验收决定（如适用）」+「报告本身不构成通过」、免责声明含「如本次为验收任务」、且不含「已验收通过/验收已通过/通过验收」断言式短语；非验收质量核对报告的限制按闸门 1 已接受，不判 fail。
- E2 独立复跑 64/0；A5 15 项块指纹 `b9cac689…` 未变。

**AC-2（原文直出）**
- 回交行 fixture `summary.text` >180 字且末尾唯一 marker；A5 断言 `.hb-summary` 含尾部 marker、无 `.report-complete`。
- 普通报告 fixture 断言 `.hb-summary` 只含前段 marker、不含尾部 marker，`.report-complete` 默认关闭且含完整 marker。
- `report-view.test.ts` 在桌面UI 6 文件 47/47 组内通过，覆盖既有预览/折叠纯逻辑未回归。

**AC-3（全部证据）**
- A5 fixture：2 条 evidence（1 redacted、1 truncated）+ `evidenceOmitted:2`；断言 `.acceptance-evidence .hb-evidence li` 2 条、文本「验收证据一/二」、「已净化」「已截断」、「另有 2 条证据因预算省略」。
- E2 补充探针：历史回放一份 `evidence: []` 的 verifier 报告，断言验收卡 `.acceptance-evidence .hb-evidence li` 恰 1 条且包含「（未提供证据）」。
- 没有伪造未收到的证据；省略提示使用既有 `reportFlags`。

**AC-4（普通报告不回归）**
- 桌面UI 6 文件 47/47（含 `report-view.test.ts` / `role-view.test.ts`）；官方 phase4b 既有普通报告 1360/960/200% 检查仍通过（报告事实 dt/dd、`report-complete` 展开/滚动、200% 节点宽度）。
- A5 ordinary 检查：普通角色 P 报告无 `is-acceptance`/徽标，预览不含尾部 marker，`.report-complete` 存在且含完整 marker，标题「任务报告」。
- `uiux-v2.mjs` 未运行：该 harness 有既有 `role geometry 1360` 与未注册 IPC handler 基线失败，文件未修改、不在写集；官方 phase4b 已作为可运行 E2E 证据，详见 §七.1。此项不构成 AC-4 insufficient（普通卡行为已由纯逻辑 + 官方 DOM + A5 三方覆盖）。

**AC-5（决定卡身份与原文）**
- SessionManager 新测试「正常文件」：临时项目写 `docs/quality/flow-a-report-v1.md`，走 `withRequestLifecycle`/`enrichAcceptanceJudgeContext`；断言 `metadata.judgeContext.facts.qualityReportPath`/`artifacts.acceptanceReportPath` 存在；`ctx.acceptanceReport = {version:1,path,text:{text,truncated:false,redacted:false}}`；presenter payload 同形；`payload.request` 与输入深等（options/preview）；作答 `accept` → answered；`request.created` 无 `acceptanceReport`；任务账本无报告正文；读 spy 证明复用既有 `docs/quality` 读取；原文件 sha256 不变。
- A2 纯逻辑 17/17：`acceptance` 标志、合法视图、选项/推荐/可作答性/优先级不变；非验收卡不消费字段；缺报告仍可作答；版本/类型/路径非法 → null；UTF-8 16384 单/多字节边界；`sameDisplayText` 去重判据。
- A5 对话框 DOM：`is-acceptance`、`.dd-kind`「独立验收决定」（非机器值）、`.dd-acceptance-report`、正文 marker、`.dd-report-path` `docs/quality/flow-a5-report-v1.md`、`.dd-preview` marker 高度>0 且不在 `<details>` 内、截断提示、2 个 `.dd-option`、推荐星标、`.dd-submit` 可用。O2 路径满足。

**AC-6（决定卡降级）**
- SessionManager 五组：空文件/缺失/不可读（目录 EISDIR）/无 flowId/非法 flowId；均无 `acceptanceReport` 属性、不抛错、preview 保留、选项/作答不变。
- 无 flowId（P1-ARC-04）：上游 metadata 的 `judgeContext.facts`/`artifacts.proposalPath` 深等保留；`docs/quality` 读取数 0；不新增报告路径。
- 非法 flowId（N4）：构造 `../../../<token>`，项目外 sentinel 未被读取；`facts.qualityReportPath` undefined、`artifacts` undefined、`unavailableReason` 匹配「验收最小链事实缺失…质检报告」；preview/options/作答不变。
- E2 补充探针：直接推送无 `acceptanceReport` 的 `session:operator-request`（cardKind=acceptance），对话框显示 fallback、preview marker 高度>0、2 选项、选择后 `.dd-submit` 可用；旧 payload 降级 DOM 成立。

**AC-7（有界投影）**
- SessionManager >16 KiB：17,600 字节报告；`Buffer.byteLength(text,"utf8") <= 16384`、`truncated=true`、`redacted=false`；原文件 sha256 前后一致；payload/ctx 一致。
- 净化：测试注入伪凭据被替换为 `[REDACTED]`、明文不在 payload、`redacted=true`、原文件不变。
- A5 对话框：16384 字节报告 + `truncated:true`，正文 marker + 「报告原文超出显示预算，已截断。」；报告卡 fixture `evidenceOmitted:2` + 省略提示；`report-provenance` 36/36 证明既有快照上限（摘要 16 KiB/单证据 2 KiB/32 条/快照 96 KiB）未变。
- 报告卡正文/证据区有卡内限高滚动（CSS + A5 200% 无溢出）。

**AC-8（i18n）**
- `i18n.test.ts` 精确计数 `ui 921 / main 559 / shared 62 / preferences 3 = 1545`；14 key `ACCEPTANCE_RETURN_CARD_KEYS` 中英成对、精确文案、占位符（`{count}`/`{path}`）一致、`translate` 运行时替换 smoke。
- `i18n-guard.test.ts`：`scanned=131 allowlisted=20 violations=0`；`ReportCard.tsx`/`DecisionDialog.tsx` 无硬编码中文（source-guard 随桌面UI 6 文件 47/47 组通过）。

**AC-9（安全渲染）**
- `source-guard.test.ts`：Markdown 单一管线（`markdown.ts` 定义 esc/依赖 markdown-it；所有 HTML 注入过受控渲染）；验收报告卡全文 `markdownHtml(isAcceptance ? full : preview)`；普通分支 `report-complete` 保留；P1-ARC-01/02 源码钉。
- `markdown.test.ts` XSS 负例：`<script>`/`<img onerror>`/`javascript:`/引号注入/表格/代码块均不产可执行 HTML；链接白名单仅 http/https。
- SessionManager 伪 secret 净化；非法 flowId sentinel 未读（同 AC-6）。
- `DecisionDialog.tsx` 使用局部 `markdownHtml`（`renderMarkdown`）；preview 仍 `<pre>` 纯文本；未新增第二管线。

**AC-10（可访问性/窄屏）**
- `dialog-a11y.test.ts`：现有 `role=dialog`/`aria-modal`/`aria-labelledby`/`aria-describedby`/焦点/二次确认断言保留；验收徽标本地化 key；`.dd-acceptance-report` aria-label；preview `<pre>` 非折叠；`.decision-dialog.is-acceptance.is-high-risk`/`.is-destructive` 规则顺序在 `.is-acceptance` 之后；`max-height:46vh`/480px 查询。
- `theme-tokens.test.ts`：`--info*`/`--danger*`/`--warning-border` 等均定义；新样式无裸色值。
- A5 E2E：回交行冷色 `rgb(134, 197, 227)`；blocked 危险色 `rgb(201, 122, 109)`；交付批 completed/blocked 颜色；决定卡冷色 `rgb(79, 134, 163)`；high-risk 边框非冷色；200% 对话框/验收报告无横向溢出。
- 截图辅助限制见 §七.3；V1 允许窄屏截图可选，DOM 断言已满足。

**AC-11（回放/旧记录）**
- E2 补充探针：`session:history` 的 `reports` 数组回放 verifier 报告（`row.replay=true`），断言 `.msg-handback.is-acceptance`、标题/徽标、全文尾部 marker、无 `.report-complete`。
- E2 补充探针：无 `acceptanceReport` 的旧 acceptance payload，对话框 fallback + preview marker 可见 + 选项选择后可提交。
- A2 `decision-dialog.test.ts`：无字段 → `acceptanceReport:null`、`answerable:true`；A4 旧 payload channel 用例；`replay.test.ts` 4/4（skip/append/full 计划）。
- 无法解析角色列表 → 普通卡：`role-view.test.ts` 对 null/undefined/项目角色 false；`ReportCard` 使用同一 `isVerificationRole`，不存在回放专用分支或数据迁移。

**AC-12（语义零变化）**
- 受保护文件零 diff（§1.2）；19 路径 diff 仅：i18n 文案、渲染展示（`ReportCard`/`DecisionDialog`/纯逻辑/CSS）、桌面展示载荷（`session.ts`/`customer-input.ts`）、测试与 A5 harness。
- 语义关键词 diff 仅：`session.ts` 非法 flowId 合成 context 的 `governanceModel:"trio"`（N4 新增 fail-closed 保护）；phase4b 测试对 `governanceModel==='trio'` 的既有检查替换。无 `governance-judge-*`、`decisionPriority`、`isDestructiveDecision`、`recordFinalReport`、`request.resolved`/`customer.decision` 逻辑改动。
- `optional-acceptance.test.ts` 19/19 组内通过；`acceptance-evidence.test.ts` 9 例回归全过；写权/边界（B-1 治理条目除外）零 diff。

**AC-13（权限/契约）**
- `src/model/runtime.ts` 零 diff；`src/common/shared/**` 除 i18n messages 外零 diff；Service/Pipeline public 入口、`app/desktop/interface.ts`、`src/provider/runtime/schema.ts` 零 diff；无新 IPC/cardKind/工具/能力位。
- `acceptanceReport` 是 `app/desktop/customer-input.ts` 的应用私有可选字段；只在 `session.ts` 构造/传递，`decision-dialog.ts`/`DecisionDialog.tsx` 消费；不写 `tasks.jsonl`/报告快照/localStorage/indexedDB（SessionManager 测试断言 `request.created` 无字段、账本无正文；source-guard 既有 localStorage 断言）。
- `GOVERNANCE_SLUG_PATTERN`/`DisplayTextV1`/`createToolDisplayContext` 只读复用；未抽共享 helper/公共导出。

**AC-14（证据包）**
- E1 含候选哈希（19 文件 + 候选树 `9c744add…`）、改动路径、节点 A1–A5/D1、证据链接、T2、未 commit/push 声明；E2 复算候选树与 19/19 哈希一致。
- D1/B0/A1–A5 记录哈希与 E1 一致；D1 `report.json` 实际路径 `D1-evidence/e2e-phase4b/report.json`，哈希 `07a3c900…` 与 E1 一致（E1 表为路径简写，§七.4）。
- 风险档位 T2 与改动相符；未触发升档条件（§六）；HEAD 未前进、staged 空、无 commit/push。

---

## 四、F3/F5/Q5-A/O2 核对项

| 核对项 | 标准要点 | 实际证据 | 结果 |
| --- | --- | --- | --- |
| **F3 已接受限制** | 内置质检非验收质量核对报告也按验收身份显示；项目角色不标记；文案不声称已通过；不做 O10 | A5 handback 断言条件文案 + 非断言式短语；`role-view` 项目角色/缺字段 false；交付批普通段无验收类；diff 无任务级判别/`reportKind` | **满足** |
| **F5 两处位置/危险色** | 交付批 `.delivery-report` 单独覆盖；回交行/交付批 blocked 危险色优先；决定卡 high-risk/destructive 优先 | A5 delivery 两个 `.delivery-report.is-acceptance`（completed/blocked）+ ordinary `className==='delivery-report'`；CSS `.msg-handback.is-acceptance.is-blocked`/`.delivery-report.is-acceptance.is-blocked`；`phase4a` compound 规则在 `.is-acceptance` 之后；A5 high-risk 边框非冷色 | **满足** |
| **Q5-A 有界投影** | 报告卡既有快照上限；决定卡 16 KiB 安全投影；截断/净化 flags；缺失/不可读/无/非法 flowId 降级；不实施 O4/Q5-B/C/D | SessionManager >16 KiB/净化/五组降级；A5 对话框 16384 + 截断提示；`report-provenance` 36/36；A5 `evidenceOmitted=2`；无第二路径/64 KiB | **满足** |
| **O2 报告路径** | 报告存在时显示固定路径 `docs/quality/<flowId>-report-v1.md`；不显示任意路径；仅 O2 纳入 | SessionManager `ctx.acceptanceReport.path = docs/quality/flow-a-report-v1.md`；A5 `.dd-report-path` 含 `docs/quality/flow-a5-report-v1.md`；缺失/非法不伪造；无 O5 哈希/O4 第二路径/O1/O3–O10 | **满足** |

---

## 五、边界情形核对（判定观察点）

| 情形 | 本轮观察 | 判定 |
| --- | --- | --- |
| verifier 回交行 | 身份/全文/证据/无折叠/冷色 | 符合（A5 64/0） |
| verifier 交付批（含 blocked/普通/不支持版本） | 两个验收段 + 普通段类名不变 + unsupported 无验收类 | 符合（A5 64/0） |
| 普通报告（项目角色） | 180 字预览 + fold + 无验收类 | 符合（A5 64/0 + 桌面UI 47/47 组） |
| 非验收质量核对报告（F3） | 仍按验收身份；条件文案；无断言式通过 | 符合（已接受限制） |
| 决定卡（报告存在） | 徽标/原文/路径/preview/选项 | 符合（SessionManager + A5） |
| 缺失/不可读/无/非法 flowId/旧 payload | 说明 + preview + 可作答；不越界读 | 符合（SessionManager 五组 + 探针） |
| >16 KiB / 净化 | 截断/净化 flags；原文件不改 | 符合（SessionManager + A5） |
| high-risk/destructive | 危险色优先 | 符合（A5） |
| 200%/窄屏 | 无横向溢出 | 符合（A5 DOM） |
| 历史回放 / 旧 payload | 回放验收样式；旧卡 fallback + preview | 符合（E2 探针） |
| 语义/契约/写集 | 受保护零 diff；19 路径；T2 | 符合（diff/复算） |
| 提交/推送/发布 | HEAD 未前进；staged 空 | 未执行（未授权） |

---

## 六、T2 口径、复用与升档

- **T2 依据**：跨渲染层 + 桌面 Interface + 共享 i18n 的展示/载荷变更；不改验收判定/选项/路由/持久化/声明/写权/边界；不新增共享 Model/公共导出；方案 §8.1/团队计划 §1.2 定档。
- **未执行 T3 全量回归**：T2 默认；未触发升档条件；受影响套件 116/116、双 typecheck/build 0、官方 phase4b 64/0、补充探针 67/0、Markdown/回放 16/16。若候选/契约变化或证据不足，按 V1 §2.3/§6.5 补证；升档不降档。
- **复用**：B0/A1–A5/D1 同候选、同输入/夹具/命令；E2 核对哈希后复用。未跨候选、未用其它变更证据。
- **未触发升档**：无 `src/model/runtime.ts` 共享契约修改、无 Service/Pipeline 公共导出、无判定/`request.resolved`/`customer.decision`/路由修改、无新 `cardKind`/工具/能力位/IPC、无展示文本持久化。非法/缺失 flowId 的 facts/artifacts 缺失与 `unavailableReason` 变化是 N4 新增 fail-closed 保护，不是合法 slug 卡行为变化。

---

## 七、限制、披露与未决项（不影响本轮 pass，但如实记录）

1. **`uiux-v2.mjs` 未运行**：该 harness 默认运行有既有 `role geometry 1360` 与未注册 IPC handler（`session:role-states`/`network:get-state`/`preferences:get`/`background-tasks:list`）基线失败；文件未修改、不在写集。AC-4 由 `report-view.test.ts` 随桌面UI 6 文件 47/47 组通过 + 官方 phase4b 普通报告 1360/960/200% 检查 + A5 ordinary 覆盖。若后续要求 `uiux-v2` 作为唯一/补充证据，须另行修复/授权；本轮不因此判 insufficient。
2. **A5 基线修复**：官方 phase4b 原有过期检查引用已删除的 `#governance-status` 治理 UI（commit `98d3fe2`），A5 在同一 harness 内清理/适配过期检查；A5 的 15 项/326 行断言块指纹 `b9cac689…` 前后未变；普通报告、报告事实、200% 报告检查仍在；未新增 skip/todo；未弱化 A5 断言。该修复属 A5 写集，E2 独立复跑 64/0。
3. **截图辅助限制**：E2 官方运行 13 张截图；A5 关键 4 张中 3 张（delivery/dialog-200pct/report-200pct）与 A5 记录哈希一致，`a5-acceptance-handback.png` 因截图捕获与 React 绘制的一帧时序差，显示的是前一步空 pane（A5 记录中的同名截图也有同类现象）；delivery/200% 报告截图也可能滞后一帧。**DOM 断言与 `report.json` 是 AC-1/AC-5/AC-10 的主要证据**；V1 不要求录屏、截图非通用必需，故不据此判 fail/insufficient。若未来需要高质量视觉存档，建议在 `shot()` 前增加绘制等待/显式 pane 激活断言（独立改进，不在本任务）。
4. **E1 路径简写**：E1 §三把 D1 report.json 写作 `D1-evidence/report.json`，实际为 `D1-evidence/e2e-phase4b/report.json`；哈希 `07a3c900…` 与 D1 §九一致，证据可定位。不构成 AC-14 fail。
5. **非法 flowId 合成 context**：非法非空 flowId 返回合成 `judgeContext`，含 `facts`（`governanceModel/flowId/ledgerErrors/...`）但**无** `qualityReportPath`/`acceptanceReportPath`/`artifacts`，含 `unavailableReason`；与 N4「不设置报告路径、可能改变 unavailableReason」一致。合法 slug 卡 facts/artifacts/unavailableReason 不变（SessionManager 正常文件用例断言）。
6. **`sameDisplayText` 为渲染层局部导出**：`decision-dialog.ts` 导出该纯函数供 `DecisionDialog.tsx` 使用；属 renderer 内部模块导出，不是 Service/Pipeline 公共导出/共享 Model；A2 记录已披露。未新增共享契约。
7. **沟通记录继续追加**：E2 读取时 137 行 / `654e432b…`；该文件可能继续追加。本报告引用其「闸门 0/1/2/实施授权」小节；若后续追加改变行号/哈希，不影响本判定，但 E3/归档应引用对应小节。
8. **`acceptanceTriage` 前闸**：本轮 E2E/测试未观察到三方卡替换；若生产/外部接线存在该前闸导致 `acceptanceReport` 不到达 `DecisionDialog`，AC-5 需按实际接线重核。当前证据范围内未发生。
9. **未做 T3 全量、未跑 `main.mjs`**：T2 默认；`main.mjs` 未修改、非本轮必跑项；官方 phase4b 已作为可运行 E2E。
10. **补充探针为仓库外临时证据**：`C:\Users\51054\AppData\Local\Temp\arc-e2-probe\` 下的复制 harness/插入块/构建脚本未进入仓库、未修改产品/测试；其为 E2 为补 AC-3 空证据/AC-11 回放而做的补充检查，不替代官方 64/0。

---

## 八、结论与放行边界

- **总体结论：通过（pass）**。AC-1–AC-14 **14/14 pass**；F3/F5/Q5-A/O2 核对项全部满足；无 `fail`、无 `insufficient evidence`、无 `not applicable`。
- 通过仅对当前候选：HEAD `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9` + 19 个产品/测试文件（候选树 `9c744add87d02bc98e143e605c94a3a7f4434588`）。候选、输入、依赖、夹具、构建或标准变化使本结论失效，按 V1 重判受影响部分。
- 本结论不授权提交、推送、合并、发布或对外操作；E3/客户另行授权。`docs/acceptance/` 之外的代码/测试/角色卡/边界/方案/团队计划未由 E2 修改；未 commit/push；未接触客户；未把复核/实施报告当客户确认。
- 建议 E3/提交前重新冻结治理/记录清单：本报告与（若后续更新）memo 属候选冻结后的验收产物；产品/测试 19 路径不变。

---

## 九、证据清单（E2）

E2 原始证据目录：`C:\Users\51054\AppData\Local\Temp\ans-acceptance-arc-e2\`

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `00-inputs.txt` | E2 时间/cwd/HEAD/分支/staged/输入哈希 | `3277549d64f02559b3600c5bb50eb6f55619985339ab4d7164eb5011ebd1b638` |
| `01-candidate.txt` | 候选树复算/19 路径 status/19 文件 sha256 | `b1493629c3632da8615c3881a773b315b90689f24077173ec6142554a7504da2` |
| `02-suites.log` | 四组受影响套件原始输出 | `cf2245d3b9520b33af05981a136cb2a73f776ae07d4851f5f2c582bbed187421` |
| `03-typecheck.log` | `npm run typecheck`（exit 0） | `c71e7669e71508398556d18f116ec0f549b7ad36064665f5dde3ce8d5a4ebcd8` |
| `04-typecheck-renderer.log` | `npm run typecheck:renderer`（exit 0） | `e121e939f0d0ab3ab1eb165d6b7df0d15855633e7202ae554b6e69e0260174e0` |
| `05-build-renderer.log` | `npm run build:renderer`（exit 0） | `f880998282e2dd3a91e6901574bf371a5d4058c02ef9e1d78f75b5b5e3f53fbc` |
| `06-official-phase4b.log` | 官方 phase4b 64/0 原始输出 | `e755a5e6b576f5fd9fb1564618f02d530587cb40da2e63e2a638f3960c743dec` |
| `e2e-run/report.json` | 官方 phase4b 64/0/13/console 0/CSP 0 | `07a3c90047a80603a924fafb8ce72d269a349379527155e3ecd139801445e60e` |
| `11-screenshot-manifest.txt` | 13 张截图 sha256 | `865a2d758a3507efc7f985b943374b841cc37cc1df817575b5152b032fba1bfc` |
| `12-protected-diff.txt` | 受保护/范围外文件 status/diff（空） | `525c91d8059c26510ea0f7140cd4531e20657295b1f69e78097c87d09e1640a6` |
| `08-probe.log` | 补充探针 67/0 原始输出 | `269813ca2e53c35ee7c40db4352682fda83d566d87aeb07f382e2cc891314b7d` |
| `probe-run/report.json` | 探针 67/0；AC3/AC11 检查 | `e9f841a36855f5bc2446ca9794ca1db4128c79286060c7a2d8d1301ddd4e42f4` |
| `10-markdown-replay.log` | Markdown XSS + 回放纯逻辑 16/16 | `16cb85d18c08add79de0dc1a92b4e924cffb123f606b4a323294687d50727558` |
| `13-probe-block.txt` | 探针插入块原文 | `5a7356c6147443f20989889b2635b84d134d1d84ace8ffcf0432f7da0f8e5145` |

在仓证据（E2 已核对哈希）：E1 `docs/scheduling/acceptance-return-card-change-v1.md`（173/`0013f95a…`）；B0 `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline.md`（178/`b4c4808f…`）；A1–A5 实施/修复记录与 D1 回归（哈希见 §1.3）；D1 证据目录 `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-D1-evidence/`（含 `e2e-phase4b/report.json` `07a3c900…`、`09-e2e-phase4b.log` `0495fe51…`、`13-candidate-manifest.tsv` `73830208…`）；A5 证据目录 `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A5-evidence/`（含 13 截图 + `09-screenshots.sha256` `791e7c6b…`）。

---

**本报告状态：E2 判定 v1 完成；结论「通过（pass）」，仅对当前候选；不授权提交/推送/合并/发布。**
