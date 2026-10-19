---
id: write-confirm-preview-fixtures
type: fix
title: 写盘确认卡 preview 完整性闸——test/测试 夹具补每条声明路径正文（测试角色）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented
related: [write-confirm-preview-completeness, governance-trio-independent-verification, governance-e2e-auto-independent-verification, governance-judge-cards-independent-verification]
events:
  - date: "2026-10-19"
    kind: fixed
    summary: 编排新增「写盘确认卡呈现前 preview 完整性闸」后，test/测试 下 10 文件 15 例既有夹具声明了写入路径却无逐路径正文；按新契约只补 preview 正文/结构（断言零改动、产品代码零改动）；test/测试 由 782/764/18/0 变为 782/779/3/0，剩余 3 红经干净 HEAD 复跑确认与本批无关；typecheck 0
---

# 写盘确认卡 preview 完整性闸：test/测试 夹具正文补齐

## 结论

- 编排属主 2026-10-19 新增**呈现前完整性闸**（`src/common/编排/confirmed-writes.ts::validateConfirmPreviewCompleteness`，接在 `run-role.ts` 的确认通道包装器里）：`request_confirmation` 声明了写入路径时，preview 必须对**每一条**路径给出可核对正文/结构；否则**不发卡、不发行任何写入路径**，工具返回失败并列出缺正文的路径。
- 本角色按新契约只改 `test/测试/**` 下的**夹具数据**（10 文件，15 例受影响），**未改任何断言、未改产品代码、未放宽强度**。
- 复跑 `node --test "test/测试/**/*.test.ts"`：**782 计 / 779 过 / 3 红 / 0 skip**（修复前同口径 **782 / 764 / 18 / 0**）。15 例新红全部转绿；剩余 3 红经**干净 HEAD（6d40eee，`git archive`）独立复跑**确认与本批无关（既有红，见 §4）。`npm run typecheck` **0 错**。
- 与任务书数字的差异（如实）：任务书称「16 个既有夹具失败」，本机全量实测为 **18 红 = 15 例本闸相关 + 3 例干净 HEAD 既有红**；本批修复的是前 15 例。

## 1. 新契约的确定性判定口径（据实现与实测核对）

- 声明路径的来源：显式 `paths` 优先；未给时取 preview 的「一行一个路径」声明行（`declaredWritePathsFromPreview` / `declaredWritePathOfLine`）。没有声明路径的 confirm 卡与 choice 卡 ⇒ 旧行为逐字不变。
- 每条声明路径须有**锚点行**：Markdown 标题（含路径）、代码围栏说明（含路径）或既有「一行一个路径」声明行。
- 锚点之后、下一条声明路径锚点之前，须至少有一行**非空、非纯装饰、非纯路径重复**的正文/代码行。
- 围栏内部不识别锚点；正文行若本身形如「一行一个路径」声明（例如 YAML 的 `path: src/x.ts` 单独成行）会被当作**另一条声明路径**——夹具正文因此统一避免出现可被解析为路径的行。

## 2. 改动点（逐文件；全部只改 preview 字符串与其一处注释，断言零改动）

| 文件（受影响用例数） | 原 preview 形状 | 现 preview 形状 |
|---|---|---|
| `test/测试/cli-genesis-boundary.test.ts:110`（1） | 两条路径行，无正文 | 每条路径后接 `# 角色：X` / `role: X` 等正文行 |
| `test/测试/duplicate-input-identity.test.ts:42`（3，pi/codex/claude） | 单条裸路径 `docs/X/fixture.md` | 路径行 + 夹具正文段 |
| `test/测试/t1-pipeline-integration.test.ts:59,62`（3，pi/codex/claude；每例两处） | 单条裸路径 `src/X/current.txt` | 路径行 + 确认正文段 |
| `test/测试/g4-skill-verify/c-preauth.test.ts:105`（1） | 单条裸路径 `docs/其他.md` | 路径行 + 确认正文段 |
| `test/测试/g4v2-mcp-verify/d-orchestration.test.ts:83`（1） | 单条裸路径 `docs/其他.md` | 路径行 + 确认正文段 |
| `test/测试/governance-e2e-auto/c-appointment-timing.test.ts:57`（1） | 两条路径行，正文只在最后一条之后 | 每条路径后各接一段正文 |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts:113`（1） | 同上 | 同上 |
| `test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts:222`（1） | 「将写入 …」单行，无正文 | 同一声明行 + 提案正文段 |
| `test/测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts:478`（1） | 两条路径行，无正文 | 每条路径后各接一段正文 |
| `test/测试/t9-block1-bootstrap.test.ts:397`（2：拒绝/不可用、确认通过） | `confirmPreview()` 三条路径行，无正文 | `confirmPreview()` 每条路径后各接一段正文（标题+正文成对） |

要点：

- 路径声明行**逐字保留**（「一行一个路径」仍是发行/判断 agent `paths` 的同一来源）；只在每条路径后补非空正文，不新增任何可被识别为路径的正文行。
- 断言逐条未动：`calls()` 次数、`receipts.ok` 序列、F4/零副作用、落盘字节、pin 独立重算、账本字段与顺序等全部保持原文。`git diff` 仅含上述 preview 字符串与各一处说明注释。

## 3. 复跑计数（本机 macOS arm64 / Node v24.14.0）

| 命令 | 修复前 | 修复后 |
|---|---|---|
| `node --test "test/测试/**/*.test.ts"` | **782 计 / 764 过 / 18 红 / 0 skip**（17.4s） | **782 计 / 779 过 / 3 红 / 0 skip**（17.8s） |
| 上述 10 个受影响文件定向复跑 | 45 计 / 30 过 / 15 红 | **45 计 / 45 过 / 0 红 / 0 skip** |
| `npm run typecheck` | — | **0 错**（exit 0） |

- 用例总数不变（782→782）：只改夹具数据，未增删用例。
- 3 红与修复前同集合（u1-renderer / g-desktop / t29），无新增红。

## 4. 三例「无关」红的干净基线结论（未改）

**方法**：`git archive HEAD`（HEAD=6d40eee，工作树他人未提交改动不进入）展开到 `/tmp/ans-head-clean`，符号链接本仓 `node_modules`，单独运行三个文件：**21 计 / 18 过 / 3 红**——与当前工作树完全相同的三红。

| 用例 | 失败点 | 归因（HEAD 既有提交，与本批无关） |
|---|---|---|
| `g2-verify/u1-renderer.test.ts:96` | 源码钉期望 `inj.label + (inj.sourceRoleId ? " · 来自 " + inj.sourceRoleId : "")`；现 renderer.js 为 `inj.label + (sourceName ? " · 来自 " + sourceName : "")` | `be3ab2c fix: 聊天与右侧标题使用治理角色显示名`（`git log -S'inj.sourceRoleId'`） |
| `g5-reasoning-verify/g-desktop.test.ts:65` | 源码钉期望 `choices.map(function (c) { … esc(String(c)) … })`；现 renderer.js 为 `choices.map(function (c, index) { … optionText … })` | `6d40eee fix: 推理强度恢复下拉并显示中文档位`（`git log -S'optionText'`） |
| `t29-pi-config-roundtrip.test.ts:273` | 期望错误文案列出 `off / low / medium / high / xhigh`；实测为「仅接受 关 / 低 / 中 / 高 / 极高」 | `6d40eee` 后推理强度档位改为中文标签（`app/desktop/runtime-config.ts:131` 的 `accepted.join(" / ")` 取注册表标签） |

**处置**：三例均未改（任务明确要求不为它们改无关断言）。它们属于**测试侧预期值落后于 HEAD 产品变更**，与本批 preview 完整性闸无因果关系，待另行按属主变更收口。

## 5. 未改的相邻夹具（如实登记，供后续判断）

- `governance-liaison-verify/e-audit.test.ts:170`：`preview: "角色卡/A/role-card.md"`（裸路径、无正文）。该用例经 `SessionManager → openRoleSession` 真实路径，按新闸其写盘确认卡会被拒绝；但其断言只覆盖到 `appointment` 决定与派发/验收，**不依赖** `appointment-write` 是否发生（未断言写盘确认的账本项与角色卡落盘），故修复前后均通过。未在本批失败清单内，**未改**；若后续需要它恢复对「写盘确认→写角色卡」的真实覆盖，需另按新契约补正文（会新增 `appointment-write` 账本项，需先核对账本断言）。
- `governance-judge-cards-verify/a-switch-matrix.test.ts:18`、`c-fallback.test.ts:46`、`fixture.ts:188`、`governance-e2e-auto/fixture.ts:806`（`cardFor`）：均为**桌面客户交互通道层**夹具（`makeChannel`），不经过 `run-role` 的呈现前闸；本批未失败，未改。
- `existing-project-compat-verify/c-invariants.test.ts:106` 等既有 preview 字面：不在真实确认通道路径上，未改。

## 6. 未验边界

1. 本批只跑 `test/测试/**`（任务口径）；全仓 `test/**` 与桌面 Electron e2e 未在该轮中重跑。
2. 剩余 3 红为既有测试侧预期落后，**未修**；本记录不宣称全仓全绿。
3. 新闸对「围栏内 `path: …` 行会不会被再解析成声明路径」的行为已在夹具设计中规避（正文不写路径样行），但该解析细节属产品实现，本角色未改其代码。
