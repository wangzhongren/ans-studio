# 缺陷记录：bootstrap 快照单槽位与冻结闭包要求互相矛盾（2026-11-10）

- 日期：2026-11-10
- 记录角色：ANS 沟通（Communication）
- 来源：贪吃蛇全链真机运行 RR19（修正参数后的真实 VCA 提交）。

## 症状（真实运行观测）

- product 以 `version-upgrade` / `baseTrunk:null`（bootstrap）提交 `submit_version_change`：
  7 个 targets、`action:"add"`、`expectedFromSha256:null`（按应用 schema 修正后）。
- 应用生成完整快照 `s-9fbf9c81…`（63,937 B / digest `fa807db6…`），`files` **仅 6 个**：proposal v2、architecture v2、roster v2、modules v1、intent v1、versions.jsonl。
- 应用随即拒绝：
  `{"errorCode":"vca-target-invalid","message":"Target bytes absent from complete snapshot"}`（19:42:35.313Z）。
- 记录：`角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`（`a4a90ebe…`）+ 证据 145 文件（快照清单 `vca-snapshot-files.json`）。

## 根因（真实产物 + 代码路径）

两条应用规则在**单次 direct bootstrap VCA** 中不可同时满足：

1. **快照单槽位**：direct VCA 的完整快照按**文档种类**单槽位生成——每 kind 只收当前版本（proposal/architecture/roster/modules/intent/versions 各一），历史 v1 文件不会被纳入。
2. **冻结闭包**：`git-policy-app-freeze-closure`（`classify-shell.ts:729` 路径）要求候选快照覆盖 `versions.jsonl` 全部冻结记录所指文件（含历史 proposal v1 / architecture v1 / roster v1）。
3. ⇒ 任何**首次 trunk bootstrap 且项目存在历史冻结版本**的场景，都会在 `vca-target-invalid / Target bytes absent from complete snapshot` 处必然失败。RR14（闭包缺失）与 RR19（快照单槽位）是同一矛盾的两面。

## 影响

- 带历史冻结文档的项目无法通过受支持路径完成首次 trunk 建立；贪吃蛇全链在校验层被阻断（非角色行为、非驱动问题）。
- RR 链路暂停，等产品修复后才可继续。

## 处置

- 本记录立案；**RR 链暂停**，不在无修复情况下盲目重跑。
- 修复候选（策划判型：fix/change，建议 T2）：
  a) bootstrap 快照按 target 收集**全部版本**文件（含历史 v1），使冻结闭包可满足；
  b) 冻结闭包对**非当前版本**按 effective snapshot/冻结记录豁免，而不是要求候选快照全部携带；
  c) 提供受支持的历史冻结版本携带方式（schema/action 明确）。
- 约束：不弱化冻结/版本保护语义；不放宽未知/漂移/不可读的 fail-closed；修复后须以真实运行复现「bootstrap → effective trunk → 工作流 → 团队计划 → 任命 → 实现」链路。
