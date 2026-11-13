# 全量桌面应用新增失败名复现判定（B6 第二段）

- 日期：2026-11-13
- 触发：全量桌面应用（`segment2/full-desktop-app.log`）出现 1 个不在 B0 冻结基线
  （`12b-baseline-desktop-app-failnames.txt`，72 名）中的失败名：

  `申请直达：来源角色=rapporteur，卡片不镜像，裁决回来源；request.* 事件写 tasks.jsonl`

- 失败详情（全量日志末尾 failing-tests 段，`full-desktop-app.log` 第 1033 行起）：

  ```
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [ + 'presented', 'created', - 'presented', 'resolved' ]
  actual:   [ 'presented', 'created', 'resolved' ]
  expected: [ 'created', 'presented', 'resolved' ]
  at TestContext.<anonymous> (test/桌面应用/application-line.test.ts:103:12)
  ```

  即 tasks.jsonl 中 `request.notified` 的 created/presented 记录顺序竞态；断言要求 created 在
  presented 之前，偶发 presented 先落账。

## 隔离复现（同命令 `node --test --test-timeout=120000 --test-reporter=spec test/桌面应用/application-line.test.ts`）

| 工作树 | 轮次 | 失败轮 | 失败率 |
| --- | --- | --- | --- |
| B6 本工作树（含未提交第一段改动，b5901ac + B6） | 5 | run1、run3 | 2/5 |
| **干净 b5901ac 对照工作树**（`.tmp-b6-seg2/baseline-wt`，`git worktree add --detach b5901ac`，junction node_modules） | 5 | run1、run3、run5 | **3/5** |

- 干净 b5901ac 的失败断言与实际值逐字相同（`actual: ['presented','created','resolved']`，
  `application-line.test.ts:103`），见 `baseline-application-line-run1.log` / `run5.log`。
- 结论：**既有顺序竞态 flake，非 B6 引入**。B0 全量基线（c234e79）与 B5 全量（9970c3d）均未命中该
  flake，故不在其冻结失败名集合内；本批仅如实披露，未改测试、未放宽断言。
- 原始日志：`segment2/repro/b6-application-line-run{1..5}.log`、
  `segment2/repro/baseline-application-line-run{1..5}.log`。
- 基线对照工作树与 junction 已移除（见记录 §10.5 终检）。
