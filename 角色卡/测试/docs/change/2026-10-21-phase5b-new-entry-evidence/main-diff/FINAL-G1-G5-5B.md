# Phase 5B 最终 G1–G5 台账（以 5A 快照为旧端参照）

**候选**：HEAD `224cf83`；HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`；入口 `app/renderer/dist/index.html`；clean rebuild 哈希逐字节一致。

## 一、5A 快照与 5B 新入口对照

- 5A 新入口 main 报告：397 名；5B 新入口 main 报告：397 名；**common 397 / only-old 0 / only-new 0**。
- 值差异 20：`OUTDIR`、`RENDERER_ENTRY`、17 × `SHOT_*`、`PENDING_DIAG`（仅诊断/路径/实例值）；**所有行为/契约 check 名与值逐名一致**，无 MATCH-FAIL。
- 5A 旧端快照 main 391 名，仅 C 类 `RECOVERY_SAME_PENDING_CARD_ONCE`；旧端已不可复跑，只作冻结参照。
- 5A 旧证据快照：`2026-10-21-phase5a-old-baseline-evidence/snapshot-manifest.sha256`（`shasum -c` 0）、`manifest-old-entry-before/after.sha256`（diff 空）；5B 未修改旧证据。

## 二、G1–G5 / NEW / OLD（沿用 5A 定稿）

| 组 | 名称/裁决 | 5B 状态 |
| --- | --- | --- |
| G1（19） | 环境/实例归一化（OUTDIR/RENDERER_ENTRY/SHOT_*） | 已批准；5B 仅实例路径差异 |
| G2（12） | 已批准 UI/设计差异（STATUS_BADGE_TEXT/PI 键集/SYS_ROWS/U1_* 等） | 已批准；5B 值一致 |
| G3（26） | 旧载体/调试字段 + 精确新检查名（OP_*/RESTORE_*/RIGHT_QUEUE_*/BADGE_*/诊断计数等；含补正 `OPEN_CARD_AT_ARRIVAL` 旧 207→新 206，索引归一化，PM §19.3，`OPEN_CARD_STABLE_AT_ANCHOR=true`） | 已按 5A 定稿 + 2026-10-21 补正；5B 新检查值一致 |
| G4（21） | 逐项关闭/批准/重锚（SWITCH×3、ROLE_STATE×2、INJECTED、BOOTSTRAP×3、P1×7、DENIED/HAS、REPLAY） | 全部关闭/批准；5B 无新 red |
| G4-RESOLVED | `RECOVERY_SAME_PENDING_CARD_ONCE` false→true | closed |
| G5 | `E2E_FAILURES` 空、`E2E_PASS=true` | 批准派生行 |
| NEW-ONLY 7 | P13_* | 已批准，替代旧 P13_NEW_SEMANTICS |
| OLD-ONLY 1 | `P13_NEW_SEMANTICS` | 已批准退役 |

- 5A 定稿精确组名单：[2026-10-21-phase5a-ledger-regroup-final.md](../../2026-10-21_change_phase5a-ledger-regroup-final.md) 与 5A final3 `FINAL-G1-G5.md`。
- **2026-10-21 验收补正**：5A final3 的 `OPEN_CARD_AT_ARRIVAL` 旧 207→新 206 已补列 G3（PM §19.3 索引归一化；行为检查 `OPEN_CARD_STABLE_AT_ANCHOR=true`）；post-fix3 JSON/MD 台账已同步修正（原 MATCH 207/207 → G3 旧 207/新 206）。补正后 final3 的 75 条值差异全部登记，G3 为 26 行。
- **旧端 uiux 套件版本限制**：5A 旧端 uiux 快照套件 `d568bf82…`（18:04–18:05），最终套件 `fa3f74d4…`（20:44）；旧端 main 已用最终套件复跑（391 名），旧端 uiux 未复跑且旧端已删、不可补跑。旧端 uiux 通过名 424 个在新端全部存在且仍为 true（0 个旧通过→新失败）；不得声称「同套件源码」，只能记为「旧套件版本限制 + 已证实质等价」。
- **无未批准行，MATCH-FAIL=0。**
- 5A 记录的 `BOOTSTRAP_S0_*` 命名说明保留：main 仍无六个官方名，行为由 5A smoke 36/36 的 S0 3 项 + 独立 S0 9/9 覆盖；若 PM 未接受等价，则列为 5B 前命名补项，不改变行为结论。

## 三、旧端不可复跑声明

5B 已删除旧渲染器/vendor/旧守卫测试，旧端**不再复跑**；旧端结论只引用 5A 冻结快照（391 名、C 类 `RECOVERY_SAME_PENDING_CARD_ONCE=false`）。任何 5B 报告不得把新端结果标为旧端。

## 四、5A 快照完整性

`2026-10-21-phase5a-old-baseline-evidence/snapshot-manifest.sha256` 本轮复算 `shasum -c` exit 0；旧入口/套件稳定 manifest 前后 diff 空；旧端证据未修改。
