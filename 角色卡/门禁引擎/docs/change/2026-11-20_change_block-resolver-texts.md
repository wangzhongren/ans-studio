# 变更记录：Block 解法路由——角色文本减法（block resolver 第三批）

- 日期：2026-11-20
- 角色：ANS 内置「门禁引擎」（门禁文本 / 六角色 fixed 上下文；客户 2026-11-20 原则 + 协调方裁定已授权）
- 分支/工作树：`feat/block-resolver`（worktree `.claude/worktrees/feat-block-resolver`；HEAD `694ea9c` + R1/R2 未提交实现 + 本批未提交）
- 设计依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §7.2（角色文本增删）、§4（决策路由）、§5（生命周期/防重复卡）、§6（既有机制接合）、§九 Q1–Q10；
  R1 记录 `角色卡/编排/docs/change/2026-11-20_change_block-resolver-foundation.md`、
  R2 记录 `角色卡/桌面窗口/docs/change/2026-11-20_change_block-resolver-desktop.md`。
- 核心口径：**所有 block 必须有解法（`fixed` / `decided`），无 `stopped`**；block 是**路由输入**，角色如实报告、不空转、不越权、不代客户选择；应用 router 负责路由/修复任务/决策卡；judge 永不选终止；终止仅客户在决策卡中显式选择，且是 `decided` 结果。
- 范围：**只改文本/角色模块**——`chief-workflow-v3.md`（app-dispatch/v1 资源）与六角色 fixed 上下文；未改代码实现、`test/**`、`app/desktop/**`、`release.yml`/release-policy；
  v1/v2 资源与六角色 legacy 卡文本/legacy 上下文**逐字冻结**；未 commit/push/CI/tag/main；未读 `.env`；未占 9222/9223/9224。

## 一、改动文件与段落

| 文件 | 段落 | 改动 |
| --- | --- | --- |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v3.md` | 资源错误段 | 「阻塞推进并交原资源/装配 owner 修复」→「明确报告应用资源错误并交 owner 修复（应用负责路由；如实报告即路由输入，不以停住结束）」 |
| 同上 | 协议与驱动者 | 保留「你不推进阶段、不收口任务、不重派、不停止、不直派验收」逐字；追加「block 如实报告即路由输入：应用按类路由（引擎修复/属主修复/决策卡/升级）；你不空转、不代客户选择、不越权 shell；终止仅由客户在决策卡中显式选择，且是 decided 结果」；幕僚四件事③纳入「block 决策卡（如应用以 prompt 发放）」 |
| 同上 | 三张客户确认卡 | 卡预算追加「block 决策卡按 decision 卡口径不计入三卡，只在 block 发生且 judge 不能代批/客户主权时出现」；新增 block 决策卡条目：`requestId=block-card-<blockId>`、按 prompt 逐项一致（`promptId`/`cardKind`/选项/推荐集/`documentRefs`/`blockId`）、不一致 ⇒ `card-prompt-mismatch`、不增删选项/不改推荐/不自批/不代选/同一 `blockId` 不重弹、`blockId` 入回执、应用自有呈卡时不代呈 |
| 同上 | A12 独立验收 | `standard` 由「`stage.blocked` 交客户/运营」改为「由应用按 block 路由处置（属主修复/决策卡/升级）」；blocked/failed 报告必须写缺失项与可核验证据路径，应用按类路由，不以停住结束 |
| 同上 | 路径 B 要点（B2） | 「无法恢复时按停止面处理」→「如实报告即 block 路由输入：应用按类路由；你不空转、不代客户选择、不越权 shell；终止仅客户在决策卡中显式选择（decided 结果）；幕僚无停止工具」 |
| 同上 | 基线 3 件小事 | 基线失败仍「只回报运营结果、不弹客户卡」，补「应用按 block 路由（环境/属主修复或决策卡），不以停住结束」 |
| 同上 | 停止、失败与审计 | 「重试」改为「重试与 block 路由」（耗尽/高风险零重派 ⇒ `block.raised → block.routed`，不是停住）；新增 block 生命周期（`fixed`/`decided` 两终态、`escalated` 非终态、`T_repair` 默认 10 分钟升级、`T_remind` 默认 30 分钟同卡提醒一次不重弹、同指纹重复升级、卡未答是可见等待）；新增「终止仅客户显式选择」（`block-terminate-flow` 永不推荐、judge 永不代选、客户选择后应用走显式停稳并披露、block 记 `resolved(decided)`）；审计列表补 `.ans/state/blocks.jsonl`；「终止是回退终态」改为「终止是客户显式决策的回退结果（不是 block 的停止态）」 |
| `src/common/roles/chief/internal/context.ts` | `chief-fixed-path-dispatch` | 新增 block 路由句：如实报告即路由输入、不空转/不派发/不收口/不停止/不代客户选择/不越权 shell、终止仅客户显式选择（decided 结果） |
| 同上 | `chief-fixed-cards` | 新增 block 决策卡条目（应用发行 `block-card-<blockId>`；如应用以 `card-prompt` 发放则按 prompt 逐项一致呈交；`blockId` 入回执；不重弹；不计入三卡） |
| 同上 | `chief-fixed-review` | `standard` 的 `stage.blocked 交客户/运营` → 应用按 block 路由处置（属主修复/决策卡/升级） |
| 同上 | `chief-fixed-decision` | 新增「block 不是停的理由」：缺失项/证据路径如实报告即路由输入；不空转、不代客户选择；终止仅客户显式选择 |
| `src/common/roles/convener/index.ts` | `convener-fixed-report` | 新增「block 路由与修复任务（fixed）」：blocked 报告写缺失项/证据路径；如实报告即路由输入；旧卡文本停住/等待类默认出路在固定路径不适用（以本段为准）；收到应用修复简报/修复任务按简报执行（`repairId`/缺失路径/证据口径/`T_repair`；fixed-v2.1 用 `dispatch_task` 建任务、app-dispatch 由应用建任务）并按 `repairId` 回交；环境/授权阻塞主动上报、不自行同文重试；同一 `blockId` 不重弹卡；终止仅客户显式选择、无停止动作 |
| `src/common/roles/product/internal/context.ts` | `product-fixed-report` | 末尾追加：blocked 报告写缺失项/证据路径（`evidence[]` 纯路径）/已尝试动作；如实报告即路由输入；应用按 block 类路由；不空转/不代选/不重弹卡；收到应用修复任务/简报按 `repairId`（或缺口的 `blockId`）回交；不自行同文重试 |
| `src/common/roles/rapporteur/internal/context.ts` | `rapporteur-fixed-report-expectation` | 新增同口径 bullet（缺失项/证据路径、路由输入、不空转/不代选/不重弹、修复任务按 `repairId` 回交、不自行同文重试） |
| `src/common/roles/nominator/index.ts` | `nominator-fixed-report` | 新增同口径 bullet（缺失项/证据路径、路由输入、不空转/不代选/不重弹、修复任务按 `repairId` 回交、不自行同文重试） |
| `src/common/roles/verifier/index.ts` | `verifier-fixed-review-role` | 新增「无运行期通道不是停的理由」：缺能力/证据如实写缺失项/证据路径/`insufficient evidence`；如实报告即路由输入；应用按 block 类路由（引擎能力路由/属主修复/决策卡/升级）；不空转/不代选/不自批/不重弹；修复任务按 `repairId` 回交、不自行同文重试 |
| `角色卡/门禁引擎/docs/change/2026-11-20_change_block-resolver-texts.md` | — | 本记录 |

## 二、保留的逐字段落

- **资源**：`chief-workflow.md`（v1）与 `chief-workflow-v2.md`（fixed-v2.1 在飞）**字节逐字未动**；v3 除上述条目外全部段落保留（两条固定路径、select_workflow、阶段与任务来源表、三卡+`merge-main`、judge 代批、A12、路径 B、基线 3 件小事、Git 普通用法、任务文本与哈希口径、B13.2/B14/B23/B24/B27/B28/B32、merge-main、审计、contract_check、请示与真实委托、新稳定码段）。
- **chief fixed 上下文**：四段 id/顺序冻结（`chief-fixed-path-dispatch`/`chief-fixed-cards`/`chief-fixed-review`/`chief-fixed-decision`）；三卡不合并、`merge-main` 客户本人、judge 不可代批、`card-prompt-mismatch`、A12 应用直派、decision 纪律逐字保留。
- **convener fixed 上下文**：五段 id/顺序冻结；`convener-fixed-evidence`（B9.1 证据三要素/应用算 hash/B23 `project_state [versions]`/`versions.jsonl`/B13.2 `evidence[]` 纯路径）、`convener-fixed-card-budget`（三卡+merge-main/不诱导额外审批卡）、`convener-fixed-baseline`（团队计划 v4/基线 3 件小事/`baseline-*` fail-closed）、production 段 B14/B27/B28/B32 安全句**逐字保留**。
- **product/rapporteur/nominator/verifier fixed 上下文**：段 id/顺序冻结；各自 hash 口径、`evidence[]` 纯路径、禁 shell、边界/激活/验收纪律**逐字保留**。
- **六角色 legacy**：`card.text`/`cards`/`capabilities`/`dispatch()`/`preflight` 与 legacy `context()`（缺省/`legacy-v1`/畸形输入）**逐字冻结**；convener legacy 卡文本中的「无可行方案如实停止」属 legacy 冻结面，本批**未改**——fixed 会话由 `convener-fixed-report` 的「旧卡文本中的停住/等待类默认出路在固定路径不适用（以本段为准）」覆盖。

## 三、资源事实（工作树实测）

| 资源 | bytes | 非空行 | 版本行 | BOM/NUL | `git hash-object`（LF blob） | SHA-256（工作树字节） |
| --- | ---: | ---: | --- | --- | --- | --- |
| `chief-workflow.md`（v1） | 8724 | 35 | 恰一处 `chief-workflow/v1` | 无/无 | `53d71670ef9f403c027f6e39c0ffd1db92553992`（= HEAD） | `9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346`（不变） |
| `chief-workflow-v2.md`（v2） | 30999 | 102 | 恰一处 `chief-workflow/v2` | 无/无 | `d528c6ce5655b2a9916574f4a4477e035aef42a6`（= HEAD） | `26c922255cab8c4878402184217f6b816b1ee28c7274151562eec2a36138df7f`（不变） |
| `chief-workflow-v3.md`（v3） | 29428 | 101 | 恰一处 `chief-workflow/v3` | 无/无 | **`f3ee15156ebf40a959961ef29811922204e18d45`**（旧 `03184869960c9a8dd03067f21a9451612f1d987b`） | **`d1d836209c8adacf082313a3e8c45aa44d6f48434e7120de542e083850021af4`** |

- v3 体积 ≤256 KiB、Markdown 身份行 `# Chief 工作流` 保留，loader 约束（唯一版本行/UTF-8/无 NUL/体积）不变。
- v1/v2 blob SHA 与 `git ls-tree HEAD` 逐字一致（`git hash-object` 实测）；v3 为独立新字节，**测试冻结 SHA 需刷新**（见 §五）。

## 四、验证

1. **资源约束**：v3 版本行唯一且为 `chief-workflow/v3`、29428 bytes（≤256 KiB）、无 BOM/NUL、非空行 101（在 60–400 内）；v1/v2 blob SHA 与 HEAD 一致（上表）。
2. **关键语义 grep**：v3 含「block 如实报告即路由输入」「不空转」「终止仅由客户在决策卡中显式选择」「block-terminate-flow」「decided」「T_repair」「T_remind」「escalated」；六角色 fixed 文本含「如实报告即路由输入」「block 类路由」「不空转」「不代客户选择」「repairId」「同一 block 不重弹卡」；verifier fixed 含「无运行期通道不是停的理由」。
3. **typecheck**：`npm run typecheck`（cwd=worktree）**0 错误**。
4. **测试（未改 `test/**`，如实报告）**：
   - `test/门禁引擎/chief-workflow-v3-resource.test.ts`：**3 pass / 1 fail** —— 唯一失败为预期中的 v3 SHA 冻结断言（actual `f3ee1515…` vs expected `0318486…`）；版本行/体积/BOM/NUL、v1/v2 SHA 冻结、关键语义段、旧动作面四项断言全部通过。
   - `test/roles/convener/convener-fixed.test.ts` + `test/roles/chief/fixed.test.ts`：**24/24 pass**（无预期差异；段落 id/顺序、B9.1/B13.2/B14/B23/B27/B28/B32 安全断言、negative token 全部保持）。
   - `test/roles/product/product-fixed.test.ts` + `test/roles/rapporteur/fixed-module.test.ts` + `test/roles/nominator/nominator-fixed.test.ts` + `test/roles/verifier/verifier-fixed.test.ts`：**35/35 pass**。
   - 全量 `test/roles/**/*.test.ts`：**285/285 pass**（legacy 冻结/差分/模块纪律均未回归）。
   - v3 消费者：`test/桌面应用/app-dispatch-tool-surface.test.ts` + `test/编排/run-role-fixed-b2.test.ts` **16/16 pass**；`test/测试/fixed-path-full-chain.test.ts` **5/5 pass**（v2/v3 资源按磁盘动态计算 SHA，无硬编码回归）。
5. 未运行 Electron/真实模型；未占调试端口；未读 `.env`；未 commit/push/CI/tag/main。

## 五、待测试批点

1. **必改**：`test/门禁引擎/chief-workflow-v3-resource.test.ts` 的 v3 冻结 blob SHA —— `03184869960c9a8dd03067f21a9451612f1d987b` → `f3ee15156ebf40a959961ef29811922204e18d45`（v1/v2 冻结值不变）。
2. **T-12 断言口径**：设计 §8.1 T-12 要求断言「无停止/空转/三选一含停止」措辞与「新增 block 语义段存在」。注意 v3 仍必须保留
   「不停止」（角色动作面收窄）、「停止/改道由客户或应用命令执行」「停止工具」「workflow.stop-unconfirmed」等**合法停止语义词**；
   建议按**具体旧句**（如「`stage.blocked` 交客户/运营」「无法恢复时按停止面处理」「重试…交客户/运营」）做 negative 断言，
   并按新句（「block 如实报告即路由输入」「应用按类路由」「终止仅由客户在决策卡中显式选择」「decided」）做 positive 断言，避免 blanket 删除「停止」造成假红/假绿。
3. **legacy 冻结边界**：convener legacy 卡文本仍含「无可行方案如实停止」（legacy 冻结，本批按设计未改）；测试批不得把该句的存在判为 fixed 回归，
   也不得要求 legacy 卡文本出现 block 路由新句（fixed 覆盖由 `convener-fixed-report` 承担）。
4. **新增测试建议（T-12 范围）**：六角色 fixed 段 positive：blocked 报告须含缺失项/证据路径、按 `repairId` 回交、不自行同文重试、同一 block 不重弹；
   chief fixed：block 卡按 prompt 逐项一致、`blockId` 入回执、终止仅客户；verifier fixed：无运行期通道不是停的理由。
5. **无代码/测试改动**：本批未改实现/测试/桌面/发布策略；R1/R2 未提交实现保持原样，block router 行为不受文本变更影响（文本只对新会话生效）。

## 六、风险与说明

1. **在飞会话不热改**：文本改动仅对新会话生效；在飞 fixed-v2.1 继续使用 v2 资源与旧文本（v2 字节未动），应用 router 仍按事实路由（不依赖文本）。
2. **v3 已合并背景**：设计 §7.4(4) 允许「合并前修订」；本批按任务书对 v3 做合并后文本修订（资源版本仍 `chief-workflow/v3`，未升 v3.1）。若发布流程要求资源版本随字节递增，需协调方另定；本批未改 loader/版本协议。
3. **客户可见门披露**：block 决策卡仅在 block 发生且 judge 不能代批/客户主权时出现；文本不新增其它客户门，既有三卡 + `merge-main` 预算不变（v3 与 chief fixed 卡段已写明）。
4. **judge 与终止**：v3/角色文本均明示 judge 永不代选终止、`block-terminate-flow` 永不推荐；终止是客户显式选择后的 `decided` 结果（应用走显式停稳流程），不是 block 停止态。
