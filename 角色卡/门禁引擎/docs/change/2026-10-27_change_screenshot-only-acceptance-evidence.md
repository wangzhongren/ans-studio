# 变更记录：验收证据截图-only（内置治理角色卡与测试）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-27
- 角色：门禁引擎（Gate Engine）
- 任务：客户新的 ANS 系统规则——**验收标准最多要求截图，不能要求录屏**。内置治理角色卡与共享原则中，凡把「录屏」作为验收要求、证据形式、decision 选项或 M1 例子的措辞全部改为只使用截图；不得要求 / 提供录屏选项；缺少录屏不得判 fail / insufficient evidence；`view_image` 只核对截图；M1 材料缺口示例改为「截图采集范围 / 截图清单」；未来客户明确要求录屏属独立需求变更（lead-governance-coordination；门禁引擎任务）。
- 依据：
  - 客户本轮新规则第 1–5 点（验收最多截图、gate / 交付证据只写真实运行截图、M1 示例非录屏、未来录屏独立需求变更、不改工具 / 桌面 / 运行时 / 编排 / PM / i18n）。
  - 现有共享基线 `ENGINEERING_QUALITY_BASELINE`、五卡 view_image / gate / 验收 / 派发 / 证据清单文本。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts`（共享工程质量基线 + 产品 / 运营 / 质检三卡专属文本 + 文件头注）、`test/门禁引擎/` 的 `view-image-cards.test.ts` / `governance-trio.test.ts` / `governance-standard-workflow.test.ts` / `customer-card-rules.test.ts`（既有断言更新）与 `screenshot-only-evidence.test.ts`（新增）、本角色 changelog 与本变更记录。未改 `app/**`、`src/provider/**`、`src/pipeline/**`、`src/common/编排/**`、PM 文档、共享 i18n、其他角色资料或 `demos/`；未新增角色 / `FlowStepKind` / cardKind / 写权 / 能力位；未 commit / push；未重启应用。

## 1. 写前核对与基线

- `git rev-parse --short HEAD` = `b36a971`（分支 `feat/scaffold-first-governance`，worktree `lead-governance-coordination`）。
- 本批写前（客户卡化批次完成后）本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **357 计 / 356 过 / 0 失败 / 1 Windows 既有 skip**。
- 工作树内另有运行时核心 / 编排 / 桌面角色并发的未提交改动（含其自身的截图-only 文案更新），不是本角色改动；本批未触碰其文件，也不计入本角色候选。
- 写后本角色候选哈希（`git hash-object` / `sha256sum`）：
  - `src/common/门禁引擎/governance-roles.ts` = `eade658643e0a549bbfc1bcf34af7cc96f054b75` / `b832ef42a093777a5e0e2e3110a5533ef91a3245fc83776c328095b488669ad5`
  - `test/门禁引擎/view-image-cards.test.ts` = `d496d0839409b49125a91e79a91979f7c6cc197e` / `3d3f1fb0c248425a1ab9e78cce98cff1f286f5127c94b686d42b4c1005deb3b9`
  - `test/门禁引擎/governance-trio.test.ts` = `8a9ae84d8573d1e12c9a77b5e051f052d6a8940c` / `9bffa343a2db75408b2279c41d3c76481a2a6617329e3cd116b8baacdaa59ea6`
  - `test/门禁引擎/governance-standard-workflow.test.ts` = `17295e40c02c8e76daba1354b67fc55e5f596770` / `b41de5d502ba36e967cd7133357b55290a7b5868e7398e9fe259a19fb7fb6e71`
  - `test/门禁引擎/customer-card-rules.test.ts` = `46764cbfaf43022ec62b4f94125023045bf397c0` / `0f61c8bfb8980188cf414d0541c6cf65a916c4d4641738c7ce8b65b002821751`
  - `test/门禁引擎/screenshot-only-evidence.test.ts` = `fb57faaf847752cfcc167a67d16864d549105dcc` / `7a31be8228a6334864ff9fb5a9bce32c972bfc46c631013b69ac5f2485eaae4f`

## 2. 共享工程质量基线（`ENGINEERING_QUALITY_BASELINE`，五卡复用）

- 原「交付」条「启动命令、访问地址或截图/录屏」改为：
  - 验收前必须真实启动应用并演示；证据为**启动命令、访问地址与真实运行截图**；截图必须关闭 DEBUG 覆盖层，并记录 **sha256 / 候选 / 命令**；日志 / 输出 / 哈希可辅助；未真实运行不得建议验收通过。
- 新增「验收证据最多截图」条：
  - 验收 / gate / 交付证据以「真实运行截图（关 DEBUG；记录 sha256 / 候选 / 命令）」为准，日志 / 输出 / 哈希可辅助；
  - **不得把录屏列为验收要求、证据形式或 decision 选项**；
  - **缺少录屏不得判 fail / insufficient evidence**；
  - 客户未来另行明确要求录屏时，按**独立需求变更**处理，不进入默认验收标准。
- 该基线逐字插入五张内置治理卡，因此策划 / 产品 / 运营 / 质检 / 全部内置角色都获得同一口径。

## 3. 角色专属变化

### 产品 / Lead（`LIAISON_CARD_TEXT`）

- M1 材料缺口示例从「截图 vs 录屏」改为「**截图采集范围 / 截图清单**」；仍要求依赖步骤前交运营发 decision 卡、没有卡 / 客户未决不得推进。
- 画面证据 `view_image` 改为只核对截图：**只核对截图，不核对 / 不要求录屏画面**；缺少录屏不影响判断，不得因缺少录屏判 fail / insufficient evidence。
- 内部决策纪律的 M1 例子同步改为「截图采集范围 / 截图清单未决」。

### 运营 / Steward（`CONVENER_CARD_TEXT`）

- M1 材料缺口示例改为「截图采集范围 / 截图清单」；decision 卡仍是 `request_choice`（`cardKind=decision`）、真实可选、恰好一个 `recommended: true`，不提供录屏选项。
- 视觉基线 gate：**关闭 DEBUG 覆盖层后截图（只要求截图，不要求录屏）**。
- `visual-baseline` 证据完整性检查：只查**截图**是否关闭 DEBUG，不查录屏。
- UI / 游戏 / 视觉类派发文本改为「真实运行截图（关 DEBUG；记录 sha256 / 候选 / 命令）+ 验收标准指针 + 关 DEBUG 说明；不要求录屏」。
- 画面证据 `view_image` 改为只核对截图，不核对 / 不要求录屏画面；缺少录屏不影响判断，不得判 fail / insufficient evidence。
- `verification-evidence` / 证据清单改为：启动命令、访问地址与真实运行截图（关 DEBUG；记录 sha256 / 候选 / 命令）；只要求截图，不要求录屏，**缺少录屏不是缺证、不得判失败**。

### 质检 / Proof（`VERIFIER_CARD_TEXT`）

- 标准工作流第 4 步：真实启动/演示证据改为启动命令、访问地址、关键输出与**真实运行截图（关 DEBUG；记录 sha256 / 候选 / 命令）**、日志；只要求截图，不要求录屏，**缺少录屏不构成缺失证据**。
- Gate 复核视觉核对：**截图必须关闭 DEBUG 覆盖层（只要求截图，不要求录屏）**。
- 图片证据核对 `view_image`：只看真实截图画面；**只核对截图，不核对 / 不要求录屏画面**；缺少录屏不影响判断，不得因缺少录屏判 fail / insufficient evidence。
- 质量职责：
  - 没有真实启动/演示证据（启动命令、访问地址与真实运行截图；日志 / 输出 / 哈希可辅助）不得建议 accept；缺少录屏不得判失败；
  - gate 复核 UI / 游戏关闭 DEBUG 后截图（不要求录屏）；
  - `view_image` 纪律只核对截图，不核对 / 不要求录屏画面。

### 策划 / Draft、人事 / Crew

- 通过共享基线获得同一截图-only 口径；未新增其 cardKind、能力位或写权。

## 4. 测试

- 新增 `test/门禁引擎/screenshot-only-evidence.test.ts`（5 例）：
  1. 五卡共享基线：验收证据最多截图、真实运行截图（关 DEBUG；sha256 / 候选 / 命令）、不得把录屏列为要求 / 证据形式 / decision 选项、缺录屏不判 fail / insufficient evidence、未来录屏属独立需求变更；反向禁止旧「截图 / 录屏」并列要求与录屏选项短语。
  2. 质检：验收 / gate / view_image 只核对截图；缺录屏不构成缺失证据、不判失败；既有不得假看 / 哈希 / 候选 / `insufficient evidence` 安全检查保留。
  3. 运营：派发 / 证据清单 / 画面证据只要求截图；缺录屏不是缺证、不判失败。
  4. 产品：画面证据只核对截图；M1 示例改为截图采集范围 / 清单，不再用「截图 vs 录屏」。
  5. 数据面零变化：角色顺序 / 能力位 / cardKind 白名单不变。
- 更新既有测试：
  - `view-image-cards.test.ts`：「截图 / 录屏画面」断言全部改为「截图画面」。
  - `governance-trio.test.ts`：工程质量基线逐字期望更新为截图-only 两条；Steward 派发 / gate 文案、Proof gate 视觉文案同步更新。
  - `governance-standard-workflow.test.ts`：「关键输出与截图或录屏」改为「关键输出与真实运行截图（关 DEBUG；记录 sha256 / 候选 / 命令）」。
  - `customer-card-rules.test.ts`：M1 示例改为「截图采集范围 / 截图清单」，不再出现「截图 vs 录屏」。
- 未删除或放宽既有安全 / 风险 / 证据断言；真实启动、关 DEBUG、sha256 / 候选 / 命令、`insufficient evidence`、不得假看等要求保留。

## 5. 验证结果（本批写后）

- 定向：`node --test "test/门禁引擎/screenshot-only-evidence.test.ts"` ⇒ **5 计 / 5 过 / 0 失败 / 0 skip，exit 0**。
- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **362 计 / 361 过 / 0 失败 / 1 Windows 既有 skip，exit 0**（写前 357 计；新增 5 例）。
- `npm run typecheck` ⇒ **exit 0，0 诊断**（工作树同时含其他角色未提交改动；本角色未改其文件）。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收。

## 6. active 录屏要求核对与边界外残余

- **五张内置治理卡（active cardText）已无“录屏作为要求 / 证据形式 / decision 选项”的肯定式措辞**：所有仍出现「录屏」的句子均为否定 / 限制语境（不要求、不提供、不得把录屏列为、缺少录屏不判失败、只核对截图不核对录屏、未来录屏属独立需求变更）。已用脚本逐卡检查每处「录屏」所在句均含否定 / 限制词。
- **历史文档 / 变更记录**保留旧「录屏」措辞作为当时记录（如 2026-10-26 view_image 变更记录、本角色更早的卡化记录）；它们不是 active 卡文本。本批在 `2026-10-27_change_customer-cardification.md` 顶部加注：M1 示例已被本批改为截图采集范围 / 清单。
- **边界外并发状态（只读核对，未改）**：`app/desktop/governance-advance.ts`、`src/pipeline/orchestration/govern-session.ts` 已由各自属主在工作树内并发改为「最多截图；不得要求录屏；缺录屏不判失败」；`test/桌面应用/*.test.ts` 仍有旧「截图或录屏」断言，属桌面 / 编排属主待同步，不在本角色边界。其他角色资料 / `demos/` 未审计、未改。
- 未新增角色 / `FlowStepKind` / cardKind / 写权 / 能力位；未改工具 / 桌面 / 运行时 / 编排 / PM / i18n / 游戏项目；未 commit / push；未重启；未独立验收。
