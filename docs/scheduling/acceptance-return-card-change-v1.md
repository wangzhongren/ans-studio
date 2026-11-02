# 变更包 E1：验收结果返回幕僚的卡片特殊显示 + 原文直出（acceptance-return-card）

- **任务 ID / flowId**：`2026-11-02-acceptance-return-card` / `acceptance-return-card`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-11-02
- **风险档位**：**T2**（跨渲染层、桌面 Interface 与共享 i18n 的展示/载荷变更；不改验收判定/选项/路由/报告持久化/声明语义/写权/边界；方案 §8.1 与闸门 1/2 已定档）
- **候选身份**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`；**产品/测试候选树 `9c744add87d02bc98e143e605c94a3a7f4434588`**（HEAD + 19 产品/测试路径；复算方法见 §1.2；D1 候选清单 `738302086dd67ee26356133a2d2319f02682b863d4889e7c63cbec9beb1e810d`）。
- **候选状态**：A1–A5 全部 `implemented-unverified`；D1 T2 回归/E2E 已对当前候选取证；**本变更包不判通过/返工，不代替独立验收（E2）**。
- **提交/推送/发布**：未授权、未执行。
- **验收标准**：`docs/acceptance/acceptance-return-card-criteria-v1.md`（926 行 / SHA-256 `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b`，V1，实施前冻结）。E2 由沟通另起唯一验收主上下文判定。

---

## 一、候选身份与逐文件哈希

### 1.1 产品/测试候选（19 路径）

> 行数为当前工作区实测；sha256 为工作区字节哈希。`M`=修改，`A`=新增；全部落在团队计划 §4.3 写集；无写集外产品/测试改动。

| # | 路径 | 节点/角色 | 状态 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/common/shared/i18n/messages/zh-CN.ts` | A1/项目管理 | M | 1971 | `2bea07fca5adba6bec5a670c99101618c9f568969b998e03340e8596dd295283` |
| 2 | `src/common/shared/i18n/messages/en-US.ts` | A1/项目管理 | M | 2239 | `48e35b824161f5011cdac3696e8d06a6c4285ca5191371cd427bcaf3321b3eb3` |
| 3 | `test/项目管理/shared/i18n.test.ts` | A1/项目管理 | M | 253 | `44dba1269878500963dcea81be0c4a38b1756c1034de76e41a27de89d12e6ed1` |
| 4 | `app/renderer/src/chat/role-view.ts` | A2/桌面UI | M | 159 | `05a2225c50b21b4c752564053d1b5947597c4cb4d3b497b93f7e40fd21465843` |
| 5 | `app/renderer/src/chat/decision-dialog.ts` | A2/桌面UI | M | 231 | `c62d44b4e34308255ed8217539a4ec3f238429512cfd556c223f7f6c3b4d1679` |
| 6 | `test/桌面UI/role-view.test.ts` | A2/桌面UI | M | 134 | `a8f853e4b72ead394fa2d54837b02c2a8c58165378c0418cea5f6d7fcac2f5ff` |
| 7 | `test/桌面UI/decision-dialog.test.ts` | A2/桌面UI | M | 235 | `50c7797220c2de27f457ac1678fe84c6c63948f429ac3e142282add38a72e062` |
| 8 | `app/renderer/src/shell/ReportCard.tsx` | A3/桌面UI | M | 461 | `787db0208bc370c0c3f5d61348010c21fa413a9f3b84be7cbce48a04e6956285` |
| 9 | `app/renderer/src/chat/DecisionDialog.tsx` | A3/桌面UI | M | 391 | `f7969e3f1e2f112a3d7b8ec9964ddaa258460f489251a3aafaa22a514e4e4355` |
| 10 | `app/renderer/src/shell/shell.css` | A3/桌面UI | M | 3355 | `12bf211c4a1a18e63c64e11d14956101ecf892efc74a0ea7eeff23d7806d6fb9` |
| 11 | `app/renderer/src/shell/phase4a.css` | A3/桌面UI | M | 1776 | `79fe070362c38ae3e0009a9d5fa8b6f50becaa1278eabdbc3ef9568b22b20cae` |
| 12 | `app/renderer/src/shell/phase4b.css` | A3/桌面UI | M | 1088 | `0c05f4d4dc0ab743ba2916a75209fb3fa07dd60fb034ba418d2ab36fcc00fc60` |
| 13 | `test/桌面UI/dialog-a11y.test.ts` | A3/桌面UI | M | 74 | `7ac0d1c1f71e06d5c8cab65ba6f95db80f02c430bdfacfb937e5d2966d29ff35` |
| 14 | `test/桌面UI/source-guard.test.ts` | A3/桌面UI | M | 265 | `52cbc7a178183900301683f8853dac279e461edb2d38e32703d519ed750f4d67` |
| 15 | `test/桌面UI/theme-tokens.test.ts` | A3/桌面UI | M | 57 | `79a4fe443333e8d363ea5965ed0d05e3ed89dcbc9abdb7eca669b3fb699a8a1f` |
| 16 | `app/desktop/session.ts` | A4/桌面窗口 | M | 7881 | `73b1f70e0e567c59b6d7f6c684f62a55c3997f624da360b34ef065f605a4c4ce` |
| 17 | `app/desktop/customer-input.ts` | A4/桌面窗口 | M | 2067 | `059f080eb66758ced158c40fccac80f2202b35187b601ddc0ba28c6b07679d2d` |
| 18 | `test/桌面应用/acceptance-return-card.test.ts` | A4/桌面窗口 | A | 468 | `0c008cc574563a0a60a6f48b392b471b3464e8b6bf6426adc8123749fd62e9b4` |
| 19 | `test/桌面UI/phase4b-electron-smoke.mjs` | A5/桌面UI | M | 1209 | `bc6d1c7eb770023494ad530b1386c35320322bd1a98befd02e026f07b2a86daf` |

- `git status --porcelain -- src app test` 实测 **19 路径**，与 D1 `WRITE_SET_MATCH=exact`；无写集外产品/测试改动；`package.json` 未改、staged 空、无 `.ans/project.json`。
- `test/桌面应用/acceptance-return-card.test.ts` 是 B-1 新增文件；H1 已由人事落地 `boundary.md`/`boundary.yaml` 精确条目（md 93 / `4756558e…`、yaml 251 / `ea766230…`、changelog 199 / `6b6b9bc8…`）。
- `test/桌面应用/e2e/uiux-v2.mjs`、`test/桌面应用/e2e/main.mjs` 未修改；`uiux-v2` 既有 geometry/IPC 基线失败不在本次写集，D1 未将其计入新增失败。

### 1.2 候选树复算方法

以临时索引从 `HEAD 5a35908` 出发，仅加入上表 19 路径，再 `git write-tree`：

```bash
tmp=$(mktemp -d)
GIT_INDEX_FILE="$tmp/index" git read-tree HEAD
GIT_INDEX_FILE="$tmp/index" git add -- <上表 19 路径>
GIT_INDEX_FILE="$tmp/index" git write-tree   # → 9c744add87d02bc98e143e605c94a3a7f4434588
rm -rf "$tmp"
```

管理/治理文档不进入产品候选树。

---

## 二、改动路径与节点

| 节点 | 角色 | 写集（相对候选） | 可观察交付 |
| --- | --- | --- | --- |
| A1 | 项目管理 | 上表 #1–#3 | 14 个 `ui.*` key（中英成对/占位符一致）；i18n 计数 921/1545、parity/guard 通过。 |
| A2 | 桌面UI | 上表 #4–#7 | `isVerificationRole` 严格判据；`DecisionView.acceptance`/本地 `AcceptanceReportView` 防御读取（version/类型/UTF-8 16 KiB）；选项/推荐/可作答性不变。 |
| A3 | 桌面UI | 上表 #8–#15 | 验收报告卡两处位置（回交行/交付批）标题/徽标/冷色/全文/全部 evidence/无折叠；决定卡本地化徽标/16 KiB 原文/O2 路径/preview 始终可见/去重/降级；危险色优先；普通卡逐字不变；P1-ARC-01/02 落地。 |
| A4 | 桌面窗口 | 上表 #16–#18 | 应用私有 `acceptanceReport` payload；复用 `enrichAcceptanceJudgeContext` 读取 + `protectText(16384)`；非法/缺失 flowId fail-closed；缺失/不可读/旧 payload 降级；SessionManager 测试覆盖 AC-5–AC-7/P1-ARC-04。 |
| A5 | 桌面UI | 上表 #19 | 既有 `phase4b-electron-smoke.mjs` 最小 E2E 夹具（两处报告卡/决定卡/普通卡/不支持版本负例/P1-ARC-02/200%）；官方 phase4b 可跑通。 |
| D1 | 测试 | 只写 `角色卡/测试/docs/change/` 证据 | 方案 §10.3 受影响套件 116/116、双 typecheck/build 0、官方 phase4b PASS 64/0、T2 证据。 |

- **B-1 边界变更**：桌面窗口 `boundary.md` + `boundary.yaml` 新增 `test/桌面应用/acceptance-return-card.test.ts` 精确条目（H1 已落地）；属治理变更，不进入产品候选树。
- **A5 基线修复披露**：官方 phase4b 原有过期检查仍引用已删除的 `#governance-status` 治理 UI（commit `98d3fe2` 移除），失败发生在 A5 块之前。经统筹裁定，桌面UI 在同一 `phase4b-electron-smoke.mjs` 内只更新/移除过期治理 UI 检查以适配当前 DOM；A5 的 15 项断言块指纹未变，其他有效断言未弱化，未新增 skip，未改产品/其他测试/写集。修复后官方 phase4b **PASS 64 checks / 0 failures**。`uiux-v2` 的既有 geometry/IPC 失败未修改、未运行、未计入本次新增。

---

## 三、证据链接与哈希

| 证据 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 闸门 0/1/2 + 实施授权 | `docs/communication/2026-11-02_intent_acceptance-return-card.md` | 137 | `654e432b5ba27ae73fddfd7bf2e7c598b5bc1b880986e8018e0d12f2ede3098b` |
| 客户确认方案 P1.2 | `docs/planning/2026-11-02_design_acceptance-return-card.md` | 873 | `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` |
| 独立复核 | `docs/planning/2026-11-02_review_acceptance-return-card.md` | 143 | `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f` |
| 团队计划 v1（确认版） | `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md` | 429 | `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` |
| 实施前验收标准 V1 | `docs/acceptance/acceptance-return-card-criteria-v1.md` | 926 | `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b` |
| H1 boundary.md | `角色卡/桌面窗口/boundary.md` | 93 | `4756558e521fdd27fb82bc9a4064174bb41656724ba2604d5ef63e519b3f0e23` |
| H1 boundary.yaml | `角色卡/桌面窗口/boundary.yaml` | 251 | `ea766230846d85d08a3a800e844e9aa94deeaca70abcaa77c5c6ebdc7bd74157` |
| H1 changelog | `角色卡/桌面窗口/changelog.md` | 199 | `6b6b9bc850ebe9ca224f0b8808ec18ea26456abf67f6f0594eef2aad15534626` |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-B0-baseline.md` | 178 | `b4c4808fc66c4005273058dd9e20df28830a5df3ca89a4ee6b3b20aa12838f61` |
| P1 桌面UI 提案 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 463 | `e2eb138e17f0090495bf4d9be3c7b45ef152f631095e90893b63be374a5e4402` |
| P1 桌面窗口提案 | `角色卡/桌面窗口/docs/change/2026-11-02_acceptance-return-card-implementation-proposal.md` | 426 | `8ee94a302e04eab740dcd7353bc7b8e4874363cb93db363ed6cd7c98e172360e` |
| P1 i18n 提案 | `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-i18n-implementation-proposal.md` | 251 | `902a36b31306ddda5d2f6ee5d5db548a549fb9deab6dbbd31b3733c09f6c81de` |
| P1 审核（recommend approval） | `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-P1-review.md` | 168 | `8a114aab2d6f1fa61bc7df8a1ef09f81d65afdb17d2990bf78a4ead50ca080d2` |
| A1 实施记录 | `角色卡/项目管理/docs/change/2026-11-02_acceptance-return-card-A1-implementation.md` | 170 | `71b73c2f2e3424573d88e52c1ffc97063233a18d6a069327c8a5655a3e8b26b2` |
| A2 实施记录 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A2-implementation.md` | 140 | `8aec3da0cdeb56c39dbb3c392d8896e2c3be8908e70a0ba9fcabb0fdbb85d2b7` |
| A3 实施记录 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A3-implementation.md` | 159 | `fed6af622e04ab43599cc7737767f649c790bce587ec861a13fc8d24e68158f8` |
| A4 实施记录 | `角色卡/桌面窗口/docs/change/2026-11-02_acceptance-return-card-A4-implementation.md` | 140 | `ae36e582a08333cc75daa2a9379349908d852a3a37e67321adb4149cbd119a97` |
| A5 实施记录 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A5-implementation.md` | 112 | `282439ec79e14013e08ac3a82e7998bb774f661b001f03416305ba52dfede810` |
| A5 基线修复记录 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A5-baseline-fix.md` | 86 | `c5bbe48d7ddd4324688a081e4d5675cb7fefb8cd6631ddf7772d97124ee3665e` |
| D1 回归（T2） | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-D1-regression.md` | 218 | `d4feab2b3b941dfee327fb9fc1857c8930fe839525a8ff6c29b11a71cf1d4791` |
| D1 候选清单 | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-D1-evidence/13-candidate-manifest.tsv` | 20 | `738302086dd67ee26356133a2d2319f02682b863d4889e7c63cbec9beb1e810d` |
| D1 phase4b report | `角色卡/测试/docs/change/2026-11-02_acceptance-return-card-D1-evidence/report.json` | — | `07a3c90047a80603a924fafb8ce72d269a349379527155e3ecd139801445e60e` |

- 环境：Windows 11 Pro 10.0.26300 / Git Bash；Node v24.22.1 / npm 11.19.1；Electron 44.7.0；无 `.ans/project.json`（未启用 task_ops）。
- 截图：D1 E2E 13 张 PNG（1360/960/200%，含 A5 4 张），位于 D1 evidence 目录；未设 DEBUG 覆盖层、未录屏。

---

## 四、T2 验证结果

### 4.1 受影响套件（最终候选）

- `node --test --test-concurrency=1` 四组：**116 tests / 116 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**。
  - 桌面UI 6 文件：47/47（B0 36 → +11）。
  - 项目管理 i18n 2 文件：14/14；计数 `ui 921 / main 559 / shared 62 / preferences 3 = 1545`；guard `scanned=131 allowlisted=20 violations=0`。
  - 桌面应用 3 文件：19/19（新增 `acceptance-return-card.test.ts` 10 例；既有 `acceptance-evidence`/`optional-acceptance` 9 例回归全过）。
  - runtime-core 2 文件：36/36。
- **新增确定性失败 = 0**；0 skip/todo；未出现 Windows symlink/EPERM。`uiux-v2` 未运行（未修改；既有 geometry/IPC 基线失败不计入本次新增）。

### 4.2 类型/构建

- `npm run typecheck`：exit 0，0 类型错误。
- `npm run typecheck:renderer`：exit 0，0 类型错误。
- `npm run build:renderer`：exit 0（vite 8.3.4 / 2793 modules / 410ms）；仅既有 chunk>500kB 与 INEFFECTIVE_DYNAMIC_IMPORT 非致命警告；`dist` 为 .gitignore 忽略产物，非候选。

### 4.3 官方 Electron E2E

- 命令：`node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html <temp userData>`。
- 结果：exit 0，**PHASE4B_SMOKE PASS 64 checks / 0 failures**；console errors 0；CSP strict meta、零违规；13 张截图；`report.json` 64/0/13/0/0，sha256 `07a3c90047a80603a924fafb8ce72d269a349379527155e3ecd139801445e60e`（与 A5 记录一致）。
- A5 15 项验收断言块在官方 harness 中通过；基线修复只清理过期治理 UI 检查，未弱化 A5/其他有效断言。

---

## 五、证据复用与失效说明

- **B0 基线**：用于环境/受影响套件基线（94/94）与既有失败分类；不证明候选实现。
- **A1–A5 层证据**：均在当前候选上（A1 i18n、A2 纯逻辑、A3 组件/守卫、A4 SessionManager、A5 官方 phase4b）；A5 基线修复只改 `phase4b-electron-smoke.mjs`，修复后官方 64/0；D1 在同一候选上复跑受影响套件与 E2E。
- **D1**：对 19 路径候选的 T2 证据（116/116、双 typecheck/build 0、phase4b 64/0）；与 E1 候选树 `9c744add…` 一致。
- **不可复用**：其它变更（dispatch-guardrail-relax、acceptance-evidence-path、i18n 等）的证据不得替本变更背书；T2 未做 T3 全量，若验收要求升级则补证。
- **失效条件**：候选/输入/依赖/契约/夹具/构建变化使对应证据失效；A5 基线修复仅清理过期治理 UI 检查，其前后运行均记录，A5 断言指纹未变。

---

## 六、披露事项

1. **F3 已接受限制**：内置质检的非验收质量核对报告也按「独立验收报告」身份显示；项目角色不标记；文案不声称已通过，免责声明用「如本次为验收任务，是否验收通过以验收决定卡为准」；O10 不实施。
2. **Q5-A**：报告卡沿用既有快照上限（摘要 16 KiB、单证据 2 KiB、最多 32 条、快照 96 KiB）；决定卡 16 KiB 安全投影；超限/净化 flags；缺失/不可读/无/非法 flowId 走 preview 降级。
3. **O2 纳入**：验收决定卡显示 `docs/quality/<flowId>-report-v1.md` 路径；O1/O3–O10 未实施（O10 若做另开 T3）。
4. **非法/缺失 flowId fail-closed**：本地 `new RegExp(GOVERNANCE_SLUG_PATTERN)` 校验；非法非空不构造/不读取、facts/artifacts 缺失、`unavailableReason` 可能变化；合法 slug facts/artifacts/unavailableReason 不变；不新增共享导出。
5. **报告文件未认证**：`docs/quality/<flowId>-report-v1.md` 由质检模型写入，应用只做安全投影/净化；不读 `docs/quality/` 外路径；O5 SHA-256 不实施。
6. **A5 基线修复**：官方 phase4b 原检查已删除的 `#governance-status` 治理 UI（commit `98d3fe2`），属基线过期；修复仅在同一 harness 清理过期检查/适配 DOM；A5 15 项断言块指纹未变；未改产品/其他测试/写集；`uiux-v2` 既有 geometry/IPC 失败未修改/未计入。
7. **B-1**：唯一新增文件 `test/桌面应用/acceptance-return-card.test.ts` 已由人事 H1 落地逐文件条目；H1 属治理变更，不进入产品候选。
8. **不恢复 P1.3**：不恢复已取消 `full-report-display` 的全部交付卡默认展开/64 KiB；不复用旧闸门确认。
9. **未 commit/push/merge/release**；未接触客户；未判验收。

---

## 七、验收交接（E2）

- **验收标准**：`docs/acceptance/acceptance-return-card-criteria-v1.md`（926 行 / `f0cb9465…`），实施前冻结；本变更包只提供候选/路径/节点/证据/T2，不代替标准。
- **判定者**：内置独立验收（沟通另起唯一验收主上下文）；结论只能**通过/返工/证据不足**；统筹不改验收结论。
- **建议核对重点**：AC-1–AC-14；C1/C2/C3；两张卡（两处报告卡 + 决定卡）；普通报告卡不回归；F3 文案；F5 两处位置/危险色；Q5-A/16 KiB/缺失/不可读/无/非法 flowId；O2 路径；i18n 14 key/921/1545；AC-12 语义零变化；AC-13 权限/契约零新增；T2 证据 116/116、双 typecheck/build 0、phase4b 64/0/13 截图；A5 基线修复披露。
- **不授权**：验收通过只表示当前候选满足 V1；不授权提交/推送/合并/发布；这些需客户另行授权。

---

## 八、变更包状态

- **已写**：本变更包。
- **已完成**：G2、IA、H1、V1、B0、P1、A1、A2、A3、A4、A5（含基线修复）、D1。
- **待做**：E2（独立验收）、E3（放行/回报）；提交/推送/发布另行授权。
- **未做**：commit/push/merge/release；未接触客户；未判验收。
