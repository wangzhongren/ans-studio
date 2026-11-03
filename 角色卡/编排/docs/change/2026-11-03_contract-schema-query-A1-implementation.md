---
id: contract-schema-query-a1-implementation
type: change
title: A1 实施记录：contract_check schema topic——编排文本/示例/逐字段错误
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related: [contract-schema-query]
events:
  - date: "2026-11-03"
    kind: implemented
    summary: 实现 contractSchemaText/三示例/逐字段错误/topology 文案；A3 后追加 AC-11 卡断言；两个编排测试 34/34 绿、typecheck exit 0；未 commit/push
---

# A1 实施记录：`contract_check` schema topic——编排文本、示例与逐字段错误

- 角色：编排（Orchestration）。任务：`2026-11-03-contract-schema-query`，节点 **A1**。
- 状态：**implemented-unverified**（本节点实现与自测完成；D1/E1/E2 与 A3 后的卡断言不在本节点，未 commit/push）。
- 依据：P1.3（911 行 / `4d61d376…`）、V1（725 行 / `11001844…`）、团队计划（539 行 / `a93bd02f…`）、PM P1 审核（293 行 / `d547b90d…`，`recommend approval`）、A0a 冻结（`runtime.ts` 2734 行 / `05d6e4e9…`）。
- 基线：worktree `flow-improvements-wave1`；HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`；写前 `git status --porcelain -- src app test` 仅 A0a `src/model/runtime.ts` 的既有改动（A0a 已完成）。

## 一、改动文件（写集内）

| 文件 | 写前 blob / SHA-256（行） | 写后 blob / SHA-256（行） |
| --- | --- | --- |
| `src/common/编排/workflow-preconditions.ts` | `83a6c7ebfc5b3fe9094f3a67df5704bfdfd05be5` / `9dfb55638324b6657fd7dc3928e7c7430215848dd9ee6c7d78a21de86ba1249f`（1337） | `74a60e37ce8931ca282d4fc38e9099cd88642400` / `5fa99f57c2423531bc28784e3561313953f2f134bb6ffa3f6574380ed23fb727`（1531） |
| `test/编排/workflow-preconditions.test.ts` | `e1a7683eebc9f4f35d318921dd1d1a6725c0e14f` / `bec8c36109dc4cb1ad823f2dd363ff8aa8aae9e96276287733b5989c8cef066b`（972） | `f1b2d26cce30a72eed6be558ae95063d002c6913` / `9d083a156d0d645b133e299c2fc9f473d2cc36de1bb27d180f9cc1bf6f98e9ad`（1305） |
| `test/编排/trio-worker-report.test.ts`（A3 后 AC-11 卡断言） | `22cb327258a883520b4adb2f6282d7a7231de2a1` / `77cba61b2d144d7d51bf34c3cf696dc1594f2954f5691c9064760a26b0e4f83a`（257） | `d2bc956507def345fcff71985b76165c77879af7` / `7ab180eb49c4c94b9dd0a47360c21ec298dee12a71bf34461ea9fd8cd5ab4d2c`（261） |

`test/编排/trio-worker-report.test.ts` 仅在既有策划卡断言旁增加四条 AC-11 断言；A3 卡文本（617 行 / `e1639969…`，`RAPPORTEUR_CARD_TEXT` 4612 B / 27 行，两行在 `:184-185`）未改。

## 二、实现内容

- 新增 `import type { ContractSchemaTopic } from "../../model/runtime.ts"`；导出 `contractSchemaText(topic)` 与三示例常量；三块文本常量由行数组构造，schema 版本全部用 `PROJECT_MODULES_SCHEMA`/`PROJECT_ROSTER_SCHEMA`/`PROJECT_TOPOLOGY_SCHEMA` 插值；roster 示例直接插值 topology 示例；文本含字段表、加载校验与三条警告。纯函数、零磁盘读/零写盘。
- 新增内部 `describeContractValue`：`未提供`/`null`/`string（空）`/`string`/`boolean: true|false`/`number: <v>`/`array(N)`/`object（mapping）`。
- roster 与 modules 文档两处四字段改为按 `name → purpose → publicContract → architectureSource` 顺序逐字段检查，命中第一个非法字段即返回；`purpose` 使用有效来源（字符串含空串不回退），错误显示优先 raw `purpose`、缺省/`null` 时显示 raw `responsibility`；错误码保持 `roster-module-fields-missing` / `modules-doc-fields`。
- topology schema/management 文案统一为顶层扁平数组；缺 convener 文案显示 raw `management`（mapping → `object（mapping）`、数组 → `array(N)`、空串 → `string（空）`）；缺角色文案追加「扁平字符串数组」说明；宽容读取（单字符串、过滤非字符串项、多余 id）不变。

## 三、自测证据

- `node --test --test-concurrency=1 test/编排/trio-worker-report.test.ts test/编排/workflow-preconditions.test.ts`：**34 tests / 34 pass / 0 fail / 0 skipped / 0 todo**（约 477 ms；workflow-preconditions 28 + trio-worker-report 6）。
- `npm run typecheck`：**exit 0**，无诊断。
- 文本字节实测（UTF-8，无尾随换行）：`modules` **2438 B**、`roster` **3763 B**、`topology` **1265 B**；示例 `282 / 850 / 171 B`；三块文本与 P1.3 §3.5 逐字一致；roster ≤3900、三块 ≤4096。
- 示例 parser：`parseProjectModules(PROJECT_MODULES_SCHEMA_EXAMPLE,"demo")` 与 `parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE,"demo")` 均 `ok:true`，两示例 `modules[]` `deepEqual`；roster 示例包含 topology 示例；每 topic schema 常量恰 3 行。
- `git status --porcelain -- src app test` 当前含本任务候选：`src/model/runtime.ts`（A0a）、`src/provider/runtime/{tools,schema}.ts`（A0b）、`src/common/门禁引擎/governance-roles.ts`（A3）、`app/desktop/session.ts`（A2）、本节点 3 文件；无写集外改动。

## 四、PM P1-CSQ 落点

| 编号 | 落点 |
| --- | --- |
| P1-CSQ-03 | 三块文本全文无字面 `taskKind`；第二行固定为「（仅 schema 与示例；不含 run/写区；其余参数被忽略）」，无 `flowId`/`moduleId`；`<flowId>` 占位与 `flowId:` 字段名保留。测试 `AC-3+P1-CSQ-03` 断言；提案 §1 已按 PM 更正。 |
| P1-CSQ-04 | `AC-15` 正例 roster 文档用 `PROJECT_ROSTER_SCHEMA_EXAMPLE`、modules 文档用 `PROJECT_MODULES_SCHEMA_EXAMPLE`；未把完整 schema 文本当 roster 文件；提案 §4 已按 PM 澄清。 |
| P1-CSQ-05 | `AC-10` 断言 mapping/缺角色错误码均为 `roster-topology-mismatch`；`management` 多余 id 与非字符串项按既有宽容读取通过（不新增拒绝）。 |
| P1-CSQ-06 | `management: ""` 经 `describeContractValue` 显示 `string（空）`；测试 `AC-10+P1-CSQ-05/06` 断言。 |
| AC-11 | A3 卡文本落地后，在 `trio-worker-report.test.ts` 既有策划卡断言旁追加 `/contract_check/`、`/topic:"modules"/`、`/publicContract.*非空字符串/`、`/management.*扁平数组/` 四条；未改卡文本。 |

## 五、偏差与未做

- 无实现偏差；文本字节与 P1.3 草案完全一致。
- AC-11 卡断言已按 A3 落地文本追加（四条）；未改 A3 卡文本。
- 未 commit/push；未运行桌面/门禁测试与 T3 全量（D1 负责）；未运行应用/Electron。
