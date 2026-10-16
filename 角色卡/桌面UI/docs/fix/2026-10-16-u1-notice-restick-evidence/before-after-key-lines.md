# U1 提示条补滚——修复前后 e2e 关键行（桌面窗口 main.mjs，本侧只读运行）

运行命令（两轮相同；OUTDIR 复用，after 报告存本目录 `e2e-report-after.txt`）：

```
ANS_E2E_OUTDIR=/private/tmp/ans-ui-u1-e2e node_modules/.bin/electron test/桌面应用/e2e/main.mjs
```

## before（16:40 基线轮；与桌面窗口报告一致）

```
S1_STICK_AT_BOTTOM_DIST=0
S1_STICK_AT_BOTTOM=true
S1_STICK_AGAIN_DIST=0
S1_STICK_AGAIN=true
U1_WINDOWED_TO_BOTTOM_DIST=18
U1_PANE_HEIGHT=12683
U1_WINDOWED_TO_BOTTOM=false
U1_NORMAL_TO_BOTTOM_DIST=0
U1_NORMAL_TO_BOTTOM=true
U1_REPEAT_TO_BOTTOM_DIST=0
U1_REPEAT_TO_BOTTOM=true
E2E_DONE=1
```

基线轮全报告内 `=false` 行只有 3 处：L55 探针行（`OLD_GENERAL_CLAIM_PRESENT=false`，期望即 false）、
L132 `BOOTSTRAP_HAS_ROLES=false`（空临时项目的未-bootstrap **观测**值）、L281 `U1_WINDOWED_TO_BOTTOM=false`
（**唯一的布尔断言红**）。修复轮 `=false` 仅剩 L55/L132 两处观测/探针值，U1 转 true；两轮其余含
`false` 的行均为观测 JSON（如 `P1_ARRIVAL_DEBUG.chipHidden` 一类，语义相同）。

## after（修复轮，完整报告 = e2e-report-after.txt:279-285）

```
U1_WINDOWED_TO_BOTTOM_DIST=0
U1_PANE_HEIGHT=12683
U1_WINDOWED_TO_BOTTOM=true
U1_NORMAL_TO_BOTTOM_DIST=0
U1_NORMAL_TO_BOTTOM=true
U1_REPEAT_TO_BOTTOM_DIST=0
U1_REPEAT_TO_BOTTOM=true
E2E_DONE=1
```

修复轮无 `FAIL/ERROR` 行；布/观 `=false` 行与基线轮同集合；S-1 四组粘性断言
（S1_STICK_AT_BOTTOM / S1_STICK_AGAIN / S1_SMALL_PANE_STICK / S1_NOT_YANKED /
S1_STAYED_AWAY_FROM_BOTTOM）全 true 不变。U1_PANE_HEIGHT 两轮同为 12683（内容不动，纯落点变化）。

## 说明

before 轮完整 report.txt 未留存（同 OUTDIR 被 after 轮覆写）；before 关键行为本轮会话内
逐字记录，且与桌面窗口侧报告（U1_WINDOWED_TO_BOTTOM 确定性 false、dist=18px）互证。
before 的权威口径以桌面窗口的记录为准。
