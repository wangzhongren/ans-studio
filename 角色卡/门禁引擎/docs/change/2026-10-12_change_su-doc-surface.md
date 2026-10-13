---
id: change_su-doc-surface
type: change
title: su 自己的文档面写死 `docs/su/memo.md` / `docs/su/changelog.md` + `角色卡/` 红线（客户裁定「su 也要有自己的 memo」）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: su 内置卡文本（`BUILT_IN_ROLE_CARD_TEXT`）追加一段；判定逻辑一行未改
events:
  - date: "2026-10-12"
    kind: implemented
    summary: 卡文本在「文档面固定清单」段之后追加「内置角色自己的文档面」段——`docs/su/memo.md`（进行中事项/待确认项）+ `docs/su/changelog.md`（变更记录）、落盘经 request_confirmation；红线：不得在 `角色卡/` 下建 `su`（或任何非项目角色）目录，并给出两类告警的机制说明
  - date: "2026-10-12"
    kind: verified
    summary: 新用例 3 例全绿；门禁引擎套件 151 计/150 过/0 红/1 skipped；typecheck 0 错；全量测试复核中
---

# su 自己的文档面：`docs/su/memo.md` / `docs/su/changelog.md` + `角色卡/` 红线

**来源**：客户裁定原话「**su 也要有自己的 memo**」（内置治理角色要有工作备忘录，像项目角色一样持续维护）。
**真机踩坑（改动的直接动因，客户在界面上看到了告警）**：su 把 `memo.md` / `changelog.md` 写进了
`角色卡/su/`——`角色卡/` 下每个目录都会被角色枚举按角色 id 解析：

- `su` 与内置角色 id 冲突 ⇒ 判「角色重复」跳过并告警（`src/service/role/resolve-role.ts:164`
  `角色重复，已在其它角色目录优先采用，跳过`）；
- 该目录本身不是项目角色 ⇒ 另触发「缺少 role-card.md」告警（同文件 `:171`）。

**钉死的产品口径（本记录执行，不再改）**：su 自己的文档面固定为 `docs/su/memo.md`（工作备忘录：
进行中事项 / 待确认项，持续维护，不等客户问）与 `docs/su/changelog.md`（变更记录）——`docs/` 本就在
su 的治理边界内（治理种子/治理边界均有 `docs/` 目录条目），且**无角色语义**（不会被角色枚举解析）。
**红线**：不得在 `角色卡/` 下建 `su` 或任何**非项目角色**的目录。

## 改了什么（全部落在本角色 boundary.yaml Section 1 内）

- `src/common/门禁引擎/boundary-core.ts`：`BUILT_IN_ROLE_CARD_TEXT` 在「建/改每个项目角色时，边界须
  一并授予该角色的文档面」段**之后**追加一段（同风格），要点：
  1. 内置治理角色自己**没有角色目录**；工作文档固定写在 `docs/su/memo.md`（工作备忘录：进行中事项 /
     待确认项——有进展或新挂起就更新，不等客户问）与 `docs/su/changelog.md`（变更记录）；落盘前照常经
     `request_confirmation` 客户确认；
  2. **红线**：不要在 `角色卡/` 下建 `su`（或任何非项目角色）目录——该目录下每个目录都会被角色枚举
     按角色 id 解析（`su` 与内置角色 id 冲突 → 判「角色重复」跳过并告警；非角色目录 → 触发
     「缺少 role-card.md」告警）。
  同时更新该常量头注（照既有惯例登记本段来源与真机踩坑）。
- `test/门禁引擎/su-doc-surface-convention.test.ts`（新，3 例）：文档面路径逐项断言（含「进行中事项」
  「待确认项」「有进展或新挂起就更新」「不等客户问」「request_confirmation」）；红线原文与两类告警
  机制断言；**反向断言**——涉及「`角色卡/` × su」的小句必须是否定/禁止式，且不得出现肯定式
  「在 `角色卡/` 下建 `su`」指令（「不要」替换为「不」后再测，避免红线句自身被误抓；与
  `temp-staging-convention.test.ts` 同法）。
- 本文件；`changelog.md` / `memo.md` 另行登记。

**未动**：`src/service/role/resolve-role.ts`（本次只动卡片文案，枚举行为本身不改——任务明言）；
一切判定逻辑（`resolve-write.ts` 等一行未改）；`app/**`、`src/pipeline/**`、`src/provider/**`（他角色
在飞）；种子条目（`governance-seed.ts` 未动——种子仍恰为三处治理产物）。

## 旧叙述核查（任务点名：如实指出，由协调方裁定，未顺手大改）

卡文本**末段**仍写：「边界：内置治理边界（skill 根）。本版 fail-closed——acceptance 未接受，故治理
会话的一切写入都会被门禁在写之前拒绝（契约 §0：v1 治理会话不允许写盘）。」

**核查结果：该句与现状明显冲突（过时旧叙述），建议由协调方裁定改写；本任务未动它。** 依据：

1. **创世分支已落地**（T31，2026-10-11，本角色 changelog/memo 有记）：空项目 + `ProjectConfig.genesisBootstrap`
   显式设置时，`resolveBoundarySection` 返回**项目根治理种子边界**（普通目录 `角色卡/`、`docs/`、`.ans/`，
   `acceptance = 操作者指令`）——su 的治理产物写入**命中即放行**，「一切写入被拒」不再成立；
2. **已 bootstrap 项目**（治理边界文档写出并 pin 接受）后项目覆盖分支接管，su 按其边界工作；
3. 本次新增段落本身就建立在「su 落盘经 `request_confirmation` 确认」之上——与末段「v1 治理会话不允许
   写盘」直接对立。**残留有效的情形**只有「无创世、无项目治理边界」时回退的内置边界（`accepted:false`
   ⇒ 拒一切写）——末段把该特殊情形的描述写成了普遍结论。
4. 另注：`docs/su/` 是**项目根**下的相对路径（相对被治理项目），其可写性来自治理种子/治理边界里的
   `docs/` 目录条目；卡文本按 su 视角写作 `docs/su/…`，与既有的 `角色卡/<角色 id>/…` 写法同构。

## 证据（真实运行）

- `node --test "test/门禁引擎/**/*.test.ts"`（带引号）→ **151 计 / 150 过 / 0 红 / 1 skipped**
  （skipped 为 Windows 专用用例；较前 148 + 本次 3）。
- `npm run typecheck` → **0 错**。
- 全量 `node --test "test/**/*.test.ts"`（带引号）→ **906 计 / 903 过 / 2 红 / 1 skipped**——**2 红恰为
  基线红**（`test/桌面应用/pi-config.test.ts` 检出目录名、`test/项目管理/shared/path-primitives.test.ts`
  macOS `/var` 符号链接），**无新红**。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `6291ab1`
  （工作区含他角色未提交改动）。

## 边界声明

只写本角色 Section 1 内文件：`src/common/门禁引擎/boundary-core.ts`、`test/门禁引擎/su-doc-surface-convention.test.ts`、
`角色卡/门禁引擎/docs/change/`（本文件）、`角色卡/门禁引擎/changelog.md`、`角色卡/门禁引擎/memo.md`。
**未碰** `src/service/role/resolve-role.ts`、`app/**`、`src/pipeline/**`、`src/provider/**`、他角色
tests/docs；未在 `角色卡/` 下新建任何目录（本仓库 `角色卡/` 下无 `su` 目录，已核）。
